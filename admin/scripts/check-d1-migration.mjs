// CI-only local workerd/D1 migration validation. Never accepts remote flags or IDs.
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const admin=fileURLToPath(new URL('../',import.meta.url));
await mkdir(path.join(admin,'.local'),{recursive:true});
const dir=await mkdtemp(path.join(admin,'.local/d1-ci-')),migrations=path.join(dir,'migrations'),config=path.join(dir,'wrangler.toml');
await mkdir(migrations);await writeFile(config,'name = "freshsouk-v2-ci-local"\ncompatibility_date = "2026-10-28"\nworkers_dev = false\npreview_urls = false\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "freshsouk-v2-ci-local"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\nmigrations_dir = "./migrations"\n');
const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(dir,'wrangler.log')};
// Deliberately remove cloud credentials. Every invocation is local and all paths are generated.
for(const key of Object.keys(env))if(/^(CLOUDFLARE|CF)_/.test(key))delete env[key];
function cli(args,json=false){
 const result=spawnSync(process.execPath,['--no-warnings',path.join(admin,'node_modules/wrangler/wrangler-dist/cli.js'),'d1',...args,'--local','--config',config,'--persist-to',path.join(dir,'state'),...(json?['--json']:[])],{cwd:admin,env,encoding:'utf8',input:'y\n',timeout:90000,maxBuffer:16*1024*1024});
 if(result.error)throw result.error;if(result.status!==0)throw Error('Local D1 check failed: '+result.stderr+'\n'+result.stdout);
 return json?JSON.parse(result.stdout):result.stdout;
}
const query=sql=>cli(['execute','DB','--command',sql],true)[0].results;
try{
 for(const name of ['0001_admin.sql','0002_catalog.sql','0003_order_tracking.sql'])await copyFile(path.join(admin,'db',name),path.join(migrations,name));
 cli(['migrations','apply','DB']);
 const id='00000000-0000-4000-8000-000000000001',at='2026-11-05T12:00:00.000Z';
 query("UPDATE products SET track_stock=1,stock_milli=5000,version=version+1,updated_by='ci@freshsouk.invalid',update_reason='CI SYNTHETIC' WHERE id='tomates'");
 query(`INSERT INTO orders(id,idempotency_key,request_hash,created_at,updated_at,customer_name,phone,city,address,delivery_slot,note,subtotal_cents,delivery_cents,total_cents,status,source,updated_by) VALUES('${id}','ci-synthetic-order-key-0001','ci-synthetic-hash','${at}','${at}','TEST CI NE PAS LIVRER','0600000000','Casablanca','Adresse fictive de recette CI','09h00 - 12h00','TEST',1600,2000,3600,'pending','admin','ci@freshsouk.invalid')`);
 query(`INSERT INTO order_items(order_id,product_id,name_fr,name_ar,unit,quantity_milli,unit_price_cents,line_cents,product_version,reserved_stock) SELECT '${id}',id,name_fr,name_ar,unit,2000,price_cents,1600,version,1 FROM products WHERE id='tomates'`);
 query(`INSERT INTO order_tracking(order_id,token_hash,created_at,expires_at,version,updated_by) VALUES('${id}','${'a'.repeat(64)}','${at}','2040-01-01T00:00:00.000Z',1,'ci@freshsouk.invalid')`);
 const tables=['products','orders','order_items','order_tracking','audit_log'];const before=new Map(tables.map(t=>[t,JSON.stringify(query('SELECT * FROM '+t+' ORDER BY 1'))]));
 await copyFile(path.join(admin,'db/0004_admin_v2.sql'),path.join(migrations,'0004_admin_v2.sql'));cli(['migrations','apply','DB']);
 for(const t of tables)assert.equal(JSON.stringify(query('SELECT * FROM '+t+' ORDER BY 1')),before.get(t),t+' changed during D1 migration');
 assert.deepEqual(query('PRAGMA foreign_key_check'),[]);assert.equal(query('SELECT count(*) n FROM d1_migrations')[0].n,4);
 assert.equal(query("SELECT stock_milli FROM products WHERE id='tomates'")[0].stock_milli,3000);
 query(`UPDATE orders SET status='cancelled',version=version+1,updated_by='ci@freshsouk.invalid' WHERE id='${id}'`);
 assert.equal(query("SELECT stock_milli FROM products WHERE id='tomates'")[0].stock_milli,5000);
 assert.equal(query('SELECT delivery_fee_cents,free_threshold_cents FROM admin_settings')[0].delivery_fee_cents,2000);
 console.log('Local workerd/D1: populated migration preserved products, orders, items, tracking, audit and stock; cancellation and defaults PASS. No remote requests or records.');
}finally{
 assert(dir.startsWith(path.join(admin,'.local')+path.sep));await rm(dir,{recursive:true,force:true});
}
