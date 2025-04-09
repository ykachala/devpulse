/**
 * Organisation repository — database operations for Org and OrgMember models.
 */
import { Org, OrgMember } from '@prisma/client';
import { db } from '@/db/client';

/**
 * Finds an Org by its SHA-256 hashed API key.
 */
export async function findOrgByApiKeyHash(hash: string): Promise<Org | null> {
  return db.org.findUnique({ where: { apiKeyHash: hash } });
}

/**
 * Finds an Org by its internal ID.
 */
export async function findOrgById(id: string): Promise<Org | null> {
  return db.org.findUnique({ where: { id } });
}

/**
 * Creates an Org record with the requesting user as owner.
 */
export async function createOrg(name: string, apiKeyHash: string, ownerId: string): Promise<Org> {
  return db.org.create({
    data: {
      name,
      apiKeyHash,
      members: { create: { userId: ownerId, role: 'owner' } },
    },
  });
}

/**
 * Adds a user to an organisation.
 * Uses upsert to handle the case where the user is already a member.
 */
export async function addOrgMember(orgId: string, userId: string, role = 'member'): Promise<OrgMember> {
  return db.orgMember.upsert({
    where: { orgId_userId: { orgId, userId } },
    update: {},
    create: { orgId, userId, role },
  });
}

/**
 * Returns all members of an organisation with their analysis data for reporting.
 */
export async function getOrgMembersWithAnalysis(orgId: string): Promise<
  Array<{
    id: string;
    userId: string;
    role: string;
    user: {
      login: string;
      name: string | null;
      analysis: {
        techStacks: unknown;
        architectureTags: string[];
        seniorityScore: number;
        consistencyScore: number;
      } | null;
    };
  }>
> {
  return db.orgMember.findMany({
    where: { orgId },
    select: {
      id: true,
      userId: true,
      role: true,
      user: {
        select: {
          login: true,
          name: true,
          analysis: {
            select: {
              techStacks: true,
              architectureTags: true,
              seniorityScore: true,
              consistencyScore: true,
            },
          },
        },
      },
    },
  });
}
