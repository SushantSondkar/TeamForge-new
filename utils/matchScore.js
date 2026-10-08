/**
 * Match Score Algorithm for TeamForge
 * 
 * Formula:
 * Match Score = (45 * Skill Match) + (25 * Credibility) + (15 * Reputation) + (10 * Availability) + (5 * Activity)
 * 
 * Each component is normalized between 0.0 and 1.0.
 * The final score is an integer between 0 and 100.
 */

// Configurable weights allowing fine-tuning without changing the formula logic
const MATCH_WEIGHTS = {
  skill: 45,
  credibility: 25,
  reputation: 15,
  availability: 10,
  activity: 5
};

/**
 * Calculates the match score between a candidate user and a team requirement role.
 * 
 * @param {Object} candidate - The candidate user document from MongoDB
 * @param {Object} role - The role definition from the TeamRequirement document
 * @returns {Object} { score, skillMatch, credibility, reputation, availability, activity }
 */
function calculateMatchScore(candidate, role) {
  // -------------------------------------------------------------
  // 1. SKILL MATCH (Weight: 45%)
  // -------------------------------------------------------------
  // Map required role proficiency to a target skill level (1-5 scale)
  const proficiencyLevels = {
    'Intermediate': 3,
    'Advanced': 4,
    'Expert': 5
  };
  const targetLevel = proficiencyLevels[role.proficiency] || 4;

  // Build a quick lookup map of candidate's skills (case-insensitive)
  const candidateSkills = {};
  if (Array.isArray(candidate.skills)) {
    candidate.skills.forEach(s => {
      if (s && s.name) {
        candidateSkills[s.name.toLowerCase().trim()] = s.level || 1;
      }
    });
  }

  // Calculate score for required skills
  const requiredSkills = role.requiredSkills || [];
  let requiredScoreSum = 0;

  if (requiredSkills.length > 0) {
    requiredSkills.forEach(reqSkill => {
      const candidateLevel = candidateSkills[reqSkill.toLowerCase().trim()] || 0;
      // Compare candidate level to required level, capped at 1.0
      const skillScore = Math.min(1.0, candidateLevel / targetLevel);
      requiredScoreSum += skillScore;
    });
  }

  const reqAverage = requiredSkills.length > 0 ? (requiredScoreSum / requiredSkills.length) : 1.0;

  // Small bonus for matching preferred skills (up to +0.10, capped at 1.0)
  let preferredBonus = 0;
  const preferredSkills = role.preferredSkills || [];
  if (preferredSkills.length > 0) {
    let matchedPreferred = 0;
    preferredSkills.forEach(prefSkill => {
      if (candidateSkills[prefSkill.toLowerCase().trim()]) {
        matchedPreferred++;
      }
    });
    preferredBonus = (matchedPreferred / preferredSkills.length) * 0.10;
  }

  // Final skill match is clamped between 0.0 and 1.0
  const skillMatch = Math.min(1.0, Math.max(0.0, reqAverage + preferredBonus));

  // -------------------------------------------------------------
  // 2. CREDIBILITY (Weight: 25%)
  // -------------------------------------------------------------
  // Based on evidence level: self-reported (0.3), GitHub (0.7), verified (1.0)
  const credibility = Math.min(1.0, Math.max(0.0, Number(candidate.credibility) || 0.5));

  // -------------------------------------------------------------
  // 3. REPUTATION (Weight: 15%)
  // -------------------------------------------------------------
  // Formula: 60% teammate ratings + 40% competition wins
  // New users with less than 3 reviews get a neutral score of 0.5
  let reputation = 0.5;

  if ((candidate.reviewCount || 0) >= 3) {
    const teammateRating = Math.min(1.0, Math.max(0.0, Number(candidate.teammateRating) || 0.5));

    // Normalize competition wins: 0 wins = 0, 1 win = 0.5, 2+ wins = 1.0
    const wins = candidate.competitionWins || 0;
    const winScore = wins >= 2 ? 1.0 : (wins === 1 ? 0.5 : 0.0);

    reputation = (0.6 * teammateRating) + (0.4 * winScore);
  }

  // -------------------------------------------------------------
  // 4. AVAILABILITY (Weight: 10%)
  // -------------------------------------------------------------
  // Free = 1.0, Partly free = 0.5, Busy/Not available = 0.0
  const availability = Math.min(1.0, Math.max(0.0, Number(candidate.availability) || 0.0));

  // -------------------------------------------------------------
  // 5. ACTIVITY (Weight: 5%)
  // -------------------------------------------------------------
  // Active today = 1.0, decreasing linearly until 30+ days inactive = 0.0
  let activity = 0.0;
  if (candidate.lastActive) {
    const lastActiveDate = new Date(candidate.lastActive).getTime();
    const daysInactive = (Date.now() - lastActiveDate) / (1000 * 60 * 60 * 24);
    activity = Math.max(0.0, Math.min(1.0, 1.0 - (daysInactive / 30)));
  }

  // -------------------------------------------------------------
  // FINAL SCORE CALCULATION (0 - 100)
  // -------------------------------------------------------------
  const rawScore = 
    (MATCH_WEIGHTS.skill * skillMatch) +
    (MATCH_WEIGHTS.credibility * credibility) +
    (MATCH_WEIGHTS.reputation * reputation) +
    (MATCH_WEIGHTS.availability * availability) +
    (MATCH_WEIGHTS.activity * activity);

  // Round to nearest whole number (e.g. 98% Match)
  const score = Math.round(rawScore);

  return {
    score,
    skillMatch,
    credibility,
    reputation,
    availability,
    activity
  };
}

module.exports = {
  MATCH_WEIGHTS,
  calculateMatchScore
};
