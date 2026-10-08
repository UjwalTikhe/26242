/**
 * Generates contracts/openapi.json from the Zod route registry.
 * Run: npm run openapi (from repo root). Commit the output.
 *
 * Every schema used by a route (params/query/body/response) is registered in
 * one Zod registry; two passes produce input (request) and output (response)
 * shapes with $refs pointing at #/components/schemas/<name>.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import * as api from '../api.js';
import * as common from '../common.js';
import * as entities from '../entities.js';
import * as enums from '../enums.js';
import * as tradepack from '../tradepack.js';

/* ---------- 1. collect exported named schemas -------------------- */

const modules = [common, enums, tradepack, entities, api];
const named = new Map<string, z.ZodType>();
const bySchema = new Map<z.ZodType, string>();

for (const mod of modules) {
  for (const [name, value] of Object.entries(mod)) {
    if (value instanceof z.ZodType) {
      const existing = named.get(name);
      if (existing && existing !== value) {
        console.warn(`[openapi] name collision, keeping first: ${name}`);
        continue;
      }
      named.set(name, value);
      bySchema.set(value, name);
    }
  }
}

/* ---------- 2. register route-level (possibly anonymous) schemas - */

function opName(route: api.RouteDef): string {
  const clean = route.path
    .replace(/^\/api\/v1/, '')
    .replace(/[/:{}]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join('');
  return route.method + clean.charAt(0).toUpperCase() + clean.slice(1);
}

function ensure(schema: z.ZodType, preferred: string): string {
  const existing = bySchema.get(schema);
  if (existing) return existing;
  let name = preferred;
  let i = 0;
  while (named.has(name)) name = `${preferred}${++i}`;
  named.set(name, schema);
  bySchema.set(schema, name);
  return name;
}

for (const route of api.routes) {
  const name = opName(route);
  if (route.params) ensure(route.params, `${name}Params`);
  if (route.query) ensure(route.query, `${name}Query`);
  if (route.body) ensure(route.body, `${name}Body`);
  ensure(route.response, `${name}Response`);
}

/* ---------- 3. registry passes ----------------------------------- */

const registry = z.registry<{ id: string }>();
for (const [name, schema] of named) registry.add(schema, { id: name });

// ids may embed a sub-pointer ("__shared#/definitions/schema0") — join as a
// proper JSON pointer into the component instead of nesting '#'.
const uri = (id: string) => {
  const hash = id.indexOf('#');
  if (hash === -1) return `#/components/schemas/${id}`;
  return `#/components/schemas/${id.slice(0, hash)}${id.slice(hash + 1)}`;
};
const base = {
  target: 'openapi-3.0',
  reused: 'ref',
  cycles: 'ref',
  unrepresentable: 'any',
  uri,
} as const;

const inputSchemas = z.toJSONSchema(registry, { ...base, io: 'input' }).schemas;
const outputSchemas = z.toJSONSchema(registry, { ...base, io: 'output' }).schemas;

/**
 * Zod builds shared-def refs as `${uri('__shared')}#/definitions/x` — the '#'
 * survives the uri callback and breaks the JSON pointer. Rewrite to a valid
 * pointer into our `__shared` component and drop zod's `$id` echoes.
 */
function postProcess(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(postProcess);
    return;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.$ref === 'string') {
    o.$ref = o.$ref.replace(/^(.+?)#\/definitions\//, '$1/definitions/');
  }
  delete o.$id;
  for (const v of Object.values(o)) postProcess(v);
}
postProcess(inputSchemas);
postProcess(outputSchemas);

/* ---------- 4. build paths --------------------------------------- */

type Json = Record<string, unknown>;
const asJson = (v: unknown): Json => v as Json;

const paths: Record<string, Record<string, Json>> = {};

for (const route of api.routes) {
  const openApiPath = route.path.replace(/:(\w+)/g, '{$1}');
  const op: Json = {
    operationId: opName(route),
    summary: route.summary,
    tags: [route.tag],
    description: route.auth === 'public' ? '**Auth:** public' : `**Auth:** \`${route.auth}\``,
    responses: {},
  };
  if (route.auth !== 'public') op.security = [{ bearerAuth: [] }];

  const params: Json[] = [];

  // path params (always required, taken from the params schema's properties)
  const pathNames = [...route.path.matchAll(/:(\w+)/g)].map((m) => m[1]!);
  if (route.params) {
    const pName = bySchema.get(route.params)!;
    const props = (asJson(inputSchemas[pName]).properties ?? {}) as Record<string, Json>;
    for (const pname of pathNames) {
      params.push({ name: pname, in: 'path', required: true, schema: props[pname] ?? { type: 'string' } });
    }
  } else {
    for (const pname of pathNames) params.push({ name: pname, in: 'path', required: true, schema: { type: 'string' } });
  }

  // query params
  if (route.query) {
    const qName = bySchema.get(route.query)!;
    const qSchema = asJson(inputSchemas[qName]);
    const qProps = (qSchema.properties ?? {}) as Record<string, Json>;
    const qRequired = new Set((qSchema.required as string[]) ?? []);
    for (const [qkey, qschema] of Object.entries(qProps)) {
      params.push({ name: qkey, in: 'query', required: qRequired.has(qkey), schema: qschema });
    }
  }
  if (params.length) op.parameters = params;

  // request body (input shape)
  if (route.body) {
    const bName = bySchema.get(route.body)!;
    op.requestBody = {
      required: route.bodyRequired !== false,
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${bName}` } } },
    };
  }

  // response (output shape)
  const status = route.status ?? 200;
  const rName = bySchema.get(route.response)!;
  (op.responses as Json)[String(status)] = {
    description: route.summary,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${rName}` } } },
  };

  paths[openApiPath] = paths[openApiPath] ?? {};
  paths[openApiPath]![route.method] = op;
}

