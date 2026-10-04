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

노출 도구는 `memory_record`, `memory_recall`, `memory_correct`, `memory_forget`, `memory_explain`, `memory_timeline`입니다. stdio의 stdout은 프로토콜 전용입니다.

## 로컬 대시보드

```bash
npm run dashboard -- --db ./memory.db --port 8787
```

터미널에 표시되는 URL을 열고 접근 토큰을 입력하세요. 서버는 `127.0.0.1`에만 바인딩합니다. 토큰은 서버 실행마다 새로 발급됩니다. 검색·출처·설명·timeline·기록·정정·논리 삭제를 사용할 수 있습니다. 현재 화면은 가벼운 HTML 관리 화면이며 React 기반의 전체 운영 대시보드로 확장할 수 있습니다.

## 선택 임베딩

로컬 Ollama를 별도로 설치·실행하고, 사용할 모델을 명시적으로 내려받아야 합니다. 코어가 모델을 자동 설치하지 않습니다.

```bash
ollama pull nomic-embed-text
npm run embed -- --db ./memory.db --model nomic-embed-text --dimensions 768
# 실패 작업 재시도
npm run embed -- --db ./memory.db --model nomic-embed-text --dimensions 768 --retry
```

라이브러리에서 의미 검색을 사용하려면 명시적으로 `hybridRecall`을 호출합니다. 기본 MCP와 대시보드 검색은 코어의 어휘 검색입니다.

```ts
import { Memory, OllamaEmbeddingProvider, SQLiteVectorIndex, hybridRecall } from './dist/src/index.js';
const memory = new Memory('./memory.db');
const provider = new OllamaEmbeddingProvider('nomic-embed-text', 768);
const index = new SQLiteVectorIndex(memory, provider.dimensions);
const result = await hybridRecall(memory, { space_id: 'project-alpha', query: '물건 전달' }, provider, index);
memory.close();
```

임베딩과 작업은 같은 SQLite 저장소에 보관합니다. 현재 VectorIndex는 정확한 cosine 전수 검색이라 소규모 저장소에 적합합니다. 대규모에서는 측정 후 sqlite-vec 구현으로 교체합니다. Provider 장애 시 코어 Recall로 돌아갑니다. 모델 이름은 버전이 고정된 식별자로 사용하세요. 모델이 바뀌면 새 식별자로 재색인해야 합니다.

Jev의 구체적인 패키지·API는 아직 지정되지 않았습니다. `DecisionProvider`와 `suggestSafely`는 후보 검증과 실패 처리를 제공하지만 실제 Jev 연동이나 품질 개선 검증을 완료했다는 뜻은 아닙니다.

## 개발 진행

[개발 단계와 잔여 작업](docs/development.md), [원본 규격](docs/original-spec.md)을 참고하세요. 일정은 주 단위로 고정하지 않고 수락 조건으로 관리합니다.
