import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';

const emptyId='00000000-0000-0000-0000-000000000000';
export function reviewConfigurations({databaseId=emptyId,liveDatabaseIds=[]}={}){
 assert.match(databaseId,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,'Invalid review D1 identifier');
 assert(!liveDatabaseIds.includes(databaseId),'An existing D1 cannot be used for isolated Admin V2 review');
 const base=(name,main)=>`# Generated review-only template. No deploy has been performed.\nname = "${name}"\nmain = "../../src/${main}"\ncompatibility_date = "2026-10-28"\nworkers_dev = false\npreview_urls = false\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "freshsouk-admin-v2-review"\ndatabase_id = "${databaseId}"\nmigrations_dir = "../../db"\n\n[[ratelimits]]\nname = "ORDER_LIMITER"\nnamespace_id = "2004"\nsimple = { limit = 10, period = 60 }\n\n[observability]\nenabled = false\n`;
 const vars=`\n[vars]\nADMIN_V2_ENABLED = "false"\nSHOP_SYNC_ENABLED = "true"\nORDER_TRACKING_ENABLED = "false"\nPUBLIC_ORDER_INTAKE_ENABLED = "false"\nALLOWED_ORIGIN = "https://review-origin.invalid"\nTURNSTILE_HOSTNAME = "review-origin.invalid"\n`;
 return {
  'wrangler.private.toml':base('freshsouk-admin-v2-review','worker.mjs')+`\n[assets]\ndirectory = "../../.assets"\nbinding = "ASSETS"\nrun_worker_first = true\nhtml_handling = "none"\nnot_found_handling = "none"\n`+vars+`ACCESS_TEAM_DOMAIN = "REPLACE_WITH_REVIEW_TEAM.cloudflareaccess.com"\nACCESS_AUD = "REPLACE_WITH_REVIEW_AUD"\n# ADMIN_EMAILS: exactly the owner, provision only as a Worker secret.\n`,
  'wrangler.public.toml':base('freshsouk-api-v2-review','public-worker.mjs')+vars+'# Do not enable intake before a separate test origin and Turnstile configuration are verified.\n'
 };
}
export async function prepareReview(){
 const databaseId=process.env.REVIEW_DATABASE_ID||emptyId;let liveDatabaseIds=[];
 if(databaseId!==emptyId){
  const audit=JSON.parse(await readFile(new URL('../.local/launch-audit.json',import.meta.url),'utf8'));
  assert(Date.now()-Date.parse(audit.at)<3600000,'Fresh read-only Cloudflare inventory is required');
  assert.equal(audit.databases.status,200,'D1 inventory must be verified');
  const liveWorkers=audit.workers.filter(w=>['freshsouk-admin-staging','freshsouk-shop-api'].includes(w.name));
  assert(liveWorkers.length===2&&liveWorkers.every(w=>w.status===200),'Current Worker bindings must be verified');
  liveDatabaseIds=[...audit.databases.items.filter(d=>d.name!=='freshsouk-admin-v2-review').map(d=>d.uuid),...audit.workers.flatMap(w=>(w.bindings||[]).filter(b=>b.type==='d1').map(b=>b.id))];
 }
 const configs=reviewConfigurations({databaseId,liveDatabaseIds}),dir=new URL('../.local/v2-review/',import.meta.url);await mkdir(dir,{recursive:true});
 for(const [name,text] of Object.entries(configs))await writeFile(new URL(name,dir),text);
 await writeFile(new URL('README.txt',dir),'REVIEW ONLY. Generated locally; not deployed. Build assets first. Both HTTP routes/previews, intake, tracking and V2 activation are OFF. Replace placeholders only after explicit approval, isolated D1 creation and owner-only Access/MFA validation. Never reuse a production D1 or the legacy staging worker. No seed, write query or deployment is executed by this script.\n');
 console.log('Prepared review-only configurations in '+fileURLToPath(dir)+'; no network requests or resource mutations.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await prepareReview();
