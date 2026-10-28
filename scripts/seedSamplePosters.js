/**
 * scripts/seedSamplePosters.js
 * Creates 3 upcoming sample events with sample posters (portrait, square, wide)
 * for testing the dashboard carousel.
 * 
 * Safety Rule: REFUSES to run in production. Never runs automatically on startup.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const User = require("../models/User");
const { saveEventPoster, getIndiaStartOfToday } = require("../utils/eventService");

if (process.env.NODE_ENV === "production") {
  console.error("❌ Refusing to run seedSamplePosters.js in production environment.");
  process.exit(1);
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/teamforge";
  console.log("Connecting to database:", mongoUri);
  await mongoose.connect(mongoUri);

  try {
    // Find or create a creator for sample events
    let creator = await User.findOne({ isAdmin: true });
    if (!creator) {
      creator = await User.findOne({ isOrganizer: true, organizerStatus: "APPROVED" });
    }
    if (!creator) {
      creator = await User.findOne({});
    }

    if (!creator) {
      console.error("No user found to assign as creator for sample events. Please register a user first.");
      process.exit(1);
    }

    const todayIST = getIndiaStartOfToday();

    const sampleDefinitions = [
      {
        file: "poster-portrait.png",
        name: "[SAMPLE] AI Nexus Hackathon 2026",
        organizer: "KKWIEER AI & Data Science Club",
        type: "Hackathon",
        mode: "Offline",
        daysAhead: 5,
        deadlineDaysAhead: 3,
        description: "Build autonomous agents, generative AI workflows, and novel campus tools in a 36-hour sprint.",
        link: "https://ainexus.kkwagh.edu.in"
      },
      {
        file: "poster-square.png",
        name: "[SAMPLE] Robotics & Embedded Summit",
        organizer: "Robotics Innovation Circle",
        type: "Competition",
        mode: "Hybrid",
        daysAhead: 12,
        deadlineDaysAhead: 8,
        description: "Design autonomous rover navigation and real-time microcontroller hardware systems.",
        link: "https://robotics.kkwagh.edu.in"
      },
      {
        file: "poster-wide.png",
        name: "[SAMPLE] GreenTech & Clean Energy Challenge",
        organizer: "EcoInnovators Student Chapter",
        type: "Competition",
        mode: "Online",
        daysAhead: 20,
        deadlineDaysAhead: 15,
        description: "Develop scalable software solutions for carbon accounting, campus waste optimization, and renewables.",
        link: "https://greentech.kkwagh.edu.in"
      }
    ];

    console.log(`Seeding ${sampleDefinitions.length} sample events with posters...`);

    for (const def of sampleDefinitions) {
      const posterPath = path.join(__dirname, "..", "tools", "sample-posters", def.file);
      if (!fs.existsSync(posterPath)) {
        throw new Error(`Sample poster file not found at ${posterPath}`);
      }
      const posterBuffer = fs.readFileSync(posterPath);

      const eventDate = new Date(todayIST.getTime() + def.daysAhead * 24 * 60 * 60 * 1000);
      const deadlineDate = new Date(todayIST.getTime() + def.deadlineDaysAhead * 24 * 60 * 60 * 1000);

      // Upsert event by name to avoid duplicate spam on re-runs
      let event = await Event.findOne({ name: def.name });
      if (!event) {
        event = new Event({
          name: def.name,
          organizer: def.organizer,
          type: def.type,
          mode: def.mode,
          date: eventDate,
          deadline: deadlineDate,
          description: def.description,
          link: def.link,
          createdBy: creator._id,
          hasPoster: true
        });
      } else {
        event.date = eventDate;
        event.deadline = deadlineDate;
        event.hasPoster = true;
      }
      await event.save();

      await saveEventPoster(event._id, posterBuffer, creator._id);
      console.log(`✓ Seeded "${event.name}" (${def.type}) with ${def.file} (${posterBuffer.length} bytes)`);
    }

    console.log("\n🎉 All 3 sample events and posters successfully seeded!");
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error("Error seeding sample posters:", err);
    process.exit(1);
  });
}

module.exports = run;

