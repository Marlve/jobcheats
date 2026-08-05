import fs from 'fs'
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

const RESUME_DIR = path.join(app.getPath('userData'), 'resume')

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
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

/** Page count comes back too, so a rejected scan can say "2 pages, 0 characters". */
async function extractPdf(filePath: string): Promise<{ text: string; pages: number }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const data = new Uint8Array(fs.readFileSync(filePath))
  const loadingTask = getDocument({ data, useSystemFonts: true })

  try {
    const document = await loadingTask.promise
    const pages: string[] = []

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
      pages.push(text)
    }

    return { text: pages.join('\n'), pages: document.numPages }
  } finally {
    // destroy() lives on the loading task, not the document proxy, and tears
    // down the worker — skipping it leaks a process per upload.
    await loadingTask.destroy()
  }
}

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
function replaceStoredFile(sourcePath: string, filename: string) {
  fs.mkdirSync(RESUME_DIR, { recursive: true })

  for (const existing of fs.readdirSync(RESUME_DIR)) {
    fs.rmSync(path.join(RESUME_DIR, existing), { force: true })
  }

  fs.copyFileSync(sourcePath, path.join(RESUME_DIR, filename))
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
      filters: [{ name: 'Resume', extensions: ['pdf', 'docx', 'txt'] }],
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
        'Only PDF, DOCX and TXT can be parsed. Everything else is rejected before anything is written to disk — your current resume is untouched.',
        described
      )
    }

    if (stats.size > MAX_RESUME_BYTES) {
      const limitMb = Math.round(MAX_RESUME_BYTES / (1024 * 1024))
      return failure('too-large', `That file is larger than ${limitMb} MB.`, described)
    }

    let text: string
    let pages: number | undefined
    try {
      const extracted = await extractText(filePath, extension)
      text = extracted.text
      pages = extracted.pages
    } catch (err) {
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
      return failure(
        'no-text-layer',
        extension === '.pdf'
          ? 'The file opened fine, but every page is an image of your resume rather than text — so there is nothing for JobMatch to read.'
          : 'That file contains too little text to extract keywords from.',
        { ...described, pages, characters }
      )
    }

    const filename = described.filename

    try {
      replaceStoredFile(filePath, filename)
    } catch (err) {
      // Nearly always the file being held open by Word or a PDF viewer.
      console.error('[resume] could not store the file:', err)
      return failure(
        'unreadable',
        'The resume could not be saved. Close the file if it is open in another app, then try again.',
        described
      )
    }

    saveResume(filename, mime, text, stats.size)
    replaceAutoKeywords(extractKeywords(text))
    recomputeAll()

    const resume = getResumeMeta()
    if (!resume) return failure('unreadable', 'The resume could not be saved.')

    return { ok: true, resume, keywords: listKeywords() }
  },

  getResume: (): ResumeMeta | null => getResumeMeta(),

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
