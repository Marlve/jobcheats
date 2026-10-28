import { test, expect } from '@playwright/test'
import { parseTex, buildTex, blockTitle, TexFormatError } from '../src/electron/services/tailor/texProjects.js'

const source = String.raw`\documentclass{article}
\begin{document}
\section{Projects}
% tags: ai, rag
\textbf{Alpha} -- Search tool
\begin{itemize}
\item Built alpha retrieval bullet
\end{itemize}
% tags:
\textbf{Beta} -- Plain site
\begin{itemize}
\item Built beta site bullet
\end{itemize}
% tags: android, kotlin
\textbf{Gamma} -- Phone app
\begin{itemize}
\item Built gamma app bullet
\end{itemize}
% end-projects
\section{Skills}
Things
\end{document}
`

test('parses three projects with tags and titles', () => {
  const p = parseTex(source)
  expect(p.projects.length).toBe(3)
  expect(p.projects[0].tags).toEqual(['artificial intelligence', 'rag'])
  expect(p.projects[1].tags).toEqual([])
  expect(p.projects[2].tags).toEqual(['android', 'kotlin'])
  expect(p.projects.map((x) => x.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
  expect(p.projects[0].id).toBe(0)
  expect(p.projects[0].text).toContain('alpha retrieval bullet')
  expect(p.projects[0].text).not.toContain(String.raw`\item`)
  expect(p.tail.startsWith('% end-projects')).toBe(true)
})

test('round trip keeps the source exactly', () => {
  expect(buildTex(parseTex(source), [0, 1, 2])).toBe(source)
})

test('keeps master order and drops unkept projects', () => {
  const out = buildTex(parseTex(source), [2, 0])
  expect(out.indexOf('Alpha')).toBeGreaterThan(-1)
  expect(out.indexOf('Alpha')).toBeLessThan(out.indexOf('Gamma'))
  expect(out).not.toContain('Beta')
})

test('replace swaps in a rewritten block', () => {
  const out = buildTex(parseTex(source), [0], new Map([[0, '% tags: ai\nNEW\n']]))
  expect(out).toContain('NEW')
  expect(out).not.toContain('alpha retrieval bullet')
})

test('no tag lines leaves the source alone', () => {
  const plain = String.raw`\documentclass{article}` + '\nHello\n'
  const p = parseTex(plain)
  expect(p.projects).toEqual([])
  expect(buildTex(p, [])).toBe(plain)
})

test('tag lines without end marker throw', () => {
  expect(() => parseTex('% tags: ai\nX\n')).toThrow('Add a "% end-projects" line after your last project.')
  expect(() => parseTex('% tags: ai\nX\n')).toThrow(TexFormatError)
})

test('tags use canonical spelling', () => {
  const p = parseTex('% tags: Golang, JS\nX\n% end-projects\n')
  expect(p.projects[0].tags).toEqual(['golang', 'javascript'])
})

test('blockTitle reads the first textbf', () => {
  expect(blockTitle(String.raw`% tags: a
\textbf{Duski} -- Assistant`)).toBe('Duski')
  expect(blockTitle('% tags: a\n\n Plain ' + String.raw`\emph{line}` + '\nmore')).toBe('Plain line')
})
