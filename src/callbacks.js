/**
 * Bright Pattern API 이벤트 콜백 바인딩
 * - safeOn: 이벤트 미지원 테넌트 방어 래퍼
 * - bindCallbacks: 모든 BP API 이벤트를 이벤트 모니터 + 기능별 핸들러로 처리
 */
import { isReady, getApi } from './bp-adapter.js'
import { log, toast, extractLoginStateUsername } from './utils.js'
import { state } from './state.js'
import { updateUiByState, updateLoginStateLabel, updateAgentStateLabel, updateActiveInteractionLabel } from './ui.js'
import {
  chatSession, openChat, resetChatUI, renderMessage, renderSystem,
  isChatPayload, getInteractionIdFromPayload, extractMessagesFromPayload,
} from './chat.js'
import { getAndRenderReasons } from './agent.js'
import { addEvent, LEVEL, CATEGORY } from './event-monitor.js'

// ── 안전 이벤트 바인딩 ────────────────────────────────────────────────────────

/**
 * API 인스턴스에 이벤트 핸들러를 등록합니다.
 * api.on이 없거나 이벤트가 지원되지 않는 테넌트에서도 예외 없이 동작합니다.
 */
export function safeOn(api, evt, handler) {
  try {
    if (api?.on) api.on(evt, handler)
  } catch {
    addEvent(CATEGORY.SYSTEM, 'BINDING_FAILED', evt, LEVEL.WARN)
    log(`이벤트 미지원 또는 바인딩 실패: ${evt}`)
  }
}

// ── 콜백 바인딩 ───────────────────────────────────────────────────────────────

