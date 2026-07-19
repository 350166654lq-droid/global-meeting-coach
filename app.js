const STORAGE = {
  progress: "gmc-progress-v1",
  override: "gmc-session-override-v1",
  draftPrefix: "gmc-draft-v1-"
};

const DB_NAME = "global-meeting-coach";
const DB_VERSION = 1;
const RECORDING_STORE = "recordings";

const ROADMAP = [
  {
    week: "01",
    dates: "JUL 19 — JUL 25",
    title: "建立基线，学会进入话轮",
    detail: "把听懂和说出来分开测量；练主旨、立场、证据、风险和行动。",
    target: "2分钟真实材料 + 60秒无稿回应"
  },
  {
    week: "02",
    dates: "JUL 26 — AUG 01",
    title: "实时解码自然会议英语",
    detail: "弱读、连读、修正、插话、数字、否定和条件句。",
    target: "第二遍听力达到 8/10"
  },
  {
    week: "03",
    dates: "AUG 02 — AUG 08",
    title: "Medical · 入排与患者判断",
    detail: "Eligibility、screening、protocol wording 与 patient-level evidence。",
    target: "45秒资格判断 + 一个澄清问题"
  },
  {
    week: "04",
    dates: "AUG 09 — AUG 15",
    title: "Medical · 安全性与数据闭环",
    detail: "AE/SAE、lab、ConMed、endpoint、owner 与 action。",
    target: "60秒医学评估 + 明确下一步"
  },
  {
    week: "05",
    dates: "AUG 16 — AUG 22",
    title: "BD · 科学与转化逻辑",
    detail: "MoA、动物模型、PK/PD、PoC，以及数据与推断的边界。",
    target: "识别关键假设并提出一层追问"
  },
  {
    week: "06",
    dates: "AUG 23 — AUG 29",
    title: "BD · 差异化与开发风险",
    detail: "Clinical relevance、竞争壁垒、风险定价和证据成熟度。",
    target: "两层追问 + 90秒立场表达"
  },
  {
    week: "07",
    dates: "AUG 30 — SEP 05",
    title: "在压力下仍然保持结构",
    detail: "多说话人、口音、快语速、信息不完整、打断和礼貌反对。",
    target: "3秒启动，漏听后精准修复"
  },
  {
    week: "08",
    dates: "SEP 06 — SEP 12",
    title: "完整医学 / BD 会议模拟",
    detail: "连续追问、不同意见、总结共识和 owner / timeline。",
    target: "10–15分钟模拟会议不中断"
  },
  {
    week: "FINAL",
    dates: "SEP 13 — SEP 18",
    title: "终点评估与迁移巩固",
    detail: "使用全新材料复测，定位仍然限制你表现的一个环节。",
    target: "与Day 1同标准比较，不凭感觉"
  }
];

const MEETING_MOVES = [
  "进入话轮",
  "确认理解",
  "表达立场",
  "区分事实与推断",
  "限定结论",
  "指出核心风险",
  "提出行动",
  "总结闭环"
];

