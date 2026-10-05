# Context Memory

Agent의 장기 맥락을 저장·검색·정정하는 로컬 메모리 런타임입니다. Node.js + TypeScript 라이브러리가 중심이며, MCP와 HTTP는 같은 코어를 호출합니다. 기본 동작에 LLM, 임베딩, 외부 서비스가 필요하지 않습니다.

## 시작

Node.js 22 이상을 사용하세요. 이 작업 공간에서는 Node.js 24로 검증합니다.

```bash
cd /workspace/context-memory
npm ci
npm run build
npm test
node dist/src/cli.js init --db ./memory.db
node dist/src/cli.js demo --db ./demo.db
```

`better-sqlite3`는 네이티브 모듈입니다. 플랫폼별 사전 빌드가 없으면 C++ 빌드 도구가 필요합니다. SQLite는 WAL 모드로 동작하며 실행 중 `-wal`, `-shm` 보조 파일이 생길 수 있습니다.

## 라이브러리

```ts
import { Memory } from './dist/src/index.js';

const memory = new Memory('./memory.db');
const saved = memory.record({
  space_id: 'project-alpha',
  evidence: { source_type: 'user_message', content: '리아가 누군가에게 열쇠를 넘겼다.' },
  entities: [{ id: 'lia', name: '리아' }],
  memories: [{
    kind: 'event', content: '리아가 누군가에게 열쇠를 넘겼다.',
    data: { giver: 'lia', receiver: { state: 'unknown' }, object: 'key' },
    entity_ids: ['lia'],
  }],
});

const context = memory.recall({ space_id: 'project-alpha', entity_id: 'lia' });
console.log(context.items, context.unresolved);
console.log(memory.explain(context, saved.memory_ids[0]));
memory.close();
```

각 API는 `src/types.ts`에 정의됩니다. `record`, `recall`, `correct`, `forget`, `explain`, `timeline`을 제공합니다. `resolveMention`은 원본 Mention을 보존하면서 Host가 선택한 Entity와 연결합니다.

- `unknown`은 `{ state: 'unknown' }`으로 명시합니다. `false`와 구별하며 누락된 값을 추측하지 않습니다.
- `missing`은 명시한 unknown 경로를 반환합니다. 도메인 스키마가 없으므로 단순 필드 미제공을 자동으로 누락 판정하지 않습니다.
- `idempotency_key`는 Space 안에서 동일 입력을 재사용합니다. 같은 키로 다른 입력을 저장하면 오류입니다.
- 정정은 새 Memory를 만들고 이전 Memory를 stale로 보존합니다. 교체 입력은 완전한 새 내용을 지정하세요. Entity 참조는 생략하면 상속합니다.
- `forget`은 논리 삭제입니다. 원본 Evidence는 남으므로 개인정보의 물리적 삭제와 같지 않습니다.
- 기본 Recall은 active만 조회합니다. 시간 범위는 사건 시점, 없으면 기록 시점을 사용합니다.
- `explain`은 전달받은 Recall trace를 설명하며 DB에 검색 로그를 저장하지 않습니다.
- `max_chars`는 반환 Memory의 본문·data와 중복 제거한 Evidence의 본문·metadata 길이 예산입니다. JSON 응답 전체의 바이트 수나 LLM 토큰 수를 뜻하지 않습니다. 사실은 잘라내지 않고 통째로 반환하거나 제외합니다.

## MCP

```bash
node dist/src/cli.js mcp --db /absolute/path/memory.db
```

MCP 호스트의 설정 예:

```json
{
  "mcpServers": {
    "context-memory": {
      "command": "node",
      "args": ["/workspace/context-memory/dist/src/cli.js", "mcp", "--db", "/workspace/context-memory/memory.db"]
    }
  }
}
```

기본 도구는 `memory_record`, `memory_recall`, `memory_correct`, `memory_forget`, `memory_explain`, `memory_timeline`입니다. Provider를 설정하면 `memory_index`, `memory_suggest`도 노출하며 Recall의 `mode`를 선택할 수 있습니다. stdio의 stdout은 프로토콜 전용입니다.

## 로컬 대시보드

```bash
npm run dashboard -- --db ./memory.db --port 8787
```

터미널에 표시되는 URL을 열고 접근 토큰을 입력하세요. 서버는 `127.0.0.1`에만 바인딩합니다. 토큰은 서버 실행마다 새로 발급됩니다. 검색·출처·설명·timeline·기록·정정·논리 삭제를 사용할 수 있습니다. Provider를 설정하면 검색 모드 선택, 색인·실패 재시도, 작업 상태, Mention 후보 제안도 사용할 수 있습니다. Entity 연결은 별도의 명시적인 클릭이 필요합니다.

## OpenRouter 임베딩·Decision

실제 검증한 기본 모델은 임베딩 `nvidia/nemotron-3-embed-1b:free`(2048차원), Decision `inception/mercury-decide:free`입니다. 이 선택 기능을 켜면 해당 Space의 색인할 본문·검색 질의·Decision 후보가 OpenRouter로 전송됩니다. 기본 코어는 계속 오프라인으로 사용할 수 있습니다.

키는 환경 변수 `OPENROUTER_API_KEY`에 설정합니다. `OPENAPIKEY`도 호환 입력으로 지원합니다. 파일로 관리할 경우 `.env.example`을 `.env`로 복사하고 로컬에서만 값을 채우세요. `.env`와 `*.key`는 Git에서 제외됩니다. CLI 인수나 대시보드에 API 키를 입력하는 기능은 없습니다.

