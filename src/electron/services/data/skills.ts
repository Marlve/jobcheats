/**
 * Curated skill terms. A term appearing here is boosted heavily during keyword
 * extraction, which is what keeps "typescript" in the list and generic resume
 * filler out of it.
 *
 * Multi-word entries are matched as bigrams, so "machine learning" survives as
 * one keyword instead of splitting into two useless halves.
 */
export const SKILLS = new Set<string>([
  // languages
  'javascript', 'typescript', 'python', 'java', 'kotlin', 'swift', 'golang', 'go', 'rust',
  'ruby', 'php', 'perl', 'scala', 'haskell', 'elixir', 'erlang', 'clojure', 'dart', 'lua',
  'matlab', 'julia', 'fortran', 'cobol', 'assembly', 'bash', 'powershell', 'shell',
  'objective-c', 'visual basic', 'delphi', 'groovy', 'solidity', 'c#', 'c++',

  // web
  'html', 'css', 'sass', 'scss', 'tailwind', 'bootstrap', 'react', 'reactjs', 'angular',
  'vue', 'vuejs', 'svelte', 'nextjs', 'nuxt', 'remix', 'astro', 'jquery', 'redux', 'zustand',
  'webpack', 'vite', 'rollup', 'babel', 'eslint', 'prettier', 'storybook', 'figma',
  'responsive design', 'web accessibility', 'progressive web', 'single page',

  // backend and infra
  'nodejs', 'node', 'express', 'nestjs', 'fastify', 'django', 'flask', 'fastapi', 'rails',
  'laravel', 'spring', 'spring boot', 'dotnet', 'aspnet', 'graphql', 'rest', 'restful',
  'grpc', 'websocket', 'microservices', 'serverless', 'api design', 'message queue',
  'rabbitmq', 'kafka', 'redis', 'nginx', 'apache', 'linux', 'unix', 'windows server',

  // cloud and devops
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform', 'ansible',
  'jenkins', 'circleci', 'github actions', 'gitlab', 'devops', 'ci/cd', 'cloudformation',
  'lambda', 'ec2', 's3', 'cloudflare', 'vercel', 'netlify', 'heroku', 'prometheus',
  'grafana', 'datadog', 'observability', 'site reliability',

  // data
  'sql', 'mysql', 'postgresql', 'postgres', 'sqlite', 'mongodb', 'dynamodb', 'cassandra',
  'elasticsearch', 'snowflake', 'databricks', 'bigquery', 'redshift', 'airflow', 'dbt',
  'spark', 'hadoop', 'etl', 'data engineering', 'data analysis', 'data analytics',
  'data science', 'data modelling', 'data modeling', 'data visualisation',
  'data visualization', 'data warehouse', 'business intelligence', 'power bi', 'tableau',
  'looker', 'pandas', 'numpy', 'scipy', 'excel', 'vba',

  // ai / ml
  'machine learning', 'deep learning', 'neural network', 'artificial intelligence',
  'natural language', 'computer vision', 'tensorflow', 'pytorch', 'keras', 'scikit-learn',
  'sklearn', 'huggingface', 'transformers', 'llm', 'nlp', 'reinforcement learning',
  'feature engineering', 'model training', 'mlops', 'prompt engineering', 'rag',

  // mobile
  'android', 'ios', 'react native', 'flutter', 'xamarin', 'ionic', 'mobile development',
  'swiftui', 'jetpack compose',

  // testing and quality
  'unit testing', 'integration testing', 'test automation', 'jest', 'vitest', 'mocha',
  'cypress', 'playwright', 'selenium', 'junit', 'pytest', 'tdd', 'bdd', 'code review',
  'quality assurance', 'debugging', 'performance testing', 'load testing',

  // security
  'cybersecurity', 'penetration testing', 'cryptography', 'oauth', 'authentication',
  'authorization', 'encryption', 'vulnerability', 'firewall', 'siem', 'incident response',
  'threat modelling', 'owasp', 'compliance', 'gdpr',

  // practice and tooling
  'git', 'github', 'version control', 'agile', 'scrum', 'kanban', 'jira', 'confluence',
  'design patterns', 'object oriented', 'functional programming', 'algorithms',
  'data structures', 'system design', 'distributed systems', 'concurrency', 'optimisation',
  'optimization', 'refactoring', 'documentation', 'technical writing',

  // business, finance, ops
  'accounting', 'bookkeeping', 'financial modelling', 'financial modeling', 'forecasting',
  'budgeting', 'auditing', 'taxation', 'payroll', 'invoicing', 'reconciliation',
  'financial analysis', 'investment', 'valuation', 'risk management', 'procurement',
  'supply chain', 'logistics', 'inventory', 'operations', 'lean', 'six sigma',
  'process improvement', 'stakeholder management', 'project management', 'product management',
  'roadmap', 'requirements gathering', 'business analysis', 'change management', 'sap',
  'salesforce', 'crm', 'erp', 'quickbooks', 'xero',

  // marketing and design
  'marketing', 'digital marketing', 'seo', 'sem', 'content marketing', 'social media',
  'copywriting', 'branding', 'market research', 'google analytics', 'campaign management',
  'email marketing', 'ux', 'ui', 'user research', 'wireframing', 'prototyping',
  'graphic design', 'adobe', 'photoshop', 'illustrator', 'indesign', 'figma design',

  // healthcare, legal, education, science
  'nursing', 'clinical', 'patient care', 'pharmacology', 'phlebotomy', 'radiology',
  'legal research', 'contract law', 'litigation', 'compliance law', 'paralegal',
  'curriculum', 'lesson planning', 'tutoring', 'laboratory', 'research methods',
  'statistics', 'statistical analysis', 'experimental design', 'spss', 'stata', 'r',

  // interpersonal
  'communication', 'presentation', 'negotiation', 'mentoring', 'coaching', 'facilitation',
  'problem solving', 'critical thinking', 'time management', 'customer service',
  'public speaking', 'cross functional', 'multilingual', 'bilingual',
])

