import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fixture,jwk,TEAM,orderBody} from './support.mjs';

test('migration failure rolls populated schema back without losing customer orders or stock',async()=>{
 const f=await fixture();const previousFetch=globalThis.fetch;
 try{globalThis.fetch=async url=>{assert.equal(String(url),`https://${TEAM}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});};const created=await f.request('/api/admin/orders',{body:orderBody,headers:{'Idempotency-Key':crypto.randomUUID()}});assert.equal(created.status,201);}finally{globalThis.fetch=previousFetch;}
 const snapshot=()=>JSON.stringify(['products','orders','order_items','audit_log'].map(t=>f.db.prepare('SELECT * FROM '+t).all()));const before=snapshot();
 const sql=await readFile(new URL('../db/0004_admin_v2.sql',import.meta.url),'utf8');
 f.db.exec('BEGIN');assert.throws(()=>f.db.exec(sql+'INSERT INTO missing_table VALUES(1);'));f.db.exec('ROLLBACK');
 assert.equal(snapshot(),before);assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='admin_settings'").get().n,0);
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);f.db.close();
});

test('storefront shipping settings validate server values, support older backend and fail closed on outage',async()=>{
 const source=await readFile(new URL('../../storefront.js',import.meta.url),'utf8');let answer,sent;
 const context={window:{},AbortSignal,fetch:async(url,options)=>{sent={url,options};if(answer instanceof Error)throw answer;return answer;}};vm.createContext(context);vm.runInContext(source,context);
 answer=Response.json({deliveryFeeCents:2500,freeThresholdCents:25000,zones:['Casablanca','Bouskoura','Mohammedia'],privateData:'must not copy'});
 const result=await context.window.FreshsoukStore.settings();assert.equal(result.deliveryFeeCents,2500);assert.equal(result.zones.length,3);assert.equal('privateData' in result,false);assert.equal(sent.options.credentials,'omit');assert.equal(sent.options.cache,'no-store');
 answer=new Response('',{status:404});assert.equal((await context.window.FreshsoukStore.settings()).deliveryFeeCents,2000);
 for(const values of [{deliveryFeeCents:-1,freeThresholdCents:20000,zones:['Casablanca']},{deliveryFeeCents:2000,freeThresholdCents:0,zones:['Casablanca']},{deliveryFeeCents:2000,freeThresholdCents:20000,zones:['<script>']},{deliveryFeeCents:2000,freeThresholdCents:20000,zones:[]}]){answer=Response.json(values);await assert.rejects(context.window.FreshsoukStore.settings(),/invalide/);}
 answer=new Response('',{status:503});await assert.rejects(context.window.FreshsoukStore.settings(),/indisponible/);
 answer=new Error('offline');await assert.rejects(context.window.FreshsoukStore.settings(),/offline/);
});
