# Pod 상태 모니터링

Dynatrace에서 Kubernetes Pod 상태를 보여 주는 읽기 전용 앱입니다.
현재 환경에 수집된 Smartscape·Grail 데이터를 사용합니다.

- 클러스터·네임스페이스별 상태 보드와 검색 가능한 Pod 목록
- Workload 실행/계획 Pod 수 및 목표 미달 표시
- Pod 상세의 최근 30분 CPU·메모리, 리소스 설정, 최근 이벤트
- Dynatrace Kubernetes의 해당 Pod Overview·Events 바로가기

## 로컬 실행

Node.js 24와 Kubernetes 모니터링이 설정된 Dynatrace 환경이 필요합니다.

```powershell
npm ci --ignore-scripts
Copy-Item app.config.example.json app.config.json
```

처음 설정할 때 `app.config.json`의 `environmentUrl`을 사용할 환경 주소로 바꿉니다.
실제 설정 파일은 Git에 포함되지 않습니다.

```powershell
npm run start -- --no-open --port 3003
```

터미널에 표시된 인증 링크에서 직접 로그인한 뒤 `http://localhost:3003/ui`를 엽니다.

## 배포

배포 권한이 있는 계정으로 대상 Dynatrace 환경을 지정합니다.

```powershell
npm run deploy -- --environment-url https://CUSTOMER.apps.dynatrace.com --no-open
```

설치용 ZIP만 만들려면 `npm run package`를 실행합니다.
`out/artifact.zip`이 생성되며, 원격 배포는 수행하지 않습니다.

## 화면 읽는 법

- Pod 상태는 최근 15분 내 관측을 기준으로 하며 1분마다 갱신됩니다.
- **실행/계획**은 Workload의 Running Pod 수(종료 중 제외) / 목표 Pod 수입니다.
  목표를 알 수 없으면 `—`로 표시합니다.

## 검증

```powershell
npm run build
npm run lint
npm test
```

개발 규칙은 [AGENTS.md](AGENTS.md)를 참고하세요.
