<div align="center">
  <img src="icon.png" alt="JobCheats" width="96">
  <h1>JobCheats</h1>
  <p>Reads your resume once, then scans LinkedIn and Seek and scores every job against it.<br>Everything stays on your machine.</p>
</div>

This document covers the three parts people ask about: how a resume file is turned into text, how keywords are pulled out of that text, and how the job boards are actually read.

## Reading the resume

A resume arrives as a file you picked in a dialog. Three types are accepted, and anything else is rejected before a single byte is written to disk — your existing resume is left alone.

| Type | How the text comes out |
|------|------------------------|
| **PDF** | Mozilla's PDF library walks the document one page at a time and asks each page for its text items. Those are the individual runs of characters the PDF was built from, so they are joined with spaces, and pages are joined with newlines. |
| **DOCX** | A `.docx` is a zip archive of XML. The archive is opened and the raw text pulled out, with all the styling discarded. |
| **TXT** | Read as-is. |

The whole thing runs in the main process rather than the window, because the window is sandboxed and has no file access of its own.

### When a PDF has no text in it

This is the failure worth understanding, because the file looks perfectly fine when you open it.

A PDF can hold either real text or a **picture** of text. If your resume was scanned, photographed, or exported by certain print-to-PDF tools, every page is an image. It opens, it renders, you can read it on screen — but there are no characters in the file, only pixels. Asking it for text returns nothing.

So the extracted text is measured before anything is saved. Under 200 characters and the upload is refused, and you are told the pages are images rather than text rather than being left to wonder why your match scores are all zero. The page count is reported back too, so the message can say something concrete like "2 pages, 0 characters".

> [!TIP]
> If you hit this, don't scan the printout again. Open the original in Word, Google Docs or Pages and export straight to PDF from there — or just upload the DOCX. If a scan is genuinely all you have, run it through OCR (software that recognises letters in an image) and upload the result.

Two other refusals: files over 10 MB, and password-protected PDFs. Both are detected before anything is stored, and both say which one happened rather than giving you the parser's own error text.

### What gets kept

One resume, ever. The storage directory is emptied before the new file is copied in, so replacing your resume genuinely deletes the old one rather than accumulating copies. Deleting the resume also drops the keywords that were extracted from it — but keeps any you added by hand, since those were your work, not the file's.

## Extracting keywords

The extracted text becomes a ranked list of the 20 terms that best describe your career. Four steps.

**1. Split into tokens.** Text is lowercased and split on whitespace, but `+ # . / -` are kept *inside* words. This is deliberate and load-bearing: strip them and `c++` becomes `c`, `node.js` becomes two words, and `ci/cd` and `scikit-learn` fall apart. Most of a technical resume would turn into noise.

**2. Throw out what carries no signal.** A token survives if it is at least two characters, is not one of 401 stopwords (`the`, `and`, `experience`, `responsible`…), and is not a bare number. Single characters are excluded from automatic extraction because a keyword like `r` matches far too loosely against job text and would inflate every score — you can still add it by hand if you mean it.

**3. Count, including known multi-word skills.** Every surviving token is counted. Two-word pairs are counted *only* if they appear in a dictionary of 204 known skill phrases — so `machine learning` is counted as one thing, while `monash university` is not. Accepting any frequent pair is what produces that kind of junk.

**4. Rank, with skills weighted heavily.** Each term scores its frequency multiplied by ten if a 338-entry skills dictionary recognises it. That boost is what lets `docker`, mentioned twice, beat a generic word mentioned fifteen times. The top 20 are kept.

> [!NOTE]
> Ranking and the weight shown in the UI are deliberately different numbers. Ranking uses the skill boost; the `×1`/`×2`/`×3` badge is just how many times the word appears in your resume, capped at three. The badge is something you can verify by looking at your own document — a boosted score is not.

### Matching spellings to each other

Before comparison, a term is reduced to one canonical spelling, in a fixed order:

