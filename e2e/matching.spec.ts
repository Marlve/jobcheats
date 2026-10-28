import { test, expect } from '@playwright/test';
import { scoreJob, keywordPattern, requiredSkills } from '../src/electron/services/matching.js';
import { canonicalSkill } from '../src/electron/services/keywordService.js';
import { SKILLS, SKILL_ALIASES } from '../src/electron/services/data/skills.js';

/** Test helper — the real rows come from the database. */
function keyword(word: string, weight = 3, enabled = true): ResumeKeyword {
  return { id: 0, keyword: word, weight, weightManual: false, source: 'auto', enabled };
}

const job = {
  title: 'Software Engineer Intern',
  aboutText: 'We use TypeScript and PostgreSQL. Experience with Docker is a plus.',
};

test('scores 100 when the resume covers everything the job asks for', () => {
  const result = scoreJob(job, [keyword('typescript'), keyword('postgresql'), keyword('docker')]);

  expect(result.score).toBe(100);
  expect(result.missingSkills).toEqual([]);
});

test('scores 0 when the resume covers none of the asks', () => {
  const result = scoreJob(job, [keyword('kubernetes'), keyword('rust')]);

  expect(result.score).toBe(0);
  expect(result.matchedKeywords).toEqual([]);
  expect(result.missingSkills.sort()).toEqual(['docker', 'postgresql', 'typescript']);
});

test('extra keywords never lower a score', () => {
  // The bug this guards: scoring coverage of the resume rather than of the job
  // meant every keyword you added shrank every score. Here the three asks are
  // covered either way, so a broad resume ties with an exactly-matched one.
  const exact = scoreJob(job, [keyword('typescript'), keyword('postgresql'), keyword('docker')]);
  const broad = scoreJob(job, [
    keyword('typescript'), keyword('postgresql'), keyword('docker'),
    keyword('rust'), keyword('kubernetes'), keyword('terraform'), keyword('graphql'),
    keyword('kafka'), keyword('redis'), keyword('ansible'), keyword('jenkins'),
  ]);

  expect(broad.score).toBe(exact.score);
  expect(broad.score).toBe(100);
});

test('unscorable jobs come back null rather than zero', () => {
  // No enabled keywords at all.
  expect(scoreJob(job, []).score).toBeNull();
  expect(scoreJob(job, [keyword('typescript', 1, false)]).score).toBeNull();

  // A posting that asks for nothing recognisable. Zero would claim the resume
  // is a bad fit; the truth is there is nothing here to be a fit for.
  const vague = { title: 'Team Member', aboutText: 'Join our friendly team today.' };
  expect(scoreJob(vague, [keyword('typescript')]).score).toBeNull();
});

test('coverage is weighted by how often the job repeats an ask', () => {
  // 'typescript' three times, 'rust' once → covering typescript is 3 of 4.
  const repeated = {
    title: 'Engineer',
    aboutText: 'TypeScript everywhere. We write TypeScript. Did we say TypeScript? Some Rust too.',
  };
  const result = scoreJob(repeated, [keyword('typescript')]);

  expect(result.matchedKeywords).toEqual(['typescript']);
  expect(result.missingSkills).toEqual(['rust']);
  expect(result.score).toBe(75);
});

test('title hits add a bonus', () => {
  // 'docker' is one of three asks, and 'rust' in the title makes the role about
  // it — 33% coverage would undersell a Docker resume against a Docker job.
  const dockerRole = {
    title: 'Docker Platform Engineer',
    aboutText: 'Docker, Kubernetes and Terraform.',
  };

  // Asks weigh 'docker' 2 (title and body), 'kubernetes' 1, 'terraform' 1.
  const withTitleHit = scoreJob(dockerRole, [keyword('docker')]);
  expect(withTitleHit.titleHits).toEqual(['docker']);
  expect(withTitleHit.score).toBe(55); // 2 of 4 asks + 5 title bonus

  const noTitleHit = scoreJob(dockerRole, [keyword('terraform')]);
  expect(noTitleHit.titleHits).toEqual([]);
  expect(noTitleHit.score).toBe(25); // 1 of 4 asks, no bonus
});

test('the bonus cannot push a full cover past 100', () => {
  const result = scoreJob(
    { title: 'Docker Engineer', aboutText: 'Docker only.' },
    [keyword('docker')]
  );

  expect(result.score).toBe(100);
});

test('a keyword the dictionary does not know still counts when the job names it', () => {
  // Manual keywords are the escape hatch for a niche the dictionary misses.
  // If they could not become asks, adding one would be inert forever.
  // Title kept free of skills on purpose — "AI Engineer" would add an
  // 'artificial intelligence' ask and make this test about something else.
  const niche = {
    title: 'Platform Engineer',
    aboutText: 'Build agents with langchain on top of Python.',
  };

  expect(requiredSkills(niche.aboutText.toLowerCase(), ['langchain']).has('langchain')).toBe(true);
  expect(scoreJob(niche, [keyword('python'), keyword('langchain')]).score).toBe(100);
  expect(scoreJob(niche, [keyword('python')]).score).toBe(100); // langchain is not an ask
});

test('a phrase ask does not also count as its halves', () => {
  // 'spring' and 'spring boot' are both dictionary skills. Counting both would
  // charge one requirement twice, and mark down a resume saying "spring boot".
  const asks = requiredSkills('we run spring boot services');

  expect([...asks.keys()]).toEqual(['spring boot']);
});

test('the company name cannot manufacture a requirement', () => {
  // scoreJob never sees the company, so working at "Redis Labs" does not make
  // the posting ask for Redis.
  const asks = requiredSkills('a backend role writing python');

  expect(asks.has('redis')).toBe(false);
});

