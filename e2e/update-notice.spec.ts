import { test, expect } from '@playwright/test';
import { hasUpdateNotice } from '../src/ui/components/UpdateBanner.js';
import { validateVersion, ValidationError } from '../src/electron/ipc/validate.js';

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  currentVersion: '0.1.0',
  latestVersion: '0.2.0',
  releaseUrl: 'https://github.com/Marlve/jobcheats/releases',
  releaseNotes: '',
  state: 'available',
  checkedAt: new Date().toISOString(),
  error: null,
  autoCheck: true,
  dismissedVersion: null,
  ...over,
});

test('a newer version raises the notice', () => {
  expect(hasUpdateNotice(status())).toBe(true);
});

test('nothing is shown before a check has run, or when up to date', () => {
  expect(hasUpdateNotice(null)).toBe(false);
  expect(hasUpdateNotice(status({ state: 'unknown', latestVersion: null }))).toBe(false);
  expect(hasUpdateNotice(status({ state: 'current' }))).toBe(false);
});

test('a failed check is not an update notice', () => {
  // The banner is for new versions. A check that did not go through belongs in
  // Settings, where someone went looking for it.
  expect(hasUpdateNotice(status({ state: 'failed', error: 'Could not reach GitHub.' }))).toBe(false);
});

test('dismissing silences that release only', () => {
  expect(hasUpdateNotice(status({ dismissedVersion: '0.2.0' }))).toBe(false);
  // The next release is a different string, so the notice comes back.
  expect(hasUpdateNotice(status({ latestVersion: '0.3.0', dismissedVersion: '0.2.0' }))).toBe(true);
});

test('only a comparable version can be stored as dismissed', () => {
  expect(validateVersion('0.2.0')).toBe('0.2.0');
  expect(validateVersion(' v0.2.0 ')).toBe('v0.2.0');
  // A dismissal of something unreadable would sit in the table silencing nothing.
  expect(() => validateVersion('nightly')).toThrow(ValidationError);
  expect(() => validateVersion('')).toThrow(ValidationError);
  expect(() => validateVersion(null)).toThrow(ValidationError);
  expect(() => validateVersion(42)).toThrow(ValidationError);
});
