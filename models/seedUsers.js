const User = require("./User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

let seedPasswordHash = null;

const initialCandidates = [
  {
    name: "Aaradhya Wabale",
    email: "aaradhya@demo.local",
    password: seedPasswordHash,
    role: "Lead Coordinator",
    skills: [
      { name: "JavaScript", level: 5 },
      { name: "React", level: 4 },
      { name: "Node.js", level: 4 },
      { name: "System Design", level: 4 },
      { name: "MongoDB", level: 4 }
    ],
    credibility: 0.9,
    teammateRating: 0.95,
    competitionWins: 2,
    reviewCount: 10,
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: []
  },
  {
    name: "Harsh Dhavane",
    email: "harsh@demo.local",
    password: seedPasswordHash,
    role: "React Developer",
    skills: [
      { name: "React", level: 5 },
      { name: "JavaScript", level: 5 },
      { name: "HTML", level: 5 },
      { name: "CSS", level: 4 },
      { name: "System Design", level: 4 },
      { name: "Node.js", level: 4 },
      { name: "MongoDB", level: 4 },
      { name: "AWS", level: 4 },
      { name: "Docker", level: 3 }
    ],
    credibility: 0.95,
    teammateRating: 0.96,
    competitionWins: 2,
    reviewCount: 12,
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: []
  },
  {
    name: "Gayatri Jadhav",
    email: "gayatri@demo.local",
    password: seedPasswordHash,
    role: "Python Specialist",
    skills: [
      { name: "Python", level: 5 },
      { name: "Machine Learning", level: 4 },
      { name: "Pandas", level: 4 },
      { name: "NumPy", level: 4 },
      { name: "System Design", level: 4 },
      { name: "Node.js", level: 4 },
      { name: "MongoDB", level: 3 },
      { name: "AWS", level: 3 }
    ],
    credibility: 0.90,
    teammateRating: 0.92,
    competitionWins: 1,
    reviewCount: 8,
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: []
  },
  {
    name: "Sanket Pawar",
    email: "sanket@demo.local",
    password: seedPasswordHash,
    role: "UI-UX Designer",
    skills: [
      { name: "Figma", level: 5 },
      { name: "UI Design", level: 5 },
      { name: "UX Design", level: 4 },
      { name: "CSS", level: 4 },
      { name: "HTML", level: 4 },
      { name: "System Design", level: 3 },
      { name: "Node.js", level: 3 },
      { name: "MongoDB", level: 3 }
    ],
    credibility: 0.85,
    teammateRating: 0.88,
    competitionWins: 1,
    reviewCount: 6,
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: []
  },
  {
    name: "Kalpesh Shinde",
    email: "kalpesh@demo.local",
    password: seedPasswordHash,
    role: "Backend Developer",
    skills: [
      { name: "Node.js", level: 4 },
      { name: "MongoDB", level: 4 },
      { name: "System Design", level: 4 },
      { name: "Docker", level: 3 },
      { name: "AWS", level: 3 }
    ],
    credibility: 0.75,
    teammateRating: 0.80,
    competitionWins: 0,
    reviewCount: 4,
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: []
  },
  {
    name: "Atmaj Gaikwad",
    email: "atmaj@demo.local",
    password: seedPasswordHash,
    role: "DevOps Engineer",
    skills: [
      { name: "Docker", level: 5 },
      { name: "AWS", level: 5 },
      { name: "Kubernetes", level: 4 },
      { name: "Linux", level: 5 }
    ],
    credibility: 0.80,
    teammateRating: 0.85,
    competitionWins: 1,
    reviewCount: 5,
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: []
  },
  {
    name: "Bhakti Lad",
    email: "bhakti@demo.local",
    password: seedPasswordHash,
    role: "QA Engineer",
    skills: [
      { name: "Testing", level: 5 },
      { name: "Selenium", level: 4 },
      { name: "JavaScript", level: 3 }
    ],
    credibility: 0.70,
    teammateRating: 0.75,
    competitionWins: 0,
    reviewCount: 3,
    availability: 0.5,
    lastActive: new Date(),
    lockedEvents: []
  },
  // Condition 1 Test User: Missing required skills (only knows HTML/CSS/JS, missing System Design & Node.js & MongoDB)
  {
    name: "Rohan Patil",
    email: "rohan@demo.local",
    password: seedPasswordHash,
    role: "Junior Web Developer",
    skills: [
      { name: "HTML", level: 4 },
      { name: "CSS", level: 3 },
      { name: "JavaScript", level: 3 }
    ],
    credibility: 0.6,
    teammateRating: 0.7,
    competitionWins: 0,
    reviewCount: 2,
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: []
  },
  // Condition 2 Test User: Has all skills for Campus_automation, but locked into Campus_automation already!
  {
    name: "Pooja Deshmukh",
    email: "pooja@demo.local",
    password: seedPasswordHash,
    role: "Senior Cloud Architect",
    skills: [
      { name: "System Design", level: 5 },
      { name: "Node.js", level: 5 },
      { name: "MongoDB", level: 5 },
      { name: "AWS", level: 5 }
    ],
    credibility: 0.95,
    teammateRating: 0.95,
    competitionWins: 3,
    reviewCount: 15,
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: ["Campus_automation"]
  },
  // Edge Case Test User: Inactive for 35 days (Activity should be 0)
  {
    name: "Devon Lane",
    email: "devon@demo.local",
    password: seedPasswordHash,
    role: "Systems Specialist",
    skills: [
      { name: "System Design", level: 4 },
      { name: "Node.js", level: 4 },
      { name: "MongoDB", level: 4 }
    ],
    credibility: 0.7,
    teammateRating: 0.7,
    competitionWins: 0,
    reviewCount: 4,
    availability: 1.0,
    lastActive: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days inactive
    lockedEvents: []
  },
  // Edge Case Test User: New user with < 3 reviews (Reputation should be neutral 0.5)
  {
    name: "Neha Sharma",
    email: "neha@demo.local",
    password: seedPasswordHash,
    role: "Associate Engineer",
    skills: [
      { name: "System Design", level: 3 },
      { name: "Node.js", level: 3 },
      { name: "MongoDB", level: 3 }
    ],
    credibility: 0.5,
    teammateRating: 0.9,
    competitionWins: 1,
    reviewCount: 1, // < 3 reviews -> neutral 0.5 reputation
    availability: 1.0,
    lastActive: new Date(),
    lockedEvents: []
  }
];

const Invite = require("./Invite");
const TeamRequirement = require("./TeamRequirement");
const Application = require("./Application");
const Event = require("./Event");

const initialEvents = [
  {
    name: "EQUINOX 2026",
    organizer: "Computer Engineering Department, K.K. Wagh",
    date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    mode: "Offline",
    link: "https://kkwagh.edu.in/equinox",
    description: "Annual National Technical Symposium and 24-hour campus hackathon at K.K. Wagh Institute of Engineering Education & Research."
  },
  {
    name: "Smart India Hackathon (SIH) 2026",
    organizer: "Ministry of Education & K.K. Wagh Committee",
    date: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    mode: "Hybrid",
    link: "https://sih.gov.in",
    description: "Nationwide initiative to provide students with a platform to solve pressing problems of society and industry."
  },
  {
    name: "DevJams KKW '26",
    organizer: "CSI Student Branch",
    date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
    mode: "Offline",
    link: "https://csi-kkwagh.org",
    description: "36-hour rapid product prototyping hackathon focusing on AI, cloud, and edge IoT devices."
  }
];

const initialOpportunityTeams = [
  {
    projectName: "Team Nexus",
    theme: "Hackathon",
    projectRequirement: "Decentralized peer-to-peer collaboration hub",
    deliverables: "Working web application prototype",
    teamSize: 4,
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    roles: [
      {
        title: "Frontend Lead",
        requiredSkills: ["React", "JavaScript"],
        preferredSkills: ["CSS", "HTML"],
        proficiency: "Intermediate",
        openings: 2
      }
    ]
  },
  {
    projectName: "Opportunity Hunters",
    theme: "College Project",
    projectRequirement: "Intelligent campus placement portal",
    deliverables: "Backend API and database schemas",
    teamSize: 3,
    deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    roles: [
      {
        title: "Backend Specialist",
        requiredSkills: ["Node.js", "MongoDB"],
        preferredSkills: ["System Design"],
        proficiency: "Intermediate",
        openings: 1
      }
    ]
  },
  {
    projectName: "Agratas",
    theme: "Independent Project",
    projectRequirement: "High-performance IoT telemetry monitor",
    deliverables: "Production dashboard and cloud pipelines",
    teamSize: 5,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    roles: [
      {
        title: "Fullstack Architect",
        requiredSkills: ["React", "Node.js", "MongoDB"],
        preferredSkills: ["JavaScript"],
        proficiency: "Advanced",
        openings: 1
      }
    ]
  },
  {
    projectName: "Team Jalvedh",
    theme: "Competition",
    projectRequirement: "Underwater robotics navigation software",
    deliverables: "Embedded control firmware and telemetry GUI",
    teamSize: 4,
    deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
    roles: [
      {
        title: "Rust Engineer",
        requiredSkills: ["Rust", "Embedded Systems"],
        preferredSkills: ["Linux"],
        proficiency: "Advanced",
        openings: 1
      }
    ]
  },
  {
    projectName: "Krypton Web",
    theme: "Hackathon",
    projectRequirement: "Next-generation Web3 portfolio manager",
    deliverables: "Figma wireframes and high-fidelity prototype",
    teamSize: 3,
    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    roles: [
      {
        title: "UI Designer",
        requiredSkills: ["Figma", "UI Design"],
        preferredSkills: ["CSS"],
        proficiency: "Intermediate",
        openings: 1
      }
    ]
  }
];

async function seedUsers() {
  if (process.env.SEED !== "true") {
    console.log("SEED is not 'true'. Skipping seedUsers.");
    return;
  }
  try {
    const randomPassword = crypto.randomBytes(16).toString("hex");
    seedPasswordHash = await bcrypt.hash(randomPassword, 10);
    initialCandidates.forEach(cand => {
      cand.password = seedPasswordHash;
    });

    const existingCount = await User.countDocuments();
    if (existingCount === 0) {
      await User.insertMany(initialCandidates);
      console.log(`Seeded ${initialCandidates.length} test candidates successfully.`);
    } else {
      // Ensure Aaradhya Wabale (current test user) exists
      const current = await User.findOne({ name: "Aaradhya Wabale" });
      if (!current) {
        await User.create(initialCandidates[0]);
      }
      // Ensure other primary candidates exist and have email/password credentials
      for (const cand of initialCandidates) {
        const found = await User.findOne({ name: cand.name });
        if (!found) {
          await User.create(cand);
        } else if (!found.email || !found.password) {
          found.email = cand.email;
          found.password = cand.password;
          await found.save();
        }
      }
      console.log("Candidate database checked, verified, and credentials updated.");
    }

    const aaradhya = await User.findOne({ name: "Aaradhya Wabale" });
    const harsh = await User.findOne({ name: "Harsh Dhavane" });
    const sanket = await User.findOne({ name: "Sanket Pawar" });
    const kalpesh = await User.findOne({ name: "Kalpesh Shinde" });

    // Seed Events if they do not exist
    for (const evt of initialEvents) {
      const existingEvt = await Event.findOne({ name: evt.name });
      if (!existingEvt) {
        await Event.create(evt);
        console.log(`Seeded event: ${evt.name}`);
      }
    }

    const defaultEvent = await Event.findOne({ name: "EQUINOX 2026" }) || await Event.findOne();

    // Seed opportunity teams if they don't exist
    for (const teamData of initialOpportunityTeams) {
      let existingTeam = await TeamRequirement.findOne({ projectName: teamData.projectName });
      if (!existingTeam) {
        // Set creator to kalpesh or harsh so aaradhya can discover and apply
        await TeamRequirement.create({
          ...teamData,
          eventId: defaultEvent ? defaultEvent._id : undefined,
          createdBy: kalpesh ? kalpesh._id : undefined
        });
        console.log(`Seeded opportunity team: ${teamData.projectName}`);
      } else if (!existingTeam.eventId && defaultEvent) {
        existingTeam.eventId = defaultEvent._id;
        await existingTeam.save();
      }
    }

    // Ensure Campus_automation is attributed to Aaradhya Wabale and linked to defaultEvent
    let alphaTeam = await TeamRequirement.findOne({ projectName: "Campus_automation" });
    if (alphaTeam) {
      let changed = false;
      if (aaradhya && !alphaTeam.createdBy) {
        alphaTeam.createdBy = aaradhya._id;
        changed = true;
      }
      if (!alphaTeam.eventId && defaultEvent) {
        alphaTeam.eventId = defaultEvent._id;
        changed = true;
      }
      if (changed) await alphaTeam.save();
    }

    // Ensure a sample received invite exists for Aaradhya Wabale
    if (aaradhya && kalpesh && alphaTeam) {
      const existingReceived = await Invite.findOne({ receiverId: aaradhya._id, status: "PENDING" });
      if (!existingReceived) {
        await Invite.create({
          senderId: kalpesh._id,
          receiverId: aaradhya._id,
          teamRequirementId: alphaTeam._id,
          role: "Lead Systems Architect",
          status: "PENDING"
        });
        console.log("Seeded sample received invite for Aaradhya Wabale.");
      }
    }

    // Seed sample applications for Campus_automation (so team owner can view applicants)
    if (alphaTeam && harsh && sanket) {
      const existingHarshApp = await Application.findOne({ applicantId: harsh._id, teamRequirementId: alphaTeam._id });
      if (!existingHarshApp) {
        await Application.create({
          applicantId: harsh._id,
          teamRequirementId: alphaTeam._id,
          role: "Lead Technical Architect",
          status: "UNDER_REVIEW"
        });
      }

      const existingSanketApp = await Application.findOne({ applicantId: sanket._id, teamRequirementId: alphaTeam._id });
      if (!existingSanketApp) {
        await Application.create({
          applicantId: sanket._id,
          teamRequirementId: alphaTeam._id,
          role: "Lead Technical Architect",
          status: "INTERVIEWING"
        });
      }
    }

    // Seed sample pending applications for Aaradhya (matching Figma mock data)
    if (aaradhya) {
      const jalvedhTeam = await TeamRequirement.findOne({ projectName: "Team Jalvedh" });
      if (jalvedhTeam) {
        const existingJalvedh = await Application.findOne({ applicantId: aaradhya._id, teamRequirementId: jalvedhTeam._id });
        if (!existingJalvedh) {
          await Application.create({
            applicantId: aaradhya._id,
            teamRequirementId: jalvedhTeam._id,
            role: "Rust Engineer",
            status: "UNDER_REVIEW"
          });
        }
      }

      const kryptonTeam = await TeamRequirement.findOne({ projectName: "Krypton Web" });
      if (kryptonTeam) {
        const existingKrypton = await Application.findOne({ applicantId: aaradhya._id, teamRequirementId: kryptonTeam._id });
        if (!existingKrypton) {
          await Application.create({
            applicantId: aaradhya._id,
            teamRequirementId: kryptonTeam._id,
            role: "UI Designer",
            status: "INTERVIEWING"
          });
        }
      }
    }
  } catch (err) {
    console.error("Error seeding users and opportunities:", err.message);
  }
}

module.exports = seedUsers;
