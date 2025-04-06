/**
 * Architecture pattern tagger.
 * Analyses repository characteristics to detect high-level architecture patterns.
 */
import { RepoData } from '@/analysis/stackDetector';

export type ArchitectureTag =
  | 'rest-api'
  | 'event-driven'
  | 'containerised'
  | 'ci-cd'
  | 'testing'
  | 'microservices'
  | 'monorepo'
  | 'infrastructure-as-code';

const EVENT_DRIVEN_NAMES = ['queue', 'event', 'worker', 'stream', 'consumer', 'producer'];
const EVENT_DRIVEN_DEPS = ['bullmq', 'kafkajs', 'amqplib', 'rabbitmq', 'nats', 'rxjs'];
const REST_API_NAMES = ['api', 'service', 'server', 'backend', 'rest'];
const SERVICE_NAMES = ['service', 'api', 'gateway', 'microservice', 'svc'];
const IaC_TOPICS = ['terraform', 'ansible', 'pulumi', 'cdk', 'cloudformation', 'kubernetes', 'helm', 'k8s'];

/**
 * Detects architecture patterns from aggregated repository data.
 */
export function detectPatterns(repos: RepoData[]): ArchitectureTag[] {
  if (repos.length === 0) return [];

  const tags = new Set<ArchitectureTag>();

  // Rest-api: repos with api/service/backend naming or topics
  const restRepos = repos.filter((r) => {
    const topics = r.topics.map((t) => t.toLowerCase());
    return REST_API_NAMES.some((name) => topics.some((t) => t.includes(name)));
  });
  if (restRepos.length > 0) tags.add('rest-api');

  // Event-driven: repos with queue/event/worker naming or event-driven deps
  const eventRepos = repos.filter((r) => {
    const topics = r.topics.map((t) => t.toLowerCase());
    const hasEventTopic = EVENT_DRIVEN_NAMES.some((name) => topics.some((t) => t.includes(name)));
    const deps = Object.entries(r.dependencyFiles)
      .filter(([, present]) => present)
      .map(([f]) => f.toLowerCase());
    const hasEventDep = EVENT_DRIVEN_DEPS.some((dep) => deps.some((d) => d.includes(dep)));
    return hasEventTopic || hasEventDep;
  });
  if (eventRepos.length > 0) tags.add('event-driven');

  // Containerised: hasDocker or hasCiCd across >50% of repos
  const containerisedCount = repos.filter((r) => r.hasDocker || r.hasCiCd).length;
  if (containerisedCount / repos.length > 0.5) tags.add('containerised');

  // CI/CD: hasCiCd across >30% of repos
  const ciCdCount = repos.filter((r) => r.hasCiCd).length;
  if (ciCdCount / repos.length > 0.3) tags.add('ci-cd');

  // Testing: hasTests across >50% of repos
  const testingCount = repos.filter((r) => r.hasTests).length;
  if (testingCount / repos.length > 0.5) tags.add('testing');

  // Microservices: multiple repos with service/api/gateway naming
  const serviceRepos = repos.filter((r) => {
    const topics = r.topics.map((t) => t.toLowerCase());
    return SERVICE_NAMES.some((name) => topics.some((t) => t.includes(name)));
  });
  if (serviceRepos.length >= 2) tags.add('microservices');

  // Infrastructure as code: repos with IaC topics
  const iacRepos = repos.filter((r) => {
    const topics = r.topics.map((t) => t.toLowerCase());
    return IaC_TOPICS.some((name) => topics.some((t) => t.includes(name)));
  });
  if (iacRepos.length > 0) tags.add('infrastructure-as-code');

  return Array.from(tags);
}
