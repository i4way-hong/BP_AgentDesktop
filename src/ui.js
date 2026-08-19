/**
 * UI 상태 관리 및 DOM 조작 (ui.js)
 *
 * state.js의 상태를 읽어 버튼·섹션의 활성화 여부를 관리하고,
 * 각종 라벨을 업데이트하는 순수 DOM 조작 함수들을 담습니다.
 *
 * 포함 내용:
 *   - BTN_GROUPS: 버튼/입력 요소를 기능별로 묶은 ID 목록
 *   - setDisabledByIds: ID 배열을 한 번에 disabled 처리
 *   - updateUiByState: state 객체 기반 전체 버튼 활성/비활성 동기화
 *   - unhideSection / unhideAppSections: hidden 섹션 표시
 *   - updateLoginStateLabel / updateAgentStateLabel / updateActiveInteractionLabel: 라벨 갱신
 *   - setupCollapsibleSections: <section> 접기/펼치기 기능 초기화
 *   - setupResizableLayout: 좌우 컬럼 드래그 리사이저 초기화
 */
import { state } from './state.js'

// ── 버튼 그룹 ────────────────────────────────────────────────────────────────

/**
 * 기능별 버튼/입력 요소의 HTML id 목록.
 * updateUiByState()에서 그룹 단위로 disabled 처리할 때 사용합니다.
 */
export const BTN_GROUPS = {
  init:        ['btnInit', 'btnReinit'],
  login:       ['btnLogin', 'btnLogout', 'btnGetLoginState', 'forceLogin', 'username', 'password', 'tenant'],
  agent:       ['btnGetAgentState', 'btnSetReady', 'notReadyReason', 'btnLoadReasons', 'btnSetNotReady'],
  chat:        ['btnLoadServices', 'serviceSelect', 'btnStartChat', 'chatInput', 'btnSend'],
  call:        ['phoneNumber', 'btnStartCall', 'btnEndCall', 'btnMuteToggle', 'btnHoldToggle', 'dtmfDigits', 'btnSendDtmf', 'consultTarget', 'btnConsultCall', 'btnInviteConf', 'btnRemoveFromConf', 'btnDestroyConf'],
  interaction: ['btnLeave', 'btnComplete', 'btnLeaveComplete', 'btnAccept', 'btnReject', 'switchInteractionId', 'btnSwitchActive', 'btnLoadDispositions', 'dispositionSelect', 'btnSetDisposition', 'noteText', 'btnAddNote', 'transferTarget', 'btnBlindTransfer', 'btnTransfer', 'assocObjectJson', 'btnAddAssocObject', 'activeScreenName', 'btnSetActiveScreen', 'suggestText', 'btnSuggestChat'],
  recording:   ['btnRecToggle', 'btnScreenMuteToggle', 'btnGetScreenState'],
  widget:      ['btnToggleWidgetMinimize'],
  statusPanel: ['btnSaveStatus', 'btnClearStatus'],
}

/**
 * HTML id 목록에 해당하는 요소들의 disabled 속성을 일괄 설정합니다.
 * 존재하지 않는 id는 조용히 무시합니다.
 *
 * @param {string[]} ids      - 대상 요소의 id 배열
 * @param {boolean}  disabled - true면 비활성화, false면 활성화
 */
export function setDisabledByIds(ids, disabled) {
  ids.forEach((id) => {
    const el = document.getElementById(id)
    if (el) el.disabled = !!disabled
  })
}

// ── 전체 UI 상태 동기화 ───────────────────────────────────────────────────────

/**
 * 공유 state 객체를 읽어 모든 버튼·입력 요소의 활성/비활성을 동기화합니다.
 *
 * 규칙:
 *   - API 미준비(state.apiReady=false): 초기화 버튼만 활성, 나머지 전부 비활성
 *   - API 준비 + 로그아웃: 로그인 버튼 활성, 에이전트·채팅·통화 등 비활성
 *   - API 준비 + 로그인: 모든 기능 버튼 활성 (단, 채팅 입력은 hasActiveChat, 통화 버튼은 hasActiveCall 에 따라 분기)
 */
