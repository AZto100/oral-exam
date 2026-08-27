# Human-AI Static Oral Exam v0.1 — Initial Specification

## Goal

Create a serverless oral-assessment variant of Human-AI that can be hosted as static files on GitHub Pages. AI is used before deployment to design the oral exam. During the student session, no LLM, application server, database server, or cloud speech service is required.

The runtime must:

1. Load one of multiple oral exams from static `.json` or `.txt` files.
2. Ask for student number and first name before starting.
3. Check the configured access date/time.
4. Request microphone permission only after the student starts the exam.
5. Use bundled/local Whisper WebAssembly speech recognition only. Never silently fall back to remote/cloud recognition.
6. Present one question at a time.
7. Append each final speech segment to an editable answer box.
8. Preserve manual corrections if the student continues speaking.
9. Block paste and drag/drop into the answer box.
10. Require the student to explicitly accept each answer before moving on.
11. Store student number, first name, exam metadata, timestamps, and question text in plaintext in the submission file.
12. Store student answers using the rotating student-number Caesar cipher described below.
13. Download the final submission file locally so it can be emailed or uploaded to Moodle.

## Runtime architecture

```text
GitHub Pages static files
        |
        v
Browser only
  - exam loader
  - access-time controller
  - local whisper.cpp WebAssembly speech recognition
  - answer review/edit UI
  - rotating Caesar encoder
  - local file download
        |
        v
No application server
No database server
No runtime LLM
No remote speech fallback
```

## AI role

AI is an authoring-time tool only in this version.

The instructor asks an AI to create or revise an oral exam, then saves the resulting public exam definition as JSON or TXT. The deployed public exam file must contain questions and instructions only. Correct answers, rubrics, marking guides, private prompts, or other confidential assessment material should not be deployed to GitHub Pages.

## Student identity

Required before exam start:

- `studentNumber`: exactly 8 digits by default.
- `firstName`: non-empty text.

The student number is also the key sequence for answer obfuscation.

## Access-time control

Each exam defines a start and end timestamp in ISO-8601 format including a UTC offset.

Supported time sources:

- `local`: browser system clock.
- `github-http-date`: obtain the HTTP `Date` response header from the same GitHub Pages origin using a cache-busted `HEAD` request. This uses the network but no custom server.

If `github-http-date` is requested and the time cannot be retrieved, the default behavior is fail-closed (`deny`).

### Important limitation

A static GitHub Pages application cannot provide tamper-proof exam security. A technically capable student can inspect JavaScript, modify the local clock, alter browser code, or inspect public exam files. Time control is therefore a scheduling/access convenience, not a high-security proctoring mechanism.

## Local Whisper/WASM speech recognition

The runtime speech-recognition target is `whisper.cpp` compiled to WebAssembly and executed inside the student browser. The browser downloads the WASM runtime and model as static assets from the GitHub Pages deployment; inference then occurs locally on the student device.

The Web Speech `SpeechRecognition` API is not used and there is no cloud-recognition fallback.

Target initial model:

```text
ggml-base.en-q5_1.bin
```

The speech controller must expose a narrow boundary to the exam UI so the exam/question/cipher code does not depend directly on Whisper implementation details.

Student setup should require only opening the HTTPS exam page and granting microphone permission. The WASM runtime/model should be downloaded and cached automatically by the site.

If the local engine or required model cannot load, the assessment must fail closed unless the exam explicitly permits a typed-only fallback.

### S-OE1W transition status

Objective 1 removes all Web Speech recognition runtime code and introduces the local speech-engine boundary. The microphone remains unavailable in this transition build until the next objective integrates the WASM runtime.

## Question/answer flow

For every question:

```text
Question displayed
      |
Question spoken using local browser speech synthesis when enabled
      |
Student speaks
      |
Local Whisper/WASM transcription segment
      |
Append segment to current answer textarea
      |
Student may edit any part
      |
Student may speak again
      |
Append new segment to CURRENT edited textarea value
      |
Student presses "Accept Answer & Next Question"
      |
Current textarea contents become the committed answer
```

Nothing should automatically advance because of silence or a pause.

## Examiner rule

The runtime has no AI and therefore cannot supply answers. It displays only the pre-authored question and neutral UI instructions. The deployed exam file must not contain model answers.

## Rotating student-number Caesar cipher

The old fixed `+7` Caesar shift is replaced by a repeating shift sequence derived from the 8 digits of the student number.

For student number:

```text
10962700
```

The repeating shift sequence is:

```text
+1, +0, +9, +6, +2, +7, +0, +0, +1, +0, +9, ...
```

