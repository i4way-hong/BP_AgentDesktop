# BP_AgentDesktop

Bright Pattern Agent Desktop Client-Side JavaScript API(5.19) 연동 샘플.

## 실행 방법 (Windows / PowerShell)
- 정적 파일이므로 간단한 HTTP 서버로 실행하세요.
- 예: PowerShell 내장 서버 사용

Node.js가 설치되어 있다면
```
npx http-server -p 8080
```

그 후 브라우저에서 아래 형식으로 접속

- http://localhost:8080/BP_AgentDesktop/index.html?bpatternDomain=example.brightpattern.com
- Standalone 모드: http://localhost:8080/BP_AgentDesktop/index.html?bpatternDomain=example.brightpattern.com&standalone=true

## 로컬 실행(배포 테스트)
Node.js가 설치되어 있다면 간단 서버로 실행할 수 있습니다.

1) 의존성 없음, 바로 실행
- PowerShell:
  node .\server.js
- 브라우저에서 http://localhost:8080 열기

2) URL 파라미터
- bpatternDomain/example.brightpattern.com, standalone=true|false 예:
  http://localhost:8080?bpatternDomain=example.brightpattern.com&standalone=true

> 참고: Bright Pattern 위젯이 외부 도메인을 iframe으로 로드할 수 있어야 합니다. 테넌트 보안/X-Frame-Options를 확인하세요.

## URL 파라미터
- bpatternDomain: Bright Pattern 테넌트 도메인 (필수)
- standalone: true/false (기본 true)

참고: API 스크립트 경로는 기본값 `https://<domain>/agent/communicator/adapters/api.js`를 사용합니다. 별도 입력/파라미터는 필요하지 않습니다.

## 필수 설정
- bpatternDomain: 고객 Bright Pattern 테넌트 도메인
- 로그인 정보: username, password, tenant(보통 도메인)
- 서비스 ID: 채팅 시작 시 필요

## 제공 기능
- 초기화/재초기화(재연결)
- 로그인/로그아웃 + 기존 세션 채택/강제 로그인 플로우
- 에이전트 상태 제어(Ready/Not Ready + 사유 조회)
- 채팅(Web) 시작/송수신 + 이벤트 처리(신규/상태변경/제거)
- 통화 제어(발신/음소거/보류/DTMF)
- 상호작용 제어(수락/거절/활성 전환/Disposition 조회·설정/노트/전달/연관 객체/스크린 전환/채팅 제안)
- 완료/종료(Leave/Complete/Leave+Complete)
- 녹음 제어(통화 녹음, 스크린 녹음 음소거, 상태 조회)
- 위젯 제어(최소화/복원 + 상태 콜백)

## UI 개선 사항(신규)
- 2컬럼 가변 레이아웃(드래그 리사이저)
  - 마우스로 가운데 세로 막대를 드래그하여 좌/우 폭을 조절합니다.
  - 좌측은 독립 스크롤, 우측 패널은 sticky로 따라옵니다.
  - 분할 비율은 브라우저 localStorage(`layout.split`)에 저장되어 새로고침 후에도 유지됩니다.
  - 접근성: 리사이저는 role="separator"이며 키보드 지원을 제공합니다.
    - ArrowLeft / ArrowRight: 4% 단위로 좌/우 조절
    - Shift + Arrow: 10% 단위로 가속 조절
    - Enter 또는 Home: 기본 비율(좌 1.25fr / 우 0.75fr)로 리셋
    - End: 반대 비율(좌 0.75fr / 우 1.25fr)로 설정
  - 반응형: 1024px 이하에서는 1열로 스택되고 리사이저가 숨겨집니다.
- 통화 제어 보강
  - 음소거 토글: setCallMute(boolean)
  - 보류(Hold) 토글: setCallHold(boolean)
  - DTMF 전송: sendDtmf(digits)
- 위젯 제어 UI 추가
  - 좌측 "위젯 제어" 섹션에서 최소화/복원을 버튼으로 제어합니다.

## 자동 초기화 및 버튼 상태
- 페이지 로드 시 입력된 도메인/Standalone 설정을 사용하여 API를 자동 초기화합니다.
  - URL 파라미터가 있으면 우선 적용됩니다. 예) `?bpatternDomain=example.brightpattern.com&standalone=true`
  - 초기화가 완료되면 기존 로그인 세션을 자동으로 채택 시도합니다.
- 단일 UI 상태 관리로 버튼을 활성/비활성합니다.
  - 초기화 전: 대부분의 기능 비활성화
  - 로그인 전: 로그인 관련 입력/버튼만 활성화
  - 채팅/콜 진행 중: 해당 컨텍스트의 컨트롤만 추가 활성화
- 자동 초기화 실패 시 "API 초기화" 버튼으로 재시도할 수 있습니다. "재연결/재초기화"는 위젯/세션 재바인딩을 수행합니다.

## 상태 로그 패널(QoL)
- "로그 파일 저장" 버튼으로 현재 로그를 .txt 파일로 다운로드합니다.
- "로그 지우기" 버튼으로 로그를 즉시 비웁니다.
- 로그는 우측 패널 폭에 맞춰 자동 줄바꿈되며, 매우 긴 텍스트도 보기 좋게 표시됩니다.

## 민감 정보 로그 마스킹
- 기본값: 활성화(체크박스 "민감 정보 로그 마스킹")
- 대상
  - password/token/session 키 값 → *** 처리
  - Bearer 토큰, 매우 긴 문자열(>128자) → 앞 8자만 남기고 마스킹 표시
  - sessionId 등 토큰 유사 문자열 → *** 처리
  - 전화번호 마스킹
    - 키가 phone/phoneNumber/ani/msisdn/number/destination 등인 경우 끝 4자리만 노출(나머지 *)
    - 일반 문자열에서도 전화번호 유사 패턴(+82, 괄호/대시 포함)을 탐지하여 끝 4자리만 남기고 마스킹
- 비활성화: 체크 해제 시 원문이 상태 로그에 출력됩니다(운영 비권장).
- 커스터마이즈
  - 마스킹 키 목록 확장/축소 가능
  - 마지막 자릿수 노출 개수 변경 가능(기본 4자리)
  - 문자열 내 패턴 탐지(정규식) 강도 조절 가능

## 업데이트된 트러블슈팅
- ON_READY 미수신: “재연결/재초기화” 사용, 또는 도메인/네트워크/X-Frame-Options 확인.
- 이미 로그인 루프: 기존 세션 채택 → 실패 시 1회 강제 로그인 자동 재시도.
- Not Ready 사유 비어있음: 권한 또는 테넌트 설정 확인 필요.
- startChat 시그니처: 문자열 채널 타입 사용. 예) startChat('web').
- 서비스 ID 오류(15/16): 서비스 선택 상태 확인 또는 유효한 서비스 ID 재확인.

## 참고 문서
- https://help.brightpattern.com/5.19:AgentDesktop-client-side-javascript-api-specification
- 샘플 리포지토리: https://github.com/ServicePattern/crm-client-api-example

## 제한 사항 및 주의
- CORS/X-Frame-Options 정책으로 제약이 있을 수 있으나, 본 샘플은 cross-origin 스크립트 로드 + postMessage 통신을 사용하므로 일반적으로 동작합니다. 조직 보안정책에 따라 차이가 있을 수 있습니다.
- 이 코드는 데모용으로 기본적인 예외 처리와 힌트를 포함하며, 운영 환경에 맞는 보완이 필요할 수 있습니다.
