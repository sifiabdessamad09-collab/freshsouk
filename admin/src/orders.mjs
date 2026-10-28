import { fault } from './auth.mjs';
import { customerInput,milli,hash,statement,rows,now,STATUSES,csvCell } from './domain.mjs';

export async function createOrder(request, env, body, actor, source, authorizeNew=async()=>{}) {
  const key=request.headers.get('Idempotency-Key')||'';
  if (!/^[a-zA-Z0-9._:-]{20,100}$/.test(key)) throw fault(400,'Clé d’idempotence requise.');
  const input=customerInput(body), fingerprint=await hash(input);
  const existing=await statement(env,'SELECT id,request_hash,status,total_cents FROM orders WHERE idempotency_key=?',key).first();
  if (existing) {
    if (existing.request_hash!==fingerprint) throw fault(409,'Clé déjà utilisée pour une autre demande.');
    return receipt(existing);
  }
  await authorizeNew();
  const catalog=await rows(statement(env,'SELECT * FROM products'));
  const items=input.items.map(line=>{
    const p=catalog.find(p=>p.id===line.productId&&p.active);
    if (!p) throw fault(409,'Un produit est indisponible. Actualisez le catalogue.');
    const amount=milli(line.quantity,p.unit);
    if (p.track_stock && p.stock_milli<amount) throw fault(409,'Stock insuffisant.');
    return {p,amount,lineCents:Math.round(p.price_cents*amount/1000)};
  });
  const subtotal=items.reduce((sum,line)=>sum+line.lineCents,0), delivery=subtotal>=20000?0:2000;
  const id=crypto.randomUUID(), date=now(), c=input.customer;
  const batch=[statement(env,`INSERT INTO orders(id,idempotency_key,request_hash,created_at,updated_at,customer_name,phone,city,address,delivery_slot,note,subtotal_cents,delivery_cents,total_cents,source,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,key,fingerprint,date,date,c.name,c.phone,c.city,c.address,c.slot,input.note,subtotal,delivery,subtotal+delivery,source,actor)];
  for(const {p,amount,lineCents} of items) batch.push(statement(env,`INSERT INTO order_items(order_id,product_id,name_fr,name_ar,unit,quantity_milli,unit_price_cents,line_cents,product_version,reserved_stock) VALUES(?,?,?,?,?,?,?,?,?,?)`,id,p.id,p.name_fr,p.name_ar,p.unit,amount,p.price_cents,lineCents,p.version,p.track_stock));
  try { await env.DB.batch(batch); }
  catch(error) {
    const winner=await statement(env,'SELECT id,request_hash,status,total_cents FROM orders WHERE idempotency_key=?',key).first();
    if(winner?.request_hash===fingerprint)return receipt(winner);
    if (/CATALOG_CHANGED|INSUFFICIENT_STOCK|UNIQUE constraint failed: orders.idempotency_key/.test(String(error))) throw fault(409,'Catalogue ou stock modifié. Actualisez puis réessayez.');
    throw error;
  }
  return {id,status:'pending',totalCents:subtotal+delivery};
}
function receipt(order) { return {id:order.id,status:order.status,totalCents:order.total_cents}; }

const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'});
const wallFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function dayStart(day) {
  const parsed=Date.parse(day+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(parsed)||+day.slice(0,4)<2020||+day.slice(0,4)>2100||new Date(parsed).toISOString().slice(0,10)!==day)throw fault(400,'Date invalide.');
  let value=Date.parse(day+'T00:00:00Z');
  const target=value;
  for(let i=0;i<2;i++) {
    const p=Object.fromEntries(wallFormat.formatToParts(new Date(value)).map(p=>[p.type,p.value]));
    value += target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  }
  return new Date(value).toISOString();
}
function nextDay(day) { const d=new Date(day+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); }
export function filters(params) {
  const status=params.get('status'),from=params.get('from'),to=params.get('to'),q=(params.get('q')||'').trim();
  if(status&&!STATUSES.includes(status)||q.length>100)throw fault(400,'Filtre invalide.');
  const where=['1=1'],args=[];
  if(status){where.push('status=?');args.push(status);}
  if(from){where.push('created_at>=?');args.push(dayStart(from));}
  if(to){where.push('created_at<?');dayStart(to);args.push(dayStart(nextDay(to)));}
  if(from&&to&&from>to)throw fault(400,'Intervalle de dates invalide.');
  if(q){where.push("(customer_name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')");args.push(...Array(3).fill('%'+q.replace(/[\\%_]/g,'\\$&')+'%'));}
  return {clause:where.join(' AND '),args};
}
export async function listOrders(env,params) {
  const {clause,args}=filters(params);
  const page=Number(params.get('page')||1);
  if(!Number.isInteger(page)||page<1||page>100000)throw fault(400,'Page invalide.');
  const count=await statement(env,`SELECT count(*) AS total FROM orders WHERE ${clause}`,...args).first();
  const orders=await rows(statement(env,`SELECT id,created_at,customer_name,phone,city,delivery_slot,total_cents,status,version,source FROM orders WHERE ${clause} ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?`,...args,(page-1)*25));
  return {orders,total:count.total,page,pageSize:25};
}
export async function dashboard(env) {
  const counts=await rows(statement(env,'SELECT status,count(*) AS count FROM orders GROUP BY status'));
  const sales=await statement(env,"SELECT coalesce(sum(total_cents),0) AS revenue,coalesce(round(avg(total_cents)),0) AS average FROM orders WHERE status='delivered'").first();
  const day=dayFormat.format(new Date()),today=await statement(env,'SELECT count(*) AS count FROM orders WHERE created_at>=? AND created_at<?',dayStart(day),dayStart(nextDay(day))).first();
  const inventory=await statement(env,'SELECT count(*) AS products,sum(CASE WHEN active=1 AND track_stock=1 AND stock_milli<=low_stock_milli THEN 1 ELSE 0 END) AS lowStock FROM products').first();
  const popular=await rows(statement(env,"SELECT i.name_fr AS name,sum(i.quantity_milli)/1000.0 AS quantity,i.unit FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status='delivered' GROUP BY i.product_id,i.unit ORDER BY sum(i.quantity_milli) DESC LIMIT 5"));
  return {today:today.count,statuses:Object.fromEntries(STATUSES.map(s=>[s,counts.find(c=>c.status===s)?.count||0])),revenueCents:sales.revenue,averageCents:sales.average,products:inventory.products,lowStock:inventory.lowStock||0,popular,timezone:'Africa/Casablanca',generatedAt:now()};
}
export async function exportOrders(env,params,actor) {
  const {clause,args}=filters(params);
  const data=await rows(statement(env,`SELECT id,created_at,customer_name,phone,city,address,delivery_slot,subtotal_cents,delivery_cents,total_cents,status,note FROM orders WHERE ${clause} ORDER BY created_at DESC LIMIT 5000`,...args));
  const names=['id','created_at','customer_name','phone','city','address','delivery_slot','subtotal_cents','delivery_cents','total_cents','status','note'];
  const csv='\uFEFF'+[names.map(csvCell).join(','),...data.map(row=>names.map(name=>csvCell(row[name])).join(','))].join('\r\n');
  await statement(env,"INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('orders','export','csv',?,?,?)",actor,now(),JSON.stringify({rows:data.length,limit:5000})).run();
  return csv;
}
