/**
 * 공유 애플리케이션 상태 (state.js)
 *
 * 모든 모듈이 이 단일 객체를 import 하여 같은 참조를 통해 상태를 읽고 씁니다.
 * 상태를 별도 파일로 분리한 이유: 순환 import를 방지하고,
 * 어느 모듈에서든 state 객체 하나만 바라보도록 단일 소스(source of truth)를 보장하기 위함입니다.
 */
export const state = {
  // ── API 준비 / 초기화 관련 ──────────────────────────────────────────────────
  /** Communicator API 스크립트 로드 및 ON_READY(또는 폴링 핸드셰이크) 완료 여부 */
  apiReady: false,
  /** 현재 에이전트가 로그인되어 있는지 여부 */
  isLoggedIn: false,
  /** initAdApi() 호출 후 waitForReady() 완료 전까지 true */
  initializing: false,

  // ── 상호작용 상태 ───────────────────────────────────────────────────────────
  /** 활성 채팅 세션이 존재하는지 여부 (채팅 입력/전송 버튼 활성화에 사용) */
  hasActiveChat: false,
  /** 활성 통화(인바운드/아웃바운드)가 존재하는지 여부 (통화 제어 버튼 활성화에 사용) */
  hasActiveCall: false,

  // ── 활성 상호작용 ID 추적 ───────────────────────────────────────────────────
  /** 현재 활성 상호작용 ID (채팅/통화 모두 포함, 가장 최근 값) */
  activeInteractionId: null,
  /** 현재 활성 통화 상호작용 ID (통화 전용, 종료 시 null로 초기화) */
  activeCallId: null,

  // ── 콜백 등록 플래그 ────────────────────────────────────────────────────────
  /** bindCallbacks()가 이미 호출되었는지 여부 (중복 이벤트 등록 방지) */
  callbacksBound: false,

  // ── 에이전트 상태 캐시 ──────────────────────────────────────────────────────
  /**
   * 버튼 핸들러에서 마지막으로 설정한 Not Ready 사유 문자열.
   * ON_AGENT_STATE_CHANGE 페이로드에 reason 필드가 없을 때 폴백으로 사용합니다.
   * Ready 상태로 전환되면 null로 초기화합니다.
   */
  lastNotReadyReason: null,
}
