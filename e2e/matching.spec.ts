import { test, expect } from '@playwright/test';
import { scoreJob, keywordPattern } from '../src/electron/services/matching.js';

/** Test helper — the real rows come from the database. */
function keyword(word: string, weight = 1, enabled = true): ResumeKeyword {
  return { id: 0, keyword: word, weight, source: 'auto', enabled };
}

const job = {
  title: 'Software Engineer Intern',
  company: 'Acme',
  aboutText: 'We use TypeScript and PostgreSQL. Experience with Docker is a plus.',
};

test('scores 100 when every keyword matches', () => {
  const result = scoreJob(job, [keyword('typescript'), keyword('postgresql'), keyword('docker')]);

  expect(result.score).toBe(100);
  expect(result.missingKeywords).toEqual([]);
});

test('scores 0 when nothing matches', () => {
  const result = scoreJob(job, [keyword('kubernetes'), keyword('rust')]);

  expect(result.score).toBe(0);
  expect(result.matchedKeywords).toEqual([]);
  expect(result.missingKeywords).toHaveLength(2);
});

test('scores 0 when there are no enabled keywords', () => {
  // No keywords means matching is impossible; the caller stores NULL rather
  // than treating this as a genuine zero.
  expect(scoreJob(job, []).score).toBe(0);
  expect(scoreJob(job, [keyword('typescript', 1, false)]).score).toBe(0);
});

test('coverage is weighted', () => {
  // 'typescript' matches at weight 3, 'rust' misses at weight 1 → 75%.
  const result = scoreJob(job, [keyword('typescript', 3), keyword('rust', 1)]);

  expect(result.matchedKeywords).toEqual(['typescript']);
  expect(result.score).toBe(75);
});

test('title hits add a bonus', () => {
  const withTitleHit = scoreJob(job, [keyword('intern')]);
  expect(withTitleHit.titleHits).toEqual(['intern']);
  // 100% coverage is already the cap, so the bonus cannot push it past 100.
  expect(withTitleHit.score).toBe(100);

  const halfCovered = scoreJob(job, [keyword('intern'), keyword('rust')]);
  expect(halfCovered.score).toBe(55); // 50% coverage + 5 title bonus
});

test('matches whole terms only', () => {
  // The bug this guards: substring matching makes "r" match "React" and every
  // score becomes meaningless.
  expect(keywordPattern('r').test('we use react daily')).toBe(false);
  expect(keywordPattern('react').test('reactjs developer')).toBe(false);
  expect(keywordPattern('react').test('a react developer')).toBe(true);
});

test('matches keywords containing punctuation', () => {
  // \b would fail here — there is no word boundary after '+' or '#'.
  expect(keywordPattern('c++').test('strong c++ background')).toBe(true);
  expect(keywordPattern('c#').test('c# and .net')).toBe(true);
  expect(keywordPattern('node.js').test('node.js services')).toBe(true);
  expect(keywordPattern('ci/cd').test('owns ci/cd pipelines')).toBe(true);
});

test('multi-word keywords match as a phrase', () => {
  const result = scoreJob(
    { title: 'ML Engineer', company: 'Acme', aboutText: 'Deep machine learning work.' },
    [keyword('machine learning')]
  );

  expect(result.matchedKeywords).toEqual(['machine learning']);
});

test('matching is case insensitive', () => {
  expect(scoreJob(job, [keyword('typescript')]).matchedKeywords).toEqual(['typescript']);
});
