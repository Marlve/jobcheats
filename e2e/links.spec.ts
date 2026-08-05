import { test, expect } from '@playwright/test';
import { jobIdFromValue, jobIdsFrom } from '../src/electron/services/boards/links.js';

test('reads a posting id out of every shape LinkedIn gives it', () => {
  // A link to the posting.
  expect(jobIdFromValue('/jobs/view/4448816646/')).toBe('4448816646');
  expect(jobIdFromValue('https://www.linkedin.com/jobs/view/1234567890/?trk=similar-jobs'))
    .toBe('1234567890');

  // A component key, as the current search page's cards carry it.
  expect(jobIdFromValue('job-card-component-ref-4426499513')).toBe('4426499513');

  // A bare id, as data-job-id and the URL's currentJobId give it.
  expect(jobIdFromValue('4426499513')).toBe('4426499513');
});

test('ignores values that identify no posting', () => {
  expect(jobIdFromValue('/jobs/search-results/?keywords=react')).toBeNull();
  expect(jobIdFromValue('/company/acme/')).toBeNull();
  expect(jobIdFromValue('/jobs/view/no-id-here/')).toBeNull();
  expect(jobIdFromValue('/jobs/collections/recommended/')).toBeNull();
  expect(jobIdFromValue('')).toBeNull();
});

test('one posting found several ways takes one slot', () => {
  // The bug this guards: a single card yields its id from the title link, the
  // logo link and its own attribute, so a limit of 3 against a page of 3 jobs
  // would otherwise come back holding only the first one.
  const ids = jobIdsFrom([
    '/jobs/view/111/', '/jobs/view/111/', '111',
    'job-card-component-ref-222', '/jobs/view/222/',
    '/jobs/view/333/',
  ], 3);

  expect(ids).toEqual(['111', '222', '333']);
});

test('respects the limit', () => {
  const values = ['/jobs/view/1/', '/jobs/view/2/', '/jobs/view/3/'];

  expect(jobIdsFrom(values, 2)).toEqual(['1', '2']);
  // Nothing left to fill means no work should be started at all.
  expect(jobIdsFrom(values, 0)).toEqual([]);
});