test('every alias points at a skill that exists', () => {
  // An alias whose canonical form is not in SKILLS is invisible: isKnownSkill
  // returns false for it and the ask silently vanishes.
  const orphans = [...SKILL_ALIASES.values()].filter(canonical => !SKILLS.has(canonical));

  expect(orphans).toEqual([]);
});

test('spelling variants fold together', () => {
  expect(canonicalSkill('reactjs')).toBe('react');
  expect(canonicalSkill('react.js')).toBe('react');
  expect(canonicalSkill('postgres')).toBe('postgresql');
  expect(canonicalSkill('k8s')).toBe('kubernetes');
  expect(canonicalSkill('go')).toBe('golang');
  expect(canonicalSkill('optimization')).toBe('optimisation');

  // Plurals are a rule, not a list — in both directions.
  expect(canonicalSkill('microservice')).toBe('microservices');
  expect(canonicalSkill('algorithm')).toBe('algorithms');
  expect(canonicalSkill('transformer')).toBe('transformers');

  // And the rule must not chew up skills that merely end in 's'.
  expect(canonicalSkill('sass')).toBe('sass');
  expect(canonicalSkill('rails')).toBe('rails');
  expect(canonicalSkill('aws')).toBe('aws');
  expect(canonicalSkill('devops')).toBe('devops');

  // A term no dictionary knows survives untouched, or hand-added keywords for
  // niche tools would stop matching.
  expect(canonicalSkill('langchain')).toBe('langchain');
});

test('an alias in the job description covers the plain spelling, and vice versa', () => {
  const adUsesAlias = {
    title: 'Engineer',
    aboutText: 'You will write ReactJS against a Postgres database, deployed on K8s.',
  };

  const plainResume = scoreJob(adUsesAlias, [
    keyword('react'), keyword('postgresql'), keyword('kubernetes'),
  ]);
  expect(plainResume.score).toBe(100);
  expect(plainResume.missingSkills).toEqual([]);

  // The reverse: the ad is plain, the resume is the one using variants. Matches
  // report back in your own wording, not the canonical form.
  const adIsPlain = {
    title: 'Engineer',
    aboutText: 'You will write React against a PostgreSQL database, deployed on Kubernetes.',
  };
  const aliasResume = scoreJob(adIsPlain, [
    keyword('reactjs'), keyword('postgres'), keyword('k8s'),
  ]);
  expect(aliasResume.score).toBe(100);
  expect(aliasResume.matchedKeywords.sort()).toEqual(['k8s', 'postgres', 'reactjs']);
});

test('two spellings in one ad are one ask, not two', () => {
  // The bug this guards: 'react' and 'reactjs' counted as separate skills, so
  // an ad using both charged a React resume for a React it could not have.
  const asks = requiredSkills('react work. more reactjs. some react.js too.');

  expect([...asks.keys()]).toEqual(['react']);
  expect(asks.get('react')).toBe(3); // counts merge before the weight cap
});

test('the title bonus survives aliasing', () => {
  const result = scoreJob(
    { title: 'ReactJS Developer', aboutText: 'React and TypeScript.' },
    [keyword('react')]
  );

  expect(result.titleHits).toEqual(['react']);
});

test('matches whole terms only', () => {
  // The bug this guards: substring matching makes "r" match "React" and every
  // score becomes meaningless.
  expect(keywordPattern('r').test('we use react daily')).toBe(false);
  expect(keywordPattern('react').test('reactjs developer')).toBe(false);
  expect(keywordPattern('react').test('a react developer')).toBe(true);
});

test('matches keywords containing punctuation', () => {
  // \b would fail here — there is no word boundary after '+' or '#'.
  expect(keywordPattern('c++').test('strong c++ background')).toBe(true);
  expect(keywordPattern('c#').test('c# and .net')).toBe(true);
  expect(keywordPattern('node.js').test('node.js services')).toBe(true);
  expect(keywordPattern('ci/cd').test('owns ci/cd pipelines')).toBe(true);
});

test('multi-word keywords match as a phrase', () => {
  const result = scoreJob(
    { title: 'ML Engineer', aboutText: 'Deep machine learning work.' },
    [keyword('machine learning')]
  );

  expect(result.matchedKeywords).toEqual(['machine learning']);
});

test('matching is case insensitive', () => {
  expect(scoreJob(job, [keyword('typescript')]).matchedKeywords).toEqual(['typescript']);
});

test('your priority scales each covered ask; missing asks count at normal priority', () => {
  // Python x3, Docker x1, Kubernetes x1; Kubernetes is missing.
  const ad = {
    title: 'Backend Engineer',
    aboutText: 'Python services. More Python. Python again. Some Docker and Kubernetes.',
  };
  const score = (python: number) => scoreJob(ad, [keyword('python', python), keyword('docker', 3)]).score;

  expect(score(5)).toBe(86); // (15 + 3) / (15 + 3 + 3)
  expect(score(3)).toBe(80); // (9 + 3) / (9 + 3 + 3), the same as without priorities
  expect(score(1)).toBe(67); // (3 + 3) / (3 + 3 + 3)
});

test('adding a keyword never lowers a score, whatever its priority', () => {
  const ad = { title: 'Engineer', aboutText: 'Python, Docker and Kubernetes.' };
  const before = scoreJob(ad, [keyword('python')]).score!;

  for (const priority of [1, 2, 3, 4, 5]) {
    const after = scoreJob(ad, [keyword('python'), keyword('kubernetes', priority)]).score!;
    expect(after).toBeGreaterThanOrEqual(before);
  }
});
