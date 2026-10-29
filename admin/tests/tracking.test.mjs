import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,jwk,TEAM,orderBody} from './support.mjs';
import publicWorker from '../src/public-worker.mjs';
import {trackingHash} from '../src/tracking.mjs';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const previousFetch=globalThis.fetch;
before(()=>{globalThis.fetch=async url=>{
 if(String(url)===`https://${TEAM}/cdn-cgi/access/certs`)return Response.json({keys:[jwk]});
 if(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:true,hostname:'sifiabdessamad09-collab.github.io',action:'freshsouk-order'});
 throw new Error('Unexpected external request in test');
};});
after(()=>{globalThis.fetch=previousFetch;});
async function setup(){
 const f=await fixture();f.env.ORDER_TRACKING_ENABLED='true';f.env.ORDER_LIMITER={limit:async()=>({success:true})};
 const order=await(await f.request('/api/admin/orders',{body:{...orderBody,note:'SECRET PRIVATE NOTE'},headers:{'Idempotency-Key':crypto.randomUUID()}})).json();f.id=order.order.id;
 f.path='/api/admin/orders/'+f.id+'/tracking';
 f.generate=version=>f.request(f.path,{body:{version}});
 f.track=(token,options={})=>publicWorker.fetch(new Request('https://shop.invalid/api/track/'+token,options),f.env);
 return f;
}
test('32-byte random capabilities are returned once and stored as raw-token SHA-256 only',async()=>{
 const f=await setup();try{
  const a=await(await f.generate(0)).json();assert.match(a.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(Buffer.from(a.token,'base64url').length,32);
  const row=f.db.prepare('SELECT * FROM order_tracking').get();assert.equal(row.token_hash,await trackingHash(a.token));assert(!JSON.stringify(row).includes(a.token));assert.equal(row.order_id,f.id);
  assert.equal(Date.parse(a.expiresAt)>Date.now()+29*86400000,true);
  const meta=await(await f.request(f.path)).json();assert.deepEqual(Object.keys(meta).sort(),['active','expiresAt','version']);assert.equal(meta.active,true);
  const b=await(await f.generate(a.version)).json();assert.notEqual(a.token,b.token);
  assert.equal((await f.track(a.token)).status,404);assert.equal((await f.track(b.token)).status,200);
  const stale=await f.generate(a.version);assert.equal(stale.status,409);assert.equal((await f.track(b.token)).status,200);
 }finally{f.db.close();}
});
test('revoked, expired, missing and malformed tokens have the same generic no-store error',async()=>{
 const f=await setup();try{
  const link=await(await f.generate(0)).json();
  const invalid=await f.track('x'.repeat(43));const error=await invalid.json();assert.equal(invalid.status,404);
  for(const token of ['short','a'.repeat(44),'%3Cscript%3E','a'.repeat(43)+'/extra'])assert.equal((await f.track(token)).status,404);
  f.db.exec("UPDATE order_tracking SET expires_at='2020-01-01T00:00:00.000Z'");assert.deepEqual(await(await f.track(link.token)).json(),error);
  const next=await(await f.generate(link.version)).json();
  const revoke=await f.request(f.path,{method:'DELETE',body:{version:next.version}});assert.equal(revoke.status,200);
  assert.equal(f.db.prepare('SELECT token_hash FROM order_tracking').get().token_hash,null);
  assert.deepEqual(await(await f.track(next.token)).json(),error);
  const meta=await(await f.request(f.path)).json();assert.equal(meta.active,false);
  const regenerated=await(await f.generate(meta.version)).json();assert.equal((await f.track(regenerated.token)).status,200);
  assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,1);
 }finally{f.db.close();}
});
test('public projection follows status changes and cancellation with no private audit/customer fields',async()=>{
 const f=await setup();try{
  const {token}=await(await f.generate(0)).json();
  let orderVersion=1;
  for(const status of ['confirmed','preparing','out_for_delivery','cancelled']){
   assert.equal((await f.request('/api/admin/orders/'+f.id+'/status',{method:'PATCH',body:{status,version:orderVersion++}})).status,200);
   const response=await f.track(token,{headers:{Origin:f.env.ALLOWED_ORIGIN}});const data=await response.json();assert.equal(response.status,200);assert.equal(data.status,status);
   assert.deepEqual(Object.keys(data).sort(),['createdAt','history','reference','status','updatedAt']);
   assert.equal(data.reference,f.id.slice(0,8).toUpperCase());assert.equal(data.history.at(-1).status,status);
   for(const event of data.history)assert.deepEqual(Object.keys(event).sort(),['at','status']);
   for(const secret of [orderBody.customer.name,orderBody.customer.phone,orderBody.customer.address,'SECRET PRIVATE NOTE','admin@freshsouk.invalid',f.id,'actor','details','total_cents','token_hash'])assert(!JSON.stringify(data).includes(secret));
   assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('cdn-cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  }
 }finally{f.db.close();}
});
test('tracking enforces CORS, read-only methods, rate limits and private admin authentication',async()=>{
 const f=await setup();try{
  const {token}=await(await f.generate(0)).json();
  const response=await f.track(token,{headers:{Origin:f.env.ALLOWED_ORIGIN}});assert.equal(response.headers.get('access-control-allow-origin'),f.env.ALLOWED_ORIGIN);assert.equal(response.headers.get('access-control-allow-credentials'),null);assert.equal(response.headers.get('vary'),'Origin');
  assert.equal((await f.track(token,{headers:{Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await f.track(token,{method:'POST'})).status,405);
  const preflight=await f.track(token,{method:'OPTIONS',headers:{Origin:f.env.ALLOWED_ORIGIN}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-methods'),'GET, OPTIONS');
  f.env.ORDER_LIMITER={limit:async({key})=>{assert(key.startsWith('track:'));return {success:false};}};assert.equal((await f.track(token)).status,429);
  for(const method of ['GET','POST','DELETE'])assert.equal((await f.request(f.path,{auth:false,method,...(method==='GET'?{}:{body:{version:1}})})).status,401);
  assert.equal((await publicWorker.fetch(new Request('https://shop.invalid'+f.path,{method:'POST'}),f.env)).status,404);
  const forged=await f.request(f.path,{method:'POST',body:{version:1},headers:{Origin:'https://evil.invalid'}});assert.equal(forged.status,403);
 }finally{f.db.close();}
});
test('concurrent regeneration and stale revocation never leave multiple active links',async()=>{
 const f=await setup();try{
  const responses=await Promise.all([f.generate(0),f.generate(0)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const winner=await responses.find(r=>r.status===200).json();assert.equal(f.db.prepare('SELECT count(*) n FROM order_tracking').get().n,1);
  assert.equal((await f.request(f.path,{method:'DELETE',body:{version:0}})).status,409);assert.equal((await f.track(winner.token)).status,200);
  const unknown=await f.request('/api/admin/orders/'+crypto.randomUUID()+'/tracking',{body:{version:0}});assert.equal(unknown.status,404);
 }finally{f.db.close();}
});
test('feature stays off on old databases and original order APIs remain compatible',async()=>{
 const f=await setup();try{
  delete f.env.ORDER_TRACKING_ENABLED;f.db.exec('DROP TABLE order_tracking');
  assert.equal((await f.request('/api/admin/orders/'+f.id)).status,200);assert.equal((await f.request(f.path)).status,404);assert.equal((await f.generate(0)).status,404);assert.equal((await f.track('x'.repeat(43))).status,404);
  const session=await(await f.request('/api/admin/session')).json();assert.equal(session.trackingEnabled,false);
 }finally{f.db.close();}
});

test('tracking page refreshes safely, renders cancellation and hides stale data after revocation',async()=>{
 const source=await readFile(new URL('../../track.js',import.meta.url),'utf8');
 const elements=new Map(),events={};let interval,requests=0;
 function node(){return {hidden:false,disabled:false,textContent:'',children:[],append(n){this.children.push(n);},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;}};}
 const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node,addEventListener(k,fn){events[k]=fn;}};
 let data={reference:'AB12CD34',status:'pending',createdAt:'2026-10-29T10:00:00.000Z',updatedAt:'2026-10-29T10:00:00.000Z',history:[{status:'pending',at:'2026-10-29T10:00:00.000Z'}]},code=200;
 const context={document,location:{hash:'#'+'a'.repeat(43)},window:{addEventListener(k,fn){events[k]=fn;}},AbortController,Intl,Date,encodeURIComponent,
  setTimeout:()=>1,clearTimeout(){},setInterval(fn,ms){assert.equal(ms,30000);interval=fn;},
  fetch:async(url,options)=>{requests++;assert.equal(url,'https://freshsouk-shop-api.freshsouk.workers.dev/api/track/'+'a'.repeat(43));assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');return Response.json(data,{status:code});}};
 vm.createContext(context);vm.runInContext(source,context);await new Promise(setImmediate);
 assert.equal(document.getElementById('reference').textContent,'#AB12CD34');assert.equal(document.getElementById('order').hidden,false);assert.equal(document.getElementById('steps').children.length,5);
 data={...data,status:'cancelled'};interval();await new Promise(setImmediate);assert.equal(document.getElementById('cancelled').hidden,false);assert.equal(document.getElementById('steps').hidden,true);
 code=404;interval();await new Promise(setImmediate);assert.equal(document.getElementById('order').hidden,true);assert.match(document.getElementById('feedback').textContent,/expiré ou révoqué/);
 const count=requests;document.hidden=true;interval();assert.equal(requests,count);
 context.location.hash='#invalid';document.hidden=false;events.hashchange();await new Promise(setImmediate);assert.equal(requests,count);assert.match(document.getElementById('feedback').textContent,/lien de suivi complet/);
});
