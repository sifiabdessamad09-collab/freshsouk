import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const lines=(await readFile(new URL('docs/admin/source-tree.txt',root),'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
let approved={};
try {approved=JSON.parse(await readFile(new URL('docs/admin/public-sync-blobs.json',root),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(Object.keys(approved).some(name=>!['index.html','redesign.js','sw.js'].includes(name)))throw new Error('Unexpected public integration file.');
let checked=0;
for(const line of lines) {
  const split=line.indexOf(' '),name=line.slice(split+1),expected=approved[name]||line.slice(0,split);
  if(!/^[a-f0-9]{40}$/.test(expected)||!name||name.split('/').includes('..'))throw new Error('Invalid source baseline.');
  const data=await readFile(new URL(name,root));
  const blob=value=>createHash('sha1').update(Buffer.from('blob '+value.length+'\0')).update(value).digest('hex');
  const text=!data.includes(0)&&Buffer.from(data.toString('utf8'),'utf8').equals(data);
  // Git for Windows may expand LF during checkout. Accept only a canonical Git-blob match.
  const canonical=text?Buffer.from(data.toString('utf8').replaceAll('\r\n','\n')):data;
  if(blob(data)!==expected&&blob(canonical)!==expected)throw new Error(`Published source changed: ${name}`);
  checked++;
}
console.log(`Public/legacy source verified: ${checked} blobs, ${Object.keys(approved).length} explicitly approved integration updates; other blobs match original main.`);
