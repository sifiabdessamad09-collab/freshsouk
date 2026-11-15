import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDashboardDeploy} from '../scripts/prepare-dashboard-deploy.mjs';
import {dashboardEnvironment} from '../src/dashboard-assets.mjs';
import {fixture,jwk,TEAM} from './support.mjs';

test('dashboard bundle uses matching UI behind authentication and keeps catalogue media',async()=>{
  const {dir,assets}=await prepareDashboardDeploy();
  const {default:worker}=await import(new URL('entry.mjs',dir));
  const f=await fixture({v2:true}),previous=globalThis.fetch;
  const calls=[];
  f.env.ASSETS={fetch:async request=>{calls.push(new URL(request.url).pathname);return new Response('existing-media');}};
  globalThis.fetch=async url=>{assert.equal(String(url),`https://${TEAM}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});};
  try {
    for(const [path,{body,type}] of Object.entries(assets)) {
      const denied=await worker.fetch(new Request('https://admin.freshsouk.invalid'+path),f.env);
      assert.equal(denied.status,401,path);
      const allowed=await worker.fetch(new Request('https://admin.freshsouk.invalid'+path,{headers:{'Cf-Access-Jwt-Assertion':f.jwt}}),f.env);
      assert.equal(allowed.status,200,path);assert.equal(await allowed.text(),body);
      assert.equal(allowed.headers.get('content-type'),type);
      assert.match(allowed.headers.get('cache-control'),/no-store/);
      assert.match(allowed.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    }
    const env=dashboardEnvironment(f.env,assets);
    assert.equal(env.DB,f.env.DB);
    for(const path of ['/admin/media/tomates.webp','/image-keys.json','/toString'])assert.equal(await(await env.ASSETS.fetch(new Request('https://admin.freshsouk.invalid'+path))).text(),'existing-media');
    assert.deepEqual(calls,['/admin/media/tomates.webp','/image-keys.json','/toString']);
    assert.equal((await worker.fetch(new Request('https://admin.freshsouk.invalid/.local/dashboard/entry.mjs'),f.env)).status,404);
    assert.equal(typeof worker.scheduled,'function');
  } finally {globalThis.fetch=previous;f.db.close();}
});
