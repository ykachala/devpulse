/**
 * Test data factories using faker.
 * All test data is generated with realistic variance — no hardcoded fixtures.
 */
import { faker } from '@faker-js/faker';
import { RepoData } from '@/analysis/stackDetector';
import { CommitData } from '@/analysis/seniorityHeuristics';

export const factory = {
  /**
   * Generates a random user UUID.
   */
  userId(): string {
    return faker.string.uuid();
  },

  /**
   * Generates a realistic GitHub user object.
   */
  githubUser(): {
    id: number;
    login: string;
    email: string | null;
    name: string | null;
    avatar_url: string;
  } {
    return {
      id: faker.number.int({ min: 1000, max: 9999999 }),
      login: faker.internet.userName(),
      email: faker.datatype.boolean() ? faker.internet.email() : null,
      name: faker.datatype.boolean() ? faker.person.fullName() : null,
      avatar_url: faker.image.avatarGitHub(),
    };
  },

  /**
   * Generates a realistic repository data object for analysis.
   */
  repo(overrides: Partial<RepoData> = {}): RepoData {
    const languages: Record<string, number> = {};
    const langCount = faker.number.int({ min: 1, max: 4 });
    const possibleLangs = ['TypeScript', 'JavaScript', 'Python', 'PHP', 'Go', 'Ruby', 'Java', 'Rust'];

    for (let i = 0; i < langCount; i++) {
      const lang = possibleLangs[i % possibleLangs.length];
      if (lang) {
        languages[lang] = faker.number.int({ min: 1000, max: 100000 });
      }
    }

    return {
      primaryLanguage: Object.keys(languages)[0] ?? null,
      languages,
      topics: faker.helpers.arrayElements(
        ['api', 'nodejs', 'typescript', 'testing', 'docker', 'microservice'],
        faker.number.int({ min: 0, max: 3 })
      ),
      dependencyFiles: {
        'package.json': faker.datatype.boolean(),
        'requirements.txt': faker.datatype.boolean(),
        'composer.json': faker.datatype.boolean(),
        Gemfile: false,
        'go.mod': false,
        'pom.xml': false,
        'Cargo.toml': false,
      },
      hasCiCd: faker.datatype.boolean(),
      hasDocker: faker.datatype.boolean(),
      hasTests: faker.datatype.boolean(),
      ...overrides,
    };
  },

  /**
   * Generates a realistic commit data object.
   */
  commit(overrides: Partial<CommitData> = {}): CommitData {
    const messages = [
      `Add ${faker.word.noun()} feature`,
      `Fix ${faker.word.noun()} bug in ${faker.word.noun()}`,
      `Update ${faker.word.noun()} configuration`,
      `Refactor ${faker.word.noun()} service`,
      `Remove deprecated ${faker.word.noun()}`,
      `wip`,
      `fix`,
      faker.lorem.sentence({ min: 3, max: 8 }),
    ];

    return {
      message: faker.helpers.arrayElement(messages),
      authoredAt: faker.date.recent({ days: 180 }),
      ...overrides,
    };
  },

  /**
   * Generates a realistic analysis data object.
   */
  analysisData(): {
    techStacks: Array<{ name: string; confidence: number; evidence: string[] }>;
    architectureTags: string[];
    seniorityScore: number;
    consistencyScore: number;
    commitQuality: number;
    testCoverage: number;
  } {
    return {
      techStacks: [
        {
          name: faker.helpers.arrayElement(['Node.js', 'Python', 'PHP', 'Go']),
          confidence: faker.number.float({ min: 0.3, max: 1.0, fractionDigits: 2 }),
          evidence: [faker.lorem.sentence()],
        },
      ],
      architectureTags: faker.helpers.arrayElements(
        ['rest-api', 'ci-cd', 'testing', 'containerised'],
        faker.number.int({ min: 0, max: 3 })
      ),
      seniorityScore: faker.number.float({ min: 0, max: 1, fractionDigits: 2 }),
      consistencyScore: faker.number.float({ min: 0, max: 1, fractionDigits: 2 }),
      commitQuality: faker.number.float({ min: 0, max: 1, fractionDigits: 2 }),
      testCoverage: faker.number.float({ min: 0, max: 1, fractionDigits: 2 }),
    };
  },
};
