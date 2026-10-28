import {mkdir,copyFile,writeFile,rm,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {sourceCatalog} from './catalog.mjs';
const root=new URL('../.assets/',import.meta.url);
const repository=fileURLToPath(new URL('../../',import.meta.url));
const target=fileURLToPath(root);
if(path.relative(repository,target).replaceAll('\\','/').replace(/\/$/,'')!=='admin/.assets')throw new Error('Refusing to clean outside generated assets.');
try {if((await lstat(target)).isSymbolicLink())throw new Error('Refusing a symlink as generated asset directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
await rm(target,{recursive:true,force:true});
await mkdir(new URL('admin/media/',root),{recursive:true});
for(const name of ['index.html','app.css','app.js'])await copyFile(new URL('../ui/'+name,import.meta.url),new URL('admin/'+name,root));
const products=await sourceCatalog(),keys=[...new Set(['leaf',...products.map(p=>p.imageKey)])].sort();
await writeFile(new URL('image-keys.json',root),JSON.stringify(keys));
for(const key of keys.filter(k=>k!=='leaf'))await copyFile(new URL('../../assets/'+key+'-transparent.webp',import.meta.url),new URL('admin/media/'+key+'.webp',root));
// A neutral leaf icon is rendered by the UI for imageKey=leaf; no photo is invented.
console.log(`Built admin UI and ${keys.length-1} approved images; no database, credentials or test fixtures copied.`);
