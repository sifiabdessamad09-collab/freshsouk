import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewConfigurations} from '../scripts/prepare-v2-review.mjs';

test('review configurations remain unexposed, share only a separate D1 and refuse existing database identifiers',()=>{
 const id='00000000-0000-0000-0000-000000000001';
 const configs=reviewConfigurations({databaseId:id});assert.equal(Object.keys(configs).length,2);
 for(const text of Object.values(configs)){
  assert.match(text,new RegExp('database_id = "'+id+'"'));assert.match(text,/database_name = "freshsouk-admin-v2-review"/);
  for(const key of ['workers_dev','preview_urls'])assert.match(text,new RegExp(key+' = false'));
  for(const key of ['ADMIN_V2_ENABLED','PUBLIC_ORDER_INTAKE_ENABLED','ORDER_TRACKING_ENABLED'])assert.match(text,new RegExp(key+' = "false"'));
  assert(!text.includes('freshsouk-admin-staging'));assert(!text.includes('secret ='));assert(!text.includes('admin@'));
 }
 assert(!configs['wrangler.public.toml'].includes('[assets]'));assert.match(configs['wrangler.private.toml'],/run_worker_first = true/);
 assert.throws(()=>reviewConfigurations({databaseId:id,liveDatabaseIds:[id]}),/existing D1/);
 assert.throws(()=>reviewConfigurations({databaseId:'bad"\nworkers_dev=true'}));
});
