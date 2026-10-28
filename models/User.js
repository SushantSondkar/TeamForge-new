const mongoose = require("mongoose");

// Candidate / User Schema with Phase 2 Profile Fields
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: "Candidate"
  },
  profilePic: {
    type: String,
    default: ""
  },
  avatar: {
    type: String,
    default: ""
  },
  photo: {
    type: String,
    default: ""
  },
  department: {
    type: String,
    default: ""
  },
  year: {
    type: String,
    default: ""
  },
  bio: {
    type: String,
    default: ""
  },
  github: {
    type: String,
    default: ""
  },
  isGithubVerified: {
    type: Boolean,
    default: false
  },
  githubId: {
    type: String,
    default: ""
  },
  githubUsername: {
    type: String,
    default: ""
  },
  githubData: {
    reposCount: { type: Number, default: 0 },
    totalCommits: { type: Number, default: 0 },
    languages: [{ type: String }],
    topRepos: [
      {
        name: { type: String, default: "" },
        html_url: { type: String, default: "" },
        description: { type: String, default: "" },
        stargazers_count: { type: Number, default: 0 },
        language: { type: String, default: "" },
        updated_at: { type: String, default: "" }
      }
    ],
    cachedAt: { type: Date, default: null },
    rateLimitedUntil: { type: Date, default: null }
  },
  linkedin: {
    type: String,
    default: ""
  },
  isLinkedinLinked: {
    type: Boolean,
    default: false
  },
  linkedinId: {
    type: String,
    default: ""
  },
  linkedinProfileUrl: {
    type: String,
    default: ""
  },
  linkedinData: {
    name: { type: String, default: "" },
    picture: { type: String, default: "" },
    email: { type: String, default: "" },
    linkedAt: { type: Date, default: null }
  },
  portfolio: {
    type: String,
    default: ""
  },
  // Projects: [{ title, description, link, techStack }]
  projects: [
    {
      title: { type: String, required: true },
      description: { type: String, default: "" },
      link: { type: String, default: "" },
      techStack: { type: String, default: "" }
    }
  ],
  // Past hackathons: [{ name, year, projectTitle, role, placement }]
  pastHackathons: [
    {
      name: { type: String, required: true },
      year: { type: String, default: "" },
      projectTitle: { type: String, default: "" },
      role: { type: String, default: "" },
      placement: { type: String, default: "" }
    }
  ],
  // List of candidate skills with proficiency level (1 to 5)
  skills: [
    {
      name: {
        type: String,
        required: true
      },
      level: {
        type: Number,
        default: 1,
        min: 1,
        max: 5
      },
      distinctVerifiers: {
        type: Number,
        default: 0
      },
      verifiedBy: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      ]
    }
  ],
  // Evidence / credibility rating (0 to 1):
  credibility: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  // Teammate feedback rating (0 to 1)
  teammateRating: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  competitionWins: {
    type: Number,
    default: 0
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  // Unique shortlisters count (Term R: H)
  uniqueShortlisters: {
    type: Number,
    default: 0
  },
  // Availability status: 1 = Free, 0.5 = Partly free, 0 = Not available
  availability: {
    type: Number,
    default: 1.0,
    min: 0,
    max: 1
  },
  // Profile visibility toggle (hide from discover & search)
  isProfileHidden: {
    type: Boolean,
    default: false
  },
  // Email notifications preference (reminders, expiries, match updates)
  emailNotifications: {
    type: Boolean,
    default: true
  },
  // Organizer account with admin approval
  isOrganizer: {
    type: Boolean,
    default: false
  },
  organizerStatus: {
    type: String,
    enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
    default: "NONE"
  },
  organizationName: {
    type: String,
    default: ""
  },
  organizerReason: {
    type: String,
    default: ""
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  // Email verification state
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  // Password reset tokens
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  passwordChangedAt: {
    type: Date,
    default: null
  },
  // Timestamp when candidate was last active
  lastActive: {
    type: Date,
    default: Date.now
  },
  // Events / projects this candidate is already committed to
  lockedEvents: [
    {
      type: String
    }
  ]
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      return ret;
    }
  }
});

// Profile completeness percentage calculator (used as tie-breaker)
userSchema.virtual("completenessPercentage").get(function() {
  let score = 0;
  if (this.name && this.email) score += 20;
  if (this.department && this.year) score += 15;
  if (this.bio && this.bio.trim().length > 10) score += 15;
  if (this.skills && this.skills.length >= 3) {
    score += 20;
  } else if (this.skills && this.skills.length > 0) {
    score += this.skills.length * 6;
  }
  if (this.isGithubVerified || this.github || this.isLinkedinLinked || this.linkedin || this.portfolio) score += 15;
  if ((this.projects && this.projects.length > 0) || (this.pastHackathons && this.pastHackathons.length > 0)) {
    score += 15;
  }
  return Math.min(100, Math.round(score));
});

// Missing profile fields needed for 100% completeness
userSchema.virtual("missingFields").get(function() {
  const missing = [];
  if (!this.department || !this.year) missing.push("Department & Academic Year");
  if (!this.bio || this.bio.trim().length <= 10) missing.push("Bio (at least 10 characters)");
  if (!this.skills || this.skills.length < 3) {
    const count = this.skills ? this.skills.length : 0;
    missing.push(`At least 3 technical skills (currently ${count}/3)`);
  }
  if (!this.isGithubVerified && !this.github && !this.isLinkedinLinked && !this.linkedin && !this.portfolio) {
    missing.push("External developer link (GitHub, LinkedIn, or Portfolio)");
  }
  if ((!this.projects || this.projects.length === 0) && (!this.pastHackathons || this.pastHackathons.length === 0)) {
    missing.push("At least one project or past hackathon");
  }
  return missing;
});

// Tiered Trust Badges getter: honest trust labels, never fake 100% verified
userSchema.virtual("trustBadges").get(function() {
  const badges = [];
  if (this.isGithubVerified && this.githubId) {
    badges.push({
      key: "github",
      label: "GitHub Verified",
      sublabel: "OAuth + REST API Verified",
      style: "github-verified",
      color: "#059669"
    });
  } else if (this.github || this.githubUsername) {
    badges.push({
      key: "github_unverified",
      label: "GitHub linked, not verified",
      sublabel: "Self-Reported Username",
      style: "github-unverified",
      color: "#64748b"
    });
  }
  if (this.isLinkedinLinked) {
    badges.push({
      key: "linkedin",
      label: "LinkedIn Linked",
      sublabel: "OAuth Identity Linked",
      style: "linkedin-linked",
      color: "#0284c7"
    });
  }
  if (this.portfolio && this.portfolio.trim().length > 0) {
    badges.push({
      key: "portfolio",
      label: "Portfolio",
      sublabel: "Self-Reported URL",
      style: "portfolio-reported",
      color: "#64748b"
    });
  }
  return badges;
});

// MongoDB indexes for Candidate search & recommendations performance
userSchema.index({ isProfileHidden: 1 });
userSchema.index({ "skills.name": 1, "skills.level": 1 });
userSchema.index({ lockedEvents: 1 });
// Synchronize profilePic, avatar, and photo fields so all third-party integrations & database queries find the image
userSchema.pre("save", function() {
  const pic = (this.profilePic || this.avatar || this.photo || "").trim();
  if (pic) {
    this.profilePic = pic;
    this.avatar = pic;
    this.photo = pic;
  }
});

module.exports = mongoose.model("User", userSchema);
