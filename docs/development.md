# 개발 단계

## 검증 상태 (2026-10-05, Asia/Seoul)

Node.js 24.19.0에서 TypeScript 빌드와 자동 테스트 **75개**가 통과했습니다. 코어 17개, 선택 Provider 7개, Runtime 14개, OpenRouter 11개, HTTP 5개, MCP 3개, 게임 벤치마크·Entity 생명주기 12개, 대형 월드·문맥 제어 6개입니다. 실제 빌드된 MCP CLI 자식 프로세스와 HTTP Adapter에서도 지정한 OpenRouter 모델의 색인·검색·후보 제안을 실증했습니다.

한국어 고정 합성 데이터 16개와 질의 12개로 어휘·하이브리드·Decision 검색을 비교했습니다. 결과·측정 조건은 [실증 보고서](../evaluation/openrouter-live-report.md)에 있습니다. Ollama는 모의 HTTP 서버로 계약을 검증했으며 실제 로컬 모델 평가는 하지 않았습니다. HTTP 테스트에는 로컬 소켓 권한이 필요합니다. 대시보드 API와 화면 자산은 검증했지만 브라우저 시각 검증은 하지 않았습니다.

## 1단계: 외부 서비스 없는 최소 작동 런타임

- TypeScript 라이브러리와 SQLite 저장소
- Space, Evidence, Memory, Entity, Mention, Link
- record / recall / correct / forget / explain / timeline
- 정정 이력, 논리 삭제, 미해결 정보, 시간·Entity 필터
- MCP stdio와 CLI
- DB 재시작·트랜잭션·Space 격리·읽기 전용 Recall 수락 테스트

규격의 Python 스택은 Node.js + TypeScript + better-sqlite3로 변경합니다. 임베딩 없이 사용하는 기본 런타임은 선택 지능에 의존하지 않습니다.

## 2단계: 선택 Decision과 임베딩

완료한 기능:

- EmbeddingProvider / VectorIndex / DecisionProvider 계약
- 로컬 Ollama 임베딩 연결
- OpenRouter Nemotron 임베딩 및 Mercury Decision 실제 연결
- SQLite embeddings / jobs, 실패 재시도
- 임베딩 배치 요청, 변경된 Memory만 색인 작업 등록
- 삭제·정정·임베딩 처리 경합 시 상태 재검증
- FTS + Vector의 RRF 순위 병합
- scoped Vector 필터, 후보 정렬, 설명 trace와 장애 진단
- typed noul / choice / score, 후보 제안과 명시적 Entity 연결 분리
- CLI·MCP·HTTP·대시보드에서 검색 모드와 색인 선택
- 고정 한국어 데이터 평가와 실제 Adapter 실행

확장 시 필요한 작업:

- 실제 사용자 데이터 평가와 후보 확률 보정
- 별도 Jev 제품을 요구한다면 해당 제품의 Adapter 구현
- 실제 로컬 Ollama 모델 품질 평가
- 크기·성능 측정 후 sqlite-vec 도입 여부 결정

자동 테스트는 모의 Provider를 사용합니다. 실제 OpenRouter 실증은 별도 명령과 보고서로 분리하며, 기본 테스트에 네트워크·키가 필요하지 않습니다.

## 3단계: Web UI와 운영

초기 구현:

- loopback HTTP Adapter, 접근 토큰, Origin 검사
- 같은 코어를 호출하는 한국어 관리 화면
- 검색, 출처·trace 확인, timeline, 수동 기록·정정·삭제
- 검색 모드·Provider 상태·색인·실패 재시도·Mention 후보 제안

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

게임 관계도 벤치마크는 [별도 보고서](../evaluation/gameplay-benchmark-report.md)에 5회차·27개 질문·6개 인물 판별의 실측을 기록했습니다. 실제 모델의 최종 38회 호출은 모두 성공했고 인물 판별은 6/6 정답입니다. 다단계 방향성 경로 API와 인과 답변 생성은 아직 구현하지 않았습니다.

[대형 월드 실험](../evaluation/world-stress-report.md)은 4,096개 기억의 규모·문맥 예산 비교와 후보 발견 병목을 기록했습니다. 32k 문자 Decision 시험은 통과했고 64k/96k는 서비스가 HTTP 422로 거절했습니다. 방향성 다단계 경로 검색과 Entity 후보 검색을 다음 개선 대상으로 구체화했습니다.
