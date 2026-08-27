# Human-AI Static Oral Exam — S-OE1W Objective 3

**Objective 3 complete: microphone → 16 kHz mono → local Whisper/WASM → append transcript.**

This build keeps the Web Speech API removed and connects the exam UI to the local `whisper.cpp` `stream.wasm` runtime.

## Student speech flow

1. Student presses **Start Speaking**.
2. The browser requests microphone permission if needed.
3. Mono microphone PCM is captured in browser memory only.
4. Student presses **Stop Speaking & Transcribe**.
5. The captured PCM is resampled to 16 kHz mono.
6. Long speech is divided into sequential 4-second chunks so the stream runtime does not silently lose audio beyond its working window.
7. Each chunk is passed to `Module.set_audio()` and the result is read with `Module.get_transcribed()`.
8. The combined transcript is appended to the **current value** of the answer textarea.
9. The student may manually edit the answer, then press **Start Speaking** again. The next transcript is appended after those edits.
10. Silence or stopping speech never advances the question. Only **Accept Answer & Next Question** commits the answer.

Audio is not uploaded by this application and there is no cloud speech fallback.

## One-time developer setup

On the Windows machine used to prepare the GitHub repository, run from the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File vendor-whisper-assets.ps1
```

This downloads:

- `wasm/stream.js` — the official `whisper.cpp` Emscripten stream build.
- `models/ggml-base.en-q5_1.bin` — quantized English model, about 57 MB.

`coi-serviceworker.js` is already included in this project. It adds the cross-origin isolation headers required for the pthread-enabled WASM runtime when hosted on static GitHub Pages.

Commit the generated runtime/model files with the site. Students install nothing.

## Required deployed files

```text
index.html
styles.css
app.js
whisper-loader.js
coi-serviceworker.js
wasm/stream.js
models/ggml-base.en-q5_1.bin
exams/
instructor/
```

## Browser behaviour

The first visit may reload once automatically so the service worker can establish `crossOriginIsolated` mode. This is expected. The model/runtime can then load from the same GitHub Pages origin.

## Current interaction model

Objective 3 deliberately uses explicit **Start Speaking → Stop Speaking & Transcribe** segments rather than auto-finalising on pauses. This keeps the oral-exam behaviour predictable and preserves the requirement that pauses never move the student to the next question.

## Next objective

Objective 4 should focus on speech reliability and UX: microphone/pre-flight diagnostics, visible recording duration, better long-answer chunk boundary handling, optional VAD-assisted segmentation without auto-advancing, and recovery/error handling.


## S-OE1W Objective 3.1 speech fix

This revision trims leading/trailing low-energy audio before Whisper, chooses quiet boundaries for long speech segments, pads each local segment, and suppresses repeated one- or two-word duplicate fragments produced on adjacent low-information chunks. The default model is now base.en Q5_1 (~57 MB) for improved oral-exam accuracy.
