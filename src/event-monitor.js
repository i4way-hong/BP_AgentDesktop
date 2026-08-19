/**
 * 이벤트 스토어 (event-monitor.js)
 *
 * 목적: BP API 이벤트 / 시스템 메시지 / 사용자 액션을 구조화된 JSON 객체로
 *       저장·조회하고, 비즈니스 로직 훅을 제공합니다.
 *
 * ── 핵심 데이터 구조 ──────────────────────────────────────────────────────────
 * EventRecord {
 *   id         : number        // 단조 증가 일련번호
 *   isoTs      : string        // ISO 8601 타임스탬프
 *   ts         : number        // Date.now() 밀리초
 *   category   : Category      // 'SYSTEM' | 'BP_EVENT' | 'ACTION' | 'API_RESP'
 *   event      : string        // 이벤트 이름 (e.g. 'ON_LOGIN', 'INIT_START')
 *   level      : Level         // 'info' | 'success' | 'warn' | 'error' | 'system'
 *   summary    : string        // 한 줄 요약 (UI 표시용)
 *   payload    : object|null   // 원본 페이로드 (비즈니스 로직용)
 * }
 *
 * ── 내보내는 API ─────────────────────────────────────────────────────────────
 *   addEvent(category, event, summary, level, payload)
 *   getEventLog()          → EventRecord[] 전체 복사본
 *   getLastEvent(event)    → 해당 event 이름의 가장 최근 레코드
 *   getEventsByCategory(c) → 특정 카테고리 레코드 배열
 *   getEventsByLevel(min)  → 특정 레벨 이상 레코드 배열
 *   onEvent(handler)       → 신규 이벤트 발생 시 콜백 등록 (비즈니스 훅)
 *   offEvent(handler)      → 핸들러 등록 해제
 *   clearStore()           → 스토어 + UI 초기화
 *   LEVEL / CATEGORY       → 상수 객체
 */

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 이벤트 심각도 레벨 */
export const LEVEL = {
  SYSTEM:  'system',
  INFO:    'info',
  SUCCESS: 'success',
  WARN:    'warn',
  ERROR:   'error',
}

/** 이벤트 카테고리 */
export const CATEGORY = {
  SYSTEM:   'SYSTEM',    // 초기화·세션 등 내부 시스템 이벤트
  BP_EVENT: 'BP_EVENT',  // Bright Pattern API ON_* 콜백
  ACTION:   'ACTION',    // 버튼 클릭 등 사용자 액션
  API_RESP: 'API_RESP',  // API 호출 결과 응답
}

const LEVEL_ICON = {
  system:  '⚙️',
  info:    '🔵',
  success: '🟢',
  warn:    '🟡',
  error:   '🔴',
}

const MAX_RECORDS = 500
const MAX_ROWS    = 300

// ── 내부 상태 ─────────────────────────────────────────────────────────────────

let _seq       = 0
let _store     = []
const _handlers = new Set()

// ── 핵심 함수 ─────────────────────────────────────────────────────────────────

/**
 * 이벤트를 스토어에 추가하고 UI 패널을 갱신하며 구독 핸들러를 호출합니다.
 *
 * @param {string}      category  - CATEGORY 상수 중 하나
 * @param {string}      event     - 이벤트 이름 (e.g. 'ON_LOGIN', 'INIT_START')
 * @param {string}      [summary=''] - 한 줄 요약
 * @param {string}      [level=LEVEL.INFO] - LEVEL 상수 중 하나
 * @param {object|null} [payload=null] - 원본 페이로드 (비즈니스 로직에서 활용)
 * @returns {EventRecord} 생성된 레코드
 */
export function addEvent(category, event, summary = '', level = LEVEL.INFO, payload = null) {
  const now = new Date()
  const record = {
    id:      ++_seq,
    isoTs:   now.toISOString(),
    ts:      now.getTime(),
    category,
    event,
    level,
    summary,
    payload: payload ?? null,
  }

  _store.unshift(record)
  if (_store.length > MAX_RECORDS) _store.pop()

  _renderRow(record)

  _handlers.forEach((fn) => { try { fn(record) } catch {} })

  return record
}

// ── 조회 API ──────────────────────────────────────────────────────────────────

/**
 * 전체 이벤트 로그를 JSON 배열로 반환합니다 (최신 → 오래된 순).
 * @returns {EventRecord[]}
 */