/* ---------- 5. tus upload protocol (documented supplement) ------- */

const tusAuth = '**Auth:** worker — tus resumable upload protocol. `Upload-Metadata` carries evidence fields (base64 `key value` pairs).';
paths['/api/v1/files'] = {
  post: {
    operationId: 'tusCreateUpload',
    summary: 'tus: create resumable upload',
    tags: ['evidence'],
    description: tusAuth,
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'Upload-Length', in: 'header', required: true, schema: { type: 'integer' } },
      {
        name: 'Upload-Metadata',
        in: 'header',
        required: true,
        schema: {
          type: 'string',
          description:
            'assessmentId, taskId, kind, clientSha256, capturedAt, gps(lat,lng,accuracy), deviceId, language, narrationText…',
        },
      },
    ],
    responses: {
      201: {
        description: 'Upload created',
        headers: {
          Location: { schema: { type: 'string' } },
          'Upload-Offset': { schema: { type: 'integer' } },
        },
      },
    },
  },
};
paths['/api/v1/files/{uploadId}'] = {
  head: {
    operationId: 'tusHeadUpload',
    summary: 'tus: query upload offset/state (resume after connection loss)',
    tags: ['evidence'],
    description: tusAuth,
    security: [{ bearerAuth: [] }],
    parameters: [{ name: 'uploadId', in: 'path', required: true, schema: { type: 'string' } }],
    responses: { 200: { description: 'Current offset and length' } },
  },
  patch: {
    operationId: 'tusPatchUpload',
    summary: 'tus: append chunk',
    tags: ['evidence'],
    description: tusAuth,
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'uploadId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'Upload-Offset', in: 'header', required: true, schema: { type: 'integer' } },
      {
        name: 'Content-Type',
        in: 'header',
        required: true,
        schema: { type: 'string', enum: ['application/offset+octet-stream'] },
      },
    ],
    responses: {
      204: {
        description: 'Chunk accepted',
        headers: { 'Upload-Offset': { schema: { type: 'integer' } } },
      },
    },
  },
};

/* ---------- 6. document ------------------------------------------ */

// components default to output (response) shape; request-body schemas must
// show the input shape (fields with defaults are optional on input).
const bodyNames = new Set<string>();
for (const route of api.routes) if (route.body) bodyNames.add(bySchema.get(route.body)!);
const componentSchemas: Record<string, unknown> = { ...outputSchemas };
for (const name of bodyNames) {
  if (inputSchemas[name]) componentSchemas[name] = inputSchemas[name];
}

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'SIH26242 — AI-Assisted RPL Skill Assessment API',
    version: '1.0.0',
    description: [
      'Single source of truth for the Worker PWA + Assessor portal (Person A) and the backend (Person B).',
      '',
      '**Offline rules:** client-generated UUIDs, `Idempotency-Key` on writes, evidence append-only,',
      'worker data last-write-wins via `version`, assessor/approval fields server-authoritative.',
      '',
      '**State machine:** DRAFT → DECLARED → MAPPED → PLAN_READY → IN_PROGRESS → SUBMITTED → AI_ANALYZED → UNDER_REVIEW → (REVIEWED | REASSESS) → APPROVED / REJECTED.',
    ].join('\n'),
  },
  servers: [{ url: 'http://localhost:4000', description: 'local dev' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: componentSchemas,
  },
  paths,
};

const outFile = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'openapi.json');
writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(
  `[openapi] wrote ${outFile} (${Object.keys(paths).length} paths, ${Object.keys(outputSchemas).length} schemas)`,
);
