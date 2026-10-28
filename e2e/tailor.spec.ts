import { test, expect } from '@playwright/test'
import { compileTex, findLatexCompiler, pdfPages } from '../src/electron/services/tailor/latex.js'
import { extractPdf } from '../src/electron/services/pdfText.js'
import { fitRewrite, removeCompiled, tailorTex } from '../src/electron/services/tailor/tailor.js'
import { rankProjects } from '../src/electron/services/tailor/rankProjects.js'
import { parseTex } from '../src/electron/services/tailor/texProjects.js'

test.skip(!findLatexCompiler(), 'pdflatex not installed')

const FILLER = 'Planned the weekly work with the team, wrote clear notes for each change, and checked every result twice before each release reached the people who use it'

const project = (title: string, tags: string, bullet = FILLER) =>
  `% tags: ${tags}\n\\textbf{${title}}\n\\begin{itemize}\n` +
  Array.from({ length: 8 }, (_, i) => `\\item ${bullet}, step ${i + 1}.\n`).join('') +
  '\\end{itemize}\n'

const TITLES = ['Alpha Search', 'Bravo Shop', 'Charlie Board', 'Pocket Notes', 'Delta Sync', 'Echo Reports', 'Foxtrot Maps']
const ANDROID = 3

const master =
  '\\documentclass{article}\n\\begin{document}\n\\section*{Projects}\n' +
  TITLES.map((title, id) =>
    id === ANDROID
      ? project(title, 'android, kotlin', 'Built a note taking phone app in Kotlin for Android with offline storage and a simple home screen widget')
      : project(title, ['python', 'react', 'typescript', 'docker', 'aws', 'sql'][id > ANDROID ? id - 1 : id]),
  ).join('') +
  '% end-projects\n\\end{document}\n'

const job = { title: 'Android Developer', company: 'Acme', location: null, description: 'We build apps in Kotlin for Android phones.' }

test('tailorTex keeps the job-relevant projects that fit on two pages, in master order', async () => {
  test.setTimeout(120_000)
  const all = await compileTex(master)
  const allPages = await pdfPages(all)
  removeCompiled(all)
  expect(allPages).toBeGreaterThan(2)

  const result = await tailorTex(master, job, { choose: false, rewrite: false }, new AbortController().signal)
  try {
    expect(await pdfPages(result.pdf)).toBeLessThanOrEqual(2)
    expect(result.kept).toContain(ANDROID)
    expect(result.kept.length).toBeLessThan(TITLES.length)
    // Exactly the lowest-ranked projects were dropped.
    const ranked = rankProjects({ title: job.title, aboutText: job.description }, parseTex(master).projects)
    expect(result.kept).toEqual(ranked.slice(0, result.kept.length).sort((a, b) => a - b))
    expect(result.chosenBy).toBe('tags')
    expect(result.rewritten).toBe(false)
    expect(result.error).toBeUndefined()

    const text = (await extractPdf(result.pdf)).text
    const positions = result.kept.map(id => text.indexOf(TITLES[id]))
    expect(positions).not.toContain(-1)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    for (const id of TITLES.keys()) {
      if (!result.kept.includes(id)) expect(text).not.toContain(TITLES[id])
    }
  } finally {
    removeCompiled(result.pdf)
  }
})

test('fitRewrite puts back only the rewritten block that breaks the compile', async () => {
  test.setTimeout(60_000)
  const small = parseTex(
    '\\documentclass{article}\n\\begin{document}\n' +
    '% tags: python\n\\textbf{Alpha} -- Original alpha line.\n\n' +
    '% tags: react\n\\textbf{Bravo} -- Original bravo line.\n\n' +
    '% end-projects\n\\end{document}\n',
  )
  const replace = new Map([
    [0, '% tags: python\n\\textbf{Alpha} -- Fish & chips line.\n\n'],
    [1, '% tags: react\n\\textbf{Bravo} -- Reworded bravo line.\n\n'],
  ])

  const fit = await fitRewrite(small, [1, 0], replace, new AbortController().signal)
  try {
    expect(fit.broken).toEqual([0])
    expect(fit.kept).toEqual([1, 0])
    expect([...fit.replace.keys()]).toEqual([1])
    const text = (await extractPdf(fit.pdf!)).text
    expect(text).toContain('Original alpha line.')
    expect(text).toContain('Reworded bravo line.')
    expect(text).not.toContain('Original bravo line.')
  } finally {
    if (fit.pdf) removeCompiled(fit.pdf)
  }
})
