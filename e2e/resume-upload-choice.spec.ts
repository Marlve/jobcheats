import { test, expect } from '@playwright/test'
import { decide, type FormField } from '../src/electron/services/apply/matcher.js'

const profile: Profile = {
  firstName: '', lastName: '', email: '', phone: '', location: '',
  linkedin: '', github: '', website: '', salary: '',
  workAuthorized: '', needsSponsorship: '',
}

const field = (over: Partial<FormField>): FormField => ({
  id: '1', tag: 'input', type: 'file', label: 'Resume', autocomplete: '', required: false, value: '', options: [], ...over,
})

test('an empty resume file field gets the upload', () => {
  expect(decide(field({}), profile, { uploadName: 'Jane-Resume.pdf' })).toEqual({ kind: 'file' })
})

test('a resume file field holding another file gets the upload instead', () => {
  expect(decide(field({ value: 'Old.pdf' }), profile, { uploadName: 'Jane-Resume.pdf' })).toEqual({ kind: 'file' })
})

test('a resume file field already holding the upload is left alone', () => {
  expect(decide(field({ value: 'Jane-Resume.pdf' }), profile, { uploadName: 'Jane-Resume.pdf' })).toBeNull()
})

test('without an upload name a file field already holding a file is left alone', () => {
  expect(decide(field({ value: 'Old.pdf' }), profile)).toBeNull()
})

test('without an upload name a saved resume keeps the file field empty', () => {
  expect(decide(field({}), profile, { savedResume: true })).toBeNull()
})

const choice = field({ tag: 'radio', type: 'radio', options: ['Jane_CV.pdf', 'Upload a resume'] })

test('a resume choice picks the saved file without an upload name', () => {
  expect(decide(choice, profile)).toEqual({ kind: 'option', option: 'Jane_CV.pdf' })
})

test('a resume choice picks the upload option with an upload name', () => {
  expect(decide(choice, profile, { uploadName: 'x.pdf' })).toEqual({ kind: 'option', option: 'Upload a resume' })
})

test('once the upload is attached in this window, the resume fields are left alone', () => {
  expect(decide(field({}), profile, { uploadName: 'Jane-Resume.pdf', resumeAttached: true })).toBeNull()
  expect(decide(choice, profile, { uploadName: 'Jane-Resume.pdf', resumeAttached: true })).toBeNull()
})
