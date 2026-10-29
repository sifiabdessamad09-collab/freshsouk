import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('storefront sends the exact private API contract and requires a server receipt',async()=>{
 const source=await readFile(new URL('../../storefront.js',import.meta.url),'utf8');
 let callback,answer=Response.json({ok:true,order:{id:'test-order',status:'pending',totalCents:2800}}),sent;
 const context={window:{turnstile:{render(host,options){callback=options.callback;return 0;},reset(){callback('fresh-token');}}},document:{getElementById:()=>({})},AbortSignal,fetch:async(url,options)=>{sent={url,options};return answer;}};
 vm.createContext(context);vm.runInContext(source,context);const store=context.window.FreshsoukStore;
 const customer={name:'Test client',phone:'0600000000',city:'Casablanca',neighborhood:'Quartier fictif',address:'Adresse fictive',slot:'09h00 - 12h00',note:'TEST'};
 const items=[{id:'tomates',quantity:1,price:999}];
 await assert.rejects(store.save(customer,items,'test-key'),'verification');
 await store.prepareChallenge();callback('test-preview-token');
 const receipt=await store.save(customer,items,'stable-idempotency-key');assert.equal(receipt.totalCents,2800);
 const body=JSON.parse(sent.options.body);
 assert.deepEqual(Object.keys(body).sort(),['customer','items','note','turnstileToken']);
 assert.equal(body.customer.address,'Quartier fictif — Adresse fictive');assert.equal('neighborhood'in body.customer,false);assert.equal('note'in body.customer,false);
 assert.deepEqual(body.items,[{productId:'tomates',quantity:1}]);assert.equal(body.note,'TEST');
 assert.equal(sent.options.headers['Idempotency-Key'],'stable-idempotency-key');assert.equal(sent.options.credentials,'omit');
 answer=Response.json({error:'Stock insuffisant.'},{status:409});await assert.rejects(store.save(customer,items,'stable-idempotency-key'),/Stock insuffisant/);
 answer=Response.json({ok:true,order:{id:'invalid',total:28}});await assert.rejects(store.save(customer,items,'stable-idempotency-key'),/Enregistrement impossible/);
});