```bash
# .env를 명시적으로 읽어 실행합니다. 환경 변수를 직접 설정했다면 --env-file은 생략합니다.
node --env-file=.env dist/src/cli.js index --provider openrouter --db ./memory.db --space project-alpha
node --env-file=.env dist/src/cli.js recall --provider openrouter --db ./memory.db --space project-alpha --mode decision --query '물건을 다른 사람에게 준 사건'
node --env-file=.env dist/src/cli.js serve --provider openrouter --db ./memory.db
node --env-file=.env dist/src/cli.js mcp --provider openrouter --db ./memory.db
```

`record`와 `correct`는 새 기억의 색인 작업을 SQLite에 등록합니다. 실제 임베딩 생성은 `index` 명령, MCP `memory_index`, 대시보드 색인 버튼으로 명시적으로 실행합니다. 재색인 시 이미 최신 Vector가 있으면 건너뜁니다. 실패 작업은 `index --retry`로 재시도할 수 있고, 실패가 남으면 CLI가 종료 코드 1을 반환합니다.

| 검색 모드 | 동작 |
|---|---|
| `lexical` | FTS5·Entity·관계 검색, 원격 호출 없음 |
| `hybrid` | 어휘 후보와 의미 후보를 RRF로 병합 |
| `decision` | 최대 20개 후보의 관련성을 typed noul 질문으로 평가해서 정렬 |

벡터 후보에도 Space·시간·Entity·kind 필터를 순위 계산 전에 적용합니다. Provider 장애는 `retrieval.warnings`와 `retrieval.used`에 표시하며 사용 가능한 검색으로 돌아갑니다. Recall과 후보 제안은 영구 레코드를 생성하지 않습니다. API의 확률은 모델 신호이며 사실 확정이나 신뢰도 인증이 아닙니다.

```ts
import { Memory, createRuntimeFromEnv } from './dist/src/index.js';
const memory = new Memory('./memory.db');
const runtime = createRuntimeFromEnv(memory, { provider: 'openrouter' });
await runtime.index({ space_id: 'project-alpha' });
const context = await runtime.recall({ space_id: 'project-alpha', query: '물건 전달', mode: 'decision' });
console.log(context.retrieval, context.traces);
memory.close();
```

`OpenRouterDecisionProvider.decide()`는 `noul`, `choice`, `score`를 지원합니다. `choice`와 `score`의 전체 분포를 검증하고 보존합니다. `score`는 확률 0~1이 아니라 기준 목록의 기대 인덱스 0~N−1입니다. `choose()`는 근거 부족 시 `null`(unknown)을 반환할 수 있습니다. `suggestMention()`은 저장된 Mention을 자동으로 해결하지 않습니다.

이 구현은 사용자가 지정한 OpenRouter Decision 모델을 사용합니다. 별도의 Jev 패키지를 연결했다고 주장하지 않습니다.

## 실제 모델 실증

[실증 보고서](evaluation/openrouter-live-report.md)에 고정 한국어 데이터 16개·질의 12개의 결과를 기록했습니다. 첫 결과 적중률은 어휘 25%, 하이브리드 75%, Decision 정렬 100%였습니다. 같은 소규모 합성 데이터에서 나온 결과이며 실제 사용자 데이터나 일반 모델 성능을 대신하지 않습니다. 실제 MCP 자식 프로세스와 HTTP 경로도 지정 모델로 검증했습니다.

```bash
# 개발 환경에 키를 설정한 후 실행합니다. 실제 API 호출을 하는 명시적 명령입니다.
npm run evaluate
npm run smoke:openrouter
```

프록시가 필요한 실행 환경에서는 Node.js 24의 `NODE_USE_ENV_PROXY=1`과 환경에 제공된 프록시·CA 설정을 사용하세요. 키·응답 오류 본문은 로그나 SQLite 실패 메시지에 저장하지 않습니다.

## 선택 임베딩

로컬 Ollama를 별도로 설치·실행하고, 사용할 모델을 명시적으로 내려받아야 합니다. 코어가 모델을 자동 설치하지 않습니다.

```bash
ollama pull nomic-embed-text
npm run embed -- --db ./memory.db --model nomic-embed-text --dimensions 768
# 실패 작업 재시도
npm run embed -- --db ./memory.db --model nomic-embed-text --dimensions 768 --retry
```

Ollama를 MCP와 대시보드에 연결하려면 `--provider ollama`를 지정합니다. 이 구성에는 Decision Provider가 없으며 `decision` 모드 요청 시 사용 가능한 검색으로 돌아갑니다. 저수준 라이브러리에서는 `hybridRecall`을 직접 호출할 수도 있습니다.

```ts
import { Memory, OllamaEmbeddingProvider, SQLiteVectorIndex, hybridRecall } from './dist/src/index.js';
const memory = new Memory('./memory.db');
const provider = new OllamaEmbeddingProvider('nomic-embed-text', 768);
const index = new SQLiteVectorIndex(memory, provider.dimensions);
const result = await hybridRecall(memory, { space_id: 'project-alpha', query: '물건 전달' }, provider, index);
memory.close();
```

임베딩과 작업은 같은 SQLite 저장소에 보관합니다. 현재 VectorIndex는 정확한 cosine 전수 검색이라 소규모 저장소에 적합합니다. 대규모에서는 측정 후 sqlite-vec 구현으로 교체합니다. Provider 장애 시 코어 Recall로 돌아갑니다. 모델 이름은 버전이 고정된 식별자로 사용하세요. 모델이 바뀌면 새 식별자로 재색인해야 합니다.

## 개발 진행

[개발 단계와 잔여 작업](docs/development.md), [원본 규격](docs/original-spec.md)을 참고하세요. 일정은 주 단위로 고정하지 않고 수락 조건으로 관리합니다.
