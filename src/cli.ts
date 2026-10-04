#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { Memory } from './memory.js';
import { runMcp } from './mcp.js';
import { runHttp } from './http.js';
import { EmbeddingWorker, OllamaEmbeddingProvider, SQLiteVectorIndex } from './providers.js';

function args(argv: string[]): { command: string; dbPath: string; model: string; dimensions: number; retry: boolean; port: number } {
  const [command = 'help', ...rest] = argv;
  let dbPath: string | undefined;
  let model = 'nomic-embed-text';
  let dimensions = 768;
  let port = 8787;
  let retry = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--retry') { retry = true; continue; }
    if (arg === '--db' || arg === '--model' || arg === '--dimensions' || arg === '--port') {
      const value = rest[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === '--db') dbPath = value;
      if (arg === '--model') model = value;
      if (arg === '--dimensions') dimensions = Number(value);
      if (arg === '--port') port = Number(value);
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    if (dbPath) throw new Error(`Unexpected argument: ${arg}`);
    dbPath = arg;
  }
  if (!Number.isInteger(dimensions) || dimensions < 1) throw new Error('--dimensions must be a positive integer');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be between 0 and 65535');
  return { command, dbPath: dbPath ?? './memory.db', model, dimensions, retry, port };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const { command, dbPath, model, dimensions, retry, port } = args(process.argv.slice(2));
  if (command === 'mcp') {
    await runMcp(dbPath);
    return;
  }
  if (command === 'init') {
    const memory = new Memory(dbPath);
    memory.close();
    process.stdout.write(`Initialized ${dbPath}\n`);
    return;
  }
  if (command === 'serve') {
    const memory = new Memory(dbPath);
    try {
      const { server, url, token } = await runHttp(memory, port);
      process.stdout.write(`Dashboard: ${url}\nToken: ${token}\n`);
      await new Promise<void>((resolve, reject) => {
        const stop = () => server.close(error => error ? reject(error) : resolve());
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        server.once('error', reject);
      });
    } finally {
      memory.close();
    }
    return;
  }
  if (command === 'embed') {
    const memory = new Memory(dbPath);
    try {
      const provider = new OllamaEmbeddingProvider(model, dimensions);
      const index = new SQLiteVectorIndex(memory, dimensions);
      const worker = new EmbeddingWorker(memory, provider, index);
      if (retry) process.stdout.write(`Requeued ${worker.retryFailed()} failed embedding jobs.\n`);
      process.stdout.write(`Queued ${worker.enqueue()} embedding jobs for model ${model}.\n`);
      while (await worker.runOnce() > 0) { /* Drain the local queue. */ }
      const failed = memory.db.prepare("SELECT count(*) AS count FROM jobs WHERE model=? AND state='failed'").get(model) as { count: number };
      process.stdout.write(`Embedding complete; ${failed.count} job(s) failed. Check that Ollama is running and the model is available.\n`);
      if (failed.count > 0) process.exitCode = 1;
    } finally {
      memory.close();
    }
    return;
  }
  if (command === 'demo') {
    const memory = new Memory(dbPath);
    try {
      const now = new Date().toISOString();
      const runId = randomUUID();
      const ids = {
        original: `demo-transfer-${runId}`,
        corrected: `demo-transfer-corrected-${runId}`,
        lia: `entity-lia-${runId}`,
        key: `entity-key-${runId}`,
        mina: `entity-mina-${runId}`,
      };
      const recorded = memory.record({
        space_id: 'demo-project',
        evidence: { source_type: 'demo', content: 'Lia handed the key to someone.' },
        memories: [{
          id: ids.original, kind: 'event', content: 'Lia handed the key to someone.',
          data: { type: 'transfer', giver: ids.lia, receiver: { state: 'unknown' }, object: ids.key },
          occurred_at: now, resolution: 'unresolved', entity_ids: [ids.lia, ids.key],
        }],
        entities: [
          { id: ids.lia, name: 'Lia' }, { id: ids.key, name: 'Key' }, { id: ids.mina, name: 'Mina' },
        ],
      });
      print({ step: 'record with unknown receiver', ...recorded });

      const correction = memory.correct({
        space_id: 'demo-project', memory_id: ids.original,
        evidence: { source_type: 'demo-correction', content: 'Lia handed the key to Mina.' },
        replacement: {
          id: ids.corrected, kind: 'event', content: 'Lia handed the key to Mina.',
          data: { type: 'transfer', giver: ids.lia, receiver: ids.mina, object: ids.key },
          occurred_at: now, resolution: 'resolved', entity_ids: [ids.lia, ids.key, ids.mina],
        },
      });
      print({ step: 'correction', ...correction });

      memory.record({
        space_id: 'another-space', evidence: { source_type: 'demo', content: 'Private memory in another space.' },
        memories: [{ kind: 'note', content: 'Private memory in another space.' }],
      });
      print({ step: 'space-safe recall', result: memory.recall({ space_id: 'demo-project' }) });
      print({ step: 'forget corrected memory', result: memory.forget({ space_id: 'demo-project', memory_id: ids.corrected }) });
      print({ step: 'recall after forget', result: memory.recall({ space_id: 'demo-project' }) });
    } finally {
      memory.close();
    }
    return;
  }
  process.stdout.write('Usage: context-memory <init|demo|mcp|serve|embed> [--db <path>] [--port <port>] [--model <name>] [--dimensions <n>] [--retry]\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