const state = {
  session: null,
  sessionEntries: [],
  activeSessionKey: null,
  latestSessionKey: null,
  localMedia: null,
  clock: {
    total: 3600,
    remaining: 3600,
    timer: null,
    running: false
  },
  recorder: {
    seconds: 90,
    remaining: 90,
    timer: null,
    stream: null,
    mediaRecorder: null,
    chunks: [],
    startedAt: null
  },
  recordings: [],
  toastTimer: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindNavigation();
  bindGlobalActions();
  bindClock();
  bindRecorder();
  bindScorecard();
  bindLibrary();
  renderRoadmap();

  state.session = await loadSession();
  await loadSessionIndex(state.session);
  state.clock.total = (state.session.sessionMinutes || 60) * 60;
  state.clock.remaining = state.clock.total;
  renderSession();
  updateClockDisplay();
  await loadSessionRecordings();
  renderProgress();
  restoreDraft();
  restoreScorecard();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

async function loadSession() {
  let fetched = null;
  try {
    const response = await fetch(`data/daily-session.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Daily session unavailable");
    fetched = await response.json();
  } catch (error) {
    showToast("未读取到每日任务，正在尝试使用本地导入内容。", true);
  }

  const override = readJSON(localStorage.getItem(STORAGE.override));
  if (
    override &&
    isValidSession(override) &&
    (!fetched || String(override.date || "") >= String(fetched.date || ""))
  ) {
    return override;
  }
  if (fetched && isValidSession(fetched)) return fetched;
  throw new Error("No valid training session found.");
}

async function loadSessionIndex(activeSession) {
  let entries = [];
  let latest = null;
  try {
    const response = await fetch(`data/session-index.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Session index unavailable");
    const index = await response.json();
    entries = Array.isArray(index.sessions)
      ? index.sessions.filter((item) => item && Number.isInteger(item.day) && item.date && item.path)
      : [];
    latest = index.latest || null;
  } catch (error) {
    entries = [];
  }

  const activeKey = sessionKey(activeSession);
  if (!entries.some((item) => sessionEntryKey(item) === activeKey)) {
    entries.unshift({
      day: activeSession.day,
      date: activeSession.date,
      mode: activeSession.mode,
      title: activeSession.source?.title,
      path: null
    });
  }

  entries.sort((a, b) => Number(b.day) - Number(a.day));
  state.sessionEntries = entries;
  state.activeSessionKey = activeKey;
  state.latestSessionKey = latest ? sessionEntryKey(latest) : sessionEntryKey(entries[0]);
}

function sessionKey(session) {
  return `${session?.date || "unknown"}::${Number(session?.day || 0)}`;
}

function sessionEntryKey(entry) {
  return `${entry?.date || "unknown"}::${Number(entry?.day || 0)}`;
}

function isValidSession(session) {
  return Boolean(
    session &&
      session.source &&
      session.source.title &&
      Array.isArray(session.coldListenQuestions) &&
      session.speaking
  );
}

function renderSession() {
  const session = state.session;
  const dayLabel = String(session.day || 1).padStart(2, "0");

  $("#phase-kicker").textContent = session.phase || "DAILY PRACTICE";
  $("#day-number").textContent = dayLabel;
  $("#total-days").textContent = `/ ${session.totalDays || 62}`;
  $("#complete-day-number").textContent = dayLabel;
  $("#ability-target").textContent = session.abilityTarget || "抓住会议的决策结构";
  $("#session-mode").textContent = session.mode || "GLOBAL MEETING";
  $("#source-organization").textContent = session.source.organization || "PUBLIC SOURCE";
  $("#source-title").textContent = session.source.title;
  $("#source-speaker").textContent = session.source.speaker || "Speaker not specified";
  $("#source-window").textContent = session.source.window || formatWindow(session.source.start, session.source.end);
  $("#source-link").href = session.source.url || "#";
  $("#speaking-prompt").textContent = session.speaking.prompt;
  $("#meeting-move-title").textContent = session.speaking.meetingMove || "表达立场";

  renderMedia($("#media-frame"), session.source.start, session.source.end);
  renderColdQuestions();
  renderSignals();
  renderAnswers();
  renderMicroClip();
  renderPrepFields();
  renderFollowUps();
  renderSentenceFrames();
  renderWeekDots();
  setCurrentRoadmapRow();
  renderSessionPicker();
}

function renderSessionPicker() {
  const select = $("#session-selector");
  if (!select) return;
  select.innerHTML = "";
  state.sessionEntries.forEach((entry) => {
    const option = document.createElement("option");
    const key = sessionEntryKey(entry);
    const prefix = key === state.latestSessionKey ? "当前" : "复习";
    option.value = key;
    option.textContent = `${prefix} · Day ${String(entry.day).padStart(2, "0")} · ${entry.mode || "SESSION"}`;
    select.append(option);
  });
  select.value = state.activeSessionKey;
  const isLatest = state.activeSessionKey === state.latestSessionKey;
  $("#session-selection-state").textContent = isLatest ? "当前训练" : "历史复习";
  $("#session-selection-state").classList.toggle("is-review", !isLatest);
}

function renderMedia(container, start, end, compact = false) {
  container.innerHTML = "";
  if (state.localMedia) {
    const tag = state.localMedia.type.startsWith("video/") ? "video" : "audio";
    const media = document.createElement(tag);
    media.controls = true;
    media.src = state.localMedia.url;
    media.preload = "metadata";
    container.append(media);
    return;
  }

  const source = state.session.source;
  const videoId = source.videoId || extractYouTubeId(source.url);
  if (videoId) {
    const iframe = document.createElement("iframe");
    const params = new URLSearchParams({
      start: String(Math.max(0, Math.floor(start || 0))),
      end: String(Math.max(Math.floor(end || 0), Math.floor(start || 0) + 1)),
      rel: "0",
      modestbranding: "1",
      cc_load_policy: "0",
      playsinline: "1"
    });
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
    iframe.title = compact ? "Micro clip player" : `${source.title} training window`;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
    container.append(iframe);
    return;
  }

  const fallback = document.createElement("div");
  fallback.className = "chart-empty";
  fallback.innerHTML = `<a href="${escapeAttribute(source.url || "#")}" target="_blank" rel="noreferrer">打开训练材料 ↗</a>`;
  container.append(fallback);
}

function renderColdQuestions() {
  const container = $("#cold-questions");
  container.innerHTML = state.session.coldListenQuestions
    .map(
      (item, index) => `
        <article class="question-card">
          <label for="cold-answer-${index}">${escapeHTML(item.label)}</label>
          <p>${escapeHTML(item.question)}</p>
          <textarea id="cold-answer-${index}" data-draft-key="cold-${index}" placeholder="只写关键词…"></textarea>
        </article>
      `
    )
    .join("");
  bindDraftInputs(container);
}

function renderSignals() {
  const container = $("#signal-checklist");
  container.innerHTML = (state.session.secondPassTargets || [])
    .map(
      (item, index) => `
        <button class="signal-card" type="button" data-signal-index="${index}">
          <span>${escapeHTML(item.tag)}</span>
          <p>${escapeHTML(item.prompt)}</p>
          <small>点击标记：我捕捉到了</small>
        </button>
      `
    )
    .join("");

  $$(".signal-card", container).forEach((card) => {
    card.addEventListener("click", () => {
      card.classList.toggle("is-checked");
      $("small", card).textContent = card.classList.contains("is-checked") ? "已捕捉，稍后核对" : "点击标记：我捕捉到了";
      saveDraft();
    });
  });
}

function renderAnswers() {
  const panel = $("#answer-panel");
  panel.hidden = true;
  $("#reveal-answers").hidden = false;
  panel.innerHTML = `
    <div class="answer-list">
      ${state.session.coldListenQuestions
        .map(
          (item) => `
            <article class="answer-item">
              <span>${escapeHTML(item.label)}</span>
              <p>${escapeHTML(item.answer || "请根据字幕自行核对。")}</p>
            </article>
          `
        )
        .join("")}
      ${(state.session.secondPassTargets || [])
        .map(
          (item) => `
            <article class="answer-item">
              <span>${escapeHTML(item.tag)} SIGNAL</span>
              <p>${escapeHTML(item.hint || "回到原音频确认具体表达。")}</p>
            </article>
          `
        )
        .join("")}
    </div>
    <div class="blind-spots">
      ${(state.session.blindSpots || []).map((item) => `<span>${escapeHTML(item)}</span>`).join("")}
    </div>
  `;

  $("#reveal-answers").onclick = () => {
    $("#reveal-answers").hidden = true;
    panel.hidden = false;
    saveDraft({ answersRevealed: true });
  };
}

function renderMicroClip() {
  const clip = state.session.microClip || {};
  $("#micro-window").textContent = `${clip.window || formatWindow(clip.start, clip.end)} · ${clip.duration || "MICRO"}`;
  $("#micro-transcript").textContent = clip.transcript || "Choose one short phrase from the meeting and make it automatic.";
  $("#micro-translation").textContent = clip.translation || "";
  renderMedia($("#micro-media-frame"), clip.start || state.session.source.start, clip.end || state.session.source.start + 15, true);
  $("#pronunciation-points").innerHTML = (clip.pronunciation || [])
    .map(
      (item) => `
        <div class="pronunciation-card">
          <span>${escapeHTML(item.label)}</span>
          <strong>${escapeHTML(item.text)}</strong>
          <small>${escapeHTML(item.note)}</small>
        </div>
      `
    )
    .join("");

  $$(".loop-dot").forEach((dot) => {
    dot.onclick = () => dot.classList.toggle("is-done");
  });
}

function renderPrepFields() {
  const container = $("#prep-fields");
  const labels = state.session.speaking.prepLabels || [
    { key: "position", label: "POSITION", placeholder: "你的结论" },
    { key: "evidence", label: "EVIDENCE", placeholder: "依据" },
    { key: "risk", label: "RISK", placeholder: "风险" },
    { key: "action", label: "ACTION", placeholder: "下一步" }
  ];
  container.innerHTML = labels
    .map(
      (item) => `
        <label class="prep-field">
          <span>${escapeHTML(item.label)}</span>
          <textarea data-draft-key="prep-${escapeAttribute(item.key)}" maxlength="180" placeholder="${escapeAttribute(item.placeholder)}"></textarea>
        </label>
      `
    )
    .join("");
  bindDraftInputs(container);
}

function renderFollowUps() {
  const container = $("#follow-up-cards");
  container.innerHTML = (state.session.speaking.followUps || [])
    .map(
      (question, index) => `
        <button class="follow-up-card" type="button" data-follow-up="${index}">
          <span>FOLLOW-UP ${String(index + 1).padStart(2, "0")}</span>
          <p>${escapeHTML(question)}</p>
        </button>
      `
    )
    .join("");

  $$(".follow-up-card", container).forEach((card) => {
    card.onclick = () => startFollowUpCountdown(card);
  });
}

function startFollowUpCountdown(card) {
  if ($(".countdown", card)) return;
  const overlay = document.createElement("div");
  overlay.className = "countdown";
  overlay.textContent = "3";
  card.append(overlay);
  let count = 3;
  const timer = setInterval(() => {
    count -= 1;
    if (count > 0) {
      overlay.textContent = String(count);
      return;
    }
    clearInterval(timer);
    overlay.textContent = "SPEAK";
    setTimeout(() => overlay.remove(), 850);
  }, 850);
}

function renderSentenceFrames() {
  $("#sentence-frames").innerHTML = (state.session.speaking.sentenceFrames || [])
    .map((frame) => `<div class="sentence-frame">${escapeHTML(frame)}</div>`)
    .join("");
}

function bindNavigation() {
  $$('[data-view]').forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
}

function switchView(view) {
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle("is-visible", panel.dataset.viewPanel === view));
  $$('.nav-item[data-view], .mobile-nav [data-view]').forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  const todayTitle = state.activeSessionKey === state.latestSessionKey
    ? "今日训练"
    : `复习 Day ${String(state.session?.day || 1).padStart(2, "0")}`;
  const titles = { today: todayTitle, roadmap: "八周路线", progress: "能力进展", library: "训练素材" };
  $("#page-title").textContent = titles[view] || "Meeting Coach";
  if (view === "progress") renderProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindGlobalActions() {
  const input = $("#import-session-input");
  $("#import-session-button").onclick = () => input.click();
  $("#restore-daily-session-button").onclick = restoreDailySession;
  $("#library-import-json").onclick = () => input.click();
  $("#library-restore-daily-session-button").onclick = restoreDailySession;
  input.addEventListener("change", handleSessionImport);
  $("#session-selector").addEventListener("change", handleSessionSelection);

  $$(".phase-row").forEach((row) => {
    row.onclick = () => {
      const target = document.getElementById(row.dataset.scrollTarget);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
}

async function handleSessionSelection(event) {
  const requestedKey = event.target.value;
  if (requestedKey === state.activeSessionKey) return;
  if (state.recorder.mediaRecorder?.state === "recording") {
    event.target.value = state.activeSessionKey;
    showToast("请先结束当前录音，再切换训练日。", true);
    return;
  }

  const entry = state.sessionEntries.find((item) => sessionEntryKey(item) === requestedKey);
  if (!entry?.path) {
    event.target.value = state.activeSessionKey;
    showToast("该训练日只有本地导入内容，无法重新读取。", true);
    return;
  }

  saveDraft();
  try {
    const response = await fetch(`${entry.path}?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Archived session unavailable");
    const archived = await response.json();
    if (!isValidSession(archived) || sessionKey(archived) !== requestedKey) {
      throw new Error("Archived session mismatch");
    }
    await activateSession(archived);
    const prefix = requestedKey === state.latestSessionKey ? "已回到" : "已打开";
    showToast(`${prefix} Day ${String(archived.day).padStart(2, "0")}。`, true);
  } catch (error) {
    event.target.value = state.activeSessionKey;
    showToast("该训练日暂时无法读取，请刷新后重试。", true);
  }
}

async function activateSession(session) {
  if (state.clock.timer) clearInterval(state.clock.timer);
  state.clock.timer = null;
  state.clock.running = false;
  state.session = session;
  state.activeSessionKey = sessionKey(session);
  if (state.localMedia?.url) URL.revokeObjectURL(state.localMedia.url);
  state.localMedia = null;
  state.clock.total = (session.sessionMinutes || 60) * 60;
  state.clock.remaining = state.clock.total;
  $("#clock-toggle").textContent = "开始训练";
  $("#clock-state").textContent = "READY";
  renderSession();
  updateClockDisplay();
  resetSessionControls();
  await loadSessionRecordings();
  restoreDraft();
  restoreScorecard();
  switchView("today");
}

function resetSessionControls() {
  $("#score-form").reset();
  $("#listening-score-value").textContent = $("#listening-score").value;
  $("#speaking-score-value").textContent = $("#speaking-score").value;
  $$(".loop-dot").forEach((dot) => dot.classList.remove("is-done"));
}

function restoreScorecard() {
  if (!state.session) return;
  const entry = getProgress().find(
    (item) => item.sessionDate === state.session.date && Number(item.day) === Number(state.session.day)
  );
  if (!entry) return;
  $("#listening-score").value = entry.listening;
  $("#speaking-score").value = entry.speaking;
  $("#listening-score-value").textContent = entry.listening;
  $("#speaking-score-value").textContent = entry.speaking;
  $("#start-latency").value = entry.latency ?? "";
  $("#longest-pause").value = entry.longestPause ?? "";
  $("#script-dependent").checked = Boolean(entry.scriptDependent);
  $("#daily-reflection").value = entry.reflection || "";
}

async function handleSessionImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!isValidSession(imported)) throw new Error("Invalid session schema");
    localStorage.setItem(STORAGE.override, JSON.stringify(imported));
    state.session = imported;
    await loadSessionIndex(imported);
    state.activeSessionKey = sessionKey(imported);
    state.localMedia = null;
    state.clock.total = (imported.sessionMinutes || 60) * 60;
    state.clock.remaining = state.clock.total;
    renderSession();
    resetSessionControls();
    updateClockDisplay();
    await loadSessionRecordings();
    restoreDraft();
    restoreScorecard();
    switchView("today");
    showToast("今日训练任务已导入。", true);
  } catch (error) {
    showToast("JSON格式不符合训练任务结构。", true);
  } finally {
    event.target.value = "";
  }
}

async function restoreDailySession() {
  try {
    localStorage.removeItem(STORAGE.override);
    const latest = await loadSession();
    await loadSessionIndex(latest);
    await activateSession(latest);
    showToast("已恢复自动每日任务；训练进度、草稿和录音均未删除。", true);
  } catch (error) {
    showToast("自动每日任务暂时不可用；请稍后重试。", true);
  }
}

function bindClock() {
  $("#clock-toggle").onclick = toggleSessionClock;
  $("#clock-reset").onclick = resetSessionClock;
}

function toggleSessionClock() {
  if (state.clock.running) {
    clearInterval(state.clock.timer);
    state.clock.running = false;
    $("#clock-toggle").textContent = "继续训练";
    $("#clock-state").textContent = "PAUSED";
    return;
  }

  state.clock.running = true;
  $("#clock-toggle").textContent = "暂停";
  $("#clock-state").textContent = "IN SESSION";
  state.clock.timer = setInterval(() => {
    state.clock.remaining -= 1;
    if (state.clock.remaining <= 0) {
      state.clock.remaining = 0;
      clearInterval(state.clock.timer);
      state.clock.running = false;
      $("#clock-toggle").textContent = "训练完成";
      $("#clock-state").textContent = "COMPLETE";
      showToast("60分钟训练时间结束。完成评分后保存记录。", true);
    }
    updateClockDisplay();
    updatePhaseByTime();
  }, 1000);
}

function resetSessionClock() {
  clearInterval(state.clock.timer);
  state.clock.running = false;
  state.clock.remaining = state.clock.total;
  $("#clock-toggle").textContent = "开始训练";
  $("#clock-state").textContent = "READY";
  updateClockDisplay();
  updatePhaseByTime();
}

function updateClockDisplay() {
  $("#session-clock").textContent = formatDuration(state.clock.remaining);
}

function updatePhaseByTime() {
  const elapsed = state.clock.total - state.clock.remaining;
  const thresholds = [0, 8 * 60, 18 * 60, 28 * 60, 38 * 60, 53 * 60];
  let current = 0;
  thresholds.forEach((value, index) => {
    if (elapsed >= value) current = index;
  });
  $$(".phase-row").forEach((row, index) => row.classList.toggle("is-current", index === current));
}

function bindRecorder() {
  $$(".round-tab").forEach((tab) => {
    tab.onclick = () => {
      if (state.recorder.mediaRecorder?.state === "recording") return;
      $$(".round-tab").forEach((item) => item.classList.remove("is-active"));
      tab.classList.add("is-active");
      state.recorder.seconds = Number(tab.dataset.seconds);
      state.recorder.remaining = state.recorder.seconds;
      updateRecordTimer();
    };
  });
  $("#record-button").onclick = toggleRecording;
}

async function toggleRecording() {
  if (state.recorder.mediaRecorder?.state === "recording") {
    stopRecording();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast("当前浏览器不支持录音，请使用最新版Chrome或Safari。", true);
    return;
  }

  if (!window.isSecureContext) {
    showToast("录音需要 HTTPS。请用部署后的 HTTPS 地址在 iPhone Safari 打开。", true);
    return;
  }

  try {
    state.recorder.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = getRecorderOptions();
    state.recorder.mediaRecorder = new MediaRecorder(state.recorder.stream, options);
    state.recorder.chunks = [];
    state.recorder.remaining = state.recorder.seconds;
    state.recorder.startedAt = Date.now();

    state.recorder.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) state.recorder.chunks.push(event.data);
    });
    state.recorder.mediaRecorder.addEventListener("stop", finishRecording);
    state.recorder.mediaRecorder.start();

    $("#record-button").classList.add("is-recording");
    $("#mic-status").classList.add("is-on");
    $("#mic-status").textContent = "RECORDING";
    $("#record-instruction").textContent = "先说立场。不要重新开始，不完美也继续。";

    state.recorder.timer = setInterval(() => {
      state.recorder.remaining -= 1;
      updateRecordTimer();
      if (state.recorder.remaining <= 0) stopRecording();
    }, 1000);
  } catch (error) {
    showToast("未获得麦克风权限。请在浏览器设置中允许访问麦克风。", true);
  }
}

function getRecorderOptions() {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
  const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : {};
}

function stopRecording() {
  clearInterval(state.recorder.timer);
  if (state.recorder.mediaRecorder?.state === "recording") state.recorder.mediaRecorder.stop();
}

async function finishRecording() {
  const recorder = state.recorder.mediaRecorder;
  const mimeType = recorder.mimeType || "audio/webm";
  const blob = new Blob(state.recorder.chunks, { type: mimeType });
  const elapsed = Math.max(1, Math.round((Date.now() - state.recorder.startedAt) / 1000));
  const item = {
    id: `${state.session.date}-${state.recorder.seconds}-${Date.now()}`,
    sessionDate: state.session.date,
    sessionDay: state.session.day,
    roundSeconds: state.recorder.seconds,
    elapsed,
    createdAt: new Date().toISOString(),
    mimeType,
    blob
  };

  try {
    await saveRecording(item);
    state.recordings.unshift(item);
    renderRecordings();
    showToast(`${state.recorder.seconds}秒轮次已保存到本机。`, true);
  } catch (error) {
    showToast("录音完成，但浏览器未能持久保存；本次页面内仍可播放。", true);
    state.recordings.unshift(item);
    renderRecordings();
  }

  state.recorder.stream?.getTracks().forEach((track) => track.stop());
  state.recorder.stream = null;
  state.recorder.mediaRecorder = null;
  state.recorder.chunks = [];
  state.recorder.remaining = state.recorder.seconds;
  $("#record-button").classList.remove("is-recording");
  $("#mic-status").classList.remove("is-on");
  $("#mic-status").textContent = "MIC OFF";
  $("#record-instruction").textContent = "回听后立刻做下一轮；不要改写成完整稿";
  updateRecordTimer();
}

function updateRecordTimer() {
  $("#record-timer").textContent = formatDuration(state.recorder.remaining);
}

async function loadSessionRecordings() {
  try {
    state.recordings = await getRecordings(state.session.date);
  } catch (error) {
    state.recordings = [];
  }
  renderRecordings();
}

function renderRecordings() {
  const container = $("#recordings-list");
  container.innerHTML = "";
  state.recordings.slice(0, 6).forEach((item) => {
    const url = URL.createObjectURL(item.blob);
    const row = document.createElement("div");
    row.className = "recording-item";
    row.innerHTML = `
      <span>${item.roundSeconds} SEC</span>
      <audio controls preload="metadata" src="${url}"></audio>
      <a href="${url}" download="meeting-coach-day-${state.session.day}-${item.roundSeconds}s.${extensionForMime(item.mimeType)}">下载</a>
    `;
    container.append(row);
  });
}

function bindScorecard() {
  ["listening", "speaking"].forEach((type) => {
    const input = $(`#${type}-score`);
    input.addEventListener("input", () => {
      $(`#${type}-score-value`).textContent = input.value;
    });
  });
  $("#score-form").addEventListener("submit", completeSession);
}

function completeSession(event) {
  event.preventDefault();
  const entry = {
    id: `${state.session.date}-${state.session.day}`,
    sessionDate: state.session.date,
    completedAt: new Date().toISOString(),
    day: state.session.day,
    title: state.session.source.title,
    mode: state.session.mode,
    abilityTarget: state.session.abilityTarget,
    meetingMove: state.session.speaking.meetingMove,
    listening: Number($("#listening-score").value),
    speaking: Number($("#speaking-score").value),
    latency: nullableNumber($("#start-latency").value),
    longestPause: nullableNumber($("#longest-pause").value),
    scriptDependent: $("#script-dependent").checked,
    reflection: $("#daily-reflection").value.trim(),
    recordingCount: state.recordings.length
  };

  const progress = getProgress();
  const existingIndex = progress.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) progress[existingIndex] = entry;
  else progress.push(entry);
  progress.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  localStorage.setItem(STORAGE.progress, JSON.stringify(progress));
  saveDraft({ completed: true });
  renderProgress();
  renderWeekDots();
  showToast(`Day ${String(state.session.day).padStart(2, "0")} 已保存。明天根据这组数据加难或回退。`, true);
}

function bindLibrary() {
  $("#local-media-button").onclick = () => $("#local-media-input").click();
  $("#local-media-input").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (state.localMedia?.url) URL.revokeObjectURL(state.localMedia.url);
    state.localMedia = { url: URL.createObjectURL(file), type: file.type, name: file.name };
    renderMedia($("#media-frame"), 0, 1);
    renderMedia($("#micro-media-frame"), 0, 1, true);
    switchView("today");
    showToast(`已打开本地材料：${file.name}。文件不会主动上传。`, true);
    event.target.value = "";
  });

  $("#quick-session-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#quick-title").value.trim();
    const url = $("#quick-url").value.trim();
    const start = Number($("#quick-start").value);
    const end = Number($("#quick-end").value);
    if (!title || !url || end <= start) {
      showToast("请检查链接和开始/结束秒数。", true);
      return;
    }
    const custom = makeQuickSession(title, url, start, end);
    localStorage.setItem(STORAGE.override, JSON.stringify(custom));
    state.session = custom;
    state.localMedia = null;
    renderSession();
    restoreDraft();
    switchView("today");
    showToast("自定义材料已建立。核对区需要你根据字幕自行完成。", true);
  });

  $("#export-progress").onclick = exportProgress;
}