/**
 * Spellings that mean the same skill, mapped variant → canonical.
 *
 * A job ad saying "ReactJS" and a resume saying "React" are the same claim, and
 * before this table they were two unrelated skills: the ad counted an ask the
 * resume could not cover. Both sides of a match run through `canonicalSkill`,
 * so it does not matter which spelling either one happens to use.
 *
 * Every value here must exist in SKILLS. Keys may also appear in SKILLS — the
 * dictionary predates this table and still lists several variants of its own,
 * which is harmless once they collapse to the same canonical term.
 *
 * Regular plurals are handled by rule rather than listed, so "microservice",
 * "algorithms" and "unit tests" need no entries.
 *
 * Deliberately absent: abbreviations that are ordinary English in a job ad.
 * "py", "tf" and "dl" would cost more in false requirements than they win.
 */
export const SKILL_ALIASES = new Map<string, string>([
  // web frameworks — the "js" suffix and the dotted form are the same thing
  ['reactjs', 'react'], ['react.js', 'react'],
  ['vuejs', 'vue'], ['vue.js', 'vue'],
  ['angularjs', 'angular'], ['angular.js', 'angular'],
  ['nodejs', 'node'], ['node.js', 'node'],
  ['expressjs', 'express'], ['express.js', 'express'],
  ['nest.js', 'nestjs'], ['next.js', 'nextjs'], ['nuxt.js', 'nuxt'],
  ['tailwindcss', 'tailwind'], ['tailwind css', 'tailwind'],

  // languages
  // 'golang' is canonical because "gaps: go" is unreadable in the UI, and
  // because bare "go" in an ad is usually the verb.
  ['go', 'golang'],
  ['js', 'javascript'], ['ts', 'typescript'],
  ['csharp', 'c#'], ['c sharp', 'c#'], ['cpp', 'c++'],
  ['objective c', 'objective-c'],
  ['dot net', 'dotnet'], ['asp.net', 'aspnet'],

  // data stores
  ['postgres', 'postgresql'], ['psql', 'postgresql'],
  ['mongo', 'mongodb'],
  ['elastic search', 'elasticsearch'],

  // cloud and devops
  ['k8s', 'kubernetes'], ['kube', 'kubernetes'],
  ['cicd', 'ci/cd'], ['ci cd', 'ci/cd'], ['ci-cd', 'ci/cd'],
  ['github action', 'github actions'],

  // ai / ml
  ['ml', 'machine learning'],
  ['ai', 'artificial intelligence'],
  ['sklearn', 'scikit-learn'], ['scikit learn', 'scikit-learn'],
  ['hugging face', 'huggingface'],
  ['large language', 'llm'], ['llms', 'llm'],

  // api styles
  ['restful', 'rest'], ['rest api', 'rest'],

  // British and American spellings of the same skill
  ['optimization', 'optimisation'],
  ['data modeling', 'data modelling'],
  ['data visualization', 'data visualisation'],
  ['financial modeling', 'financial modelling'],
  ['threat modeling', 'threat modelling'],
])

/**
 * Multi-word skills, used when scoring bigrams.
 *
 * Alias phrases belong here too — a bigram is only ever counted if it is in
 * this set, so "scikit learn" would never be seen to alias in the first place.
 * Singular and plural forms are both admitted for the same reason: "unit tests"
 * has to be counted before `canonicalSkill` can fold it into "unit testing".
 */
export const SKILL_PHRASES = new Set<string>(
  [...SKILLS, ...SKILL_ALIASES.keys()]
    .filter(skill => skill.includes(' '))
    .flatMap(phrase =>
      phrase.endsWith('s') ? [phrase, phrase.slice(0, -1)] : [phrase, `${phrase}s`]
    )
)
