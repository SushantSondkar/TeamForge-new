const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Role title is required']
  },
  requiredSkills: {
    type: [String],
    required: [true, 'At least one required skill is needed'],
    validate: [v => v.length > 0, 'Required skills cannot be empty']
  },
  preferredSkills: {
    type: [String],
    default: []
  },
  proficiency: {
    type: String,
    enum: ['Intermediate', 'Advanced', 'Expert'],
    default: 'Intermediate'
  },
  openings: {
    type: Number,
    min: 0,
    default: 1
  }
});

const teamRequirementSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  theme: {
    type: String,
    required: [true, 'Theme is required'],
  },
  projectName: {
    type: String,
    required: [true, 'Project name is required']
  },
  projectRequirement: {
    type: String,
    required: [true, 'Project requirement is required'],
  },
  deliverables: {
    type: String,
    required: [true, 'Deliverables are required'],
  },
  teamSize: {
    type: Number,
    required: [true, 'Team size is required'],
    min: [1, 'Team size must be at least 1'],
    max: [20, 'Team size cannot exceed 20'],
  },
  deadline: {
    type: Date,
    required: [true, 'Deadline is required'],
  },
  roles: {
    type: [roleSchema],
    required: [true, 'At least one role is required'],
    validate: [v => v.length > 0, 'Roles cannot be empty']
  }
}, {
  timestamps: true
});

const TeamRequirement = mongoose.model("TeamRequirement", teamRequirementSchema);

module.exports = TeamRequirement;
