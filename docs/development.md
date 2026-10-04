# 개발 단계

## 검증 상태 (2026-10-04)

Node.js 24.19.0에서 TypeScript 빌드와 자동 테스트 **29개**가 통과했습니다. 코어 17개, 선택 Provider 7개, HTTP 3개, MCP 2개입니다. MCP는 실제 빌드된 CLI 자식 프로세스와 stdio 통신을 검증했습니다. CLI 데모도 같은 DB에서 두 번 실행했습니다.

Ollama 연결은 모의 HTTP 서버로 요청·응답 계약과 차원 검증을 확인했습니다. 이 실행 환경에 Ollama와 실제 모델은 설치되어 있지 않아 실제 모델 품질 평가는 수행하지 않았습니다. HTTP 테스트에는 로컬 소켓을 열 수 있는 실행 권한이 필요합니다. 대시보드 화면의 브라우저 시각 검증은 수행하지 않았습니다.

## 1단계: 외부 서비스 없는 최소 작동 런타임

- TypeScript 라이브러리와 SQLite 저장소
- Space, Evidence, Memory, Entity, Mention, Link
- record / recall / correct / forget / explain / timeline
- 정정 이력, 논리 삭제, 미해결 정보, 시간·Entity 필터
- MCP stdio와 CLI
- DB 재시작·트랜잭션·Space 격리·읽기 전용 Recall 수락 테스트

규격의 Python 스택은 Node.js + TypeScript + better-sqlite3로 변경합니다. 임베딩 없이 사용하는 기본 런타임은 선택 지능에 의존하지 않습니다.

## 2단계: Jev와 임베딩

구현 기반:

- EmbeddingProvider / VectorIndex / DecisionProvider 계약
- 로컬 Ollama 임베딩 연결
- SQLite embeddings / jobs, 실패 재시도
- 삭제·정정·임베딩 처리 경합 시 상태 재검증
- FTS + Vector의 RRF 순위 병합
- Decision 후보를 제한하고 사실을 자동 확정하지 않는 검증 함수

완료 전에 필요한 작업:

- Jev 프로젝트 식별 및 실제 Adapter 구현
- 실제 로컬 모델 설치 후 한국어 검색 평가
- 한국어 평가 데이터의 Recall@k, 순위 품질, 잘못된 Entity 후보, p95 측정
- MCP·HTTP에서 의미 검색을 선택하는 설정
- 크기·성능 측정 후 sqlite-vec 도입 여부 결정

현재 자동 테스트의 임베딩은 결정적 테스트 Provider입니다. 실제 모델 품질이나 Jev 성능의 증거로 사용하지 않습니다.

## 3단계: Web UI와 운영

초기 구현:

- loopback HTTP Adapter, 접근 토큰, Origin 검사
- 같은 코어를 호출하는 한국어 관리 화면
- 검색, 출처·trace 확인, timeline, 수동 기록·정정·삭제

이후 구현:

- React 기반 상세 화면, 미해결 큐, 작업 모니터, 페이지 탐색
- SQLite 백업·복원 CLI와 복원 검증
- 원본 Evidence·파생 정보까지 포함하는 영구 삭제 정책
- migration 변경 시 사전 백업·복구 절차
- 실제 다중 프로세스 쓰기 경합 측정
- 사용 사례에 필요한 Capability Pack부터 추가

## 요구사항 검증 연결

| 요구사항 | 구현 및 검증 |
|---|---|
| 001–003: Agent 책임·누락 생성 금지·unknown 구분 | 구조화 입력 저장, unknown/false 및 추측 방지 테스트 |
| 004: Recall 읽기 전용 | 테이블·스키마·total_changes 불변 검증 |
| 005–008: 오프라인·SQLite·Provider 선택 | Provider 없는 SQLite 수락 테스트 |
| 009–010: Adapter 분리 | Library를 호출하는 MCP·HTTP 통합 테스트 |
| 011–012: 도메인 기능·인프라 분리 | 도메인 Ontology 및 외부 DB·Queue 없음 |
| 013: 정정 이력 | stale→replacement 및 corrected_by 테스트 |
| 014: 삭제 제외 | FTS·관계·Vector 경로 삭제 테스트 |
| 015: 미해결 반환 | unknown 경로 및 Mention 처리 테스트 |

## 현재 한계

기본 FTS는 SQLite unicode61 토크나이저를 사용합니다. 한국어 조사·띄어쓰기 변화와 의미 유사도를 완전히 처리하지 않습니다. 시간 모델은 valid interval과 사건·기록 시간이며 고급 bitemporal 모델은 포함하지 않습니다. HTTP는 로컬 관리용이며 다중 사용자 인증 제품이 아닙니다. 기본 삭제는 Evidence를 보존합니다.
