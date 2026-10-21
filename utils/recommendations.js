const User = require("../models/User");
const Invite = require("../models/Invite");
const TeamRequirement = require("../models/TeamRequirement");
const Application = require("../models/Application");
const TeamRequestAction = require("../models/TeamRequestAction");
const { calculateMatchScore } = require("./matchScore");

/**
 * Filters candidates and computes match scores for a given team requirement role.
 * 
 * Rules:
 * 1. Filter out candidate if locked for this event (Term A).
 * 2. Filter out candidate if profile is hidden (Term A).
 * 3. Filter out candidate if missing >= 50% of required skills (Term S).
 * 4. Filter out coordinator / current user themselves.
 * 5. Compute MatchScore (0 - 100) using calculateMatchScore().
 * 6. Multi-tier sort: score -> raw R -> lastActive -> profile completeness -> name.
 * 7. Provide per-term breakdown for "why this match".
 * 
 * @param {Object} team - The TeamRequirement document
 * @param {Object} role - The specific role within the team requirement
 * @param {ObjectId} currentUserId - The ID of the logged in user
 * @returns {Array} Array of recommended candidate objects with scores and breakdown
 */
async function getRecommendedCandidates(team, role, currentUserId) {
  if (!team || !role) {
    return [];
  }

  // Find all users except the current coordinator; exclude hidden profiles at DB level
  const userQuery = {
    isProfileHidden: { $ne: true }
  };
  if (currentUserId) {
    userQuery._id = { $ne: currentUserId };
  }
  const allUsers = await User.find(userQuery);

  // Determine event lock key: use eventId if present, fallback to projectName
  const eventLockKey = team.eventId ? team.eventId.toString() : (team.projectName || "");

  const recommended = [];

  for (const candidate of allUsers) {
    // -------------------------------------------------------------
    // EXCLUSION 1: Locked for this event
    // -------------------------------------------------------------
    if (eventLockKey && candidate.lockedEvents && candidate.lockedEvents.includes(eventLockKey)) {
      continue;
    }

    // -------------------------------------------------------------
    // EXCLUSION 2: Profile is hidden
    // -------------------------------------------------------------
    if (candidate.isProfileHidden === true) {
      continue;
    }

    // -------------------------------------------------------------
    // CALCULATE MATCH SCORE & COVERAGE FILTER (Term S >= 50%)
    // -------------------------------------------------------------
    const matchResult = calculateMatchScore(candidate, role);
    if (!matchResult.qualifies) {
      continue; // Excluded due to insufficient skill coverage
    }

    // Check if an invite has already been sent
    let isInvited = false;
    if (currentUserId) {
      const existingInvite = await TeamRequestAction.findOne({
        senderId: currentUserId,
        receiverId: candidate._id,
        teamRequirementId: team._id,
        direction: "INVITE",
        status: { $in: ["PENDING", "ACCEPTED", "LOCKED"] }
      }) || await Invite.findOne({
        senderId: currentUserId,
        receiverId: candidate._id,
        teamRequirementId: team._id,
        status: "PENDING"
      });
      if (existingInvite) {
        isInvited = true;
      }
    }

    // Sanitize candidate representation to strictly isolate contact info (email, phone, links) until mutual consent
    const sanitizedUser = {
      _id: candidate._id,
      name: candidate.name,
      department: candidate.department,
      year: candidate.year,
      role: candidate.role,
      skills: candidate.skills || [],
      credibility: candidate.credibility,
      teammateRating: candidate.teammateRating,
      isGithubVerified: !!candidate.isGithubVerified,
      isLinkedinLinked: !!candidate.isLinkedinLinked,
      trustBadges: candidate.trustBadges || [],
      lastActive: candidate.lastActive,
      completenessPercentage: candidate.completenessPercentage
    };

    recommended.push({
      user: sanitizedUser,
      score: matchResult.score,
      matchResult: matchResult,
      breakdown: matchResult.breakdown,
      isInvited: isInvited
    });
  }

  // -------------------------------------------------------------
  // MULTI-TIER SORT: score -> raw R -> lastActive -> completeness -> name
  // -------------------------------------------------------------
  recommended.sort((a, b) => {
    // 1. Score (descending)
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // 2. Raw R (reputation) (descending)
    const rawRA = a.matchResult?.breakdown?.rawR || 0;
    const rawRB = b.matchResult?.breakdown?.rawR || 0;
    if (rawRB !== rawRA) {
      return rawRB - rawRA;
    }

    // 3. lastActive (descending / most recently active first)
    const timeA = a.user.lastActive ? new Date(a.user.lastActive).getTime() : 0;
    const timeB = b.user.lastActive ? new Date(b.user.lastActive).getTime() : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }

    // 4. Profile completeness percentage (descending)
    const compA = a.user.completenessPercentage || 0;
    const compB = b.user.completenessPercentage || 0;
    if (compB !== compA) {
      return compB - compA;
    }

    // 5. Name (alphabetical ascending)
    return (a.user.name || "").localeCompare(b.user.name || "");
  });

  return recommended;
}

