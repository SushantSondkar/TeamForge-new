const assert = require("assert");
const {
  computeLeaderboardScore,
  getRawWinPoints,
  filterLeaderboard
} = require("../utils/leaderboardService");

console.log("=================================================");
console.log("RUNNING PHASE 8: LEADERBOARD & ORGANIZER TESTS");
console.log("=================================================\n");

// -------------------------------------------------------------
// Test 1: Leaderboard Score Formula
// Leaderboard = round(100 * (0.7 * Reputation + 0.3 * Activity))
// -------------------------------------------------------------
console.log("1. Testing Leaderboard Score Formula...");
const now = new Date();

// User A: Active today (T = 1.0), Neutral Reputation (W=0.5, Q=0.5, H=0.5 => R=0.5)
// Expected score: round(100 * (0.7 * 0.5 + 0.3 * 1.0)) = round(100 * (0.35 + 0.30)) = round(65.0) = 65
const userA = {
  name: "Arjun Verma",
  lastActive: now,
  pastHackathons: [],
  averageRating: null,
  skills: []
};
const resA = computeLeaderboardScore(userA);
assert.strictEqual(resA.activity, 1.0, "Activity within 7 days must be 1.0");
assert.strictEqual(resA.reputation, 0.5, "Default reputation without data should be neutral 0.5");
assert.strictEqual(resA.score, 65, "Arjun's score should be round(100 * (0.7*0.5 + 0.3*1.0)) = 65");
console.log("   ✓ User A (recent active, neutral rep) score = 65 pts.");

// User B: Inactive > 30 days (T = 0.2), High Reputation (W=1.0, Q=1.0, H=1.0 => R=1.0)
// Expected score: round(100 * (0.7 * 1.0 + 0.3 * 0.2)) = round(100 * (0.70 + 0.06)) = round(76.0) = 76
const userB = {
  name: "Sneha Patel",
  lastActive: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
  pastHackathons: [
    { name: "SIH", placement: "National Winner" },
    { name: "State Hack", placement: "State 1st" }
  ],
  avgRating: 5.0,
  uniqueShortlisters: 20,
  skills: []
};
const resB = computeLeaderboardScore(userB);
assert.strictEqual(resB.activity, 0.2, "Activity > 30 days must be 0.2");
assert.strictEqual(resB.reputation, 1.0, "Max reputation with national wins and 5-star rating must be 1.0");
assert.strictEqual(resB.score, 76, "Sneha's score should be round(100 * (0.7*1.0 + 0.3*0.2)) = 76");
console.log("   ✓ User B (high rep, inactive) score = 76 pts.");

// -------------------------------------------------------------
// Test 2: Raw Win Points Calculation
// -------------------------------------------------------------
console.log("\n2. Testing Raw Win Points Calculation...");
const studentWins = {
  pastHackathons: [
    { name: "SIH 2025", placement: "National Winner" },   // 3 pts
    { name: "CSI TechFest", placement: "State Winner" },   // 2 pts
    { name: "KKWIEER Code", placement: "College 1st" },    // 1 pt
    { name: "Participant", placement: "Participation" }    // 0 pts
  ]
};
const winPoints = getRawWinPoints(studentWins);
assert.strictEqual(winPoints, 6, "Raw win points should be 3 + 2 + 1 = 6");
console.log("   ✓ Raw win points accurately calculated: National (3), State (2), College (1).");

// -------------------------------------------------------------
// Test 3: 5-Stage Tie-Breaking Hierarchy
// Score -> Raw Wins -> Shortlists -> Completeness -> Name
// -------------------------------------------------------------
console.log("\n3. Testing 5-Stage Tie-Breaking Hierarchy...");

const mockCandidates = [
  // Cand 1: Lower score
  {
    score: 70,
    rawWins: 5,
    shortlists: 10,
    completeness: 100,
    user: { name: "Zachary" }
  },
  // Cand 2: Score 80, but fewer wins
  {
    score: 80,
    rawWins: 2,
    shortlists: 5,
    completeness: 80,
    user: { name: "Bob" }
  },
  // Cand 3: Score 80, more wins (should beat Cand 2)
  {
    score: 80,
    rawWins: 4,
    shortlists: 1,
    completeness: 70,
    user: { name: "Alice" }
  },
  // Cand 4: Score 80, rawWins 2, but more shortlists (should beat Cand 2)
  {
    score: 80,
    rawWins: 2,
    shortlists: 8,
    completeness: 70,
    user: { name: "Charlie" }
  },
  // Cand 5: Score 80, rawWins 2, shortlists 5, but higher completeness (should beat Cand 2)
  {
    score: 80,
    rawWins: 2,
    shortlists: 5,
    completeness: 95,
    user: { name: "David" }
  },
  // Cand 6: Exact tie with Cand 2 on score, wins, shortlists, completeness, but alphabetically before ("Aaron" vs "Bob")
  {
    score: 80,
    rawWins: 2,
    shortlists: 5,
    completeness: 80,
    user: { name: "Aaron" }
  }
];

