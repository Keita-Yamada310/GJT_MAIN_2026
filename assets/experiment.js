const jsPsych = initJsPsych({
  show_progress_bar: TASK_MODE_CONFIG === "gjt_only",
  auto_update_progress_bar: false,
  message_progress_bar: "課題の進捗"
});

const sessionId = jsPsych.randomization.randomID(12);
const sessionStartMs = performance.now();
const sessionStartIso = new Date().toISOString();
let gjtStartMs = null;
let gjtEndMs = null;

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isLikelyMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
}

function deviceType() {
  if (/iPad|Tablet/i.test(navigator.userAgent)) return "tablet";
  if (isLikelyMobile()) return "mobile";
  return "desktop_or_laptop";
}

jsPsych.data.addProperties({
  session_id: sessionId,
  study: STUDY_NAME,
  jspsych_version: "8.2.3",
  session_start_iso: sessionStartIso,
  user_agent: navigator.userAgent,
  device_type: deviceType(),
  viewport_width: window.innerWidth,
  viewport_height: window.innerHeight,
  screen_width: window.screen.width,
  screen_height: window.screen.height,
  device_pixel_ratio: window.devicePixelRatio || 1,
  language: navigator.language || "",
  touch_points: navigator.maxTouchPoints || 0
});

const timeline = [];
const TASK_MODE = TASK_MODE_CONFIG;
const version = "main_gjt_teams_only_2026-10-05_v2";
jsPsych.data.addProperties({
  task_mode: TASK_MODE,
  experiment_version: version,
  stimulus_set_id: `main_gjt_30_set_${GJT_SET_ID}_2026-09-27`,
  gjt_set: GJT_SET_ID,
  counterbalance_sequence: ADMINISTRATION_LABEL === "pre" ? (GJT_SET_ID === "A" ? "AB" : "BA") : (GJT_SET_ID === "A" ? "BA" : "AB"),
  allocation_method: "teams_fixed_link",
  assignment_version: ASSIGNMENT_VERSION,
  planned_allocation_method: "department_adjacent_irt_pair_random",
  identity_verified: false,
  assigned_input_device: "physical_keyboard",
  administration_label: ADMINISTRATION_LABEL
});

// タブ移動・画面離脱をjsPsychのinteraction dataに記録。
jsPsych.data.addProperties({ interaction_recording_enabled: true });


