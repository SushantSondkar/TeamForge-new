/**
 * GitHub OAuth & REST API Service for TeamForge
 * Handles GitHub OAuth authorization, code exchange, REST API data pulling (repos, languages, commits),
 * rate limiting detection, and 24-hour caching.
 */

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE = "https://api.github.com";

/**
 * Returns the GitHub OAuth authorization URL
 */
function getAuthorizationUrl(state, redirectUri) {
  const clientId = process.env.GITHUB_CLIENT_ID || "demo_github_client_id";
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
    // In dev / test mode without real secrets, return simulated token
    return {
      access_token: `mock_gh_token_${Date.now()}`,
      token_type: "bearer",
      scope: "read:user,repo"
    };
  }

  const payload = {
    client_id: clientId,
    client_secret: clientSecret,
    code: code
  };
  if (redirectUri) {
    payload.redirect_uri = redirectUri;
  }

  const response = await fetch(GITHUB_TOKEN_URL, {
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
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");

  if (remaining !== null && parseInt(remaining, 10) === 0 && reset) {
    const resetDate = new Date(parseInt(reset, 10) * 1000);
    return { isRateLimited: true, resetDate };
  }
  return { isRateLimited: false, resetDate: null };
}

/**
 * Fetches authenticated user's profile from GitHub REST API
 */
async function fetchUserProfile(accessToken) {
  if (accessToken.startsWith("mock_gh_token")) {
    return {
      id: "998877",
      login: "kkwagh-coder",
      name: "KKWagh Dev",
      html_url: "https://github.com/kkwagh-coder",
      public_repos: 12
    };
  }

  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "TeamForge-KKWagh"
    }
  });

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
  if (accessToken.startsWith("mock_gh_token")) {
    return [
      {
        name: "CampusConnect",
        html_url: "https://github.com/kkwagh-coder/CampusConnect",
        description: "Campus social and events platform",
        stargazers_count: 5,
        language: "JavaScript",
        updated_at: new Date().toISOString()
      },
      {
        name: "ML-Disease-Prediction",
        html_url: "https://github.com/kkwagh-coder/ML-Disease-Prediction",
        description: "Machine learning model for healthcare prediction",
        stargazers_count: 8,
        language: "Python",
        updated_at: new Date().toISOString()
      },
      {
        name: "SmartAttendance",
        html_url: "https://github.com/kkwagh-coder/SmartAttendance",
        description: "Attendance management system using OpenCV",
        stargazers_count: 3,
        language: "Python",
        updated_at: new Date().toISOString()
      }
    ];
  }

  const res = await fetch(`${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "TeamForge-KKWagh"
    }
  });

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
  repos.forEach(repo => {
    if (repo.language && typeof repo.language === 'string') {
      const lang = repo.language.trim();
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    }
  });

  return Object.keys(languageCounts).sort((a, b) => languageCounts[b] - languageCounts[a]);
}

/**
 * Estimates total commits authored by the user
 */
async function fetchUserCommitCount(accessToken, username) {
  if (accessToken.startsWith("mock_gh_token")) {
    return 142; // Simulated commit count
  }

  try {
    const res = await fetch(`${GITHUB_API_BASE}/search/commits?q=author:${username}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.cloak-preview+json",
        "User-Agent": "TeamForge-KKWagh"
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (typeof data.total_count === "number") {
        return data.total_count;
      }
    }
  } catch (err) {
    console.warn("Could not fetch commit search count:", err.message);
  }

  // Fallback: estimate from recent user events
  try {
    const eventsRes = await fetch(`${GITHUB_API_BASE}/users/${username}/events/public?per_page=100`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "TeamForge-KKWagh"
      }
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
    console.warn("Could not fetch user events:", err.message);
  }

  return 25; // Sensible baseline fallback
}

/**
 * Syncs and caches GitHub data on user document
 * Checks 24-hour cache freshness and handles rate limit backoff.
 */
async function syncUserGithubData(user, force = false) {
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

  if (!user.githubAccessToken) {
    throw new Error("No GitHub access token found for user.");
  }

  try {
    const profile = await fetchUserProfile(user.githubAccessToken);
    const repos = await fetchUserRepos(user.githubAccessToken, profile.login);
    const languages = extractLanguages(repos);
    const totalCommits = await fetchUserCommitCount(user.githubAccessToken, profile.login);

    const topRepos = repos.slice(0, 5).map(r => ({
      name: r.name || "",
      html_url: r.html_url || "",
      description: r.description || "",
      stargazers_count: r.stargazers_count || 0,
      language: r.language || "",
      updated_at: r.updated_at ? new Date(r.updated_at).toLocaleDateString() : ""
    }));

    user.isGithubVerified = true;
    user.githubId = String(profile.id || "");
    user.githubUsername = profile.login || "";
    user.github = profile.login || user.github;

    user.githubData = {
      reposCount: repos.length || profile.public_repos || 0,
      totalCommits: totalCommits,
      languages: languages,
      topRepos: topRepos,
      cachedAt: now,
      rateLimitedUntil: null
    };

    await user.save();

    return {
      cached: false,
      rateLimited: false,
      data: user.githubData
    };
  } catch (err) {
    if (err.rateLimitedUntil) {
      user.githubData = user.githubData || {};
      user.githubData.rateLimitedUntil = err.rateLimitedUntil;
      await user.save();
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
  checkRateLimit
};
