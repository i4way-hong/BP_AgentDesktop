/**
 * 진입점 — 이벤트 핸들러 및 초기화 흐름
 *
 * 모듈 구조:
 *   state.js      - 공유 가변 상태
 *   utils.js      - 유틸리티 (마스킹, 로그, 토스트, 재시도 등)
 *   ui.js         - UI 상태 관리 및 DOM 설정
 *   chat.js       - 채팅 렌더링 및 페이로드 파싱
 *   agent.js      - 에이전트 세션 (사유 목록, 세션 채택)
 *   callbacks.js  - BP API 이벤트 바인딩
 *   main.js       - 버튼 이벤트 핸들러 / 초기화 흐름 (현재 파일)
 */
import { initAdApi, reinitAdApi, getApi, waitForReady } from './bp-adapter.js'
import { log, toast, withRetry, hintFrom, setMasking, applyUrlParams, extractLoginStateUsername } from './utils.js'
import { state } from './state.js'
import { updateUiByState, unhideAppSections, updateLoginStateLabel, updateAgentStateLabel, updateActiveInteractionLabel, setupCollapsibleSections, setupResizableLayout } from './ui.js'
import { openChat, renderMessage, populateServices } from './chat.js'
import { getAndRenderReasons, adoptExistingSession } from './agent.js'
import { bindCallbacks } from './callbacks.js'
import { addEvent, clearStore, LEVEL, CATEGORY } from './event-monitor.js'
import * as eventMonitor from './event-monitor.js'

// 브라우저 콘솔에서 이벤트 스토어를 직접 조회할 수 있도록 전역 노출
// 예: __em.getEventLog(), __em.getLastEvent('ON_LOGIN')
window.__em = eventMonitor

/** querySelector 단축 헬퍼 */
const $ = (sel) => document.querySelector(sel)

// ── 초기화 공통 플로우 ────────────────────────────────────────────────────────

/**
 * BP API 초기화 → Communicator 준비 대기 → 기존 세션 채택까지의
 * 전체 초기화 흐름을 실행합니다.
 *
 * 흐름:
 *   1. initAdApi()로 API 스크립트 로드 및 인스턴스 생성
 *   2. waitForReady()로 Communicator 핸드셰이크 대기 (최대 30초)
 *   3. 콜백 바인딩 (1회만)
 *   4. adoptExistingSession()으로 기존 로그인 세션 감지 및 복원
 *
 * 실패 시 상태를 initializing=false 로 되돌려 UI를 정상 복구합니다.
 */
async function doInitFlow() {
  try {
    state.initializing = true
    updateUiByState()
    const bpatternDomain = $('#domain').value.trim()
    const standalone = $('#standalone').checked
    addEvent(CATEGORY.SYSTEM, 'INIT_START', bpatternDomain, LEVEL.SYSTEM)
    await initAdApi({ bpatternDomain, standalone, mountRoot: $('#bp-widget-root') })
    log('API 초기화 완료. Communicator가 준비될 때까지 대기합니다...')
    try {
      await waitForReady(30000)
      state.apiReady = true
      state.initializing = false
      updateUiByState()
      addEvent(CATEGORY.SYSTEM, 'COMM_READY', 'Communicator 준비 완료', LEVEL.SUCCESS)
      log('Communicator 준비 완료. 세션 확인 중...')
      unhideAppSections()
      if (!state.callbacksBound) { bindCallbacks(); state.callbacksBound = true }
      await adoptExistingSession()
      toast('준비 완료')
    } catch (e) {
      state.initializing = false
      updateUiByState()
      addEvent(CATEGORY.SYSTEM, 'COMM_READY_FAIL', e.message || String(e), LEVEL.ERROR)
      log('Communicator 준비 실패: ' + (e.message || e))
      toast('준비 실패: 설정/네트워크 확인', 4000)
    }
  } catch (e) {
    state.initializing = false
    updateUiByState()
    addEvent(CATEGORY.SYSTEM, 'INIT_FAIL', e.message || String(e), LEVEL.ERROR)
    log(e.message || e)
    toast('초기화 실패', 3000)
  }
}

