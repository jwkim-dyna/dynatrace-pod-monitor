# Pod 상태 모니터링 개발 지침

[Dynatrace App Toolkit 공식 템플릿](https://github.com/Dynatrace/dt-app-templates/blob/main/templates/default/AGENTS.md)을 참고해 이 저장소에 맞게 정리한 지침입니다.

## 프로젝트 구조

- `ui/main.tsx`는 React 진입점입니다. `ui/app/`에는 상태 보드, Pod 목록, 상세 패널이 있습니다.
- `ui/app/queries.ts`는 DQL, `ui/app/data.ts`는 조회·취소·갱신을 담당합니다. 상태 판정과 Workload 집계는 `model.ts`, `workloads.ts`에 있습니다.
- `tests/status.test.mjs`는 상태 판정, Workload 집계, 리소스 계산, 링크의 회귀를 검증합니다.

## Dynatrace 데이터와 UI

- 조회는 현재 Dynatrace 환경의 Smartscape·Grail을 사용합니다. 특정 환경 주소, 클러스터, 네임스페이스를 고정하거나 실제 데이터의 빈자리를 샘플 값으로 채우지 않습니다.
- DQL을 바꾸기 전에는 Dynatrace App Development MCP의 DQL 지식 베이스를 확인합니다. 도구가 없으면 공식 DQL 문서를 참고합니다. 조회 범위와 시간 제한을 유지하고, 사용자 입력을 필터에 넣을 때는 기존 문자열 인코딩 방식을 사용합니다.
- Strato 컴포넌트는 공식 문서 또는 설치된 타입 정의에서 사용법을 확인합니다. 컴포넌트와 디자인 토큰은 필요한 하위 경로에서 가져오고, 화면은 Dynatrace 환경 테마를 따릅니다.
- 목록의 **Workload 실행/계획**은 각각 Running Pod 수(종료 중 제외)와 Workload의 목표 수입니다. Pod 내부 컨테이너의 Ready 수와 구분하며, 목표를 모르면 `—`를 사용합니다.
- 전체 상태는 1분마다 갱신하고 CPU·메모리는 Pod를 선택했을 때 조회합니다. Kubernetes 링크는 현재 환경의 선택한 Pod로 연결합니다.

## 검증과 배포 파일

- 시작 방법은 [README](README.md)를 참고합니다. 코드 변경 후에는 `npm run build`, `npm run lint`, `npm test`를 실행하고, 검증하지 못한 항목은 명시합니다.
- 공유 설정은 `app.config.example.json`에서 관리합니다. 실제 `app.config.json`, 토큰, 고객 환경 정보, 로그, 화면 캡처, 빌드 산출물은 커밋하지 않습니다.
- 앱의 읽기 전용 범위를 유지합니다. 배포에서는 작업 대상 환경을 명시하며, `npm run package`는 로컬 설치용 ZIP 생성에 사용합니다.
