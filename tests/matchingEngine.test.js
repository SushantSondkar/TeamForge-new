const assert = require("assert");
const {
  MATCH_CONFIG,
  calculateSkillTerm,
  calculateCredibilityTerm,
  calculateReputationTerm,
  calculateAvailabilityTerm,
  calculateRecencyTerm,
  calculateMatchScore
} = require("../utils/matchScore");

console.log("=================================================");
console.log("RUNNING TEAMFORGE MATCHING ENGINE UNIT TESTS");
console.log("=================================================\n");

// -------------------------------------------------------------
// Test 1: Configuration Weights
// -------------------------------------------------------------
console.log("1. Testing Configuration Weights...");
const weightSum =
  MATCH_CONFIG.weights.skill +
  MATCH_CONFIG.weights.credibility +
  MATCH_CONFIG.weights.reputation +
  MATCH_CONFIG.weights.availability +
  MATCH_CONFIG.weights.recency;
assert.strictEqual(Math.round(weightSum * 100) / 100, 1.0, "Weights must sum to 1.0");
assert.strictEqual(MATCH_CONFIG.weights.skill, 0.40);
assert.strictEqual(MATCH_CONFIG.weights.credibility, 0.25);
assert.strictEqual(MATCH_CONFIG.weights.reputation, 0.20);
assert.strictEqual(MATCH_CONFIG.weights.availability, 0.10);
assert.strictEqual(MATCH_CONFIG.weights.recency, 0.05);
assert.strictEqual(MATCH_CONFIG.minRequiredSkillCoverage, 0.50);
console.log("   ✓ MATCH_CONFIG weights and constants verified.\n");

// -------------------------------------------------------------
// Test 2: Term S (Skills Match & >= 50% Coverage Threshold)
// -------------------------------------------------------------
console.log("2. Testing Term S (Skills)...");
const testRole = {
  title: "Frontend Lead",
  proficiency: "Intermediate", // target = 3
  requiredSkills: ["React", "JavaScript", "HTML", "CSS"],
  preferredSkills: ["TypeScript", "Tailwind"]
};

// Candidate A: possesses 4 of 4 required at target (level 3/3 = 1) + both preferred (+0.10) => capped at 1.0
const candA = {
  skills: [
    { name: "React", level: 3 },
    { name: "JavaScript", level: 3 },
    { name: "HTML", level: 3 },
    { name: "CSS", level: 3 },
    { name: "TypeScript", level: 3 },
    { name: "Tailwind", level: 3 }
  ]
};
const skillA = calculateSkillTerm(candA, testRole);
assert.strictEqual(skillA.qualifies, true, "Should qualify with 100% coverage");
assert.strictEqual(skillA.coverageRatio, 1.0);
assert.strictEqual(skillA.reqAverage, 1.0);
assert.strictEqual(skillA.S, 1.0, "S must cap at 1.0");

// Candidate B: possesses 2 of 4 required (50% coverage threshold)
// React (level 2 / 3 = 0.6667), JS (level 3 / 3 = 1.0), missing HTML (0), CSS (0)
// reqAverage = (2/3 + 3/3 + 0 + 0) / 4 = 1.6667 / 4 = 0.416667
const candB = {
  skills: [
    { name: "React", level: 2 },
    { name: "JavaScript", level: 3 }
  ]
};
const skillB = calculateSkillTerm(candB, testRole);
assert.strictEqual(skillB.qualifies, true, "50% coverage should pass the threshold");
assert.strictEqual(skillB.coverageRatio, 0.5);
assert(Math.abs(skillB.reqAverage - 0.4167) < 0.01);
assert.strictEqual(skillB.preferredBonus, 0);

// Candidate C: possesses only 1 of 4 required skills (25% < 50% threshold) => disqualified
const candC = {
  skills: [
    { name: "React", level: 5 }
  ]
};
const skillC = calculateSkillTerm(candC, testRole);
assert.strictEqual(skillC.qualifies, false, "Candidate with < 50% coverage must not qualify");
assert.strictEqual(skillC.coverageRatio, 0.25);
console.log("   ✓ Term S targets, average, preferred bonus, and 50% coverage threshold verified.\n");

// -------------------------------------------------------------
// Test 3: Term C (Credibility & peerShare)
// -------------------------------------------------------------
console.log("3. Testing Term C (Credibility)...");
// Base = 0.30
const candNoCred = { skills: [] };
const credBase = calculateCredibilityTerm(candNoCred);
assert.strictEqual(credBase.C, 0.30, "Baseline without GitHub or verifiers should be 0.30");

// GitHub verified = 0.30 + 0.40 = 0.70
const candGithubOnly = { githubVerified: true, skills: [] };
const credGithub = calculateCredibilityTerm(candGithubOnly);
assert.strictEqual(credGithub.C, 0.70, "GitHub verified adds 0.40");

