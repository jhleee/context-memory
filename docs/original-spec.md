# 컨텍스트 메모리 도구
## 기술 설계 규격서

**문서 번호:** CMT-TDS-001  
**발행판:** 1  
**작성일:** 2026-10-04  
**상태:** 설계 규격  
**문서 유형:** 로컬 에이전트 메모리 도구 규격서  

> 참고: 이 문서는 ASD-STE100의 통제 기술문서 작성 원칙을 참고하여 작성했다.  
> 이 문서는 공식 ASD-STE100 인증 문서가 아니다.

---

# 1. 목적

## 1.1 일반

이 문서는 Context Memory Tool의 설계를 정의한다.

Context Memory Tool은 Agent가 사용하는 외부 메모리 도구다.

Host Agent가 판단한다.

Host Agent가 내용을 생성한다.

Memory Tool은 기억을 저장하고 검색한다.

Memory Tool은 Agent의 추론을 대신하지 않는다.

## 1.2 주요 기능

도구는 다음 기능을 제공해야 한다.

```text
record
recall
correct
forget
explain
timeline
```

도구는 외부 데이터베이스 서버 없이 동작해야 한다.

기본 저장소는 하나의 로컬 SQLite 데이터베이스 파일이어야 한다.

---

# 2. 적용 범위

## 2.1 포함 기능

Core는 다음 작업을 수행해야 한다.

1. 원본 데이터를 저장한다.
2. Memory Item을 저장한다.
3. 시간 정보를 저장한다.
4. Scope 정보를 저장한다.
5. Entity 참조를 저장한다.
6. 레코드 간 Link를 저장한다.
7. Memory Item을 검색한다.
8. 미해결 정보를 반환한다.
9. 저장된 기억을 정정한다.
10. 저장된 기억을 삭제한다.
11. Recall 결과의 선택 이유를 설명한다.

## 2.2 제외 기능

Core는 다음 작업을 수행하지 않아야 한다.

```text
스토리 생성
캐릭터 행동 선택
업무 계획 수립
Agent 추론
World Canon 자동 결정
Ontology 자동 확장
Workflow 실행
```

이 작업은 Host Agent가 수행할 수 있다.

선택 확장 기능이 이 작업을 지원할 수 있다.

---

# 3. 설계 원칙

## 3.1 Agent 책임

Host Agent는 주요 추론 주체다.

Memory Tool은 Agent의 행동을 결정하지 않아야 한다.

Memory Tool은 후보를 반환할 수 있다.

Memory Tool은 누락된 데이터를 반환할 수 있다.

Memory Tool은 미해결 참조를 반환할 수 있다.

Agent가 이 정보를 사용할 방법을 결정해야 한다.

## 3.2 로컬 우선 동작

Core는 네트워크 연결 없이 동작해야 한다.

Core는 외부 서비스를 필수로 요구하지 않아야 한다.

기본 Runtime은 로컬 파일을 사용해야 한다.

기본 데이터베이스 파일 이름은 다음과 같이 사용할 수 있다.

```text
memory.db
```

## 3.3 단일 저장소

기본 구성은 하나의 SQLite 데이터베이스를 사용해야 한다.

Core는 다음 데이터를 SQLite에 저장해야 한다.

```text
구조화 데이터
JSON 데이터
텍스트 인덱스 데이터
관계 데이터
시간 데이터
상태 데이터
```

## 3.4 라이브러리 우선 구조

기준 구현은 임베드 가능한 라이브러리여야 한다.

예:

```python
from context_memory import Memory

memory = Memory("./memory.db")

memory.record(...)
memory.recall(...)
```

MCP는 Adapter여야 한다.

HTTP는 선택 Adapter여야 한다.

## 3.5 선택형 지능 기능

Core는 LLM 없이 동작해야 한다.

Core는 Embedding Model 없이 동작해야 한다.

Core는 Jev 없이 동작해야 한다.

Core는 Reranker 없이 동작해야 한다.

이 구성요소는 선택 Provider로 사용할 수 있다.

---

# 4. 시스템 구조

## 4.1 기본 구조

