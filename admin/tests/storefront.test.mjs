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

test('WhatsApp handoff preserves bilingual details, server total and one shared order reference',async()=>{
 const source=await readFile(new URL('../../storefront.js',import.meta.url),'utf8');
 const context={window:{}};vm.createContext(context);vm.runInContext(source,context);
 const url=context.window.FreshsoukStore.whatsappUrl({name:'Test & client',phone:'0600000000',city:'Casablanca',neighborhood:'الحي',address:'Rue #1',slot:'09h00 - 12h00',note:'TEST فقط'},[{nameFr:'Tomates',nameAr:'طماطم',unit:'kg',quantity:1}],{id:'13e35022-test',totalCents:2800},'212643880485');
 const parsed=new URL(url);assert.equal(parsed.origin,'https://wa.me');assert.equal(parsed.pathname,'/212643880485');assert.equal([...parsed.searchParams].length,1);
 const text=parsed.searchParams.get('text');for(const value of ['#13E35022','28.00 DH','1 kg','طماطم','Test & client','Rue #1','TEST فقط','une seule fois'])assert(text.includes(value));
 assert.throws(()=>context.window.FreshsoukStore.whatsappUrl({},[],{},'evil.invalid'));
});

test('checkout opens WhatsApp only after saved receipt; API failure keeps cart and never navigates',async()=>{
 const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
 const handler=html.slice(html.indexOf("document.getElementById('checkoutForm').addEventListener('submit'"),html.indexOf('  const openConnectedCheckout='));
 for(const failure of [true,false]){
  let submitHandler,saved=false,navigated=false;
  const elements=new Map();const element=()=>({value:'TEST',textContent:'',disabled:false,children:[],append(x){this.children.push(x);},hasAttribute(k){return k in this;},scrollIntoView(){},focus(){},reset(){}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
  document.getElementById('checkoutForm').addEventListener=(_type,fn)=>submitHandler=fn;
  const context={document,WHATSAPP_NUMBER:'212643880485',cart:[{id:'tomates',quantity:1}],getOrderTotal:()=>28,refreshCatalogue:async()=>true,
   saveOrderThroughBackend:async()=>{if(failure)throw Error('API unavailable');saved=true;return {id:'order-test',totalCents:2800};},
   saveCart(){},renderCart(){},closeCheckout(){},Intl,
   FreshsoukStore:{prepareChallenge:async()=>{},whatsappUrl(){assert(saved);return 'https://wa.me/212643880485?text=TEST';}},
   window:{location:{assign(url){assert(saved);assert.match(url,/^https:\/\/wa.me\//);navigated=true;throw Error('App handoff blocked');}}}};
  vm.createContext(context);vm.runInContext(handler,context);
  await submitHandler({preventDefault(){},currentTarget:{querySelector:()=>element()}});
  assert.equal(navigated,!failure);assert.equal(context.cart.length,failure?1:0);
  if(failure)assert.equal(document.getElementById('orderFeedback').textContent,'API unavailable');
  else{assert.equal(document.getElementById('orderReceipt').hidden,false);assert.equal(document.getElementById('orderReceipt').children[1].href,'https://wa.me/212643880485?text=TEST');}
 }
});
