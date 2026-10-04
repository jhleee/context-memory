import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Memory } from '../src/memory.js';
import { createHttpServer } from '../src/http.js';
import type { Server } from 'node:http';

let dir: string;
let memory: Memory;
let server: Server;
let base: string;
const token = 'test-token';

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'context-memory-http-'));
  memory = new Memory(join(dir, 'memory.db'));
  server = createHttpServer(memory, { token });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (server.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  memory.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('local HTTP adapter', () => {
  it('serves the operator dashboard without exposing data endpoints', async () => {
    const html = await fetch(base).then((r) => r.text());
    expect(html).toContain('Context Memory');
    expect(html).toContain('접근 토큰');
    const spaces = await fetch(`${base}/api/spaces`).then((r) => r.json());
    expect(spaces).toMatchObject({ error: 'Unauthorized' });
  });

  it('rejects missing credentials, malformed origins, and non-JSON mutations', async () => {
    const denied = await fetch(`${base}/api/spaces`);
    expect(denied.status).toBe(401);
    const badOrigin = await fetch(`${base}/api/spaces`, { headers: { Authorization: `Bearer ${token}`, Origin: 'http://attacker.invalid' } });
    expect(badOrigin.status).toBe(403);
    const malformedOrigin = await fetch(`${base}/api/spaces`, { headers: { Authorization: `Bearer ${token}`, Origin: 'not a URL' } });
    expect(malformedOrigin.status).toBe(403);
    const badContent = await fetch(`${base}/api/record`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: '{}' });
    expect(badContent.status).toBe(415);
    expect(await badContent.json()).toMatchObject({ error: expect.any(String) });
  });

  it('records and recalls through authenticated JSON endpoints', async () => {
    const recorded = await fetch(`${base}/api/record`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: 'http-space', evidence: { source_type: 'test', content: 'operator source' }, memories: [{ kind: 'note', content: 'The HTTP adapter works' }] }),
    });
    expect(recorded.status).toBe(200);
    const recalled = await fetch(`${base}/api/recall`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: 'http-space', query: 'adapter' }),
    });
    expect(recalled.status).toBe(200);
    const result = await recalled.json() as { items: { content: string }[]; sources: { content: string }[] };
    expect(result.items.map((item) => item.content)).toContain('The HTTP adapter works');
    expect(result.sources.map((source) => source.content)).toContain('operator source');
  });
});
