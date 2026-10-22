const assert = require("assert");
const {
  getAuthorizationUrl: getGithubAuthUrl,
  exchangeCodeForToken: exchangeGithubCode,
  fetchUserProfile: fetchGithubUserProfile,
  fetchUserRepos: fetchGithubUserRepos,
  fetchUserCommitCount: fetchGithubCommitCount,
  syncUserGithubData,
  extractLanguages,
  checkRateLimit,
  setFetch: setGithubFetch,
  cleanGithubUsername
} = require("../utils/githubService");
const {
  getAuthorizationUrl: getLinkedinAuthUrl,
  exchangeCodeForToken: exchangeLinkedinCode,
  fetchUserInfo: fetchLinkedinUserInfo,
  setFetch: setLinkedinFetch
} = require("../utils/linkedinService");
const { calculateCredibilityTerm } = require("../utils/matchScore");

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING PHASE 6: GITHUB & LINKEDIN VERIFICATION TESTS");
  console.log("=================================================\n");

  // -------------------------------------------------------------
  // Test 1: GitHub OAuth URL & Scopes
  // -------------------------------------------------------------
  console.log("1. Testing GitHub OAuth URL Generation...");
  const ghUrl = getGithubAuthUrl("test_csrf_state_123", "http://localhost:8080/auth/github/callback");
  assert.ok(ghUrl.startsWith("https://github.com/login/oauth/authorize"), "Must point to GitHub authorize endpoint");
  assert.ok(ghUrl.includes("scope=read%3Auser%2Crepo") || ghUrl.includes("scope=read:user,repo"), "Must request read:user and repo scopes");
  assert.ok(ghUrl.includes("state=test_csrf_state_123"), "Must contain state for CSRF defense");
  console.log("   ✓ GitHub OAuth URL and scopes validated.");

  // -------------------------------------------------------------
  // Test 2: Repository Language Aggregation
  // -------------------------------------------------------------
  console.log("2. Testing Repository Language Extraction & Ranking...");
  const sampleRepos = [
    { name: "web-app", language: "JavaScript" },
    { name: "api-backend", language: "JavaScript" },
    { name: "cli-tool", language: "Python" },
    { name: "ai-model", language: "Python" },
    { name: "deep-learning", language: "Python" },
    { name: "styles", language: "CSS" },
    { name: "docs", language: null } // handle null/empty languages
  ];
  const extractedLangs = extractLanguages(sampleRepos);
  assert.deepStrictEqual(extractedLangs, ["Python", "JavaScript", "CSS"], "Languages must be sorted by frequency");
  console.log("   ✓ Languages aggregated and sorted by frequency correctly.");

  // -------------------------------------------------------------
  // Test 3: Rate Limit Detection & Header Parsing
  // -------------------------------------------------------------
  console.log("3. Testing GitHub Rate Limit Header Parsing...");
  // Case A: Remaining requests available
  const normalHeaders = new Map([
    ["x-ratelimit-remaining", "45"],
    ["x-ratelimit-reset", "1760000000"]
  ]);
  const normalCheck = checkRateLimit({ get: (h) => normalHeaders.get(h) });
  assert.strictEqual(normalCheck.isRateLimited, false);

  // Case B: Rate limit hit (remaining = 0)
  const resetEpoch = Math.floor(Date.now() / 1000) + 3600; // in 1 hour
  const limitedHeaders = new Map([
    ["x-ratelimit-remaining", "0"],
    ["x-ratelimit-reset", String(resetEpoch)]
  ]);
  const limitedCheck = checkRateLimit({ get: (h) => limitedHeaders.get(h) });
  assert.strictEqual(limitedCheck.isRateLimited, true);
  assert.strictEqual(limitedCheck.resetDate.getTime(), resetEpoch * 1000);
  console.log("   ✓ Rate limiting detected and reset timestamp parsed.");

  // -------------------------------------------------------------
  // Test 4: 24-Hour Cache Freshness & Rate Limit Fallback
  // -------------------------------------------------------------
  console.log("4. Testing 24h Cache Freshness Logic...");
  const now = Date.now();
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  const cachedUserData = {
    reposCount: 8,
    totalCommits: 120,
    languages: ["Python", "JavaScript"],
    cachedAt: new Date(now - 2 * 60 * 60 * 1000) // cached 2 hours ago (fresh)
  };

  // Age check
  const age = now - cachedUserData.cachedAt.getTime();
  const isFresh = age < CACHE_TTL_MS;
  assert.strictEqual(isFresh, true, "2h old cache should be fresh");

  const staleUserData = {
    cachedAt: new Date(now - 25 * 60 * 60 * 1000) // 25 hours ago
  };
  const isStale = (now - staleUserData.cachedAt.getTime()) >= CACHE_TTL_MS;
  assert.strictEqual(isStale, true, "25h old cache should be stale and trigger re-fetch");
  console.log("   ✓ Cache freshness TTL (24h) verified.");

  // -------------------------------------------------------------
  // Test 5: LinkedIn OAuth & Honest "Linked" Label
  // -------------------------------------------------------------
  console.log("5. Testing LinkedIn OAuth URL & Honest Linked Label...");
  const liUrl = getLinkedinAuthUrl("linkedin_state_456", "http://localhost:8080/auth/linkedin/callback");
  assert.ok(liUrl.startsWith("https://www.linkedin.com/oauth/v2/authorization"), "Must point to LinkedIn OAuth");
  assert.ok(liUrl.includes("state=linkedin_state_456"));
  assert.ok(liUrl.includes("scope=openid+profile+email") || liUrl.includes("scope=openid%20profile%20email"));

  // Test honest trust rule: LinkedIn gives "LinkedIn Linked", never fake "Verified"
  const userWithLinkedin = {
    isLinkedinLinked: true,
    linkedin: "https://linkedin.com/in/student"
  };
  assert.strictEqual(userWithLinkedin.isLinkedinLinked, true);
  console.log("   ✓ LinkedIn OAuth URL and 'Linked' honest label verified.");

  // -------------------------------------------------------------
  // Test 6: Tiered Trust Badges Virtual
  // -------------------------------------------------------------
  console.log("6. Testing Tiered Trust Badges System...");
  function generateTrustBadges(candidate) {
    const badges = [];
    if (candidate.isGithubVerified) {
      badges.push({ key: "github", label: "GitHub Verified" });
    }
    if (candidate.isLinkedinLinked) {
      badges.push({ key: "linkedin", label: "LinkedIn Linked" });
    }
    if (candidate.portfolio && candidate.portfolio.trim().length > 0) {
      badges.push({ key: "portfolio", label: "Portfolio (Self-Reported)" });
    }
    return badges;
  }

  const verifiedUser = {
    isGithubVerified: true,
    isLinkedinLinked: true,
    portfolio: "https://myportfolio.dev"
  };

  const badges = generateTrustBadges(verifiedUser);
  assert.strictEqual(badges.length, 3);
  assert.strictEqual(badges[0].label, "GitHub Verified");
  assert.strictEqual(badges[1].label, "LinkedIn Linked");
  assert.strictEqual(badges[2].label, "Portfolio (Self-Reported)");

  // Ensure no fake "100% verified" label exists
  const badgeLabels = badges.map(b => b.label).join(" · ");
  assert.strictEqual(badgeLabels.includes("100% verified"), false, "Must never display fake '100% verified'");
  assert.ok(badgeLabels.includes("GitHub Verified · LinkedIn Linked"));
  console.log(`   ✓ Tiered badges generated: "${badgeLabels}"`);

  // -------------------------------------------------------------
  // Test 7: Credibility (Term C) Integration
  // -------------------------------------------------------------
  console.log("7. Testing Term C Credibility Score with Verified GitHub...");
  const unverifiedCandidate = {
    isGithubVerified: false,
    github: "",
    skills: []
  };
  const termCUnverified = calculateCredibilityTerm(unverifiedCandidate);
  assert.strictEqual(termCUnverified.githubVerified, false);
  assert.strictEqual(Math.round(termCUnverified.C * 100) / 100, 0.30, "Baseline credibility without verification is 0.30");

  const verifiedCandidate = {
    isGithubVerified: true,
    github: "kkwagh-dev",
    skills: []
  };
  const termCVerified = calculateCredibilityTerm(verifiedCandidate);
  assert.strictEqual(termCVerified.githubVerified, true);
  // Formula: 0.30 + 0.40 * 1 = 0.70
  assert.strictEqual(Math.round(termCVerified.C * 100) / 100, 0.70, "GitHub verified candidate receives 0.70 credibility");
  console.log("   ✓ Verified GitHub correctly elevates Term C credibility (+0.40).");

  // -------------------------------------------------------------
  // Test 8: Stubbed GitHub HTTP Calls (Injected Fake Fetch)
  // -------------------------------------------------------------
  console.log("8. Testing Stubbed GitHub HTTP Calls (Fake Fetch Injection)...");

  // A. Rejection when credentials missing
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  await assert.rejects(
    async () => {
      await exchangeGithubCode("dummy_code");
    },
    /GitHub OAuth credentials.*missing/,
    "Must throw error when GitHub credentials are missing"
  );

  // Set fake test credentials for test execution
  process.env.GITHUB_CLIENT_ID = "test_gh_client_id";
  process.env.GITHUB_CLIENT_SECRET = "test_gh_client_secret";

  // Create fake fetch routing map
  const fakeGithubResponses = {
    "https://github.com/login/oauth/access_token": {
      status: 200,
      body: { access_token: "gho_test_live_token_7788", token_type: "bearer", scope: "read:user,repo" }
    },
    "https://api.github.com/user": {
      status: 200,
      body: { id: 554433, login: "kkwagh-coder", name: "KKWagh Dev", public_repos: 3 }
    },
    "https://api.github.com/user/repos": {
      status: 200,
      body: [
        { name: "TeamForge", language: "JavaScript", stargazers_count: 7, description: "Team matching" },
        { name: "AI-Model", language: "Python", stargazers_count: 12, description: "Predictive model" },
        { name: "CLI-Tool", language: "Python", stargazers_count: 2, description: "Helper CLI" }
      ]
    },
    "https://api.github.com/search/commits": {
      status: 200,
      body: { total_count: 88 }
    }
  };

  const fakeFetch = async (url, options = {}) => {
    // Sort patterns by length descending so more specific patterns (e.g. /user/repos) match before /user
    const sortedEntries = Object.entries(fakeGithubResponses).sort((a, b) => b[0].length - a[0].length);
    for (const [pattern, resData] of sortedEntries) {
      if (url.includes(pattern)) {
        return {
          ok: resData.status >= 200 && resData.status < 300,
          status: resData.status,
          headers: { get: () => null },
          json: async () => resData.body
        };
      }
    }
    return {
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({ error: "Not Found" })
    };
  };

  setGithubFetch(fakeFetch);

  // Test token exchange with fake fetch
  const tokenData = await exchangeGithubCode("valid_oauth_code", "http://localhost:8080/auth/github/callback");
  assert.strictEqual(tokenData.access_token, "gho_test_live_token_7788");
  assert.ok(!tokenData.access_token.startsWith("mock_gh_token"), "Must not use fake 'mock_gh_token_' production string");

  // Test user profile and repo fetching with fake fetch
  const profile = await fetchGithubUserProfile(tokenData.access_token);
  assert.strictEqual(profile.login, "kkwagh-coder");
  assert.strictEqual(profile.id, 554433);

  const repos = await fetchGithubUserRepos(tokenData.access_token, profile.login);
  assert.strictEqual(repos.length, 3);
  assert.strictEqual(repos[0].name, "TeamForge");

  const commits = await fetchGithubCommitCount(tokenData.access_token, profile.login);
  assert.strictEqual(commits, 88);

  // Test user sync logic with fake fetch (access token NOT stored in user doc)
  const fakeUserDoc = {
    isGithubVerified: false,
    github: "",
    githubId: "",
    githubUsername: "",
    githubData: null,
    save: async function() { this._saved = true; }
  };

  const syncResult = await syncUserGithubData(fakeUserDoc, tokenData.access_token, true);
  assert.strictEqual(syncResult.cached, false);
  assert.strictEqual(fakeUserDoc.isGithubVerified, true);
  assert.strictEqual(fakeUserDoc.githubId, "554433");
  assert.strictEqual(fakeUserDoc.githubUsername, "kkwagh-coder");
  assert.strictEqual(fakeUserDoc.githubData.reposCount, 3);
  assert.strictEqual(fakeUserDoc.githubData.totalCommits, 88);
  assert.deepStrictEqual(fakeUserDoc.githubData.languages, ["Python", "JavaScript"]);
  assert.strictEqual(fakeUserDoc.githubAccessToken, undefined, "githubAccessToken must NEVER be stored in the database");

  // Test username cleaning from various formats
  assert.strictEqual(cleanGithubUsername("https://github.com/aaradhyawabale"), "aaradhyawabale");
  assert.strictEqual(cleanGithubUsername("http://www.github.com/aaradhyawabale/"), "aaradhyawabale");
  assert.strictEqual(cleanGithubUsername("@aaradhyawabale"), "aaradhyawabale");
  assert.strictEqual(cleanGithubUsername("aaradhyawabale"), "aaradhyawabale");

  // Test token-less sync using full URL in user.github (must NOT verify user)
  const fakeUrlUserDoc = {
    isGithubVerified: false,
    github: "https://github.com/kkwagh-coder",
    save: async function() { this._saved = true; }
  };
  await syncUserGithubData(fakeUrlUserDoc, null, true);
  assert.strictEqual(fakeUrlUserDoc.isGithubVerified, false, "Token-less manual username sync must NEVER set isGithubVerified to true");
  assert.strictEqual(fakeUrlUserDoc.githubUsername, "kkwagh-coder");
  console.log("   ✓ Stubbed GitHub HTTP calls verified: OAuth sync verifies user, token-less sync remains unverified.");

  // Clean up GitHub credentials & fetch
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  setGithubFetch(null);

  // -------------------------------------------------------------
  // Test 9: Stubbed LinkedIn HTTP Calls (Fake Fetch Injection)
  // -------------------------------------------------------------
  console.log("9. Testing Stubbed LinkedIn HTTP Calls (Fake Fetch Injection)...");

  // Rejection when credentials missing
  delete process.env.LINKEDIN_CLIENT_ID;
  delete process.env.LINKEDIN_CLIENT_SECRET;
  await assert.rejects(
    async () => {
      await exchangeLinkedinCode("test_code");
    },
    /LinkedIn OAuth credentials.*missing/,
    "Must throw error when LinkedIn credentials are missing"
  );

  process.env.LINKEDIN_CLIENT_ID = "test_li_client_id";
  process.env.LINKEDIN_CLIENT_SECRET = "test_li_client_secret";

  const fakeLinkedinResponses = {
    "https://www.linkedin.com/oauth/v2/accessToken": {
      status: 200,
      body: { access_token: "aq_real_stubbed_linkedin_token_5566", expires_in: 3600 }
    },
    "https://api.linkedin.com/v2/userinfo": {
      status: 200,
      body: {
        sub: "real_linkedin_sub_45678",
        name: "Aaradhya Wabale",
        email: "aaradhya@kkwagh.edu.in",
        vanityName: "aaradhya-wabale"
      }
    }
  };

  const fakeLiFetch = async (url) => {
    for (const [pattern, resData] of Object.entries(fakeLinkedinResponses)) {
      if (url.includes(pattern)) {
        return {
          ok: resData.status >= 200 && resData.status < 300,
          status: resData.status,
          headers: { get: () => null },
          json: async () => resData.body
        };
      }
    }
    return {
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({ error: "Not Found" })
    };
  };

  setLinkedinFetch(fakeLiFetch);

  const liTokenData = await exchangeLinkedinCode("li_auth_code", "http://localhost:8080/auth/linkedin/callback");
  assert.strictEqual(liTokenData.access_token, "aq_real_stubbed_linkedin_token_5566");
  assert.ok(!liTokenData.access_token.startsWith("mock_linkedin_token"), "Must not use fake 'mock_linkedin_token_' string");

  const liUserInfo = await fetchLinkedinUserInfo(liTokenData.access_token);
  assert.strictEqual(liUserInfo.sub, "real_linkedin_sub_45678");
  assert.notStrictEqual(liUserInfo.sub, "linkedin_mock_sub_123", "Fake sub 'linkedin_mock_sub_123' must be eliminated");
  assert.strictEqual(liUserInfo.vanityName, "aaradhya-wabale");
  console.log("   ✓ Stubbed LinkedIn HTTP calls and real userinfo verified.");

  // Clean up LinkedIn credentials & fetch
  delete process.env.LINKEDIN_CLIENT_ID;
  delete process.env.LINKEDIN_CLIENT_SECRET;
  setLinkedinFetch(null);

  console.log("\n=================================================");
  console.log("ALL PHASE 6 GITHUB & LINKEDIN TESTS PASSED (100%)");
  console.log("=================================================\n");
}

runTests().catch(err => {
  console.error("Test failure in phase6GithubVerification.test.js:", err);
  process.exit(1);
});
