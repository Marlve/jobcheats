import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { compileTex, findLatexCompiler, pdfPages } from '../src/electron/services/tailor/latex.js'
import { extractPdf } from '../src/electron/services/pdfText.js'

test.skip(!findLatexCompiler(), 'pdflatex not installed')

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
