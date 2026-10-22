/**
 * TeamForge Matching Engine
 * 
 * MatchScore = round(100 × (0.40·S + 0.25·C + 0.20·R + 0.10·A + 0.05·T))
 * 
 * S: per required skill min(1, level/target), targets Intermediate 3, Advanced 4, Expert 5;
 *    missing = 0; average; + up to 0.10 for preferred skills; cap 1.
 *    Candidates appear only if they cover >= 50% of required skills (configurable constant).
 * C: 0.30 + 0.40·(githubVerified) + 0.30·peerShare, where peerShare is the average over
 *    claimed skills of min(1, distinctVerifiers/3). Derived, not a stored column.
 * R: 0.4·W + 0.4·Q + 0.2·H.
 *    W = verified win points (college 1, state 2, national 3) / platform max.
 *    Q = avg review rating / 5.
 *    H = unique shortlisters / platform max.
 *    Missing data = neutral 0.5.
 * A: excluded if locked for this event or profile hidden; else 1.0 free, 0.5 partly free, 0.0 busy.
 * T: lastActive <= 7 days 1.0, <= 30 days 0.6, else 0.2.
 */

const MATCH_CONFIG = {
  weights: {
    skill: 0.40,
    credibility: 0.25,
    reputation: 0.20,
    availability: 0.10,
    recency: 0.05
  },
  minRequiredSkillCoverage: 0.50, // Must possess >= 50% of required skills
  proficiencyTargets: {
    Intermediate: 3,
    Advanced: 4,
    Expert: 5
  },
  maxPreferredBonus: 0.10,
  reputationWeights: {
    wins: 0.40,
    rating: 0.40,
    shortlists: 0.20
  },
  winPoints: {
    college: 1,
    state: 2,
    national: 3
  },
  platformMaxWins: 5,
  platformMaxShortlists: 10
};

/**
 * Calculates Term S (Skill Match) and checks eligibility coverage.
 * 
 * @param {Object} candidate - Candidate user
 * @param {Object} role - Team role definition
 * @returns {Object} { S, qualifies, coverageRatio, reqAverage, preferredBonus }
 */
function calculateSkillTerm(candidate, role) {
  const targetLevel = (role && role.proficiency && MATCH_CONFIG.proficiencyTargets[role.proficiency])
    ? MATCH_CONFIG.proficiencyTargets[role.proficiency]
    : MATCH_CONFIG.proficiencyTargets.Intermediate;

  const candidateSkills = {};
  if (candidate && Array.isArray(candidate.skills)) {
    candidate.skills.forEach(s => {
      if (s && s.name) {
        candidateSkills[s.name.toLowerCase().trim()] = Number(s.level) || 1;
      }
    });
  }

  const requiredSkills = (role && Array.isArray(role.requiredSkills)) ? role.requiredSkills : [];
  let coveredCount = 0;
  let requiredScoreSum = 0;

  if (requiredSkills.length > 0) {
    requiredSkills.forEach(reqSkill => {
      const level = candidateSkills[reqSkill.toLowerCase().trim()] || 0;
      if (level > 0) {
        coveredCount++;
      }
      const skillScore = Math.min(1.0, level / targetLevel);
      requiredScoreSum += skillScore;
    });
  }

  const coverageRatio = requiredSkills.length > 0 ? (coveredCount / requiredSkills.length) : 1.0;
  const qualifies = coverageRatio >= MATCH_CONFIG.minRequiredSkillCoverage;

  const reqAverage = requiredSkills.length > 0 ? (requiredScoreSum / requiredSkills.length) : 1.0;

  // Preferred skills bonus (up to 0.10)
  let preferredBonus = 0;
  const preferredSkills = (role && Array.isArray(role.preferredSkills)) ? role.preferredSkills : [];
  if (preferredSkills.length > 0) {
    let matchedPreferred = 0;
    preferredSkills.forEach(prefSkill => {
      if (candidateSkills[prefSkill.toLowerCase().trim()]) {
        matchedPreferred++;
      }
    });
    preferredBonus = (matchedPreferred / preferredSkills.length) * MATCH_CONFIG.maxPreferredBonus;
  }

  const S = Math.min(1.0, Math.max(0.0, reqAverage + preferredBonus));

  return {
    S,
    qualifies,
    coverageRatio,
    reqAverage,
    preferredBonus
  };
}

/**
 * Calculates Term C (Credibility)
 * 0.30 + 0.40·(githubVerified) + 0.30·peerShare
 * peerShare: average over claimed skills of min(1, distinctVerifiers/3). Derived, not stored.
 * 
 * @param {Object} candidate - Candidate user
 * @returns {Object} { C, githubVerified, peerShare }
 */
