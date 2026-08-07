import { test, expect } from '@playwright/test';
import { seekAdapter } from '../src/electron/services/boards/seek.js';

const BASE: SearchParams = {
  keywords: ['software engineer'],
  location: ['Melbourne'],
  jobType: 'full-time',
};

test('builds Seek\'s own path shape rather than a query string', () => {
  expect(seekAdapter.buildSearchUrls(BASE)).toEqual([
    'https://www.seek.com.au/software-engineer-jobs/in-melbourne/full-time',
  ]);
});

test('one URL per location', () => {
  expect(seekAdapter.buildSearchUrls({ ...BASE, location: ['Melbourne', 'Sydney'] })).toEqual([
    'https://www.seek.com.au/software-engineer-jobs/in-melbourne/full-time',
    'https://www.seek.com.au/software-engineer-jobs/in-sydney/full-time',
  ]);
});

test('a search with no location covers the whole country', () => {
  expect(seekAdapter.buildSearchUrls({ ...BASE, location: [] })).toEqual([
    'https://www.seek.com.au/software-engineer-jobs/full-time',
  ]);
});

test('slugs drop the punctuation Seek has no place for', () => {
  expect(seekAdapter.buildSearchUrls({
    ...BASE,
    keywords: ['C++ / .NET  developer'],
    location: ['Melbourne VIC 3000'],
  })).toEqual([
    'https://www.seek.com.au/c-net-developer-jobs/in-melbourne-vic-3000/full-time',
  ]);
});

test('internship falls into contract/temp, the closest bucket Seek has', () => {
  expect(seekAdapter.buildSearchUrls({ ...BASE, jobType: 'internship' })).toEqual([
    'https://www.seek.com.au/software-engineer-jobs/in-melbourne/contract-temp',
  ]);
});

test('date filter rides along as a day count', () => {
  expect(seekAdapter.buildSearchUrls({ ...BASE, datePosted: '24h' })[0])
    .toBe('https://www.seek.com.au/software-engineer-jobs/in-melbourne/full-time?daterange=1');
  expect(seekAdapter.buildSearchUrls({ ...BASE, datePosted: 'month' })[0])
    .toBe('https://www.seek.com.au/software-engineer-jobs/in-melbourne/full-time?daterange=31');
});
