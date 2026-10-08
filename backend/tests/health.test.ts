import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('health', () => {
  it('GET /health returns 200 with service info', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('sih26242-rpl-api');
  });

  it('unknown route returns 404 JSON', async () => {
    const res = await request(createApp()).get('/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