function calculateCredibilityTerm(candidate) {
  // Check if GitHub is verified: strictly requires BOTH verified flag AND an OAuth githubId
  const githubVerified = !!(
    candidate &&
    (candidate.isGithubVerified === true || candidate.githubVerified === true) &&
    Boolean(candidate.githubId && String(candidate.githubId).trim())
  );

  // Calculate peerShare
  let peerShare = 0.0;
  const skills = (candidate && Array.isArray(candidate.skills)) ? candidate.skills : [];
  if (skills.length > 0) {
    let peerShareSum = 0;
    skills.forEach(skill => {
      let distinctVerifiers = 0;
      if (typeof skill.distinctVerifiers === 'number') {
        distinctVerifiers = skill.distinctVerifiers;
      } else if (Array.isArray(skill.verifiers)) {
        distinctVerifiers = skill.verifiers.length;
      } else if (Array.isArray(skill.verifiedBy)) {
        distinctVerifiers = skill.verifiedBy.length;
      } else if (skill.verified === true) {
        distinctVerifiers = 3; // Fully verified peer claim
      }
      peerShareSum += Math.min(1.0, distinctVerifiers / 3.0);
    });
    peerShare = peerShareSum / skills.length;
  }

  const C = Math.min(1.0, Math.max(0.0, 0.30 + (0.40 * (githubVerified ? 1.0 : 0.0)) + (0.30 * peerShare)));

  return {
    C,
    githubVerified,
    peerShare
  };
}

/**
 * Calculates Term R (Reputation)
 * 0.4·W + 0.4·Q + 0.2·H. Missing data = neutral 0.5.
 * W = verified win points (college 1, state 2, national 3) / platform max.
 * Q = avg review rating / 5.
 * H = unique shortlisters / platform max.
 * 
 * @param {Object} candidate - Candidate user
 * @param {Object} options - Platform stats / metadata overrides
 * @returns {Object} { R, W, Q, H }
 */
function calculateReputationTerm(candidate, options = {}) {
  const platformMaxWins = options.platformMaxWins || MATCH_CONFIG.platformMaxWins;
  const platformMaxShortlists = options.platformMaxShortlists || MATCH_CONFIG.platformMaxShortlists;

  // 1. W (Wins)
  let W = 0.5; // Neutral default
  let totalWinPoints = 0;
  let hasWinData = false;

  if (candidate && Array.isArray(candidate.pastHackathons) && candidate.pastHackathons.length > 0) {
    hasWinData = true;
    candidate.pastHackathons.forEach(h => {
      const placement = (h.placement || '').toLowerCase();
      if (placement.includes('national')) {
        totalWinPoints += MATCH_CONFIG.winPoints.national;
      } else if (placement.includes('state')) {
        totalWinPoints += MATCH_CONFIG.winPoints.state;
      } else if (placement.includes('win') || placement.includes('1st') || placement.includes('college')) {
        totalWinPoints += MATCH_CONFIG.winPoints.college;
      }
    });
  } else if (candidate && typeof candidate.competitionWins === 'number') {
    hasWinData = true;
    totalWinPoints = candidate.competitionWins * MATCH_CONFIG.winPoints.college;
  }

  if (hasWinData) {
    W = Math.min(1.0, totalWinPoints / platformMaxWins);
  }

  // 2. Q (Review Rating)
  let Q = 0.5; // Neutral default
  if (candidate && typeof candidate.reviewCount === 'number' && candidate.reviewCount > 0) {
    const rating = Number(candidate.teammateRating) || 0;
    // If stored as 0-1 ratio, convert to 5-star scale; if 1-5, use directly
    const fiveStar = rating <= 1.0 ? (rating * 5.0) : rating;
    Q = Math.min(1.0, Math.max(0.0, fiveStar / 5.0));
  } else if (candidate && typeof candidate.avgRating === 'number') {
    Q = Math.min(1.0, Math.max(0.0, candidate.avgRating / 5.0));
  }

  // 3. H (Unique Shortlisters)
  let H = 0.5; // Neutral default
  if (candidate && typeof candidate.uniqueShortlisters === 'number') {
    H = Math.min(1.0, candidate.uniqueShortlisters / platformMaxShortlists);
  } else if (candidate && typeof candidate.shortlistCount === 'number') {
    H = Math.min(1.0, candidate.shortlistCount / platformMaxShortlists);
  }

  const R = Math.min(1.0, Math.max(0.0,
    (MATCH_CONFIG.reputationWeights.wins * W) +
    (MATCH_CONFIG.reputationWeights.rating * Q) +
    (MATCH_CONFIG.reputationWeights.shortlists * H)
  ));

  return { R, W, Q, H };
}

/**
 * Calculates Term A (Availability)
 * 1.0 free, 0.5 partly free, 0.0 busy
 * 
 * @param {Object} candidate - Candidate user
 * @returns {Object} { A, status }
 */
