/**
 * Tech stack detector.
 * Aggregates language bytes across all repos, normalises to percentages,
 * and maps languages/dependency files to framework associations.
 */

export interface TechStack {
  name: string;
  confidence: number; // 0–1
  evidence: string[];
}

export interface RepoData {
  primaryLanguage: string | null;
  languages: Record<string, number>;
  topics: string[];
  dependencyFiles: Record<string, boolean>;
  hasCiCd: boolean;
  hasDocker: boolean;
  hasTests: boolean;
}

// Maps dependency file presence to framework/technology name
const DEP_FILE_TO_STACK: Record<string, string> = {
  'package.json': 'Node.js',
  'requirements.txt': 'Python',
  'composer.json': 'PHP',
  Gemfile: 'Ruby',
  'go.mod': 'Go',
  'pom.xml': 'Java',
  'Cargo.toml': 'Rust',
};

// Language to framework hints
const LANGUAGE_HINTS: Record<string, string[]> = {
  TypeScript: ['Node.js', 'TypeScript'],
  JavaScript: ['Node.js', 'JavaScript'],
  Python: ['Python'],
  PHP: ['PHP'],
  Java: ['Java'],
  Ruby: ['Ruby'],
  Go: ['Go'],
  Rust: ['Rust'],
  'C#': ['.NET'],
  Swift: ['iOS/Swift'],
  Kotlin: ['Kotlin/JVM'],
};

// Framework identifiers found in package.json topics or dependency files
const FRAMEWORK_TOPICS: Record<string, string[]> = {
  'Node.js': ['nodejs', 'express', 'fastify', 'nestjs', 'next.js', 'nextjs', 'koa'],
  Python: ['django', 'fastapi', 'flask', 'sqlalchemy'],
  PHP: ['laravel', 'symfony', 'wordpress'],
  Java: ['spring', 'spring-boot', 'quarkus'],
  Ruby: ['rails', 'sinatra'],
  Go: ['gin', 'echo', 'fiber'],
  Rust: ['actix', 'axum', 'rocket'],
};

/**
 * Detects technology stacks from aggregated repository data.
 * Returns stacks sorted by confidence descending.
 */
export function detectStacks(repos: RepoData[]): TechStack[] {
  if (repos.length === 0) return [];

  // Aggregate language bytes across all repos
  const langBytes: Record<string, number> = {};
  for (const repo of repos) {
    for (const [lang, bytes] of Object.entries(repo.languages)) {
      langBytes[lang] = (langBytes[lang] ?? 0) + bytes;
    }
  }

  const totalBytes = Object.values(langBytes).reduce((sum, b) => sum + b, 0);

  // Track confidence per stack
  const stackConfidence: Record<string, number> = {};
  const stackEvidence: Record<string, Set<string>> = {};

  function addEvidence(stackName: string, evidence: string, weight: number): void {
    stackConfidence[stackName] = (stackConfidence[stackName] ?? 0) + weight;
    if (!stackEvidence[stackName]) stackEvidence[stackName] = new Set();
    stackEvidence[stackName].add(evidence);
  }

  // Score by language percentage
  for (const [lang, bytes] of Object.entries(langBytes)) {
    const pct = totalBytes > 0 ? bytes / totalBytes : 0;
    const hints = LANGUAGE_HINTS[lang];
    if (hints) {
      for (const hint of hints) {
        addEvidence(hint, `${lang} (${Math.round(pct * 100)}% of codebase)`, pct * 0.4);
      }
    }
  }

  // Score by dependency file presence (count across repos)
  for (const [file, stackName] of Object.entries(DEP_FILE_TO_STACK)) {
    const reposWithFile = repos.filter((r) => r.dependencyFiles[file]).length;
    if (reposWithFile > 0) {
      const fraction = reposWithFile / repos.length;
      addEvidence(stackName, `${file} present in ${reposWithFile} repo(s)`, fraction * 0.4);
    }
  }

  // Score by topics
  for (const repo of repos) {
    for (const topic of repo.topics) {
      const normalized = topic.toLowerCase();
      for (const [stackName, topicList] of Object.entries(FRAMEWORK_TOPICS)) {
        if (topicList.some((t) => normalized.includes(t))) {
          addEvidence(stackName, `topic: ${topic}`, 0.05);
        }
      }
    }
  }

  // Build output, normalise confidence to 0–1 cap
  const stacks: TechStack[] = Object.entries(stackConfidence)
    .map(([name, rawConf]) => ({
      name,
      confidence: Math.min(1, rawConf),
      evidence: Array.from(stackEvidence[name] ?? []),
    }))
    .filter((s) => s.confidence >= 0.05)
    .sort((a, b) => b.confidence - a.confidence);

  return stacks;
}
