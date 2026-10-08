/**
 * Trade pack loader.
 *
 * Packs are versioned JSON files in `backend/data/trade-packs/` (or
 * `backend/src/data/trade-packs/`), validated against the contract TradePack
 * schema the first time they're read. Invalid packs fail loudly instead of
 * serving half-truths to the assessment pipeline.
 *
 * Packs only change on deploy → cache forever after first successful load.
 */
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TradePack, type TradePack as TradePackT } from '@sih/contracts';
import { notFound } from '../errors.js';
import { logger } from '../logger.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Works from `src/services` (dev/tests) and `dist/services` (deployed). */
function resolvePacksDir(): string {
  const candidates = [
    path.join(HERE, '..', 'data', 'trade-packs'),
    path.join(HERE, '..', '..', 'src', 'data', 'trade-packs'),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error(`trade-packs directory not found; tried: ${candidates.join(', ')}`);
  }
  return found;
}

let cache: Map<string, TradePackT> | null = null;

async function loadAll(): Promise<Map<string, TradePackT>> {
  if (cache) return cache;

  const dir = resolvePacksDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const packs = new Map<string, TradePackT>();

  for (const file of files) {
    const raw = await readFile(path.join(dir, file), 'utf8');
    const pack = TradePack.parse(JSON.parse(raw)); // ZodError → boot/500 with details
    const expected = path.basename(file, '.json');
    if (pack.id !== expected) {
      throw new Error(`trade pack file ${file} declares id "${pack.id}" (must match file name)`);
    }
    packs.set(pack.id, pack);
  }

  if (packs.size === 0) {
    throw new Error(`no trade packs found in ${dir}`);
  }
  logger.info({ dir, packs: [...packs.keys()] }, 'trade packs loaded');
  cache = packs;
  return packs;
}

/** Summary list for GET /api/v1/trades (contract: id, title, aliases, qp). */
export async function listTradePacks(): Promise<
  Array<Pick<TradePackT, 'id' | 'title' | 'aliases' | 'qp'>>
> {
  const packs = await loadAll();
  return [...packs.values()].map(({ id, title, aliases, qp }) => ({ id, title, aliases, qp }));
}

export async function getTradePack(id: string): Promise<TradePackT> {
  const packs = await loadAll();
  const pack = packs.get(id);
  if (!pack) throw notFound(`Unknown trade pack: ${id}`);
  return pack;
}

/** All packs in full — used by NSQF mapping / retrieval. */
export async function getAllTradePacks(): Promise<TradePackT[]> {
  const packs = await loadAll();
  return [...packs.values()];
}

export async function hasTradePack(id: string): Promise<boolean> {
  const packs = await loadAll();
  return packs.has(id);
}

/** Test/reset helper — next access re-reads from disk. */
export function clearTradePackCache(): void {
  cache = null;
}
