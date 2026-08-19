/**
 * 유틸리티 함수 모음 (utils.js)
 *
 * 여러 모듈에서 공통으로 사용하는 순수 유틸 함수들을 모아둔 파일입니다.
 * UI·DOM에 직접 의존하는 코드는 ui.js에 두고,
 * 이 파일은 DOM 접근을 최소화하여 재사용성을 높입니다.
 *
 * 포함 내용:
 *   - 민감 정보 마스킹 (비밀번호·토큰·세션·전화번호)
 *   - 상태 로그 출력 (log) 및 토스트 알림 (toast)
 *   - API 에러 코드 → 한국어 힌트 매핑 (hintFrom)
 *   - 비동기 재시도/지수 백오프 (withRetry)
 *   - API 메서드 존재 여부 확인 후 안전 호출 (callApiOrWarn)
 *   - URL 파라미터 읽기 및 입력 필드 자동 채우기 (applyUrlParams)
 *   - 로그인 응답 객체에서 사용자명 추출 (extractLoginStateUsername)
 *   - HTML 특수문자 제거 없는 텍스트 정규화 (sanitizeText)
 */
import { getApi } from './bp-adapter.js'

// ── 마스킹 ───────────────────────────────────────────────────────────────────

/** 마스킹 활성화 여부. setMasking(false) 로 끌 수 있습니다. */
let maskLogs = true

/** 로그 마스킹 켜기/끄기 */
export function setMasking(on) { maskLogs = !!on }

/** 현재 마스킹 활성화 여부 반환 */
export function isMaskingEnabled() { return maskLogs }

/**
 * 숫자 문자열의 끝 4자리만 남기고 나머지를 '*'로 치환합니다.
 * 전화번호처럼 전체를 숨기기엔 너무 가리고, 그대로 두기엔 민감한 숫자열에 사용합니다.
 * @param {string} str - 마스킹할 문자열
 */

function maskDigitsKeepLast4(str) {
  try {
    const digits = (str || '').toString().replace(/\D/g, '')
    if (digits.length <= 4) return '*'.repeat(digits.length)
    return '*'.repeat(digits.length - 4) + digits.slice(-4)
  } catch { return '****' }
}

function maskPhoneInString(s) {
  try {
    // 8자리 이상의 숫자 패턴(공백·대시·괄호 포함)을 전화번호로 간주하고 마스킹
    const re = /(\+?\d[\d\-()\s]{6,}?\d)/g
    return s.replace(re, (m) => maskDigitsKeepLast4(m))
  } catch { return s }
}

/**
 * 로그 출력 전에 민감 정보를 마스킹합니다.
 * - 객체: JSON.stringify replacer를 통해 password·token·session 키 → '***',
 *         전화번호 관련 키(PHONE_KEYS) → 끝 4자리만 노출,
 *         128자 초과 문자열 or Bearer 토큰 → 앞 8자 + '…(masked)'
 * - 문자열: Bearer 토큰·sessionId 패턴 치환 후 전화번호 패턴 마스킹
 * @param {*} obj - 마스킹할 값 (객체·배열·문자열 모두 가능)
 */
export function mask(obj) {
  if (!maskLogs) return obj
  try {
    const PHONE_KEYS = ['phone', 'phonenumber', 'ani', 'msisdn', 'number', 'dest', 'destination']
    const replacer = (k, v) => {
      const key = (k || '').toLowerCase()
      if (key.includes('password') || key.includes('token') || key.includes('session')) return '***'
      if (typeof v === 'string' && v.length > 0) {
        if (v.startsWith('Bearer ') || v.length > 128) return v.slice(0, 8) + '…(masked)'
        if (PHONE_KEYS.includes(key)) return maskDigitsKeepLast4(v)
        return maskPhoneInString(v)
      }
      if (typeof v === 'number') {
        if (PHONE_KEYS.includes(key)) return '****' + String(v).slice(-4)
      }
      return v
    }
    if (typeof obj === 'string') {
      const s1 = obj
        .replace(/(Bearer\s+[A-Za-z0-9\-_.]+)/gi, '***')
        .replace(/(sessionId=\w+)/gi, '***')
      return maskPhoneInString(s1)
    }
    return JSON.parse(JSON.stringify(obj, replacer))
  } catch { return obj }
}

// ── 로그 / 토스트 ────────────────────────────────────────────────────────────

/**
 * 상태 로그 패널(#status)에 타임스탬프와 함께 메시지를 기록합니다.
 * 최신 항목이 위에 쌓이도록 prepend 방식으로 추가합니다.
 * @param {string|object} obj - 출력할 값. 객체는 JSON으로 직렬화됩니다.
 */
export function log(obj) {
  const el = document.getElementById('status')
  if (!el) return
  const ts = new Date().toISOString()
  const data = mask(obj)
  el.textContent =
    `${ts}\n` +
    (typeof data === 'string' ? data : JSON.stringify(data, null, 2)) +
    '\n\n' +
    el.textContent
}

/**
 * 화면 하단에 잠깐 표시되었다 사라지는 토스트 알림을 띄웁니다.
 * @param {string} msg - 표시할 메시지
 * @param {number} [ms=3000] - 표시 유지 시간(밀리초)
 */
export function toast(msg, ms = 3000) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

// ── 에러 힌트 ────────────────────────────────────────────────────────────────

/**
 * BP API 에러 코드 → 한국어 안내 문구 매핑 테이블.
 * hintFrom()에서 참조하며, 토스트로 사용자에게 표시됩니다.
 */