export function updateUiByState() {
  if (!state.apiReady) {
    setDisabledByIds(BTN_GROUPS.init, false)
    if (state.initializing) setDisabledByIds(['btnInit'], true)
    setDisabledByIds(['btnReinit'], true)
    setDisabledByIds(BTN_GROUPS.login, true)
    setDisabledByIds(BTN_GROUPS.agent, true)
    setDisabledByIds(BTN_GROUPS.chat, true)
    setDisabledByIds(BTN_GROUPS.call, true)
    setDisabledByIds(BTN_GROUPS.interaction, true)
    setDisabledByIds(BTN_GROUPS.recording, true)
    setDisabledByIds(BTN_GROUPS.widget, true)
    setDisabledByIds(BTN_GROUPS.statusPanel, false)
    return
  }

  // API 준비됨
  setDisabledByIds(['btnInit'], true)
  setDisabledByIds(['btnReinit'], false)

  if (state.isLoggedIn) {
    setDisabledByIds(BTN_GROUPS.login, false)
    setDisabledByIds(['btnLogin'], true)
    setDisabledByIds(['btnLogout'], false)

    setDisabledByIds(BTN_GROUPS.agent, false)
    setDisabledByIds(['btnLoadServices', 'serviceSelect', 'btnStartChat'], false)
    setDisabledByIds(['chatInput', 'btnSend'], !state.hasActiveChat)

    setDisabledByIds(['phoneNumber', 'btnStartCall'], false)
    setDisabledByIds(
      ['btnEndCall', 'btnMuteToggle', 'btnHoldToggle', 'dtmfDigits', 'btnSendDtmf',
       'consultTarget', 'btnConsultCall', 'btnInviteConf', 'btnRemoveFromConf', 'btnDestroyConf'],
      !state.hasActiveCall
    )

    setDisabledByIds(BTN_GROUPS.interaction, false)
    setDisabledByIds(BTN_GROUPS.recording, false)
    setDisabledByIds(BTN_GROUPS.widget, false)
  } else {
    setDisabledByIds(['btnLogin'], false)
    setDisabledByIds(['btnLogout'], true)
    setDisabledByIds(['btnGetLoginState', 'username', 'password', 'tenant', 'forceLogin'], false)
    setDisabledByIds(BTN_GROUPS.agent, true)
    setDisabledByIds(BTN_GROUPS.chat, true)
    setDisabledByIds(BTN_GROUPS.call, true)
    setDisabledByIds(BTN_GROUPS.interaction, true)
    setDisabledByIds(BTN_GROUPS.recording, true)
    setDisabledByIds(BTN_GROUPS.widget, true)
  }
}

// ── 섹션 표시 ────────────────────────────────────────────────────────────────

/**
 * 지정한 id의 요소에서 'hidden' 클래스를 제거해 섹션을 화면에 표시합니다.
 *
 * @param {string} id - 표시할 요소의 HTML id
 */
export function unhideSection(id) {
  try {
    const el = document.getElementById(id)
    if (el && el.classList?.contains('hidden')) el.classList.remove('hidden')
  } catch {}
}

/**
 * 앱의 주요 기능 섹션을 모두 표시합니다.
 * API 초기화 성공 시 초기 숨김 상태인 섹션을 한 번에 노출할 때 호출합니다.
 */
export function unhideAppSections() {
  ['login', 'agent', 'chat', 'call', 'interact', 'recording', 'widget'].forEach(unhideSection)
  const ic = document.getElementById('interactionControls')
  if (ic) ic.classList.remove('hidden')
}

// ── 라벨 업데이트 ─────────────────────────────────────────────────────────────

