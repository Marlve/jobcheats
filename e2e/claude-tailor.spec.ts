import { test, expect } from '@playwright/test'
import { parseChooseReply, parseRewriteReply, acceptRewrite } from '../src/electron/services/tailor/claudeTailor.js'
import { parseTex } from '../src/electron/services/tailor/texProjects.js'

const original = parseTex(String.raw`% tags: python
\textbf{Alpha} -- Search tool
\begin{itemize}
\item Built retrieval in Python, 12 users
\end{itemize}
% end-projects
`).projects[0]

const withBullet = (bullet: string) => original.block.replace(/\\item .*/,String.raw`\item ${bullet}`)

test('parseChooseReply keeps valid unique ids in reply order, then the rest in ranked order', () => {
  expect(parseChooseReply('KEEP: 2, 9, 0, 2', [1, 0, 2])).toEqual([2, 0, 1])
  expect(parseChooseReply('KEEP: 3', [0, 3, 1, 2])).toEqual([3, 0, 1, 2])
  expect(() => parseChooseReply('Sure! Here', [0])).toThrow('Claude did not return a project list.')
  expect(() => parseChooseReply('KEEP: 9', [0])).toThrow('Claude did not return a project list.')
})

test('parseRewriteReply splits sections and ignores code fences', () => {
  const reply = '```latex\n=== PROJECT 0 ===\n% tags: a\n\\textbf{A}\n\n=== PROJECT 3 ===\n% tags: b\n\\textbf{B}\n```'
  const map = parseRewriteReply(reply)
  expect([...map.keys()]).toEqual([0, 3])
  expect(map.get(0)).toBe('% tags: a\n\\textbf{A}\n')
  expect(map.get(3)).toBe('% tags: b\n\\textbf{B}\n')
})

test('acceptRewrite allows a reworded bullet', () => {
  expect(acceptRewrite(original, withBullet('Made Python retrieval for 12 users'))).toBe(true)
})

test('acceptRewrite rejects invented content and broken structure', () => {
  expect(acceptRewrite(original, withBullet('Built retrieval in Python, 12 users, 40% faster'))).toBe(false)
  expect(acceptRewrite(original, withBullet('Built retrieval in Python on Kubernetes, 12 users'))).toBe(false)
  expect(acceptRewrite(original, withBullet('Built \\textit{retrieval in Python, 12 users'))).toBe(false)
  expect(acceptRewrite(original, original.block.replace('{Alpha}', '{Omega}'))).toBe(false)
  expect(acceptRewrite(original, original.block.replace('% tags: python', '% tags: java'))).toBe(false)
})

test('acceptRewrite rejects a new LaTeX command or a ^^ escape', () => {
  expect(acceptRewrite(original, withBullet(String.raw`Built retrieval in Python, 12 users \input{private/key}`))).toBe(false)
  const five = parseTex(String.raw`% tags: python
\textbf{Alpha} -- Search tool
\begin{itemize}
\item Built retrieval in Python, 5 users
\end{itemize}
% end-projects
`).projects[0]
  expect(acceptRewrite(five, five.block.replace('5 users', String.raw`5 users ^^5cinput{private/key}`))).toBe(false)
})

test('acceptRewrite allows a rewrite that reuses only the original commands', () => {
  const jake = parseTex(String.raw`% tags: python
\resumeProjectHeading{\textbf{Alpha} $|$ \emph{Search tool}}{2024}
\resumeItemListStart
\resumeItem{Built retrieval in \textbf{Python} for 12 users}
\resumeItemListEnd
% end-projects
`).projects[0]
  const reworded = jake.block.replace('Built retrieval in', 'Made a retrieval service in')
  expect(reworded).not.toBe(jake.block)
  expect(acceptRewrite(jake, reworded)).toBe(true)
  expect(acceptRewrite(jake, jake.block.replace(String.raw`\emph{Search tool}`, String.raw`\emph{Search engine}`))).toBe(false)
})

test('acceptRewrite rejects an added multi-word skill', () => {
  expect(acceptRewrite(original, withBullet('Built machine learning retrieval in Python, 12 users'))).toBe(false)
})

test('acceptRewrite rejects a changed heading', () => {
  const heading = parseTex(String.raw`% tags: python
\textbf{Alpha} -- \emph{Search tool}
\begin{itemize}
\item Built retrieval in Python, 12 users
\end{itemize}
% end-projects
`).projects[0]
  expect(acceptRewrite(heading, heading.block.replace(String.raw`\emph{Search tool}`, String.raw`\emph{Search engine}`))).toBe(false)
})
