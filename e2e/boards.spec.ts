import { test, expect } from '@playwright/test';
import {
  BOARD_ENABLED_BY_DEFAULT,
  boardEnabledFromStored,
  configuredSources,
  isLastEnabledBoard,
} from '../src/electron/config.js';

test('every board in the union has been given a default', () => {
  // The Record type already forces this at compile time; the test is here so a
  // board added to BoardSource with a hasty `as any` still trips something.
  expect(configuredSources().sort()).toEqual(['japandev', 'linkedin', 'seek']);
});

test('Seek starts off until its scraper has been run for real', () => {
  expect(BOARD_ENABLED_BY_DEFAULT.linkedin).toBe(true);
  expect(BOARD_ENABLED_BY_DEFAULT.seek).toBe(false);
});

test('a board never toggled falls back to its default, not to off', () => {
  expect(boardEnabledFromStored('linkedin', null)).toBe(true);
  expect(boardEnabledFromStored('seek', null)).toBe(false);
});

test('a stored choice wins over the default in both directions', () => {
  expect(boardEnabledFromStored('seek', '1')).toBe(true);
  expect(boardEnabledFromStored('linkedin', '0')).toBe(false);
});

test('the last board left on cannot be turned off', () => {
  expect(isLastEnabledBoard('linkedin', ['linkedin'])).toBe(true);
  expect(isLastEnabledBoard('seek', ['seek'])).toBe(true);
});

test('turning one off is fine while another is still on', () => {
  expect(isLastEnabledBoard('linkedin', ['linkedin', 'seek'])).toBe(false);
  expect(isLastEnabledBoard('seek', ['linkedin', 'seek'])).toBe(false);
});

test('turning off a board that is already off is not the last one', () => {
  // linkedin is not in the enabled list, so this is a no-op rather than the
  // click that would empty the set.
  expect(isLastEnabledBoard('linkedin', ['seek'])).toBe(false);
});
