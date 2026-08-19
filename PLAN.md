# BP_AgentDesktop 개발 계획서

목표: Bright Pattern Agent Desktop Client-Side JavaScript API(5.19)를 활용한 실제 서버 연동 샘플 페이지 구현

운영체제 및 터미널: Windows 11 / PowerShell

원칙: Mock 금지. 실제 인스턴스 도메인, 계정, 서비스로 연동.

## 단계 1: 프로젝트 스캐폴딩 (완료)
- 정적 HTML/CSS/JS 구조 생성
- 환경 입력(도메인, API 스크립트 URL, standalone) UI 구성
- README, 스타일, 상태 로그 영역 구현

## 단계 2: API 초기화 (진행)
- window.brightpattern.AdApi 초기화 함수 구현
- 옵션: standalone, mountRoot
- API 스크립트 URL 동적 로드 지원 + Communicator iframe 폴백

## 단계 3: 로그인/로그아웃
- 로그인 UI와 API 연동(login/logout)
- 로그인 상태 조회(getLoginState)

## 단계 4: 에이전트 상태 제어
- 상태 조회(getAgentState)
- 상태 설정(setAgentState), 이석 사유 조회(getAgentNotReadyReasons)

## 단계 5: 채팅 기본 흐름
- 서비스 ID 입력 후 startChat
- sendChatMessage로 송신
- onNewInteraction/onInteractionStateChange/onInteractionEnd 이벤트 로그 표시

## 단계 6: 품질 및 예외 처리 강화
- OperationResult 결과 코드에 따른 사용자 피드백
- 타임아웃 및 네트워크 에러 처리

## 단계 7: 배포와 문서화
- PowerShell/Node 간단 서버 안내
- 환경 변수(도메인, tenant, apiScriptUrl) URL 파라미터화
- 운영 가이드 업데이트

## 필요 정보 (사용자 제공)
- Bright Pattern 테넌트 도메인 (예: example.brightpattern.com)
- Agent Desktop 사용자 계정(username/password)
- 서비스 ID(채팅)
- API 스크립트 URL(조직 환경에 따라 제공될 수 있음)

## 리스크
- CORS 및 X-Frame-Options 정책으로 인한 iframe 차단 가능성
- 테넌트 보안 정책으로 외부 도메인에서의 접근 제한
- API 버전 차이(문서 5.19 기준)로 인한 호환성 이슈

---

## API 영역별 상세 계획(추가)

참고: Interaction Controls는 “채팅만”이 아니라, 콜/채팅/메시징 등 모든 상호작용을 공통으로 제어하는 범주입니다. 채팅은 그 중 일부이며, 본 샘플에서는 우선 Web Chat 흐름을 구현하고, 점진적으로 다른 상호작용을 확장합니다.

### Configuration Controls
- 대상 메서드: getServicesList, getService, setService, getTeams, getTeamMembers, setVariable
- 구현 계획:
  - 서비스 선택 UI(드롭다운) 추가 → setService 호출 연결
  - 팀/팀원 조회 버튼 제공, 결과 로그 및 간단 렌더
  - 필요한 변수 설정(setVariable) 데모 버튼 제공
- 테스트 포인트: 권한 부족/서비스 없음 오류 처리, 목록 페이징/빈 결과 처리

### Interaction Controls(채팅 포함 공통 상호작용)
- 대상 메서드(1차): startChat, sendChatMessage, suggestChatMessage
- 대상 메서드(2차): acceptInteraction, rejectInteraction, switchActiveInteraction, addNote, getDispositionsList, setDisposition, transfer, blindTransfer, addInteractionAssociatedObject, setInteractionActiveScreen
- 콜백 연계: onNewInteraction, onInteractionStateChange, onInteractionEnd, onActiveInteractionSwitch, onSaveActivityRecord
- 구현 계획:
  - Stage 5에서 Web Chat 시작/송신 및 이벤트 렌더 완료
  - Disposition 선택/저장(setDisposition) UI 추가(2차)
  - 상호작용 전환/전달(transfer) 버튼(2차)
- 테스트 포인트: 다중 상호작용 동시 처리, 상태 전이(end/removed) 처리, 권한/상태 부적합 오류

### Call Controls(음성 통화)
- 대상 메서드: startCall, setCallMute, setCallHold, sendDtmf, consultCall, inviteToCallConference, removeFromCallConference, destroyCallConference
- 구현 계획:
  - 단순 다이얼 패드/번호 입력 후 startCall 데모
  - 음소거/보류/DTMF 버튼 및 컨퍼런스 초대/제거 흐름 기본 UI
- 테스트 포인트: self_call/empty_number/no_service 오류, 장치/권한, 상태 전이 표시

### Complete and Terminate an Interaction(완료/종료)
- 대상 메서드: completeInteraction, leaveInteraction, leaveAndCompleteInteraction
- 구현 계획:
  - 채팅/콜 공통으로 “완료/나가기” 버튼 제공
  - disposition 필수 시나리오 가드(사전 검증 및 사용자 안내)
- 테스트 포인트: not_suitable_state/no_disposition 처리, 종료 후 UI 정리

### Recording Controls(녹음/스크린)
- 대상 메서드: setCallRecording, setScreenRecordingMute, getScreenRecordingState
- 구현 계획:
  - 통화 중 녹음 토글/스크린 음소거 토글 버튼 및 상태 표시
- 테스트 포인트: 권한 부족/정책 제한 시 오류 메시지 매핑

### Widget Controls(위젯)
- 대상 메서드: setWidgetMinimized
- 콜백: onWidgetMinimizedChange
- 구현 계획:
  - Communicator 위젯 최소화/복원 버튼 및 이벤트 로그
- 테스트 포인트: 최소화 상태에서의 상호작용 알림 동작 확인

### Callbacks(콜백 전반)
- 대상 콜백: onLogin, onLogout, onAgentStateChange, onNewInteraction, onInteractionStateChange, onInteractionEnd, onActiveInteractionSwitch, onSaveActivityRecord, onRequestTransferData, onLoadTransferData, onWebScreenPopCustom, onServerError, onWidgetMinimizedChange, onScreenRecordingStateChange, onSoftphoneStatusChange, onAudioDeviceChange, onPhoneCapabilitiesChange, onCallAudioQualityAlert
- 구현 계획:
  - 안전 바인딩(safeOn) 유지, 이벤트 페이로드를 상태 로그와 UI에 요약 렌더
  - 중요 이벤트는 배지/토스트 등 시각적 표시(품질 단계에 포함)
- 테스트 포인트: 테넌트/버전에 따른 콜백 미지원 대비, 과도한 로그 스로틀링

### 단계 연계 및 우선순위
- 단기(현 단계): Interaction Controls(Web Chat) 심화 + Configuration 최소(UI에서 setService)
- 중기: Complete/Terminate, Disposition, Notes, Transfer
- 이후: Call Controls/Recording/Widget Controls 점진 구현 및 문서화 보강
