import { spawn } from "child_process"
import os from "os"

/**
 * Cover letters, written by the user's own Claude Code (`claude -p`).
 *
 * Opt-in (Settings). Claude runs from a temp folder with every tool switched off
 * and its own system prompt, so it reads nothing from this machine beyond what
 * is put in the prompt: the résumé text, the job and the applicant's name.
 */

const TIMEOUT_MS = 120_000
/** Keeps the prompt sane; a posting's useful part is its first few thousand words. */
const MAX_JOB_CHARS = 6_000
const MAX_RESUME_CHARS = 8_000
/** Seek and most forms cap a cover letter well above this. */
const MAX_LETTER_CHARS = 4_000

const SYSTEM_PROMPT = 'You write job application cover letters as plain text. You never use tools.'

export interface LetterJob {
  title: string
  company: string
  location: string | null
  description: string
}

const RULES = `Write a cover letter for the job below, for the applicant whose résumé is given.

Rules:
- Plain text only: no markdown, no subject line, no placeholders such as [Company].
- 120 to 170 words in two short paragraphs. Start "Hi," or "Dear Hiring Team,". End with "Kind regards," and the applicant's name.
- Use only facts that are in the résumé. Do not invent employers, degrees, skills, projects or numbers.
- Make it specific to this posting. Find two or three concrete details in it (a product, a tool or language, a responsibility, the kind of customer or team) and build the letter on them. Every sentence should be one that would be odd in a letter for a different job; if a sentence could be pasted into any application, cut it.
- Choose the project or piece of work from the résumé that overlaps most with those details, and say what the applicant built and how it relates to them. Pick a different project when a different one fits better; do not default to the most impressive one. Mention a second only in passing. Use at most one number, and only if it is striking. Do not list the résumé.
- Open with the one thing in the posting that interests the applicant, in your own words, and name the role in passing. Never start with "I'm applying for" or "I am writing", and never use the phrase "caught my eye". Say nothing about the company that the posting does not say, and do not praise it. Do not repeat the job description back to the employer.
- If the posting is thin, write less and stay concrete rather than padding.
- Leave education out entirely: no school, university, college, degree, course, grades or graduation date, and never say the applicant needs the role or an internship for their studies.
- Make no claims about visas, work rights or sponsorship.
- Write the way a friendly, competent person writes an email, in the first person. Contractions are fine. Vary sentence length.
- Avoid these, which make a letter sound machine-written: a contrast of the form "not X but Y"; lists of three; dashes (use commas or full stops); a closing line that restates the letter or promises what the applicant "would bring"; lines that announce a point ("Here's the thing"); words like passionate, excited, thrilled, leverage, robust, pivotal, valuable, showcase, "real-world"; "-ing" tails such as "ensuring" or "highlighting".
- Output only the letter.`

function buildPrompt(job: LetterJob, resume: string, applicant: string): string {
  return [
    RULES,
    `APPLICANT: ${applicant || '(name not given)'}`,
    `JOB: ${job.title} at ${job.company}${job.location ? `, ${job.location}` : ''}`,
    `JOB DESCRIPTION:\n${job.description.slice(0, MAX_JOB_CHARS)}`,
    `RÉSUMÉ:\n${resume.slice(0, MAX_RESUME_CHARS)}`,
  ].join('\n\n')
}

/** Runs `claude -p` with the prompt on stdin, so its length never meets a command-line limit. */
function runClaude(prompt: string): Promise<string> {
  const args = ['-p', '--output-format', 'text', '--tools', '', '--system-prompt', SYSTEM_PROMPT,
    '--no-session-persistence', '--disable-slash-commands']

  return new Promise((resolve, reject) => {
    let output = ''
    let errors = ''

    // `claude.exe` starts directly; an npm install is `claude.cmd`, which needs a shell.
    const start = (shell: boolean) => spawn('claude', shell ? args.map(arg => `"${arg}"`) : args, {
      cwd: os.tmpdir(),
      windowsHide: true,
      shell,
    })

    const attach = (child: ReturnType<typeof start>, canRetry: boolean) => {
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('Claude took longer than two minutes.'))
      }, TIMEOUT_MS)

      child.stdout?.on('data', chunk => { output += chunk })
      child.stderr?.on('data', chunk => { errors += chunk })

      child.on('error', err => {
        clearTimeout(timer)
        if (canRetry && ['ENOENT', 'EINVAL'].includes((err as NodeJS.ErrnoException).code ?? '')) {
          attach(start(true), false)
          return
        }
        reject(new Error('Claude Code was not found. Install it and check that `claude` runs in a terminal.'))
      })

      child.on('close', code => {
        clearTimeout(timer)
        if (code === 0) resolve(output)
        else reject(new Error(errors.trim().split('\n')[0]?.slice(0, 160) || `Claude exited with code ${code}.`))
      })

      child.stdin?.on('error', () => {})
      child.stdin?.end(prompt)
    }

    attach(start(false), true)
  })
}

/** What the model wraps a letter in despite being told not to. */
function tidy(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, '')
    .trim()
    .slice(0, MAX_LETTER_CHARS)
}

/** Throws an Error whose message is fit to show the user. */
export async function writeCoverLetter(job: LetterJob, resume: string, applicant: string): Promise<string> {
  const letter = tidy(await runClaude(buildPrompt(job, resume, applicant)))
  if (!letter) throw new Error('Claude sent back an empty reply.')
  return letter
}
