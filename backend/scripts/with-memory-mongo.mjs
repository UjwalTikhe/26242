/**
 * Local dev without Docker: boots an in-memory MongoDB and then starts the
 * backend (`npm run dev`) pointed at it. Keyless defaults (mock AI + mock OTP).
 *
 *   npm run dev:local            # from the repo root
 *   npm run dev:local -w @sih/backend
 *
 * Use `npm run infra:up` instead when you want a real MongoDB (docker compose).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const mem = await MongoMemoryServer.create({ instance: { dbName: 'sih_rpl' } });
const uri = mem.getUri();
console.log(`[dev:local] in-memory MongoDB at ${uri}`);
console.log('[dev:local] mock AI + mock OTP (code 123456); Ctrl+C to stop.');

const child = spawn('npm', ['run', 'dev'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    MONGO_URI: uri,
    REDIS_URL: '',
    QUEUE_DRIVER: 'inline',
    AI_MODE: 'mock',
    OTP_PROVIDER: 'mock',
    STORAGE_DRIVER: 'local',
  },
});

async function shutdown() {
  child.kill('SIGINT');
  await mem.stop().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
child.on('exit', async (code) => {
  await mem.stop().catch(() => undefined);
  process.exit(code ?? 0);
});