```text
              HOST AGENT
                  |
                  |
       record / recall / correct
                  |
                  v
      +-------------------------+
      |   CONTEXT MEMORY TOOL   |
      |                         |
      | 입력 검증               |
      | 정규화                  |
      | 연결                    |
      | 검색                    |
      | Context 조립            |
      +------------+------------+
                   |
                   v
                SQLite
               memory.db
                   |
        +----------+----------+
        |          |          |
      Tables      FTS5       JSON
```

## 4.2 선택 구성요소

선택 구성요소는 Interface를 통해 연결해야 한다.

```text
Context Memory Core
      |
      +-- DecisionProvider
      +-- EmbeddingProvider
      +-- VectorIndex
      +-- MCP Adapter
      +-- HTTP Adapter
      +-- Capability Pack
```

Core는 선택 구성요소에 의존하지 않아야 한다.

---

# 5. 핵심 데이터 모델

## 5.1 Space

Space는 기억 영역을 분리한다.

예:

```text
project_alpha
personal
story_world_a
agent_session_x
```

도구는 기본적으로 서로 다른 Space의 레코드를 섞지 않아야 한다.

각 Memory Record에는 `space_id`가 있어야 한다.

## 5.2 Evidence

Evidence는 도구가 수신한 원본 데이터다.

Evidence에는 다음 데이터가 포함될 수 있다.

```text
사용자 메시지
Tool 출력
문서 조각
Agent 구조화 입력
```

최소 필드는 다음과 같다.

```text
id
space_id
source_type
content
metadata
created_at
```

## 5.3 Memory Item

Memory Item은 Recall이 반환할 수 있는 기본 기억 단위다.

대표 `kind`는 다음과 같다.

```text
event
claim
mention
thread
commitment
summary
note
```

Core는 각 `kind`마다 별도 테이블을 요구하지 않아야 한다.

안정적인 필드는 Table Column을 사용해야 한다.

변동이 큰 필드는 JSON을 사용할 수 있다.

## 5.4 Entity

Entity는 지속적인 식별자를 가질 수 있는 대상이다.

예:

```text
사람
조직
물체
장소
프로젝트
문서
```

Core는 고정된 도메인 Ontology를 요구하지 않아야 한다.

## 5.5 Mention

Mention은 기존 Entity와 동일하다고 확정되지 않은 참조다.

예:

```text
"검은 망토를 입은 여자"
```

도구는 이 값을 다음과 같이 저장할 수 있다.

```text
Mention#43
```

Agent는 나중에 Mention을 Entity와 연결할 수 있다.

도구는 Resolution 후에도 원래 Mention을 삭제하지 않아야 한다.

## 5.6 Link

Link는 두 레코드를 연결한다.

대표 관계는 다음과 같다.

```text
mentions
related_to
derived_from
supports
contradicts
part_of
about
```

Core는 하나의 `links` 테이블을 사용할 수 있다.

---

# 6. 기억 상태

## 6.1 Lifecycle 상태

Core는 다음 Lifecycle 값만 사용한다.

```text
pending
active
stale
deleted
```

## 6.2 Resolution 상태

Core는 다음 Resolution 값만 사용한다.

```text
unresolved
resolved
```

## 6.3 Support 상태

Core는 다음 Support 값을 사용한다.

```text
asserted
supported
disputed
```

Metadata로 표현할 수 있는 조건에는 새로운 Core 상태를 추가하지 않는다.

---

# 7. 불완전한 정보

## 7.1 일반

도구는 유용한 레코드인 경우 불완전한 정보도 저장해야 한다.

도구는 누락된 사실을 생성하지 않아야 한다.

도구는 `unknown`을 `false`로 변환하지 않아야 한다.

## 7.2 예

입력:

```text
리아가 누군가에게 열쇠를 넘겼다.
```

저장 데이터:

```json
{
  "kind": "event",
  "type": "transfer",
  "giver": "entity_lia",
  "receiver": {
    "state": "unknown"
  },
  "object": "entity_key"
}
```

반환 데이터:

```json
{
  "accepted": true,
  "resolution": "partial",
  "missing": ["receiver"]
}
```

Agent는 나중에 누락 필드를 해결할 수 있다.

---

# 8. RECORD 기능

## 8.1 요구사항

`record()` 기능은 Evidence와 Memory Item을 저장해야 한다.

이 기능은 LLM을 필수로 요구하지 않아야 한다.