// peerShare = min(1, distinctVerifiers / 3)
// 2 skills: skill 1 has 3 verifiers (1.0), skill 2 has 1 verifier (1/3 = 0.3333). peerShare = (1.0 + 0.3333)/2 = 0.6667
// Total C = 0.30 + 0.40 + (0.30 * 0.6667) = 0.70 + 0.20 = 0.90
const candPeer = {
  githubVerified: true,
  skills: [
    { name: "React", distinctVerifiers: 3 },
    { name: "Node.js", distinctVerifiers: 1 }
  ]
};
const credPeer = calculateCredibilityTerm(candPeer);
assert(Math.abs(credPeer.C - 0.90) < 0.01, `Expected C ~ 0.90, got ${credPeer.C}`);
console.log("   ✓ Term C baseline (0.30), GitHub verified (+0.40), and peerShare derived correctly.\n");

// -------------------------------------------------------------
// Test 4: Term R (Reputation: Wins + Reviews + Shortlists)
// -------------------------------------------------------------
console.log("4. Testing Term R (Reputation)...");
// Missing data = neutral 0.5 (W=0.5, Q=0.5, H=0.5 -> R=0.5)
const candEmptyRep = {};
const repNeutral = calculateReputationTerm(candEmptyRep);
assert.strictEqual(repNeutral.W, 0.5, "Missing win data should be neutral 0.5");
assert.strictEqual(repNeutral.Q, 0.5, "Missing review data should be neutral 0.5");
assert.strictEqual(repNeutral.H, 0.5, "Missing shortlist data should be neutral 0.5");
assert.strictEqual(repNeutral.R, 0.5, "Total missing reputation should be 0.5");

// Full reputation with max wins, reviews, shortlists
// W: 1 national win (3 pts) + 1 state win (2 pts) = 5 pts / 5 = 1.0
// Q: 5.0 / 5.0 = 1.0 (reviewCount = 5, teammateRating = 1.0)
// H: 10 shortlists / 10 = 1.0
const candTopRep = {
  pastHackathons: [
    { placement: "National Winner" },
    { placement: "State 1st" }
  ],
  reviewCount: 5,
  teammateRating: 1.0,
  uniqueShortlisters: 10
};
const repTop = calculateReputationTerm(candTopRep);
assert.strictEqual(repTop.W, 1.0);
assert.strictEqual(repTop.Q, 1.0);
assert.strictEqual(repTop.H, 1.0);
assert.strictEqual(repTop.R, 1.0, "Top reputation should be 1.0");
console.log("   ✓ Term R neutral fallback (0.5) and weighted computation verified.\n");

// -------------------------------------------------------------
// Test 5: Term A (Availability)
// -------------------------------------------------------------
console.log("5. Testing Term A (Availability)...");
assert.strictEqual(calculateAvailabilityTerm({ availability: 1.0 }).A, 1.0);
assert.strictEqual(calculateAvailabilityTerm({ availability: "free" }).A, 1.0);
assert.strictEqual(calculateAvailabilityTerm({ availability: 0.5 }).A, 0.5);
assert.strictEqual(calculateAvailabilityTerm({ availability: "partly free" }).A, 0.5);
assert.strictEqual(calculateAvailabilityTerm({ availability: 0.0 }).A, 0.0);
assert.strictEqual(calculateAvailabilityTerm({ availability: "busy" }).A, 0.0);
console.log("   ✓ Term A availability scales (1.0, 0.5, 0.0) verified.\n");

// -------------------------------------------------------------
// Test 6: Term T (Recency / Activity)
// -------------------------------------------------------------
console.log("6. Testing Term T (Recency)...");
const now = Date.now();
const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000);
const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);
const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000);

assert.strictEqual(calculateRecencyTerm({ lastActive: oneDayAgo }).T, 1.0, "<= 7 days must be 1.0");
assert.strictEqual(calculateRecencyTerm({ lastActive: tenDaysAgo }).T, 0.6, "<= 30 days must be 0.6");
assert.strictEqual(calculateRecencyTerm({ lastActive: fortyDaysAgo }).T, 0.2, "> 30 days must be 0.2");
console.log("   ✓ Term T recency tiers (1.0, 0.6, 0.2) verified.\n");

