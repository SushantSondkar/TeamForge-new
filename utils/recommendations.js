const mongoose = require("mongoose");
const User = require("../models/User");
const Event = require("../models/Event");
const Invite = require("../models/Invite");
const TeamRequirement = require("../models/TeamRequirement");
const Application = require("../models/Application");
const TeamRequestAction = require("../models/TeamRequestAction");
const { calculateMatchScore } = require("./matchScore");

/**
 * Escapes regex special characters to prevent regex injection or crashes.
 */
function escapeRegex(text) {
  if (typeof text !== "string") return "";
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
 * 7. Candidate search: filter by skill name and minimum level if provided.
 * 
 * @param {Object} team - The TeamRequirement document
 * @param {Object} role - The specific role within the team requirement
 * @param {ObjectId} currentUserId - The ID of the logged in user
 * @param {Object} filters - Optional candidate filters { skill, minLevel }
 * @returns {Array} Array of recommended candidate objects with scores and breakdown
 */
async function getRecommendedCandidates(team, role, currentUserId, filters = {}) {
  if (!team) {
    return [];
  }

  const effectiveRole = role || (team.roles && team.roles[0]) || null;
  if (!effectiveRole) {
    return [];
  }

  // Find all users except the current coordinator; exclude hidden profiles at DB level
  const userQuery = {
    isProfileHidden: { $ne: true }
  };
  if (currentUserId) {
    userQuery._id = { $ne: currentUserId };
  }
  const allUsers = await User.find(userQuery).select("-profilePic");

  // Determine event lock key: use eventId if present, fallback to projectName
  const eventLockKey = team.eventId ? (team.eventId._id || team.eventId).toString() : (team.projectName || "");

  const cleanSkill = (filters.skill && typeof filters.skill === "string") ? filters.skill.trim().toLowerCase() : "";
  const minLevel = parseInt(filters.minLevel, 10) || 1;

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
    // CANDIDATE SEARCH: Filter by skill name & minimum level
    // -------------------------------------------------------------
    let matchedSkill = null;
    if (cleanSkill) {
      matchedSkill = (candidate.skills || []).find(
        s => s.name && s.name.toLowerCase().includes(cleanSkill)
      );
      if (!matchedSkill || (matchedSkill.level || 0) < minLevel) {
        continue;
      }
    }

    // -------------------------------------------------------------
    // CALCULATE MATCH SCORE & COVERAGE FILTER (Term S >= 50%)
    // -------------------------------------------------------------
    let matchResult = calculateMatchScore(candidate, effectiveRole);
    if (cleanSkill) {
      // If team lead explicitly searched for a specific skill, compute match against that skill if not qualified under base role
      if (!matchResult.qualifies) {
        const evaluatedRole = {
          title: effectiveRole.title,
          requiredSkills: [matchedSkill.name],
          proficiency: effectiveRole.proficiency || "Intermediate",
          openings: effectiveRole.openings || 1
        };
        matchResult = calculateMatchScore(candidate, evaluatedRole);
      }
    } else {
      if (!matchResult.qualifies) {
        continue; // Excluded due to insufficient skill coverage
      }
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
  // 5-STAGE TIE-BREAKING HIERARCHY
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

/**
 * Server-side search & filtering for team requirements.
 * 
 * Rules:
 * 1. Filter only OPEN requirements with >= 1 open role (openings > 0).
 * 2. Filter out requirements whose event/team deadline has passed.
 * 3. Never return current user's own teams.
 * 4. Exclude teams where the current user is already locked for that event.
 * 5. q: case-insensitive match on projectName, theme, role titles, and required/preferred skills. Escapes regex characters.
 * 6. skill: filter requirements that need that skill in an open role.
 * 7. event: filter requirements for that event.
 * 8. role: filter requirements having an open role with that title.
 * 9. Paging: limit per page (default 10) with accurate total count and pages.
 * 10. Computes real user MatchScore using the existing calculateMatchScore engine with full breakdown.
 */
async function searchTeamRequirements({ currentUser, q, skill, role, event, page = 1, limit = 10 }) {
  const now = new Date();

  // Base MongoDB query: deadline in the future, has openings > 0, and not created by currentUser
  const query = {
    deadline: { $gte: now },
    "roles.openings": { $gt: 0 }
  };

  if (currentUser && currentUser._id) {
    query.createdBy = { $ne: currentUser._id };
  }

  if (event && mongoose.isValidObjectId(event)) {
    query.eventId = new mongoose.Types.ObjectId(event);
  }

  const allTeams = await TeamRequirement.find(query)
    .populate("eventId")
    .populate("createdBy", "name department role")
    .sort({ createdAt: -1 });

  let qRegex = null;
  if (q && typeof q === "string" && q.trim().length > 0) {
    const escaped = escapeRegex(q.trim());
    qRegex = new RegExp(escaped, "i");
  }

  const cleanSkill = (skill && typeof skill === "string") ? skill.trim().toLowerCase() : "";
  const cleanRole = (role && typeof role === "string") ? role.trim().toLowerCase() : "";

  const filtered = [];

  for (const team of allTeams) {
    // Check if event deadline has passed
    if (team.eventId && team.eventId.deadline && new Date(team.eventId.deadline) < now) {
      continue;
    }

    // Exclude if current user is locked for this event
    const eventLockKey = team.eventId ? (team.eventId._id || team.eventId).toString() : (team.projectName || "");
    if (currentUser && eventLockKey && currentUser.lockedEvents && currentUser.lockedEvents.includes(eventLockKey)) {
      continue;
    }

    // Must have open roles
    const openRoles = (team.roles || []).filter(r => r.openings > 0);
    if (openRoles.length === 0) {
      continue;
    }

    // Filter by skill
    if (cleanSkill) {
      const hasSkill = openRoles.some(r => {
        const reqMatch = (r.requiredSkills || []).some(s => s && s.toLowerCase().includes(cleanSkill));
        const prefMatch = (r.preferredSkills || []).some(s => s && s.toLowerCase().includes(cleanSkill));
        return reqMatch || prefMatch;
      });
      if (!hasSkill) continue;
    }

    // Filter by role title
    if (cleanRole) {
      const hasRole = openRoles.some(r => r.title && r.title.toLowerCase().includes(cleanRole));
      if (!hasRole) continue;
    }

    // Filter by q
    if (qRegex) {
      const nameMatch = qRegex.test(team.projectName || "");
      const themeMatch = qRegex.test(team.theme || "");
      const roleMatch = openRoles.some(r => {
        const titleMatch = qRegex.test(r.title || "");
        const reqMatch = (r.requiredSkills || []).some(s => qRegex.test(s));
        const prefMatch = (r.preferredSkills || []).some(s => qRegex.test(s));
        return titleMatch || reqMatch || prefMatch;
      });
      if (!nameMatch && !themeMatch && !roleMatch) {
        continue;
      }
    }

    // Compute user match scores for each open role
    const rolesWithMatch = [];
    for (const r of openRoles) {
      const matchResult = currentUser ? calculateMatchScore(currentUser, r) : { score: 0, qualifies: false, breakdown: null };

      let isApplied = false;
      if (currentUser) {
        const existingAction = await TeamRequestAction.findOne({
          senderId: currentUser._id,
          teamRequirementId: team._id,
          role: r.title,
          direction: "APPLY"
        }) || await Application.findOne({
          applicantId: currentUser._id,
          teamRequirementId: team._id,
          role: r.title
        });
        if (existingAction) isApplied = true;
      }

      rolesWithMatch.push({
        _id: r._id,
        title: r.title,
        requiredSkills: r.requiredSkills || [],
        preferredSkills: r.preferredSkills || [],
        proficiency: r.proficiency || "Intermediate",
        openings: r.openings,
        matchScore: matchResult.score,
        qualifies: matchResult.qualifies,
        breakdown: matchResult.breakdown,
        isApplied
      });
    }

    rolesWithMatch.sort((a, b) => b.matchScore - a.matchScore);

    filtered.push({
      team,
      roles: rolesWithMatch,
      bestMatchScore: rolesWithMatch[0] ? rolesWithMatch[0].matchScore : 0
    });
  }

  // Multi-tier sort for results: bestMatchScore desc, then projectName asc
  filtered.sort((a, b) => {
    if (b.bestMatchScore !== a.bestMatchScore) {
      return b.bestMatchScore - a.bestMatchScore;
    }
    return (a.team.projectName || "").localeCompare(b.team.projectName || "");
  });

  const totalCount = filtered.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const totalPages = Math.ceil(totalCount / limit) || 1;
  const startIndex = (pageNum - 1) * limit;
  const pagedResults = filtered.slice(startIndex, startIndex + limit);

  return {
    results: pagedResults,
    totalCount,
    currentPage: pageNum,
    totalPages,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1,
    limit
  };
}

/**
 * Returns distinct skills and roles from all current open requirements, plus upcoming events.
 */
async function getAvailableFilterOptions() {
  const now = new Date();
  const openTeams = await TeamRequirement.find({
    deadline: { $gte: now },
    "roles.openings": { $gt: 0 }
  }).populate("eventId");

  const skillSet = new Set();
  const roleSet = new Set();

  for (const t of openTeams) {
    if (t.eventId && t.eventId.deadline && new Date(t.eventId.deadline) < now) {
      continue;
    }
    for (const r of (t.roles || [])) {
      if (r.openings > 0) {
        if (r.title && r.title.trim()) roleSet.add(r.title.trim());
        (r.requiredSkills || []).forEach(s => {
          if (s && s.trim()) skillSet.add(s.trim());
        });
        (r.preferredSkills || []).forEach(s => {
          if (s && s.trim()) skillSet.add(s.trim());
        });
      }
    }
  }

  const events = await Event.find().sort({ date: 1 });

  return {
    availableSkills: Array.from(skillSet).sort((a, b) => a.localeCompare(b)),
    availableRoles: Array.from(roleSet).sort((a, b) => a.localeCompare(b)),
    availableEvents: events
  };
}

module.exports = {
  escapeRegex,
  getRecommendedCandidates,
  getRecommendedOpportunities,
  searchTeamRequirements,
  getAvailableFilterOptions
};