## 8.2 절차

다음 순서로 처리한다.

```text
1. 입력을 수신한다.
2. 입력을 검증한다.
3. 입력을 정규화한다.
4. 확인 가능한 참조를 연결한다.
5. Evidence를 저장한다.
6. Memory Item을 저장한다.
7. Link를 갱신한다.
8. FTS 데이터를 갱신한다.
9. 결과를 반환한다.
```

## 8.3 선택 Resolution

Decision Provider가 있으면 애매한 필드에 사용할 수 있다.

다음 순서를 사용한다.

```text
Normalize
   |
   +-- 정보 충분 --> Store
   |
   +-- 정보 애매 --> Resolver Hook
                        |
                        v
                    후보 반환
```

Resolver는 미해결 후보를 확정 사실로 강제하지 않아야 한다.

---

# 9. RECALL 기능

## 9.1 요구사항

`recall()` 기능은 관련 기억을 반환해야 한다.

이 기능은 기본적으로 읽기 전용이어야 한다.

Recall은 새로운 영구 Memory Record를 자동 생성하지 않아야 한다.

## 9.2 검색 절차

다음 순서를 사용한다.

```text
1. Space Filter를 적용한다.
2. 지정된 경우 Type Filter를 적용한다.
3. 지정된 경우 Time Filter를 적용한다.
4. 지정된 경우 Entity Filter를 적용한다.
5. FTS5 검색을 수행한다.
6. 관련 Link를 확장한다.
7. 선택 Vector 후보를 추가한다.
8. 후보를 병합한다.
9. 중복을 제거한다.
10. 결과 순위를 계산한다.
11. Context 결과를 구성한다.
```

## 9.3 Context 결과

기본 결과는 다음 구조를 사용할 수 있다.

```json
{
  "current": [],
  "recent": [],
  "related": [],
  "unresolved": [],
  "sources": []
}
```

도메인 의미는 Host Agent가 해석한다.

Capability Pack이 요구하지 않는 한 Core는 스토리 개념을 부여하지 않아야 한다.

---

# 10. CORRECT 기능

## 10.1 요구사항

도구는 정정 이력을 보존해야 한다.

도구는 정정된 기억을 조용히 덮어쓰지 않아야 한다.

## 10.2 기본 방식

대체 레코드를 사용한다.

예:

```text
Memory A
    |
    | corrected_by
    v
Memory B
```

이전 레코드 상태를 다음과 같이 설정한다.

```text
stale
```

새 레코드 상태를 다음과 같이 설정한다.

```text
active
```

Core는 전체 Event Sourcing을 필수로 요구하지 않는다.

---

# 11. FORGET 기능

## 11.1 요구사항

도구는 논리 삭제를 지원해야 한다.

도구는 영구 삭제를 지원할 수 있다.

## 11.2 삭제 작업

Memory Item을 삭제할 때 다음 작업을 수행해야 한다.

1. 일반 Recall에서 해당 Memory Item을 제외한다.
2. 해당 FTS Entry를 제거한다.
3. Vector Index가 있으면 해당 Vector Entry를 제거한다.
4. 적용 가능한 Link를 제거하거나 무효화한다.

고급 삭제 전파는 High-Assurance Pack에서 처리할 수 있다.

---

# 12. EXPLAIN 기능

## 12.1 요구사항

도구는 Recall 결과가 선택된 이유를 보여주어야 한다.

최소 결과는 다음과 같다.

```json
{
  "memory_id": "m_123",
  "matched_by": [
    "entity",
    "fts"
  ],
  "score": 0.81,
  "source_id": "e_42",
  "links": ["thread_3"]
}
```

전체 Decision Ledger는 Core 필수 요구사항이 아니다.

---

# 13. TIMELINE 기능

## 13.1 요구사항

`timeline()` 기능은 Memory Item을 시간 순서로 반환해야 한다.

이 기능은 Space Filter를 지원해야 한다.

이 기능은 Entity Filter를 지원하는 것이 좋다.

이 기능은 시간 범위를 지원하는 것이 좋다.

## 13.2 시간 필드

Core는 다음 필드를 사용할 수 있다.

```text
occurred_at
valid_from
valid_to
created_at
```

