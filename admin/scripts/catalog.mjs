import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
export async function sourceCatalog() {
  const products=JSON.parse(await readFile(new URL('../../products.json',import.meta.url),'utf8'));
  const source=await readFile(new URL('../../redesign.js',import.meta.url),'utf8');
  const context={};
  vm.runInNewContext(source.slice(0,source.indexOf('const fsQoffas'))+';this.map=fsAssetImages;',context,{timeout:1000});
  const map={...context.map,'pack-semaine-familial':'family','pack-couscous-vendredi':'solo','pack-jus-fruits':'fruits'};
  return products.map(p=>({id:p.id,nameFr:p.nameFr,nameAr:p.nameAr,category:p.category,unit:p.unit.toLowerCase()==='kg'?'kg':['botte','pack'].includes(p.unit)?p.unit:'unité',descriptionFr:p.descriptionFr||'',descriptionAr:p.descriptionAr||'',priceCents:Math.round(p.price*100),imageKey:map[p.id]||'leaf'}));
}
export function seedStatements(catalog) {
  const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
  return catalog.map(p=>`INSERT OR IGNORE INTO products(id,name_fr,name_ar,category,unit,description_fr,description_ar,price_cents,image_key,updated_at,updated_by) VALUES(${[p.id,p.nameFr,p.nameAr,p.category,p.unit,p.descriptionFr,p.descriptionAr].map(quote).join(',')},${p.priceCents},${quote(p.imageKey)},'2026-10-28T00:00:00.000Z','catalogue-initial');`).join('\n')+'\n';
}
