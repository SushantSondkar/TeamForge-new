const User = require("../models/User");
const Invite = require("../models/Invite");
const TeamRequirement = require("../models/TeamRequirement");
const Application = require("../models/Application");
const { calculateMatchScore } = require("./matchScore");

/**
 * Filters candidates and computes match scores for a given team requirement role.
 * 
 * Rules:
 * 1. Filter out candidate if missing ANY required skill (Condition 1).
 * 2. Filter out candidate if locked into this project/event (Condition 2).
 * 3. Filter out current user from their own recommendations.
 * 4. Compute Match Score (0 - 100) using calculateMatchScore().
 * 5. Sort candidates from highest to lowest score.
 * 6. Mark if an invite has already been sent.
 * 
 * @param {Object} team - The TeamRequirement document
 * @param {Object} role - The specific role within the team requirement
 * @param {ObjectId} currentUserId - The ID of the logged in / demo user
 * @returns {Array} Array of recommended candidate objects with scores
 */
async function getRecommendedCandidates(team, role, currentUserId) {
  if (!team || !role) {
    return [];
  }

  // Find all users except the current coordinator
  const allUsers = await User.find(currentUserId ? { _id: { $ne: currentUserId } } : {});

  const requiredSkills = role.requiredSkills || [];
  const eventName = team.projectName || "";

  const recommended = [];

  for (const candidate of allUsers) {
    // -------------------------------------------------------------
    // CONDITION 2: Remove candidates locked into this event/project
    // -------------------------------------------------------------
    if (candidate.lockedEvents && candidate.lockedEvents.includes(eventName)) {
      continue; // Skip: candidate is already committed to a team for this event
    }

    // -------------------------------------------------------------
    // CONDITION 1: Remove candidates missing ANY required skill
    // -------------------------------------------------------------
    const candidateSkillsMap = {};
    if (Array.isArray(candidate.skills)) {
      candidate.skills.forEach(s => {
        if (s && s.name) {
          candidateSkillsMap[s.name.toLowerCase().trim()] = s.level || 1;
        }
      });
    }

    let hasAllRequired = true;
    for (const reqSkill of requiredSkills) {
      const level = candidateSkillsMap[reqSkill.toLowerCase().trim()];
      if (!level || level <= 0) {
        hasAllRequired = false;
        break; // Missing at least one required skill
      }
    }

    if (!hasAllRequired) {
      continue; // Hard filter: candidate does NOT qualify
    }

    // -------------------------------------------------------------
    // CALCULATE MATCH SCORE
    // -------------------------------------------------------------
    const matchResult = calculateMatchScore(candidate, role);

    // Check if an invite has already been sent
    let isInvited = false;
    if (currentUserId) {
      const existingInvite = await Invite.findOne({
        senderId: currentUserId,
        receiverId: candidate._id,
        teamRequirementId: team._id,
        status: "PENDING"
      });
      if (existingInvite) {
        isInvited = true;
      }
    }

    recommended.push({
      user: candidate,
      score: matchResult.score,
      matchResult: matchResult,
      isInvited: isInvited
    });
  }

  // Sort candidates by highest score first
  recommended.sort((a, b) => b.score - a.score);

  return recommended;
}

/**
 * Finds and calculates matching open team roles (opportunities) for the current user.
 * 
 * Rules:
 * 1. Filter out teams if user is already locked into that event.
 * 2. Filter out roles where openings <= 0.
 * 3. Filter out roles if current user is missing ANY required skill.
 * 4. Filter out teams created by the user themselves.
 * 5. Calculate Match Score using calculateMatchScore(currentUser, role).
 * 6. Check if user already applied to this role.
 * 7. Sort opportunities highest score first.
 * 
 * @param {Object} currentUser - The current logged in / demo user document
 * @returns {Array} Array of recommended opportunity objects
 */
async function getRecommendedOpportunities(currentUser) {
  if (!currentUser) {
    return [];
  }

  const allTeams = await TeamRequirement.find();
  const opportunities = [];

  // Build candidate skills lookup map
  const userSkillsMap = {};
  if (Array.isArray(currentUser.skills)) {
    currentUser.skills.forEach(s => {
      if (s && s.name) {
        userSkillsMap[s.name.toLowerCase().trim()] = s.level || 1;
      }
    });
  }

  for (const team of allTeams) {
    // Skip if user is locked into this event
    if (team.projectName && currentUser.lockedEvents && currentUser.lockedEvents.includes(team.projectName)) {
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

      // 2. REQUIRED SKILL FILTER: User must have ALL required skills
      const requiredSkills = role.requiredSkills || [];
      let hasAllRequired = true;
      for (const reqSkill of requiredSkills) {
        const level = userSkillsMap[reqSkill.toLowerCase().trim()];
        if (!level || level <= 0) {
          hasAllRequired = false;
          break;
        }
      }

      if (!hasAllRequired) {
        continue; // Hard filter: candidate lacks required skill
      }

      // 3. CALCULATE MATCH SCORE
      const matchResult = calculateMatchScore(currentUser, role);

      // 4. CHECK IF ALREADY APPLIED
      const existingApplication = await Application.findOne({
        applicantId: currentUser._id,
        teamRequirementId: team._id,
        role: role.title
      });

      opportunities.push({
        team: team,
        role: role,
        score: matchResult.score,
        matchResult: matchResult,
        isApplied: !!existingApplication,
        applicationStatus: existingApplication ? existingApplication.status : null,
        applicationId: existingApplication ? existingApplication._id : null
      });
    }
  }

  // Sort opportunities highest match score first
  opportunities.sort((a, b) => b.score - a.score);

  return opportunities;
}

module.exports = {
  getRecommendedCandidates,
  getRecommendedOpportunities
};
