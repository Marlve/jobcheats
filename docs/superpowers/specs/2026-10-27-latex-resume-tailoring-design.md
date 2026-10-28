# LaTeX resume tailoring — design

Status: draft, agreed in conversation on 2026-10-27.

## Intent

Today the app stores one resume file (PDF, DOCX or TXT). It uses that file for three things: job scoring (keywords), cover letters, and the file Autofill uploads into application forms.

The user keeps their resume as LaTeX and wants the **Projects section to change per job**. Education, Experience and Skills stay fixed. An AI role should get the AI projects; a full-stack role should get the web projects; an Android role should get the Android projects. Doing this by hand per application is the work this feature removes.

## Goals

1. Accept a `.tex` file as the stored resume (a "master" with every project in it).
2. When the user presses **Autofill** on a job, build a tailored PDF for that job and upload it instead of the master.
3. Projects are ranked by **tags** the user writes in the `.tex` file. This path needs no AI and no network.
4. Two opt-in Settings toggles, both off by default:
   - **Choose projects with Claude** — Claude picks the projects instead of the tag ranking.
   - **Rewrite project bullets with Claude** — Claude rewrites the bullets of the kept projects to use the job's wording.
5. The user can see which projects were kept and open the tailored PDF before they press Submit.

## Non-goals

- No tailoring of Education, Experience or Skills.
- No tailoring for PDF/DOCX/TXT uploads. They keep working exactly as today.
- No in-app LaTeX editor and no in-app tag editor. The user edits the `.tex` in their own editor and uploads it again.
- No multi-file LaTeX projects (`\input` of local files, custom `.cls`). One self-contained `.tex` file.
- No change to how jobs are scored.

## Anti-goals (failure even if it "works")

- Claude invents a project, a technology, a number or a result that is not in the master. Rewrites must keep the facts of the original bullets.
- Autofill fails or stalls because tailoring failed. Tailoring is best-effort; Autofill always continues.
- Submit gets pressed. It never is (existing rule).
- Tailoring one job changes the scores of other jobs.

## Existing code this builds on

- Resume upload, validation and storage: `src/electron/services/resumeService.ts` (accepted types at lines ~19–21 and ~81–83, dialog filter ~118, stored path `storedResumePath()` ~234, storage dir `userData/resume`).
- Keyword extraction: `src/electron/services/keywordService.ts`; matching: `src/electron/services/matching.ts`.
- Autofill orchestration: `src/electron/services/applyService.ts`. The cover letter is the pattern to copy: `letterSource()` (~line 111) builds it lazily, at most once per application window, with an `AbortController` that stops it when the window closes, and records a `letterError` shown under the job.
- File upload into forms: `fillPage.ts` ~335 calls `setInputFiles(resumePath)` when a file field is found.
- Claude CLI runner: `src/electron/services/apply/coverLetter.ts` (`runClaude`, prompt on stdin, two-minute timeout, kills the process tree on Windows, clear "Claude Code was not found" error). Reuse it; do not write a second runner.
- Cover-letter toggle storage: `src/electron/db/settings.ts` (`isCoverLetterEnabled` / `setCoverLetterEnabled`, key `autofill.coverLetter`). The two new toggles follow the same pattern and sit next to it in the Settings screen.
- The note under a job after Autofill: `src/ui/components/AutofillNote.tsx`.
- Job deletion: `pruneOldJobs` in `src/electron/db/jobs.ts` (plus any other delete paths).

## The master `.tex` format

The master is the user's normal resume with **every** project in it, plus one comment line per project:

```latex
% tags: ai, rag, mcp, python, nextjs
\resumeProjectHeading
    {\textbf{Workflow Management with MCP} -- ...}{April -- May 2026}
    \resumeItemListStart
      \resumeItem{...}
    \resumeItemListEnd

% tags: android, kotlin, jetpack compose, llm
\resumeProjectHeading
    ...
% end-projects
```