function normalizeStudentNumber(value) {
  return String(value || "").normalize("NFKC").replace(/\s/g, "");
}
function normalizeJapaneseName(value) {
  return String(value || "").normalize("NFC").replace(/\s/g, "").replace(/𠮷/g, "吉");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
let enteredIdentity = null;
let identityConfirmed = false;
timeline.push({
  timeline: [
    {
      type: jsPsychSurveyHtmlForm,
      preamble: `<div class="task-card compact-card"><h1>英文判断課題（GJT）</h1><p>${ADMINISTRATION_LABEL === "pre" ? "プリ" : "ポスト"}・セット${GJT_SET_ID}</p><p>学籍番号と氏名を入力してください。</p></div>`,
      html: `<div class="participant-form">
        <label for="participant_id"><strong>ID（学籍番号）</strong></label>
        <input id="participant_id" name="participant_id" type="text" inputmode="numeric" required autocomplete="off" maxlength="20">
        <label for="participant_name_jp"><strong>氏名（日本語）</strong></label>
        <input id="participant_name_jp" name="participant_name_jp" type="text" required autocomplete="off" maxlength="80">
      </div>`,
      button_label: "次へ",
      data: {phase:"participant_info"},
      on_load: () => {
        const id = document.getElementById("participant_id");
        const name = document.getElementById("participant_name_jp");
        if (enteredIdentity) { id.value = enteredIdentity.participant_id; name.value = enteredIdentity.participant_name_jp; }
        const validate = () => {
          id.setCustomValidity(/^\d{5}$/.test(normalizeStudentNumber(id.value)) ? "" : "学籍番号を5桁の数字で入力してください。");
          name.setCustomValidity(normalizeJapaneseName(name.value) ? "" : "氏名を入力してください。");
        };
        id.addEventListener("input", validate); name.addEventListener("input", validate); validate();
      },
      on_finish: data => {
        enteredIdentity = {
          participant_id: normalizeStudentNumber(data.response.participant_id),
          student_number: normalizeStudentNumber(data.response.participant_id),
          participant_name_jp: String(data.response.participant_name_jp).trim(),
          participant_name_normalized: normalizeJapaneseName(data.response.participant_name_jp)
        };
        Object.assign(data, enteredIdentity); delete data.response;
      }
    },
    {
      type: jsPsychHtmlButtonResponse,
      stimulus: () => `<div class="task-card compact-card"><h2>入力内容の確認</h2><p>ID（学籍番号）：${escapeHtml(enteredIdentity.participant_id)}</p><p>氏名（日本語）：${escapeHtml(enteredIdentity.participant_name_jp)}</p><p>${ADMINISTRATION_LABEL === "pre" ? "プリ" : "ポスト"}・セット${GJT_SET_ID}</p><p>学籍番号・氏名が自分のものか確認してください。</p></div>`,
      choices: ["修正する", "確認して進む"],
      data: {phase:"participant_confirmation"},
      on_finish: data => {
        identityConfirmed = data.response === 1;
        if (identityConfirmed) jsPsych.data.addProperties({...enteredIdentity, identity_input_confirmed:true});
      }
    }
  ],
  loop_function: () => !identityConfirmed
});

// スマホSafariではフルスクリーンの挙動が不安定なため、PC系のみ全画面を試す。
const fullscreenConditional = {
  timeline: [{
    type: jsPsychFullscreen,
    fullscreen_mode: true,
    message: `<div class="task-card compact-card"><p>「全画面で開始」を押してください。</p></div>`,
    button_label: "全画面で開始",
    data: { phase: "fullscreen_start" }
  }],
  conditional_function: () => !isLikelyMobile()
};
if (TASK_MODE === "gjt_only") timeline.push(fullscreenConditional);

async function saveToDataPipe(csvText, filename) {
  const response = await fetch("https://pipe.jspsych.org/api/data/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      experimentID: DATAPIPE_EXPERIMENT_ID,
      filename,
      data: csvText
    })
  });
  let result = {};
  try { result = await response.json(); } catch (_) {}
  if (!response.ok || result.error || result.success === false) {
    throw new Error(result.message || `DataPipe returned HTTP ${response.status}`);
  }
  return { ...result, httpStatus: response.status };
}