export function bindCallbacks() {
  if (!isReady()) return
  const api = getApi()

  // ── ON_READY ───────────────────────────────────────────────────────────────
  safeOn(api, 'ON_READY', (p) => {
    addEvent(CATEGORY.BP_EVENT, 'ON_READY', 'Communicator 준비 완료', LEVEL.SUCCESS, p)
    log({ event: 'ON_READY', p })
  })

  // ── ON_LOGIN ───────────────────────────────────────────────────────────────
  safeOn(api, 'ON_LOGIN', (p) => {
    const u = extractLoginStateUsername(p?.data || p)
    addEvent(CATEGORY.BP_EVENT, 'ON_LOGIN', u || 'unknown', LEVEL.SUCCESS, p)
    state.isLoggedIn = true
    updateUiByState()
    log({ event: 'ON_LOGIN', p })
    getAndRenderReasons()
    updateLoginStateLabel(`로그인됨 (${u || 'unknown'})`)
  })

  // ── ON_LOGOUT ──────────────────────────────────────────────────────────────
  safeOn(api, 'ON_LOGOUT', (p) => {
    addEvent(CATEGORY.BP_EVENT, 'ON_LOGOUT', '', LEVEL.WARN, p)
    state.isLoggedIn = false
    updateUiByState()
    log({ event: 'ON_LOGOUT', p })
    updateLoginStateLabel('로그아웃됨')
  })

  // ── ON_AGENT_STATE_CHANGE ──────────────────────────────────────────────────
  safeOn(api, 'ON_AGENT_STATE_CHANGE', (p) => {
    try {
      const d = (typeof p === 'object' && p !== null) ? (p?.data ?? p) : {}
      const stateText = (typeof p === 'string') ? p
        : d?.state || d?.agentState || d?.stateName || p?.state || 'unknown'
      const reason = d?.reasonLabel || d?.reasonName || d?.reason || d?.reasonId
        || p?.reasonLabel || p?.reasonName || p?.reason || state.lastNotReadyReason || ''
      const detail = reason ? `${stateText} (${reason})` : stateText
      const lvl = stateText === 'ready' ? LEVEL.SUCCESS
        : stateText.includes('not') ? LEVEL.WARN
        : LEVEL.INFO
      addEvent(CATEGORY.BP_EVENT, 'ON_AGENT_STATE_CHANGE', detail, lvl, p)
      log({ event: 'ON_AGENT_STATE_CHANGE', p })
      updateAgentStateLabel(p)
    } catch (e) { log(e.message || e) }
  })

  // ── ON_NEW_INTERACTION ─────────────────────────────────────────────────────
  safeOn(api, 'ON_NEW_INTERACTION', (p) => {
    const iid = getInteractionIdFromPayload(p)
    if (!isChatPayload(p)) {
      const from = p?.data?.ani || p?.data?.from || p?.ani || p?.from || ''
      addEvent(CATEGORY.BP_EVENT, 'ON_NEW_INTERACTION', `📞 콜${from ? ' ' + from : ''}${iid ? ' / ' + String(iid).slice(-8) : ''}`, LEVEL.INFO, p)
      log({ event: 'ON_NEW_INTERACTION', p })
      if (iid) { state.activeCallId = iid; state.activeInteractionId = iid; updateActiveInteractionLabel(iid) }
      state.hasActiveCall = true
      updateUiByState()
      toast(`�� 인바운드 콜 수신${from ? ': ' + from : ''}`, 6000)
      return
    }
    addEvent(CATEGORY.BP_EVENT, 'ON_NEW_INTERACTION', `💬 채팅${iid ? ' / ' + String(iid).slice(-8) : ''}`, LEVEL.INFO, p)
    log({ event: 'ON_NEW_INTERACTION', p })
    if (iid) openChat(iid)
    extractMessagesFromPayload(p).forEach((m) => renderMessage(m))
    toast('💬 채팅 수신 - 수락(Accept) 버튼으로 응답하세요.', 6000)
  })

  // ── ON_INTERACTION_STATE_CHANGE ────────────────────────────────────────────
  safeOn(api, 'ON_INTERACTION_STATE_CHANGE', (p) => {
    const iid = p?.interactionId || p?.id || p?.data?.interactionId
    const s   = (p?.state || p?.interactionState || p?.data?.state || '').toLowerCase()
    const ch  = isChatPayload(p) ? '💬' : '📞'
    addEvent(CATEGORY.BP_EVENT, 'ON_INTERACTION_STATE_CHANGE', `${ch} ${s || '?'}${iid ? ' / ' + String(iid).slice(-8) : ''}`, LEVEL.INFO, p)
    log({ event: 'ON_INTERACTION_STATE_CHANGE', p })

    if (iid) { state.activeInteractionId = iid; updateActiveInteractionLabel(iid) }

    if (!isChatPayload(p)) {
      if (iid) state.activeCallId = iid
      if (s.includes('end') || s.includes('removed') || s.includes('complete')) {
        if (state.activeCallId && iid && state.activeCallId === iid) {
          state.hasActiveCall = false; state.activeCallId = null
        }
      } else { state.hasActiveCall = true }
      updateUiByState()
      return
    }

    const chatId = getInteractionIdFromPayload(p)
    if (chatId && !chatSession.id) openChat(chatId)
    if (chatSession.id && chatId && chatSession.id !== chatId) return

    extractMessagesFromPayload(p).forEach((m) => renderMessage(m))

    if (s.includes('end')) {
      renderSystem('채팅이 종료되었습니다.')
      chatSession.state = 'ended'
      const btnSend = document.getElementById('btnSend')
      if (btnSend) btnSend.disabled = true
      state.hasActiveChat = false
      updateUiByState()
    }
  })

  // ── ON_INTERACTION_REMOVED ─────────────────────────────────────────────────
  safeOn(api, 'ON_INTERACTION_REMOVED', (p) => {
    const iid = p?.interactionId || p?.id || p?.data?.interactionId
    const ch  = isChatPayload(p) ? '💬' : '📞'
    addEvent(CATEGORY.BP_EVENT, 'ON_INTERACTION_REMOVED', `${ch}${iid ? ' ' + String(iid).slice(-8) : ''}`, LEVEL.WARN, p)
    log({ event: 'ON_INTERACTION_REMOVED', p })

    if (state.activeInteractionId && iid && state.activeInteractionId === iid) {
      state.activeInteractionId = null; updateActiveInteractionLabel(null)
    }

    if (!isChatPayload(p)) {
      if (state.activeCallId && iid && state.activeCallId === iid) {
        state.hasActiveCall = false; state.activeCallId = null; updateUiByState()
      }
      return
    }

    const chatId = getInteractionIdFromPayload(p)
    if (chatSession.id && chatId && chatSession.id === chatId) {
      renderSystem('채팅 세션이 제거되었습니다.')
      resetChatUI()
    }
  })

  // ── ON_ACTIVE_INTERACTION_SWITCH ───────────────────────────────────────────
  safeOn(api, 'ON_ACTIVE_INTERACTION_SWITCH', (p) => {
    const iid = getInteractionIdFromPayload(p) || p?.data?.interactionId || p
    addEvent(CATEGORY.BP_EVENT, 'ON_ACTIVE_INTERACTION_SWITCH', iid ? String(iid).slice(-8) : '?', LEVEL.INFO, p)
    log({ event: 'ON_ACTIVE_INTERACTION_SWITCH', p })
    if (iid) { state.activeInteractionId = iid; updateActiveInteractionLabel(iid) }
  })

  // ── ON_WIDGET_MINIMIZED_CHANGE ─────────────────────────────────────────────
  safeOn(api, 'ON_WIDGET_MINIMIZED_CHANGE', (p) => {
    try {
      const minimized = (p?.data?.minimized ?? p?.minimized ?? p) === true
      addEvent(CATEGORY.BP_EVENT, 'ON_WIDGET_MINIMIZED_CHANGE', minimized ? 'minimized' : 'normal', LEVEL.INFO, p)
      const btn = document.getElementById('btnToggleWidgetMinimize')
      const label = document.getElementById('widgetStateLabel')
      if (btn)   btn.textContent = minimized ? '위젯 복원' : '위젯 최소화'
      if (label) label.textContent = `상태: ${minimized ? 'minimized' : 'normal'}`
      log({ event: 'ON_WIDGET_MINIMIZED_CHANGE', minimized, p })
    } catch (e) { log(e.message || e) }
  })

  // ── ON_SCREEN_RECORDING_STATE_CHANGE ──────────────────────────────────────
  safeOn(api, 'ON_SCREEN_RECORDING_STATE_CHANGE', (p) => {
    try {
      const st = p?.data?.state || p?.state || (p?.data?.muted ? 'muted' : null) || 'unknown'
      addEvent(CATEGORY.BP_EVENT, 'ON_SCREEN_RECORDING_STATE_CHANGE', st, LEVEL.INFO, p)
      log({ event: 'ON_SCREEN_RECORDING_STATE_CHANGE', p })
      const label = document.getElementById('screenRecStateLabel')
      if (label) label.textContent = `스크린 녹음: ${st}`
    } catch (e) { log(e.message || e) }
  })

  // ── ON_SOFTPHONE_STATUS_CHANGE ─────────────────────────────────────────────
  safeOn(api, 'ON_SOFTPHONE_STATUS_CHANGE', (p) => {
    const st = p?.data?.status || p?.status || p?.data?.state || p?.state || String(p ?? '')
    const lvl = (st === 'registered' || st === 'connected') ? LEVEL.SUCCESS
      : (st === 'failed' || st === 'error') ? LEVEL.ERROR : LEVEL.WARN
    addEvent(CATEGORY.BP_EVENT, 'ON_SOFTPHONE_STATUS_CHANGE', st, lvl, p)
    log({ event: 'ON_SOFTPHONE_STATUS_CHANGE', p })
    if (lvl === LEVEL.ERROR) toast(`⚠️ 소프트폰 오류: ${st}`, 5000)
  })

  // ── ON_PHONE_CAPABILITIES_CHANGE ───────────────────────────────────────────
  safeOn(api, 'ON_PHONE_CAPABILITIES_CHANGE', (p) => {
    const caps = p?.data || p || {}
    const summary = Object.entries(caps).map(([k, v]) => `${k}:${v}`).join(' ') || '?'
    addEvent(CATEGORY.BP_EVENT, 'ON_PHONE_CAPABILITIES_CHANGE', summary, LEVEL.INFO, p)
    log({ event: 'ON_PHONE_CAPABILITIES_CHANGE', p })
  })

  // ── ON_AUDIO_DEVICE_CHANGE ─────────────────────────────────────────────────
  safeOn(api, 'ON_AUDIO_DEVICE_CHANGE', (p) => {
    const device = p?.data?.label || p?.data?.deviceId || p?.label || '장치 변경됨'
    addEvent(CATEGORY.BP_EVENT, 'ON_AUDIO_DEVICE_CHANGE', device, LEVEL.INFO, p)
    log({ event: 'ON_AUDIO_DEVICE_CHANGE', p })
    toast(`🎧 오디오 장치 변경: ${device}`, 3000)
  })

  // ── ON_CALL_AUDIO_QUALITY_ALERT ────────────────────────────────────────────
  safeOn(api, 'ON_CALL_AUDIO_QUALITY_ALERT', (p) => {
    const level = p?.data?.level || p?.level || 'unknown'
    const reason = p?.data?.reason || p?.reason || ''
    const lvl = level === 'critical' ? LEVEL.ERROR : level === 'warning' ? LEVEL.WARN : LEVEL.INFO
    addEvent(CATEGORY.BP_EVENT, 'ON_CALL_AUDIO_QUALITY_ALERT', `레벨:${level}${reason ? ' ' + reason : ''}`, lvl, p)
    log({ event: 'ON_CALL_AUDIO_QUALITY_ALERT', p })
    if (lvl !== LEVEL.INFO) toast(`⚠️ 통화 음질 저하 (${level})`, 5000)
  })

  // ── ON_SAVE_ACTIVITY_RECORD ────────────────────────────────────────────────
  safeOn(api, 'ON_SAVE_ACTIVITY_RECORD', (p) => {
    const iid = p?.data?.interactionId || p?.interactionId || ''
    addEvent(CATEGORY.BP_EVENT, 'ON_SAVE_ACTIVITY_RECORD', iid ? `iid:${String(iid).slice(-8)}` : '', LEVEL.INFO, p)
    log({ event: 'ON_SAVE_ACTIVITY_RECORD', p })
    // 실제 CRM 연동 시 이곳에서 CRM 저장 로직 호출
  })

  // ── ON_REQUEST_TRANSFER_DATA ───────────────────────────────────────────────
  safeOn(api, 'ON_REQUEST_TRANSFER_DATA', (p) => {
    addEvent(CATEGORY.BP_EVENT, 'ON_REQUEST_TRANSFER_DATA', '전달 데이터 요청', LEVEL.INFO, p)
    log({ event: 'ON_REQUEST_TRANSFER_DATA', p })
    // 실제 CRM 연동 시 컨텍스트 데이터를 여기서 반환
  })

  // ── ON_LOAD_TRANSFER_DATA ──────────────────────────────────────────────────
  safeOn(api, 'ON_LOAD_TRANSFER_DATA', (p) => {
    const summary = p?.data ? JSON.stringify(p.data).slice(0, 60) : ''
    addEvent(CATEGORY.BP_EVENT, 'ON_LOAD_TRANSFER_DATA', summary, LEVEL.INFO, p)
    log({ event: 'ON_LOAD_TRANSFER_DATA', p })
  })

  // ── ON_WEB_SCREEN_POP_CUSTOM ───────────────────────────────────────────────
  safeOn(api, 'ON_WEB_SCREEN_POP_CUSTOM', (p) => {
    const url = p?.data?.url || p?.url || ''
    addEvent(CATEGORY.BP_EVENT, 'ON_WEB_SCREEN_POP_CUSTOM', url || '커스텀 스크린팝', LEVEL.INFO, p)
    log({ event: 'ON_WEB_SCREEN_POP_CUSTOM', p })
    if (url) toast(`🖥️ 스크린팝: ${url}`, 5000)
  })

  // ── ON_SERVER_ERROR ────────────────────────────────────────────────────────
  safeOn(api, 'ON_SERVER_ERROR', (p) => {
    const code = p?.error?.code || p?.code || ''
    const msg  = p?.error?.message || p?.message || String(p ?? '')
    addEvent(CATEGORY.BP_EVENT, 'ON_SERVER_ERROR', `${code ? 'code:' + code + ' ' : ''}${msg}`.slice(0, 80), LEVEL.ERROR, p)
    log({ event: 'ON_SERVER_ERROR', p })
    toast(`🔴 서버 오류${code ? ' (' + code + ')' : ''}: ${msg}`, 6000)
    if (code === 6 || msg.toLowerCase().includes('disconnect')) {
      state.apiReady = false; updateUiByState()
    }
  })

  // ── ON_AGENT_ITEM_VOICE_TRANSCRIPT ──────────────────────────────────────────────────
  safeOn(api, 'ON_AGENT_ITEM_VOICE_TRANSCRIPT', (p) => {
    //const summary = p?.data ? JSON.stringify(p.data).slice(0, 60) : ''
    //addEvent(CATEGORY.BP_EVENT, 'ON_LOAD_TRANSFER_DATA', summary, LEVEL.INFO, p)
    log({ event: 'ON_AGENT_ITEM_VOICE_TRANSCRIPT', p })
  })

}