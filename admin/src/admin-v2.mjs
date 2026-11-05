import {fault} from './auth.mjs';
import {statement,rows,now,readBody,fields,text,integer,hash,csvCell,STATUSES,ID} from './domain.mjs';
import {dayStart,filters} from './orders.mjs';

import {shippingSettings,ZONES} from './shipping.mjs';
const json=(value,status=200)=>Response.json(value,{status});
const canonicalPhone=value=>String(value).replace(/^\+212/,'0');
const phoneSQL="CASE WHEN phone LIKE '+212%' THEN '0'||substr(phone,5) ELSE phone END";
const optionalCost=(value,name)=>value===null?null:integer(value,name,0,100000000);
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'});
export const localDay=value=>dayFormatter.format(new Date(value));
export function nextDay(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function period(params){
 const to=params.get('to')||localDay(new Date()),from=params.get('from')||to.slice(0,7)+'-01';
 dayStart(from);dayStart(to);
 if(from>to||(Date.parse(to)-Date.parse(from))/86400000>365)throw fault(400,'Choisissez une période de 366 jours maximum.');
 return {from,to,start:dayStart(from),end:dayStart(nextDay(to))};
}
async function audit(env,entity,id,action,actor,details={}){await statement(env,'INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES(?,?,?,?,?,?)',entity,id,action,actor,now(),JSON.stringify(details)).run();}
function page(params){const p=Number(params.get('page')||1);return integer(p,'page',1,100000);}
function search(params){const q=text(params.get('q')||'','recherche',0,100);return '%'+q.replace(/[\\%_]/g,'\\$&')+'%';}
function changed(result){if(!result.meta.changes)throw fault(409,'Données modifiées par une autre opération. Actualisez avant de réessayer.');}

export async function analytics(env,params){
 const range=period(params);
 const orders=await rows(statement(env,`SELECT o.id,o.created_at,o.updated_at,o.status,o.city,o.subtotal_cents,o.delivery_cents,o.total_cents,
 p.goods_cost_cents,p.delivery_cost_cents,c.known_lines,c.item_lines,c.snapshot_goods
 FROM orders o LEFT JOIN order_operations p ON p.order_id=o.id
 LEFT JOIN (SELECT i.order_id,count(*) item_lines,count(c.unit_cost_cents) known_lines,
 sum(CASE WHEN c.unit_cost_cents IS NOT NULL THEN round(i.quantity_milli*c.unit_cost_cents/1000.0) ELSE 0 END) snapshot_goods
 FROM order_items i LEFT JOIN order_item_costs c ON c.order_id=i.order_id AND c.product_id=i.product_id GROUP BY i.order_id) c ON c.order_id=o.id
 WHERE o.created_at>=? AND o.created_at<? ORDER BY o.created_at,o.id LIMIT 5001`,range.start,range.end));
 if(orders.length>5000)throw fault(422,'Plus de 5 000 commandes : réduisez la période du rapport.');
 const daily=new Map(),zoneMap=new Map(),counts=Object.fromEntries(STATUSES.map(s=>[s,0]));
 let revenue=0,goods=0,deliveryCost=0,deliveryCharged=0,delivered=0,missingGoods=0,missingDelivery=0;
 for(const o of orders){
  counts[o.status]++;const day=localDay(o.created_at),d=daily.get(day)||{day,orders:0,delivered:0,revenueCents:0};d.orders++;
  const z=zoneMap.get(o.city)||{zone:o.city,orders:0,delivered:0,revenueCents:0};z.orders++;
  if(o.status==='delivered'){
   delivered++;revenue+=o.total_cents;deliveryCharged+=o.delivery_cents;d.delivered++;d.revenueCents+=o.total_cents;z.delivered++;z.revenueCents+=o.total_cents;
   const cost=o.goods_cost_cents??(o.item_lines>0&&o.known_lines===o.item_lines?o.snapshot_goods:null);
   if(cost===null)missingGoods++;else goods+=cost;
   if(o.delivery_cost_cents===null)missingDelivery++;else deliveryCost+=o.delivery_cost_cents;
  }
  daily.set(day,d);zoneMap.set(o.city,z);
 }
 const items=await rows(statement(env,`SELECT i.product_id id,i.name_fr name,i.unit,p.category,sum(i.quantity_milli) quantityMilli,sum(i.line_cents) revenueCents
 FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id
 WHERE o.status='delivered' AND o.created_at>=? AND o.created_at<? GROUP BY i.product_id,i.unit ORDER BY revenueCents DESC`,range.start,range.end));
 const categoryMap=new Map();for(const p of items){const c=categoryMap.get(p.category)||{category:p.category,revenueCents:0};c.revenueCents+=p.revenueCents;categoryMap.set(c.category,c);}
 const expenses=await rows(statement(env,'SELECT id,spent_on,label,amount_cents,created_at FROM expenses WHERE spent_on>=? AND spent_on<=? ORDER BY spent_on DESC,id DESC LIMIT 1001',range.from,range.to));
 if(expenses.length>1000)throw fault(422,'Plus de 1 000 dépenses : réduisez la période.');
 const expenseCents=expenses.reduce((s,x)=>s+x.amount_cents,0),today=localDay(new Date());
 const current=await statement(env,`SELECT coalesce(sum(CASE WHEN updated_at>=? THEN total_cents ELSE 0 END),0) day,
 coalesce(sum(total_cents),0) month FROM orders WHERE status='delivered' AND updated_at>=? AND updated_at<?`,dayStart(today),dayStart(today.slice(0,7)+'-01'),dayStart(nextDay(today))).first();
 return {range:{from:range.from,to:range.to,basis:'order_created_at',timezone:'Africa/Casablanca'},counts,totalOrders:orders.length,delivered,
 revenueCents:revenue,averageCents:delivered?Math.round(revenue/delivered):0,deliveryChargedCents:deliveryCharged,
 knownGoodsCostCents:goods,knownDeliveryCostCents:deliveryCost,missingGoodsOrders:missingGoods,missingDeliveryOrders:missingDelivery,
 grossMarginCents:missingGoods?null:revenue-deliveryCharged-goods,resultCents:missingGoods||missingDelivery?null:revenue-goods-deliveryCost-expenseCents,
 expenseCents,expenses,daily:[...daily.values()],zones:[...zoneMap.values()],products:items,categories:[...categoryMap.values()],
 currentRevenue:{dayCents:current.day,monthCents:current.month,basis:'delivered_status_updated_at'},generatedAt:now()};
}
async function customers(env,params){
 const p=page(params),q=search(params);
 const query=`WITH c AS (SELECT *,${phoneSQL} phone_key,row_number() OVER(PARTITION BY ${phoneSQL} ORDER BY created_at DESC,id DESC) rn FROM orders),
 grouped AS (SELECT phone_key phone,max(CASE WHEN rn=1 THEN customer_name END) name,count(*) orders,
 sum(CASE WHEN status='delivered' THEN total_cents ELSE 0 END) deliveredSpendCents,max(created_at) lastOrderAt FROM c GROUP BY phone_key)
 SELECT * FROM grouped WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'`;
 const count=await statement(env,'SELECT count(*) total FROM ('+query+')',q,q).first();
 return {customers:await rows(statement(env,query+' ORDER BY lastOrderAt DESC,phone LIMIT 25 OFFSET ?',q,q,(p-1)*25)),total:count.total,page:p,pageSize:25};
}
async function notices(env,owner){
 const recent=await rows(statement(env,"SELECT id,status,created_at FROM orders ORDER BY created_at DESC,id DESC LIMIT 50"));
 const pending=await rows(statement(env,"SELECT id,status,created_at FROM orders WHERE status='pending' ORDER BY created_at DESC,id DESC LIMIT 50"));
 const stock=await rows(statement(env,'SELECT id,name_fr,version,updated_at FROM products WHERE active=1 AND track_stock=1 AND stock_milli<=low_stock_milli ORDER BY updated_at DESC LIMIT 50'));
 const reads=new Set((await rows(statement(env,'SELECT notification_id FROM notification_reads WHERE owner=?',owner))).map(x=>x.notification_id));
 const list=[...pending.map(o=>({id:'pending:'+o.id,type:'pending',title:'À confirmer · خاص التأكيد #'+o.id.slice(0,8).toUpperCase(),at:o.created_at,route:'orders',orderId:o.id})),
 ...recent.map(o=>({id:'order:'+o.id,type:'new',title:'Commande reçue · طلب تسجّل #'+o.id.slice(0,8).toUpperCase(),at:o.created_at,route:'orders',orderId:o.id})),
 ...stock.map(p=>({id:'stock:'+p.id+':'+p.version,type:'stock',title:'Stock à vérifier · راجع المخزون : '+p.name_fr,at:p.updated_at,route:'products'}))];
 const pendingCount=(await statement(env,"SELECT count(*) total FROM orders WHERE status='pending'").first()).total;
 const notifications=list.slice(0,150).map(n=>({...n,read:reads.has(n.id)}));return {notifications,pendingCount,unread:notifications.filter(n=>!n.read).length,scope:'50 latest orders, 50 pending, 50 stock alerts; while admin is open'};
}

export async function v2Route(request,env,admin,url){
 if(env.ADMIN_V2_ENABLED!=='true')throw fault(404,'Admin V2 non activé.');
 const settings=await shippingSettings(env),path=url.pathname.replace('/api/admin/v2/',''),method=request.method;
 if(path==='analytics'&&method==='GET')return json(await analytics(env,url.searchParams));
 if(path==='settings'){
  if(method==='GET')return json({...settings,availableZones:ZONES});
  if(method==='PATCH'){
   const body=await readBody(request);fields(body,['version','deliveryFeeCents','freeThresholdCents','zones']);
   const version=integer(body.version,'version',1),fee=integer(body.deliveryFeeCents,'frais',0,100000),threshold=integer(body.freeThresholdCents,'seuil',1,100000000);
   if(!Array.isArray(body.zones)||!body.zones.length||body.zones.length>3||new Set(body.zones).size!==body.zones.length||body.zones.some(z=>!ZONES.includes(z)))throw fault(400,'Zones invalides.');
   changed(await statement(env,'UPDATE admin_settings SET delivery_fee_cents=?,free_threshold_cents=?,zones=?,version=version+1,updated_at=?,updated_by=? WHERE id=1 AND version=?',fee,threshold,JSON.stringify(body.zones),now(),admin.email,version).run());
   return json({ok:true,version:version+1});
  }
 }
 if(path==='product-costs'&&method==='GET')return json({costs:await rows(statement(env,'SELECT product_id,unit_cost_cents,version FROM product_costs'))});
 const cost=path.match(/^product-costs\/([a-z0-9-]+)$/);
 if(cost&&method==='PATCH'){
  if(!ID.test(cost[1])||!await statement(env,'SELECT id FROM products WHERE id=?',cost[1]).first())throw fault(404,'Produit introuvable.');
  const b=await readBody(request);fields(b,['version','unitCostCents']);const version=integer(b.version,'version',0),value=optionalCost(b.unitCostCents,'coût unitaire');
  if(value!==null&&value>10000000)throw fault(400,'Coût trop élevé.');
  changed(version===0?await statement(env,'INSERT OR IGNORE INTO product_costs(product_id,unit_cost_cents,updated_at,updated_by) VALUES(?,?,?,?)',cost[1],value,now(),admin.email).run():await statement(env,'UPDATE product_costs SET unit_cost_cents=?,version=version+1,updated_at=?,updated_by=? WHERE product_id=? AND version=?',value,now(),admin.email,cost[1],version).run());
  return json({ok:true});
 }
 const ops=path.match(/^orders\/([0-9a-f-]{36})\/operations$/i);
 if(ops){
  if(!await statement(env,'SELECT id FROM orders WHERE id=?',ops[1]).first())throw fault(404,'Commande introuvable.');
  if(method==='GET')return json({operations:await statement(env,'SELECT * FROM order_operations WHERE order_id=?',ops[1]).first(),history:await rows(statement(env,"SELECT action,actor,created_at,details FROM audit_log WHERE entity='order_operations' AND entity_id=? ORDER BY id DESC LIMIT 100",ops[1]))});
  if(method==='PATCH'){
   const b=await readBody(request);fields(b,['version','neighborhood','courier','internalNote','goodsCostCents','deliveryCostCents']);
   const v=integer(b.version,'version',0),n=text(b.neighborhood,'quartier',0,160),c=text(b.courier,'livreur',0,160),note=text(b.internalNote,'note interne',0,2000),g=optionalCost(b.goodsCostCents,'coût marchandises'),d=optionalCost(b.deliveryCostCents,'coût livraison');
   const result=v===0?await statement(env,'INSERT OR IGNORE INTO order_operations(order_id,neighborhood,courier,internal_note,goods_cost_cents,delivery_cost_cents,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)',ops[1],n,c,note,g,d,now(),admin.email).run():await statement(env,'UPDATE order_operations SET neighborhood=?,courier=?,internal_note=?,goods_cost_cents=?,delivery_cost_cents=?,version=version+1,updated_at=?,updated_by=? WHERE order_id=? AND version=?',n,c,note,g,d,now(),admin.email,ops[1],v).run();
   changed(result);return json({ok:true,version:v+1});
  }
 }
 if(path==='clients'&&method==='GET')return json(await customers(env,url.searchParams));
 const customer=path.match(/^clients\/(0[567][0-9]{8})$/);
 if(customer){
  const phone=canonicalPhone(customer[1]),exists=await statement(env,`SELECT id FROM orders WHERE ${phoneSQL}=? LIMIT 1`,phone).first();if(!exists)throw fault(404,'Client introuvable.');
  if(method==='GET'){const p=page(url.searchParams);return json({phone,total:(await statement(env,`SELECT count(*) total FROM orders WHERE ${phoneSQL}=?`,phone).first()).total,note:await statement(env,'SELECT note,version FROM customer_notes WHERE phone=?',phone).first(),orders:await rows(statement(env,`SELECT id,created_at,status,total_cents,customer_name FROM orders WHERE ${phoneSQL}=? ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?`,phone,(p-1)*25)),page:p,pageSize:25});}
  if(method==='PATCH'){
   const b=await readBody(request);fields(b,['version','note']);const v=integer(b.version,'version',0),note=text(b.note,'note',0,2000);
   changed(v===0?await statement(env,'INSERT OR IGNORE INTO customer_notes(phone,note,updated_at,updated_by) VALUES(?,?,?,?)',phone,note,now(),admin.email).run():await statement(env,'UPDATE customer_notes SET note=?,version=version+1,updated_at=?,updated_by=? WHERE phone=? AND version=?',note,now(),admin.email,phone,v).run());return json({ok:true,version:v+1});
  }
 }
 if(path==='deliveries'&&method==='GET'){
  const {clause,args}=filters(url.searchParams),p=page(url.searchParams),count=await statement(env,`SELECT count(*) total FROM orders WHERE ${clause}`,...args).first();
  return json({orders:await rows(statement(env,`SELECT o.id,o.created_at,o.customer_name,o.phone,o.city,o.address,o.delivery_slot,o.status,o.total_cents,o.delivery_cents,p.courier,p.neighborhood,p.delivery_cost_cents FROM orders o LEFT JOIN order_operations p ON p.order_id=o.id WHERE ${clause} ORDER BY o.created_at DESC,o.id DESC LIMIT 25 OFFSET ?`,...args,(p-1)*25)),total:count.total,page:p,pageSize:25});
 }
 if(path==='expenses'&&method==='POST'){
  const key=request.headers.get('Idempotency-Key')||'';if(!/^[a-zA-Z0-9._:-]{20,100}$/.test(key))throw fault(400,'Clé d’idempotence requise.');
  const b=await readBody(request);fields(b,['label','spentOn','amountCents']);const input={label:text(b.label,'libellé',2,240),spentOn:text(b.spentOn,'date',10,10),amountCents:integer(b.amountCents,'montant',1,100000000)};dayStart(input.spentOn);
  const fingerprint=await hash(input),id=crypto.randomUUID();await statement(env,'INSERT OR IGNORE INTO expenses(id,idempotency_key,request_hash,label,spent_on,amount_cents,created_at,actor) VALUES(?,?,?,?,?,?,?,?)',id,key,fingerprint,input.label,input.spentOn,input.amountCents,now(),admin.email).run();
  const stored=await statement(env,'SELECT id,request_hash FROM expenses WHERE idempotency_key=?',key).first();if(stored.request_hash!==fingerprint)throw fault(409,'Clé déjà utilisée pour une autre dépense.');return json({ok:true,id:stored.id},201);
 }
 if(path==='notifications'&&method==='GET')return json(await notices(env,admin.email));
 if(path==='notifications/read'&&method==='POST'){
  const b=await readBody(request);fields(b,['id']);const id=text(b.id,'notification',1,160),list=await notices(env,admin.email);
  if(!list.notifications.some(n=>n.id===id))throw fault(404,'Notification introuvable.');
  await statement(env,'INSERT OR IGNORE INTO notification_reads(owner,notification_id,read_at) VALUES(?,?,?)',admin.email,id,now()).run();return json({ok:true});
 }
 if(path==='reports.csv'&&method==='GET'){
  const report=await analytics(env,url.searchParams),kind=url.searchParams.get('kind')||'daily';let data,columns;
  if(['daily','weekly','monthly'].includes(kind)){
   const groups=new Map();for(const row of report.daily){let key=row.day;if(kind==='monthly')key=key.slice(0,7);if(kind==='weekly'){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));key=d.toISOString().slice(0,10);}const g=groups.get(key)||{period:key,orders:0,delivered:0,revenueCents:0};for(const k of ['orders','delivered','revenueCents'])g[k]+=row[k];groups.set(key,g);}data=[...groups.values()];columns=['period','orders','delivered','revenueCents'];
  }else if(kind==='products'){data=report.products;columns=['id','name','unit','quantityMilli','revenueCents'];}
  else if(kind==='categories'){data=report.categories;columns=['category','revenueCents'];}
  else if(kind==='zones'){data=report.zones;columns=['zone','orders','delivered','revenueCents'];}
  else throw fault(400,'Rapport invalide.');
  await audit(env,'reports',kind,'csv',admin.email,{from:report.range.from,to:report.range.to,rows:data.length,basis:report.range.basis});
  return new Response('\uFEFF'+[columns.map(csvCell).join(','),...data.map(r=>columns.map(c=>csvCell(r[c])).join(','))].join('\r\n'),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="freshsouk-rapport.csv"'}});
 }
 throw fault(404,'Ressource V2 introuvable.');
}