if (TASK_MODE === "gjt_only") {
// ---------- Binary GJT ----------
timeline.push({
  type: jsPsychInstructions,
  pages: [
    `<div class="task-card instruction-card">
      <h2>英文判断課題（GJT）</h2>
      <p>英文が1文ずつ表示されます。</p>
      <p>英文が英語の文法として<strong>正しい場合は Yes</strong>、<strong>間違っている場合は No</strong>を選んでください。</p>
      <p>画面では、左が <strong>No</strong>、右が <strong>Yes</strong> です。</p>
      <p>キーボードでは、<strong>Aキー＝No</strong>、<strong>Lキー＝Yes</strong> です。</p>
      <p>各文は<strong>10秒以内</strong>に回答してください。</p>
    </div>`,
    `<div class="task-card instruction-card">
      <h2>回答上の注意</h2>
      <p>文の内容ではなく、英語の文法として判断してください。</p>
      <p>この課題では、<strong>答えの正しさ</strong>と、<strong>英文が表示されてから回答するまでの時間</strong>を記録します。</p>
      <p>英文をよく読み、正しいかどうか判断できたら、<strong>なるべく早く回答してください。</strong>速さだけを優先せず、正確に答えることも大切です。</p>
      <p><strong>No：Aキー</strong>　　<strong>Yes：Lキー</strong></p>
      <p>回答はキーボードのみで行ってください。</p>
      <p>迷った場合も、<strong>10秒以内</strong>にどちらかを選んでください。</p>
      <p>最初に練習を2問行い、その後${GJT_ITEM_COUNT}問の本課題に進みます。</p>
    </div>`
  ],
  show_clickable_nav: true,
  button_label_previous: "戻る",
  button_label_next: "次へ",
  data: { phase: "gjt_instructions" }
});

const gjtPracticeItems = [
  { practice_id: "GJT-P1", sentence: "The girl waited for the bus.", presented_status: "grammatical" },
  { practice_id: "GJT-P2", sentence: "The boy enjoyed to play football.", presented_status: "ungrammatical" }
];

// Fit a GJT sentence before revealing it.
// Keeping the sentence hidden during measurement prevents visible reflow/jitter
// on iPhone Safari. The minimum remains 13px.
function fitGjtSentenceToOneLine() {
  const el = document.querySelector(".gjt-sentence");
  if (!el) return;

  el.classList.remove("gjt-fit-ready");
  el.style.fontSize = "";

  const minimumSize = 13;
  let size = parseFloat(window.getComputedStyle(el).fontSize);

  // Use whole-pixel steps to reduce subpixel re-layout on mobile Safari.
  while (el.scrollWidth > el.clientWidth && size > minimumSize) {
    size = Math.max(minimumSize, size - 1);
    el.style.fontSize = `${size}px`;
  }

  el.classList.add("gjt-fit-ready");
}

let currentGjtKeyHandler = null;
let currentGjtInputMethod = null;
let currentGjtKey = null;

function removeGjtKeyHandler() {
  if (currentGjtKeyHandler) {
    document.removeEventListener("keydown", currentGjtKeyHandler);
    currentGjtKeyHandler = null;
  }
}

function makeGjtTrial(isPractice = false) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: function() {
      const sentence = jsPsych.evaluateTimelineVariable("sentence");
      const progress = isPractice
        ? "練習"
        : `GJT　${jsPsych.evaluateTimelineVariable("display_number")} / ${GJT_ITEM_COUNT}`;
      return `<div class="task-card gjt-card">
        <div class="task-progress">${progress}</div>
        <div class="gjt-sentence">${sentence}</div>
        <div class="timeout-note">10秒以内に選んでください。</div>
      </div>`;
    },
    choices: ["No", "Yes"],
    button_layout: "flex",
    button_html: (choice, choiceIndex) =>
      `<button class="jspsych-btn gjt-choice ${choiceIndex === 0 ? "choice-no" : "choice-yes"}"
        data-choice="${choiceIndex}" aria-label="${choiceIndex === 0 ? "No：文法として間違い" : "Yes：文法として正しい"}">
        <span class="gjt-choice-label">${choice}</span>
        <span class="gjt-key-hint">${choiceIndex === 0 ? "A" : "L"}</span>
      </button>`,
    trial_duration: GJT_TRIAL_DURATION_MS,
    on_load: function() {
      currentGjtInputMethod = null;
      currentGjtKey = null;
      removeGjtKeyHandler();

      // Measure after the trial DOM has been laid out, then reveal once.
      // A single requestAnimationFrame avoids a second visible resize.
      window.requestAnimationFrame(fitGjtSentenceToOneLine);

      const buttons = document.querySelectorAll(".binary-gjt .gjt-choice");
      buttons.forEach((button) => {
        button.style.pointerEvents = "none";
        button.tabIndex = -1;
        button.addEventListener("pointerdown", () => {
          currentGjtInputMethod = "button";
          currentGjtKey = null;
        }, { once: true });
      });

      currentGjtKeyHandler = function(event) {
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        const key = String(event.key || "").toLowerCase();
        let choiceIndex = null;
        if (key === "a") choiceIndex = 0; // No
        if (key === "l") choiceIndex = 1; // Yes
        if (choiceIndex === null) return;

        event.preventDefault();
        const target = document.querySelector(
          `.binary-gjt .gjt-choice[data-choice="${choiceIndex}"]`
        );
        if (!target || target.disabled) return;

        currentGjtInputMethod = "keyboard";
        currentGjtKey = key.toUpperCase();
        target.click();
      };
      document.addEventListener("keydown", currentGjtKeyHandler);
    },
    response_ends_trial: true,
    css_classes: ["binary-gjt"],
    data: function() {
      if (isPractice) {
        return {
          phase: "gjt_practice",
          practice_id: jsPsych.evaluateTimelineVariable("practice_id"),
          sentence_text: jsPsych.evaluateTimelineVariable("sentence"),
          presented_status: jsPsych.evaluateTimelineVariable("presented_status")
        };
      }
      return {
        phase: "gjt",
        item_id: jsPsych.evaluateTimelineVariable("item_id"),
        source_no: jsPsych.evaluateTimelineVariable("source_no"),
        presentation_order: jsPsych.evaluateTimelineVariable("display_number"),
        category: jsPsych.evaluateTimelineVariable("category"),
        target_verb: jsPsych.evaluateTimelineVariable("verb"),
        target_pattern: jsPsych.evaluateTimelineVariable("pattern"),
        sentence_text: jsPsych.evaluateTimelineVariable("sentence"),
        presented_status: jsPsych.evaluateTimelineVariable("presented_status"),
        error_type: jsPsych.evaluateTimelineVariable("error_type")
      };
    },
    on_finish: function(data) {
      removeGjtKeyHandler();
      data.judgment = data.response === null ? null : (Number(data.response) === 0 ? "ungrammatical" : "grammatical");
      data.answer_label = data.response === null ? null : (Number(data.response) === 0 ? "No" : "Yes");
      data.input_method = data.response === null ? null : (currentGjtInputMethod || "button");
      data.response_key = data.response === null ? null : currentGjtKey;
      data.timed_out = data.response === null;
      data.correct = data.response === null ? null : data.judgment === data.presented_status;
      if (!isPractice) {
        const gjtDone = jsPsych.data.get().filter({ phase: "gjt" }).count();
        jsPsych.progressBar.progress = Math.min(gjtDone / GJT_ITEM_COUNT, 1);
      }
    }
  };
}

