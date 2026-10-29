import test from 'node:test';
import assert from 'node:assert/strict';
import publicWorker from '../src/public-worker.mjs';
import {fixture} from './support.mjs';

test('public deployment cannot serve admin routes, files, order reads or internal product fields',async()=>{
 const f=await fixture();
 try{
  for(const path of ['/admin/','/admin/app.js','/api/admin/orders','/api/admin/products','/image-keys.json','/api/orders/some-id']) {
   const response=await publicWorker.fetch(new Request('https://shop.invalid'+path),f.env);
   assert.equal(response.status,404);
  }
  const response=await publicWorker.fetch(new Request('https://shop.invalid/api/catalog',{headers:{Origin:f.env.ALLOWED_ORIGIN}}),f.env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('access-control-allow-origin'),f.env.ALLOWED_ORIGIN);
  const data=await response.json();assert.equal(data.length,32);
  for(const p of data)for(const field of ['stockMilli','stock_milli','updated_by','version','customer_name','phone'])assert.equal(field in p,false);
  assert.equal((await publicWorker.fetch(new Request('https://shop.invalid/api/orders'),f.env)).status,405);
 }finally{f.db.close();}
});
