import fs from 'fs'
import os from 'os'
import path from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import {
  deleteResume as deleteResumeRow,
  getResumeMeta,
  getResumeText,
  listKeywords,
  replaceAutoKeywords,
  saveResume,
} from "../db/db.js"
import { extractKeywords } from "./keywordService.js"
import { recomputeAll } from "./matchService.js"
import { MAX_RESUME_BYTES, MIN_RESUME_TEXT_CHARS } from "../config.js"
import { extractPdf } from "./pdfText.js"
import { compileTex, LatexError } from "./tailor/latex.js"
import { parseTex, TexFormatError } from "./tailor/texProjects.js"

const RESUME_DIR = path.join(app.getPath('userData'), 'resume')

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.tex': 'application/x-tex',
}

function failure(
  reason: UploadResumeFailure,
  error: string,
  file?: RejectedFile
): UploadResumeResult {
  return { ok: false, reason, error, file }
}

function describeFile(filePath: string, bytes: number): RejectedFile {
  return {
    filename: path.basename(filePath),
    bytes,
    extension: path.extname(filePath).toLowerCase().replace('.', ''),
  }
}

// ---------- text extraction ----------

async function extractDocxText(filePath: string): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ path: filePath })
  return value
}

async function extractText(
  filePath: string,
  extension: string
): Promise<{ text: string; pages?: number }> {
  switch (extension) {
    case '.pdf': return extractPdf(filePath)
    case '.docx': return { text: await extractDocxText(filePath) }
    case '.txt': return { text: fs.readFileSync(filePath, 'utf8') }
    default: throw new Error(`Unsupported extension ${extension}`)
  }
}

// ---------- stored file ----------

/** Only one resume is kept, so the directory is emptied before each copy. */
function replaceStoredFiles(files: { sourcePath: string; filename: string }[]) {
  fs.mkdirSync(RESUME_DIR, { recursive: true })

  for (const existing of fs.readdirSync(RESUME_DIR)) {
    fs.rmSync(path.join(RESUME_DIR, existing), { force: true })
  }

  for (const { sourcePath, filename } of files) {
    fs.copyFileSync(sourcePath, path.join(RESUME_DIR, filename))
  }
}

/** The stored `.tex` file name, if the saved resume is a LaTeX master. */
function storedTexName(): string | null {
  if (!fs.existsSync(RESUME_DIR)) return null
  return fs.readdirSync(RESUME_DIR).find(name => name.toLowerCase().endsWith('.tex')) ?? null
}

function clearStoredFiles() {
  if (!fs.existsSync(RESUME_DIR)) return
  for (const existing of fs.readdirSync(RESUME_DIR)) {
    fs.rmSync(path.join(RESUME_DIR, existing), { force: true })
  }
}

// ---------- service ----------

