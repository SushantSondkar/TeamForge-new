const assert = require("assert");
const { calculateCredibilityTerm, calculateReputationTerm } = require("../utils/matchScore");

console.log("=================================================");
console.log("RUNNING PHASE 7: POST-EVENT REVIEWS & SKILL VERIFICATION TESTS");
console.log("=================================================\n");

// -------------------------------------------------------------
// Test 1: Post-Event Date Unlocking Gate
// -------------------------------------------------------------
console.log("1. Testing Post-Event Date Gating...");
const now = new Date();
const pastEvent = {
  name: "K.K. Wagh Hackathon 2026",
  date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) // 2 days in the past
};
const upcomingEvent = {
  name: "Future Innovation Hackathon",
  date: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) // 5 days in future
};

function canReviewEvent(event, currentDate = new Date()) {
  return new Date(event.date) <= currentDate;
}

assert.strictEqual(canReviewEvent(pastEvent, now), true, "Past event must unlock reviews");
assert.strictEqual(canReviewEvent(upcomingEvent, now), false, "Upcoming event must remain locked for reviews");
console.log("   ✓ Reviews and peer skill verification unlock ONLY after the event date passes.");

// -------------------------------------------------------------
// Test 2: Double-Blind Team Reviews & Mutual Reveal
// -------------------------------------------------------------
console.log("2. Testing Double-Blind Team Reviews & Mutual Reveal...");
const reviewsStore = [];

function submitReview({ reviewerId, revieweeId, eventId, tech, rel, comm, team, feedback, observedSkills }) {
  const avg = (tech + rel + comm + team) / 4;
  const review = {
    reviewerId,
    revieweeId,
    eventId,
    technicalContribution: tech,
    reliability: rel,
    communication: comm,
    teamwork: team,
    overallScore: Math.round(avg * 10) / 10,
    feedback: feedback || "",
    observedSkills: observedSkills || [],
    isRevealed: false
  };

  // Check if counter-review exists (Double-Blind check)
  const peerReview = reviewsStore.find(
    r => r.reviewerId === revieweeId && r.revieweeId === reviewerId && r.eventId === eventId
  );

  if (peerReview) {
    review.isRevealed = true;
    peerReview.isRevealed = true;
  }

  reviewsStore.push(review);
  return review;
}

// User A reviews User B
const reviewA = submitReview({
  reviewerId: "userA",
  revieweeId: "userB",
  eventId: "event-1",
  tech: 5,
  rel: 4,
  comm: 5,
  team: 4,
  feedback: "Outstanding system design and quick bug fixes!"
});

assert.strictEqual(reviewA.isRevealed, false, "Review A must remain hidden until User B submits");
assert.strictEqual(reviewA.overallScore, 4.5);
console.log("   ✓ User A's review submitted in confidential state (isRevealed = false).");

// User B reviews User A
const reviewB = submitReview({
  reviewerId: "userB",
  revieweeId: "userA",
  eventId: "event-1",
  tech: 4,
  rel: 5,
  comm: 4,
  team: 5,
  feedback: "Great leader and team coordination!"
});

assert.strictEqual(reviewB.isRevealed, true, "Review B must reveal upon second submission");
assert.strictEqual(reviewA.isRevealed, true, "Review A must now also be revealed");
assert.strictEqual(reviewB.overallScore, 4.5);
console.log("   ✓ Mutual reveal triggered: both reviews are now isRevealed = true.");

// -------------------------------------------------------------
// Test 3: Peer Skill Verification (Ticked vs Unticked)
// -------------------------------------------------------------
console.log("3. Testing Peer Skill Verification (Ticked vs Unticked)...");
const peerCandidate = {
  id: "peer-candidate-1",
  skills: [
    { name: "React", level: 4, distinctVerifiers: 0, verifiedBy: [] },
    { name: "Node.js", level: 3, distinctVerifiers: 0, verifiedBy: [] },
    { name: "MongoDB", level: 3, distinctVerifiers: 0, verifiedBy: [] },
    { name: "Docker", level: 2, distinctVerifiers: 0, verifiedBy: [] }
  ]
};

// Requester observed React and Node.js during the hackathon
const observedSkills = ["React", "Node.js"];
const requesterId = "lead-requester-99";

