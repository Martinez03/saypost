import "server-only";

// The public repository behind the landing's GitHub links. Set NEXT_PUBLIC_GITHUB_REPO ("owner/name") in a fork.
export const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || "Martinez03/saypost";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

export function githubFile(path: string): string {
  return `${GITHUB_URL}/blob/main/${path}`;
}

/**
 * Star count from the GitHub API, cached for an hour. Null when the repo doesn't exist yet, is private,
 * the API rate-limits us or takes too long: the button then shows without a number.
 */
export async function getGithubStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}