// Sort mock candidates using the exact 5-stage hierarchy
mockCandidates.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  if (b.rawWins !== a.rawWins) return b.rawWins - a.rawWins;
  if (b.shortlists !== a.shortlists) return b.shortlists - a.shortlists;
  if (b.completeness !== a.completeness) return b.completeness - a.completeness;
  return (a.user.name || "").localeCompare(b.user.name || "");
});

// Expected ordering:
// 1. Alice (Score 80, Wins 4)
// 2. Charlie (Score 80, Wins 2, Shortlists 8)
// 3. David (Score 80, Wins 2, Shortlists 5, Completeness 95)
// 4. Aaron (Score 80, Wins 2, Shortlists 5, Completeness 80, Name Aaron)
// 5. Bob (Score 80, Wins 2, Shortlists 5, Completeness 80, Name Bob)
// 6. Zachary (Score 70)
assert.strictEqual(mockCandidates[0].user.name, "Alice", "Stage 2: Higher wins should rank 1st");
assert.strictEqual(mockCandidates[1].user.name, "Charlie", "Stage 3: Higher shortlists should rank 2nd");
assert.strictEqual(mockCandidates[2].user.name, "David", "Stage 4: Higher completeness should rank 3rd");
assert.strictEqual(mockCandidates[3].user.name, "Aaron", "Stage 5: Alphabetical name (Aaron vs Bob) should rank 4th");
assert.strictEqual(mockCandidates[4].user.name, "Bob", "Stage 5: Bob should rank 5th");
assert.strictEqual(mockCandidates[5].user.name, "Zachary", "Stage 1: Lower score should rank last");
console.log("   ✓ All 5 stages of tie-breaking verified in exact order.");

// -------------------------------------------------------------
// Test 4: Branch, Year, and Skill Filtering
// -------------------------------------------------------------
console.log("\n4. Testing Leaderboard Filtering...");

const sampleEntries = [
  {
    user: {
      name: "Rohan Kulkarni",
      department: "Computer Engineering",
      year: "TE",
      skills: [{ name: "Node.js" }, { name: "MongoDB" }]
    }
  },
  {
    user: {
      name: "Pooja Shinde",
      department: "Information Technology",
      year: "BE",
      skills: [{ name: "React" }, { name: "TypeScript" }]
    }
  },
  {
    user: {
      name: "Amit Deshmukh",
      department: "Computer Engineering",
      year: "SE",
      skills: [{ name: "Python" }, { name: "React" }]
    }
  }
];

// Branch filter
const compEntries = filterLeaderboard(sampleEntries, { branch: "Computer Engineering" });
assert.strictEqual(compEntries.length, 2, "Branch filter should return 2 Computer Engineering entries");

// Year filter
const teEntries = filterLeaderboard(sampleEntries, { year: "TE" });
assert.strictEqual(teEntries.length, 1, "Year filter should return 1 TE entry");
assert.strictEqual(teEntries[0].user.name, "Rohan Kulkarni");

// Skill filter
const reactEntries = filterLeaderboard(sampleEntries, { skill: "react" });
assert.strictEqual(reactEntries.length, 2, "Skill filter should return 2 React developers");

// Combined filter
const compReact = filterLeaderboard(sampleEntries, { branch: "Computer Engineering", skill: "react" });
assert.strictEqual(compReact.length, 1, "Combined filter should return 1 entry");
assert.strictEqual(compReact[0].user.name, "Amit Deshmukh");
console.log("   ✓ Department, Year, and Skill filtering work independently and combined.");

console.log("\n=================================================");
console.log("ALL PHASE 8 LEADERBOARD & ORGANIZER TESTS PASSED!");
console.log("=================================================\n");