function makeQuickSession(title, url, start, end) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...state.session,
    date: today,
    abilityTarget: "在陌生材料中重建会议的决策结构",
    mode: "CUSTOM · MEETING",
    source: {
      title,
      organization: "CUSTOM MATERIAL",
      speaker: "请在训练后补充说话人",
      url,
      videoId: extractYouTubeId(url),
      start,
      end,
      window: formatWindow(start, end)
    },
    coldListenQuestions: [
      { label: "TOPIC / DECISION", question: "这段讨论要理解或决定什么？", answer: "请在第三遍对照字幕后自行核对。" },
      { label: "SPEAKER POSITION", question: "每位说话人的核心立场是什么？", answer: "请在第三遍对照字幕后自行核对。" },
      { label: "EVIDENCE / DATA", question: "他们用什么数据、案例或逻辑支撑？", answer: "请在第三遍对照字幕后自行核对。" },
      { label: "RISK / UNCERTAINTY", question: "哪些条件、限制或不确定性改变结论？", answer: "请在第三遍对照字幕后自行核对。" },
      { label: "ACTION / OWNER", question: "下一步是什么，由谁负责？", answer: "请在第三遍对照字幕后自行核对。" }
    ],
    blindSpots: ["自定义材料尚无答案键；完成第三遍后，检查数字、否定、条件和owner。"],
    microClip: {
      ...state.session.microClip,
      start,
      end: Math.min(end, start + 15),
      window: formatWindow(start, Math.min(end, start + 15)),
      transcript: "从字幕中选择不超过25词、能改变结论的一句话。",
      translation: "完成前两遍后再填写。"
    }
  };
}