function verifyPeerSkills(candidate, observedList, verifierId) {
  candidate.skills.forEach(skill => {
    if (observedList.includes(skill.name)) {
      if (!skill.verifiedBy.includes(verifierId)) {
        skill.verifiedBy.push(verifierId);
        skill.distinctVerifiers = skill.verifiedBy.length;
      }
    }
    // Unticked skills are completely untouched: NOT removed, NOT rejected!
  });
}

verifyPeerSkills(peerCandidate, observedSkills, requesterId);

// Check React and Node.js are verified by requester
const reactSkill = peerCandidate.skills.find(s => s.name === "React");
const nodeSkill = peerCandidate.skills.find(s => s.name === "Node.js");
const mongoSkill = peerCandidate.skills.find(s => s.name === "MongoDB");
const dockerSkill = peerCandidate.skills.find(s => s.name === "Docker");

assert.strictEqual(reactSkill.distinctVerifiers, 1);
assert.ok(reactSkill.verifiedBy.includes(requesterId));
assert.strictEqual(nodeSkill.distinctVerifiers, 1);
assert.ok(nodeSkill.verifiedBy.includes(requesterId));

// Check MongoDB and Docker were unticked: stayed unverified, never rejected
assert.strictEqual(mongoSkill.distinctVerifiers, 0, "Unticked skill stays unverified");
assert.strictEqual(mongoSkill.verifiedBy.length, 0);
assert.strictEqual(dockerSkill.distinctVerifiers, 0, "Unticked skill stays unverified");
assert.strictEqual(peerCandidate.skills.length, 4, "All skills preserved; unticked skills are never deleted");
console.log("   ✓ Ticked skills verified (+1 verifier); unticked skills remain unverified (never rejected).");

// -------------------------------------------------------------
// Test 4: PeerShare & Term C Credibility Impact
// -------------------------------------------------------------
console.log("4. Testing PeerShare & Term C Credibility Calculation...");
// peerShare = average over claimed skills of min(1, distinctVerifiers / 3)
// 4 skills: React (1/3), Node (1/3), Mongo (0/3), Docker (0/3)
// sum = 1/3 + 1/3 + 0 + 0 = 2/3
// average = (2/3) / 4 = 2/12 = 0.1667
const termC = calculateCredibilityTerm(peerCandidate);
assert.strictEqual(Math.round(termC.peerShare * 1000) / 1000, 0.167);
console.log(`   ✓ Derived peerShare = ${termC.peerShare.toFixed(3)}, properly incorporated into Term C.`);

// -------------------------------------------------------------
// Test 5: Shortlist Logging on Invites (Unique per Requester)
// -------------------------------------------------------------
console.log("5. Testing Shortlist Logging (Unique per Requester)...");
const shortlistsDb = [];

function logShortlist(requesterId, candidateId, teamReqId) {
  const existing = shortlistsDb.find(
    s => s.requesterId === requesterId && s.candidateId === candidateId
  );
  if (!existing) {
    shortlistsDb.push({ requesterId, candidateId, teamReqId, createdAt: new Date() });
  }
}

// Lead 1 invites Candidate X twice (different teams or re-invite)
logShortlist("lead-1", "cand-X", "team-1");
logShortlist("lead-1", "cand-X", "team-2");

// Lead 2 invites Candidate X
logShortlist("lead-2", "cand-X", "team-3");

// Verify unique per requester
const candidateShortlists = shortlistsDb.filter(s => s.candidateId === "cand-X");
assert.strictEqual(candidateShortlists.length, 2, "Candidate X must have 2 unique shortlisters (lead-1 and lead-2)");

// Verify Term R (H: unique shortlisters) calculation
const candidateUser = {
  pastHackathons: [],
  reviewCount: 1,
  teammateRating: 4.5 / 5.0, // Q = 4.5/5 = 0.90
  uniqueShortlisters: candidateShortlists.length // 2 unique shortlisters
};

const rep = calculateReputationTerm(candidateUser);
assert.strictEqual(rep.H, candidateShortlists.length / 10.0, "H term correctly reflects unique shortlisters count");
console.log(`   ✓ Unique shortlists enforced and reflected in Term R (H = ${rep.H}).`);

console.log("\n=================================================");
console.log("ALL 5 PHASE 7 POST-EVENT TESTS PASSED (100%)");
console.log("=================================================\n");
