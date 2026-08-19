/**
 * 채팅 상태 및 렌더링
 * - 채팅 세션 열기 / 초기화
 * - 메시지 / 시스템 메시지 렌더링
 * - 채팅·통화 페이로드 판별 유틸
 * - 서비스 목록 드롭다운 채우기
 */
import { log, toast, sanitizeText } from './utils.js'
import { state } from './state.js'
import { updateUiByState, updateActiveInteractionLabel } from './ui.js'

// ── 채팅 세션 상태 ────────────────────────────────────────────────────────────

/**
 * 현재 활성 채팅 세션의 상태를 담는 공유 객체.
 *
 * @property {string|null}  id       - 활성 인터랙션 ID (채팅 미활성 시 null)
 * @property {Object[]}     messages - 지금까지 렌더링된 메시지 목록
 * @property {Set<string>}  msgIds   - 중복 렌더링 방지를 위한 메시지 ID 집합
 * @property {string|null}  state    - 세션 상태 문자열 ('active' 등, 미사용 시 null)
 */
export const chatSession = {
  id: null,
  messages: [],
  msgIds: new Set(),
  state: null,
}

/** chatSession 객체를 초기값으로 리셋합니다. */
function resetChatSession() {
  chatSession.id = null
  chatSession.messages = []
  chatSession.msgIds = new Set()
  chatSession.state = null
}

// ── 채팅 UI 초기화 ────────────────────────────────────────────────────────────

/**
 * 채팅 영역 UI를 초기 상태로 되돌립니다.
 * 채팅 종료(인터랙션 제거) 이벤트에서 호출됩니다.
 */
export function resetChatUI() {
  resetChatSession()
  const area = document.getElementById('chatArea')
  const list = document.getElementById('messages')
  const input = document.getElementById('chatInput')
  const btnSend = document.getElementById('btnSend')
  if (area)    area.classList.add('hidden')
  if (list)    list.innerHTML = ''
  if (input)   input.value = ''
  if (btnSend) btnSend.disabled = true
  state.hasActiveChat = false
  updateUiByState()
}

/**
 * 신규 채팅 세션을 열고 UI를 채팅 모드로 전환합니다.
 *
 * @param {string} interactionId - 새로 열린 채팅의 인터랙션 ID
 */
export function openChat(interactionId) {
  resetChatSession()
  chatSession.id = interactionId
  chatSession.state = 'active'

  state.activeInteractionId = interactionId
  updateActiveInteractionLabel(interactionId)

  const area = document.getElementById('chatArea')
  const list = document.getElementById('messages')
  if (list) list.innerHTML = ''
  if (area) area.classList.remove('hidden')

  const btnSend = document.getElementById('btnSend')
  if (btnSend) btnSend.disabled = false

  renderSystem(`채팅 시작됨 (${interactionId})`)
  state.hasActiveChat = true
  updateUiByState()
}

// ── 렌더링 ────────────────────────────────────────────────────────────────────

/** 메시지 목록을 항상 최신 메시지가 보이도록 스크롤합니다. */
function ensureBottom() {
  try {
    const list = document.getElementById('messages')
    if (list) list.scrollTop = list.scrollHeight
  } catch {}
}

/**
 * 시스템 메시지(채팅 시작/종료 등)를 메시지 목록에 추가합니다.
 *
 * @param {string} text - 표시할 시스템 메시지 텍스트
 */
export function renderSystem(text) {
  const list = document.getElementById('messages')
  if (!list) return
  const div = document.createElement('div')
  div.className = 'msg system'
  div.textContent = text
  list.appendChild(div)
  ensureBottom()
}

/**
 * 단일 채팅 메시지를 메시지 목록에 렌더링합니다.
 * 같은 id의 메시지는 중복 추가되지 않습니다(msgIds Set으로 관리).
 *
 * @param {Object}      options
 * @param {string}      [options.id]        - 메시지 고유 ID (없으면 자동 생성)
 * @param {string}      options.text        - 메시지 본문
 * @param {string}      [options.direction] - 'agent'|'outbound' 또는 'customer'|'inbound'
 * @param {number}      [options.time]      - 타임스탬프 (밀리초). 없으면 현재 시각 사용
 * @param {string}      [options.from]      - 발신자 이름
 */
