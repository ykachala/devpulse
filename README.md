# devpulse

**GitHub activity intelligence platform. Ingest developer activity, detect tech stacks, generate AI-powered developer profiles, and surface portfolio insights — automatically.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![AWS S3](https://img.shields.io/badge/AWS_S3-232F3E?style=flat&logo=amazon-aws&logoColor=white)
![Anthropic](https://img.shields.io/badge/Claude_API-D97757?style=flat)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/CI%2FCD-2088FF?style=flat&logo=github-actions&logoColor=white)
[![CI](https://github.com/ykachala/devpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/ykachala/devpulse/actions/workflows/ci.yml)

---

## What this is

Devpulse connects to GitHub via OAuth, ingests a developer's activity (repos, commits, languages, PRs, contribution patterns), and builds an intelligent profile. An AI layer analyses the activity to detect architecture patterns, infer seniority signals, and generate a written developer profile — the kind of summary a senior engineer would write after reviewing someone's work.

This started as a personal tool to automate my own portfolio maintenance. It became a full platform.

**Use cases:**
- Developers: auto-generate your portfolio README, tech stack breakdown, and profile bio  
- Recruiters / engineering managers: understand a candidate's actual work, not just their CV  
- Teams: visualise the tech spread and contribution patterns across your engineering org

---

## Architecture

```
GitHub OAuth
     │
     ▼
┌──────────────────┐
│   Auth Service    │  GitHub OAuth flow
│   JWT issuance    │  Stores access token (encrypted at rest)
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│               Ingestion Pipeline                   │
│                                                    │
│  GitHub REST API → Rate-limit-aware paginator      │
│        │                                           │
│        ├── Repos: languages, topics, star count    │
│        ├── Commits: frequency, message analysis    │
│        ├── PRs: review patterns, merge rate        │
│        └── Activity: contribution heatmap          │
│                                                    │
│  Queued via BullMQ — respects GitHub rate limits   │
│  Incremental updates — only fetches deltas         │
└────────┬─────────────────────────────────────────┘
         │  Normalised activity records
         ▼
┌──────────────────┐
│  Analysis Engine  │
│  - Stack detect   │  Rule-based: language + framework detection
│  - Seniority sig  │  Heuristics: commit depth, test coverage, PR review
│  - Pattern flags  │  Architecture signals: monorepo, microservices, CI/CD
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│         AI Profile Generator      │
│                                   │
│  Input: structured activity JSON  │
│  Model: Claude (claude-sonnet-4)  │
│  Output:                          │
│  - Developer bio (markdown)       │
│  - Tech stack summary             │
│  - Strength areas                 │
│  - Suggested portfolio README     │
│  - Architecture pattern tags      │
└────────┬──────────────────────────┘
         │
    ┌────┴────────────┐
    ▼                 ▼
PostgreSQL         AWS S3
(Prisma ORM)      (Generated READMEs,
                   profile exports)
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 + TypeScript |
| ORM | Prisma with PostgreSQL 15 |
| Cache | Redis (GitHub API response cache, rate limit state) |
| Queue | BullMQ (ingestion jobs, AI generation jobs) |
| AI | Anthropic Claude — structured profile generation |
| Storage | AWS S3 — generated README and profile export storage |
| Auth | GitHub OAuth 2.0 + JWT |
| API | REST + Server-Sent Events (SSE) for generation streaming |
| Containerisation | Docker + Docker Compose |
| CI/CD | GitHub Actions |

---

## Features

### Ingestion
- GitHub OAuth — one-click connect, token stored encrypted
- Full repository scan: languages, frameworks, dependency files (`package.json`, `requirements.txt`, `composer.json`, etc.)
- Commit history analysis: frequency, volume, message quality heuristics
- Contribution heatmap data
- Rate-limit-aware pagination — respects GitHub's 5,000 req/hr ceiling
- Incremental sync — subsequent fetches only pull changes since last sync

### Analysis
- Tech stack detection from file patterns, language stats, and dependency files
- Architecture pattern tagging: detects REST API patterns, event-driven structure, Docker/CI presence, test coverage
- Seniority heuristics: commit message quality, PR review participation, test presence, documentation
- Consistency score: contribution frequency, repo maintenance patterns

### AI profile generation
- Developer bio: 3–4 paragraph written profile from activity data
- Tech stack summary: ranked by evidence strength, not just line count
- Strength areas: what this developer is demonstrably good at
- Portfolio README: a GitHub profile README the developer can copy directly
- All generation streams via SSE so progress is visible in real time

### Multi-tenant
- Each user's data is fully isolated
- Organisations can onboard entire teams and get aggregate reporting
- Per-org API keys for integration with ATS or HR systems

---

## API

```
POST   /api/v1/auth/github              # Begin OAuth flow
GET    /api/v1/auth/callback            # GitHub OAuth callback
POST   /api/v1/sync                     # Trigger GitHub data sync
GET    /api/v1/sync/status              # Sync job status
GET    /api/v1/profile                  # Get analysed profile
GET    /api/v1/profile/stacks           # Detected tech stacks
GET    /api/v1/profile/generate         # Stream AI profile (SSE)
GET    /api/v1/profile/readme           # Get generated README (markdown)
GET    /api/v1/profile/export           # Download full profile (JSON)
GET    /api/v1/orgs/:id/report          # Org-level team report
```

---

## Getting started

```bash
git clone https://github.com/ykachala/devpulse.git
cd devpulse
cp .env.example .env
# Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ANTHROPIC_API_KEY
docker compose up
npx prisma migrate dev
```

API: `http://localhost:3000`

```bash
npm test
npm run test:integration
```

### Environment variables

```env
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/devpulse
REDIS_URL=redis://localhost:6379
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=your_jwt_secret
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=devpulse-profiles
AWS_REGION=eu-west-1
```

---

## AI profile example

Given a developer's GitHub activity, Devpulse generates output like:

```markdown
## About

Yoweli is a senior backend engineer with demonstrable depth in distributed systems
and multi-tenant SaaS architecture. Their commit history shows a consistent pattern
of high-volume transactional work — subscription billing, webhook delivery, and
event-driven pipelines appear repeatedly across multiple repositories.

## Stack (by evidence strength)
1. Node.js + TypeScript — primary language in 8 of 12 repos
2. PostgreSQL — detected in 10 repos via schema files and migrations
3. Redis — present in all high-throughput projects
4. Laravel / PHP 8 — 3 repos, production-grade patterns
5. Python — emerging usage in 2 recent repos

## Architecture signals
- Event-driven design: detected in 4 repos (queue patterns, webhook handlers)
- CI/CD: GitHub Actions present in 9 of 12 repos
- Containerisation: Dockerfile in all recent repos
- Testing: test directories in 7 repos, coverage scripts in 4

## Suggested profile headline
Senior Backend Engineer & API Platform Architect | TypeScript · Node.js · Laravel · AWS
```

---

## Project structure

```
devpulse/
├── src/
│   ├── auth/             # GitHub OAuth, JWT
│   ├── ingestion/        # GitHub API client, paginator, queue jobs
│   ├── analysis/         # Stack detection, seniority heuristics
│   ├── ai/               # Claude integration, prompt templates, SSE streaming
│   ├── storage/          # S3 client, README export
│   ├── api/              # Route handlers
│   └── db/               # Prisma client, schema
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
├── docker-compose.yml
└── .github/workflows/
```

---

## Related

- [nexus-scheduler](https://github.com/ykachala/nexus-scheduler) — AI scheduling, similar Claude integration pattern  
- [finparse-ai](https://github.com/ykachala/finparse-ai) — same structured AI extraction approach applied to financial documents

---

**Author:** Yoweli Kachala &nbsp;|&nbsp; [LinkedIn](https://linkedin.com/in/yoweli-kachala) &nbsp;|&nbsp; Cape Town, South Africa
