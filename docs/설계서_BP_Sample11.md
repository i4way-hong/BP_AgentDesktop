# Bright Pattern JS API 샘플 설계서 (BP_AgentDesktop)

문서 버전: 1.0  | 작성일: 2025-08-13  | 대상: 발주사 제출용

1. 개요
- 목적: Bright Pattern Agent Desktop Client-Side JavaScript API(v5.19) 기반 샘플의 설계 및 구현 내용을 문서화하여 재사용/검수/인수에 활용.
- 범위: UI/UX, 상태관리, 이벤트/흐름, 로깅/마스킹, 접근성, 배포 구성, 호환성, 테스트 및 운영 고려사항.

2. 시스템 구성도
- 개요: 브라우저(샘플 UI) ←→ Bright Pattern 테넌트(Agent Desktop Communicator + JS API).
- 구성도(mermaid): diagrams/architecture.mmd 참고. Word 삽입 가이드: Mermaid Live Editor로 PNG로 내보낸 뒤 그림으로 삽입.

3. 주요 요구사항 대응
- 레이아웃: 좌/우 2컬럼 + 중앙 리사이저(드래그/키보드 접근성), 비율 localStorage("layout.split")로 영속화.
- 패널 동작: 우측 상태·위젯 패널 sticky, 좌측 스크롤 독립.
- 통화 제어: 음소거(setCallMute), 보류(setCallHold), DTMF(sendDtmf) 지원.
- 로깅: 상태 로그 저장/지우기, 줄바꿈/강제 줄바꿈 처리, 민감정보 마스킹(기본 ON).
- 흐름 유지: 초기화/로그인/세션 채택/에이전트 상태/채팅/녹음/위젯 제어 등 기존 플로우 보존.
- 자동 초기화: 페이지 로드시 API init, 단일 UI 상태 기반 버튼 활성/비활성.

4. 아키텍처 설계
- 프런트엔드 단일 페이지(HTML/CSS/JS)와 bp-adapter.js 래퍼로 API 스크립트 동적 로드 및 인스턴스화.
- 준비 신호: ON_READY 수신 또는 getLoginState 폴링을 통한 준비 확인(waitForReady).
- 전역 API 핸들: window.__adApi 제공(디버깅용).

5. UI/UX 설계
- 레이아웃: CSS Grid(1.25fr | 6px | 0.75fr), 반응형(≤1024px 1열, 리사이저 숨김).
- 리사이저 접근성: role=separator, aria-orientation=vertical, aria-valuemin/max/now. 키보드: ←/→(4%), Shift+←/→(10%), Home/Enter(기본), End(반대비율). 더블클릭 리셋.
- 크로스 브라우저 드래그: Mouse/Pointer/Touch 이벤트 지원.
- 상태 로그: 동적 폭, pre-wrap, anywhere 줄바꿈, 저장/지우기 버튼.

6. 상태 관리 설계
- 단일 소스(Single Source of Truth): uiState { apiReady, initializing, isLoggedIn, hasActiveChat, hasActiveCall }.
- 제어 함수: updateUiByState()가 모든 버튼/입력의 활성/비활성을 일괄 반영.
- 섹션 표시: 초기화 완료 시 섹션 unhide.

7. 이벤트/흐름 설계
- 콜백 안전 바인딩: safeOn(api, evt, handler)로 버전/권한별 미지원 이벤트 보호.
- 바인딩 목록: ON_READY(로그), ON_LOGIN/ON_LOGOUT(UI 갱신), ON_AGENT_STATE_CHANGE(라벨 동기화), ON_NEW_INTERACTION/ON_INTERACTION_STATE_CHANGE/ON_INTERACTION_REMOVED(채팅/콜 상태 반영), ON_WIDGET_MINIMIZED_CHANGE(위젯 라벨 동기화).
- 시퀀스 다이어그램: diagrams/flows.mmd 참고 (초기화/로그인/채팅 시작/통화 시작/위젯 최소화).

8. 예외/오류 처리
- 재시도 유틸: withRetry(fn, {retries, delay, factor}).
- 에러 힌트 매핑(ERROR_HINT): not_logged_in, invalid_args, api_not_answer, timeout, not_allowed, invalid_number, service_not_found 등.
- 메서드 호환성: callApiOrWarn(methodName, …args)로 미지원 시 경고/토스트 + 로그.

