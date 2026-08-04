import { useEffect, useState } from 'react'
import './App.css'
function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  return (
    <div className="tag-input">
      <label>{label}</label>
      <div className="tag-input-field">
        {values.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button type="button" onClick={() => removeTag(tag)}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

// ---------- TEMPORARY: backend smoke test. Delete once the real UI lands. ----------
function TestPanel() {
  const [log, setLog] = useState<string[]>([]);
  const [rows, setRows] = useState<JobRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<ResumeMeta | null>(null);
  const [keywords, setKeywords] = useState<ResumeKeyword[]>([]);
  const [insights, setInsights] = useState<ResumeInsights | null>(null);

  const say = (line: string) => setLog((prev) => [line, ...prev].slice(0, 40));

  useEffect(() => {
    return window.electron.subscribeScrapeProgress((p) => {
      say(`${p.phase} · page ${p.page} · +${p.inserted} new / ${p.skipped} known / ${p.failed} failed${p.message ? ` · ${p.message}` : ''}`);
    });
  }, []);

  const testScrape = async () => {
    setBusy(true);
    say('--- starting test scrape ---');
    try {
      const result = await window.electron.scrapeLinkedIn({
        keywords: ['software engineer'],
        location: [],
        jobType: 'internship',
        datePosted: 'week',
        maxPages: 1,
        maxJobs: 5,
      });
      say(result.ok
        ? `DONE · inserted ${result.inserted} · skipped ${result.skipped} · failed ${result.failed}${result.cancelled ? ' · CANCELLED' : ''}`
        : `FAILED · ${result.error}`);
    } catch (err) {
      say(`THREW · ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const loadJobs = async () => {
    const [jobs, total] = await Promise.all([
      window.electron.listJobs({ limit: 10, sortBy: 'score' }),
      window.electron.countJobs(),
    ]);
    setRows(jobs);
    say(`loaded ${jobs.length} of ${total} stored jobs`);
  };

  const cancel = async () => {
    const stopped = await window.electron.cancelScrape();
    say(stopped ? 'cancel signalled' : 'nothing running to cancel');
  };

  const uploadResume = async () => {
    const filePath = await window.electron.pickResume();
    if (!filePath) return say('resume pick cancelled');

    say(`parsing ${filePath}…`);
    const result = await window.electron.uploadResume(filePath);

    if (!result.ok) return say(`RESUME FAILED [${result.reason}] · ${result.error}`);

    setResume(result.resume);
    setKeywords(result.keywords);
    say(`resume OK · ${result.resume.filename} · ${result.resume.textLength} chars · ${result.keywords.length} keywords`);
  };

  const loadResume = async () => {
    const [meta, words] = await Promise.all([
      window.electron.getResume(),
      window.electron.listKeywords(),
    ]);
    setResume(meta);
    setKeywords(words);
    say(meta ? `resume: ${meta.filename} (${meta.uploadedAt})` : 'no resume stored');
  };

  const loadInsights = async () => {
    const result = await window.electron.getInsights();
    setInsights(result);
    say(`compatibility ${result.headlineScore}% (${result.scoredJobs}/${result.totalJobs} scored${result.lowSample ? ', LOW SAMPLE' : ''})`);
  };

  const loadStats = async () => {
    const stats = await window.electron.getDbStats();
    say(`inbox ${stats.inboxCount} · archive ${stats.archiveCount} · next expiry ${stats.nextExpiryAt ?? 'n/a'} · ${(stats.databaseBytes / 1024).toFixed(0)} KB`);
  };

  const prune = async () => {
    const deleted = await window.electron.pruneOldJobs();
    say(`pruned ${deleted} expired job(s)`);
  };

  return (
    <section style={{ padding: 12, fontFamily: 'monospace', fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={testScrape} disabled={busy}>
          {busy ? 'Scraping…' : 'Test scrape (1 page, 5 jobs)'}
        </button>
        <button onClick={cancel} disabled={!busy}>Cancel</button>
        <button onClick={loadJobs}>Load jobs</button>
        <button onClick={uploadResume}>Upload resume</button>
        <button onClick={loadResume}>Load resume</button>
        <button onClick={loadInsights}>Insights</button>
        <button onClick={loadStats}>DB stats</button>
        <button onClick={prune}>Prune</button>
      </div>

      <pre style={{ maxHeight: 160, overflowY: 'auto', background: '#1113', padding: 8, margin: 0 }}>
        {log.join('\n') || 'no activity yet'}
      </pre>

      {resume && (
        <p style={{ margin: '8px 0' }}>
          {resume.filename} · {keywords.filter((k) => k.enabled).length}/{keywords.length} keywords active
        </p>
      )}

      {keywords.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {keywords.map((keyword) => (
            <button
              key={keyword.id}
              title={`${keyword.source}, weight ${keyword.weight}`}
              onClick={async () => {
                await window.electron.setKeywordEnabled(keyword.id, !keyword.enabled);
                setKeywords(await window.electron.listKeywords());
              }}
              style={{ opacity: keyword.enabled ? 1 : 0.4 }}
            >
              {keyword.keyword}
            </button>
          ))}
        </div>
      )}

      {insights && (
        <pre style={{ background: '#1113', padding: 8, margin: '0 0 8px' }}>
          {insights.distribution.map((b) => `${b.label.padEnd(14)} ${b.count}`).join('\n')}
          {'\nstrongest: '}{insights.strongestKeywords.map((k) => `${k.keyword}(${k.hits})`).join(', ') || 'none'}
          {'\ndead:      '}{insights.deadKeywords.map((k) => k.keyword).join(', ') || 'none'}
          {'\ngaps:      '}{insights.skillGaps.map((k) => `${k.keyword}(${k.hits})`).join(', ') || 'none'}
        </pre>
      )}

      <ul style={{ maxHeight: 200, overflowY: 'auto', paddingLeft: 16 }}>
        {rows.map((job) => (
          <li key={job.id}>
            [{job.matchScore ?? '—'}] {job.title} — {job.company} — {job.postedAt ?? 'no date'}
            {job.matchedKeywords.length > 0 && ` · ${job.matchedKeywords.join(', ')}`}
          </li>
        ))}
      </ul>
    </section>
  );
}

function App() {
  const playwright = {
    scrapeLinkedIn: async (params: SearchParams) => await window.electron.scrapeLinkedIn(params),
  };
  const db = {
    listJobs: async () => await window.electron.listJobs(),
  };

  const [keywords, setKeywords] = useState<string[]>([]);
  const [location, setLocation] = useState<string[]>([]);
  const [datePosted, setDatePosted] = useState<'24h' | 'week' | 'month' | ''>('');
  const [jobType, setJobType] = useState<'internship' | 'full-time' | 'part-time'>('full-time');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.electron.subscribeStatistics((stats) => console.log(stats));
  }, []);

  const handleSearch = async () => {
    const params: SearchParams = {
      keywords,
      location,
      jobType,
      ...(datePosted ? { datePosted } : {}),
    };
    setLoading(true);
    try {
      const results = await playwright.scrapeLinkedIn(params);
      console.log(results);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section id="center">
        <div className="search-bar">
          <TagInput
            label="Keywords"
            values={keywords}
            onChange={setKeywords}
            placeholder="e.g. software engineer, press Enter"
          />
          <TagInput
            label="Location"
            values={location}
            onChange={setLocation}
            placeholder="e.g. Kuala Lumpur, press Enter"
          />

          <div className="field">
            <label>Date posted</label>
            <select
              value={datePosted}
              onChange={(e) => setDatePosted(e.target.value as '24h' | 'week' | 'month' | '')}
            >
              <option value="">Any time</option>
              <option value="24h">Past 24 hours</option>
              <option value="week">Past week</option>
              <option value="month">Past month</option>
            </select>
          </div>

          <div className="field">
            <label>Job type</label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value as SearchParams['jobType'])}
            >
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="internship">Internship</option>
            </select>
          </div>

          <button onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <button onClick={db.listJobs}>Check Database</button>
      </section>

      <TestPanel />

      <div className="ticks"></div>
    </>
  );
}

export default App;
