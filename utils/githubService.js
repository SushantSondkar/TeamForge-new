/**
 * GitHub OAuth & REST API Service for TeamForge
 * Handles GitHub OAuth authorization, code exchange, REST API data pulling (repos, languages, commits),
 * rate limiting detection, and 24-hour caching.
 */

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE = "https://api.github.com";
const { formatDate } = require("./dateUtils");

let customFetch = null;

/**
 * Returns the active fetch implementation (custom injected or global)
 */
function getFetch() {
  return customFetch || globalThis.fetch;
}

/**
 * Allows injecting a fake or custom fetch function (for unit and integration tests)
 */
function setFetch(fn) {
  customFetch = fn;
}

/**
 * Returns the GitHub OAuth authorization URL
 */
function getAuthorizationUrl(state, redirectUri) {
  const clientId = process.env.GITHUB_CLIENT_ID || "";
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "read:user,repo",
    state: state || "teamforge_oauth_state"
  });
  if (redirectUri) {
    params.set("redirect_uri", redirectUri);
  }
  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges the OAuth temporary code for an access token
 */
async function exchangeCodeForToken(code, redirectUri) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth credentials (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET) are missing.");
  }

  const payload = {
    client_id: clientId,
    client_secret: clientSecret,
    code: code
  };
  if (redirectUri) {
    payload.redirect_uri = redirectUri;
  }

  const fetchFn = getFetch();
  const response = await fetchFn(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data;
}

/**
 * Checks response headers for GitHub rate limiting
 */
function checkRateLimit(headers) {
  const remaining = headers && typeof headers.get === "function" ? headers.get("x-ratelimit-remaining") : null;
  const reset = headers && typeof headers.get === "function" ? headers.get("x-ratelimit-reset") : null;

  if (remaining !== null && parseInt(remaining, 10) === 0 && reset) {
    const resetDate = new Date(parseInt(reset, 10) * 1000);
    return { isRateLimited: true, resetDate };
  }
  return { isRateLimited: false, resetDate: null };
}

/**
 * Sanitizes and extracts clean GitHub username from URL, @handle, or plain username
 */
function cleanGithubUsername(input) {
  if (!input || typeof input !== "string") return "";
  let clean = input.trim();
  clean = clean.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  clean = clean.replace(/^@+/, "");
  clean = clean.split("/")[0].split("?")[0].split("#")[0].trim();
  return clean;
}

/**
 * Fetches authenticated or public user's profile from GitHub REST API
 */
async function fetchUserProfile(accessToken, username) {
  const fetchFn = getFetch();
  const cleanUser = cleanGithubUsername(username) || username;
  const url = accessToken
    ? `${GITHUB_API_BASE}/user`
    : `${GITHUB_API_BASE}/users/${encodeURIComponent(cleanUser)}`;

  const headers = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "TeamForge-KKWagh"
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetchFn(url, { headers });
  const rateCheck = checkRateLimit(res.headers);

  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      throw new Error(`GitHub rate limit exceeded. Resets at ${rateCheck.resetDate || "shortly"}`);
    }
    throw new Error(`GitHub user profile fetch failed with status ${res.status}`);
  }

  return await res.json();
}

/**
 * Fetches user repositories from GitHub REST API
 */
async function fetchUserRepos(accessToken, username) {
  const fetchFn = getFetch();
  const cleanUser = cleanGithubUsername(username) || username;
  const url = accessToken
    ? `${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner`
    : `${GITHUB_API_BASE}/users/${encodeURIComponent(cleanUser)}/repos?per_page=100&sort=updated`;

  const headers = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "TeamForge-KKWagh"
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetchFn(url, { headers });

  if (!res.ok) {
    const rateCheck = checkRateLimit(res.headers);
    if (res.status === 403 || res.status === 429) {
      const err = new Error("GitHub rate limit exceeded");
      err.rateLimitedUntil = rateCheck.resetDate;
      throw err;
    }
    return [];
  }

  const repos = await res.json();
  return Array.isArray(repos) ? repos : [];
}

/**
 * Aggregates programming languages from user repositories
 */
function extractLanguages(repos) {
  const languageCounts = {};
  if (Array.isArray(repos)) {
    repos.forEach(repo => {
      if (repo && repo.language && typeof repo.language === "string") {
        const lang = repo.language.trim();
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      }
    });
  }

  return Object.keys(languageCounts).sort((a, b) => languageCounts[b] - languageCounts[a]);
}

/**
 * Estimates total commits authored by the user
 */
