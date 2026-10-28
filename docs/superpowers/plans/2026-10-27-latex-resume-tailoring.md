# LaTeX Resume Tailoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept a tagged LaTeX master resume and, on each Autofill, upload a 2-page PDF whose Projects section is picked (and optionally reworded) for that job.

**Architecture:** Pure modules under `src/electron/services/tailor/` parse the `.tex`, rank projects, check Claude rewrites and fit the page limit; a small Node module compiles with the local `pdflatex`. `tailorService.ts` orchestrates per job and is called lazily from Autofill, the same way the cover letter is. The form matcher gains a "prefer upload" mode so LinkedIn/Seek get the tailored file instead of the saved resume.

**Tech Stack:** Electron 43, TypeScript (nodenext), React 19, Playwright Test as the unit-test runner (`e2e/*.spec.ts`), pdfjs-dist (already installed), local MiKTeX/TeX Live `pdflatex`, local `claude` CLI.

**Spec:** `docs/superpowers/specs/2026-10-27-latex-resume-tailoring-design.md`

## Global Constraints

- No new npm dependencies.
- Compile with `pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape`, in a fresh temp folder, input always named `resume.tex`.
- Page limit: 2 pages, fixed.
- Tailoring time limit: 3 minutes per Autofill press; past it, use the master PDF.
- Both Claude toggles are off by default. With both off, nothing leaves the PC.
- Claude never adds a project; kept projects appear in master order.
- Submit is never pressed (existing rule).
- Tailoring failure never fails Autofill: upload the master PDF and record the reason.
- PDF, DOCX, TXT and untagged `.tex` uploads behave exactly as today (saved resume still preferred on LinkedIn/Seek).
- The user's personal `.tex` never goes into this repo. Test fixtures use made-up content.
- **Do not run `git commit`.** The user commits. Each task ends with `git add` only.
- Run at most one `npm test` / app instance at a time (user's PC is low on resources).

## Review Focus

1. Tagged projects but no `% end-projects` line → upload refused with "Add a `% end-projects` line after your last project." (test in Task 2).
2. Claude rewrite with unbalanced braces, a new number, or a new skill → original block used (tests in Task 4).
3. A job that names no skill the projects cover → ranking keeps master order instead of a random one (test in Task 3).
4. The second fill pass after a reveal sees the file box already holding the tailored file → it is not uploaded again, so LinkedIn does not get duplicates (test in Task 7).
5. A LaTeX error in the master → upload refused with LaTeX's own `!` error line, old resume kept (test in Task 1 for the error line; Task 5 wires the refusal).

---

### Task 1: PDF text helper and LaTeX compiler

**Files:**
- Create: `src/electron/services/pdfText.ts`
- Create: `src/electron/services/tailor/latex.ts`
- Modify: `src/electron/services/resumeService.ts:43-68` (move `extractPdf` out, import it back)
- Test: `e2e/latex.spec.ts`

**Interfaces:**
- Produces:
  - `extractPdf(filePath: string): Promise<{ text: string; pages: number }>` in `pdfText.ts` (moved verbatim from resumeService).
  - `findLatexCompiler(): string | null` — `pdflatex` on PATH (`where pdflatex` on Windows, `which` elsewhere), else first existing of `%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64\pdflatex.exe`, `%ProgramFiles%\MiKTeX\miktex\bin\x64\pdflatex.exe`, `C:\texlive\<newest year>\bin\windows\pdflatex.exe`.
  - `compileTex(source: string, signal?: AbortSignal): Promise<string>` — returns the absolute path of the compiled PDF in a fresh `fs.mkdtempSync(os.tmpdir()/jc-tex-)` folder. Rejects with `LatexError` (`class LatexError extends Error`) whose message is: `'No LaTeX compiler was found. Install MiKTeX or TeX Live, then try again.'`, or the first log line starting with `! ` (without the `! `), or `'LaTeX took longer than a minute.'` (60 s timeout; kills the process tree like `stop()` in `coverLetter.ts`).
  - `pdfPages(pdfPath: string): Promise<number>` — `(await extractPdf(pdfPath)).pages`.
- `latex.ts` and `pdfText.ts` must not import `electron`, so tests can import them.

- [ ] **Step 1: Write the failing tests** in `e2e/latex.spec.ts`. Skip the file when no compiler exists: `test.skip(!findLatexCompiler(), 'pdflatex not installed')`.

```ts
const doc = (body: string) => `\\documentclass{article}\\begin{document}${body}\\end{document}`

test('compiles a one-page document', async () => {
  const pdf = await compileTex(doc('Hello'))
  expect(await pdfPages(pdf)).toBe(1)
  expect((await extractPdf(pdf)).text).toContain('Hello')
})

test('counts pages', async () => {
  expect(await pdfPages(await compileTex(doc('A\\newpage B\\newpage C')))).toBe(3)
})

test('reports the LaTeX error line', async () => {
  await expect(compileTex(doc('\\undefinedmacro'))).rejects.toThrow('Undefined control sequence.')
})

test('shell escape is off', async () => {
  const pdf = await compileTex(doc('\\immediate\\write18{echo pwned > pwned.txt}ok'))
  expect(fs.existsSync(path.join(path.dirname(pdf), 'pwned.txt'))).toBe(false)
})
```

- [ ] **Step 2: Run** `npx playwright test e2e/latex.spec.ts` — expected: FAIL, module not found.
- [ ] **Step 3: Implement** `pdfText.ts`, `latex.ts`; change `resumeService.ts` to import `extractPdf` from `./pdfText.js`.
- [ ] **Step 4: Run** `npx playwright test e2e/latex.spec.ts e2e/keywords.spec.ts` — expected: all PASS.
- [ ] **Step 5: Stage** `git add src/electron/services/pdfText.ts src/electron/services/tailor/latex.ts src/electron/services/resumeService.ts e2e/latex.spec.ts`

---

### Task 2: Parse and rebuild the master `.tex`

**Files:**
- Create: `src/electron/services/tailor/texProjects.ts`
- Test: `e2e/tex-projects.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface TexProject {
  /** Position in the master, 0-based. Stable id for ranking and Claude replies. */
  id: number
  /** From the `% tags:` line, trimmed, lowercased, canonicalSkill() applied, empties dropped. */
  tags: string[]
  /** First \textbf{...} content in the block, else its first non-comment line, LaTeX stripped. */
  title: string
  /** The exact source from the `% tags:` line up to (not including) the next tag line or end marker. */
  block: string
  /** The block as plain words: comments, \commands and braces removed. Used for ranking. */
  text: string
}
export interface ParsedTex { head: string; projects: TexProject[]; tail: string }
export class TexFormatError extends Error {}
export function parseTex(source: string): ParsedTex
/** head + kept blocks in master (id) order + tail. `replace` swaps in rewritten blocks. */
export function buildTex(parsed: ParsedTex, keep: number[], replace?: Map<number, string>): string
```

Parse rule: a tag line matches `/^[ \t]*%[ \t]*tags:(.*)$/m`; the end marker matches `/^[ \t]*%[ \t]*end-projects[ \t]*$/m`. `head` is everything before the first tag line; `tail` starts at the end-marker line. No tag lines → `{ head: source, projects: [], tail: '' }`. Tag lines with no end marker → throw `TexFormatError('Add a "% end-projects" line after your last project.')`.

- [ ] **Step 1: Write the failing tests** (fixture: a short made-up document with three projects, tags `ai, rag` / empty / `android, kotlin`, and an end marker).
  - `parseTex` returns 3 projects; `projects[1].tags` equals `[]`; `projects[0].tags` equals `['ai', 'rag']`; titles equal the three `\textbf` names.
  - `buildTex(parsed, [0, 1, 2])` equals the source exactly (round trip).
  - `buildTex(parsed, [2, 0])` contains project 0 before project 2 (master order) and does not contain project 1's title.
  - `buildTex(parsed, [0], new Map([[0, '% tags: ai\nNEW\n']]))` contains `NEW` and not project 0's original bullet.
  - No tag lines → `projects` is `[]` and `buildTex(parsed, [])` equals the source.
  - Tag lines without `% end-projects` → throws `'Add a "% end-projects" line after your last project.'`.
  - Tags `Golang, JS` → `['go', 'javascript']` (canonical spelling).
- [ ] **Step 2: Run** `npx playwright test e2e/tex-projects.spec.ts` — expected: FAIL.
- [ ] **Step 3: Implement** `texProjects.ts`.
- [ ] **Step 4: Run** the same command — expected: PASS.
- [ ] **Step 5: Stage** both files.

---

### Task 3: Rank projects and fit the page limit

**Files:**
- Create: `src/electron/services/tailor/rankProjects.ts`
- Test: `e2e/rank-projects.spec.ts`

**Interfaces:**
- Consumes: `TexProject` (Task 2); `requiredSkills`, `keywordPattern` from `matching.ts`.
- Produces:
  - `rankProjects(job: { title: string; aboutText: string }, projects: TexProject[]): number[]` — all ids, best first. Asks = `requiredSkills(job.title + '\n' + job.aboutText, allTagsOfAllProjects)` (passing the tags makes free-text tags such as `android` count when the job names them). Score per project = Σ over asks of `askWeight × (project.tags includes ask ? 3 : keywordPattern(ask).test(project.text) ? 1 : 0)`. Ties (including all-zero) keep master order (stable sort).
  - `fitProjects(ranked: number[], pagesFor: (keep: number[]) => Promise<number>, maxPages: number): Promise<number[]>` — the longest prefix of `ranked` with `pagesFor(prefix) <= maxPages`, found by binary search over prefix length 0..n (page count only grows with more projects). Returns `[]` if even one project overflows.

- [ ] **Step 1: Write the failing tests.**
  - Job "Android Developer — Kotlin, Jetpack Compose" with projects A (tags `ai, rag`), B (no tags, text mentions Kotlin), C (tags `android, kotlin`) → `[2, 1, 0]`.
  - Job text with no known skills → `[0, 1, 2]`.
  - A tag outranks the same word in body text: project with tag `python` beats one with `python` only in text.
  - `fitProjects([5, 3, 1, 0], keep => Promise.resolve(Math.ceil((keep.length + 2) / 3)), 2)` → `[5, 3, 1, 0]`; with `maxPages` 1 → `[5]`; with a `pagesFor` that always returns 3 → `[]`.
  - `fitProjects` calls `pagesFor` at most `Math.ceil(Math.log2(n + 1)) + 1` times for n = 14 (count calls in the test).
- [ ] **Step 2: Run** `npx playwright test e2e/rank-projects.spec.ts` — expected: FAIL.
- [ ] **Step 3: Implement** `rankProjects.ts`.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Stage** both files.

---

### Task 4: Claude choose and rewrite, with code checks

**Files:**
- Modify: `src/electron/services/apply/coverLetter.ts` (export `runClaude`, add `systemPrompt` parameter)
- Create: `src/electron/services/tailor/claudeTailor.ts`
- Test: `e2e/claude-tailor.spec.ts`

**Interfaces:**
- Changes: `export function runClaude(prompt: string, systemPrompt: string, signal?: AbortSignal): Promise<string>`; `writeCoverLetter` passes its existing `SYSTEM_PROMPT`.
- Produces (pure, tested):
  - `parseChooseReply(reply: string, validIds: number[]): number[]` — reads the first line of the form `KEEP: 3, 0, 7`; keeps only valid ids, no duplicates, in reply order. Throws `Error('Claude did not return a project list.')` if no `KEEP:` line or no valid id.
  - `parseRewriteReply(reply: string): Map<number, string>` — sections start at lines `=== PROJECT <id> ===`; each section's text (trimmed, plus a trailing `\n`) is that id's block. Code fences around the reply are ignored.
  - `acceptRewrite(original: TexProject, rewritten: string): boolean` — true only if all hold: the rewritten block's first line equals the original's `% tags:` line; `parseTex`-style title (first `\textbf{}`) is unchanged; `{` and `}` counts balance; every number (`/\d+(?:[.,]\d+)?%?/g`) in it appears in the original; every token with `isKnownSkill(t)` (via `tokenize`, compared with `canonicalSkill`) appears in the original's canonical tokens.
- Produces (I/O, not unit-tested):
  - `chooseProjects(job: LetterJob, projects: TexProject[], signal?: AbortSignal): Promise<number[]>` — prompt lists `id`, `title`, `tags`, `text` per project and the job (`MAX_JOB_CHARS` 6000 as in coverLetter); asks for one line `KEEP: <ids best first>`, no other text. System prompt: `'You choose resume projects for a job. You never use tools.'`
  - `rewriteProjects(job: LetterJob, projects: TexProject[], signal?: AbortSignal): Promise<Map<number, string>>` — one call with all kept blocks under `=== PROJECT <id> ===` headers; rules in the prompt: keep the `% tags:` line and the heading lines unchanged; change only bullet wording to use the job's terms where true; no new facts, technologies, numbers, results or projects; escape LaTeX specials; output only the sections. System prompt: `'You edit LaTeX resume bullets. You never use tools.'` Blocks failing `acceptRewrite` are dropped from the returned map.

- [ ] **Step 1: Write the failing tests** for the three pure functions:
  - `parseChooseReply('KEEP: 2, 9, 0, 2', [0, 1, 2])` → `[2, 0]`; `parseChooseReply('Sure! Here', [0])` throws.
  - `parseRewriteReply` of a two-section reply wrapped in ```` ```latex ```` fences → map with ids 0 and 3 and the exact block text.
  - `acceptRewrite`: reworded bullet → true; added `40%` → false; added `Kubernetes` when original has none → false; missing `}` → false; changed `\textbf{Title}` → false; changed tags line → false.
- [ ] **Step 2: Run** `npx playwright test e2e/claude-tailor.spec.ts` — expected: FAIL.
- [ ] **Step 3: Implement** the change to `coverLetter.ts` and `claudeTailor.ts`.
- [ ] **Step 4: Run** `npx playwright test e2e/claude-tailor.spec.ts` and `npm run transpile:electron` — expected: PASS, no type errors.
- [ ] **Step 5: Stage** the three files.

---

### Task 5: Accept `.tex` uploads

**Files:**
- Modify: `src/electron/services/resumeService.ts`
- Modify: `types.d.ts` (`UploadResumeFailure`, `ResumeMeta`)
- Modify: `src/ui/screens/ResumeScreen.tsx` (`ERROR_HEADLINE`, `ERROR_BADGE`, `RECOVERY`, project list)

**Interfaces:**
- Consumes: `compileTex`, `LatexError` (Task 1); `parseTex`, `TexFormatError` (Task 2); `extractPdf` (Task 1).
- Produces:
  - `UploadResumeFailure` gains `'latex'`.
  - `ResumeMeta` gains `projects?: { title: string; tags: string[] }[]` — set only when the stored resume is `.tex`.
  - `resumeService.storedResumePath(): string | null` — for `.tex`, the compiled master PDF (`<name>.pdf` next to the `.tex`); otherwise unchanged. Never returns the `.tex`.
  - `resumeService.storedMasterTex(): { source: string; pdfName: string } | null` — the stored `.tex` text and the upload file name to use (`<master basename>.pdf`).
  - `resumeService.isTailorable(): boolean` — stored resume is `.tex` with at least one project.

Upload rules for `.tex` (mime `application/x-tex`): size check as today → read UTF-8 → `parseTex` (on `TexFormatError` refuse with reason `'latex'` and its message) → `compileTex` (on `LatexError` refuse with reason `'latex'` and its message) → `extractPdf` on the result, then the existing 200-character check → store both the `.tex` and the PDF (named `<basename>.pdf`) in `RESUME_DIR`, replacing what was there → keywords from the PDF text as today. File dialog filter adds `'tex'`. The unsupported-type message names TEX.

UI: `'latex'` headline "LaTeX could not build this file", badge "LaTeX", recovery steps: "Compile it in your own editor and fix the first error." / "Check MiKTeX or TeX Live is installed." / "Upload it again." Under the keyword list, when `resume.projects` is set, show a "Projects in your master" list: title plus tag chips (reuse `KeywordChip` styling), and the line "No tags" for an empty list. When `.tex` has no projects, show: "No `% tags:` lines found, so every application gets this resume unchanged."

- [ ] **Step 1: Implement** the service, type and UI changes.
- [ ] **Step 2: Run** `npm run transpile:electron` and `npx tsc -b` — expected: no errors.
- [ ] **Step 3: Check in the app** (`npm run dev`): upload `e2e/fixtures/master.tex` (create it: made-up name, 4 tagged projects, end marker) → keywords appear, project list shows 4 projects with tags. Upload a copy with `\undefinedmacro` → refusal shows "Undefined control sequence." and the previous resume is still listed. Upload a copy without `% end-projects` → refusal shows the end-marker message.
- [ ] **Step 4: Stage** changed files and `e2e/fixtures/master.tex`.

---

### Task 6: Settings toggles

**Files:**
- Modify: `src/electron/db/settings.ts` (after the cover-letter block, ~line 132)
- Modify: `src/electron/ipc/apply.ts`, `src/electron/preload.cts`, `types.d.ts` (window.electron API)
- Modify: `src/ui/screens/SettingsScreen.tsx` (new card after "Cover letters", ~line 278)

**Interfaces:**
- Produces: `isTailorChooseEnabled(): boolean`, `setTailorChooseEnabled(enabled: boolean): void` (key `autofill.tailorChoose`); `isTailorRewriteEnabled(): boolean`, `setTailorRewriteEnabled(enabled: boolean): void` (key `autofill.tailorRewrite`). Both read `'1'` as on, anything else off. IPC/preload: `getTailorChooseEnabled`, `setTailorChooseEnabled`, `getTailorRewriteEnabled`, `setTailorRewriteEnabled`, same shape as the cover-letter pair (setter validates with `validateBoolean` and returns the stored value).

UI card "Tailored resume": copy "When your resume is a LaTeX file with `% tags:` lines, Autofill builds a 2-page PDF for each job from the projects that fit it best, and uploads it instead of your saved resume." Toggles: "Choose projects with Claude", "Rewrite project bullets with Claude". Privacy line (same `IconWarning` style): "Off by default. Turning either on sends the job description and your project text to Anthropic, through your own Claude Code login, each time you press Autofill."

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run transpile:electron` and `npx tsc -b` — expected: no errors.
- [ ] **Step 3: Check in the app:** both toggles start off; switch one on, restart the app, it is still on.
- [ ] **Step 4: Stage** changed files.