고급 Bitemporal 처리는 선택 기능이다.

---

# 14. 기술 스택

## 14.1 필수 구성요소

기본 구현에는 다음 구성요소를 사용한다.

```text
Python 3.12+
SQLite
Python sqlite3
SQLite JSON functions
SQLite FTS5
SQLite WAL
```

## 14.2 선택 구성요소

다음 구성요소는 선택으로 사용할 수 있다.

```text
Pydantic
MCP Python SDK
sqlite-vec
Local Embedding Model
Jev
LLM Resolver
HTTP Adapter
```

## 14.3 기본 구성에서 제외하는 시스템

Core는 다음 시스템을 필수로 요구하지 않아야 한다.

```text
PostgreSQL
Redis
Qdrant
Elasticsearch
Neo4j
Kafka
RabbitMQ
Celery
Temporal
Kubernetes
```

---

# 15. SQLITE 구성

## 15.1 WAL Mode

기본 로컬 구성은 WAL Mode 사용을 권장한다.

```sql
PRAGMA journal_mode=WAL;
```

## 15.2 STRICT Table

가능한 경우 `STRICT` Table을 사용한다.

```sql
CREATE TABLE ... STRICT;
```

## 15.3 JSON 사용

Memory `kind`에 따라 달라지는 필드는 JSON을 사용한다.

예:

```json
{
  "giver": "entity_1",
  "receiver": "mention_7",
  "object": "entity_9"
}
```

자주 필터링하는 필드는 JSON에만 저장하지 않아야 한다.

다음 필드는 Table Column으로 유지한다.

```text
space_id
kind
lifecycle
resolution
support
source_id
occurred_at
valid_from
valid_to
```

---

# 16. 데이터베이스 테이블

## 16.1 필수 테이블

초기 데이터베이스는 다음 테이블을 포함해야 한다.

```text
spaces
evidence
memories
entities
links
memory_fts
```

## 16.2 선택 테이블

데이터베이스는 다음 테이블을 추가할 수 있다.

```text
embeddings
jobs
```

---

# 17. MEMORIES 테이블

다음과 유사한 Schema를 사용할 수 있다.

```sql
CREATE TABLE memories (
    id            TEXT PRIMARY KEY,
    space_id      TEXT NOT NULL,

    kind          TEXT NOT NULL,
    content       TEXT,
    data          TEXT,

    source_id     TEXT,

    occurred_at   TEXT,
    valid_from    TEXT,
    valid_to      TEXT,

    lifecycle     TEXT NOT NULL DEFAULT 'active',
    resolution    TEXT NOT NULL DEFAULT 'resolved',
    support       TEXT NOT NULL DEFAULT 'asserted',

    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
) STRICT;
```

구현 과정에서 정확한 Schema는 변경할 수 있다.

Core Schema는 작게 유지한다.

---

# 18. LINKS 테이블

다음과 유사한 Schema를 사용할 수 있다.

```sql
CREATE TABLE links (
    from_id       TEXT NOT NULL,
    relation      TEXT NOT NULL,
    to_id         TEXT NOT NULL,
    metadata      TEXT,

    PRIMARY KEY (from_id, relation, to_id)
) STRICT;
```

일반 관계 검색에는 SQL을 사용한다.

다단계 관계 탐색이 필요한 경우 Recursive CTE를 사용한다.

Graph Database를 필수로 요구하지 않는다.

---

# 19. 검색

## 19.1 기본 검색

기본 검색은 다음 요소를 사용해야 한다.

```text
FTS5
Entity Reference
Time Filter
Link Expansion
```

## 19.2 Vector Search

Vector Search는 선택 기능이다.

Vector Search를 설치한 경우 `VectorIndex` Interface를 사용한다.

예:

```python
class VectorIndex:
    def add(self, memory_id, vector): ...
    def search(self, vector, limit): ...
    def remove(self, memory_id): ...
```

구현 예:

```text
SQLiteVecIndex
PythonNumpyIndex
```

`VectorIndex`가 없어도 Core는 동작해야 한다.

---

# 20. DECISION PROVIDER

## 20.1 요구사항

Core는 특정 Decision Model에 의존하지 않아야 한다.

Interface를 사용한다.

예:

