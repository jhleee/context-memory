import { createHash } from 'node:crypto';
import type { Memory } from './memory.js';
import type { EmbeddingProvider, VectorIndex, DecisionProvider, DecisionCandidate, DecisionSuggestion, QueryInput, RecallResult } from './types.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function validateVector(vector: number[], dimensions: number) {
  if (vector.length !== dimensions || vector.some(v => !Number.isFinite(v)) || !vector.some(v => v !== 0)) throw new Error('Invalid embedding vector');
}

/** Exact local cosine search; intended for small databases, replaceable with sqlite-vec. */
export class SQLiteVectorIndex implements VectorIndex {
  constructor(private memory: Memory, readonly dimensions: number) {
    if (!Number.isInteger(dimensions)||dimensions<1) throw new Error('Invalid embedding dimensions');
    memory.db.exec(`CREATE TABLE IF NOT EXISTS embeddings (
      memory_id TEXT NOT NULL REFERENCES memories(id), model TEXT NOT NULL,
      dimensions INTEGER NOT NULL, hash TEXT NOT NULL, vector TEXT NOT NULL,
      PRIMARY KEY(memory_id,model)
    ) STRICT;`);
  }
  add(memory_id: string, vector: number[], metadata: { model: string; hash: string }) {
    validateVector(vector, this.dimensions);
    const row = this.memory.db.prepare("SELECT content FROM memories WHERE id=? AND lifecycle='active'").get(memory_id) as {content:string}|undefined;
    if (!row || hash(row.content) !== metadata.hash) return;
    this.memory.db.prepare('INSERT OR REPLACE INTO embeddings VALUES (?,?,?,?,?)').run(memory_id, metadata.model, this.dimensions, metadata.hash, JSON.stringify(vector));
  }
  search(vector: number[], input: { space_id: string; model: string; limit: number }) {
    validateVector(vector, this.dimensions);
    if (!Number.isInteger(input.limit)||input.limit<1) throw new Error('Invalid vector search limit');
    const rows = this.memory.db.prepare(`SELECT e.memory_id,e.vector,e.hash,m.content FROM embeddings e JOIN memories m ON m.id=e.memory_id
      WHERE m.space_id=? AND m.lifecycle='active' AND e.model=? AND e.dimensions=?`).all(input.space_id,input.model,this.dimensions) as {memory_id:string;vector:string;hash:string;content:string}[];
    const norm = Math.hypot(...vector);
    return rows.filter(row => row.hash === hash(row.content)).map(row => {
      const stored = JSON.parse(row.vector) as number[];
      validateVector(stored, this.dimensions);
      return { memory_id:row.memory_id, score:stored.reduce((sum,v,i)=>sum+v*vector[i],0)/(Math.hypot(...stored)*norm) };
    }).sort((a,b)=>b.score-a.score || a.memory_id.localeCompare(b.memory_id)).slice(0,input.limit);
  }
  remove(memory_id: string) { this.memory.db.prepare('DELETE FROM embeddings WHERE memory_id=?').run(memory_id); }
}

export class EmbeddingWorker {
  private busy = false;
  constructor(private memory: Memory, private provider: EmbeddingProvider, private index: VectorIndex) {
    memory.db.exec(`CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY, memory_id TEXT NOT NULL REFERENCES memories(id), model TEXT NOT NULL,
      hash TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','done','failed')),
      attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
      UNIQUE(memory_id,model,hash)
    ) STRICT;`);
  }
  /** Explicit write operation; recall never enqueues work. */
  enqueue() {
    const rows = this.memory.db.prepare("SELECT id,content FROM memories WHERE lifecycle='active'").all() as {id:string;content:string}[];
    return this.memory.db.transaction(()=> {
      let added=0;
      for (const row of rows) added+=this.memory.db.prepare("INSERT OR IGNORE INTO jobs(memory_id,model,hash,state) VALUES(?,?,?,'pending')").run(row.id,this.provider.model,hash(row.content)).changes;
      return added;
    })();
  }
  retryFailed() { return this.memory.db.prepare("UPDATE jobs SET state='pending',error=NULL WHERE model=? AND state='failed'").run(this.provider.model).changes; }
  async runOnce(limit=16) {
    if (!Number.isInteger(limit)||limit<1||limit>1000) throw new Error('Invalid worker batch limit');
    if (this.busy) throw new Error('Worker is already running');
    this.busy=true;
    try {
      const jobs=this.memory.db.prepare("SELECT * FROM jobs WHERE model=? AND state='pending' ORDER BY id LIMIT ?").all(this.provider.model,limit) as {id:number;memory_id:string;hash:string}[];
      for (const job of jobs) {
        const row=this.memory.db.prepare("SELECT content FROM memories WHERE id=? AND lifecycle='active'").get(job.memory_id) as {content:string}|undefined;
        if (!row || hash(row.content)!==job.hash) { this.memory.db.prepare("UPDATE jobs SET state='done' WHERE id=?").run(job.id); continue; }
        try {
          const vectors=await this.provider.embed([row.content]);
          if (vectors.length!==1) throw new Error('Embedding batch size mismatch');
          validateVector(vectors[0],this.provider.dimensions);
          this.memory.db.transaction(()=> {
            this.index.add(job.memory_id,vectors[0],{model:this.provider.model,hash:job.hash});
            this.memory.db.prepare("UPDATE jobs SET state='done',attempts=attempts+1,error=NULL WHERE id=?").run(job.id);
          })();
        } catch (error) {
          this.memory.db.prepare("UPDATE jobs SET state='failed',attempts=attempts+1,error=? WHERE id=?").run(error instanceof Error?error.message:'Embedding failed',job.id);
        }
      }
      return jobs.length;
    } finally { this.busy=false; }
  }
}

