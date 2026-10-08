/**
 * Sanity check for contracts/openapi.json: every $ref must resolve.
 * Run: node contracts/scripts/validate-openapi.cjs
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'openapi.json');
const d = JSON.parse(fs.readFileSync(file, 'utf8'));

const refs = [];
(function walk(o, p) {
  if (!o || typeof o !== 'object') return;
  if (o['$ref']) refs.push([p, o['$ref']]);
  for (const k of Object.keys(o)) walk(o[k], p + '/' + k);
})(d, '');

const prefix = '#/components/schemas/';
function resolvePointer(ref) {
  if (!ref.startsWith(prefix)) return undefined;
  const parts = ref.slice(prefix.length).split('/');
  let cur = d.components.schemas;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

const broken = refs.filter(([, r]) => resolvePointer(r) === undefined);
const paths = Object.keys(d.paths || {}).length;
const schemas = Object.keys(d.components.schemas || {}).length;

if (broken.length) {
  console.error(`FAIL: ${broken.length}/${refs.length} broken $refs`);
  for (const [p, r] of broken.slice(0, 10)) console.error(`  ${p} -> ${r}`);
  process.exit(1);
}
console.log(`OK: ${paths} paths, ${schemas} schemas, ${refs.length} refs all resolve`);
