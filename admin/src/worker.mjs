import { requireAdmin, requireSameOrigin, fault } from './auth.mjs';
import { readBody,fields,text,integer,productInput,adminProduct,publicProduct,statement,rows,now,ID,TRANSITIONS } from './domain.mjs';
import { createOrder,listOrders,dashboard,exportOrders } from './orders.mjs';

const SECURITY = {
  'cache-control':'no-store, max-age=0','cdn-cache-control':'no-store','pragma':'no-cache',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY',
  'strict-transport-security':'max-age=31536000',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'"
};
function json(body,status=200,headers={}) { return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}}); }
function secured(response) { const headers=new Headers(response.headers);for(const [k,v]of Object.entries(SECURITY))headers.set(k,v);return new Response(response.body,{status:response.status,headers}); }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request,env) {
    const url=new URL(request.url),path=url.pathname;
    let cors={};
    try {
      if(path==='/api/health'&&request.method==='GET')return secured(json({ok:true}));
      if(path==='/api/catalog'||path==='/api/orders') {
        const origin=request.headers.get('Origin');
        if(origin&&origin!==env.ALLOWED_ORIGIN&&origin!==url.origin)throw fault(403,'Origine refusée.');
        if(origin===env.ALLOWED_ORIGIN)cors={'access-control-allow-origin':origin,'vary':'Origin'};
        if(request.method==='OPTIONS')return secured(new Response(null,{status:204,headers:{...cors,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Content-Type, Idempotency-Key'}}));
        if(path==='/api/catalog'&&request.method==='GET')return secured(json((await rows(statement(env,'SELECT * FROM products WHERE active=1 ORDER BY name_fr'))).map(publicProduct),200,cors));
        if(path==='/api/orders'&&request.method==='POST') {
          if(env.PUBLIC_ORDER_INTAKE_ENABLED!=='true')throw fault(503,'Les commandes en ligne ne sont pas encore activées.');
          if(!origin||!env.ORDER_LIMITER||!env.TURNSTILE_SECRET||!env.TURNSTILE_HOSTNAME)throw fault(503,'Réception des commandes non configurée.');
          if(!(await env.ORDER_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)throw fault(429,'Trop de demandes. Réessayez plus tard.');
          const body=await readBody(request);
          return secured(json({ok:true,order:await createOrder(request,env,body,'customer','website',()=>verifyTurnstile(request,env,body.turnstileToken))},201,cors));
        }
        throw fault(405,'Méthode non autorisée.');
      }
      if(path==='/admin'||path.startsWith('/admin/')||path.startsWith('/api/admin/')) {
        if(path.startsWith('/api/admin/')||!['GET','HEAD'].includes(request.method))requireSameOrigin(request);
        const admin=await requireAdmin(request,env);
        if(path==='/admin'||path==='/admin/'||path==='/admin/index.html') {
          if(request.method!=='GET')throw fault(405,'Méthode non autorisée.');
          return secured(await asset(env,request,'/admin/index.html'));
        }
        if(path==='/admin/app.css'||path==='/admin/app.js'||/^\/admin\/media\/[a-z0-9-]+\.webp$/.test(path)) {
          if(request.method!=='GET')throw fault(405,'Méthode non autorisée.');
          return secured(await asset(env,request,path));
        }
        if(path==='/api/admin/session'&&request.method==='GET')return secured(json({...admin,role:'administrator'}));
        if(path==='/api/admin/dashboard'&&request.method==='GET')return secured(json(await dashboard(env)));
        if(path==='/api/admin/products') {
          if(request.method==='GET') {
            const products=await rows(statement(env,'SELECT * FROM products ORDER BY active DESC,category,name_fr'));
            const images=await (await asset(env,request,'/image-keys.json')).json();
            return secured(json({products:products.map(adminProduct),images}));
          }
          if(request.method==='POST') {
            const p=productInput(await readBody(request),true);
            await verifyImage(env,request,p.imageKey);
            try {
              await statement(env,`INSERT INTO products(id,name_fr,name_ar,category,unit,description_fr,description_ar,price_cents,active,track_stock,stock_milli,low_stock_milli,image_key,updated_at,updated_by,update_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,p.id,p.nameFr,p.nameAr,p.category,p.unit,p.descriptionFr,p.descriptionAr,p.priceCents,p.active,p.trackStock,p.stockMilli,p.lowStockMilli,p.imageKey,now(),admin.email,p.reason).run();
            } catch(error) { if(String(error).includes('UNIQUE constraint'))throw fault(409,'Cet identifiant existe déjà.');throw error; }
            return secured(json({ok:true,id:p.id},201));
          }
        }
        const product=path.match(/^\/api\/admin\/products\/([a-z0-9-]+)$/);
        if(product&&request.method==='PATCH') {
          const p=productInput(await readBody(request));
          if(p.id!==product[1]||!ID.test(p.id))throw fault(400,'Identifiant incohérent.');
          const current=await statement(env,'SELECT unit FROM products WHERE id=?',p.id).first();
          if(!current)throw fault(404,'Produit introuvable.');
          if(current.unit!==p.unit)throw fault(409,'L’unité d’un produit existant ne peut pas être modifiée. Créez une nouvelle référence.');
          await verifyImage(env,request,p.imageKey);
          const result=await statement(env,`UPDATE products SET name_fr=?,name_ar=?,category=?,unit=?,description_fr=?,description_ar=?,price_cents=?,active=?,track_stock=?,stock_milli=?,low_stock_milli=?,image_key=?,version=version+1,updated_at=?,updated_by=?,update_reason=? WHERE id=? AND version=?`,p.nameFr,p.nameAr,p.category,p.unit,p.descriptionFr,p.descriptionAr,p.priceCents,p.active,p.trackStock,p.stockMilli,p.lowStockMilli,p.imageKey,now(),admin.email,p.reason,p.id,p.version).run();
          if(!result.meta.changes)throw fault(409,'Produit modifié par une autre opération. Rechargez avant de réessayer.');
          return secured(json({ok:true,id:p.id,version:p.version+1}));
        }
        if(path==='/api/admin/orders/export.csv'&&request.method==='GET')return secured(new Response(await exportOrders(env,url.searchParams,admin.email),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="freshsouk-commandes.csv"','x-export-limit':'5000'}}));
        if(path==='/api/admin/orders') {
          if(request.method==='GET')return secured(json(await listOrders(env,url.searchParams)));
          if(request.method==='POST')return secured(json({ok:true,order:await createOrder(request,env,await readBody(request),admin.email,'admin')},201));
        }
        const order=path.match(/^\/api\/admin\/orders\/([^/]+)$/);
        if(order&&request.method==='GET') {
          if(!uuid.test(order[1]))throw fault(400,'Identifiant invalide.');
          const data=await statement(env,'SELECT * FROM orders WHERE id=?',order[1]).first();
          if(!data)throw fault(404,'Commande introuvable.');
          const items=await rows(statement(env,'SELECT * FROM order_items WHERE order_id=?',data.id));
          const history=await rows(statement(env,"SELECT action,actor,created_at,details FROM audit_log WHERE entity='order' AND entity_id=? ORDER BY id DESC",data.id));
          return secured(json({order:data,items,history,allowedStatuses:TRANSITIONS[data.status]}));
        }
        const status=path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
        if(status&&request.method==='PATCH') {
          if(!uuid.test(status[1]))throw fault(400,'Identifiant invalide.');
          const body=await readBody(request);fields(body,['status','version']);
          const current=await statement(env,'SELECT status,version FROM orders WHERE id=?',status[1]).first();
          if(!current)throw fault(404,'Commande introuvable.');
          const version=integer(body.version,'version',1);
          if(current.version!==version)throw fault(409,'Commande modifiée. Rechargez avant de réessayer.');
          if(!TRANSITIONS[current.status].includes(body.status))throw fault(409,'Transition de statut interdite.');
          const result=await statement(env,'UPDATE orders SET status=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?',body.status,now(),admin.email,status[1],version).run();
          if(!result.meta.changes)throw fault(409,'Commande modifiée. Rechargez avant de réessayer.');
          return secured(json({ok:true,status:body.status,version:version+1}));
        }
        const history=path.match(/^\/api\/admin\/products\/([a-z0-9-]+)\/history$/);
        if(history&&request.method==='GET')return secured(json({history:await rows(statement(env,"SELECT action,actor,created_at,details FROM audit_log WHERE entity='product' AND entity_id=? ORDER BY id DESC LIMIT 100",history[1]))}));
        throw fault(404,'Ressource introuvable.');
      }
      return secured(json({error:'Ressource introuvable.'},404));
    } catch(error) {
      // Do not log request bodies, tokens, SQL bindings or customer records.
      const status=error.status||500;
      return secured(json({error:status===500?'Une erreur interne est survenue.':error.message},status,cors));
    }
  }
};

async function asset(env,request,path) {
  if(!env.ASSETS)throw fault(503,'Ressources administrateur non configurées.');
  const response=await env.ASSETS.fetch(new Request(new URL(path,request.url),{method:'GET'}));
  if(!response.ok)throw fault(404,'Ressource introuvable.');
  return response;
}
async function verifyImage(env,request,key) {
  const allowed=await (await asset(env,request,'/image-keys.json')).json();
  if(!allowed.includes(key))throw fault(400,'Choisissez une image du catalogue.');
}
async function verifyTurnstile(request,env,token) {
  if(typeof token!=='string'||!token||token.length>2048)throw fault(400,'Vérification anti-abus requise.');
  const body=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token});
  const ip=request.headers.get('CF-Connecting-IP');if(ip)body.set('remoteip',ip);
  let data;
  try {
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body,signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!response.ok)throw new Error();data=await response.json();
  } catch { throw fault(503,'Vérification anti-abus indisponible.'); }
  if(data.success!==true||data.hostname!==env.TURNSTILE_HOSTNAME||data.action!=='freshsouk-order')throw fault(400,'Vérification anti-abus refusée.');
}