export function renderMessage({ id, text, direction, time, from }) {
  if (!id) id = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  if (chatSession.msgIds.has(id)) return
  chatSession.msgIds.add(id)

  const list = document.getElementById('messages')
  if (!list) return

  const dir = (direction || '').toLowerCase()
  const div = document.createElement('div')
  div.className = `msg ${
    dir === 'agent' || dir === 'outbound'
      ? 'agent'
      : dir === 'customer' || dir === 'inbound'
        ? 'customer'
        : 'system'
  }`

  const ts = time ? new Date(time) : new Date()
  const meta = document.createElement('div')
  meta.className = 'meta'
  meta.textContent = `[${ts.toLocaleTimeString()}] ${from || (dir === 'agent' ? 'Agent' : 'Customer')}`

  const body = document.createElement('div')
  body.className = 'text'
  body.textContent = sanitizeText(text)

  div.appendChild(meta)
  div.appendChild(body)
  list.appendChild(div)
  ensureBottom()
}

// ── 페이로드 판별 유틸 ────────────────────────────────────────────────────────

/**
 * 인터랙션 페이로드가 채팅(메시지) 채널인지 판별합니다.
 * channelType / type 필드에 'chat' 또는 'message' 가 포함되면 true.
 *
 * @param {Object} p - 인터랙션 페이로드
 * @returns {boolean}
 */
export function isChatPayload(p) {
  const t = (p?.channelType || p?.type || p?.data?.type || '').toString().toLowerCase()
  return t.includes('chat') || t.includes('messag') || t === ''
}

/**
 * 인터랙션 페이로드가 음성통화 채널인지 판별합니다.
 *
 * @param {Object} p - 인터랙션 페이로드
 * @returns {boolean}
 */
export function isCallPayload(p) {
  const t = (p?.channelType || p?.type || p?.data?.type || '').toString().toLowerCase()
  return t.includes('voice') || t.includes('call')
}

/**
 * 인터랙션 페이로드에서 인터랙션 ID를 추출합니다.
 * 여러 필드명을 순서대로 시도합니다.
 *
 * @param {Object} p - 인터랙션 페이로드
 * @returns {string|null}
 */
export function getInteractionIdFromPayload(p) {
  return (
    p?.interactionId ||
    p?.id ||
    p?.data?.interactionId ||
    p?.data?.id ||
    p?.interaction?.id ||
    null
  )
}

/**
 * 인터랙션 페이로드에서 메시지 배열을 추출해 정규화된 객체 배열로 반환합니다.
 * messages / data.messages / payload.messages / message / data.lastMessage 등
 * 다양한 응답 형식을 모두 처리합니다.
 *
 * @param {Object} p - 인터랙션 페이로드
 * @returns {{ id, text, direction, time, from }[]}
 */
export function extractMessagesFromPayload(p) {
  const candidates = []
  if (Array.isArray(p?.messages))           candidates.push(...p.messages)
  if (Array.isArray(p?.data?.messages))     candidates.push(...p.data.messages)
  if (Array.isArray(p?.payload?.messages))  candidates.push(...p.payload.messages)
  if (p?.message)                           candidates.push(p.message)
  if (p?.data?.lastMessage)                 candidates.push(p.data.lastMessage)

  return candidates.map((m) => ({
    id:        m?.id || m?.messageId || m?._id,
    text:      m?.text || m?.body || m?.content?.text || m?.message || '',
    direction: (m?.direction || m?.dir || m?.from?.type || m?.from || '').toString().toLowerCase(),
    time:      m?.time || m?.timestamp || Date.now(),
    from:      m?.from?.name || m?.author?.name || m?.sender?.name || m?.from || undefined,
  }))
}

// ── 서비스 드롭다운 ───────────────────────────────────────────────────────────

/**
 * 서비스 목록을 #serviceSelect 드롭다운에 채웁니다.
 * 빈 배열이거나 배열이 아닌 경우 '서비스 없음' 안내 옵션을 표시합니다.
 *
 * @param {Object[]|any[]} list - API에서 반환된 서비스 목록
 *   각 항목은 { id, name } 또는 { serviceId, serviceName } 등 다양한 형식을 지원합니다.
 */
export function populateServices(list) {
  const sel = document.getElementById('serviceSelect')
  if (!sel) return
  sel.innerHTML = '<option value="">서비스 선택</option>'

  if (!Array.isArray(list) || list.length === 0) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = '(서비스 없음 또는 권한/설정 필요)'
    sel.appendChild(opt)
    return
  }

  list.forEach((svc) => {
    const opt = document.createElement('option')
    const id   = svc?.id || svc?.serviceId || svc?.value || svc
    const name = svc?.name || svc?.serviceName || svc?.label || svc?.title || id
    opt.value = String(id)
    opt.textContent = String(name)
    sel.appendChild(opt)
  })
  toast(`서비스 ${list.length}개 로드됨`, 2000)
}
