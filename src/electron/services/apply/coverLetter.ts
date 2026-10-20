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
- 180 to 250 words in three short paragraphs. End with "Kind regards," and the applicant's name.
- Use only facts that are in the résumé. Do not invent employers, degrees, skills, projects or numbers.
- Pick the two or three parts of the résumé that fit this job best and say why they fit.
- Leave education out entirely: no school, university, college, degree, course, grades or graduation date, and never say the applicant needs the role or an internship for their studies. Write about what they can do for this job, from their skills, projects and work.
- Make no claims about visas, work rights or sponsorship.
- Write like a person: specific and direct. No "I am writing to express my interest", no "passionate", no "excited to leverage".
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
