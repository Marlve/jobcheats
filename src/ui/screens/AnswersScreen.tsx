import { AnswersCard } from '../components/AnswersCard';
import './profile.css';

/** Everything Autofill has remembered, as stored on this device — so it can be checked. */
export function AnswersScreen() {
  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">Saved answers</h1>
          <p className="t-body t-secondary">What Autofill has remembered from forms, exactly as it is stored on this device</p>
        </div>
      </header>

      <div className="screen__body">
        <AnswersCard />
      </div>
    </>
  );
}