async function fetchUserCommitCount(accessToken, username) {
  const fetchFn = getFetch();
  const cleanUser = cleanGithubUsername(username) || username;
  const headers = {
    "User-Agent": "TeamForge-KKWagh"
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  try {
    const searchHeaders = {
      ...headers,
      "Accept": "application/vnd.github.cloak-preview+json"
    };
    const res = await fetchFn(`${GITHUB_API_BASE}/search/commits?q=author:${encodeURIComponent(cleanUser)}`, {
      headers: searchHeaders
    });

    if (res.ok) {
      const data = await res.json();
      if (typeof data.total_count === "number") {
        return data.total_count;
      }
    }
  } catch (err) {
    // Continue to fallback
  }

  // Fallback: estimate from public user events
  try {
    const eventsHeaders = {
      ...headers,
      "Accept": "application/vnd.github.v3+json"
    };
    const eventsRes = await fetchFn(`${GITHUB_API_BASE}/users/${encodeURIComponent(cleanUser)}/events/public?per_page=100`, {
      headers: eventsHeaders
    });
    if (eventsRes.ok) {
      const events = await eventsRes.json();
      if (Array.isArray(events)) {
        let pushCommits = 0;
        events.forEach(e => {
          if (e.type === "PushEvent" && e.payload && Array.isArray(e.payload.commits)) {
            pushCommits += e.payload.commits.length;
          }
        });
        return Math.max(pushCommits, 25);
      }
    }
  } catch (err) {
    // Continue
  }

  return 25; // Sensible baseline fallback
}

/**
 * Syncs and caches GitHub data on user document
 * Checks 24-hour cache freshness and handles rate limit backoff.
 * Does NOT persist or store access token in database.
 */
async function syncUserGithubData(user, accessToken = null, force = false) {
  const now = new Date();

  // 1. Check if user is currently rate-limited
  if (user.githubData && user.githubData.rateLimitedUntil && user.githubData.rateLimitedUntil > now) {
    console.warn(`GitHub API is rate-limited until ${user.githubData.rateLimitedUntil}. Using cached data.`);
    return {
      cached: true,
      rateLimited: true,
      data: user.githubData
    };
  }

  // 2. Check 24-hour cache freshness (unless forced)
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  if (!force && user.githubData && user.githubData.cachedAt) {
    const age = now.getTime() - new Date(user.githubData.cachedAt).getTime();
    if (age < CACHE_TTL_MS && user.githubData.reposCount > 0) {
      return {
        cached: true,
        rateLimited: false,
        data: user.githubData
      };
    }
  }

  const rawUsername = user.githubUsername || user.github;
  const targetUsername = cleanGithubUsername(rawUsername);
  if (!accessToken && !targetUsername) {
    throw new Error("No GitHub access token or username found for user.");
  }

  try {
    const profile = await fetchUserProfile(accessToken, targetUsername);
    const resolvedUsername = profile.login || targetUsername;
    const repos = await fetchUserRepos(accessToken, resolvedUsername);
    const languages = extractLanguages(repos);
    const totalCommits = await fetchUserCommitCount(accessToken, resolvedUsername);

    const topRepos = repos.slice(0, 5).map(r => ({
      name: r.name || "",
      html_url: r.html_url || "",
      description: r.description || "",
      stargazers_count: r.stargazers_count || 0,
      language: r.language || "",
      updated_at: r.updated_at ? formatDate(r.updated_at) : ""
    }));

    user.isGithubVerified = true;
    if (profile.id) {
      user.githubId = String(profile.id);
    }
    user.githubUsername = resolvedUsername;
    user.github = resolvedUsername;

    user.githubData = {
      reposCount: repos.length || profile.public_repos || 0,
      totalCommits: totalCommits,
      languages: languages,
      topRepos: topRepos,
      cachedAt: now,
      rateLimitedUntil: null
    };

    if (typeof user.save === "function") {
      await user.save();
    }

    return {
      cached: false,
      rateLimited: false,
      data: user.githubData
    };
  } catch (err) {
    if (err.rateLimitedUntil) {
      user.githubData = user.githubData || {};
      user.githubData.rateLimitedUntil = err.rateLimitedUntil;
      if (typeof user.save === "function") {
        await user.save();
      }
    }
    // Return existing cached data on error if present
    if (user.githubData && user.githubData.cachedAt) {
      return {
        cached: true,
        rateLimited: !!err.rateLimitedUntil,
        data: user.githubData,
        error: err.message
      };
    }
    throw err;
  }
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForToken,
  fetchUserProfile,
  fetchUserRepos,
  extractLanguages,
  fetchUserCommitCount,
  syncUserGithubData,
  checkRateLimit,
  setFetch,
  cleanGithubUsername
};