Rules:

1. Apply the shift to alphabetic A-Z/a-z characters only.
2. Preserve case.
3. Leave digits, spaces, punctuation and line breaks unchanged.
4. Advance the student-number digit pointer only when an alphabetic character is encoded.
5. Reset the digit pointer to student-number digit 1 at the beginning of each answer.
6. Decode by applying the same digit sequence as negative shifts.

This is obfuscation, not cryptographic security.

## Submission file

The downloaded file is JSON for robust machine parsing.

Example shape:

```json
{
  "format": "human-ai-static-oral-exam-submission-v1",
  "examId": "basic-data-analysis-v1",
  "examTitle": "Basic Data Analysis Oral Assessment",
  "studentNumber": "10962700",
  "firstName": "Theuns",
  "startedAt": "2026-08-27T08:30:00+02:00",
  "completedAt": "2026-08-27T08:42:00+02:00",
  "cipher": {
    "name": "rotating-caesar-student-digits-v1",
    "studentDigits": 8,
    "pointerReset": "each-answer"
  },
  "responses": [
    {
      "questionId": "Q1",
      "question": "Plaintext question here",
      "answerEncoded": "..."
    }
  ]
}
```

Student number, first name and questions remain plaintext. Only answer content is encoded.

## Local storage

During the active session, current state is held in browser memory. A small draft can also be mirrored to `localStorage` for accidental-refresh recovery if the exam config enables it. No data is uploaded by this application.

At completion the student downloads the submission JSON file. The file can then be:

- emailed,
- uploaded as a Moodle assignment submission,
- copied to removable media,
- decoded/graded by an instructor tool.

## Exam loading

Two supported methods:

1. Static manifest on GitHub Pages:
   - `exams/manifest.json`
   - each entry points to a JSON/TXT exam file.
2. Local file load:
   - instructor/student selects a `.json` or `.txt` exam file from disk.

### JSON exam format

See `exams/basic-data-analysis-v1.json`.

### TXT exam format

Simple line format:

```text
TITLE=Example Oral Exam
ID=example-v1
LANG=en-ZA
START=2026-08-27T08:00:00+02:00
END=2026-08-27T12:00:00+02:00
TIME_SOURCE=local
Q=First question?
Q=Second question?
```

## GitHub Pages deployment

Upload the static project files to a GitHub repository and enable GitHub Pages. The site requires HTTPS for microphone access, which GitHub Pages provides.

Do not deploy `authoring/` private marking material if you later add model answers or rubrics there.

## Compatibility requirement

Before a real assessment, test the exact browser/device combination for:

- local microphone permission,
- WASM runtime loading,
- model download/cache availability,
- local Whisper transcription quality,
- file download,
- GitHub Pages HTTP-date access if used.

## Initial milestone roadmap

### S-OE1 — Static assessment shell

- multiple exam loading
- identity capture
- local/GitHub-date access check
- local Whisper/WASM STT gate
- question flow
- editable accumulated answers
- local submission download
- student-number rotating Caesar cipher

### S-OE2 — Reliability

- refresh recovery
- stronger browser compatibility diagnostics
- completed-file validation
- instructor batch decode tool

### S-OE3 — Moodle workflow

- Moodle assignment naming convention
- batch import/grade support
- optional instructor-side report generation

### S-OE4 — Exam authoring workflow

- AI exam generation prompt
- schema validation
- question-bank randomization/versioning
- private rubric kept outside deployed static site


## Objective 2 implementation note

The static project now loads the official whisper.cpp Emscripten `stream.js` runtime and `ggml-base.en-q5_1.bin` model from same-origin GitHub Pages paths. A one-time developer script vendors these assets into the repository. Student-side installation is not required. Microphone-to-Whisper transcription is connected in Objective 3.

## Objective 3 implementation note

S-OE1W Objective 3 connects the student microphone to the prepared `whisper.cpp` stream WASM runtime. Audio is captured as mono floating-point PCM in browser memory, resampled to 16 kHz, divided into sequential short chunks compatible with the stream worker, transcribed locally, then combined and appended to the current edited answer textarea. Starting a new speech segment after manual edits appends new transcript text rather than replacing the edited answer. The student explicitly starts and stops each speech segment; silence never commits an answer or advances a question.

The pthread-enabled stream WASM build requires cross-origin isolation. A same-origin `coi-serviceworker.js` is included at the GitHub Pages root to supply the required COOP/COEP headers on static hosting. The runtime fails closed if `crossOriginIsolated` / `SharedArrayBuffer` support is not active.
