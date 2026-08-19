// Bright Pattern Agent Desktop JS API 어댑터
// 참고 문서: https://help.brightpattern.com/5.19:AgentDesktop-client-side-javascript-api-specification/APIMethods

let adApi = null              // BP AdApi 인스턴스 (초기화 전 null)
let _ready = false            // ON_READY 이벤트 수신 또는 폴링 성공 여부
let _readyPromiseResolve = null
/** ON_READY 이벤트 또는 폴링이 완료될 때까지 대기할 수 있는 Promise */
const _readyPromise = new Promise((resolve) => { _readyPromiseResolve = resolve })
let _lastMountRoot = null     // 마지막으로 사용한 마운트 루트 요소
let _lastIframes = []         // 마운트 루트 내에 생성된 iframe 목록 (디버깅용)

/**
 * API 인스턴스가 초기화되어 있는지 반환합니다.
 * @returns {boolean}
 */
export function isReady() {
  return !!adApi
}

/**
 * 현재 BP API 인스턴스를 반환합니다.
 * 초기화되지 않은 경우 Error를 던집니다.
 * @returns {Object} BP AdApi 인스턴스
 */
export function getApi() {
  if (!adApi) throw new Error('API가 초기화되지 않았습니다.')
  return adApi
}

/**
 * 디버깅용 상태 스냅샷을 반환합니다.
 * 콘솔에서 window.__adApi, debugInfo() 등으로 현재 상태를 확인할 때 사용합니다.
 * @returns {{ apiLoaded, hasInstance, readySignaled, mountRoot, iframes }}
 */
export function debugInfo() {
  const ifrs = Array.from((_lastMountRoot || document).querySelectorAll('iframe'))
  return {
    apiLoaded: !!(window.brightpattern && window.brightpattern.AdApi),
    hasInstance: !!adApi,
    readySignaled: _ready,
    mountRoot: _lastMountRoot ? (_lastMountRoot.id || _lastMountRoot.tagName) : null,
    iframes: ifrs.map((f) => ({ src: f.getAttribute('src') || '', name: f.getAttribute('name') || '' })),
  }
}

/**
 * Bright Pattern AdApi를 초기화합니다.
 *
 * @param {Object}          options
 * @param {string}          options.bpatternDomain  - BP 테넌트 도메인 (필수)
 * @param {string}          [options.apiScriptUrl]  - API 스크립트 URL (기본값: https://{domain}/agent/communicator/adapters/api.js)
 * @param {HTMLElement}     [options.mountRoot]     - 위젯 마운트 대상 요소 (기본값: #bp-widget-root 또는 document.body)
 * @param {boolean}         [options.standalone]    - Standalone 모드 여부 (기본값: true)
 * @returns {Promise<Object>} 초기화된 AdApi 인스턴스
 */
export async function initAdApi({ bpatternDomain, apiScriptUrl, mountRoot, standalone = true } = {}) {
  if (!bpatternDomain) throw new Error('bpatternDomain이 필요합니다.')

  // Communicator API 스크립트 로드 (기본 경로 자동 시도)
  const scriptUrl = apiScriptUrl || `https://${bpatternDomain}/agent/communicator/adapters/api.js`
  await loadScriptOnce(scriptUrl)

  if (!window.brightpattern || !window.brightpattern.AdApi) {
    throw new Error('Bright Pattern API가 로드되지 않았습니다. 도메인, 스크립트 URL, 접근 권한을 확인하세요.')
  }

  // 반드시 new 로 인스턴스화
  adApi = new window.brightpattern.AdApi({
    standalone,
    mountRoot: mountRoot || document.getElementById('bp-widget-root') || document.body,
  })

  _lastMountRoot = mountRoot || document.getElementById('bp-widget-root') || document.body
  setTimeout(() => { _lastIframes = Array.from(_lastMountRoot.querySelectorAll('iframe')) }, 0)

  // ON_READY 수신 시 resolve (일부 환경에서는 이 이벤트가 제공되지 않을 수 있음)
  try {
    adApi.on && adApi.on('ON_READY', (p) => {
      _ready = true
      _readyPromiseResolve && _readyPromiseResolve(p)
    })
  } catch {}

  // 전역에 노출(디버깅용)
  window.__adApi = adApi
  return adApi
}

/**
 * Communicator가 실제로 응답 가능한 상태가 될 때까지 대기합니다.
 *
 * 준비 감지 방식 (둘 중 먼저 완료되는 쪽 사용):
 *   1. ON_READY 이벤트 수신 (_readyPromise)
 *   2. getLoginState() 폴링 — api_not_answer(6)/timeout(8) 이외의 응답 수신 시 준비 완료로 판단
 *
 * @param {number} [timeoutMs=20000] - 전체 대기 제한 시간 (ms)
 * @returns {Promise<boolean>}
 */
export async function waitForReady(timeoutMs = 20000) {
  if (_ready) return true
  let to
  const timeoutPromise = new Promise((_, reject) => {
    to = setTimeout(() => reject(new Error(`Communicator 준비 신호(ON_READY/handshake)를 ${timeoutMs}ms 내에 수신하지 못했습니다.`)), timeoutMs)
  })

  // 폴링 기반 핸드셰이크: getLoginState가 api_not_answer(6)/timeout(8)이 아닌 응답을 반환하면 준비된 것으로 간주
  const pollHandshake = async () => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        if (!adApi?.getLoginState) break
        const res = await adApi.getLoginState()
        if (res?.status === 'success') {
          _ready = true
          _readyPromiseResolve && _readyPromiseResolve({ via: 'poll_success' })
          return true
        }
        const code = res?.error?.code
        if (code !== 6 && code !== 8) { // 6: api_not_answer, 8: timeout
          _ready = true // 응답 경로는 열렸음(예: not_logged_in=2 등)
          _readyPromiseResolve && _readyPromiseResolve({ via: 'poll_error_non6_8', code })
          return true
        }
      } catch {
        // 네트워크/일시 오류: 계속 시도
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('handshake_poll_timeout')
  }

  try {
    const res = await Promise.race([
      _readyPromise, // ON_READY 이벤트 대기
      pollHandshake(), // 폴링 기반 준비 확인
      timeoutPromise,
    ])
    return !!res || _ready
  } finally {
    clearTimeout(to)
  }
}

/**
 * 기존 AdApi 인스턴스를 정리하고 새로 초기화합니다.
 * '재연결' 버튼에서 호출됩니다.
 *
 * @param {Object} options - initAdApi와 동일한 옵션
 * @returns {Promise<Object>} 새로 초기화된 AdApi 인스턴스
 */
export async function reinitAdApi({ bpatternDomain, apiScriptUrl, mountRoot, standalone = true } = {}) {
  // 기존 인스턴스 정리 후 재초기화
  try {
    if (adApi?.destroy) adApi.destroy()
  } catch {}
  adApi = null
  _lastIframes = []
  _ready = false
  return initAdApi({ bpatternDomain, apiScriptUrl, mountRoot, standalone })
}

const loadedScripts = new Set()

/**
 * 동일 URL의 스크립트가 이미 로드된 경우 중복 삽입을 방지합니다.
 * @param {string} src - 로드할 스크립트 URL
 * @returns {Promise<void>}
 */
function loadScriptOnce(src) {
  if (loadedScripts.has(src)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => { loadedScripts.add(src); resolve() }
    s.onerror = () => reject(new Error('API 스크립트 로드 실패: ' + src))
    document.head.appendChild(s)
  })
}