export const resumeService = {
  /** Opens the native picker. The renderer is sandboxed, so main owns file access. */
  pickResume: async (): Promise<PickedFile | null> => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

    const options: Electron.OpenDialogOptions = {
      title: 'Choose your resume',
      properties: ['openFile'],
      filters: [{ name: 'Resume', extensions: ['pdf', 'docx', 'txt', 'tex'] }],
    }

    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    let bytes = 0
    try {
      bytes = fs.statSync(filePath).size
    } catch {
      bytes = 0
    }

    return {
      path: filePath,
      filename: path.basename(filePath),
      bytes,
      extension: path.extname(filePath).toLowerCase().replace('.', ''),
    }
  },

  uploadResume: async (filePath: string): Promise<UploadResumeResult> => {
    const extension = path.extname(filePath).toLowerCase()
    const mime = MIME_BY_EXTENSION[extension]

    let stats: fs.Stats
    try {
      stats = fs.statSync(filePath)
    } catch {
      return failure('unreadable', 'That file could not be opened.')
    }

    const described = describeFile(filePath, stats.size)

    if (!mime) {
      return failure(
        'unsupported-type',
        'Only PDF, DOCX, TXT and TEX can be parsed. Everything else is rejected before anything is written to disk — your current resume is untouched.',
        described
      )
    }

    if (stats.size > MAX_RESUME_BYTES) {
      const limitMb = Math.round(MAX_RESUME_BYTES / (1024 * 1024))
      return failure('too-large', `That file is larger than ${limitMb} MB.`, described)
    }

    let text: string
    let pages: number | undefined
    let compiledDir: string | null = null
    const storedFiles = [{ sourcePath: filePath, filename: described.filename }]
    // Never throws: a temp folder held open must not stop the new resume being saved.
    const dropCompiled = () => {
      try {
        if (compiledDir) fs.rmSync(compiledDir, { recursive: true, force: true, maxRetries: 3 })
      } catch (err) {
        console.warn('[resume] could not remove a temp folder:', err instanceof Error ? err.message : err)
      }
    }
    try {
      if (extension === '.tex') {
        try {
          const source = fs.readFileSync(filePath, 'utf8')
          parseTex(source)
          const pdf = await compileTex(source)
          compiledDir = path.dirname(pdf)
          storedFiles.push({
            sourcePath: pdf,
            filename: `${path.basename(filePath, path.extname(filePath))}.pdf`,
          })
          ;({ text, pages } = await extractPdf(pdf))
        } catch (err) {
          if (err instanceof TexFormatError || err instanceof LatexError) {
            dropCompiled()
            return failure('latex', err.message, described)
          }
          throw err
        }
      } else {
        ;({ text, pages } = await extractText(filePath, extension))
      }
    } catch (err) {
      dropCompiled()
      const message = err instanceof Error ? err.message : String(err)
      if (/password/i.test(message)) {
        return failure(
          'unreadable',
          'That PDF is password protected. Remove the password and try again.',
          described
        )
      }
      // The parser's own words — "ENOENT", "Corrupted zip", a mammoth stack —
      // belong in the terminal, not in front of someone holding a resume.
      console.error('[resume] extraction failed:', err)
      return failure(
        'unreadable',
        'That file could not be read. Try opening it, saving a fresh copy as PDF, DOCX or TXT, and uploading that.',
        described
      )
    }

    // A scanned PDF opens fine and yields nothing. Accepting it silently would
    // produce zero keywords and an all-zero match column with no explanation.
    const characters = text.trim().length
    if (characters < MIN_RESUME_TEXT_CHARS) {
      dropCompiled()
      return failure(
        'no-text-layer',
        extension === '.pdf'
          ? 'The file opened fine, but every page is an image of your resume rather than text — so there is nothing for JobCheats to read.'
          : 'That file contains too little text to extract keywords from.',
        { ...described, pages, characters }
      )
    }

    const filename = described.filename

    try {
      replaceStoredFiles(storedFiles)
    } catch (err) {
      // Nearly always the file being held open by Word or a PDF viewer.
      console.error('[resume] could not store the file:', err)
      dropCompiled()
      return failure(
        'unreadable',
        'The resume could not be saved. Close the file if it is open in another app, then try again.',
        described
      )
    }

    dropCompiled()

    saveResume(filename, mime, text, stats.size)
    replaceAutoKeywords(extractKeywords(text))
    recomputeAll()

    const resume = resumeService.getResume()
    if (!resume) return failure('unreadable', 'The resume could not be saved.')

    return { ok: true, resume, keywords: listKeywords() }
  },

  getResume: (): ResumeMeta | null => {
    const meta = getResumeMeta()
    const master = resumeService.storedMasterTex()
    if (!meta || !master) return meta
    try {
      const projects = parseTex(master.source).projects.map(({ title, tags }) => ({ title, tags }))
      return { ...meta, projects }
    } catch {
      return meta
    }
  },

  /** Where the uploaded file sits on disk, for attaching to an application. A `.tex` master gives its compiled PDF. */
  storedResumePath: (): string | null => {
    if (!fs.existsSync(RESUME_DIR)) return null
    const files = fs.readdirSync(RESUME_DIR)
    const tex = files.find(name => name.toLowerCase().endsWith('.tex'))
    const file = tex ? files.find(name => name === `${path.basename(tex, path.extname(tex))}.pdf`) : files[0]
    return file ? path.join(RESUME_DIR, file) : null
  },

  /** The stored master's text, and the file name to upload its PDF under. */
  storedMasterTex: (): { source: string; pdfName: string } | null => {
    const tex = storedTexName()
    if (!tex) return null
    return {
      source: fs.readFileSync(path.join(RESUME_DIR, tex), 'utf8'),
      pdfName: `${path.basename(tex, path.extname(tex))}.pdf`,
    }
  },

  /** Compiles editor text for the preview. Nothing is stored; the PDF bytes go back to the window. */
  previewTex: async (source: string): Promise<TexPreviewResult> => {
    let pdf: string
    try {
      pdf = await compileTex(source)
    } catch (err) {
      return { ok: false, error: err instanceof LatexError ? err.message : 'LaTeX could not build this file.' }
    }
    try {
      return { ok: true, pdf: new Uint8Array(fs.readFileSync(pdf)) }
    } finally {
      try {
        fs.rmSync(path.dirname(pdf), { recursive: true, force: true, maxRetries: 3 })
      } catch (err) {
        console.warn('[resume] could not remove a temp folder:', err instanceof Error ? err.message : err)
      }
    }
  },

  /**
   * Saves editor text as the stored master. It goes through uploadResume under
   * the same file name, so it gets every check an upload gets and a failed save
   * leaves the old resume in place.
   */
  saveTex: async (source: string): Promise<UploadResumeResult> => {
    const name = storedTexName()
    if (!name) return failure('unreadable', 'There is no LaTeX resume to save.')

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-edit-'))
    try {
      const file = path.join(dir, name)
      fs.writeFileSync(file, source, 'utf8')
      return await resumeService.uploadResume(file)
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
      } catch (err) {
        console.warn('[resume] could not remove a temp folder:', err instanceof Error ? err.message : err)
      }
    }
  },

  isTailorable: (): boolean => {
    try {
      const master = resumeService.storedMasterTex()
      return !!master && parseTex(master.source).projects.length > 0
    } catch {
      return false
    }
  },

  getResumeText,

  deleteResume: (): boolean => {
    clearStoredFiles()
    const deleted = deleteResumeRow()
    // Auto keywords came from the resume, so they go with it. Manual ones stay.
    replaceAutoKeywords([])
    recomputeAll()
    return deleted
  },
}