function calculateAvailabilityTerm(candidate) {
  let A = 1.0;
  let status = "free";

  if (!candidate || candidate.availability === undefined || candidate.availability === null) {
    return { A: 1.0, status: "free" };
  }

  if (typeof candidate.availability === 'string') {
    const lower = candidate.availability.toLowerCase();
    if (lower.includes('busy') || lower.includes('not')) {
      A = 0.0;
      status = "busy";
    } else if (lower.includes('part') || lower.includes('look')) {
      A = 0.5;
      status = "partly_free";
    } else {
      A = 1.0;
      status = "free";
    }
  } else if (typeof candidate.availability === 'number') {
    if (candidate.availability <= 0.2) {
      A = 0.0;
      status = "busy";
    } else if (candidate.availability < 0.8) {
      A = 0.5;
      status = "partly_free";
    } else {
      A = 1.0;
      status = "free";
    }
  }

  return { A, status };
}

/**
 * Calculates Term T (Recency / Activity)
 * lastActive <= 7 days 1.0, <= 30 days 0.6, else 0.2.
 * 
 * @param {Object} candidate - Candidate user
 * @returns {Object} { T, daysInactive }
 */
function calculateRecencyTerm(candidate) {
  let daysInactive = 999;
  if (candidate && candidate.lastActive) {
    const lastActiveTime = new Date(candidate.lastActive).getTime();
    daysInactive = Math.max(0, (Date.now() - lastActiveTime) / (1000 * 60 * 60 * 24));
  }

  let T = 0.2;
  if (daysInactive <= 7) {
    T = 1.0;
  } else if (daysInactive <= 30) {
    T = 0.6;
  } else {
    T = 0.2;
  }

  return { T, daysInactive: Math.round(daysInactive * 10) / 10 };
}

/**
 * Main MatchScore computation function
 * MatchScore = round(100 × (0.40·S + 0.25·C + 0.20·R + 0.10·A + 0.05·T))
 * 
 * @param {Object} candidate - Candidate user document
 * @param {Object} role - Role definition
 * @param {Object} options - Additional options / context
 * @returns {Object} { score, qualifies, breakdown }
 */
function calculateMatchScore(candidate, role, options = {}) {
  // S Term & Skill coverage filter
  const skillResult = calculateSkillTerm(candidate, role);
  if (!skillResult.qualifies) {
    return {
      score: 0,
      qualifies: false,
      disqualificationReason: `Insufficient required skill coverage (${Math.round(skillResult.coverageRatio * 100)}% < 50%)`,
      breakdown: {
        S: skillResult.S,
        C: 0,
        R: 0,
        A: 0,
        T: 0,
        details: { skillResult }
      }
    };
  }

  // C Term
  const credResult = calculateCredibilityTerm(candidate);

  // R Term
  const repResult = calculateReputationTerm(candidate, options);

  // A Term
  const availResult = calculateAvailabilityTerm(candidate);

  // T Term
  const recencyResult = calculateRecencyTerm(candidate);

  const rawWeighted =
    (MATCH_CONFIG.weights.skill * skillResult.S) +
    (MATCH_CONFIG.weights.credibility * credResult.C) +
    (MATCH_CONFIG.weights.reputation * repResult.R) +
    (MATCH_CONFIG.weights.availability * availResult.A) +
    (MATCH_CONFIG.weights.recency * recencyResult.T);

  const score = Math.round(100 * rawWeighted);

  return {
    score,
    qualifies: true,
    breakdown: {
      S: Math.round(skillResult.S * 100) / 100,
      C: Math.round(credResult.C * 100) / 100,
      R: Math.round(repResult.R * 100) / 100,
      A: Math.round(availResult.A * 100) / 100,
      T: Math.round(recencyResult.T * 100) / 100,
      rawR: repResult.R, // Kept unrounded for tie-breaking
      details: {
        skillCoverage: Math.round(skillResult.coverageRatio * 100),
        reqAverage: Math.round(skillResult.reqAverage * 100) / 100,
        preferredBonus: Math.round(skillResult.preferredBonus * 100) / 100,
        githubVerified: credResult.githubVerified,
        peerShare: Math.round(credResult.peerShare * 100) / 100,
        W: Math.round(repResult.W * 100) / 100,
        Q: Math.round(repResult.Q * 100) / 100,
        H: Math.round(repResult.H * 100) / 100,
        availabilityStatus: availResult.status,
        daysInactive: recencyResult.daysInactive
      }
    }
  };
}

module.exports = {
  MATCH_CONFIG,
  calculateSkillTerm,
  calculateCredibilityTerm,
  calculateReputationTerm,
  calculateAvailabilityTerm,
  calculateRecencyTerm,
  calculateMatchScore
};