/**
 * 로그인 상태 라벨(#loginStateLabel)의 텍스트를 갱신합니다.
 *
 * @param {string} text - 표시할 상태 문자열 (e.g. 'logged_in', 'logged_out')
 */
export function updateLoginStateLabel(text) {
  const el = document.getElementById('loginStateLabel')
  if (el) el.textContent = `상태: ${text}`
}

/**
 * 에이전트 상태 라벨(#agentStateLabel)을 갱신합니다.
 * 문자열 또는 API 응답 객체를 모두 받을 수 있습니다.
 *
 * @param {string|Object} info - 에이전트 상태 문자열 또는 API 응답 객체
 *   객체일 경우 다양한 필드명(data.state / reason / reasonName / reasonLabel 등)을 순서대로 시도해 추출합니다.
 */
export function updateAgentStateLabel(info) {
  const el = document.getElementById('agentStateLabel')
  try {
    let stateText = 'unknown'
    let extra = ''
    if (typeof info === 'string') {
      stateText = info
      // Ready 전환 시 저장된 사유 초기화
      if (info.toLowerCase().includes('ready') && !info.toLowerCase().includes('not')) {
        state.lastNotReadyReason = null
      }
      // 페이로드가 문자열 'not_ready'일 때도 캐시된 사유를 폴백으로 표시
      if ((stateText === 'not_ready' || stateText === 'not ready') && state.lastNotReadyReason) {
        extra = ` (${state.lastNotReadyReason})`
      }
    } else if (info && typeof info === 'object') {
      // BP API ON_AGENT_STATE_CHANGE 페이로드 필드명이 버전·환경마다 다를 수 있어 폭넓게 탐색
      const d = info?.data ?? {}
      const st =
        d?.state        || d?.agentState  || d?.stateName  ||
        info?.state     || info?.stateName || info?.agentState ||
        (typeof d === 'string' ? d : null) ||
        null
      stateText = st || 'unknown'

      // reason 필드: label → name → id → 직접 문자열 순으로 시도
      const reason =
        d?.reasonLabel      || d?.reasonName  || d?.reason  || d?.reasonId  ||
        d?.notReadyReason   || d?.notReadyReasonLabel ||
        info?.reasonLabel   || info?.reasonName || info?.reason || info?.reasonId ||
        info?.notReadyReason || null

      if (reason) {
        extra = ` (${reason})`
        // 페이로드에 reason이 있으면 캐시 갱신
        state.lastNotReadyReason = reason
      } else if (stateText.toLowerCase().includes('not_ready') || stateText.toLowerCase().includes('not ready')) {
        // 페이로드에 reason이 없으면 이전에 버튼 핸들러가 저장한 사유를 폴백으로 사용
        if (state.lastNotReadyReason) extra = ` (${state.lastNotReadyReason})`
      } else {
        // Ready 등 다른 상태로 전환 시 캐시 초기화
        state.lastNotReadyReason = null
      }
    }
    const ts = new Date().toLocaleTimeString()
    if (el) el.textContent = `${stateText}${extra} @ ${ts}`
  } catch (e) {
    if (el) el.textContent = String(info) || 'unknown'
  }
}

/**
 * 현재 활성 인터랙션 ID 라벨(#activeInteractionLabel)을 갱신합니다.
 *
 * @param {string|null} id - 표시할 인터랙션 ID. falsy이면 '(없음)' 표시
 */
export function updateActiveInteractionLabel(id) {
  const el = document.getElementById('activeInteractionLabel')
  if (el) el.textContent = id || '(없음)'
}

// ── 접을 수 있는 섹션 ─────────────────────────────────────────────────────────

/**
 * 페이지의 모든 <section> 요소에 접기/펼치기 기능을 부여합니다.
 *
 * 동작:
 *   - 이미 `.collapsible` 클래스가 적용된 섹션: h2 클릭 시 `.collapsed` 토글
 *   - 그렇지 않은 섹션: h2 이후 자식을 `.section-body`로 감싸고, 토글 아이콘을 삽입한 후 동일하게 처리
 *
 * 기본 접힘 섹션(페이지 로드 시 접힌 상태로 시작):
 *   env, interact, interactionControls, recording, widget
 */
