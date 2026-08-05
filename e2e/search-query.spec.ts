import { test, expect } from '@playwright/test';
import { buildSearchQuery } from '../src/electron/services/boards/query.js';

function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return { keywords: ['software engineer'], location: [], ...overrides };
}

test('reads as a sentence, with the location said rather than filtered', () => {
  const query = buildSearchQuery(
    params({ jobType: 'internship', datePosted: '24h' }),
    'malaysia'
  );

  expect(query).toBe('software engineer internship posted in the past 24 hours in malaysia');
});

test('several keywords are alternatives in plain words', () => {
  // Not `"a" OR "b"` — boolean syntax is an instruction to a term matcher, and
  // a sentence parser reads it as punctuation.
  const query = buildSearchQuery(params({ keywords: ['react', 'typescript'] }), null);

  expect(query).toBe('react or typescript');
});

test('drops the clauses it has nothing to say about', () => {
  expect(buildSearchQuery(params(), null)).toBe('software engineer');
  expect(buildSearchQuery(params({ datePosted: 'week' }), null))
    .toBe('software engineer posted in the past week');
  expect(buildSearchQuery(params({ keywords: [] }), 'melbourne')).toBe('in melbourne');
});

test('ignores blank keywords rather than leaving gaps in the sentence', () => {
  const query = buildSearchQuery(params({ keywords: ['  react  ', '', '   '] }), 'sydney');

  expect(query).toBe('react in sydney');
});
