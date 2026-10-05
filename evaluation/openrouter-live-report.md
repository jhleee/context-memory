# OpenRouter 실제 모델 실증

실행일: 2026-10-05 (Asia/Seoul). Node.js 24.19.0, SQLite, 지정한 무료 모델을 사용했다.

- Embedding: `nvidia/nemotron-3-embed-1b:free`, 실측 2048차원
- Decision: `inception/mercury-decide:free`, `/api/alpha/decisions`
- 고정 입력: [한국어 합성 기억 16개·질의 12개](korean-memory.json)
- 상세 결과: [모델 평가 JSON](openrouter-live-result.json), [Adapter 실증 JSON](openrouter-adapter-result.json)

## 검색 결과

| 모드 | 첫 결과 적중률 | Recall@5 | MRR@5 |
|---|---:|---:|---:|
| 어휘 검색 | 25% (3/12) | 25% | 0.250 |
| 하이브리드 | 75% (9/12) | 100% | 0.861 |
| 하이브리드 + Decision 정렬 | 100% (12/12) | 100% | 1.000 |

합성 데이터의 질의·정답은 호출 전에 고정했다. 어휘 검색은 한국어 조사·표현 변화에 약했고 의미 후보가 누락을 보완했다. Decision은 최대 20개 후보를 대상으로 각 후보의 관련성을 noul 확률로 평가했으며 영구 Memory를 만들거나 기존 내용을 정정하지 않았다. 이 결과는 작은 개발 검증 데이터의 결과이며 일반 모델 성능 추정이나 확률 보정 결과가 아니다.

## 실행·측정 조건

비교에는 같은 실제 질의 임베딩을 배치 호출로 한 번 생성해 재사용했다. 그러므로 비교 런타임 p95(어휘 3ms, 하이브리드 10ms)는 원격 질의 임베딩 시간을 포함하지 않는다. Decision의 p95 1072ms에는 실제 Decision API 요청이 포함된다. 별도로 캐시 없는 하이브리드 요청을 측정했을 때 569ms였다. 표본 수가 작아 이 값은 서비스 지연시간 보장이 아니다.

기억 16개의 색인 처리 시간은 1446ms, 질의 12개의 배치 임베딩은 1193ms였다. 평가 본 실행의 원격 요청 22개는 모두 HTTP 200이었고, 각 응답의 비용 메타데이터 합계는 0이었다. 이 합계는 평가 JSON에 기록한 호출의 응답 메타데이터이며 계정의 전체 청구 내역을 뜻하지 않는다.

## 데이터 안전성과 상태 일관성

- 다른 Space의 후보가 검색 결과에 섞이지 않았다.
- Recall 전후 SQLite `total_changes()`가 같았다.
- Mention 후보 제안 전후 DB가 변하지 않았고 원본은 unresolved로 남았다.
- 근거 없는 인물 선택에서 `choose()`가 null을 반환했고 unknown 확률은 약 0.9998이었다.
- 기존 Memory를 정정하면 이전 Vector가 제거되고 대체 Memory를 색인할 수 있었다.
- 논리 삭제한 Memory의 Vector가 제거됐으며 이후 Decision 검색에서도 나오지 않았다.
- API 키는 환경 변수로만 사용했고 실증 결과·소스·SQLite 실패 메시지에 기록하지 않았다.

## 실제 Adapter 실행

실제 빌드된 MCP CLI를 자식 프로세스로 시작했다. 기본 6개 도구와 `memory_index`, `memory_suggest`를 확인하고, MCP로 기록·색인·Decision 검색·Mention 후보 제안을 실행했다. 물건 전달 질의의 첫 결과는 `transfer`였으며 후보 제안 이후 Mention은 unresolved로 남았다.

같은 DB를 사용하는 로컬 HTTP Adapter에서도 실제 모델로 검색했다. 인증 없이 상태 조회는 401이었고, 인증한 Decision 검색의 첫 결과는 `privacy`였다. 대시보드의 검색 모드·색인 API 연결 자산은 확인했지만 브라우저 시각 검증은 수행하지 않았다.

## 재현

```bash
npm ci
npm test
# OPENROUTER_API_KEY를 환경에 설정한 후에만 실제 모델을 호출한다.
npm run evaluate
npm run smoke:openrouter
```

프록시가 있는 실행 환경에서는 제공된 프록시·CA를 보존하고 Node.js 24에서 `NODE_USE_ENV_PROXY=1`을 설정한다. 무료 모델의 가용성·응답·속도는 재실행 시 달라질 수 있다. 보고서는 실증 당시 결과를 보존한다.
