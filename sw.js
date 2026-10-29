'use strict';
const VERSION='freshsouk-pwa-viewport-20261029';
const SHELL=VERSION+'-shell';
const MEDIA=VERSION+'-media';
const ROOT=new URL('./',self.registration.scope);
const ROOT_KEY=ROOT.href;
const OFFLINE=new URL('offline.html',ROOT).href;
const SHELL_FILES=[
 './','./index.html','./offline.html','./manifest.json','./products.json',
 './storefront.js?v=whatsapp-20261029',
 './pwa.js?v=app1-20261027','./pwa.css?v=app1-20261027',
 './redesign.js?v=viewport-20261029','./redesign.css?v=baskets-20261027',
 './assets/icons.js','./app-icon-192.png','./app-icon-512.png',
 './app-icon-maskable-512.png','./apple-touch-icon.png'
].map(file=>new URL(file,ROOT).href);
const SAFE_FILES=new Set(['storefront.js','pwa.js','pwa.css','redesign.js','redesign.css','manifest.json','app-icon-192.png','app-icon-512.png','app-icon-maskable-512.png','apple-touch-icon.png','freshsouk-logo.png','kiwi.jpg']);

self.addEventListener('install',event=>{
 // One atomic shell installation; a missing file must not leave a partial app.
 event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(SHELL_FILES)));
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith('freshsouk-pwa-')&&!name.startsWith(VERSION+'-')).map(name=>caches.delete(name)));
  await self.clients.claim();
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

async function navigation(request){
 const cache=await caches.open(SHELL);
 try{
  const response=await fetch(request);
  if(response.ok){await cache.put(ROOT_KEY,response.clone());return response;}
  return (await cache.match(ROOT_KEY))||(await cache.match(OFFLINE))||response;
 }catch{
  return (await cache.match(ROOT_KEY))||(await cache.match(OFFLINE))||new Response('FRESHSOUK — Connexion nécessaire / خاص الاتصال بالإنترنت',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 }
}
async function catalogue(request){
 const cache=await caches.open(MEDIA);
 const key=new URL('products.json',ROOT).href;
 try{
  const response=await fetch(request);
  if(response.ok)await cache.put(key,response.clone());
  return response;
 }catch{
  const previous=(await cache.match(key))||(await caches.match(key));
  if(previous)return previous;
  throw new Error('Catalogue unavailable offline');
 }
}
async function staticAsset(request){
 const cache=await caches.open(MEDIA);
 const previous=(await cache.match(request))||(await caches.match(request));
 if(previous)return previous;
 const response=await fetch(request);
 if(response.ok&&response.type!=='opaque')await cache.put(request,response.clone());
 return response;
}
self.addEventListener('fetch',event=>{
 const request=event.request;
 // Never cache, queue, replay or claim success for a customer order.
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return;
 const relative=url.pathname.slice(ROOT.pathname.length);
 if(/^(?:api|backend|admin|docs)(?:\/|$)/.test(relative))return;
 if(request.mode==='navigate'&&(relative===''||relative==='index.html')){
  event.respondWith(navigation(request));return;
 }
 if(relative==='products.json'){
  event.respondWith(catalogue(request));return;
 }
 if(SAFE_FILES.has(relative)||/^(?:assets|images)\/[^?]+\.(?:png|webp|jpe?g|gif|svg|woff2?|js|css)$/.test(relative)){
  event.respondWith(staticAsset(request));
 }
});
