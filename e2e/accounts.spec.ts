import { test, expect } from '@playwright/test';
import { isSeekSignInUrl, linkedInIdentity, seekName } from '../src/electron/services/accounts.js';

test('linkedInIdentity reads the name and profile link from the normalized /me reply', () => {
  const body = {
    data: { '*miniProfile': 'urn:li:fs_miniProfile:abc' },
    included: [
      { $type: 'com.linkedin.voyager.common.Me', plainId: 1 },
      {
        $type: 'com.linkedin.voyager.identity.shared.MiniProfile',
        firstName: 'Daven',
        lastName: 'Tan',
        publicIdentifier: 'davenjtan',
      },
    ],
  };
  expect(linkedInIdentity(body)).toEqual({ name: 'Daven Tan', detail: 'linkedin.com/in/davenjtan' });
});

test('linkedInIdentity reads a nested miniProfile and returns null without a name', () => {
  expect(linkedInIdentity({ miniProfile: { firstName: 'Jane', lastName: '', publicIdentifier: '' } }))
    .toEqual({ name: 'Jane', detail: undefined });
  expect(linkedInIdentity({ data: { plainId: 7 } })).toBeNull();
  expect(linkedInIdentity('not json')).toBeNull();
});

test('isSeekSignInUrl tells the login page from a signed-in page', () => {
  expect(isSeekSignInUrl('https://login.seek.com/login?state=x')).toBe(true);
  expect(isSeekSignInUrl('https://au.seek.com/oauth/login?returnUrl=%2F')).toBe(true);
  expect(isSeekSignInUrl('https://au.seek.com/profile/me')).toBe(false);
});

test('seekName keeps a heading that reads as a name and drops page titles', () => {
  expect(seekName('  Daven Japhis Tan ')).toBe('Daven Japhis Tan');
  expect(seekName('Profile')).toBeUndefined();
  expect(seekName('Your SEEK Profile')).toBeUndefined();
  expect(seekName('')).toBeUndefined();
  expect(seekName('x'.repeat(80))).toBeUndefined();
});
