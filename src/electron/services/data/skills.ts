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
  'objective-c', 'visual basic', 'delphi', 'groovy', 'solidity',

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

/** Multi-word skills, used when scoring bigrams. */
export const SKILL_PHRASES = new Set<string>(
  [...SKILLS].filter(skill => skill.includes(' '))
)
