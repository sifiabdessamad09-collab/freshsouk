import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {fixture,jwk,TEAM,orderBody} from './support.mjs';
const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not reach the expected state');};
async function ui(){
 const f=await fixture({v2:true}),previousFetch=globalThis.fetch;
 globalThis.fetch=async url=>{assert.equal(String(url),`https://${TEAM}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});};
 const id=(await(await f.request('/api/admin/orders',{body:orderBody,headers:{'Idempotency-Key':crypto.randomUUID()}})).json()).order.id;
 const html=await readFile(new URL('../ui/index.html',import.meta.url),'utf8'),dom=new JSDOM(html,{url:'https://admin.freshsouk.invalid/admin/#orders',runScripts:'outside-only',pretendToBeVisual:true});
 await new Promise(r=>setTimeout(r,0));const w=dom.window;
 w.matchMedia=q=>({matches:false,media:q,addEventListener(){}});w.AbortController=AbortController;w.fetch=(path,options={})=>f.request(path,{method:options.method||'GET',headers:options.headers,body:options.body?JSON.parse(options.body):undefined});
 w.setInterval=()=>0;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const context=dom.getInternalVMContext();vm.runInContext(await readFile(new URL('../ui/app.js',import.meta.url),'utf8'),context);vm.runInContext(await readFile(new URL('../ui/app-v2.js',import.meta.url),'utf8'),context);
 await w.start();await wait(()=>w.document.querySelector('[data-action="order-detail"]'));
 return {f,w,id,dom,close(){dom.window.close();f.db.close();globalThis.fetch=previousFetch;}};
}
test('real UI renders quick filters, keeps status actions visible, and saves external cost controls through their original form',async()=>{
 const u=await ui();try{const {w,f,id}=u,d=w.document;assert(d.querySelector('.quick-filters'));await w.orderDetail(id);
 assert.equal(d.querySelectorAll('[role=tab]').length,4);assert(d.querySelector('.order-status-action'));assert.equal(d.querySelector('#order-panel-couts').hidden,true);
 d.querySelector('#order-tab-couts').click();assert.equal(d.querySelector('#order-panel-couts').hidden,false);assert.equal(d.querySelector('#order-panel-commande').hidden,true);
 const form=d.querySelector('#operationsForm');assert.equal(form.elements.goods.form,form);assert.equal(form.elements.goods.closest('[role=tabpanel]').id,'order-panel-couts');form.elements.goods.value='6';form.elements.delivery.value='12';
 d.querySelector('#order-panel-couts button[form=operationsForm]').click();await wait(()=>f.db.prepare('SELECT goods_cost_cents FROM order_operations WHERE order_id=?').get(id)?.goods_cost_cents===600);
 assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(id).status,'pending');
 await wait(()=>d.querySelector('#order-tab-livraison'));d.querySelector('#order-tab-livraison').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(d.querySelector('#order-tab-couts').getAttribute('aria-selected'),'true');
 }finally{u.close();}
});
test('language display changes do not alter monetary inputs or customer data; disabled push never prompts',async()=>{
 const u=await ui();try{const {w,id}=u,d=w.document;await w.orderDetail(id);const input=d.querySelector('[name=goods]');input.value='17.5';const language=d.querySelector('#languageSelect');language.value='ar';language.dispatchEvent(new w.Event('change'));
 assert.equal(d.documentElement.dir,'rtl');assert.equal(input.value,'17.5');assert(d.querySelector('#order-tab-couts').textContent.includes('التكاليف'));assert(d.querySelector('#dialogBody').textContent.includes('Client fictif'));
 language.value='fr';language.dispatchEvent(new w.Event('change'));assert.equal(d.documentElement.dir,'ltr');assert.equal(input.value,'17.5');
 assert.equal(w.localStorage.getItem('freshsouk-admin-language'),'fr');assert.equal(w.localStorage.length,1);
 }finally{u.close();}
});