export function setupCollapsibleSections() {
  document.querySelectorAll('section').forEach((sec) => {
    const h2 = sec.querySelector('h2')
    if (!h2) return

    // HTML에서 이미 collapsible 마크업이 적용된 섹션
    if (sec.classList.contains('collapsible')) {
      h2.addEventListener('click', () => sec.classList.toggle('collapsed'))
      if (['widgetSection'].includes(sec.id || '')) sec.classList.add('collapsed')
      return
    }

    sec.classList.add('collapsible')

    // h2 이후 자식을 .section-body로 감싸기
    if (!sec.querySelector('.section-body')) {
      const body = document.createElement('div')
      body.className = 'section-body'
      let sibling = h2.nextSibling
      while (sibling) {
        const next = sibling.nextSibling
        body.appendChild(sibling)
        sibling = next
      }
      sec.appendChild(body)
    }

    // 토글 아이콘 추가
    if (!h2.querySelector('.toggle-icon')) {
      const icon = document.createElement('span')
      icon.className = 'toggle-icon'
      icon.innerHTML = '▼'
      h2.appendChild(icon)
    }

    h2.addEventListener('click', () => sec.classList.toggle('collapsed'))

    // 기본 접힘 섹션
    if (['env', 'interact', 'interactionControls', 'recording', 'widget'].includes(sec.id || '')) {
      sec.classList.add('collapsed')
    }
  })
}

// ── 드래그 레이아웃 ───────────────────────────────────────────────────────────

/**
 * 좌우 컬럼 사이의 드래그 리사이저(#colResizer)를 초기화합니다.
 *
 * 지원 상호작용:
 *   - 마우스 드래그 (mousedown / mousemove / mouseup)
 *   - 포인터 이벤트 (Pointer Events API, setPointerCapture 활용)
 *   - 터치 드래그 (touchstart / touchmove / touchend)
 *   - 키보드 (ArrowLeft / ArrowRight: 이동, Shift 조합: 큰 이동, Home / Enter: 기본값 복원, End: 반전)
 *   - 더블클릭: 기본 비율로 초기화
 *
 * 컬럼 비율은 localStorage('layout.split')에 저장되어 새로고침 후에도 유지됩니다.
 *
 * 최솟값: 좌측 240px, 우측 320px (이보다 좁아지지 않음)
 */
