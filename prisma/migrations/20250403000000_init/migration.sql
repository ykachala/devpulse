-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "tokenTag" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repos" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT,
    "primaryLanguage" TEXT,
    "languages" JSONB NOT NULL DEFAULT '{}',
    "topics" TEXT[],
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "hasCiCd" BOOLEAN NOT NULL DEFAULT false,
    "hasDocker" BOOLEAN NOT NULL DEFAULT false,
    "hasTests" BOOLEAN NOT NULL DEFAULT false,
    "dependencyFiles" JSONB NOT NULL DEFAULT '{}',
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "lastCommitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commits" (
    "id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authoredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "techStacks" JSONB NOT NULL DEFAULT '[]',
    "architectureTags" TEXT[],
    "seniorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consistencyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commitQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "testCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "techSummary" TEXT,
    "strengthAreas" JSONB NOT NULL DEFAULT '[]',
    "readmeMarkdown" TEXT,
    "s3ReadmeKey" TEXT,
    "s3ProfileKey" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orgs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_githubId_key" ON "users"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_userId_key" ON "oauth_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "repos_githubId_key" ON "repos"("githubId");

-- CreateIndex
CREATE INDEX "repos_userId_idx" ON "repos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "commits_sha_key" ON "commits"("sha");

-- CreateIndex
CREATE INDEX "commits_repoId_idx" ON "commits"("repoId");

-- CreateIndex
CREATE INDEX "commits_userId_idx" ON "commits"("userId");

-- CreateIndex
CREATE INDEX "sync_jobs_userId_idx" ON "sync_jobs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "analyses_userId_key" ON "analyses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "orgs_apiKeyHash_key" ON "orgs"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_orgId_userId_key" ON "org_members"("orgId", "userId");

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repos" ADD CONSTRAINT "repos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