function renderRoadmap() {
  $("#roadmap-list").innerHTML = ROADMAP.map(
    (item, index) => `
      <article class="roadmap-row" data-roadmap-index="${index}">
        <div class="roadmap-week">${item.week}</div>
        <div class="roadmap-dates">${item.dates}</div>
        <div><h3>${item.title}</h3><p>${item.detail}</p></div>
        <div class="roadmap-target"><span>EXIT CRITERIA</span><strong>${item.target}</strong></div>
      </article>
    `
  ).join("");
}

function setCurrentRoadmapRow() {
  if (!state.session) return;
  const day = Number(state.session.day || 1);
  const index = day <= 56 ? Math.min(7, Math.floor((day - 1) / 7)) : 8;
  $$(".roadmap-row").forEach((row, rowIndex) => row.classList.toggle("is-current", rowIndex === index));
}

function renderProgress() {
  const progress = getProgress();
  const completed = progress.length;
  const listeningAverage = average(progress.map((item) => item.listening));
  const speakingAverage = average(progress.map((item) => item.speaking));
  const latencyValues = progress.map((item) => item.latency).filter((value) => Number.isFinite(value));
  const latencyAverage = average(latencyValues);

  $("#metric-completed").textContent = completed;
  $("#metric-listening").textContent = Number.isFinite(listeningAverage) ? listeningAverage.toFixed(1) : "—";
  $("#metric-speaking").textContent = Number.isFinite(speakingAverage) ? speakingAverage.toFixed(1) : "—";
  $("#metric-latency").textContent = Number.isFinite(latencyAverage) ? latencyAverage.toFixed(1) : "—";
  $("#streak-count").textContent = `${calculateStreak(progress)} days`;

  renderProgressChart(progress);
  renderMovesMatrix(progress);
  renderHistory(progress);
}