// ── DOM 준비 ─────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  // URL 파라미터를 입력 필드에 적용 (domain, standalone 등)
  applyUrlParams()

  // 로그 마스킹 체크박스 초기화
  const maskChk = document.getElementById('maskLogs')
  if (maskChk) { setMasking(maskChk.checked); maskChk.addEventListener('change', (e) => setMasking(e.target.checked)) }

  setupResizableLayout()
  setupCollapsibleSections()
  updateUiByState()

  document.getElementById('password').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // 폼 자동 제출 방지 (필요한 경우)
      $('#btnLogin').trigger('click');
    }
  });

  // ── 초기화 / 재연결 ──────────────────────────────────────────────────────
  $('#btnInit').addEventListener('click', () => doInitFlow())
  $('#btnReinit').addEventListener('click', async () => {
    try {
      await reinitAdApi({ bpatternDomain: $('#domain').value.trim(), standalone: $('#standalone').checked, mountRoot: $('#bp-widget-root') })
      await waitForReady(30000)
      state.apiReady = true; state.callbacksBound = false
      bindCallbacks(); state.callbacksBound = true
      updateUiByState(); unhideAppSections(); log('재초기화 완료')
    } catch (e) { log('재초기화 실패: ' + (e.message || e)) }
  })

  // ── 서비스 목록 / 드롭다운 동기화 ──────────────────────────────────────────
  // 서비스 목록
  $('#btnLoadServices').addEventListener('click', async () => {
    try {
      const r = await getApi().getServicesList(); log(r)
      const list = r?.data || r?.services || r?.data?.services || (Array.isArray(r) ? r : [])
      populateServices(list)
      if (!list || list.length === 0) toast('서비스 목록이 비어있습니다. 권한/설정을 확인하세요.', 3500)
    } catch (e) { log(e.message || e) }
  })
  document.getElementById('serviceSelect').addEventListener('change', async (e) => {
    try {
      const val = e.target.value; if (!val) return
      const manualInput = document.getElementById('serviceId'); if (manualInput) manualInput.value = val
      const r = await getApi().setService(val); log({ step: 'setService(bySelect)', result: r })
      if (r?.status === 'success') toast('서비스 선택됨', 1500); else { const h = hintFrom(r); if (h) toast(h, 4000) }
    } catch (err) { log(err.message || err) }
  })

  // ── 로그인 ───────────────────────────────────────────────────────────────
  // 이미 로그인 세션이 존재하는 경우 자동 강제 로그인을 1회 시도하기 위한 플래그
  let _autoForceTried = false
  $('#btnLogin').addEventListener('click', async () => {
    try {
      const username = $('#username').value.trim()
      const password = $('#password').value
      const tenant = $('#tenant').value.trim()
      const force = !!$('#forceLogin')?.checked
      try { await waitForReady(1) } catch {}
      updateLoginStateLabel('로그인 시도 중...')
      try {
        const stateRes = await getApi().getLoginState()
        if (stateRes?.status === 'success' && stateRes?.data?.isLoggedIn) {
          const currentUser = extractLoginStateUsername(stateRes.data)
          if (!force && (!username || (currentUser && currentUser.toLowerCase() === username.toLowerCase()))) {
            log({ info: '이미 로그인 상태. 기존 세션 사용', currentUser })
            state.isLoggedIn = true; updateUiByState(); await getAndRenderReasons()
            updateLoginStateLabel('로그인됨 (' + (currentUser || 'unknown') + ')'); return
          }
          if (!force && username && currentUser && currentUser.toLowerCase() !== username.toLowerCase()) {
            log({ warn: '다른 사용자 세션 감지 -> 전환 시도', currentUser, inputUsername: username })
            try { await getApi().logout() } catch (ex) { log('기존 세션 로그아웃 실패: ' + (ex.message || ex)) }
          }
        }
      } catch {}
      const doLogin = (forced) => forced ? getApi().login({ username, password, tenant }, true) : getApi().login({ username, password, tenant })
      const handleOk = async (user) => { state.isLoggedIn = true; updateUiByState(); await getAndRenderReasons(); updateLoginStateLabel('로그인됨 (' + user + ')') }
      if (force) {
        const first = await doLogin(false); log({ step: 'first_login_for_force', result: first })
        if (first.status === 'success') { await handleOk(username); toast('로그인 성공'); return }
        const forced = await doLogin(true); log({ step: 'forced_login', result: forced })
        if (forced.status === 'success') { await handleOk(username); toast('강제 로그인 성공') } else { const h = hintFrom(forced); if (h) toast(h, 4000) }
        return
      }
      const res = await withRetry(() => doLogin(false), { retries: 1, delay: 700 }); log(res)
      if (res.status === 'success') { await handleOk(username); toast('로그인 성공') }
      else {
        const h = hintFrom(res); if (h) toast(h, 4000)
        const msg = (res?.error?.message || '').toLowerCase()
        if (msg.includes('already logged in')) {
          await adoptExistingSession()
          if (!_autoForceTried) {
            _autoForceTried = true
            const s = await getApi().getLoginState().catch(() => null)
            if (!(s?.status === 'success' && s?.data?.isLoggedIn)) {
              const forced = await doLogin(true); log({ step: 'auto_forced_login', result: forced })
              if (forced.status === 'success') { await handleOk(username); toast('강제 로그인 성공') }
            }
          }
        }
      }
    } catch (e) { log(e.message || e); toast('로그인 실패', 3500)
    } finally { if (document.getElementById('maskLogs')?.checked) { const pw = document.getElementById('password'); if (pw) pw.value = '' } }
  })
  $('#btnLogout').addEventListener('click', async () => {
    try { const res = await getApi().logout(); log(res); state.isLoggedIn = false; updateUiByState() } catch (e) { log(e.message || e) }
  })
  $('#btnGetLoginState').addEventListener('click', async () => { try { log(await getApi().getLoginState()) } catch (e) { log(e.message || e) } })

  // ── 에이전트 상태 ─────────────────────────────────────────────────────────
  $('#btnGetAgentState').addEventListener('click', async () => {
    try { const res = await getApi().getAgentState(); log(res); updateAgentStateLabel(res) } catch (e) { log(e.message || e) }
  })
  $('#btnSetReady').addEventListener('click', async () => {
    try {
      const res = await getApi().setAgentState('ready'); log(res)
      if (res?.status === 'success') {
        state.lastNotReadyReason = null   // Ready 전환 시 저장된 이석 사유 초기화
        updateAgentStateLabel('ready'); toast('상태: Ready')
      }
      if (res?.status === 'error' && res?.error?.code === 3) toast('invalid_args: setAgentState("ready") 시그니처 확인', 3000)
    } catch (e) { log(e.message || e) }
  })
  $('#btnLoadReasons').addEventListener('click', () => getAndRenderReasons())
  $('#btnSetNotReady').addEventListener('click', async () => {
    try {
      const reason = document.getElementById('notReadyReason').value || undefined
      // 버튼 클릭 시 사유를 미리 저장 → ON_AGENT_STATE_CHANGE 페이로드에 reason 없을 때 폴백으로 사용
      state.lastNotReadyReason = reason || null
      const res = await getApi().setAgentState('not_ready', reason); log(res)
      if (res?.status === 'success') { updateAgentStateLabel(reason ? { state: 'not_ready', reason } : 'not_ready'); toast('상태: Not Ready') }
      if (res?.status === 'error' && res?.error?.code === 3) toast('invalid_args: setAgentState("not_ready", reasonId) 시그니처 확인', 3000)
    } catch (e) { log(e.message || e) }
  })

  // ── 채팅 ─────────────────────────────────────────────────────────────────
  $('#btnStartChat').addEventListener('click', async () => {
    try {
      const selectId = document.getElementById('serviceSelect')?.value
      const manualId = $('#serviceId').value.trim()
      if (!selectId && manualId) {
        const setRes = await withRetry(() => getApi().setService(manualId), { retries: 1 })
        log({ step: 'setService(manual)', result: setRes })
        if (setRes.status !== 'success') { const h = hintFrom(setRes); if (h) toast(h, 4000); log('서비스 선택 실패'); return }
      } else if (!selectId && !manualId) {
        toast('서비스를 먼저 선택하거나 서비스 ID를 입력하세요.', 3000); log('채팅 시작 실패: 서비스 미선택'); return
      }
      const res = await withRetry(() => getApi().startChat('web'), { retries: 1 }); log(res)
      if (res?.status === 'error') { const h = hintFrom(res); if (h) toast(h, 4000) }
      if (res.status === 'success') {
        const iid = res?.data?.interactionId || res?.interactionId || null
        if (iid) openChat(iid); else { const area = document.getElementById('chatArea'); if (area) area.classList.remove('hidden') }
        state.hasActiveChat = true; updateUiByState(); toast('채팅 시작')
      }
    } catch (e) { log(e.message || e) }
  })
  const btnSend = document.getElementById('btnSend')
  if (btnSend) {
    btnSend.addEventListener('click', async () => {
      try {
        const input = document.getElementById('chatInput')
        const txt = (input?.value || '').trim(); if (!txt) return
        const r = await withRetry(() => getApi().sendChatMessage(txt), { retries: 1 }); log(r)
        if (r?.status === 'success') { renderMessage({ text: txt, direction: 'agent', time: Date.now(), from: 'Agent' }); input.value = '' }
        else { const h = hintFrom(r); if (h) toast(h, 4000) }
      } catch (e) { log(e.message || e) }
    })
  }
  const chatInput = document.getElementById('chatInput')
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('btnSend')?.click() } })
  }

  // ── 통화(Call) 제어 ───────────────────────────────────────────────────────
  $('#btnStartCall').addEventListener('click', async () => {
    try {
      const number = $('#phoneNumber').value.trim()
      if (!number) { log('전화번호를 입력하세요.'); toast('전화번호를 입력하세요.', 2500); return }
      const res = await withRetry(() => getApi().startCall(number), { retries: 1 }); log(res)
      if (res?.status === 'success') {
        const iid = res?.data?.interactionId || res?.interactionId || null
        if (iid) { state.activeInteractionId = iid; state.activeCallId = iid; updateActiveInteractionLabel(iid) }
        state.hasActiveCall = true; updateUiByState(); toast('발신 중')
      } else { const h = hintFrom(res); if (h) toast(h, 4000) }
    } catch (e) { log(e.message || e) }
  })

  let isMuted = false   // 마이크 음소거 현재 상태
  let onHold = false    // 보류(Hold) 현재 상태

  $('#btnEndCall').addEventListener('click', async () => {
    try {
      // endCall은 공식 미문서 메서드. 문서 기준 동일 역할: leaveAndCompleteInteraction()
      // leaveInteraction() → ACW 진입, completeInteraction() → ACW 종료 순서와 동일 효과
      const r = await withRetry(() => getApi().leaveAndCompleteInteraction(), { retries: 1 }); log(r)
      if (r?.status === 'success') {
        state.hasActiveCall = false; state.activeCallId = null; state.activeInteractionId = null
        updateActiveInteractionLabel(null); isMuted = false; onHold = false
        document.getElementById('btnMuteToggle').textContent = '마이크 음소거'
        document.getElementById('btnHoldToggle').textContent = '보류(Hold)'
        updateUiByState(); toast('통화 종료')
      } else { const h = hintFrom(r); if (h) toast(h, 4000) }
    } catch (e) { log(e.message || e) }
  })
  $('#btnMuteToggle').addEventListener('click', async () => {
    try {
      isMuted = !isMuted
      const r = await withRetry(() => getApi().setCallMute(isMuted), { retries: 1 }); log(r)
      document.getElementById('btnMuteToggle').textContent = isMuted ? '마이크 음소거 해제' : '마이크 음소거'
    } catch (e) { log(e.message || e) }
  })
  $('#btnHoldToggle').addEventListener('click', async () => {
    try {
      onHold = !onHold
      const r = await withRetry(() => getApi().setCallHold(onHold), { retries: 1 }); log(r)
      document.getElementById('btnHoldToggle').textContent = onHold ? '보류 해제' : '보류(Hold)'
    } catch (e) { log(e.message || e) }
  })
  $('#btnSendDtmf').addEventListener('click', async () => {
    try {
      const digits = document.getElementById('dtmfDigits').value.trim()
      if (!digits) { toast('DTMF 숫자를 입력하세요.', 2500); return }
      const r = await withRetry(() => getApi().sendDtmf(digits), { retries: 1 }); log(r)
    } catch (e) { log(e.message || e) }
  })
  $('#btnConsultCall').addEventListener('click', async () => {
    try {
      const target = $('#consultTarget').value.trim(); if (!target) { toast('대상을 입력하세요.', 2500); return }
      const r = await withRetry(() => getApi().consultCall(target), { retries: 1 }); log(r)
      if (r?.status === 'success') toast('상담 콜 시작'); else { const h = hintFrom(r); if (h) toast(h, 4000) }
    } catch (e) { log(e.message || e) }
  })

  $('#btnInviteConf').addEventListener('click', async () => {
    try {
      const target = $('#consultTarget').value.trim(); if (!target) { toast('대상을 입력하세요.', 2500); return }
      const r = await withRetry(() => getApi().inviteToCallConference(target), { retries: 1 }); log(r)
      if (r?.status === 'success') toast('컨퍼런스 초대 완료'); else { const h = hintFrom(r); if (h) toast(h, 4000) }
    } catch (e) { log(e.message || e) }
  })
  $('#btnRemoveFromConf').addEventListener('click', async () => {
    try {
      const target = $('#consultTarget').value.trim(); if (!target) { toast('대상을 입력하세요.', 2500); return }
      const r = await withRetry(() => getApi().removeFromCallConference(target), { retries: 1 }); log(r)
      if (r?.status === 'success') toast('컨퍼런스에서 제거 완료'); else { const h = hintFrom(r); if (h) toast(h, 4000) }
    } catch (e) { log(e.message || e) }
  })
  $('#btnDestroyConf').addEventListener('click', async () => {
    try {
      const r = await withRetry(() => getApi().destroyCallConference(), { retries: 1 }); log(r)
      if (r?.status === 'success') toast('컨퍼런스 종료'); else { const h = hintFrom(r); if (h) toast(h, 4000) }
    } catch (e) { log(e.message || e) }
  })

  // ── 상호작용 완료/종료 ────────────────────────────────────────────────────
  $('#btnLeave').addEventListener('click', async () => { try { log(await getApi().leaveInteraction()) } catch (e) { log(e.message || e) } })
  $('#btnComplete').addEventListener('click', async () => { try { log(await getApi().completeInteraction()) } catch (e) { log(e.message || e) } })
  $('#btnLeaveComplete').addEventListener('click', async () => { try { log(await getApi().leaveAndCompleteInteraction()) } catch (e) { log(e.message || e) } })

  // ── 녹음 제어 ─────────────────────────────────────────────────────────────
  let recOn = false   // 통화 녹음 현재 상태
  $('#btnRecToggle').addEventListener('click', async () => {
    try {
      recOn = !recOn; const res = await getApi().setCallRecording(recOn); log(res)
      $('#btnRecToggle').textContent = recOn ? '통화 녹음 중지' : '통화 녹음 시작'
    } catch (e) { log(e.message || e) }
  })
  let screenMuteOn = false   // 스크린 녹음 음소거 현재 상태
  $('#btnScreenMuteToggle').addEventListener('click', async () => {
    try {
      screenMuteOn = !screenMuteOn; const res = await getApi().setScreenRecordingMute(screenMuteOn); log(res)
      $('#btnScreenMuteToggle').textContent = screenMuteOn ? '스크린 녹음 음소거 해제' : '스크린 녹음 음소거'
      const label = document.getElementById('screenRecStateLabel'); if (label) label.textContent = '스크린 녹음: ' + (screenMuteOn ? 'muted' : 'unmuted')
    } catch (e) { log(e.message || e) }
  })
  $('#btnGetScreenState').addEventListener('click', async () => {
    try {
      const res = await getApi().getScreenRecordingState(); log(res)
      const label = document.getElementById('screenRecStateLabel')
      const st = res?.data?.state || res?.state || (res?.data?.muted ? 'muted' : 'unmuted') || 'unknown'
      if (label) label.textContent = '스크린 녹음: ' + st
    } catch (e) { log(e.message || e) }
  })

  // ── 상호작용 공통 제어 ────────────────────────────────────────────────────
  $('#btnAccept').addEventListener('click', async () => { try { log(await getApi().acceptInteraction()) } catch (e) { log(e.message || e) } })
  $('#btnReject').addEventListener('click', async () => { try { log(await getApi().rejectInteraction()) } catch (e) { log(e.message || e) } })
  $('#btnSwitchActive').addEventListener('click', async () => {
    try {
      const iid = document.getElementById('switchInteractionId').value.trim() || state.activeInteractionId
      if (!iid) { log('전환할 Interaction ID가 없습니다.'); return }
      log(await getApi().switchActiveInteraction(iid))
    } catch (e) { log(e.message || e) }
  })
  $('#btnLoadDispositions').addEventListener('click', async () => {
    try {
      const r = await getApi().getDispositionsList(); log(r)
      const sel = document.getElementById('dispositionSelect')
      sel.innerHTML = '<option value="">Disposition 선택</option>'
      const arr = r?.data || []; if (Array.isArray(arr)) {
        arr.forEach((d) => { const opt = document.createElement('option'); opt.value = d?.id || d?.value || d; opt.textContent = d?.name || d?.label || d?.title || d?.id || d; sel.appendChild(opt) })
      }
    } catch (e) { log(e.message || e) }
  })
  $('#btnSetDisposition').addEventListener('click', async () => {
    try { const val = document.getElementById('dispositionSelect').value; if (!val) { log('Disposition을 선택하세요.'); return }; log(await getApi().setDisposition(val)) } catch (e) { log(e.message || e) }
  })
  $('#btnAddNote').addEventListener('click', async () => {
    try { const note = document.getElementById('noteText').value; if (!note) return; log(await getApi().addNote(note)) } catch (e) { log(e.message || e) }
  })
  $('#btnBlindTransfer').addEventListener('click', async () => {
    try { const t = document.getElementById('transferTarget').value.trim(); if (!t) { log('전달 대상을 입력하세요.'); return }; log(await getApi().blindTransfer(t)) } catch (e) { log(e.message || e) }
  })
  $('#btnTransfer').addEventListener('click', async () => {
    try {
      // transfer(customTransferData?, mainCallId?, consultCallId?) — 전화번호 인자 없음
      // 반드시 consultCall(번호)로 상담 콜 수립 후 이 버튼으로 전환 완료해야 함
      const r = await withRetry(() => getApi().transfer(), { retries: 1 }); log(r)
      if (r?.status === 'success') toast('전달 완료'); else { const h = hintFrom(r); if (h) toast(h, 4000) }
    } catch (e) { log(e.message || e) }
  })
  $('#btnAddAssocObject').addEventListener('click', async () => {
    try {
      const text = document.getElementById('assocObjectJson').value; if (!text) return
      let obj; try { obj = JSON.parse(text) } catch { log('유효한 JSON을 입력하세요.'); return }
      log(await getApi().addInteractionAssociatedObject(obj))
    } catch (e) { log(e.message || e) }
  })
  $('#btnSetActiveScreen').addEventListener('click', async () => {
    try { const scr = document.getElementById('activeScreenName').value.trim(); if (!scr) { log('스크린 이름을 입력하세요.'); return }; log(await getApi().setInteractionActiveScreen(scr)) } catch (e) { log(e.message || e) }
  })
  $('#btnSuggestChat').addEventListener('click', async () => {
    try { const txt = document.getElementById('suggestText').value; if (!txt) return; log(await getApi().suggestChatMessage(txt)) } catch (e) { log(e.message || e) }
  })

  // ── 위젯 최소화 ───────────────────────────────────────────────────────────
  const btnWidget = document.getElementById('btnToggleWidgetMinimize')
  if (btnWidget) {
    btnWidget.addEventListener('click', async () => {
      try {
        const toMinimize = btnWidget.textContent.includes('최소화')
        const r = await getApi().setWidgetMinimized(toMinimize); log(r)
        const label = document.getElementById('widgetStateLabel')
        if (toMinimize) { btnWidget.textContent = '위젯 복원'; if (label) label.textContent = '상태: minimized' }
        else { btnWidget.textContent = '위젯 최소화'; if (label) label.textContent = '상태: normal' }
      } catch (e) { log(e.message || e) }
    })
  }

  // ── 상태 로그: 저장 / 지우기 ─────────────────────────────────────────────
  document.getElementById('btnClearStatus')?.addEventListener('click', () => { const el = document.getElementById('status'); if (el) el.textContent = '' })
  document.getElementById('btnClearMonitor')?.addEventListener('click', () => clearStore())
  document.getElementById('btnSaveStatus')?.addEventListener('click', () => {
    try {
      const el = document.getElementById('status')
      const content = el?.textContent || ''
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      a.href = url; a.download = 'bp-status-log-' + ts + '.txt'
      document.body.appendChild(a); a.click()
      setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 0)
    } catch (e) { log('로그 저장 실패: ' + (e.message || e)) }
  })

  // ── 자동 초기화 ──────────────────────────────────────────────────────────
  // 페이지 로드 시 즉시 초기화 흐름 실행
  doInitFlow()
})
