import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

export async function prepareDashboardDeploy() {
  const assets={};
  for(const name of ['index.html','app.css','app.js','app-v2.js','theme.js','push-worker.js']) {
    const type=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8';
    assets['/admin/'+name]={body:await readFile(new URL('../ui/'+name,import.meta.url),'utf8'),type};
  }
  const dir=new URL('../.local/dashboard/',import.meta.url);
  await mkdir(dir,{recursive:true});
  await writeFile(new URL('entry.mjs',dir),`import worker from '../../src/worker.mjs';\nimport {dashboardEnvironment} from '../../src/dashboard-assets.mjs';\nconst assets=${JSON.stringify(assets)};\nexport default {fetch(request,env,ctx){return worker.fetch(request,dashboardEnvironment(env,assets),ctx);},scheduled(event,env,ctx){return worker.scheduled(event,env,ctx);}};\n`);
  await writeFile(new URL('wrangler.toml',dir),'name = "freshsouk-admin-staging"\nmain = "entry.mjs"\ncompatibility_date = "2026-10-28"\nworkers_dev = false\npreview_urls = false\n');
  console.log('Prepared '+fileURLToPath(dir)+'; dry-run compilation only. Existing ASSETS serves catalogue media. Dashboard deployment preserves existing bindings, variables and secrets.');
  return {dir,assets};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await prepareDashboardDeploy();