// -------------------------------------------------------------
// Test 7: Overall MatchScore & Breakdown
// -------------------------------------------------------------
console.log("7. Testing MatchScore Formula & Breakdown...");
// Ideal Candidate: S=1.0, C=1.0, R=1.0, A=1.0, T=1.0
// MatchScore = round(100 * (0.40 + 0.25 + 0.20 + 0.10 + 0.05)) = 100
const perfectCandidate = {
  name: "Perfect Match",
  githubVerified: true,
  skills: [
    { name: "React", level: 5, distinctVerifiers: 3 },
    { name: "JavaScript", level: 5, distinctVerifiers: 3 },
    { name: "HTML", level: 5, distinctVerifiers: 3 },
    { name: "CSS", level: 5, distinctVerifiers: 3 }
  ],
  pastHackathons: [{ placement: "National 1st Place" }, { placement: "State 1st Place" }],
  reviewCount: 5,
  teammateRating: 1.0,
  uniqueShortlisters: 10,
  availability: 1.0,
  lastActive: oneDayAgo
};
const resPerfect = calculateMatchScore(perfectCandidate, testRole);
assert.strictEqual(resPerfect.qualifies, true);
assert.strictEqual(resPerfect.score, 100);
assert.strictEqual(resPerfect.breakdown.S, 1.0);
assert.strictEqual(resPerfect.breakdown.C, 1.0);
assert.strictEqual(resPerfect.breakdown.R, 1.0);
assert.strictEqual(resPerfect.breakdown.A, 1.0);
assert.strictEqual(resPerfect.breakdown.T, 1.0);
console.log("   ✓ Perfect candidate match score = 100 with accurate breakdown.\n");

// -------------------------------------------------------------
// Test 8: Multi-Tier Tie-Breaking Order
// Sort: score -> raw R -> lastActive -> profile completeness -> name
// -------------------------------------------------------------
console.log("8. Testing Multi-Tier Tie-Breaking Order...");
const roleSimple = {
  title: "Node Developer",
  proficiency: "Intermediate",
  requiredSkills: ["Node.js"]
};

// Create 4 candidates with identical match scores but differing tie-breaker values
const candidateList = [
  // Cand 1: Tie-breaker win on Name (Zack)
  {
    name: "Zack",
    skills: [{ name: "Node.js", level: 3 }],
    competitionWins: 0,
    reviewCount: 0, // neutral R = 0.5
    lastActive: oneDayAgo,
    completenessPercentage: 80
  },
  // Cand 2: Tie-breaker win on Profile Completeness (95%)
  {
    name: "Alice",
    skills: [{ name: "Node.js", level: 3 }],
    competitionWins: 0,
    reviewCount: 0, // neutral R = 0.5
    lastActive: oneDayAgo,
    completenessPercentage: 95
  },
  // Cand 3: Tie-breaker win on Raw R (R = 0.7 vs 0.5)
  {
    name: "Bob",
    skills: [{ name: "Node.js", level: 3 }],
    pastHackathons: [{ placement: "National Winner" }, { placement: "National Winner" }],
    reviewCount: 5,
    teammateRating: 1.0,
    uniqueShortlisters: 8,
    lastActive: fortyDaysAgo, // Older activity, but higher R should take priority!
    completenessPercentage: 50
  },
  // Cand 4: Tie-breaker win on lastActive (more recent than Cand 5)
  {
    name: "Charlie",
    skills: [{ name: "Node.js", level: 3 }],
    competitionWins: 0,
    reviewCount: 0,
    lastActive: new Date(now - 2 * 60 * 60 * 1000), // 2 hours ago
    completenessPercentage: 60
  }
];

const scored = candidateList.map(cand => ({
  user: cand,
  ...calculateMatchScore(cand, roleSimple)
}));

// Apply the specified tie-break comparator
scored.sort((a, b) => {
  // 1. Score
  if (b.score !== a.score) return b.score - a.score;
  // 2. Raw R
  const rawRA = a.breakdown.rawR || 0;
  const rawRB = b.breakdown.rawR || 0;
  if (rawRB !== rawRA) return rawRB - rawRA;
  // 3. lastActive
  const timeA = new Date(a.user.lastActive).getTime();
  const timeB = new Date(b.user.lastActive).getTime();
  if (timeB !== timeA) return timeB - timeA;
  // 4. Completeness
  const compA = a.user.completenessPercentage || 0;
  const compB = b.user.completenessPercentage || 0;
  if (compB !== compA) return compB - compA;
  // 5. Name
  return a.user.name.localeCompare(b.user.name);
});

// Bob has higher raw R, so Bob must be prioritized over other identical-score candidates
assert.strictEqual(scored[0].user.name, "Bob", "Bob should rank first due to higher raw R");

// Candidate with higher lastActive recency (Charlie, 2h ago) beats older lastActive
assert.strictEqual(scored[1].user.name, "Charlie", "Charlie should rank second due to higher lastActive recency");

// Alice beats Zack on profile completeness (95% > 80%) when score, R, and lastActive tie
assert.strictEqual(scored[2].user.name, "Alice", "Alice should rank before Zack due to profile completeness");
assert.strictEqual(scored[3].user.name, "Zack", "Zack ranks fourth");

console.log("   ✓ Tie-breaking hierarchy (Score -> Raw R -> lastActive -> Completeness -> Name) verified successfully.\n");

console.log("=================================================");
console.log("ALL 8 MATCHING ENGINE UNIT TESTS PASSED (100%)");
console.log("=================================================");
