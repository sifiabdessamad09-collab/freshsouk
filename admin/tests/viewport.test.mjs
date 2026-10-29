import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('cart height follows the visible viewport on keyboard, rotation and restored pages',async()=>{
 const source=await readFile(new URL('../../redesign.js',import.meta.url),'utf8');
 const styles=new Map();let ready;
 const context={window:{innerHeight:844,visualViewport:{height:763,offsetTop:0,scale:1}},document:{documentElement:{style:{setProperty:(k,v)=>styles.set(k,v)}},addEventListener:(_type,fn)=>{ready=fn;}}};
 vm.createContext(context);vm.runInContext(source,context);
 context.fsSyncViewport();assert.equal(styles.get('--fs-viewport-height'),'763px');
 context.window.visualViewport.height=360;context.window.visualViewport.offsetTop=44;context.fsSyncViewport();
 assert.equal(styles.get('--fs-viewport-height'),'360px');assert.equal(styles.get('--fs-viewport-top'),'44px');
 context.window.visualViewport.scale=2;context.window.visualViewport.height=180;context.fsSyncViewport();assert.equal(styles.get('--fs-viewport-height'),'360px');
 delete context.window.visualViewport;context.window.innerHeight=390;context.fsSyncViewport();assert.equal(styles.get('--fs-viewport-height'),'390px');assert.equal(styles.get('--fs-viewport-top'),'0px');
 assert.equal(typeof ready,'function');
});