timeline.push({
  timeline: [makeGjtTrial(true), {
    type: jsPsychHtmlButtonResponse,
    stimulus: () => {
      const last = jsPsych.data.get().last(1).values()[0];
      const expected = last.presented_status === "grammatical" ? "Yes（Lキー）" : "No（Aキー）";
      const result = last.timed_out ? "時間切れでした。" : last.correct ? "正解です。" : "不正解です。";
      return `<div class="task-card compact-card"><h2>${result}</h2><p>正しい回答：${expected}</p></div>`;
    },
    choices: [], trial_duration: 1000, response_ends_trial: false,
    data: {phase: "gjt_practice_feedback"}
  }],
  timeline_variables: gjtPracticeItems,
  randomize_order: false
});

timeline.push({
  type: jsPsychHtmlButtonResponse,
  stimulus: `<div class="task-card compact-card"><h2>練習終了</h2>
    <p>ここから英文判断課題${GJT_ITEM_COUNT}問です。</p></div>`,
  choices: ["GJTを始める"],
  data: { phase: "gjt_start" },
  on_start: () => { gjtStartMs = performance.now(); }
});

const orderedGjtItems = (RANDOMIZE_GJT_ITEMS ? jsPsych.randomization.shuffle(GJT_ITEMS) : [...GJT_ITEMS])
  .map((item, index) => ({ ...item, display_number: index + 1 }));

timeline.push({
  timeline: [makeGjtTrial(false)],
  timeline_variables: orderedGjtItems,
  randomize_order: false
});



