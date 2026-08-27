# Deployment — S-OE1W Objective 3

## 1. Vendor Whisper assets once

From the project directory on Windows, either use PowerShell directly:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\vendor-whisper-assets.ps1
```

or from Command Prompt:

```cmd
powershell -ExecutionPolicy Bypass -File vendor-whisper-assets.ps1
```

Confirm these files exist:

```text
wasm/stream.js
models/ggml-base.en-q5_1.bin
coi-serviceworker.js
```

## 2. Push the complete folder to GitHub

Enable GitHub Pages for the selected branch/folder. Keep `coi-serviceworker.js` at the same root level as `index.html` so its service-worker scope includes the exam runtime, WASM asset and model requests.

## 3. Expected first-load behaviour

The pthread-enabled `whisper.cpp` WASM build requires `SharedArrayBuffer` and cross-origin isolation. Static GitHub Pages does not let this project configure HTTP response headers directly, so the included service worker injects the required COOP/COEP headers into same-origin responses.

On a student's first visit the page may reload once after the service worker takes control. After that, `window.crossOriginIsolated` should be true and Whisper can initialise.

## 4. Student behaviour

Students:

1. open the GitHub Pages URL;
2. enter identity and start the assessment;
3. allow microphone permission when they first press **Start Speaking**;
4. speak;
5. press **Stop Speaking & Transcribe**;
6. edit the transcript if needed;
7. speak again to append more text or accept the answer.

No Whisper, Python, Node, Ollama, browser extension or speech language pack is installed on the student's machine.

## 5. Privacy/runtime boundary

- Microphone PCM remains in browser memory.
- Whisper inference runs in browser WebAssembly.
- No Web Speech API is used.
- No remote speech-recognition fallback exists.
- Only the final encoded JSON submission is downloaded locally by the student.