/** Connects to a locally running Ollama embedding model; model installation is explicit. */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(readonly model: string, readonly dimensions: number, private baseUrl='http://127.0.0.1:11434') {
    const url=new URL(baseUrl);
    if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new Error('Ollama must use a loopback endpoint');
    if (!Number.isInteger(dimensions)||dimensions<1) throw new Error('Invalid embedding dimensions');
  }
  async embed(texts: string[]) {
    const response=await fetch(new URL('/api/embed',this.baseUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:this.model,input:texts}),signal:AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const result=await response.json() as {embeddings?:number[][]};
    if (!Array.isArray(result.embeddings)||result.embeddings.length!==texts.length) throw new Error('Invalid Ollama response');
    for (const vector of result.embeddings) validateVector(vector,this.dimensions);
    return result.embeddings;
  }
}

/** Validates provider suggestions; never resolves mentions or changes stored facts. */
export async function suggestSafely(provider:DecisionProvider,question:string,candidates:DecisionCandidate[]):Promise<DecisionSuggestion[]> {
  try {
    const allowed=new Set(candidates.map(c=>c.id));
    const seen=new Set<string>();
    return (await provider.suggest(question,candidates)).filter(s=> {
      if (!allowed.has(s.id)||seen.has(s.id)||!Number.isFinite(s.score)||s.score<0||s.score>1||typeof s.reason!=='string') return false;
      seen.add(s.id);return true;
    }).sort((a,b)=>b.score-a.score);
  } catch { return []; }
}

/** Opt-in semantic recall. Provider failures fall back to the read-only core. */
export async function hybridRecall(memory:Memory,input:QueryInput,provider:EmbeddingProvider,index:VectorIndex):Promise<RecallResult> {
  const lexical=memory.recall(input);
  if (!input.query) return lexical;
  try {
    const [vector]=await provider.embed([input.query]);
    const hits=index.search(vector,{space_id:input.space_id,model:provider.model,limit:200});
    // Core revalidates all filters before a vector candidate can enter the result.
    const eligible=memory.recall({...input,query:undefined,candidate_ids:hits.map(hit=>hit.memory_id),limit:200,max_chars:1_000_000});
    const eligibleMap=new Map(eligible.items.map(item=>[item.id,item]));
    const scores=new Map<string,number>();
    lexical.items.forEach((item,i)=>scores.set(item.id,1/(60+i+1)));
    hits.forEach((hit,i)=> {if(eligibleMap.has(hit.memory_id))scores.set(hit.memory_id,(scores.get(hit.memory_id)||0)+1/(60+i+1));});
    const itemMap=new Map([...eligible.items,...lexical.items].map(item=>[item.id,item]));
    const ranked=[...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,input.limit??20);
    const sourceMap=new Map([...eligible.sources,...lexical.sources].map(source=>[source.id,source]));
    const countedSources=new Set<string>();
    let remaining=input.max_chars??12_000;
    const items=ranked.flatMap(([id])=> {
      const item=itemMap.get(id)!;
      const source=sourceMap.get(item.source_id);
      const cost=item.content.length+JSON.stringify(item.data).length+(source&&!countedSources.has(source.id)?source.content.length+JSON.stringify(source.metadata).length:0);
      if(cost>remaining)return [];
      remaining-=cost;countedSources.add(item.source_id);return [item];
    });
    const ids=new Set(items.map(item=>item.id));
    const traces=items.map(item=> {
      const trace=lexical.traces.find(t=>t.memory_id===item.id);
      const hit=hits.find(h=>h.memory_id===item.id);
      return {memory_id:item.id,matched_by:[...new Set([...(trace?.matched_by??[]),...(hit?['vector']:[])])],score:scores.get(item.id)!,source_id:item.source_id,links:trace?.links??[],components:{...(trace?.components??{}),...(hit?{cosine:hit.score}:{}),rrf:scores.get(item.id)!}};
    });
    const sources=[...sourceMap.values()].filter(source=>countedSources.has(source.id));
    return {items,current:[...new Set([...lexical.current,...eligible.current])].filter(id=>ids.has(id)),recent:[...new Set([...lexical.recent,...eligible.recent])].filter(id=>ids.has(id)),related:items.map(i=>i.id),unresolved:items.filter(i=>i.resolution==='unresolved').map(i=>i.id),sources,traces,truncated:ranked.length>items.length};
  } catch {return lexical;}
}
