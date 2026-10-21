/**
 * scripts/markExistingVerified.js
 * 
 * One-time manual migration script to mark existing users verified if they were
 * created before a specified cutoff date.
 * 
 * Usage:
 *   node scripts/markExistingVerified.js <cutoff-date>
 * 
 * Examples:
 *   node scripts/markExistingVerified.js 2026-10-21
 *   node scripts/markExistingVerified.js 2026-10-21T00:00:00Z
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../models/db");
const User = require("../models/User");

async function main() {
  const cutoffArg = process.argv[2];

  if (!cutoffArg) {
    console.error("ERROR: Cutoff date argument is required.");
    console.log(`
Usage:
  node scripts/markExistingVerified.js <cutoff-date>

Examples:
  node scripts/markExistingVerified.js 2026-10-21
  node scripts/markExistingVerified.js 2026-10-21T00:00:00Z
    `);
    process.exit(1);
  }

  const cutoffDate = new Date(cutoffArg);
  if (isNaN(cutoffDate.getTime())) {
    console.error(`ERROR: '${cutoffArg}' is not a valid date string.`);
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...`);
  await connectDB();

  try {
    console.log(`Finding unverified users created before ${cutoffDate.toISOString()}...`);

    const result = await User.updateMany(
      {
        createdAt: { $lt: cutoffDate },
        isEmailVerified: { $ne: true }
      },
      {
        $set: {
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null
        }
      }
    );

    console.log(`✓ Migration complete! Successfully verified ${result.modifiedCount} user(s) created before ${cutoffDate.toISOString()}.`);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
