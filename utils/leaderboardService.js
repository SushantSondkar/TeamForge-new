const User = require("../models/User");
const { calculateReputationTerm, calculateRecencyTerm } = require("./matchScore");

// In-memory daily cache for leaderboard
let cachedLeaderboard = null;
let lastComputedAt = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (daily)

/**
 * Calculates raw win points for tie-breaking
 */
function getRawWinPoints(user) {
  let points = 0;
  if (user && Array.isArray(user.pastHackathons) && user.pastHackathons.length > 0) {
    user.pastHackathons.forEach(h => {
      const placement = (h.placement || "").toLowerCase();
      if (placement.includes("national")) {
        points += 3;
      } else if (placement.includes("state")) {
        points += 2;
      } else if (placement.includes("win") || placement.includes("1st") || placement.includes("college")) {
        points += 1;
      }
    });
  } else if (user && typeof user.competitionWins === "number") {
    points = user.competitionWins;
  }
  return points;
}

/**
 * Computes Leaderboard Score for a candidate:
 * LeaderboardScore = round(100 * (0.7 * Reputation + 0.3 * Activity))
 */
function computeLeaderboardScore(user) {
  const repTerm = calculateReputationTerm(user);
  const recTerm = calculateRecencyTerm(user);

  const reputation = repTerm.R; // 0.4*W + 0.4*Q + 0.2*H
  const activity = recTerm.T;     // 1.0 <= 7d, 0.6 <= 30d, 0.2 else

  const rawScore = (0.7 * reputation) + (0.3 * activity);
  const score = Math.round(100 * rawScore);

  return {
    score,
    reputation,
    activity,
    breakdown: {
      W: repTerm.W,
      Q: repTerm.Q,
      H: repTerm.H,
      T: activity
    }
  };
}

/**
 * Computes the full platform leaderboard with 5-stage tie-breaking hierarchy
 * Tie-breakers: raw wins -> shortlists -> completeness -> name
 */
async function computeLeaderboard() {
  const users = await User.find({ isProfileHidden: { $ne: true } }).select("-profilePic");

  const leaderboard = users.map(user => {
    const { score, reputation, activity, breakdown } = computeLeaderboardScore(user);
    const rawWins = getRawWinPoints(user);
    const shortlists = user.uniqueShortlisters || 0;
    const completeness = user.completenessPercentage || 0;

    return {
      user: {
        _id: user._id,
        name: user.name,
        department: user.department,
        year: user.year,
        role: user.role,
        skills: user.skills || [],
        isGithubVerified: !!user.isGithubVerified,
        isLinkedinLinked: !!user.isLinkedinLinked,
        lastActive: user.lastActive,
        completenessPercentage: completeness
      },
      score,
      reputation,
      activity,
      rawWins,
      shortlists,
      completeness,
      breakdown
    };
  });

  // 5-Stage Tie-Breaking Sort
  leaderboard.sort((a, b) => {
    // 1. Leaderboard Score (descending)
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // 2. Raw Wins (descending)
    if (b.rawWins !== a.rawWins) {
      return b.rawWins - a.rawWins;
    }
    // 3. Shortlists count (descending)
    if (b.shortlists !== a.shortlists) {
      return b.shortlists - a.shortlists;
    }
    // 4. Profile completeness (descending)
    if (b.completeness !== a.completeness) {
      return b.completeness - a.completeness;
    }
    // 5. Name (alphabetical ascending)
    return (a.user.name || "").localeCompare(b.user.name || "");
  });

  // Assign ranks
  leaderboard.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  cachedLeaderboard = leaderboard;
  lastComputedAt = new Date();
  return leaderboard;
}

/**
 * Retrieves leaderboard, serving from cache if fresh within 24h
 */
async function getLeaderboard(force = false) {
  const now = new Date();
  if (
    !force &&
    cachedLeaderboard &&
    lastComputedAt &&
    (now.getTime() - lastComputedAt.getTime()) < CACHE_TTL_MS
  ) {
    return {
      leaderboard: cachedLeaderboard,
      cachedAt: lastComputedAt,
      isCached: true
    };
  }

  const fresh = await computeLeaderboard();
  return {
    leaderboard: fresh,
    cachedAt: lastComputedAt,
    isCached: false
  };
}

/**
 * Applies filters (branch/department, year, skill) over the leaderboard entries
 */
function filterLeaderboard(entries, { branch, year, skill }) {
  if (!Array.isArray(entries)) return [];

  return entries.filter(entry => {
    // Branch filter
    if (branch && branch.trim()) {
      if (!entry.user.department || entry.user.department.toLowerCase() !== branch.toLowerCase().trim()) {
        return false;
      }
    }

    // Academic Year filter
    if (year && year.trim()) {
      if (!entry.user.year || entry.user.year.toUpperCase() !== year.toUpperCase().trim()) {
        return false;
      }
    }

    // Skill filter
    if (skill && skill.trim()) {
      const targetSkill = skill.toLowerCase().trim();
      const hasSkill = (entry.user.skills || []).some(s =>
        s.name && s.name.toLowerCase().includes(targetSkill)
      );
      if (!hasSkill) {
        return false;
      }
    }

    return true;
  });
}

module.exports = {
  computeLeaderboardScore,
  getRawWinPoints,
  computeLeaderboard,
  getLeaderboard,
  filterLeaderboard
};
