import { useState } from 'react';
import { Button } from './Button';
import { IconCross, IconDocument } from './Icons';
import './bulk.css';

/** Acts on the jobs ticked in the inbox. Rejecting many at once takes a second press. */
export function BulkBar({
  selected,
  shown,
  appliable,
  onSelectAll,
  onClear,
  onReject,
  onApply,
}: {
  selected: number;
  shown: number;
  /** How many of the selected jobs have a link to apply through. */
  appliable: number;
  onSelectAll: () => void;
  onClear: () => void;
  onReject: () => void;
  onApply: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="card bulk" role="toolbar" aria-label="Selected jobs">
      <span className="bulk__count t-label">
        {selected === 0 ? 'Tick jobs, or shift-click to tick a range' : `${selected} selected`}
      </span>

      <Button size="sm" variant="ghost" onClick={onSelectAll} disabled={selected === shown}>
        Select all {shown} shown
      </Button>

      {selected > 0 && (
        <>
          <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>

          <span className="bulk__spacer" />

          <Button
            size="sm"
            variant={confirming ? 'danger-solid' : 'secondary'}
            onClick={() => {
              if (!confirming) return setConfirming(true);
              setConfirming(false);
              onReject();
            }}
            onBlur={() => setConfirming(false)}
          >
            <IconCross size={14} />
            {confirming ? `Hide ${selected} for good?` : `Not for me (${selected})`}
          </Button>

          <Button size="sm" variant="primary" disabled={appliable === 0} onClick={onApply}>
            <IconDocument size={14} />
            Apply one by one ({appliable})
          </Button>
        </>
      )}
    </div>
  );
}
