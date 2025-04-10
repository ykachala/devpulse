/**
 * Incremental sync utilities.
 *
 * Provides helpers for determining the correct delta window for commit
 * and repository fetches. On first sync (no lastSyncedAt), a full fetch
 * is performed. On subsequent syncs, only records newer than the stored
 * timestamp are fetched from the GitHub API.
 *
 * This module is the single source of truth for the delta-fetch strategy;
 * both the repo-scan and commit-history job processors import from here.
 */

/**
 * Represents the sync window for a single ingestion pass.
 */
export interface SyncWindow {
  /**
   * ISO 8601 string to pass as the `since` parameter to GitHub's API.
   * Undefined on first sync (full fetch).
   */
  since: string | undefined;

  /**
   * Whether this is the user's first sync (no prior timestamp).
   */
  isFullSync: boolean;
}

/**
 * Derives the sync window from the user's last synced timestamp.
 *
 * @param lastSyncedAt - The user's persisted last sync Date, or null/undefined
 *   when no sync has been performed yet.
 * @returns A SyncWindow describing how far back to fetch from GitHub.
 *
 * @example
 * // First sync — fetches all history
 * const window = deriveSyncWindow(null);
 * // window.since === undefined, window.isFullSync === true
 *
 * @example
 * // Incremental sync — only fetches changes since last run
 * const window = deriveSyncWindow(user.lastSyncedAt);
 * // window.since === "2025-04-09T12:00:00.000Z", window.isFullSync === false
 */
export function deriveSyncWindow(lastSyncedAt: Date | null | undefined): SyncWindow {
  if (!lastSyncedAt) {
    return { since: undefined, isFullSync: true };
  }

  return {
    since: lastSyncedAt.toISOString(),
    isFullSync: false,
  };
}

/**
 * Determines whether a given repository should be re-scanned for language
 * and metadata changes based on its last-committed timestamp.
 *
 * A repo is considered stale if its most recent commit is newer than the
 * user's last sync timestamp, or if it has never been synced before.
 *
 * @param lastSyncedAt - The user's persisted last sync Date, or null/undefined.
 * @param repoLastCommitAt - The stored last commit timestamp for the repo, or null.
 * @returns True if the repo requires re-scanning, false if already up to date.
 */
export function isRepoStale(
  lastSyncedAt: Date | null | undefined,
  repoLastCommitAt: Date | null | undefined
): boolean {
  // Never synced — always stale
  if (!lastSyncedAt) {
    return true;
  }

  // No recorded commits — treat as stale to ensure initial scan
  if (!repoLastCommitAt) {
    return true;
  }

  // Stale if the repo received commits after the last sync
  return repoLastCommitAt > lastSyncedAt;
}