---

### Task 7: Tailor service, storage, and Autofill wiring

**Files:**
- Create: `src/electron/services/tailor/tailoredFiles.ts`
- Create: `src/electron/services/tailor/tailorService.ts`
- Modify: `src/electron/db/jobs.ts:426-455` (`pruneOldJobs`, `deleteInboxJobs` call the sweep)
- Modify: `src/electron/services/apply/matcher.ts:140-205` (`DecideOptions`, `decide`)
- Modify: `src/electron/services/apply/fillPage.ts:243-355` (`FillContext`, `fillOnce`)
- Modify: `src/electron/services/applyService.ts` (lazy resume source, `finish`, `closeApplyWindow`, `openJob`)
- Modify: `types.d.ts` (`AutofillResult`), `src/electron/ipc/apply.ts`, `src/electron/preload.cts`
- Modify: `src/ui/components/AutofillNote.tsx`
- Test: `e2e/resume-upload-choice.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - `tailoredFiles.ts`: `tailoredPdfPath(jobId: number, pdfName: string): string` → `userData/tailored/<jobId>/<pdfName>` (folder created); `existingTailoredPdf(jobId: number): string | null`; `removeTailoredExcept(jobIds: Set<number>): void` (deletes folders whose name is not in the set). `jobs.ts` calls `removeTailoredExcept(new Set(ids))` after its two deletes, with ids from `SELECT id FROM jobs`.
  - `tailorService.ts`:

```ts
interface TailorOutcome {
  pdfPath: string            // tailored PDF, or the master PDF on failure
  kept: string[]             // titles of kept projects, master order; [] on failure
  chosenBy: 'tags' | 'claude'
  rewritten: boolean
  error?: string             // shown under the job
}
export function tailorResume(job: JobRow, signal: AbortSignal): Promise<TailorOutcome>
```

  Flow: `signal = AbortSignal.any([signal, AbortSignal.timeout(180_000)])`; parse stored master; rank with `rankProjects`, or `chooseProjects` when the toggle is on (on error: tag ranking, `error` = its message); `fitProjects(ranked, keep => compileTex(buildTex(...)).then(pdfPages), 2)`; when rewrite is on: `rewriteProjects` on the kept projects, compile with the accepted blocks, and while over 2 pages drop the lowest-ranked kept project and recompile; copy the final PDF to `tailoredPdfPath(job.id, pdfName)`. Any thrown error or timeout → `{ pdfPath: master PDF, kept: [], error }`, timeout message `'Tailoring took longer than three minutes, so your master resume was used.'`.
  - `matcher.ts`: `DecideOptions` gains `uploadName?: string` ("upload this file instead of any saved resume"). With it set: a resume file field gets `{ kind: 'file' }` unless `field.value` ends with `uploadName`; a resume-choice radio picks the first option matching `UPLOAD_OPTION` unless the value already matches it. Without it, behavior is unchanged.
  - `fillPage.ts`: `FillContext.resumePath` is replaced by `resume: () => Promise<string | null>` and `uploadName?: string`. `savedResume = !ctx.uploadName && usesSavedResume(fields)`. A sent resume-choice radio sets `revealed = true` (the file box appears after it).
  - `applyService.ts`: a `resumeSource()` built like `letterSource()` (one promise per window, `AbortController` aborted in `closeApplyWindow` and on context close, reset in `openJob`). When `resumeService.isTailorable()` and `applyJob` is set, it awaits `tailorResume` and keeps the outcome for `finish`; otherwise it returns `resumeService.storedResumePath()`. `uploadName` = `storedMasterTex().pdfName` when tailorable.
  - `AutofillResult` (filled stage) gains `tailored?: { jobId: number; kept: string[]; chosenBy: 'tags' | 'claude'; rewritten: boolean; error?: string }`.
  - IPC `openTailoredResume(jobId: number): Promise<boolean>` → `shell.openPath(existingTailoredPdf(validateId(jobId)))`; false when none. The renderer never passes a path.
  - `AutofillNote`: when `tailored` is set, show "**Resume:** tailored with <kept titles joined by ', '> (picked by tags | picked by Claude[, bullets rewritten])" and an "Open PDF" button calling `openTailoredResume`; when `tailored.error`, show "**Resume:** master used. <error>" and no button.

- [ ] **Step 1: Write the failing tests** in `e2e/resume-upload-choice.spec.ts` for `decide` (build `FormField` objects inline; `profile` can be an empty `Profile`):
  - File field labeled "Resume", empty, `{ uploadName: 'Jane-Resume.pdf' }` → `{ kind: 'file' }`.
  - Same field with value `C:\fakepath\Old.pdf` → `{ kind: 'file' }`.
  - Same field with value `C:\fakepath\Jane-Resume.pdf` → `null` (no second upload).
  - Same field with `{ savedResume: true }` and no `uploadName` → `null` (unchanged behavior).
  - Radio labeled "Resume" with options `['Jane_CV.pdf', 'Upload a resume']`, empty: no options → `{ kind: 'option', option: 'Jane_CV.pdf' }`; `{ uploadName: 'x.pdf' }` → `{ kind: 'option', option: 'Upload a resume' }`.
- [ ] **Step 2: Run** `npx playwright test e2e/resume-upload-choice.spec.ts` — expected: the `uploadName` cases FAIL, the unchanged-behavior cases PASS.
- [ ] **Step 3: Implement** all files listed above.
- [ ] **Step 4: Run** `npm test` and `npm run transpile:electron` and `npx tsc -b` — expected: all PASS, no type errors.
- [ ] **Step 5: Stage** changed files.

---

### Task 8: Seed master file and end-to-end check

**Files:**
- Create: `D:\Projects\portfolio\resume\master.tex` (outside this repo; do not stage it here)

- [ ] **Step 1: Write `master.tex`:** copy `D:\Projects\portfolio\resume\resume.tex`. Add a `% tags:` line above each of the 9 projects (3–6 tags each, from its stack and domain, e.g. `ai, rag, mcp, nextjs, python`). Add blocks in the same `\resumeProjectHeading` format for MailScan, NutriTrack, Taskify, Deducation and Daventrest, written from `D:\Projects\portfolio\content\projects.json` (`longDescription`, `date`, `links`), 2–3 bullets each, facts only from that file. Add `% end-projects` after the last project, before `\resumeSubHeadingListEnd`. Do not rename "Expense Tracker"; list the Koban difference for the user instead.
- [ ] **Step 2: Compile** it with `pdflatex` in a scratch folder — expected: compiles, more than 2 pages.
- [ ] **Step 3: Check in the app** (`npm run dev`, one browser at a time): upload `master.tex`; press Autofill on an AI-heavy job and on a frontend/full-stack job with both toggles off → each note lists different projects; "Open PDF" opens a 2-page PDF. Turn on "Choose projects with Claude" and repeat once → note says "picked by Claude". Close the browser when done.
- [ ] **Step 4: Report** to the user: the tags chosen per project, the 5 new project blocks, and the Expense Tracker/Koban difference, for their review. No staging (file is outside the repo).
