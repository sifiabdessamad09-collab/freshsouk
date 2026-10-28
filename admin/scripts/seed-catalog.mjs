import {writeFile} from 'node:fs/promises';
import {sourceCatalog,seedStatements} from './catalog.mjs';
const catalog=await sourceCatalog();
await writeFile(new URL('../db/0002_catalog.sql',import.meta.url),seedStatements(catalog));
console.log(`Prepared ${catalog.length} public catalogue records. Existing database products will not be overwritten.`);
