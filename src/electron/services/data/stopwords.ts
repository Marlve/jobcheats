/**
 * Words stripped before keyword extraction. Beyond ordinary English stopwords
 * this includes resume boilerplate ("responsible", "experience", "team") and
 * job-ad filler, which otherwise dominate frequency counts and crowd out the
 * terms that actually distinguish one candidate from another.
 */
export const STOPWORDS = new Set<string>([
  // articles, pronouns, conjunctions, prepositions
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its',
  'itself', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'shall', 'may', 'might', 'must', 'also', 'via', 'per', 'upon',

  // resume and job-ad boilerplate
  'ability', 'able', 'across', 'align', 'aligned', 'applicant', 'applicants', 'application',
  'apply', 'approach', 'area', 'areas', 'assist', 'assisted', 'attention', 'award', 'awards',
  'based', 'benefit', 'benefits', 'best', 'candidate', 'candidates', 'career', 'challenge',
  'challenging', 'closely', 'collaborate', 'collaborated', 'collaboration', 'colleague',
  'colleagues', 'commitment', 'committed', 'company', 'competitive', 'complete', 'completed',
  'contribute', 'contributed', 'culture', 'currently', 'daily', 'date', 'day', 'deliver',
  'delivered', 'delivering', 'demonstrate', 'demonstrated', 'department', 'desirable',
  'detail', 'details', 'develop', 'developed', 'developing', 'diverse', 'diversity', 'drive',
  'driven', 'duties', 'dynamic', 'education', 'effective', 'effectively', 'efficiency',
  'efficient', 'employee', 'employees', 'employer', 'employment', 'ensure', 'ensuring',
  'environment', 'equal', 'essential', 'established', 'etc', 'excellent', 'existing',
  'experience', 'experienced', 'expertise', 'fast', 'field', 'flexible', 'focus', 'focused',
  'following', 'full', 'gain', 'general', 'good', 'graduate', 'great', 'group', 'grow',
  'growing', 'growth', 'help', 'high', 'highly', 'hour', 'hours', 'ideal', 'impact',
  'implement', 'implemented', 'improve', 'improved', 'including', 'increase', 'increased',
  'individual', 'industry', 'information', 'initiative', 'inclusive', 'internal', 'job',
  'join', 'key', 'knowledge', 'large', 'lead', 'leading', 'learn', 'level', 'like', 'limited',
  'located', 'location', 'looking', 'maintain', 'maintained', 'make', 'manage', 'managed',
  'managing', 'many', 'meet', 'meeting', 'member', 'members', 'month', 'months', 'motivated',
  'multiple', 'need', 'needs', 'new', 'offer', 'one', 'operate', 'opportunities',
  'opportunity', 'organisation', 'organization', 'oriented', 'part', 'partner', 'passion',
  'passionate', 'people', 'perform', 'performance', 'performed', 'permanent', 'plus',
  'position', 'positions', 'possible', 'potential', 'preferred', 'previous', 'proactive',
  'process', 'processes', 'produce', 'professional', 'proficiency', 'proficient', 'program',
  'progress', 'project', 'projects', 'provide', 'provided', 'providing', 'qualification',
  'qualifications', 'quality', 'range', 'record', 'reference', 'references', 'related',
  'relevant', 'report', 'reporting', 'reports', 'require', 'required', 'requirement',
  'requirements', 'responsibilities', 'responsibility', 'responsible', 'result', 'results',
  'role', 'roles', 'salary', 'seeking', 'self', 'senior', 'service', 'services', 'set',
  'skill', 'skills', 'solution', 'solutions', 'someone', 'staff', 'standard', 'standards',
  'start', 'strong', 'successful', 'summary', 'support', 'supported', 'supporting', 'system',
  'systems', 'take', 'task', 'tasks', 'team', 'teams', 'time', 'together', 'took', 'top',
  'track', 'train', 'training', 'understanding', 'university', 'use', 'used', 'using',
  'various', 'want', 'week', 'well', 'within', 'work', 'worked', 'working', 'world', 'write',
  'written', 'year', 'years',
])
