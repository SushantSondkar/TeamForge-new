/**
 * scripts/resetLegacyGithubVerification.js
 * 
 * Audits and resets legacy GitHub verifications that were created via the old
 * username-only unauthenticated REST path without real OAuth credentials (githubId).
 * 
 * Usage:
 *   node scripts/resetLegacyGithubVerification.js            (Dry-run, default)
 *   node scripts/resetLegacyGithubVerification.js --dry-run  (Dry-run explicit)
 *   node scripts/resetLegacyGithubVerification.js --apply    (Applies changes)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../models/db");
const User = require("../models/User");

async function run() {
  const isApply = process.argv.includes("--apply");
  const mode = isApply ? "APPLY" : "DRY RUN";

  console.log("=================================================");
  console.log(`LEGACY GITHUB VERIFICATION RESET [MODE: ${mode}]`);
  console.log("=================================================\n");

  await connectDB();

  // Query: Users with isGithubVerified = true but without an OAuth-sourced githubId
  const legacyQuery = {
    isGithubVerified: true,
    $or: [
      { githubId: null },
      { githubId: "" },
      { githubId: { $exists: false } }
    ]
  };

  try {
    const matchingCount = await User.countDocuments(legacyQuery);
    console.log(`Found ${matchingCount} user(s) with isGithubVerified: true lacking an OAuth githubId.`);

    if (matchingCount > 0) {
      const sampleUsers = await User.find(legacyQuery)
        .select("name email githubUsername github")
        .lean();

      console.log("\nMatching users:");
      sampleUsers.forEach((u, i) => {
        const handle = u.githubUsername || u.github || "N/A";
        console.log(`  ${i + 1}. ${u.name} (${u.email}) - Handle: ${handle}`);
      });
    }

    if (!isApply) {
      console.log("\n[DRY RUN] No database modifications were made.");
      console.log("To persist these resets, re-run with: node scripts/resetLegacyGithubVerification.js --apply\n");
    } else {
      const updateResult = await User.updateMany(legacyQuery, {
        $set: { isGithubVerified: false }
      });
      console.log(`\n[APPLY] Successfully updated ${updateResult.modifiedCount} user record(s).`);
      console.log("All legacy unauthenticated verifications have been reset to isGithubVerified: false.\n");
    }
  } catch (err) {
    console.error("Error executing reset script:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    setTimeout(() => process.exit(0), 100).unref();
  }
}

run();
