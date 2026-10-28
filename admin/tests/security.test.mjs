import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,token,jwk,TEAM,EMAIL,orderBody,productBody} from './support.mjs';
const originalFetch=globalThis.fetch;
before(()=>{globalThis.fetch=async url=>{
  if(String(url)===`https://${TEAM}/cdn-cgi/access/certs`)return Response.json({keys:[jwk]});
  if(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:true,hostname:'sifiabdessamad09-collab.github.io',action:'freshsouk-order'});
  throw new Error('Unexpected external request in test');
};});
after(()=>{globalThis.fetch=originalFetch;});

test('private APIs and asset aliases fail closed without authentication',async()=>{
  const f=await fixture();
  for(const path of ['/admin','/admin/','/admin/index.html','/admin/app.js','/admin/media/tomates.webp','/api/admin/session','/api/admin/orders','/api/admin/dashboard','/api/admin/products','/api/admin/orders/export.csv']){
    const response=await f.request(path,{auth:false});assert.equal(response.status,401,path);
    assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
    assert(!JSON.stringify(await response.text()).includes('Client fictif'));
  }
  for(const path of ['/backend/admin.html','/image-keys.json','/.assets/admin/index.html','/admin/../db/0001_admin.sql'])assert.equal((await f.request(path,{auth:false})).status,404);
  f.env.ADMIN_EMAILS='';assert.equal((await f.request('/api/admin/orders')).status,503);f.db.close();
});
test('real RSA signatures, issuer, audience, expiry, app identity and allowlist are verified',async()=>{
  const f=await fixture();assert.equal((await f.request('/api/admin/session')).status,200);
  const cases=[[{email:'outsider@example.invalid'},403],[{aud:['another-app']},401],[{iss:'https://evil.invalid'},401],[{exp:1},401],[{nbf:Date.now()/1000+3600},401],[{iat:Date.now()/1000+3600},401],[{type:'service'},401],[{email:undefined},401]];
  for(const [claims,status]of cases)assert.equal((await f.request('/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':await token(claims)}})).status,status);
  for(const header of [{alg:'none'},{alg:'HS256'},{kid:'unknown'},{crit:['unsupported']},{typ:'not-a-JWT'}])assert.equal((await f.request('/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':await token({},header)}})).status,401);
  const forged=f.jwt.slice(0,-20)+'A'.repeat(20);assert.equal((await f.request('/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':forged}})).status,401);
  assert.equal((await f.request('/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':'malformed'}})).status,401);
  const data=await(await f.request('/api/admin/session')).json();assert.equal(data.email,EMAIL);assert(!JSON.stringify(data).includes(f.jwt));f.db.close();
});
test('CSRF, cross-origin reads and forged browser-supplied identity are rejected',async()=>{
  const f=await fixture();const p=productBody(f.db.prepare("SELECT * FROM products WHERE id='tomates'").get());
  for(const headers of [{Origin:'https://attacker.invalid'},{Origin:'https://sifiabdessamad09-collab.github.io'},{'X-Freshsouk-Admin':'0'},{'Content-Type':'text/plain'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await f.request('/api/admin/products/tomates',{method:'PATCH',body:p,headers})).status,403);
  const cross=await f.request('/api/admin/orders',{headers:{Origin:f.env.ALLOWED_ORIGIN}});assert.equal(cross.status,403);assert.equal(cross.headers.get('access-control-allow-origin'),null);
  assert.equal((await f.request('/api/admin/orders',{auth:false,headers:{'Cf-Access-Authenticated-User-Email':EMAIL}})).status,401);
  const html=await f.request('/admin/',{headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate'}});assert.equal(html.status,200);
  assert(html.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert(!html.headers.get('content-security-policy').includes('unsafe-inline'));f.db.close();
});
test('public intake is disabled by default; explicit config, rate limits and captcha required',async()=>{
  const f=await fixture();const options={auth:false,body:orderBody,headers:{Origin:f.env.ALLOWED_ORIGIN,'Idempotency-Key':'public-order-disabled-test'}};
  assert.equal((await f.request('/api/orders',options)).status,503);
  f.env.PUBLIC_ORDER_INTAKE_ENABLED='true';assert.equal((await f.request('/api/orders',options)).status,503);
  Object.assign(f.env,{TURNSTILE_SECRET:'test-only-secret',TURNSTILE_HOSTNAME:'sifiabdessamad09-collab.github.io',ORDER_LIMITER:{limit:async()=>({success:false})}});
  assert.equal((await f.request('/api/orders',options)).status,429);
  f.env.ORDER_LIMITER.limit=async()=>({success:true});assert.equal((await f.request('/api/orders',options)).status,400);
  const response=await f.request('/api/orders',{...options,body:{...orderBody,turnstileToken:'test-captcha-token'}});assert.equal(response.status,201);
  const receipt=await response.json();assert.deepEqual(Object.keys(receipt.order).sort(),['id','status','totalCents']);assert(!JSON.stringify(receipt).includes(orderBody.customer.phone));
  assert.equal((await f.request('/api/orders')).status,405);
  assert.equal((await f.request('/api/admin/orders',{auth:false})).status,401);f.db.close();
});
test('bounded JSON, field allowlists, HTML text and parameterised search',async()=>{
  const f=await fixture();
  const massive={...orderBody,note:'x'.repeat(40000)};
  assert.equal((await f.request('/api/admin/orders',{body:massive,headers:{'Idempotency-Key':'large-body-0000000000'}})).status,413);
  assert.equal((await f.request('/api/admin/orders',{body:{...orderBody,totalCents:1},headers:{'Idempotency-Key':'tampered-total-0000000'}})).status,400);
  const created=await f.request('/api/admin/orders',{body:{...orderBody,customer:{...orderBody.customer,name:'<img src=x onerror=alert(1)>'}},headers:{'Idempotency-Key':'xss-fixture-000000000'}});assert.equal(created.status,201);
  const search=await f.request('/api/admin/orders?q='+encodeURIComponent("' OR 1=1 --"));assert.equal(search.status,200);assert.equal((await search.json()).total,0);
  assert.equal((await f.request('/api/admin/orders?from=2026-02-31')).status,400);assert.equal((await f.request('/api/admin/orders?page=-1')).status,400);f.db.close();
});

test('captcha hostname and action mismatches never store an order',async()=>{
  const f=await fixture(),previous=globalThis.fetch;
  Object.assign(f.env,{PUBLIC_ORDER_INTAKE_ENABLED:'true',TURNSTILE_SECRET:'test-only-placeholder',TURNSTILE_HOSTNAME:'sifiabdessamad09-collab.github.io',ORDER_LIMITER:{limit:async()=>({success:true})}});
  try{
    for(const validation of [{success:false},{success:true,hostname:'attacker.invalid',action:'freshsouk-order'},{success:true,hostname:f.env.TURNSTILE_HOSTNAME,action:'other-form'}]){
      globalThis.fetch=async(url,options)=>String(url).includes('/turnstile/')?Response.json(validation):previous(url,options);
      const result=await f.request('/api/orders',{auth:false,body:{...orderBody,turnstileToken:'test-only-token'},headers:{Origin:f.env.ALLOWED_ORIGIN,'Idempotency-Key':crypto.randomUUID()}});
      assert.equal(result.status,400);
    }
    assert.equal(f.db.prepare('SELECT count(*) AS count FROM orders').get().count,0);
  }finally{globalThis.fetch=previous;f.db.close();}
});
test('unavailable or malformed signing-key service fails closed',async()=>{
  const f=await fixture(),previous=globalThis.fetch;
  try{
    for(const [team,response]of [['unavailable-keys.cloudflareaccess.com',new Response('',{status:503})],['malformed-keys.cloudflareaccess.com',Response.json({keys:'not-an-array'})]]){
      f.env.ACCESS_TEAM_DOMAIN=team;
      globalThis.fetch=async()=>response.clone();
      const jwt=await token({iss:'https://'+team});
      const result=await f.request('/api/admin/orders',{headers:{'Cf-Access-Jwt-Assertion':jwt}});
      assert.equal(result.status,503);
    }
  }finally{globalThis.fetch=previous;f.db.close();}
});