1. **An alias table** (48 entries) — `golang` becomes `go`, `js` becomes `javascript`.
2. **Otherwise, if the dictionary already knows the word, leave it exactly as written.** This step exists to stop the next one mangling `sass` into `sas` or `rails` into `rail`.
3. **Only then try a trailing `s`**, in both directions, so `microservice` and `algorithms` need no dictionary entries of their own.

Anything unrecognised comes back unchanged, which is what lets a hand-added keyword for something no dictionary has heard of still be compared.

## Scraping the boards

Scanning drives a real browser. Not a hidden HTTP client — an actual Chrome or Edge window, because both sites render results with JavaScript and neither serves a usable page without it.

### Which browser, and whose

The scan uses **Google Chrome if you have it, otherwise Microsoft Edge**, which ships with Windows. Playwright normally supplies its own Chromium build, but that is a 400 MB download that only a developer command fetches — not something a packaged app can assume.

> [!IMPORTANT]
> The scan runs in its own separate browser profile stored under the app's data directory. It never touches your windows, your history, your bookmarks, or your signed-in sessions. Which browser you personally *browse* with is irrelevant — a Firefox user is fine, their Edge is just sitting there unused.

### Where the window goes

The browser is parked off-screen at coordinates far outside any monitor, rather than minimised. That distinction is doing real work: Windows treats a minimised window as hidden and stops the page rendering, and LinkedIn only builds the result cards near the visible area. A minimised scan would read the first handful of jobs and then find nothing after them. Parked off-screen, the browser still believes it is visible and keeps rendering, while nothing appears on any of your screens.

It comes back on screen for exactly one reason — LinkedIn asking you to sign in — and is put away again the moment you have. A scan on an already-signed-in account never surfaces at all.

### LinkedIn

LinkedIn serves more than one version of its results page depending on your account, locale and whichever A/B test you have landed in. Rather than pinning one set of selectors and breaking for half of users, each known page structure is described separately and the scan detects which one rendered.

Reading it is click-driven, because LinkedIn is a single long page whose detail panel swaps in place:

- The posting id is read off the card first. **Jobs already stored are skipped before the click**, which is most of why a second run is so much faster.
- Clicking a card swaps in the description. The scan waits until the panel genuinely belongs to the job clicked, keyed on the id in the address bar — necessary because two consecutive postings with identical wording are otherwise indistinguishable.
- The list is virtualised, meaning only cards near the viewport exist at all. Scrolling the last one into view renders the next batch, so the count is re-read every turn rather than sampled once.
- Paging checks the next button is *enabled*, not merely present — LinkedIn leaves a dead one in place on the final page, which a naive check loops on forever.
- Pauses between jobs are randomised between roughly 0.35 and 0.9 seconds, so clicks don't land on a machine-perfect cadence.

If a search returns nothing, LinkedIn answers with a "Similar jobs" block instead. Those get read and scored like anything else — ending a scan empty-handed while the page in front of you is full of jobs is the worse outcome. This doubles as the check that tells an empty search apart from a page structure that has changed: if the recommendations can be read, the search was simply empty.

### Seek

Seek is shaped differently, so it is read differently rather than forced through the same flow.

Its result list is plain and addressable — every card carries its posting id, and every posting has its own URL. So the whole list is read in one pass, then each new posting is fetched directly by URL. Reading the list first means a re-run does no page loading at all for jobs already stored, since the id is on the card before anything is opened.

**Seek needs no sign-in.** Seek and JobStreet are the same platform behind different domains and redirect to the same place.

### When it breaks

Scraping reads someone else's website, and websites change. When the page can no longer be read, the scan says so in plain language and suggests the app needs updating, while the selector details that would actually diagnose it go to the terminal. Individual jobs that fail are counted and stepped over rather than taking the whole run down, and everything found before a failure is kept.

## Running it

```sh
npm install
npm run dev
```

Building a Windows package:

```sh
npm run dist:win
```
