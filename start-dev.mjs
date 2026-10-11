import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
const main = async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;
  const backend = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: 'D:\\SIH Third\\backend',
    env: { ...process.env },
    stdio: 'inherit'
  });
  const frontend = spawn('npx', ['vite', '--port', '5174', '--strictPort'], {
    cwd: 'D:\\SIH Third\\frontend',
    env: { ...process.env },
    stdio: 'inherit'
  });
  backend.on('exit', () => mongod.stop());
  frontend.on('exit', () => { mongod.stop(); process.exit(); });
};
main().catch(err => { console.error(err); process.exit(1); });