```python
class DecisionProvider:
    def choose(self, question, candidates): ...
    def score(self, candidate, criteria): ...
```

구현 예:

```text
RuleDecisionProvider
JevDecisionProvider
LLMDecisionProvider
```

기본 Provider는 `None`일 수 있다.

Provider가 없으면 애매한 데이터는 `unresolved`로 반환한다.

---

# 21. MCP ADAPTER

## 21.1 요구사항

MCP는 Adapter여야 한다.

MCP에 Core Memory Logic을 넣지 않아야 한다.

로컬 동작에서는 가능한 경우 stdio를 사용한다.

```text
Agent Process
     |
     | stdin / stdout
     v
Memory MCP Process
     |
     v
memory.db
```

## 21.2 Agent 공개 Tool

필요한 Tool만 노출한다.

```text
memory_record
memory_recall
memory_correct
memory_forget
memory_explain
```

Adapter는 다음 Tool도 선택적으로 노출할 수 있다.

```text
memory_timeline
```

필요하지 않은 내부 Helper Function은 노출하지 않는다.

---

# 22. HTTP ADAPTER

HTTP는 선택 기능이다.

다른 Process 또는 다른 언어가 필요할 때만 HTTP를 추가한다.

다음 구조를 사용한다.

```text
Core
 |
 +-- Python Library
 +-- MCP stdio
 +-- HTTP optional
```

---

# 23. 백그라운드 작업

## 23.1 요구사항

외부 Queue System을 필수로 요구하지 않아야 한다.

백그라운드 작업이 필요하면 SQLite에 저장할 수 있다.

대표 작업:

```text
embedding
reindex
cleanup
```

Main Process 또는 작은 Local Worker가 이 작업을 처리할 수 있다.

---

# 24. CAPABILITY PACK

## 24.1 Continuity Pack

장기 연속성이 필요한 경우 이 Pack을 사용한다.

대표 레코드:

```text
Thread
Commitment
Relationship Change
```

## 24.2 Narrative Pack

서사형 애플리케이션에서만 이 Pack을 사용한다.

대표 레코드:

```text
Setup
Callback
Foreshadowing
Character Knowledge
GM Scope
Player Scope
```

## 24.3 Temporal Pack

고급 과거 상태 조회가 필요한 경우 이 Pack을 사용한다.

대표 기능:

```text
Bitemporal State
Historical Reconstruction
Knowledge Time
```

## 24.4 High-Assurance Pack

감사 가능성이 필요한 경우 이 Pack을 사용한다.

대표 기능:

```text
Root Evidence Lineage
Authority
Decision Audit
Derived Evidence Tracking
```

## 24.5 Branching Pack

대체 시간선 또는 시뮬레이션이 필요한 경우 이 Pack을 사용한다.

대표 기능:

```text
fork
merge
alternate timeline
```

## 24.6 Ontology Learning Pack

자동 Schema 발전이 필요한 경우에만 이 Pack을 사용한다.

대표 기능:

```text
schema proposal
shadow schema
promotion
```

---

# 25. 시스템 한계

Context Memory Tool은 다음 시스템을 대체하지 않는다.

```text
Agent Framework
Workflow Engine
Graph Database
Vector Database
Authorization Platform
Document Management System
LLM Orchestrator
Knowledge Management System
```

측정된 요구사항이 없으면 이 시스템을 Core에 추가하지 않는다.

---

# 26. 구현 순서

## 26.1 1단계 — SQLite Core

다음 기능을 구현한다.

```text
Space
Evidence
Memory Item
Entity
Link
FTS5
record
recall
correct
forget
```

수락 조건:

> Core는 하나의 SQLite 파일만 사용하여 외부 서비스 없이 동작해야 한다.

## 26.2 2단계 — Context 품질

다음 기능을 구현한다.

```text
Mention
Time Filter
Relationship Expansion
Deduplication
Context Assembly
explain
timeline
```

## 26.3 3단계 — 선택 지능 기능

다음 Interface를 구현한다.

```text
DecisionProvider
EmbeddingProvider
VectorIndex
```

평가 후 필요한 Provider만 활성화한다.

## 26.4 4단계 — MCP Adapter

다음 Tool을 노출한다.

```text
memory_record
memory_recall
memory_correct
memory_forget
memory_explain
memory_timeline
```

