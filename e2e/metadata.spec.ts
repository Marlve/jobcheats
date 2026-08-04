import { test, expect } from '@playwright/test';
import {
  extractMetadata,
  parsePostedAt,
  parseSalary,
  parseWorkType,
} from '../src/electron/services/boards/metadata.js';

const NOW = new Date('2026-08-04T12:00:00.000Z');

test('relative dates become absolute timestamps', () => {
  expect(parsePostedAt('Posted 3 hours ago', NOW)).toBe('2026-08-04T09:00:00.000Z');
  expect(parsePostedAt('2 days ago', NOW)).toBe('2026-08-02T12:00:00.000Z');
  expect(parsePostedAt('30 minutes ago', NOW)).toBe('2026-08-04T11:30:00.000Z');
  expect(parsePostedAt('1 week ago', NOW)).toBe('2026-07-28T12:00:00.000Z');
});

test('handles the non-numeric phrasings', () => {
  expect(parsePostedAt('Just posted', NOW)).toBe(NOW.toISOString());
  expect(parsePostedAt('Yesterday', NOW)).toBe('2026-08-03T12:00:00.000Z');
});

test('returns null rather than guessing', () => {
  expect(parsePostedAt('', NOW)).toBeNull();
  expect(parsePostedAt('Software Engineer at Acme', NOW)).toBeNull();
});

test('parses salaries across currencies', () => {
  expect(parseSalary('RM 4,000 - RM 6,000 per month')).toBe('RM 4,000 - RM 6,000 per month');
  expect(parseSalary('$120,000/year')).toBe('$120,000/year');
  expect(parseSalary('Pay: A$85,000')).toBe('A$85,000');
});

test('ignores stray currency-looking numbers', () => {
  // A count or rating should never be stored as pay.
  expect(parseSalary('$5')).toBeNull();
  expect(parseSalary('No pay listed')).toBeNull();
});

test('detects work type, preferring hybrid over remote', () => {
  expect(parseWorkType('Remote position')).toBe('remote');
  expect(parseWorkType('Work from home')).toBe('remote');
  expect(parseWorkType('On-site in KL')).toBe('onsite');
  // Ads commonly say "hybrid remote"; hybrid is the more specific claim.
  expect(parseWorkType('Hybrid remote role')).toBe('hybrid');
  expect(parseWorkType('Software Engineer')).toBeNull();
});

test('card text wins over description text', () => {
  const metadata = extractMetadata(
    '2 hours ago · RM 5,000 per month · Remote',
    'Our company was founded 10 years ago. Previous role paid $200,000.'
  );

  expect(metadata.postedAt).not.toBeNull();
  expect(metadata.salary).toBe('RM 5,000 per month');
  expect(metadata.workType).toBe('remote');
});

test('falls back to description when the card says nothing', () => {
  const metadata = extractMetadata('Software Engineer', 'Posted 5 hours ago. Fully remote.');

  expect(metadata.postedAt).not.toBeNull();
  expect(metadata.workType).toBe('remote');
});
