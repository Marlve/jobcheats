import { test, expect } from '@playwright/test'
import { parseTex } from '../src/electron/services/tailor/texProjects.js'
import { rankProjects, fitProjects } from '../src/electron/services/tailor/rankProjects.js'

function projectsOf(...blocks: string[]) {
  return parseTex(blocks.join('') + '% end-projects\n').projects
}

test('rankProjects puts tag matches first, then text matches, then the rest', () => {
  const projects = projectsOf(
    String.raw`% tags: ai, rag
\textbf{A} -- Search tool
`,
    String.raw`% tags:
\textbf{B} -- Wrote a Kotlin parser
`,
    String.raw`% tags: android, kotlin
\textbf{C} -- Phone app
`
  )
  const job = { title: 'Android Developer', aboutText: 'Kotlin, Jetpack Compose' }
  expect(rankProjects(job, projects)).toEqual([2, 1, 0])
})

test('rankProjects keeps master order when the job names no known skill', () => {
  const projects = projectsOf(
    String.raw`% tags: ai
\textbf{A} -- x
`,
    String.raw`% tags: rag
\textbf{B} -- y
`,
    String.raw`% tags:
\textbf{C} -- z
`
  )
  expect(rankProjects({ title: 'Office Manager', aboutText: 'Friendly team' }, projects)).toEqual([0, 1, 2])
})

test('rankProjects scores a tag above the same word in body text', () => {
  const projects = projectsOf(
    String.raw`% tags:
\textbf{A} -- uses python daily
`,
    String.raw`% tags: python
\textbf{B} -- scripts
`
  )
  expect(rankProjects({ title: 'Python Engineer', aboutText: '' }, projects)).toEqual([1, 0])
})

const pagesOf = (keep: number[]) => Promise.resolve(Math.ceil((keep.length + 2) / 3))

test('fitProjects keeps the longest prefix within the page limit', async () => {
  expect(await fitProjects([5, 3, 1, 0], pagesOf, 2)).toEqual([5, 3, 1, 0])
  expect(await fitProjects([5, 3, 1, 0], pagesOf, 1)).toEqual([5])
  expect(await fitProjects([5, 3, 1, 0], () => Promise.resolve(3), 2)).toEqual([])
})

test('fitProjects makes few pagesFor calls', async () => {
  const ranked = Array.from({ length: 14 }, (_, i) => i)
  let calls = 0
  const kept = await fitProjects(ranked, (keep) => { calls++; return pagesOf(keep) }, 3)
  expect(kept).toEqual(ranked.slice(0, 7))
  expect(calls).toBeLessThanOrEqual(Math.ceil(Math.log2(15)) + 1)
})

test('rankProjects weighs each ask by your keyword priority', () => {
  const projects = projectsOf(
    String.raw`% tags: python
\textbf{A} -- Data tool
`,
    String.raw`% tags: react
\textbf{B} -- Web app
`
  )
  const job = { title: 'Engineer', aboutText: 'Python and React.' }
  expect(rankProjects(job, projects)).toEqual([0, 1])
  expect(rankProjects(job, projects, new Map([['react', 5]]))).toEqual([1, 0])
  expect(rankProjects(job, projects, new Map([['python', 1]]))).toEqual([1, 0])
})
