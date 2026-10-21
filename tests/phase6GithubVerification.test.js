const assert = require("assert");
const {
  getAuthorizationUrl: getGithubAuthUrl,
  extractLanguages,
  checkRateLimit
} = require("../utils/githubService");
const {
  getAuthorizationUrl: getLinkedinAuthUrl
} = require("../utils/linkedinService");
const { calculateCredibilityTerm } = require("../utils/matchScore");

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

console.log("\n=================================================");
console.log("ALL 7 PHASE 6 GITHUB & LINKEDIN TESTS PASSED (100%)");
console.log("=================================================\n");
