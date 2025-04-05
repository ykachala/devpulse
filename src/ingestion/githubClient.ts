/**
 * GitHub REST API client with rate-limit-aware pagination.
 *
 * Respects GitHub's X-RateLimit-Remaining header — if fewer than 10 requests
 * remain, the client sleeps until X-RateLimit-Reset before continuing.
 */

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  topics: string[];
  updated_at: string;
  pushed_at: string | null;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}

const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubClient {
  constructor(private readonly token: string) {}

  /**
   * Makes a single GitHub API request and returns data + response headers.
   */
  private async fetch<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<{ data: T; headers: Headers }> {
    const url = new URL(`${GITHUB_API_BASE}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // Respect rate limit — if fewer than 10 requests remain, sleep until reset
    const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') ?? '100', 10);
    if (remaining < 10) {
      const resetAt = parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10);
      const sleepMs = Math.max(0, resetAt * 1000 - Date.now()) + 1000;
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} on ${path}`);
    }

    const data = (await response.json()) as T;
    return { data, headers: response.headers };
  }

  /**
   * Paginates through all pages of a GitHub API endpoint using Link headers.
   */
  async paginate<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const allItems: T[] = [];
    let currentPath: string | null = path;
    let currentParams: Record<string, string> | undefined = { per_page: '100', ...params };

    while (currentPath) {
      const { data, headers } = await this.fetch<T[]>(currentPath, currentParams);
      allItems.push(...data);

      // Parse Link header for next page
      const linkHeader = headers.get('Link') ?? '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch && nextMatch[1]) {
        // Next page URL is absolute — extract just the path + query
        const nextUrl = new URL(nextMatch[1]);
        currentPath = nextUrl.pathname;
        currentParams = {};
        nextUrl.searchParams.forEach((v, k) => {
          currentParams![k] = v;
        });
      } else {
        currentPath = null;
      }
    }

    return allItems;
  }

  /**
   * Returns all public and private repos the authenticated user has access to.
   */
  async getUserRepos(): Promise<GitHubRepo[]> {
    return this.paginate<GitHubRepo>('/user/repos', {
      type: 'owner',
      sort: 'updated',
      direction: 'desc',
    });
  }

  /**
   * Returns the language byte counts for a repository.
   */
  async getRepoLanguages(fullName: string): Promise<Record<string, number>> {
    const { data } = await this.fetch<Record<string, number>>(`/repos/${fullName}/languages`);
    return data;
  }

  /**
   * Checks whether a specific file or directory exists in a repository.
   */
  async getRepoContents(fullName: string, path: string): Promise<{ exists: boolean }> {
    try {
      await this.fetch<unknown>(`/repos/${fullName}/contents/${path}`);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Returns commits for a repository, optionally filtered by date.
   */
  async getCommits(fullName: string, since?: string): Promise<GitHubCommit[]> {
    const params: Record<string, string> = {};
    if (since) params['since'] = since;
    return this.paginate<GitHubCommit>(`/repos/${fullName}/commits`, params);
  }

  /**
   * Returns the authenticated GitHub user's profile.
   */
  async getCurrentUser(): Promise<GitHubUser> {
    const { data } = await this.fetch<GitHubUser>('/user');
    return data;
  }
}
