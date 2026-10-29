import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {sourceCatalog,seedStatements} from '../scripts/catalog.mjs';
import worker from '../src/worker.mjs';

export const TEAM='freshsouk-tests.cloudflareaccess.com',AUD='freshsouk-test-audience',EMAIL='admin@freshsouk.invalid';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
export const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'unit-test-key',alg:'RS256',use:'sig'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
export async function token(overrides={},header={}) {
  const time=Math.floor(Date.now()/1000);
  const head=encode({alg:'RS256',typ:'JWT',kid:jwk.kid,...header});
  const payload=encode({iss:`https://${TEAM}`,aud:[AUD],type:'app',sub:'test-admin',email:EMAIL,iat:time,nbf:time-1,exp:time+3600,...overrides});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(head+'.'+payload));
  return head+'.'+payload+'.'+Buffer.from(signature).toString('base64url');
}
export function sqliteAdapter(db) {
  return {
    prepare(sql) {
      const stmt=db.prepare(sql);let values=[];
      return {
        bind(...args){values=args;return this;},
        async first(){return stmt.get(...values)||null;},
        async all(){return {results:stmt.all(...values)};},
        _run(){const r=stmt.run(...values);return {success:true,meta:{changes:Number(r.changes)}};},
        async run(){return this._run();}
      };
    },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {const results=statements.map(s=>s._run());db.exec('COMMIT');return results;}
      catch(e){db.exec('ROLLBACK');throw e;}
    }
  };
}
export async function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../db/0001_admin.sql',import.meta.url),'utf8'));
  db.exec(await readFile(new URL('../db/0003_order_tracking.sql',import.meta.url),'utf8'));
  const catalog=await sourceCatalog();db.exec(seedStatements(catalog));
  const env={DB:sqliteAdapter(db),ACCESS_TEAM_DOMAIN:TEAM,ACCESS_AUD:AUD,ADMIN_EMAILS:EMAIL,
    ALLOWED_ORIGIN:'https://sifiabdessamad09-collab.github.io',PUBLIC_ORDER_INTAKE_ENABLED:'false',
    ASSETS:{async fetch(request){return new URL(request.url).pathname==='/image-keys.json'?Response.json(['leaf',...new Set(catalog.map(p=>p.imageKey))]):new Response('<html>Private application</html>',{headers:{'content-type':'text/html'}});}}
  };
  const jwt=await token();
  async function request(path,options={}) {
    const {body,auth=true,headers={},method=body?'POST':'GET'}=options;
    return worker.fetch(new Request('https://admin.freshsouk.invalid'+path,{method,headers:{...(auth?{'Cf-Access-Jwt-Assertion':jwt}:{}),...(body?{'Content-Type':'application/json','X-Freshsouk-Admin':'1',Origin:'https://admin.freshsouk.invalid'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
  }
  return {db,env,request,catalog,jwt};
}
export const orderBody={customer:{name:'Client fictif',phone:'0600000000',city:'Casablanca',address:'Adresse de démonstration',slot:'09h00 - 12h00'},items:[{productId:'tomates',quantity:2}],note:''};
export const productBody=p=>({id:p.id,nameFr:p.name_fr,nameAr:p.name_ar,category:p.category,unit:p.unit,descriptionFr:p.description_fr,descriptionAr:p.description_ar,priceCents:p.price_cents,active:!!p.active,trackStock:!!p.track_stock,stockMilli:p.stock_milli,lowStockMilli:p.low_stock_milli,imageKey:p.image_key,version:p.version,reason:'Ajustement de test'});
