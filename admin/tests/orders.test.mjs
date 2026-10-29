import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,jwk,TEAM,orderBody,productBody} from './support.mjs';
import {dayStart} from '../src/orders.mjs';
const originalFetch=globalThis.fetch;
before(()=>{globalThis.fetch=async url=>{assert.equal(String(url),`https://${TEAM}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});};});
after(()=>{globalThis.fetch=originalFetch;});
const create=(f,body=orderBody,key=crypto.randomUUID())=>f.request('/api/admin/orders',{body,headers:{'Idempotency-Key':key}});
const product=f=>f.db.prepare("SELECT * FROM products WHERE id='tomates'").get();
async function track(f,amount){const p=productBody(product(f));Object.assign(p,{trackStock:true,stockMilli:amount});assert.equal((await f.request('/api/admin/products/tomates',{method:'PATCH',body:p})).status,200);}

test('server prices, half-kilos, delivery threshold and private receipts',async()=>{
  const f=await fixture();let response=await create(f,{...orderBody,items:[{productId:'carottes',quantity:.5}]});let data=await response.json();assert.equal(response.status,201);assert.equal(data.order.totalCents,2325);
  response=await create(f,{...orderBody,items:[{productId:'tomates',quantity:25}]});data=await response.json();assert.equal(data.order.totalCents,20000);
  const detail=await(await f.request('/api/admin/orders/'+data.order.id)).json();assert.equal(detail.order.delivery_cents,0);assert.equal(detail.items[0].unit_price_cents,800);
  for(const quantity of [.25,0,-1,101])assert.equal((await create(f,{...orderBody,items:[{productId:'tomates',quantity}]})).status,400);
  assert.equal((await create(f,{...orderBody,items:[{productId:'tomates',quantity:1},{productId:'tomates',quantity:1}]})).status,400);f.db.close();
});
test('idempotent retries and concurrent duplicate submissions reserve once',async()=>{
  const f=await fixture();await track(f,5000);const key=crypto.randomUUID();
  const responses=await Promise.all([create(f,orderBody,key),create(f,orderBody,key)]);const data=await Promise.all(responses.map(r=>r.json()));assert.equal(data[0].order.id,data[1].order.id);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM orders').get().n,1);assert.equal(product(f).stock_milli,3000);
  assert.equal((await create(f,{...orderBody,note:'different'},key)).status,409);assert.equal(product(f).stock_milli,3000);f.db.close();
});
test('concurrent stock reservations cannot oversell and a failed batch rolls back entirely',async()=>{
  const f=await fixture();await track(f,3000);
  const responses=await Promise.all([create(f),create(f)]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  assert.equal(product(f).stock_milli,1000);assert.equal(f.db.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  const count=f.db.prepare('SELECT count(*) AS n FROM audit_log').get().n;
  const bad=await create(f,{...orderBody,items:[{productId:'carottes',quantity:1},{productId:'tomates',quantity:2}]});assert.equal(bad.status,409);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM order_items').get().n,1);assert.equal(f.db.prepare('SELECT count(*) AS n FROM audit_log').get().n,count);f.db.close();
});
test('stock is restored exactly once on cancellation and terminal transitions are blocked',async()=>{
  const f=await fixture();await track(f,5000);const data=await(await create(f)).json(),id=data.order.id;
  assert.equal(product(f).stock_milli,3000);
  const response=await f.request(`/api/admin/orders/${id}/status`,{method:'PATCH',body:{status:'cancelled',version:1}});assert.equal(response.status,200);assert.equal(product(f).stock_milli,5000);
  assert.equal((await f.request(`/api/admin/orders/${id}/status`,{method:'PATCH',body:{status:'confirmed',version:2}})).status,409);assert.equal(product(f).stock_milli,5000);
  const detail=await(await f.request('/api/admin/orders/'+id)).json();assert.equal(detail.history.length,2);assert.equal(detail.allowedStatuses.length,0);f.db.close();
});
test('optimistic versions prevent stale product and order changes; units are immutable',async()=>{
  const f=await fixture(),p=productBody(product(f));p.priceCents=900;
  assert.equal((await f.request('/api/admin/products/tomates',{method:'PATCH',body:p})).status,200);
  p.priceCents=1000;assert.equal((await f.request('/api/admin/products/tomates',{method:'PATCH',body:p})).status,409);assert.equal(product(f).price_cents,900);
  const changed=productBody(product(f));changed.unit='pack';assert.equal((await f.request('/api/admin/products/tomates',{method:'PATCH',body:changed})).status,409);
  const data=await(await create(f)).json();assert.equal((await f.request(`/api/admin/orders/${data.order.id}/status`,{method:'PATCH',body:{status:'delivered',version:1}})).status,409);
  assert.equal((await f.request(`/api/admin/orders/${data.order.id}/status`,{method:'PATCH',body:{status:'confirmed',version:1}})).status,200);
  assert.equal((await f.request(`/api/admin/orders/${data.order.id}/status`,{method:'PATCH',body:{status:'cancelled',version:1}})).status,409);f.db.close();
});
test('product create/archive preserves order snapshots; dashboard counts delivered revenue only',async()=>{
  const f=await fixture();const data=await(await create(f)).json();let version=1;
  for(const status of ['confirmed','preparing','out_for_delivery','delivered']){
    assert.equal((await f.request(`/api/admin/orders/${data.order.id}/status`,{method:'PATCH',body:{status,version:version++}})).status,200);
  }
  const p=productBody(product(f));p.priceCents=990;p.active=false;assert.equal((await f.request('/api/admin/products/tomates',{method:'PATCH',body:p})).status,200);
  const detail=await(await f.request(`/api/admin/orders/${data.order.id}`)).json();assert.equal(detail.items[0].unit_price_cents,800);
  assert.equal((await create(f)).status,409);assert(!(await(await f.request('/api/catalog',{auth:false})).json()).some(p=>p.id==='tomates'));
  const stats=await(await f.request('/api/admin/dashboard')).json();assert.equal(stats.revenueCents,3600);assert.equal(stats.statuses.delivered,1);
  const fresh={...p,id:'produit-test',nameFr:'Produit fictif',nameAr:'منتوج تجريبي',active:true,imageKey:'leaf'};
  assert.equal((await f.request('/api/admin/products',{body:fresh})).status,201);assert.equal((await f.request('/api/admin/products',{body:fresh})).status,409);
  f.db.close();
});
test('CSV formula escaping, export auditing and Casablanca day boundaries',async()=>{
  const f=await fixture();await create(f,{...orderBody,customer:{...orderBody.customer,name:'=HYPERLINK("x")'},note:'\n\t=1+1'});
  const response=await f.request('/api/admin/orders/export.csv');const csv=await response.text();assert(csv.includes("'=HYPERLINK"));assert(csv.includes("'\t=1+1")||csv.includes("'=1+1"));
  assert.equal(response.headers.get('x-export-limit'),'5000');assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit_log WHERE action='csv'").get().n,1);
  const start=new Date(dayStart('2026-10-28'));
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(format.formatToParts(start).map(p=>[p.type,p.value]));
  assert.equal(parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour,'2026-10-28 00');
  assert.equal(Object.fromEntries(format.formatToParts(new Date(+start-60000)).map(p=>[p.type,p.value])).day,'27');
  assert.throws(()=>dayStart('2026-02-31'));
  f.db.close();
});
