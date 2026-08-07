import { test, expect } from '@playwright/test';
import { compareVersions, isNewerVersion, isVersion } from '../src/electron/services/version.js';

test('orders releases by each part in turn', () => {
  expect(compareVersions('1.2.0', '1.1.9')).toBeGreaterThan(0);
  expect(compareVersions('1.2.0', '2.0.0')).toBeLessThan(0);
  expect(compareVersions('0.2.1', '0.2.0')).toBeGreaterThan(0);
  expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
});

test('parts are compared as numbers, not as text', () => {
  // The bug this guards: '10' < '9' as strings, so a tenth release would
  // never be offered to anyone on the ninth.
  expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
  expect(compareVersions('1.0.0', '0.100.0')).toBeGreaterThan(0);
});

test('the v on a release tag is not part of the version', () => {
  expect(compareVersions('v1.2.0', '1.2.0')).toBe(0);
  expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(true);
});

test('a missing part is a zero', () => {
  expect(compareVersions('1.2', '1.2.0')).toBe(0);
  expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0);
});

test('a pre-release is older than the version it leads up to', () => {
  expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0);
  expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
  // Someone running a beta should still be offered the real thing.
  expect(isNewerVersion('1.0.0', '1.0.0-beta.2')).toBe(true);
});

test('pre-releases order among themselves', () => {
  expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0);
  expect(compareVersions('1.0.0-beta', '1.0.0-beta.1')).toBeLessThan(0);
  expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
  // Numeric identifiers rank below alphanumeric ones.
  expect(compareVersions('1.0.0-2', '1.0.0-alpha')).toBeLessThan(0);
});

test('build metadata is not part of precedence', () => {
  expect(compareVersions('1.0.0+abc123', '1.0.0')).toBe(0);
  expect(compareVersions('1.0.0+build.2', '1.0.0+build.1')).toBe(0);
});

test('an unreadable version offers no update rather than guessing', () => {
  expect(isVersion('nightly')).toBe(false);
  expect(isVersion('')).toBe(false);
  expect(isVersion('1.2.x')).toBe(false);
  // Number('') is 0, so an empty part must be rejected on its text.
  expect(isVersion('.1.0')).toBe(false);
  expect(isVersion('1..0')).toBe(false);
  expect(isVersion('-1.0.0')).toBe(false);
  // Compares equal to everything, so nothing is ever offered against it.
  expect(compareVersions('nightly', '1.0.0')).toBe(0);
  expect(isNewerVersion('nightly', '1.0.0')).toBe(false);
  expect(isNewerVersion('2.0.0', 'nightly')).toBe(false);
});

test('the versions this app will actually publish', () => {
  expect(isVersion('0.1.0')).toBe(true);
  expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
  expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
  expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
});
