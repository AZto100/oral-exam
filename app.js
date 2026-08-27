"use strict";

const $ = (id) => document.getElementById(id);

const state = {
  exam: null,
  studentNumber: "",
  firstName: "",
  questionIndex: 0,
  responses: [],
  speechEngine: null,
  listening: false,
  startedAt: null,
  completedAt: null,
  submission: null,
  manifest: []
};

function setStatus(el, text, kind = "") {
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

function sanitizeStudentNumber(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function validateIdentity() {
  state.studentNumber = sanitizeStudentNumber($("studentNumber").value);
  $("studentNumber").value = state.studentNumber;
  state.firstName = $("firstName").value.trim();
  if (!/^\d{8}$/.test(state.studentNumber)) return "Student number must contain exactly 8 digits.";
  if (!state.firstName) return "Enter your first name.";
  return "";
}

function rotatingCaesar(text, studentNumber, direction = 1) {
  if (!/^\d{8}$/.test(studentNumber)) throw new Error("Student number must contain exactly 8 digits.");
  const shifts = [...studentNumber].map(Number);
  let pointer = 0;
  let out = "";
  for (const ch of String(text)) {
    const code = ch.charCodeAt(0);
    let base = null;
    if (code >= 65 && code <= 90) base = 65;
    else if (code >= 97 && code <= 122) base = 97;
    if (base === null) {
      out += ch;
      continue;
    }
    const shift = shifts[pointer % shifts.length] * direction;
    const normalized = ((code - base + shift) % 26 + 26) % 26;
    out += String.fromCharCode(base + normalized);
    pointer += 1;
  }
  return out;
}

function parseTxtExam(text) {
  const exam = {
    id: "",
    title: "",
    version: "1",
    language: "en-ZA",
    instructions: "Answer each question in your own words.",
    access: { timeSource: "local", onTimeFailure: "deny" },
    speech: { engine: "whisper-wasm", model: "ggml-tiny.en-q5_1.bin", allowTypedOnlyFallback: false },
    questions: []
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.indexOf("=");
    if (p < 0) continue;
    const key = line.slice(0, p).trim().toUpperCase();
    const value = line.slice(p + 1).trim();
    if (key === "TITLE") exam.title = value;
    else if (key === "ID") exam.id = value;
    else if (key === "LANG") exam.language = value;
    else if (key === "START") exam.access.start = value;
    else if (key === "END") exam.access.end = value;
    else if (key === "TIME_SOURCE") exam.access.timeSource = value;
    else if (key === "Q") exam.questions.push({ id: `Q${exam.questions.length + 1}`, prompt: value });
  }
  if (!exam.id) exam.id = `local-${Date.now()}`;
  if (!exam.title) exam.title = "Local Oral Assessment";
  validateExam(exam);
  return exam;
}

function validateExam(exam) {
  if (!exam || typeof exam !== "object") throw new Error("Exam file is not a valid object.");
  if (!exam.id || !exam.title) throw new Error("Exam requires id and title.");
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) throw new Error("Exam contains no questions.");
  exam.language ||= "en-ZA";
  exam.instructions ||= "Answer each question in your own words.";
  exam.access ||= {};
  exam.access.timeSource ||= "local";
  exam.access.onTimeFailure ||= "deny";
  exam.speech ||= {};
  exam.speech.engine ||= "whisper-wasm";
  exam.speech.model ||= "ggml-tiny.en-q5_1.bin";
  if (exam.speech.allowTypedOnlyFallback === undefined) exam.speech.allowTypedOnlyFallback = false;
  exam.questions = exam.questions.map((q, i) => ({ id: q.id || `Q${i + 1}`, prompt: String(q.prompt || "").trim() })).filter(q => q.prompt);
  if (!exam.questions.length) throw new Error("Exam contains no usable questions.");
  return exam;
}

async function loadManifest() {
  try {
    const response = await fetch("exams/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.manifest = Array.isArray(data.exams) ? data.exams : [];
    const select = $("examSelect");
    select.innerHTML = '<option value="">Select assessment...</option>';
    for (const item of state.manifest) {
      const option = document.createElement("option");
      option.value = item.file;
      option.textContent = item.title || item.id || item.file;
      select.appendChild(option);
    }
  } catch (err) {
    $("examSelect").innerHTML = '<option value="">Manifest unavailable — use local file</option>';
    setStatus($("setupStatus"), `Could not load exam manifest: ${err.message}. You may load a local JSON/TXT exam file.`, "error");
  }
}

async function loadExamUrl(file) {
  const response = await fetch(file, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${file}: HTTP ${response.status}`);
  const text = await response.text();
  const exam = file.toLowerCase().endsWith(".txt") ? parseTxtExam(text) : validateExam(JSON.parse(text));
  setExam(exam);
}

function setExam(exam) {
  state.exam = validateExam(exam);
  $("examSummary").textContent = `${state.exam.title} — ${state.exam.questions.length} questions. ${state.exam.instructions}`;
  $("startBtn").disabled = false;
  setStatus($("setupStatus"), "Assessment loaded. Enter your identity, then check access and start.", "ok");
}

async function getGithubHttpDate() {
  const url = new URL(location.href);
  url.searchParams.set("_exam_time", String(Date.now()));
  const response = await fetch(url.toString(), { method: "HEAD", cache: "no-store" });
  const dateHeader = response.headers.get("Date");
  if (!dateHeader) throw new Error("No HTTP Date header was returned.");
  const parsed = new Date(dateHeader);
  if (Number.isNaN(parsed.getTime())) throw new Error("HTTP Date header was invalid.");
  return parsed;
}

async function getExamNow() {
  const mode = state.exam.access.timeSource || "local";
  if (mode === "local") return new Date();
  if (mode === "github-http-date") {
    try { return await getGithubHttpDate(); }
    catch (err) {
      if (state.exam.access.onTimeFailure === "local-fallback") return new Date();
      throw err;
    }
  }
  throw new Error(`Unknown time source: ${mode}`);
}

async function checkAccess() {
  const now = await getExamNow();
  const start = state.exam.access.start ? new Date(state.exam.access.start) : null;
  const end = state.exam.access.end ? new Date(state.exam.access.end) : null;
  if (start && Number.isNaN(start.getTime())) throw new Error("Exam START time is invalid.");
  if (end && Number.isNaN(end.getTime())) throw new Error("Exam END time is invalid.");
  if (start && now < start) throw new Error(`Assessment is not open yet. Opens ${start.toLocaleString()}.`);
  if (end && now > end) throw new Error(`Assessment access closed ${end.toLocaleString()}.`);
  return now;
}

// S-OE1W Objective 3 local speech controller.
// Captures microphone PCM in the browser, resamples to 16 kHz mono,
// feeds sequential chunks to whisper.cpp stream.wasm and appends transcript text.
const localSpeechEngine = {
  id: "whisper-wasm",
  ready: false,
  runtimeReady: false,
  modelReady: false,
  instance: 0,
  mediaStream: null,
  audioContext: null,
  sourceNode: null,
  processorNode: null,
  muteNode: null,
  captureChunks: [],
  captureSamples: 0,
  inputSampleRate: 0,
  onTranscript: null,
  processing: false,

  async prepare() {
    if (!window.WhisperAssetLoader) throw new Error("Whisper asset loader is missing.");
    const result = await window.WhisperAssetLoader.prepare({
      onStatus: (text) => setStatus($("setupStatus"), text),
      onProgress: (received, total) => {
        const mb = (received / 1024 / 1024).toFixed(1);
        const totalText = total ? ` / ${(total / 1024 / 1024).toFixed(1)} MB` : " MB";
        setStatus($("setupStatus"), `Loading local Whisper model: ${mb}${totalText}`);
      }
    });
    this.runtimeReady = !!result.runtimeReady;
    this.modelReady = !!result.modelReady;
    const Module = window.Module;
    if (!Module || typeof Module.init !== "function" || typeof Module.set_audio !== "function" || typeof Module.get_transcribed !== "function") {
      throw new Error("The loaded Whisper runtime does not expose the required stream functions.");
    }
    if (!this.instance) {
      this.instance = Module.init(window.WhisperAssetLoader.MODEL_FS_NAME, "en");
      if (!this.instance) throw new Error("Whisper could not initialise the local model.");
    }
    this.ready = true;
    return { ready: true, runtimeReady: true, modelReady: true, message: "Local Whisper speech engine ready." };
  },

  async start(onTranscript) {
    if (!this.ready || !this.instance) throw new Error("Local Whisper is not ready.");
    if (this.processing) throw new Error("The previous speech segment is still being transcribed.");
    if (state.listening) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not available in this browser.");

    this.onTranscript = onTranscript;
    this.captureChunks = [];
    this.captureSamples = 0;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error("Web Audio is unavailable in this browser.");
    this.audioContext = new AudioCtx();
    await this.audioContext.resume();
    this.inputSampleRate = this.audioContext.sampleRate;
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.muteNode = this.audioContext.createGain();
    this.muteNode.gain.value = 0;

    this.processorNode.onaudioprocess = (event) => {
      if (!state.listening) return;
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.captureChunks.push(copy);
      this.captureSamples += copy.length;
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.muteNode);
    this.muteNode.connect(this.audioContext.destination);
    state.listening = true;
    $("micBtn").disabled = true;
    $("stopMicBtn").disabled = false;
    setStatus($("speechStatus"), "Listening locally. Speak your answer, then press Stop Speaking & Transcribe.", "ok");
  },

  async stop() {
    if (!state.listening && !this.mediaStream) return;
    state.listening = false;
    $("stopMicBtn").disabled = true;
    this._releaseMicrophone();

    if (this.captureSamples < Math.max(1024, Math.floor(this.inputSampleRate * 0.25))) {
      this.captureChunks = [];
      this.captureSamples = 0;
      $("micBtn").disabled = false;
      setStatus($("speechStatus"), "No usable speech audio was captured. Press Start Speaking and try again.", "error");
      return;
    }

    this.processing = true;
    $("micBtn").disabled = true;
    $("acceptBtn").disabled = true;
    try {
      setStatus($("speechStatus"), "Processing speech locally with Whisper...");
      const pcm = mergeFloat32(this.captureChunks, this.captureSamples);
      const pcm16k = resampleMono(pcm, this.inputSampleRate, 16000);
      const transcript = await this._transcribeSequential(pcm16k);
      if (transcript) {
        this.onTranscript?.(transcript);
        setStatus($("speechStatus"), "Speech transcribed locally. You may edit the text or speak again.", "ok");
      } else {
        setStatus($("speechStatus"), "Whisper did not detect clear speech. You may try speaking again.", "error");
      }
    } finally {
      this.captureChunks = [];
      this.captureSamples = 0;
      this.processing = false;
      $("micBtn").disabled = false;
      $("acceptBtn").disabled = false;
    }
  },

  _releaseMicrophone() {
    try { this.processorNode?.disconnect(); } catch (_) {}
    try { this.sourceNode?.disconnect(); } catch (_) {}
    try { this.muteNode?.disconnect(); } catch (_) {}
    if (this.processorNode) this.processorNode.onaudioprocess = null;
    for (const track of this.mediaStream?.getTracks?.() || []) track.stop();
    const context = this.audioContext;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.muteNode = null;
    this.audioContext = null;
    if (context && context.state !== "closed") context.close().catch(() => {});
  },

  async _transcribeSequential(pcm16k) {
    const Module = window.Module;
    const prepared = prepareSpeechSegments(pcm16k, 16000);
    if (!prepared.length) return "";

    const pieces = [];
    for (let i = 0; i < prepared.length; i++) {
      const chunk = prepared[i];
      setStatus($("speechStatus"), `Processing local speech segment ${i + 1} of ${prepared.length}...`);
      const text = cleanTranscript(await transcribeStreamChunk(Module, this.instance, chunk));
      if (!text) continue;

      const norm = normalizeTranscriptForCompare(text);
      const prev = pieces.length ? normalizeTranscriptForCompare(pieces[pieces.length - 1]) : "";
      // Whisper can hallucinate the same short token on low-information audio.
      // Do not append the same 1-2 word fragment repeatedly across adjacent chunks.
      if (norm && norm === prev && norm.split(/\s+/).length <= 2) continue;
      pieces.push(text);
    }
    return cleanTranscript(pieces.join(" "));
  }

};


function normalizeTranscriptForCompare(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\\s']/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function rmsOfRange(audio, start, end) {
  let sum = 0;
  const n = Math.max(1, end - start);
  for (let i = start; i < end; i++) sum += audio[i] * audio[i];
  return Math.sqrt(sum / n);
}

function prepareSpeechSegments(audio, sampleRate) {
  if (!audio?.length) return [];

  const frame = Math.max(1, Math.round(sampleRate * 0.02)); // 20 ms
  const frames = [];
  for (let start = 0; start < audio.length; start += frame) {
    frames.push(rmsOfRange(audio, start, Math.min(start + frame, audio.length)));
  }
  if (!frames.length) return [];

  const sorted = [...frames].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const peak = Math.max(...frames);
  const threshold = Math.max(0.006, noiseFloor * 3.0, peak * 0.06);

  const active = frames.map(v => v >= threshold);
  const hang = Math.max(1, Math.round(0.20 / 0.02));
  for (let i = 0; i < active.length; i++) {
    if (!active[i]) continue;
    for (let j = Math.max(0, i - hang); j <= Math.min(active.length - 1, i + hang); j++) active[j] = true;
  }

  let first = active.indexOf(true);
  if (first < 0) return [];
  let last = active.length - 1;
  while (last >= 0 && !active[last]) last--;

  const trimStart = Math.max(0, first * frame - Math.round(sampleRate * 0.20));
  const trimEnd = Math.min(audio.length, (last + 1) * frame + Math.round(sampleRate * 0.20));
  const trimmed = audio.slice(trimStart, trimEnd);

  const maxSamples = Math.round(sampleRate * 4.6);
  const minSamples = Math.round(sampleRate * 0.60);
  const searchSamples = Math.round(sampleRate * 0.65);
  const padSamples = Math.round(sampleRate * 0.18);
  const segments = [];

  let pos = 0;
  while (pos < trimmed.length) {
    let end = Math.min(trimmed.length, pos + maxSamples);
    if (end < trimmed.length) {
      // Prefer a quiet valley close to the target boundary rather than cutting mid-word.
      const searchStart = Math.max(pos + minSamples, end - searchSamples);
      let best = end;
      let bestRms = Infinity;
      const step = Math.max(1, Math.round(sampleRate * 0.02));
      const valleyWindow = Math.max(1, Math.round(sampleRate * 0.08));
      for (let c = searchStart; c <= end; c += step) {
        const r = rmsOfRange(trimmed, Math.max(pos, c - valleyWindow), Math.min(trimmed.length, c + valleyWindow));
        if (r < bestRms) {
          bestRms = r;
          best = c;
        }
      }
      if (best > pos + minSamples) end = best;
    }

    const raw = trimmed.slice(pos, end);
    const energy = rmsOfRange(raw, 0, raw.length);
    if (raw.length >= minSamples && energy >= threshold * 0.55) {
      const padded = new Float32Array(raw.length + padSamples * 2);
      padded.set(raw, padSamples);
      segments.push(padded);
    }
    pos = end;
  }

  return segments;
}

function mergeFloat32(chunks, totalLength) {
  const out = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function resampleMono(input, sourceRate, targetRate) {
  if (!sourceRate || sourceRate === targetRate) return input.slice();
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const frac = position - left;
    output[i] = input[left] * (1 - frac) + input[right] * frac;
  }
  return output;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function transcribeStreamChunk(Module, instance, audio) {
  // Flush an old unread result before supplying fresh audio.
  try { Module.get_transcribed(); } catch (_) {}
  const ret = Module.set_audio(instance, audio);
  if (ret !== 0) throw new Error(`Whisper rejected microphone audio (code ${ret}).`);

  const started = Date.now();
  let sawRunning = false;
  let emptyWaitingSince = 0;
  while (Date.now() - started < 45000) {
    const text = cleanTranscript(String(Module.get_transcribed?.() || ""));
    if (text) return text;
    const status = String(Module.get_status?.() || "").toLowerCase();
    if (status.includes("running whisper")) sawRunning = true;
    if (sawRunning && status.includes("waiting for audio")) {
      if (!emptyWaitingSince) emptyWaitingSince = Date.now();
      if (Date.now() - emptyWaitingSince > 500) return "";
    } else {
      emptyWaitingSince = 0;
    }
    await sleep(100);
  }
  throw new Error("Local Whisper transcription timed out for this speech segment.");
}

function cleanTranscript(text) {
  return String(text || "")
    .replace(/\[[^\]]*(?:blank_audio|music|noise|silence)[^\]]*\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function appendSpeechToCurrentAnswer(segmentText) {
  const box = $("answerBox");
  const existing = box.value.trimEnd();
  box.value = existing ? `${existing} ${segmentText}` : segmentText;
  box.dispatchEvent(new Event("input", { bubbles: true }));
  box.scrollTop = box.scrollHeight;
}

function speakCurrentQuestion() {
  if (!state.exam || !state.exam.questions[state.questionIndex]) return;
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(state.exam.questions[state.questionIndex].prompt);
  utterance.lang = state.exam.language || "en-ZA";
  speechSynthesis.speak(utterance);
}

function renderQuestion() {
  const q = state.exam.questions[state.questionIndex];
  $("progressText").textContent = `Question ${state.questionIndex + 1} of ${state.exam.questions.length}`;
  $("questionText").textContent = q.prompt;
  $("answerBox").value = "";
  $("acceptBtn").textContent = state.questionIndex === state.exam.questions.length - 1 ? "Accept Final Answer & Finish" : "Accept Answer & Next Question";
  speakCurrentQuestion();
}

async function stopSpeechIfNeeded() {
  if (state.speechEngine && state.listening) {
    try { await state.speechEngine.stop(); } catch (err) {
      setStatus($("speechStatus"), err.message, "error");
    }
  }
  state.listening = false;
  $("stopMicBtn").disabled = true;
}

async function acceptAnswer() {
  const answer = $("answerBox").value.trim();
  if (!answer) {
    setStatus($("speechStatus"), "Please provide an answer before continuing.", "error");
    return;
  }
  await stopSpeechIfNeeded();
  const q = state.exam.questions[state.questionIndex];
  state.responses.push({ questionId: q.id, question: q.prompt, answer });
  if (state.questionIndex < state.exam.questions.length - 1) {
    state.questionIndex += 1;
    renderQuestion();
  } else {
    finishAssessment();
  }
}

function makeSubmission() {
  return {
    format: "human-ai-static-oral-exam-submission-v1",
    examId: state.exam.id,
    examTitle: state.exam.title,
    examVersion: state.exam.version || "1",
    studentNumber: state.studentNumber,
    firstName: state.firstName,
    startedAt: state.startedAt.toISOString(),
    completedAt: state.completedAt.toISOString(),
    cipher: {
      name: "rotating-caesar-student-digits-v1",
      studentDigits: 8,
      pointerReset: "each-answer",
      note: "Questions and identity are plaintext; answerEncoded fields are obfuscated."
    },
    responses: state.responses.map(r => ({
      questionId: r.questionId,
      question: r.question,
      answerEncoded: rotatingCaesar(r.answer, state.studentNumber, 1)
    }))
  };
}

async function finishAssessment() {
  await stopSpeechIfNeeded();
  state.completedAt = new Date();
  state.submission = makeSubmission();
  $("examCard").classList.add("hidden");
  $("completeCard").classList.remove("hidden");
  $("completeSummary").textContent = `${state.exam.title} completed for ${state.firstName} (${state.studentNumber}). ${state.responses.length} answers recorded.`;
}

function downloadSubmission() {
  if (!state.submission) return;
  const text = JSON.stringify(state.submission, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = state.completedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const filename = `oral-${state.exam.id}-${state.studentNumber}-${stamp}.json`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function startExam() {
  try {
    const identityError = validateIdentity();
    if (identityError) throw new Error(identityError);
    if (!state.exam) throw new Error("Load an assessment first.");
    setStatus($("setupStatus"), "Checking assessment access...");
    await checkAccess();
    setStatus($("setupStatus"), "Preparing local Whisper WASM runtime and model...");
    state.speechEngine = localSpeechEngine;
    const speechPreparation = await state.speechEngine.prepare();
    state.startedAt = new Date();
    state.questionIndex = 0;
    state.responses = [];
    $("setupCard").classList.add("hidden");
    $("examCard").classList.remove("hidden");
    $("micBtn").disabled = !speechPreparation.ready;
    $("stopMicBtn").disabled = true;
    setStatus(
      $("speechStatus"),
      speechPreparation.ready
        ? "Local Whisper speech engine ready. Press Start Speaking when you are ready to answer."
        : speechPreparation.message,
      speechPreparation.ready ? "ok" : "error"
    );
    renderQuestion();
  } catch (err) {
    setStatus($("setupStatus"), err.message, "error");
  }
}

$("studentNumber").addEventListener("input", (e) => { e.target.value = sanitizeStudentNumber(e.target.value); });
$("loadSelectedBtn").addEventListener("click", async () => {
  const file = $("examSelect").value;
  if (!file) return setStatus($("setupStatus"), "Select an assessment first.", "error");
  try { await loadExamUrl(file); } catch (err) { setStatus($("setupStatus"), err.message, "error"); }
});
$("examFile").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const exam = file.name.toLowerCase().endsWith(".txt") ? parseTxtExam(text) : validateExam(JSON.parse(text));
    setExam(exam);
  } catch (err) { setStatus($("setupStatus"), `Could not load local exam: ${err.message}`, "error"); }
});
$("startBtn").addEventListener("click", startExam);
$("speakQuestionBtn").addEventListener("click", speakCurrentQuestion);
$("micBtn").addEventListener("click", async () => {
  if (!state.speechEngine || !state.speechEngine.ready) {
    return setStatus($("speechStatus"), "Local Whisper speech engine is not ready.", "error");
  }
  try {
    await state.speechEngine.start(appendSpeechToCurrentAnswer);
  } catch (err) {
    setStatus($("speechStatus"), `Could not start local speech engine: ${err.message}`, "error");
  }
});
$("stopMicBtn").addEventListener("click", async () => {
  try { await state.speechEngine?.stop(); } catch (err) { setStatus($("speechStatus"), err.message, "error"); }
});
$("acceptBtn").addEventListener("click", acceptAnswer);
$("downloadBtn").addEventListener("click", downloadSubmission);

for (const eventName of ["paste", "drop"]) {
  $("answerBox").addEventListener(eventName, (event) => {
    event.preventDefault();
    $("editStatus").textContent = "Pasting and drag/drop are disabled during the assessment. Type corrections yourself.";
  });
}
$("answerBox").addEventListener("dragover", (event) => event.preventDefault());

loadManifest();
