import {fault} from './auth.mjs';
import {statement,rows,STATUSES,now} from './domain.mjs';

const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const unavailable=()=>fault(404,'Lien de suivi indisponible. · رابط التتبع ما متوفرش.');
export async function trackingHash(token) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function trackingMetadata(env,id) {
 const link=await statement(env,'SELECT expires_at,revoked_at,version,token_hash IS NOT NULL AS has_token FROM order_tracking WHERE order_id=?',id).first();
 return link?{version:link.version,expiresAt:link.expires_at,active:!!link.has_token&&!link.revoked_at&&link.expires_at>now()}:{version:0,expiresAt:null,active:false};
}
export async function generateTracking(env,id,version,actor) {
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 const token=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const at=now(),expires=new Date(Date.now()+30*86400000).toISOString();
 const existing=await trackingMetadata(env,id);
 if(existing.version!==version)throw fault(409,'Lien modifié. Rechargez les détails de la commande.');
 const result=await statement(env,`INSERT INTO order_tracking(order_id,token_hash,created_at,expires_at,updated_by) VALUES(?,?,?,?,?)
 ON CONFLICT(order_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,revoked_at=NULL,version=order_tracking.version+1,updated_by=excluded.updated_by WHERE order_tracking.version=?
 RETURNING version`,id,await trackingHash(token),at,expires,actor,version).first();
 if(!result)throw fault(409,'Lien modifié. Rechargez les détails de la commande.');
 return {token,expiresAt:expires,version:result.version};
}
export async function revokeTracking(env,id,version,actor) {
 const result=await statement(env,'UPDATE order_tracking SET token_hash=NULL,revoked_at=?,version=version+1,updated_by=? WHERE order_id=? AND version=? RETURNING version',now(),actor,id,version).first();
 if(!result)throw fault(409,'Lien modifié ou absent. Rechargez les détails de la commande.');
 return {active:false,version:result.version};
}
export async function publicTracking(env,token) {
 if(!TOKEN.test(token))throw unavailable();
 const order=await statement(env,`SELECT o.id,o.status,o.created_at,o.updated_at FROM order_tracking t JOIN orders o ON o.id=t.order_id
 WHERE t.token_hash=? AND t.revoked_at IS NULL AND t.expires_at>?`,await trackingHash(token),now()).first();
 if(!order||!STATUSES.includes(order.status))throw unavailable();
 const history=[{status:'pending',at:order.created_at}];
 const changes=await rows(statement(env,"SELECT created_at,details FROM audit_log WHERE entity='order' AND entity_id=? AND action='status' ORDER BY id LIMIT 100",order.id));
 for(const change of changes) {
  let detail;try{detail=JSON.parse(change.details);}catch{continue;}
  if(STATUSES.includes(detail?.from)&&STATUSES.includes(detail?.to)&&Number.isFinite(Date.parse(change.created_at)))history.push({status:detail.to,at:change.created_at});
 }
 return {reference:order.id.slice(0,8).toUpperCase(),status:order.status,createdAt:order.created_at,updatedAt:order.updated_at,history};
}