Rules (decided by the assistant, so the format works with any template, not only Jake's Resume):

- A project block starts at a `% tags:` line and ends just before the next `% tags:` line or the `% end-projects` line.
- Every project needs a `% tags:` line. An empty one (`% tags:`) marks a project with no tags; it is still ranked by its own text. A project with no `% tags:` line at all is not a block: it becomes part of the block above it, or fixed text if it comes before the first tag line. The Insights project list makes this visible.
- Everything outside project blocks is fixed text and is copied unchanged.
- Tags are comma-separated, free text, case-insensitive. They go through the same canonical-spelling step as keywords (`canonicalSkill`), so `golang` and `go` match.
- A master with no `% tags:` lines is still accepted. It compiles and uploads unchanged, with no tailoring, and the Insights screen says why.
- The file stays valid LaTeX: comments do not change the output, so the user can still compile it anywhere.

## Upload flow (Insights screen)

1. The file dialog accepts `.tex` as a fourth type.
2. The app compiles the master with the local LaTeX install (MiKTeX `pdflatex` on the user's PC; ~3 s per compile). Compile runs in a temp folder with `-interaction=nonstopmode -halt-on-error` and **without shell escape**.
3. If compile fails, the upload is refused with the first LaTeX error line, and the existing resume is kept (same rule as other refusals today).
4. If no LaTeX compiler is found, the upload is refused with a plain message telling the user to install MiKTeX or TeX Live.
5. Keywords are extracted from the compiled master PDF through the existing PDF text path. Keyword extraction itself does not change. The existing 200-character check applies.
6. Stored: the `.tex` and its compiled PDF. The compiled master PDF is what scoring, cover letters and non-tailored uploads use.
7. The screen lists the projects found and their tags, so the user can see the parse worked.

## Tailoring flow (on Autofill)

Runs only when the stored resume is a `.tex` with at least one tagged project.

1. The user presses **Autofill**. The browser flow starts as today.
2. The tailored PDF is built lazily, the same way as the cover letter: when a form first needs a resume file, at most once per application window, aborted when the window closes. It may start eagerly in parallel if that is simpler, as long as it is aborted the same way.
3. **Rank projects.**
   - Toggle off: score each project against the job's keywords using its tags plus its own heading and bullet text, with tags weighted above body text. Reuse the matching code; do not write a second matcher.
   - Toggle on: send Claude the job (title, company, description) and the list of projects (id, title, tags, bullets). Claude returns an ordered list of project ids. Ids not in the master are dropped. If Claude fails, fall back to the tag ranking.
4. **Fit to the page limit: 2 pages, fixed** (user decision). Compile with the top-ranked projects. While the PDF is over 2 pages, remove the lowest-ranked project and compile again. Page count via the existing pdfjs dependency. Keep the number of compiles small (start from a sensible count rather than from all projects). Kept projects appear in **master order**, not rank order, so the user's own layout (by date) is kept.
5. **Rewrite bullets** (only if that toggle is on): one Claude call with the LaTeX blocks of all kept projects and the job text. Claude returns the same blocks with reworded bullets. The prompt forbids new facts, technologies, numbers or results, and forbids changing the heading line. Code checks each returned block and uses the original block instead when:
   - the block is missing or its heading line changed,
   - it contains a number that is not in the original block,
   - it contains a known skill (skills dictionary in `keywordService`) that is not in the original block,
   - it breaks the compile.
   After rewriting, compile once more; if the rewrite pushed it over 2 pages, drop the lowest-ranked project again.
6. **Time limit:** the whole tailoring step has a 3-minute limit per Autofill press. Past it, abort Claude and use the master PDF.
7. Autofill uploads the tailored PDF. On any tailoring failure, it uploads the compiled master PDF and records the reason, the same way `letterError` works.
8. The note under the job shows: the projects kept, whether Claude chose or rewrote, an **Open PDF** button, and the failure reason if there was one. The user checks the PDF in the form before pressing Submit; if they do not like it, they replace the file in the form themselves. No separate approval step.

## Saved resumes on LinkedIn and Seek (user decision)

Today Autofill deliberately picks a resume already saved on the site and attaches no file (`matcher.ts`: `isResumeChoice`, `usesSavedResume`, and `decide()` skips a file field that already has a value). Reason in the code: "uploading adds a new copy to the account each time".

When a tailored PDF is in use (stored resume is a tagged `.tex`), this changes:

- A resume choice picks the **upload** option instead of the saved file, and the tailored PDF is attached.
- A resume file field that already holds a file gets the tailored PDF instead.
- The user accepted that each application adds one more resume file to their LinkedIn or Seek account.

When the stored resume is PDF, DOCX, TXT, or an untagged `.tex`, the current saved-resume behavior stays.

## Storage of tailored PDFs

- One tailored PDF per job in the app data folder (for example `userData/tailored/<jobId>.pdf`), overwritten by the next Autofill on the same job.
- Deleted when its job is deleted (retention prune or removal). Archived jobs keep theirs on disk.
- Uploading a new master does not delete existing tailored PDFs.
- No UI to open a job's tailored PDF after the Autofill note is gone. Out of scope for now.

## Privacy

Same rule as cover letters: nothing leaves the PC unless a Claude toggle is on. With either toggle on, the job text and the project blocks go to Claude through the user's own `claude` CLI. The Settings text says so.

## Seed content

The user's current resume is `D:\Projects\portfolio\resume\resume.tex` (Jake's Resume template, 9 projects, compiles to 2 pages). The portfolio's `content/projects.json` has 14 projects; 5 are not in the resume (MailScan, NutriTrack, Taskify, Deducation, Daventrest), and the resume's "Expense Tracker" is the portfolio's "Koban".

A first tagged master is created from these two sources as a separate file, `D:\Projects\portfolio\resume\master.tex`, so the portfolio's published resume does not change. It stays out of this repo because the repo is public and the file holds personal data. The user reviews the tags and the 5 new project blocks before uploading it.

## Calls made by the assistant (user to check)

- Tags live in `% tags:` comments in the `.tex`; blocks end at the next tag line or `% end-projects`. An empty `% tags:` marks an untagged project.
- Compile uses `pdflatex`; no shell escape.
- Kept projects appear in master order.
- Rewrites are one Claude call, checked in code for new numbers and new known skills.
- Tailoring has a 3-minute limit per press.
- Claude failures fall back to the tag ranking and the original bullets; tailoring failures fall back to the master PDF.
- Tailored PDFs are kept per job and deleted with the job; no UI to reopen them later.
- The seed master is a new file next to the portfolio resume, not an edit of it.

## User decisions

- Page limit: 2 pages, fixed.
- On LinkedIn and Seek, upload the tailored PDF instead of the saved resume.

## Left to the builder

- Module layout and names, IPC shape, UI layout of the project list and the note.
- Exact ranking weights and the starting project count for the fit loop.
- How the LaTeX compiler is located (PATH lookup plus the usual MiKTeX / TeX Live install folders).
- Test coverage, following the repo's existing Playwright e2e style.
