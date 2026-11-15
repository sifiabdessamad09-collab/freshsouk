import {fault} from './auth.mjs';
import {statement,rows,fields,readBody,text,hash,now} from './domain.mjs';

// Empty Web Push messages (RFC 8030) carry no customer/order payload.
// The service worker shows a generic notice and opens the authenticated admin.
export function pushConfigured(env){return env.PUSH_ENABLED==='true'&&!!env.PUSH_PUBLIC_KEY&&!!env.PUSH_PRIVATE_JWK&&/^mailto:[^\s@]+@[^\s@]+$/.test(env.PUSH_SUBJECT||'');}
export function pushEndpoint(value){
 const raw=text(value,'abonnement',1,4096);let u;try{u=new URL(raw);}catch{throw fault(400,'Abonnement invalide.');}
 const allowed=u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname);
 if(!allowed||u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.pathname==='/')throw fault(400,'Service de notification non pris en charge.');
 return u.href;
}
const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function vapidAuthorization(env,audience){
 const jwk=JSON.parse(env.PUSH_PRIVATE_JWK),key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const encode=obj=>base64url(new TextEncoder().encode(JSON.stringify(obj)));
 const token=encode({typ:'JWT',alg:'ES256'})+'.'+encode({aud:audience,exp:Math.floor(Date.now()/1000)+3600,sub:env.PUSH_SUBJECT});
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(token));
 return `vapid t=${token}.${base64url(signature)}, k=${env.PUSH_PUBLIC_KEY}`;
}
export async function pushRoute(request,env,owner,path){
 if(path==='push/config'&&request.method==='GET')return Response.json({enabled:pushConfigured(env),publicKey:pushConfigured(env)?env.PUSH_PUBLIC_KEY:null});
 if(path!=='push/subscription'||!['POST','DELETE'].includes(request.method))throw fault(404,'Ressource introuvable.');
 const body=await readBody(request);fields(body,['endpoint']);const endpoint=pushEndpoint(body.endpoint),id=await hash(endpoint);
 if(request.method==='DELETE'){await statement(env,'DELETE FROM push_subscriptions WHERE id=? AND owner=?',id,owner).run();return Response.json({ok:true});}
 if(!pushConfigured(env))throw fault(503,'Notifications de fond non configurées.');
 const existing=await statement(env,'SELECT owner FROM push_subscriptions WHERE id=?',id).first();
 if(existing&&existing.owner!==owner)throw fault(409,'Cet abonnement appartient à un autre compte.');
 if(!existing&&(await statement(env,'SELECT count(*) n FROM push_subscriptions WHERE owner=?',owner).first()).n>=10)throw fault(422,'Dix appareils maximum.');
 await statement(env,'INSERT OR IGNORE INTO push_subscriptions(id,owner,endpoint,cursor_at,created_at) VALUES(?,?,?,?,?)',id,owner,endpoint,now(),now()).run();
 return Response.json({ok:true});
}
export async function sendPendingPush(env){
 if(!pushConfigured(env))return;
 const owners=String(env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 const subscriptions=await rows(statement(env,'SELECT * FROM push_subscriptions ORDER BY created_at LIMIT 100'));
 for(const sub of subscriptions){
  if(!owners.includes(sub.owner.toLowerCase()))continue;
  const latest=await statement(env,'SELECT created_at FROM orders WHERE created_at>? ORDER BY created_at DESC,id DESC LIMIT 1',sub.cursor_at).first();
  if(!latest)continue;
  try{
   const endpoint=pushEndpoint(sub.endpoint),response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{Authorization:await vapidAuthorization(env,new URL(endpoint).origin),TTL:'300',Urgency:'normal'},signal:AbortSignal.timeout(10000)});
   if(response.status===404||response.status===410)await statement(env,'DELETE FROM push_subscriptions WHERE id=?',sub.id).run();
   else if(response.status===201)await statement(env,'UPDATE push_subscriptions SET cursor_at=? WHERE id=? AND cursor_at=?',latest.created_at,sub.id,sub.cursor_at).run();
  }catch{/* Retry on the next scheduled tick. Never log endpoints or credentials. */}
 }
}
