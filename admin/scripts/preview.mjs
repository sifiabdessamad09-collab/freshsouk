// Local, fictitious-data preview. This file is not imported by the Worker or copied to assets.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fixture,jwk,TEAM,token,orderBody} from '../tests/support.mjs';
import worker from '../src/worker.mjs';
const host='127.0.0.1',port=Number(process.env.PREVIEW_PORT||8788),origin=`http://${host}:${port}`;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local preview port');
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>String(url)===`https://${TEAM}/cdn-cgi/access/certs`?Response.json({keys:[jwk]}):realFetch(url,options);
const f=await fixture();
const trackingPreview=process.env.TRACKING_PREVIEW==='1';
if(trackingPreview){f.env.ORDER_TRACKING_ENABLED='true';f.env.ALLOWED_ORIGIN=origin;f.env.ORDER_LIMITER={limit:async()=>({success:true})};}
const samples=[['Client démo A','tomates',2,[]],['Client démo B','carottes',1.5,['confirmed']],['Client démo C','oranges',3,['confirmed','preparing','out_for_delivery','delivered']],['Client démo D','pack-couscous-vendredi',1,['cancelled']],['Client démo E','kiwi',1,['confirmed','preparing']],['Client démo F','pack-semaine-familial',1,['confirmed','preparing','out_for_delivery']]];
for(const [name,id,quantity,transitions]of samples) {
  const response=await f.request('/api/admin/orders',{body:{...orderBody,customer:{...orderBody.customer,name},items:[{productId:id,quantity}]},headers:{'Idempotency-Key':crypto.randomUUID()}});
  if(response.status!==201)throw new Error('Could not initialise local demo.');
  const order=(await response.json()).order;let version=1;
  for(const status of transitions){const changed=await f.request(`/api/admin/orders/${order.id}/status`,{method:'PATCH',body:{status,version:version++}});if(changed.status!==200)throw new Error('Could not initialise demo history.');}
}
f.db.exec("UPDATE products SET track_stock=1,stock_milli=CASE id WHEN 'bananes' THEN 0 WHEN 'tomates' THEN 5000 ELSE 24000 END,version=version+1,updated_by='demo@freshsouk.invalid',update_reason='Stock fictif de démonstration' WHERE id IN ('tomates','bananes','oranges')");
const mime=path=>path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.webp')?'image/webp':'text/html';
f.env.ASSETS={async fetch(request){const path=new URL(request.url).pathname;if(!/^\/(?:image-keys\.json|admin\/(?:index\.html|app\.(?:css|js)|media\/[a-z0-9-]+\.webp))$/.test(path))return new Response('Not found',{status:404});try{let body=await readFile(new URL('../.assets'+path,import.meta.url));if(trackingPreview&&path==='/admin/app.js')body=body.toString().replace('https://sifiabdessamad09-collab.github.io/freshsouk/track.html',origin+'/track.html');return new Response(body,{headers:{'content-type':mime(path)}});}catch{return new Response('Not found',{status:404});}}};
let jwt=await token(),issued=Date.now();
const server=http.createServer(async(req,res)=>{
  try {
    if(trackingPreview&&req.method==='GET'&&['/track.html','/track.css','/track.js'].includes(new URL(req.url,origin).pathname)){
      const path=new URL(req.url,origin).pathname;let body=await readFile(new URL('../../'+path.slice(1),import.meta.url),'utf8');
      body=body.replaceAll('https://freshsouk-shop-api.freshsouk.workers.dev',origin);
      res.writeHead(200,{'content-type':mime(path),'cache-control':'no-store','referrer-policy':'no-referrer'});res.end(body);return;
    }
    if(Date.now()-issued>1800000){jwt=await token();issued=Date.now();}
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>32768){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const headers=new Headers(req.headers);headers.set('Cf-Access-Jwt-Assertion',jwt);
    const request=new Request(new URL(req.url,origin),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,f.env);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'content-type':'text/plain'});res.end('Local preview error');}
});
server.listen(port,host,()=>console.log(`Fictitious-data preview only: ${origin}/admin/ — bound to loopback; never deploy this server.`));
process.on('SIGINT',()=>server.close(()=>{f.db.close();process.exit(0);}));
