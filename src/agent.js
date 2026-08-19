/**
 * 에이전트 세션 관련 로직
 * - Not Ready 사유 목록 로드
 * - 기존 세션 채택 (adoptExistingSession)
 */
import { getApi } from './bp-adapter.js'
import { log, toast, extractLoginStateUsername } from './utils.js'
import { state } from './state.js'
import { updateUiByState, updateLoginStateLabel, updateAgentStateLabel } from './ui.js'
import { addEvent, LEVEL, CATEGORY } from './event-monitor.js'

// ── Not Ready 사유 목록 ───────────────────────────────────────────────────────

/**
 * API에서 Not Ready 사유 목록을 가져와 #notReadyReason 드롭다운을 채웁니다.
 * 응답에 사유 배열이 없거나 조회에 실패하면 '사유 없음' 안내 옵션을 표시합니다.
 */
export async function getAndRenderReasons() {
  try {
    const res = await getApi().getAgentNotReadyReasons()
    log(res)
    const sel = document.getElementById('notReadyReason')
    if (!sel) return
    sel.innerHTML = '<option value="">Not Ready 사유 선택</option>'
    const arr = res?.data.data
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach((reasonStr) => {
        const opt = document.createElement('option')
        opt.value = reasonStr
        opt.textContent = reasonStr
        sel.appendChild(opt)
      })
    } else {
      const opt = document.createElement('option')
      opt.value = ''
      opt.textContent = '(사유 없음 또는 권한/설정 필요)'
      sel.appendChild(opt)
    }
  } catch (e) {
    log('이석 사유 조회 실패: ' + (e.message || e))
  }
}

// ── 기존 세션 채택 ────────────────────────────────────────────────────────────

/**
 * 페이지 로드 시 이미 로그인된 BP 세션이 있는지 확인하고,
 * 있으면 로그인 상태를 복원해 에이전트 업무를 즉시 이어받습니다.
 *
 * 내부 동작:
 *   1. getLoginState() 호출
 *   2. 로그인됨 → state.isLoggedIn = true, 라벨/에이전트 상태/Not Ready 사유 갱신
 *   3. 로그인 안 됨 → state.isLoggedIn = false, UI 초기 상태로
 *   4. 예외 발생 시에도 UI는 로그아웃 상태로 안전하게 처리
 */
export async function adoptExistingSession() {
  try {
    const res = await getApi().getLoginState()
    if (res?.status === 'success' && res?.data?.isLoggedIn) {
      state.isLoggedIn = true
      updateUiByState()
      log({ info: '기존 세션 감지: 자동 로그인 처리', loginState: res.data })
      const currentUser = extractLoginStateUsername(res.data)
      addEvent(CATEGORY.SYSTEM, 'SESSION_RESTORED', currentUser || 'unknown', LEVEL.SUCCESS)
      updateLoginStateLabel(`로그인됨 (${currentUser || 'unknown'})`)
      try { await getAndRenderReasons() } catch {}
      try {
        const agentState = await getApi().getAgentState()
        log({ info: '현재 에이전트 상태', agentState })
        updateAgentStateLabel(agentState)
      } catch {}
      toast('기존 세션 사용')
    } else {
      state.isLoggedIn = false
      updateUiByState()
      addEvent(CATEGORY.SYSTEM, 'SESSION_NONE', '수동 로그인 필요', LEVEL.WARN)
      log('기존 로그인 세션 없음 (수동 로그인 필요)')
      updateLoginStateLabel('로그아웃됨')
    }
  } catch (e) {
    state.isLoggedIn = false
    updateUiByState()
    log('세션 채택 실패: ' + (e.message || e))
  }
}