export const ERROR_HINT = {
  2:  'not_logged_in: 먼저 로그인하세요.',
  3:  'invalid_args: API 시그니처를 확인하세요.',
  6:  'api_not_answer: 도메인/스크립트/네트워크 확인.',
  8:  'timeout: 네트워크 지연 또는 서버 응답 없음.',
  9:  'not_allowed: 권한/상태를 확인하세요.',
  10: 'empty_number: 유효한 번호를 입력.',
  11: 'invalid_number: 번호 형식을 확인.',
  13: 'operation_not_allowed: 현재 상태에서 불가.',
  15: 'no_service_selected: 서비스 선택 필요.',
  16: 'service_not_found: 서비스 ID 확인.',
  99: 'unknown_error: 상세 로그 확인.',
}

/**
 * API 응답 객체에서 에러 코드 또는 메시지를 분석해 사람이 읽기 좋은 힌트 문자열을 반환합니다.
 * 힌트가 없으면 null을 반환합니다.
 * @param {object} res - BP API 응답 객체
 * @returns {string|null}
 */
export function hintFrom(res) {
  try {
    const c = res?.error?.code
    if (c && ERROR_HINT[c]) return ERROR_HINT[c]
    const msg = (res?.error?.message || '').toLowerCase()
    if (msg.includes('already logged in')) return '이미 로그인됨: 기존 세션 채택 시도.'
  } catch {}
  return null
}

// ── 재시도 / 안전 API 호출 ───────────────────────────────────────────────────

/**
 * 실패 시 지수 백오프(exponential backoff)로 fn을 최대 retries 회 재시도합니다.
 * 모든 시도가 실패하면 마지막 에러를 throw 합니다.
 * @param {Function} fn - 실행할 비동기 함수
 * @param {{ retries?: number, delay?: number, factor?: number }} [opts]
 *   - retries: 추가 재시도 횟수 (기본 2, 즉 최대 3회 시도)
 *   - delay: 첫 재시도 전 대기 시간 ms (기본 600)
 *   - factor: 대기 시간 증가 배수 (기본 1.6)
 */
export async function withRetry(fn, { retries = 2, delay = 600, factor = 1.6 } = {}) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try { return await fn() } catch (e) { lastErr = e }
    await new Promise((r) => setTimeout(r, delay))
    delay = Math.ceil(delay * factor)
  }
  throw lastErr
}

/** API 메서드가 존재하지 않는 테넌트/버전을 위한 안전 래퍼
 * 메서드가 없으면 에러 대신 경고 로그·토스트를 표시하고 error 객체를 반환합니다.
 * @param {string} methodName - 호출할 API 메서드 이름
 * @param {...*} args - 메서드에 전달할 인수
 */
export async function callApiOrWarn(methodName, ...args) {
  try {
    const api = getApi()
    const fn = api && api[methodName]
    if (typeof fn !== 'function') {
      const msg = `API 메서드 미지원: ${methodName} (테넌트 버전/권한 확인)`
      log(msg)
      toast(msg, 3500)
      return { status: 'error', error: { message: 'method_not_supported', method: methodName } }
    }
    return await fn.apply(api, args)
  } catch (e) {
    log(e.message || e)
    throw e
  }
}

// ── URL 파라미터 ─────────────────────────────────────────────────────────────

/**
 * URL 쿼리스트링에서 파라미터 값을 읽어 반환합니다.
 * 파싱 실패 시 null을 반환합니다.
 * @param {string} name - 파라미터 이름
 */
export function getUrlParam(name) {
  try {
    return new URL(window.location.href).searchParams.get(name)
  } catch { return null }
}

/**
 * URL 파라미터(bpatternDomain, standalone)를 읽어 입력 필드에 자동 채웁니다.
 * 예) ?bpatternDomain=example.brightpattern.com&standalone=true
 */
export function applyUrlParams() {
  const domain = getUrlParam('bpatternDomain')
  const standalone = getUrlParam('standalone')
  const domainEl = document.getElementById('domain')
  const standaloneEl = document.getElementById('standalone')
  const tenantEl = document.getElementById('tenant')
  if (domain && domainEl) domainEl.value = domain
  if (standalone != null && standaloneEl) standaloneEl.checked = standalone === 'true'
  if (domain && tenantEl) tenantEl.value = domain
}

// ── 로그인 상태에서 사용자명 추출 ────────────────────────────────────────────

/**
 * getLoginState() 응답 객체에서 사용자명을 방어적으로 추출합니다.
 * BP API 버전/구성에 따라 필드명이 다를 수 있어 여러 후보를 순서대로 시도합니다.
 * @param {object} stateData - getLoginState()의 data 필드
 * @returns {string|null} 사용자명 또는 null
 */
export function extractLoginStateUsername(stateData) {
  try {
    return (
      stateData?.userName ||
      stateData?.username ||
      stateData?.user?.name ||
      stateData?.user?.username ||
      stateData?.login ||
      stateData?.agentLogin ||
      stateData?.agent?.login ||
      null
    )
  } catch { return null }
}

// ── 텍스트 위생 처리 ─────────────────────────────────────────────────────────

/**
 * null/undefined를 빈 문자열로 변환합니다.
 * XSS 방지는 별도 처리(textContent 사용)로 대응하며,
 * 이 함수는 단순히 안전한 문자열 변환만 담당합니다.
 * @param {*} t
 */
export function sanitizeText(t) { return (t ?? '').toString() }