export function setupResizableLayout() {
  const layout = document.getElementById('layout')
  const resizer = document.getElementById('colResizer')
  if (!layout || !resizer) return

  /** 기본 컬럼 비율: 좌 1.25fr / 리사이저 6px / 우 0.75fr */
  const DEFAULT_COLS = '1.25fr 6px 0.75fr'

  /** aria-valuenow 를 현재 좌측 컬럼 비율(0~100) 로 갱신 */
  const setAriaNowFromCols = (colsStr) => {
    try {
      const parts = (colsStr || '').split(' ')
      if (parts.length < 3) return
      const l = parseFloat(parts[0]) || 1.25
      const r = parseFloat(parts[2]) || 0.75
      resizer.setAttribute('aria-valuenow', String(Math.round((l / (l + r)) * 100)))
    } catch {}
  }

  /** 컬럼 비율을 localStorage에 저장하고 aria-valuenow도 갱신 */
  const persistCols = (colsStr) => {
    localStorage.setItem('layout.split', (colsStr || '').replace(/\s+/g, ' '))
    setAriaNowFromCols(colsStr)
  }

  const saved = localStorage.getItem('layout.split')
  if (saved && saved.includes('6px')) {
    layout.style.gridTemplateColumns = saved
    setAriaNowFromCols(saved)
  } else {
    layout.style.gridTemplateColumns = DEFAULT_COLS
    setAriaNowFromCols(DEFAULT_COLS)
  }

  let dragging = false       // 드래그 진행 중 여부
  let startX = 0             // 드래그 시작 시 clientX
  let startLeftWidthPx = 0   // 드래그 시작 시 좌측 컬럼 너비(px)
  const minLeft = 240        // 좌측 최소 너비(px)
  const minRight = 320       // 우측 최소 너비(px)

  /** 드래그 시작: 초기 위치·너비를 기록하고 커서 변경 */
  const beginDrag = (clientX) => {
    dragging = true
    startX = clientX
    const leftEl = layout.querySelector('.left-col')
    startLeftWidthPx = leftEl.getBoundingClientRect().width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  /** 포인터 이동: 이동량(dx)으로 컬럼 비율을 실시간 갱신 */
  const moveWithClientX = (clientX) => {
    if (!dragging) return
    const dx = clientX - startX
    const rect = layout.getBoundingClientRect()
    const resizerW = resizer.getBoundingClientRect().width || 6
    let left = startLeftWidthPx + dx
    let right = rect.width - left - resizerW
    if (left < minLeft)   left = minLeft
    if (right < minRight) right = minRight
    const cols = `${left / rect.width}fr ${resizerW}px ${right / rect.width}fr`
    layout.style.gridTemplateColumns = cols
    setAriaNowFromCols(cols)
  }

  /** 드래그 종료: 커서 복원 및 비율 저장 */
  const endDrag = () => {
    if (!dragging) return
    dragging = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    persistCols(getComputedStyle(layout).gridTemplateColumns)
  }

  resizer.addEventListener('mousedown',  (e) => { beginDrag(e.clientX); e.preventDefault() })
  window.addEventListener('mousemove',   (e) => moveWithClientX(e.clientX))
  window.addEventListener('mouseup',     endDrag)

  if (window.PointerEvent) {
    resizer.addEventListener('pointerdown', (e) => {
      resizer.setPointerCapture?.(e.pointerId)
      beginDrag(e.clientX)
      e.preventDefault()
    })
    window.addEventListener('pointermove', (e) => moveWithClientX(e.clientX))
    window.addEventListener('pointerup',   (e) => { resizer.releasePointerCapture?.(e.pointerId); endDrag() })
  }

  resizer.addEventListener('touchstart', (e) => {
    const t = e.touches?.[0]; if (t) { beginDrag(t.clientX); e.preventDefault() }
  }, { passive: false })
  window.addEventListener('touchmove',  (e) => { const t = e.touches?.[0]; if (t) moveWithClientX(t.clientX) }, { passive: false })
  window.addEventListener('touchend',   endDrag)

  resizer.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) return
    const parts = getComputedStyle(layout).gridTemplateColumns.split(' ')
    if (parts.length < 3) return
    let l = parseFloat(parts[0]) || 1.25
    let r = parseFloat(parts[2]) || 0.75
    const total = l + r

    if (e.key === 'Home' || e.key === 'Enter') {
      layout.style.gridTemplateColumns = DEFAULT_COLS
      persistCols(DEFAULT_COLS)
      e.preventDefault(); return
    }
    if (e.key === 'End') {
      const cols = '0.75fr 6px 1.25fr'
      layout.style.gridTemplateColumns = cols
      persistCols(cols)
      e.preventDefault(); return
    }

    const step = (e.shiftKey ? 0.10 : 0.04) * total
    let nl = l + (e.key === 'ArrowRight' ? step : -step)
    nl = Math.max(0.2, Math.min(nl, total - 0.3))
    const cols = `${nl}fr 6px ${total - nl}fr`
    layout.style.gridTemplateColumns = cols
    persistCols(cols)
    e.preventDefault()
  })

  resizer.addEventListener('dblclick', () => {
    layout.style.gridTemplateColumns = DEFAULT_COLS
    persistCols(DEFAULT_COLS)
  })
}
