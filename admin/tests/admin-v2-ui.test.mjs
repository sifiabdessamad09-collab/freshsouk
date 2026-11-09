import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('admin rejects HTML sign-in redirects and permission failures instead of displaying a successful private session',async()=>{
 const source=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');const apiSource=source.slice(source.indexOf('async function api('),source.indexOf('function lockSession()'));
 for(const response of [new Response('',{status:401}),new Response('',{status:403}),new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}})]){
  let locked=0;const state={locked:false};const context={AbortController,setTimeout,clearTimeout,state,fetch:async()=>response,lockSession(){locked++;state.locked=true;}};
  vm.createContext(context);vm.runInContext(apiSource,context);await assert.rejects(context.api('/api/admin/orders'));assert.equal(locked,1);assert.equal(state.locked,true);
 }
 const context={AbortController,setTimeout,clearTimeout,state:{locked:false},fetch:async()=>{throw new TypeError('offline');},lockSession(){throw Error('Network failure must not impersonate authentication failure');}};vm.createContext(context);vm.runInContext(apiSource,context);await assert.rejects(context.api('/api/admin/orders'),/offline/);
});

test('nested order dialogs restore focus to the original live control, never a detached form',async()=>{
 const source=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');const snippet=source.slice(source.indexOf('function openDialog('),source.indexOf("$('#closeDialog').addEventListener"));
 let focused=0;const original={isConnected:true,focus(){focused++;}},detached={isConnected:false,focus(){throw Error('Detached focus');}};
 const editor={open:false,showModal(){this.open=true;},close(){this.open=false;}},body={innerHTML:'',replaceChildren(){this.innerHTML='';}},title={},queue=[];
 const context={state:{locked:false},returnFocus:null,document:{activeElement:original},requestAnimationFrame:fn=>queue.push(fn),$:selector=>({'#editor':editor,'#dialogBody':body,'#dialogTitle':title}[selector])};vm.createContext(context);vm.runInContext(snippet,context);
 context.openDialog('Order','one');context.document.activeElement=detached;context.openDialog('Updated order','two');context.closeDialog();assert.equal(editor.open,false);assert.equal(body.innerHTML,'');queue.shift()();assert.equal(focused,1);
 context.state.locked=true;context.openDialog('Forbidden','private');assert.equal(editor.open,false);assert.equal(body.innerHTML,'');
});
