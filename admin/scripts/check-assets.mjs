import {readdir,readFile} from 'node:fs/promises';
const root=new URL('../.assets/',import.meta.url),keys=JSON.parse(await readFile(new URL('image-keys.json',root),'utf8'));
const expected=new Set(['image-keys.json','admin/index.html','admin/app.js','admin/app.css',...keys.filter(k=>k!=='leaf').map(k=>'admin/media/'+k+'.webp')]);
async function walk(dir,prefix=''){
  for(const item of await readdir(dir,{withFileTypes:true})){
    const relative=prefix+item.name;
    if(item.isSymbolicLink())throw new Error('Asset symlink refused.');
    if(item.isDirectory())await walk(new URL(item.name+'/',dir),relative+'/');
    else if(!expected.delete(relative))throw new Error('Unexpected asset: '+relative);
  }
}
await walk(root);
if(expected.size)throw new Error('Missing assets: '+[...expected].join(', '));
console.log('Asset allowlist passed: UI and approved product images only. No database, server source, test fixtures or environment files.');
