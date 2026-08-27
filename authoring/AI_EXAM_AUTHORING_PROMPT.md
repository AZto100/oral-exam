# AI Oral Exam Authoring Prompt

Use this prompt with an AI before deployment. The resulting public JSON must contain questions only — no model answers or rubrics.

---

Create a serverless oral assessment for the Human-AI Static Oral Exam format.

Requirements:

- Output valid JSON only.
- Use schema format `human-ai-static-oral-exam-v1`.
- Create an `id`, `title`, `version`, `language`, `instructions`, `access`, `speech`, and `questions` array.
- Questions must test understanding, insight, interpretation and reasoning rather than rote recall where possible.
- Do not include model answers, marking rubrics, hints or hidden examiner content because this JSON will be publicly downloadable from GitHub Pages.
- Each question needs `id` and `prompt` only.
- Questions must be answerable orally.
- Avoid compound questions that require remembering many subparts.
- The runtime examiner cannot answer student questions or provide hints.

Use this skeleton:

```json
{
  "format": "human-ai-static-oral-exam-v1",
  "id": "course-topic-v1",
  "title": "Title",
  "version": "1.0",
  "language": "en-ZA",
  "instructions": "Answer each question in your own words.",
  "access": {
    "start": "2026-08-27T08:00:00+02:00",
    "end": "2026-08-27T12:00:00+02:00",
    "timeSource": "local",
    "onTimeFailure": "deny"
  },
  "speech": {
    "requireOnDevice": true,
    "allowInstall": true,
    "allowTypedOnlyFallback": false
  },
  "questions": [
    {"id":"Q1","prompt":"..."}
  ]
}
```
