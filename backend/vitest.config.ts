import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // mongodb-memory-server boots a real mongod per file — keep RAM sane
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      AI_MODE: 'mock',
      QUEUE_DRIVER: 'inline',
      OTP_PROVIDER: 'mock',
      OTP_MOCK_CODE: '123456',
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_DIR: './data/test-storage',
      TUS_UPLOAD_DIR: './data/test-storage/tus',
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    },
  },
});
