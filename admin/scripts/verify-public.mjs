import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const lines=(await readFile(new URL('docs/admin/source-tree.txt',root),'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
let checked=0;
for(const line of lines) {
  const split=line.indexOf(' '),expected=line.slice(0,split),name=line.slice(split+1);
  if(!/^[a-f0-9]{40}$/.test(expected)||!name||name.split('/').includes('..'))throw new Error('Invalid source baseline.');
  const data=await readFile(new URL(name,root));
  const blob=value=>createHash('sha1').update(Buffer.from('blob '+value.length+'\0')).update(value).digest('hex');
  const text=!data.includes(0)&&Buffer.from(data.toString('utf8'),'utf8').equals(data);
  // Git for Windows may expand LF during checkout. Accept only a canonical Git-blob match.
  const canonical=text?Buffer.from(data.toString('utf8').replaceAll('\r\n','\n')):data;
  if(blob(data)!==expected&&blob(canonical)!==expected)throw new Error(`Published source changed: ${name}`);
  checked++;
}
console.log(`Public/legacy source preserved: ${checked} Git blobs match main@2e1a874f940dbe3b61ecb06b682db68ef6469add (checkout line endings accounted for).`);
