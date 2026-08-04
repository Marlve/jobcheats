import { test, expect } from '@playwright/test';
import {
  documentFrequencies,
  extractKeywords,
  termFrequencies,
  tokenize,
} from '../src/electron/services/keywordService.js';

const RESUME = `
  Derich Tan — Software Engineering Student
  Skilled in TypeScript, Python and SQL. Built React applications backed by
  PostgreSQL. Responsible for delivering projects and working with the team to
  provide excellent results across the organisation. Experience with Docker,
  machine learning and data analysis.
`;

test('tokenize keeps punctuation that carries meaning', () => {
  const tokens = tokenize('Strong C++, C# and Node.js with CI/CD experience.');

  expect(tokens).toContain('c++');
  expect(tokens).toContain('c#');
  expect(tokens).toContain('node.js');
  expect(tokens).toContain('ci/cd');
});

test('extraction keeps skills and drops boilerplate', () => {
  const keywords = extractKeywords(RESUME).map((k) => k.keyword);

  expect(keywords).toContain('typescript');
  expect(keywords).toContain('python');
  expect(keywords).toContain('react');

  // These are the words that dominate a raw frequency count and make the
  // keyword list useless.
  for (const filler of ['responsible', 'experience', 'team', 'projects', 'results', 'the']) {
    expect(keywords).not.toContain(filler);
  }
});

test('known multi-word skills survive as one keyword', () => {
  const keywords = extractKeywords(RESUME).map((k) => k.keyword);

  expect(keywords).toContain('machine learning');
});

test('dictionary skills are weighted above merely frequent words', () => {
  const keywords = extractKeywords(RESUME);
  const typescript = keywords.find((k) => k.keyword === 'typescript');

  expect(typescript?.weight).toBe(2);
});

test('single characters and bare numbers are excluded', () => {
  const keywords = extractKeywords('R r 12345 90210 python python python').map((k) => k.keyword);

  expect(keywords).not.toContain('r');
  expect(keywords).not.toContain('12345');
  expect(keywords).toContain('python');
});

test('extraction respects the limit', () => {
  expect(extractKeywords(RESUME, 3)).toHaveLength(3);
});

test('termFrequencies counts repeats', () => {
  const counts = termFrequencies('python python docker');

  expect(counts.get('python')).toBe(2);
  expect(counts.get('docker')).toBe(1);
});

test('documentFrequencies counts documents, not occurrences', () => {
  const counts = documentFrequencies(['python python python', 'python docker']);

  expect(counts.get('python')).toBe(2);
  expect(counts.get('docker')).toBe(1);
});
