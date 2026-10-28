import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { extractPdf } from '../pdfText.js'

const TIMEOUT_MS = 60_000

export class LatexError extends Error {}

/** The last compiler found: searching runs `where`, which blocks the main process. */
let cachedCompiler: string | null = null

export function findLatexCompiler(): string | null {
  if (cachedCompiler && fs.existsSync(cachedCompiler)) return cachedCompiler
  cachedCompiler = searchLatexCompiler()
  return cachedCompiler
}

function searchLatexCompiler(): string | null {
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pdflatex'], { encoding: 'utf8' })
  const onPath = found.status === 0 ? found.stdout.split(/\r?\n/)[0].trim() : ''
  if (onPath) return onPath

  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64', 'pdflatex.exe'),
    path.join(process.env.ProgramFiles ?? '', 'MiKTeX', 'miktex', 'bin', 'x64', 'pdflatex.exe'),
  ]
  try {
    const years = fs.readdirSync('C:/texlive').filter(name => /^[0-9]{4}$/.test(name)).sort().reverse()
    for (const year of years) candidates.push(path.join('C:/texlive', year, 'bin', 'windows', 'pdflatex.exe'))
  } catch { /* no TeX Live folder */ }
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null
}

function stop(child: ReturnType<typeof spawn>): void {
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill())
  } else {
    child.kill()
  }
}

/** Compiles to a fresh temp folder that the caller reads from. Returns the PDF path. */
export function compileTex(source: string, signal?: AbortSignal): Promise<string> {
  const compiler = findLatexCompiler()
  if (!compiler) {
    return Promise.reject(new LatexError('No LaTeX compiler was found. Install MiKTeX or TeX Live, then try again.'))
  }
  if (signal?.aborted) return Promise.reject(new LatexError('Cancelled.'))

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-tex-'))
  fs.writeFileSync(path.join(dir, 'resume.tex'), source)

  return new Promise((resolve, reject) => {
    const child = spawn(
      compiler,
      ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', 'resume.tex'],
      { cwd: dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let output = ''
    let failure: LatexError | null = null
    const collect = (chunk: Buffer) => { output += chunk.toString() }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const kill = (error: LatexError) => { failure ??= error; stop(child) }
    const timer = setTimeout(() => kill(new LatexError('LaTeX took longer than a minute.')), TIMEOUT_MS)
    const onAbort = () => kill(new LatexError('Cancelled.'))
    signal?.addEventListener('abort', onAbort, { once: true })
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }

    // Settle first: a folder held open (EBUSY, antivirus) must not leave the promise hanging.
    const fail = (error: LatexError) => {
      reject(error)
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
      } catch { /* left in the temp folder */ }
    }
    child.on('error', error => { done(); fail(new LatexError(error.message)) })
    child.on('close', code => {
      done()
      const pdf = path.join(dir, 'resume.pdf')
      if (failure) return fail(failure)
      if (code === 0 && fs.existsSync(pdf)) return resolve(pdf)
      const line = output.split(/\r?\n/).find(l => l.startsWith('! '))
      fail(new LatexError(line ? line.slice(2) : `LaTeX failed with exit code ${code}.`))
    })
  })
}

export async function pdfPages(pdfPath: string): Promise<number> {
  return (await extractPdf(pdfPath)).pages
}