export function getEventLog() {
  return [..._store]
}

/**
 * 특정 event 이름의 가장 최근 레코드를 반환합니다.
 * @param {string} eventName
 * @returns {EventRecord|null}
 */
export function getLastEvent(eventName) {
  return _store.find((r) => r.event === eventName) ?? null
}

/**
 * 특정 카테고리의 레코드 배열을 반환합니다.
 * @param {string} category - CATEGORY 상수 중 하나
 * @returns {EventRecord[]}
 */
export function getEventsByCategory(category) {
  return _store.filter((r) => r.category === category)
}

/**
 * 특정 레벨 이상의 레코드 배열을 반환합니다.
 * 순서: error(4) > warn(3) > success(2) > info(1) > system(0)
 * @param {string} minLevel - 최소 레벨 (LEVEL 상수)
 * @returns {EventRecord[]}
 */
export function getEventsByLevel(minLevel) {
  const ORDER = { error: 4, warn: 3, success: 2, info: 1, system: 0 }
  const min = ORDER[minLevel] ?? 0
  return _store.filter((r) => (ORDER[r.level] ?? 0) >= min)
}

// ── 구독 API (비즈니스 훅) ────────────────────────────────────────────────────

/**
 * 새 이벤트가 추가될 때마다 호출될 핸들러를 등록합니다.
 *
 * 사용 예:
 *   import { onEvent, CATEGORY } from './event-monitor.js'
 *   onEvent((rec) => {
 *     if (rec.event === 'ON_NEW_INTERACTION') {
 *       const ch = rec.payload?.channelType
 *       // 채널 유형별 비즈니스 로직
 *     }
 *   })
 *
 * @param {Function} handler - (record: EventRecord) => void
 */
export function onEvent(handler) {
  _handlers.add(handler)
}

/**
 * 등록된 핸들러를 제거합니다.
 * @param {Function} handler
 */
export function offEvent(handler) {
  _handlers.delete(handler)
}

// ── 초기화 ───────────────────────────────────────────────────────────────────

/**
 * 스토어와 UI 패널을 모두 초기화합니다.
 */
export function clearStore() {
  _store = []
  _seq   = 0
  const container = document.getElementById('eventMonitorBody')
  if (container) container.innerHTML = ''
}

// ── 내부: UI 렌더링 ───────────────────────────────────────────────────────────

function _renderRow(record) {
  const container = document.getElementById('eventMonitorBody')
  if (!container) return

  const d       = new Date(record.ts)
  const timeStr = d.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const msStr   = String(d.getMilliseconds()).padStart(3, '0')

  const row = document.createElement('div')
  row.className = `em-row em-${record.level}`
  row.dataset.id = record.id

  const timeEl  = document.createElement('span'); timeEl.className  = 'em-time';  timeEl.textContent  = `${timeStr}.${msStr}`
  const iconEl  = document.createElement('span'); iconEl.className  = 'em-icon';  iconEl.textContent  = LEVEL_ICON[record.level] || '🔵'
  const catEl   = document.createElement('span'); catEl.className   = 'em-cat';   catEl.textContent   = record.category
  const labelEl = document.createElement('span'); labelEl.className = 'em-label'; labelEl.textContent = record.event
  const detEl   = document.createElement('span'); detEl.className   = 'em-detail'; detEl.textContent  = record.summary ? `— ${record.summary}` : ''

  row.appendChild(timeEl); row.appendChild(iconEl); row.appendChild(catEl)
  row.appendChild(labelEl); row.appendChild(detEl)

  // payload가 있으면 클릭으로 확장
  if (record.payload !== null) {
    row.title  = 'payload 있음 — 클릭하여 확인'
    row.style.cursor = 'pointer'
    row.addEventListener('click', () => {
      const existing = row.nextSibling
      if (existing && existing.classList?.contains('em-payload')) { existing.remove(); return }
      const pre = document.createElement('pre')
      pre.className = 'em-payload'
      try { pre.textContent = JSON.stringify(record.payload, null, 2) } catch { pre.textContent = String(record.payload) }
      row.insertAdjacentElement('afterend', pre)
    })
  }

  container.insertBefore(row, container.firstChild)
  while (container.children.length > MAX_ROWS) container.removeChild(container.lastChild)
}
