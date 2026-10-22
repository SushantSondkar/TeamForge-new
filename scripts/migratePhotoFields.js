/**
 * scripts/migratePhotoFields.js
 *
 * Migration script to backfill legacy photo/avatar fields into profilePic.
 * Copies legacy avatar or photo into profilePic when profilePic is empty,
 * ensuring consistency across all User documents without relying solely on Mongoose pre-save hooks.
 *
 * Usage:
 *   node scripts/migratePhotoFields.js           # Dry-run (default: reports count, changes nothing)
 *   node scripts/migratePhotoFields.js --apply   # Persists migrations to MongoDB
 *
 * Ground Rules:
 *   - Supports --dry-run (default) and --apply.
 *   - Prints how many users matched and how many were migrated.
 *   - Never prints photo data URLs, credentials, or secrets.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../models/db");
const User = require("../models/User");

async function run() {
  const isApply = process.argv.includes("--apply");
  const modeLabel = isApply ? "APPLY (CHANGES WILL PERSIST)" : "DRY RUN";

  console.log("=================================================");
  console.log(`PHOTO FIELD MIGRATION [MODE: ${modeLabel}]`);
  console.log("=================================================\n");

  try {
    await connectDB();
  } catch (err) {
    console.error("FATAL: Failed to connect to database:", err.message);
    process.exit(1);
  }

  // Find users whose profilePic is missing/empty, but have avatar or photo populated
  const query = {
    $and: [
      {
        $or: [
          { profilePic: { $exists: false } },
          { profilePic: null },
          { profilePic: "" }
        ]
      },
      {
        $or: [
          { avatar: { $exists: true, $ne: null, $ne: "" } },
          { photo: { $exists: true, $ne: null, $ne: "" } }
        ]
      }
    ]
  };

  try {
    const candidateUsers = await User.find(query).select("_id name email avatar photo profilePic");
    const matchingCount = candidateUsers.length;

    console.log(`Found ${matchingCount} user(s) with empty profilePic and legacy avatar/photo populated.`);

    if (matchingCount === 0) {
      console.log("No legacy user records need migration. Database is already synchronized.");
      await mongoose.disconnect();
      return;
    }

    if (!isApply) {
      console.log(`\n[DRY RUN] ${matchingCount} record(s) would be updated with profilePic = avatar || photo.`);
      console.log("No database modifications were made.");
      console.log("To persist changes, run with: node scripts/migratePhotoFields.js --apply\n");
      await mongoose.disconnect();
      return;
    }

    let modifiedCount = 0;
    for (const doc of candidateUsers) {
      const targetPic = (doc.avatar || doc.photo || "").trim();
      if (!targetPic) continue;

      await User.updateOne(
        { _id: doc._id },
        {
          $set: {
            profilePic: targetPic,
            avatar: targetPic,
            photo: targetPic
          }
        }
      );
      modifiedCount++;
    }

    console.log(`\n[APPLY SUCCESS] Successfully migrated ${modifiedCount} user record(s).`);
    console.log("All matching profiles now have profilePic populated and synchronized.\n");
  } catch (err) {
    console.error("ERROR during migration execution:", err.message);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error("Unhandled rejection:", err);
    process.exit(1);
  });
}

module.exports = run;
