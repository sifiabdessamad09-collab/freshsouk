import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture,jwk,TEAM,orderBody} from './support.mjs';
import {pushEndpoint,vapidAuthorization,sendPendingPush} from '../src/push.mjs';
const originalFetch=globalThis.fetch;
before(()=>{globalThis.fetch=async url=>{assert.equal(String(url),`https://${TEAM}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});};});after(()=>globalThis.fetch=originalFetch);
const create=async(f,address=orderBody.customer.address)=>(await(await f.request('/api/admin/orders',{body:{...orderBody,customer:{...orderBody.customer,address}},headers:{'Idempotency-Key':crypto.randomUUID()}})).json()).order.id;
const api=(f,path,body)=>f.request('/api/admin/v2/'+path,body?{method:'PATCH',body}:{});
async function deliver(f,id){let version=1;for(const status of ['confirmed','preparing','out_for_delivery','delivered'])assert.equal((await f.request(`/api/admin/orders/${id}/status`,{method:'PATCH',body:{status,version:version++}})).status,200);}

test('additive workflow migration preserves populated data; unknown cash remains distinguishable from zero',async()=>{
 const f=await fixture();const id=await create(f),tables=['orders','order_items','products','audit_log'];
 f.db.exec(await readFile(new URL('../db/0004_admin_v2.sql',import.meta.url),'utf8'));
 const snapshot=()=>JSON.stringify(tables.map(t=>f.db.prepare('SELECT * FROM '+t).all())),before=snapshot();
 f.db.exec(await readFile(new URL('../db/0005_admin_workflow.sql',import.meta.url),'utf8'));
 assert.equal(snapshot(),before);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);f.env.ADMIN_V2_ENABLED='true';
 await deliver(f,id);const r=await(await api(f,'analytics')).json();assert.equal(r.collection.unknownOrders,1);assert.equal(r.collection.collectedCents,0);f.db.close();
});
test('delivery-date reporting includes old orders delivered now and matches product, zone and CSV totals',async()=>{
 const f=await fixture({v2:true}),id=await create(f);await deliver(f,id);
 const delivered=f.db.prepare('SELECT updated_at FROM orders WHERE id=?').get(id).updated_at.slice(0,10);
 // Synthetic old creation date; the terminal delivery date stays current.
 f.db.prepare('UPDATE orders SET created_at=? WHERE id=?').run('2024-01-05T12:00:00.000Z',id);
 let r=await(await api(f,`analytics?from=${delivered}&to=${delivered}&basis=order_created_at`)).json();assert.equal(r.totalOrders,0);
 r=await(await api(f,`analytics?from=${delivered}&to=${delivered}&basis=delivered_at`)).json();assert.equal(r.delivered,1);assert.equal(r.revenueCents,3600);assert.equal(r.products[0].revenueCents,1600);assert.equal(r.zones[0].revenueCents,3600);assert.equal(r.range.basis,'delivered_at');
 const csv=await(await api(f,`reports.csv?kind=daily&from=${delivered}&to=${delivered}&basis=delivered_at`)).text();assert(csv.includes('3600'));assert(csv.includes(delivered));
 assert.equal((await api(f,'analytics?basis=sql-injection')).status,400);f.db.close();
});
test('cash ledger validates delivery, total, remittance and concurrent edits, and isolates private data',async()=>{
 const f=await fixture({v2:true}),id=await create(f),path=`orders/${id}/collection`,body={version:0,collectedCents:3600,remittedCents:2000};
 assert.equal((await api(f,path,body)).status,409);await deliver(f,id);
 assert.equal((await api(f,path,{...body,collectedCents:3601})).status,400);assert.equal((await api(f,path,{...body,remittedCents:4000})).status,400);
 assert.equal((await api(f,path,body)).status,200);assert.equal((await api(f,path,body)).status,409);
 assert.equal((await f.request('/api/admin/v2/'+path,{auth:false})).status,401);
 let r=await(await api(f,'analytics')).json();assert.deepEqual(r.collection,{collectedCents:3600,remittedCents:2000,heldByCourierCents:1600,unknownOrders:0});
 assert.equal((await api(f,path,{version:1,collectedCents:0,remittedCents:0})).status,200);r=await(await api(f,'analytics')).json();assert.equal(r.collection.unknownOrders,0);assert.equal(r.collection.collectedCents,0);
 assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log WHERE entity='collection' AND entity_id=?").get(id).n,2);
 const catalog=await(await f.request('/api/catalog')).text();assert(!catalog.includes('remitted'));assert(!catalog.includes('collected'));f.db.close();
});
test('delivery grouping uses address prefixes without altering addresses; saved couriers and unassigned filters work',async()=>{
 const f=await fixture({v2:true}),a=await create(f,'Bernoussi — Adresse fictive A'),b=await create(f,'Sidi Moumen — Adresse fictive B');
 const body={version:0,neighborhood:'',courier:'Livreur A',internalNote:'',goodsCostCents:null,deliveryCostCents:null};assert.equal((await api(f,`orders/${a}/operations`,body)).status,200);
 const list=await(await api(f,'deliveries?neighborhood=Bernoussi&courier=Livreur%20A&sort=neighborhood')).json();assert.equal(list.total,1);assert.equal(list.orders[0].id,a);assert.equal(list.orders[0].display_neighborhood,'Bernoussi');assert.equal(list.orders[0].address,'Bernoussi — Adresse fictive A');
 const unassigned=await(await api(f,'deliveries?courier=__unassigned&sort=slot')).json();assert.equal(unassigned.total,1);assert.equal(unassigned.orders[0].id,b);
 assert.deepEqual((await(await api(f,'couriers')).json()).couriers,['Livreur A']);assert.equal((await api(f,'deliveries?sort=DROP%20TABLE')).status,400);assert.equal((await api(f,'deliveries?sort=toString')).status,400);f.db.close();
});
test('stock dashboard distinguishes untracked inventory, and pending orders generate only one notice',async()=>{
 const f=await fixture({v2:true}),id=await create(f);let stats=await(await f.request('/api/admin/dashboard')).json();assert(stats.untrackedStock>0);assert.equal(stats.trackedStock,0);assert.equal(stats.lowStock,0);
 const notices=await(await api(f,'notifications')).json();assert.equal(notices.notifications.filter(n=>n.orderId===id).length,1);assert.equal(notices.notifications[0].type,'pending');assert.equal((await f.request('/api/admin/v2/notifications/read',{body:{id:notices.notifications[0].id}})).status,200);await f.request('/api/admin/orders/'+id+'/status',{method:'PATCH',body:{status:'confirmed',version:1}});const updated=await(await api(f,'notifications')).json();assert.equal(updated.notifications.find(n=>n.orderId===id).read,true);f.db.close();
});
test('push defaults off, subscription endpoints reject SSRF and private assets need owner authentication',async()=>{
 const f=await fixture({v2:true});assert.deepEqual(await(await api(f,'push/config')).json(),{enabled:false,publicKey:null});
 assert.equal((await f.request('/admin/push-worker.js',{auth:false})).status,401);
 for(const endpoint of ['https://127.0.0.1/push','https://fcm.googleapis.com.evil.invalid/push','https://user@fcm.googleapis.com/push','http://fcm.googleapis.com/push','https://fcm.googleapis.com:8443/push'])assert.throws(()=>pushEndpoint(endpoint));
 assert.equal(pushEndpoint('https://fcm.googleapis.com/fcm/send/fictitious'),'https://fcm.googleapis.com/fcm/send/fictitious');
 assert.equal((await f.request('/api/admin/v2/push/subscription',{body:{endpoint:'https://fcm.googleapis.com/fcm/send/fictitious'}})).status,503);f.db.close();
});
test('scheduled push signs an audience-limited VAPID token, sends no private payload and advances only after acceptance',async()=>{
 const f=await fixture({v2:true}),keyPair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const pub=Buffer.from(await crypto.subtle.exportKey('raw',keyPair.publicKey)).toString('base64url');Object.assign(f.env,{PUSH_ENABLED:'true',PUSH_SUBJECT:'mailto:owner@freshsouk.invalid',PUSH_PUBLIC_KEY:pub,PUSH_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',keyPair.privateKey))});
 const header=await vapidAuthorization(f.env,'https://fcm.googleapis.com'),jwt=header.match(/^vapid t=(.*), k=/)[1],parts=jwt.split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.aud,'https://fcm.googleapis.com');assert(claims.exp<Date.now()/1000+86400);
 assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keyPair.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts[0]+'.'+parts[1])));
 await create(f);f.db.prepare('INSERT INTO push_subscriptions(id,owner,endpoint,cursor_at,created_at) VALUES(?,?,?,?,?)').run('synthetic','admin@freshsouk.invalid','https://fcm.googleapis.com/fcm/send/synthetic','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z');
 let sent=0;const previous=globalThis.fetch;try{globalThis.fetch=async(url,options)=>{sent++;assert.equal(url,'https://fcm.googleapis.com/fcm/send/synthetic');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');return new Response(null,{status:201});};await sendPendingPush(f.env);await sendPendingPush(f.env);assert.equal(sent,1);}finally{globalThis.fetch=previous;f.db.close();}
});