// Save the GJT before starting the survey. The button is enabled only after online confirmation.
timeline.push({type: jsPsychHtmlButtonResponse,
  stimulus: `<div class="task-card compact-card"><h2>GJT終了</h2><p>GJTの回答を保存します。</p></div>`,
  choices: ["保存へ"], data: {phase: "gjt_transition"},
  on_start: () => { gjtEndMs = performance.now(); jsPsych.data.addProperties({gjt_total_rt_ms: Math.round(gjtEndMs - gjtStartMs)}); }
});
// Exit fullscreen before the save and survey.
timeline.push({type: jsPsychFullscreen, fullscreen_mode: false, data: {phase: "fullscreen_end"}});
}
function saveStage(stage, continueLabel) {
  const relevant = ["participant_info", "participant_confirmation", "fullscreen_start", "gjt_instructions", "gjt_practice", "gjt_practice_feedback", "gjt_start", "gjt"];
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="task-card save-message"><h2>GJTの回答を保存します</h2><p>保存完了まで画面を閉じないでください。</p><div id="save-status" role="status">保存中…</div><button id="retry-save" type="button" hidden>保存を再試行</button></div>`,
    choices: [continueLabel],
    data: { phase: `${stage}_save_status`, task_stage: stage },
    on_load: function() {
      const button = document.querySelector(".jspsych-btn");
      const status = document.getElementById("save-status");
      const retry = document.getElementById("retry-save");
      button.disabled = true;
      const pid = enteredIdentity.participant_id;
      const safePid = pid.replace(/[^A-Za-z0-9_-]/g, "_");
      const safeAdministration = ADMINISTRATION_LABEL.replace(/[^A-Za-z0-9_-]/g, "_");
      const filename = `${STUDY_NAME}_${safeAdministration}_${stage}_${safePid}_${sessionId}_${new Date().toISOString().replace(/[:.]/g,"-")}.csv`;
      const csvText = jsPsych.data.get().filterCustom(row => relevant.includes(row.phase) && (!["participant_info", "participant_confirmation"].includes(row.phase) || row.participant_id === enteredIdentity.participant_id && row.participant_name_jp === enteredIdentity.participant_name_jp)).csv();
      let fallbackDownloaded = false;
      async function attempt() {
        retry.hidden = true;
        status.textContent = "保存中…";
        try {
          if (!DATAPIPE_EXPERIMENT_ID.trim()) throw new Error("DataPipe Experiment ID is empty");
          const saveResult = await saveToDataPipe(csvText, filename);
          status.textContent = saveResult.httpStatus === 202
            ? "データはDataPipeに受け付けられ、保存先への送信待ちです。再送信せず、担当者が保存先を確認してください。"
            : "オンライン保存が完了しました。";
          button.disabled = false;
        } catch (error) {
          console.error("Save failed", error);
          if (ENABLE_LOCAL_CSV_FALLBACK && !fallbackDownloaded) {
            try {
              jsPsych.data.get().filterCustom(row => relevant.includes(row.phase) && (!["participant_info", "participant_confirmation"].includes(row.phase) || row.participant_id === enteredIdentity.participant_id && row.participant_name_jp === enteredIdentity.participant_name_jp)).localSave("csv", filename);
              fallbackDownloaded = true;
            } catch (downloadError) { console.error("Local save failed", downloadError); }
          }
          status.textContent = "オンライン保存に失敗しました。担当者に知らせ、再試行してください。";
          retry.hidden = false;
        }
      }
      retry.addEventListener("click", attempt);
      attempt();
    }
  };
}

timeline.push(saveStage("gjt", "終了"));
timeline.push({type: jsPsychHtmlButtonResponse,
  stimulus: '<div class="task-card compact-card"><h2>課題終了</h2><p>回答の送信処理が終わりました。担当者の指示に従って、この画面を閉じてください。</p></div>',
  choices: [], data:{phase:"task_complete"}
});
jsPsych.run(timeline);