/**
 * Finds and calculates matching open team roles (opportunities) for the current user.
 * 
 * Rules:
 * 1. Filter out teams if user is locked for that event.
 * 2. Filter out roles where openings <= 0.
 * 3. Filter out roles if current user fails the >= 50% skill coverage requirement.
 * 4. Filter out teams created by the user themselves.
 * 5. Calculate Match Score using calculateMatchScore(currentUser, role).
 * 6. Sort opportunities: score -> raw R -> lastActive -> name.
 * 
 * @param {Object} currentUser - Current logged-in user
 * @returns {Array} Array of recommended opportunity objects with breakdown
 */
async function getRecommendedOpportunities(currentUser) {
  if (!currentUser) {
    return [];
  }

  const allTeams = await TeamRequirement.find().populate("eventId");
  const opportunities = [];

  for (const team of allTeams) {
    const eventLockKey = team.eventId ? (team.eventId._id || team.eventId).toString() : (team.projectName || "");

    // Skip if user is locked into this event
    if (eventLockKey && currentUser.lockedEvents && currentUser.lockedEvents.includes(eventLockKey)) {
      continue;
    }

    // Skip if user is the creator of this team requirement
    if (team.createdBy && team.createdBy.equals(currentUser._id)) {
      continue;
    }

    if (!Array.isArray(team.roles)) continue;

    for (const role of team.roles) {
      // 1. OPENINGS CHECK: Only show roles where openings > 0
      if (!role.openings || role.openings <= 0) {
        continue;
      }

      // 2. CALCULATE MATCH SCORE & COVERAGE
      const matchResult = calculateMatchScore(currentUser, role);
      if (!matchResult.qualifies) {
        continue; // Lacks >= 50% coverage of required skills
      }

      // 3. CHECK IF ALREADY APPLIED
      const existingAction = await TeamRequestAction.findOne({
        senderId: currentUser._id,
        teamRequirementId: team._id,
        role: role.title,
        direction: "APPLY"
      }) || await Application.findOne({
        applicantId: currentUser._id,
        teamRequirementId: team._id,
        role: role.title
      });

      opportunities.push({
        team: team,
        role: role,
        score: matchResult.score,
        matchResult: matchResult,
        breakdown: matchResult.breakdown,
        isApplied: !!existingAction,
        applicationStatus: existingAction ? existingAction.status : null,
        applicationId: existingAction ? existingAction._id : null
      });
    }
  }

  // Multi-tier sort
  opportunities.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const rawRA = a.matchResult?.breakdown?.rawR || 0;
    const rawRB = b.matchResult?.breakdown?.rawR || 0;
    if (rawRB !== rawRA) {
      return rawRB - rawRA;
    }
    return (a.team.projectName || "").localeCompare(b.team.projectName || "");
  });

  return opportunities;
}

module.exports = {
  getRecommendedCandidates,
  getRecommendedOpportunities
};