9. 로깅/마스킹 설계
- 기본 ON(체크박스). 마스킹 대상: password/token/session 키, Bearer 토큰, 128자 이상 장문, sessionId 패턴, 전화번호 키(phone/number/ani/msisdn/destination 등)와 일반 문자열 내 번호 패턴(+82/괄호/대시 포함).
- 전화 마스킹 규칙: 끝 4자리만 노출.
- 저장: "로그 파일 저장"으로 .txt 다운로드(Blob).

10. 접근성/국제화
- 리사이저 ARIA, 키보드 내비게이션, 포커스 스타일 강화.
- 한국어 UI 라벨/힌트. 시간/날짜는 브라우저 로캘 사용.

11. 성능/호환성
- Pointer/Touch/Mouse 호환 드래그, sticky 우측 패널.
- 반응형 레이아웃(≤1024px 1열). 스크롤/오버플로우 최적화.

12. 보안 고려사항
- 비밀번호는 UI에서 입력(로그 마스킹). 토큰/세션/전화번호 등은 로그에서 숨김.
- Cross-origin 로딩: 테넌트 X-Frame-Options, CSP 정책 준수 필요.

13. 배포/운영
- 정적 서버(server.js)로 로컬 테스트: http://127.0.0.1:8080
- URL 파라미터: bpatternDomain, standalone.
- API 스크립트 경로: https://<domain>/agent/communicator/adapters/api.js

14. 테스트 계획(요약)
- 브라우저: Chrome/Edge/Firefox/Safari 리사이저 드래그/키보드, sticky 동작 확인.
- API 시그니처 검증: setCallMute/ setCallHold/ sendDtmf/ setWidgetMinimized.
- E2E: 로그인/세션 채택/에이전트 상태/채팅/콜/녹음/위젯 플로우.
- 로그 마스킹: 샘플 데이터로 패턴 검증.

15. 유지보수/확장 포인트
- UI 상태 추가 플래그(예: 녹음 상태) 확장.
- 로그 패널 옵션: 자동 하단 고정, wrap 토글.
- 서비스/팀/변수 설정(추가 API) UI 확장.

16. 파일 구조
- index.html: 2컬럼 레이아웃, 리사이저, 제어 패널, 상태/위젯.
- assets/styles.css: 그리드/리사이저/스티키/반응형/토스트/메시지 스타일.
- src/bp-adapter.js: API 스크립트 로드, AdApi 인스턴스화, ON_READY/폴링 준비 대기, reinit.
- src/main.js: UI 상태/이벤트/흐름, 로그/마스킹, 버튼 상태 제어, 리사이저 로직.
- server.js: 단순 정적 서버.
- README.md: 실행/기능/마스킹/자동 초기화 설명.
- docs/: 본 설계서 및 다이어그램 원본.

17. Bright Pattern API 사용 목록(주요)
- 초기화: window.brightpattern.AdApi(standalone, mountRoot)
- 준비/상태: getLoginState, getAgentState, getAgentNotReadyReasons, setAgentState
- 채팅: setService, startChat, sendChatMessage, suggestChatMessage
- 통화: startCall, setCallMute, setCallHold, sendDtmf, consultCall, inviteToCallConference, removeFromCallConference, destroyCallConference
- 상호작용: acceptInteraction, rejectInteraction, switchActiveInteraction, addNote, getDispositionsList, setDisposition, addInteractionAssociatedObject, setInteractionActiveScreen, transfer, blindTransfer
- 녹음/스크린: setCallRecording, setScreenRecordingMute, getScreenRecordingState
- 위젯: setWidgetMinimized
- 이벤트: ON_READY, ON_LOGIN, ON_LOGOUT, ON_AGENT_STATE_CHANGE, ON_NEW_INTERACTION, ON_INTERACTION_STATE_CHANGE, ON_INTERACTION_REMOVED, ON_WIDGET_MINIMIZED_CHANGE

18. Word 문서 작업 가이드
- 본 설계서(md)를 Word로 붙여넣은 뒤, 스타일(제목1/2/3) 적용.
- 다이어그램: docs/diagrams/*.mmd(또는 .puml)를 Mermaid Live(또는 PlantUML)로 열어 PNG로 내보내고 Word에 삽입.
- 표 필요 시: 요구사항/기능 매핑을 표로 재구성(본 장 3, 14 참고).

부록 A. 변경 이력(요약)
- 레이아웃 리사이저/접근성/영속화 추가.
- 콜 제어(음소거/보류/DTMF) 추가.
- 로그 저장/지우기/줄바꿈 개선 + 마스킹 강화.
- 자동 초기화 + 단일 UI 상태 제어.
- 이벤트 동기화(에이전트/위젯/상호작용) 보강.
