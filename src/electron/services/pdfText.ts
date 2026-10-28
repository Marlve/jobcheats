import fs from 'fs'

/** Page count comes back too, so a rejected scan can say "2 pages, 0 characters". */
export async function extractPdf(filePath: string): Promise<{ text: string; pages: number }> {
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
