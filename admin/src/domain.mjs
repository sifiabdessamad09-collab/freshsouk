import { fault } from './auth.mjs';
export const STATUSES = ['pending','confirmed','preparing','out_for_delivery','delivered','cancelled'];
export const SLOTS = ['09h00 - 12h00','12h00 - 15h00','15h00 - 18h00','18h00 - 21h00'];
export const TRANSITIONS = { pending:['confirmed','cancelled'], confirmed:['preparing','cancelled'], preparing:['out_for_delivery','cancelled'], out_for_delivery:['delivered','cancelled'], delivered:[], cancelled:[] };
export const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export async function readBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json') throw fault(415,'Format JSON requis.');
  if (!request.body) throw fault(400,'Corps JSON requis.');
  const reader = request.body.getReader();
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 32768) { await reader.cancel(); throw fault(413,'Requête trop volumineuse.'); }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size); let offset=0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch { throw fault(400,'JSON invalide.'); }
}
export function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k))) throw fault(400,'Champs non autorisés.');
}
export function text(value, name, min=1, max=160) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw fault(400,`Champ invalide : ${name}.`);
  return value.trim();
}
export function integer(value, name, min=0, max=100000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw fault(400,`Valeur invalide : ${name}.`);
  return value;
}
export function boolean(value, name) { if (typeof value !== 'boolean') throw fault(400,`Valeur invalide : ${name}.`); return Number(value); }
export function milli(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw fault(400,'Quantité invalide.');
  const amount = Math.round(value * 1000), step = unit === 'kg' ? 500 : 1000;
  if (amount <= 0 || amount > 100000 || Math.abs(value * 1000 - amount) > 0.00001 || amount % step) throw fault(400,'Quantité : demi-kilos ou unités entières uniquement.');
  return amount;
}
export function productInput(body, creating=false) {
  fields(body,['id','nameFr','nameAr','category','unit','descriptionFr','descriptionAr','priceCents','active','trackStock','stockMilli','lowStockMilli','imageKey','version','reason']);
  const id = text(body.id,'identifiant',1,80);
  if (!ID.test(id)) throw fault(400,'Identifiant produit invalide.');
  if (!['legumes','fruits','packs'].includes(body.category) || !['kg','botte','unité','pack'].includes(body.unit)) throw fault(400,'Catégorie ou unité invalide.');
  const stock=integer(body.stockMilli,'stock'), threshold=integer(body.lowStockMilli,'seuil');
  const step=body.unit==='kg'?500:1000;
  if (stock%step || threshold%step) throw fault(400,'Stock : demi-kilos ou unités entières uniquement.');
  const key=text(body.imageKey,'image',1,80);
  if (!ID.test(key)) throw fault(400,'Image invalide.');
  return { id,nameFr:text(body.nameFr,'nom français'),nameAr:text(body.nameAr,'nom arabe'),category:body.category,unit:body.unit,
    descriptionFr:text(body.descriptionFr ?? '', 'description française',0,1000), descriptionAr:text(body.descriptionAr ?? '', 'description arabe',0,1000),
    priceCents:integer(body.priceCents,'prix',1,10000000), active:boolean(body.active,'actif'), trackStock:boolean(body.trackStock,'suivi du stock'), stockMilli:stock, lowStockMilli:threshold,imageKey:key,
    version:creating?1:integer(body.version,'version',1),reason:text(body.reason,'motif',3,240) };
}
export function customerInput(body) {
  fields(body,['customer','items','note','turnstileToken']);
  fields(body.customer,['name','phone','city','address','slot']);
  const c=body.customer;
  const phone=text(c.phone,'téléphone',10,20).replace(/[\s-]/g,'');
  if (!/^(0[567][0-9]{8}|\+212[567][0-9]{8})$/.test(phone)) throw fault(400,'Téléphone marocain invalide.');
  if (c.city !== 'Casablanca' || !SLOTS.includes(c.slot)) throw fault(400,'Ville ou créneau invalide.');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 32) throw fault(400,'Produits requis (32 lignes maximum).');
  const seen=new Set();
  const items=body.items.map(line=>{
    fields(line,['productId','quantity']);
    const id=text(line.productId,'produit',1,80);
    if (!ID.test(id)||seen.has(id)) throw fault(400,'Produit invalide ou dupliqué.');
    seen.add(id);
    if (typeof line.quantity!=='number'||!Number.isFinite(line.quantity)) throw fault(400,'Quantité invalide.');
    return {productId:id,quantity:line.quantity};
  }).sort((a,b)=>a.productId.localeCompare(b.productId));
  return {customer:{name:text(c.name,'nom',2),phone,city:c.city,address:text(c.address,'adresse',5,500),slot:c.slot},items,note:text(body.note ?? '', 'note',0,1000)};
}
export const statement = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
export const rows = async statement => (await statement.all()).results || [];
export const now = () => new Date().toISOString();
export async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export function publicProduct(p) {
  const image=p.image_key==='leaf'?'freshsouk-logo.png':`assets/${p.image_key}-transparent.webp`;
  return {id:p.id,nameFr:p.name_fr,nameAr:p.name_ar,category:p.category,unit:p.unit==='kg'?'Kg':p.unit,price:p.price_cents/100,descriptionFr:p.description_fr,descriptionAr:p.description_ar,active:!!p.active,available:!!p.active&&(!p.track_stock||p.stock_milli>0),image:`https://sifiabdessamad09-collab.github.io/freshsouk/${image}`};
}
export function adminProduct(p) { return {...publicProduct(p),unit:p.unit,priceCents:p.price_cents,trackStock:!!p.track_stock,stockMilli:p.stock_milli,lowStockMilli:p.low_stock_milli,imageKey:p.image_key,version:p.version,updatedAt:p.updated_at}; }
export function csvCell(value) {
  let s=String(value??''); if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
