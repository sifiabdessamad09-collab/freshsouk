import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture,jwk,TEAM,orderBody,productBody} from './support.mjs';
import publicWorker from '../src/public-worker.mjs';
import {publicTracking} from '../src/tracking.mjs';
const originalFetch=globalThis.fetch;
before(()=>{globalThis.fetch=async url=>{assert.equal(String(url),`https://${TEAM}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});};});after(()=>globalThis.fetch=originalFetch);
const create=(f,body=orderBody,key=crypto.randomUUID())=>f.request('/api/admin/orders',{body,headers:{'Idempotency-Key':key}});
const api=(f,path,body,method=body?'PATCH':'GET')=>f.request('/api/admin/v2/'+path,{method,...(body?{body}:{})});
async function deliver(f,id){let version=1;for(const status of ['confirmed','preparing','out_for_delivery','delivered'])assert.equal((await f.request('/api/admin/orders/'+id+'/status',{method:'PATCH',body:{status,version:version++}})).status,200);}
const ops=(goods=null,delivery=null,version=0)=>({version,neighborhood:'Quartier fictif',courier:'Livreur fictif',internalNote:'Interne uniquement',goodsCostCents:goods,deliveryCostCents:delivery});

test('V2 migration preserves populated orders, products, audit history, reserved stock and tracking capabilities',async()=>{
 const f=await fixture();f.env.ORDER_TRACKING_ENABLED='true';
 const p=f.db.prepare("SELECT * FROM products WHERE id='tomates'").get();assert.equal((await f.request('/api/admin/products/tomates',{method:'PATCH',body:{...productBody(p),trackStock:true,stockMilli:5000}})).status,200);
 const r=await create(f);assert.equal(r.status,201);const id=(await r.json()).order.id;
 const link=await(await f.request('/api/admin/orders/'+id+'/tracking',{body:{version:0}})).json();assert(link.token);
 const tables=['orders','order_items','products','order_tracking','audit_log'],snapshot=t=>JSON.stringify(f.db.prepare('SELECT * FROM '+t).all());const before=Object.fromEntries(tables.map(t=>[t,snapshot(t)]));
 f.db.exec('BEGIN;'+await readFile(new URL('../db/0004_admin_v2.sql',import.meta.url),'utf8')+'COMMIT;');f.env.ADMIN_V2_ENABLED='true';
 for(const t of tables)assert.equal(snapshot(t),before[t],t+' changed during migration');assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal((await publicTracking(f.env,link.token)).status,'pending');assert.equal((await f.request('/api/admin/orders/'+id+'/status',{method:'PATCH',body:{status:'cancelled',version:1}})).status,200);
 assert.equal(f.db.prepare("SELECT stock_milli FROM products WHERE id='tomates'").get().stock_milli,5000);f.db.close();
});
test('every V2 endpoint and new UI asset requires owner JWT; public worker never exposes management data',async()=>{
 const f=await fixture({v2:true});
 for(const path of ['analytics','clients','deliveries','settings','notifications','product-costs','reports.csv']){
  const route='/api/admin/v2/'+path;assert.equal((await f.request(route,{auth:false})).status,401);assert.equal((await f.request(route,{headers:{Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await publicWorker.fetch(new Request('https://public.invalid'+route),f.env)).status,404);
 }
 for(const path of ['/admin/app-v2.js','/admin/theme.js'])assert.equal((await f.request(path,{auth:false})).status,401);
 f.env.ADMIN_EMAILS+=',second@freshsouk.invalid';assert.equal((await api(f,'settings')).status,503);f.db.close();
 const old=await fixture();assert.equal((await api(old,'settings')).status,404);assert.equal((await old.request('/api/shop-settings')).status,200);old.db.close();
});
test('shipping defaults stay 20 DH/free at 200, settings use CAS, new zones and rates apply only to new orders',async()=>{
 const f=await fixture({v2:true});let r=await create(f);const first=(await r.json()).order.id;
 assert.equal(f.db.prepare('SELECT delivery_cents FROM orders WHERE id=?').get(first).delivery_cents,2000);
 const free=(await(await create(f,{...orderBody,items:[{productId:'tomates',quantity:25}]})).json()).order;
 assert.equal(free.totalCents,20000);
 const b={version:1,deliveryFeeCents:2500,freeThresholdCents:30000,zones:['Casablanca','Bouskoura','Mohammedia']};assert.equal((await api(f,'settings',b)).status,200);assert.equal((await api(f,'settings',b)).status,409);
 for(const city of ['Bouskoura','Mohammedia']){r=await create(f,{...orderBody,customer:{...orderBody.customer,city}});assert.equal(r.status,201);assert.equal((await r.json()).order.totalCents,4100);}
 assert.equal(f.db.prepare('SELECT delivery_cents FROM orders WHERE id=?').get(first).delivery_cents,2000);
 const publicSettings=await(await f.request('/api/shop-settings')).json();assert.deepEqual(Object.keys(publicSettings).sort(),['deliveryFeeCents','freeThresholdCents','version','zones']);
 assert.equal((await create(f,{...orderBody,customer:{...orderBody.customer,city:'Rabat'}})).status,400);
 assert.equal((await api(f,'settings',{...b,version:2,zones:['Casablanca','<script>']})).status,400);f.db.close();
});
test('financials distinguish revenue, missing costs and profit; purchase prices are snapshotted and expenses idempotent',async()=>{
 const f=await fixture({v2:true});assert.equal((await api(f,'product-costs/tomates',{version:0,unitCostCents:300})).status,200);
 const id=(await(await create(f)).json()).order.id;await deliver(f,id);
 let r=await(await api(f,'analytics')).json();assert.equal(r.revenueCents,3600);assert.equal(r.grossMarginCents,1000);assert.equal(r.resultCents,null);assert.equal(r.missingDeliveryOrders,1);
 assert.equal((await api(f,'product-costs/tomates',{version:1,unitCostCents:700})).status,200);assert.equal((await api(f,'product-costs/tomates',{version:1,unitCostCents:100})).status,409);
 r=await(await api(f,'analytics')).json();assert.equal(r.knownGoodsCostCents,600);
 assert.equal((await api(f,'orders/'+id+'/operations',ops(null,1000))).status,200);assert.equal((await api(f,'orders/'+id+'/operations',ops(0,0))).status,409);
 const key=crypto.randomUUID(),date=new Date().toISOString().slice(0,10),expense={label:'Frais fictifs',spentOn:date,amountCents:100};
 const request=body=>f.request('/api/admin/v2/expenses',{body,headers:{'Idempotency-Key':key}});
 const responses=await Promise.all([request(expense),request(expense)]);for(const r of responses)assert.equal(r.status,201);assert.equal((await request({...expense,amountCents:200})).status,409);
 assert.equal(f.db.prepare('SELECT count(*) n FROM expenses').get().n,1);
 r=await(await api(f,'analytics')).json();assert.equal(r.resultCents,1900);assert.equal(r.expenseCents,100);assert.equal(r.delivered,1);
 const unknown=(await(await create(f,{...orderBody,items:[{productId:'carottes',quantity:1}]})).json()).order.id;await deliver(f,unknown);r=await(await api(f,'analytics')).json();assert.equal(r.grossMarginCents,null);assert.equal(r.resultCents,null);assert.equal(r.missingGoodsOrders,1);f.db.close();
});
test('client phone normalization, notes, deliveries and read notifications remain private and versioned',async()=>{
 const f=await fixture({v2:true});const id=(await(await create(f)).json()).order.id;
 await create(f,{...orderBody,customer:{...orderBody.customer,phone:'+212600000000'}});
 const clients=await(await api(f,'clients')).json();assert.equal(clients.total,1);assert.equal(clients.customers[0].orders,2);assert.equal(clients.customers[0].deliveredSpendCents,0);
 assert.equal((await api(f,'clients/0600000000',{version:0,note:'Note privée'})).status,200);assert.equal((await api(f,'clients/0600000000',{version:0,note:'Ancien écran'})).status,409);
 assert.equal((await(await api(f,'clients/0600000000')).json()).note.note,'Note privée');
 assert.equal((await api(f,'orders/'+id+'/operations',ops(100,200))).status,200);const deliveries=await(await api(f,'deliveries')).json();assert.equal(deliveries.orders.find(o=>o.id===id).courier,'Livreur fictif');
 const before=await(await api(f,'notifications')).json();assert(before.unread>=2);const n=before.notifications[0];assert.equal((await api(f,'notifications/read',{id:n.id},'POST')).status,200);const after=await(await api(f,'notifications')).json();assert.equal(after.unread,before.unread-1);
 assert.equal((await api(f,'notifications/read',{id:'invented'},'POST')).status,404);
 const catalog=JSON.stringify(await(await f.request('/api/catalog')).json());for(const name of ['internalNote','goods_cost','unit_cost','customer_name','Note privée'])assert(!catalog.includes(name));f.db.close();
});
test('reports share financial totals, safely escape CSV formulae, validate dates and ignore cancelled revenue',async()=>{
 const f=await fixture({v2:true});const p=f.db.prepare("SELECT * FROM products WHERE id='tomates'").get();assert.equal((await f.request('/api/admin/products/tomates',{method:'PATCH',body:{...productBody(p),nameFr:'=FORMULA()'}})).status,200);
 const id=(await(await create(f)).json()).order.id;await deliver(f,id);const cancelled=(await(await create(f)).json()).order.id;await f.request('/api/admin/orders/'+cancelled+'/status',{method:'PATCH',body:{status:'cancelled',version:1}});
 const analytics=await(await api(f,'analytics')).json();assert.equal(analytics.revenueCents,3600);assert.equal(analytics.counts.cancelled,1);
 for(const kind of ['daily','weekly','monthly','products','categories','zones']){const r=await api(f,'reports.csv?kind='+kind);assert.equal(r.status,200);const csv=await r.text();assert(r.headers.get('cache-control').includes('no-store'));if(kind==='products')assert(csv.includes("'=FORMULA()"));}
 for(const q of ['from=2026-02-30','from=2020-01-01&to=2026-11-01','from=2027-01-01&to=2026-01-01'])assert.equal((await api(f,'analytics?'+q)).status,400);
 assert.equal((await api(f,'reports.csv?kind=unknown')).status,400);assert.equal((await api(f,'clients?q='+encodeURIComponent("%' OR 1=1--"))).status,200);
 f.db.close();
});
