import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { IconLock } from '../components/Icons';
import { Select } from '../components/Select';
import './profile.css';

type TextKey = Exclude<keyof Profile, 'workAuthorized' | 'needsSponsorship'>;

const TEXT_FIELDS: { key: TextKey; label: string; placeholder: string; type?: string }[] = [
  { key: 'firstName', label: 'First name', placeholder: '' },
  { key: 'lastName', label: 'Last name', placeholder: '' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com', type: 'email' },
  { key: 'phone', label: 'Phone', placeholder: '0400 000 000', type: 'tel' },
  { key: 'location', label: 'Location', placeholder: 'Perth, WA' },
  { key: 'salary', label: 'Salary expectation', placeholder: '$120,000' },
  { key: 'linkedin', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/…', type: 'url' },
  { key: 'github', label: 'GitHub URL', placeholder: 'https://github.com/…', type: 'url' },
  { key: 'website', label: 'Website or portfolio', placeholder: 'https://', type: 'url' },
];

/** Unanswered is a real answer here: a question left blank is one the form leaves to you. */
const YES_NO: { value: YesNo; label: string }[] = [
  { value: '', label: 'Leave for me' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/**
 * What the Autofill button types into application forms.
 *
 * Plain rules, no AI: a field is filled only when its label or autocomplete
 * hint says what it is. Anything else — essays, demographic questions, boxes
 * that were already filled in — is left alone. Nothing here leaves the device.
 */
export function ProfileScreen() {
  const [saved, setSaved] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [resume, setResume] = useState<ResumeMeta | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [profile, meta] = await Promise.all([window.electron.getProfile(), window.electron.getResume()]);
      setSaved(profile);
      setDraft(profile);
      setResume(meta);
    })();
  }, []);

  if (!draft || !saved) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const stored = await window.electron.saveProfile(draft);
    setSaved(stored);
    setDraft(stored);
    setBusy(false);
  }

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">Profile</h1>
          <p className="t-body t-secondary">What the Autofill button types into application forms</p>
        </div>
      </header>

      <div className="screen__body">
        <section className="card">
          <h2 className="t-body scan__title">About you</h2>
          <p className="t-caption t-muted profile__copy">
            Anything left empty is skipped. Open a job from the Inbox and press Autofill: it opens
            the job, presses Apply (LinkedIn Easy Apply or the company's own site), and fills what
            it recognises. If it stops on a question it cannot answer, answer it and press Autofill
            again. It never presses Submit.
          </p>

          <div className="profile__grid">
            {TEXT_FIELDS.map(({ key, label, placeholder, type }) => (
              <label key={key} className="field">
                <span className="t-overline">{label}</span>
                <input
                  className="input"
                  type={type ?? 'text'}
                  value={draft[key]}
                  placeholder={placeholder}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="t-body scan__title">Common questions</h2>
          <p className="t-caption t-muted profile__copy">
            Answered only where a form asks one of these as a plain Yes/No dropdown.
          </p>

          <div className="profile__grid">
            <div className="field">
              <span className="t-overline">Legally authorised to work</span>
              <Select
                value={draft.workAuthorized}
                options={YES_NO}
                label="Legally authorised to work"
                onChange={(value) => setDraft({ ...draft, workAuthorized: value })}
              />
            </div>
            <div className="field">
              <span className="t-overline">Will need visa sponsorship</span>
              <Select
                value={draft.needsSponsorship}
                options={YES_NO}
                label="Will need visa sponsorship"
                onChange={(value) => setDraft({ ...draft, needsSponsorship: value })}
              />
            </div>
          </div>

          <p className="t-caption t-muted profile__copy">
            {resume
              ? `${resume.filename} is attached to upload boxes labelled Resume or CV.`
              : 'No resume uploaded, so upload boxes are skipped. Add one on the Insights tab.'}
          </p>

          <p className="t-caption t-muted profile__copy settings__privacy">
            <IconLock size={13} /> Stored on this device only.
          </p>

          <div className="profile__actions">
            <Button variant="primary" disabled={!dirty || busy} onClick={save}>Save profile</Button>
            {!dirty && <span className="t-caption t-muted">Saved</span>}
          </div>
        </section>
      </div>
    </>
  );
}