function renderProgressChart(progress) {
  const container = $("#progress-chart");
  if (!progress.length) {
    container.innerHTML = '<div class="chart-empty">完成第一次训练后，这里会出现趋势线。</div>';
    return;
  }

  const data = progress.slice(-14);
  const width = 760;
  const height = 270;
  const padX = 34;
  const padY = 22;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const x = (index) => padX + (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
  const y = (score) => padY + innerHeight - (Number(score) / 10) * innerHeight;
  const listenPoints = data.map((item, index) => `${x(index)},${y(item.listening)}`).join(" ");
  const speakPoints = data.map((item, index) => `${x(index)},${y(item.speaking)}`).join(" ");
  const grid = [0, 2, 4, 6, 8, 10]
    .map(
      (score) => `
        <line x1="${padX}" x2="${width - padX}" y1="${y(score)}" y2="${y(score)}" stroke="rgba(255,255,255,.08)" />
        <text x="4" y="${y(score) + 3}" fill="rgba(255,255,255,.32)" font-size="8" font-family="IBM Plex Mono">${score}</text>
      `
    )
    .join("");
  const labels = data
    .map(
      (item, index) => `
        <text x="${x(index)}" y="${height - 2}" text-anchor="middle" fill="rgba(255,255,255,.26)" font-size="7" font-family="IBM Plex Mono">D${item.day}</text>
      `
    )
    .join("");
  const dots = data
    .map(
      (item, index) => `
        <circle cx="${x(index)}" cy="${y(item.listening)}" r="4" fill="#4664ff" stroke="#19231f" stroke-width="2" />
        <circle cx="${x(index)}" cy="${y(item.speaking)}" r="4" fill="#ff7657" stroke="#19231f" stroke-width="2" />
      `
    )
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="听力和表达分数趋势">
      ${grid}
      <polyline points="${listenPoints}" fill="none" stroke="#4664ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="${speakPoints}" fill="none" stroke="#ff7657" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${labels}
    </svg>
  `;
}

function renderMovesMatrix(progress) {
  const counts = MEETING_MOVES.reduce((accumulator, move) => ({ ...accumulator, [move]: 0 }), {});
  progress.forEach((entry) => {
    if (counts[entry.meetingMove] !== undefined) counts[entry.meetingMove] += 1;
  });
  $("#moves-matrix").innerHTML = MEETING_MOVES.map(
    (move, index) => `
      <div class="move-row ${counts[move] ? "is-trained" : ""}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <strong>${move}</strong>
        <small>${counts[move]} sessions</small>
      </div>
    `
  ).join("");
}

function renderHistory(progress) {
  const container = $("#history-list");
  if (!progress.length) {
    container.innerHTML = '<div class="chart-empty">还没有训练记录。</div>';
    return;
  }
  container.innerHTML = [...progress]
    .reverse()
    .slice(0, 12)
    .map(
      (item) => `
        <div class="history-row">
          <time>${formatDate(item.completedAt)}</time>
          <strong>Day ${String(item.day).padStart(2, "0")} · ${escapeHTML(item.mode || "SESSION")}</strong>
          <span class="listen-score">L ${item.listening}/10</span>
          <span class="speak-score">S ${item.speaking}/10</span>
          <small>${item.scriptDependent ? "依赖讲稿" : "bullet only"}</small>
        </div>
      `
    )
    .join("");
}

function renderWeekDots() {
  if (!state.session) return;
  const progress = getProgress();
  const completedDates = new Set(progress.map((item) => item.completedAt.slice(0, 10)));
  const today = new Date();
  const dots = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    const key = toLocalDateKey(day);
    dots.push(`<span class="week-dot ${completedDates.has(key) ? "is-done" : ""}" title="${key}"></span>`);
  }
  $("#week-dots").innerHTML = dots.join("");
  $("#streak-count").textContent = `${calculateStreak(progress)} days`;
}

function calculateStreak(progress) {
  if (!progress.length) return 0;
  const dates = [...new Set(progress.map((item) => item.completedAt.slice(0, 10)))].sort().reverse();
  const latest = new Date(`${dates[0]}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dayGap = Math.round((today - latest) / 86400000);
  if (dayGap > 1) return 0;
  let streak = 1;
  let cursor = latest;
  for (let index = 1; index < dates.length; index += 1) {
    const candidate = new Date(`${dates[index]}T12:00:00`);
    const gap = Math.round((cursor - candidate) / 86400000);
    if (gap !== 1) break;
    streak += 1;
    cursor = candidate;
  }
  return streak;
}

function exportProgress() {
  const payload = {
    exportedAt: new Date().toISOString(),
    program: "Global Meeting Coach · 62 days",
    progress: getProgress()
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `global-meeting-coach-progress-${toLocalDateKey(new Date())}.json`
  );
  showToast("训练记录已导出。", true);
}

function bindDraftInputs(root) {
  $$('[data-draft-key]', root).forEach((input) => input.addEventListener("input", debounce(saveDraft, 240)));
}

function saveDraft(extra = {}) {
  if (!state.session) return;
  const fields = {};
  $$('[data-draft-key]').forEach((input) => {
    fields[input.dataset.draftKey] = input.value;
  });
  const signals = $$(".signal-card").map((card) => card.classList.contains("is-checked"));
  const payload = {
    fields,
    signals,
    updatedAt: new Date().toISOString(),
    ...extra
  };
  localStorage.setItem(`${STORAGE.draftPrefix}${state.session.date}`, JSON.stringify(payload));
}

function restoreDraft() {
  if (!state.session) return;
  const draft = readJSON(localStorage.getItem(`${STORAGE.draftPrefix}${state.session.date}`));
  if (!draft) return;
  Object.entries(draft.fields || {}).forEach(([key, value]) => {
    const input = $(`[data-draft-key="${cssEscape(key)}"]`);
    if (input) input.value = value;
  });
  (draft.signals || []).forEach((checked, index) => {
    const card = $(`.signal-card[data-signal-index="${index}"]`);
    if (card && checked) {
      card.classList.add("is-checked");
      $("small", card).textContent = "已捕捉，稍后核对";
    }
  });
  if (draft.answersRevealed) {
    $("#reveal-answers").hidden = true;
    $("#answer-panel").hidden = false;
  }
}

function getProgress() {
  const progress = readJSON(localStorage.getItem(STORAGE.progress));
  return Array.isArray(progress) ? progress : [];
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDING_STORE)) {
        const store = database.createObjectStore(RECORDING_STORE, { keyPath: "id" });
        store.createIndex("sessionDate", "sessionDate", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRecording(recording) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECORDING_STORE, "readwrite");
    transaction.objectStore(RECORDING_STORE).put(recording);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function getRecordings(sessionDate) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECORDING_STORE, "readonly");
    const index = transaction.objectStore(RECORDING_STORE).index("sessionDate");
    const request = index.getAll(sessionDate);
    request.onsuccess = () => {
      const items = request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      database.close();
      resolve(items);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

function showToast(message, force = false) {
  const toast = $("#toast");
  if (!toast || (!force && toast.classList.contains("is-visible"))) return;
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatWindow(start, end) {
  return `${formatDuration(start || 0)}–${formatDuration(end || 0)}`;
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractYouTubeId(url = "") {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1).split("/")[0];
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2];
      return parsed.searchParams.get("v");
    }
  } catch (error) {
    return null;
  }
  return null;
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!clean.length) return NaN;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function extensionForMime(mime = "") {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readJSON(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHTML(value).replaceAll("`", "&#096;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function debounce(callback, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