## 26.5 5단계 — Capability Pack

실제 사용 사례가 요구할 때만 Capability Pack을 추가한다.

---

# 27. 검증

## 27.1 Record 검증

다음 항목을 측정한다.

```text
정보 손실률
잘못된 구조화율
미해결 비율
중복 생성률
Record 지연시간
```

## 27.2 Recall 검증

다음 항목을 측정한다.

```text
관련 기억 재현율
비관련 기억 비율
시간 Filter 정확도
Entity Link 유용성
Context 크기
Recall 지연시간
```

## 27.3 Correction 검증

다음 항목을 측정한다.

```text
오래된 기억 노출률
정정 반영 가시성
```

## 27.4 Runtime 검증

다음 항목을 측정한다.

```text
Database 크기
시작 시간
메모리 사용량
Record 지연시간
Recall 지연시간
```

---

# 28. CORE 요구사항

Core는 다음 요구사항을 준수해야 한다.

**CMT-REQ-001**  
Host Agent는 주요 추론 주체여야 한다.

**CMT-REQ-002**  
Memory Tool은 누락된 사실을 생성하지 않아야 한다.

**CMT-REQ-003**  
시스템은 `unknown`과 `false`를 구분해야 한다.

**CMT-REQ-004**  
Recall은 기본적으로 읽기 전용이어야 한다.

**CMT-REQ-005**  
Core는 외부 네트워크 서비스 없이 동작해야 한다.

**CMT-REQ-006**  
기본 구성은 하나의 SQLite 데이터베이스를 사용해야 한다.

**CMT-REQ-007**  
Core는 Embedding Provider 없이 동작해야 한다.

**CMT-REQ-008**  
Core는 Decision Provider 없이 동작해야 한다.

**CMT-REQ-009**  
MCP는 Adapter여야 한다.

**CMT-REQ-010**  
HTTP는 선택 기능이어야 한다.

**CMT-REQ-011**  
도메인 특화 기능은 Core 밖에 있어야 한다.

**CMT-REQ-012**  
측정된 필요성이 없으면 외부 Database, Queue, Cache 또는 Graph System을 추가하지 않아야 한다.

**CMT-REQ-013**  
Correction은 이전 기억을 조용히 덮어쓰지 않아야 한다.

**CMT-REQ-014**  
삭제된 Memory는 일반 Recall에 포함되지 않아야 한다.

**CMT-REQ-015**  
도구가 참조를 확정할 수 없으면 미해결 상태를 반환해야 한다.

---

# 29. 권장 프로젝트 구조

```text
context_memory/
|
+-- core/
|   +-- database.py
|   +-- schema.py
|   +-- record.py
|   +-- recall.py
|   +-- correct.py
|   +-- forget.py
|   +-- explain.py
|
+-- retrieval/
|   +-- lexical.py
|   +-- relational.py
|   +-- vector.py
|
+-- providers/
|   +-- decision.py
|   +-- embedding.py
|
+-- packs/
|   +-- continuity/
|   +-- narrative/
|   +-- temporal/
|   +-- assurance/
|
+-- adapters/
    +-- mcp.py
    +-- http.py
```

기본 설치는 `core` 패키지와 SQLite만으로 동작해야 한다.

---

# 30. 시스템 정의

프로젝트 정의는 다음과 같다.

> **Context Memory Tool은 로컬 우선 외부 Memory Runtime이다. 이 도구는 Agent의 장기 맥락을 저장하고 검색하고 정정한다. 이 도구는 시간, 출처, 관계, 미해결 정보를 보존한다.**

시스템은 다음 세 가지 주요 특성을 가진다.

```text
1. 구조, 시간, 관계를 함께 저장한다.

2. 불완전한 데이터를 unresolved 상태로 유지한다.

3. Agent가 사용할 수 있는 형태로 관련 과거 맥락을 반환한다.
```

도구는 Agent의 지능을 소유하지 않는다.

기본 시스템은 하나의 SQLite 데이터베이스 파일로 동작해야 한다.

---

# 31. 변경 이력

| 발행판 | 날짜 | 설명 |
|---|---|---|
| 1 | 2026-10-04 | 한국어 통제 기술문서 형식으로 최초 작성. |
