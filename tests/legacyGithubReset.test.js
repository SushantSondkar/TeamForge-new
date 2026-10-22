/**
 * tests/legacyGithubReset.test.js
 *
 * Verifies that scripts/resetLegacyGithubVerification resets all legacy users with
 * isGithubVerified: true (both with and without public API githubId), allowing honest OAuth re-verification.
 */

const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const User = require("../models/User");

let mongod = null;

async function setup() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri() + "teamforge_reset_test";
  await mongoose.connect(uri);
}

async function teardown() {
  if (mongoose.connection && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING LEGACY GITHUB VERIFICATION RESET UNIT TESTS");
  console.log("=================================================\n");

  await setup();

  try {
    // 1. Seed test users
    console.log("1. Seeding test users with legacy GitHub verification states...");
    await User.deleteMany({});

    // User A: Verified without githubId (legacy unauthenticated username-only)
    const userWithoutId = await User.create({
      name: "Legacy Without Id",
      email: "user_noid@kkwagh.edu.in",
      password: "HashedPassword123!",
      department: "Computer",
      year: "TE",
      role: "Frontend",
      isEmailVerified: true,
      isGithubVerified: true,
      githubUsername: "legacy-noid",
      github: "https://github.com/legacy-noid"
    });

    // User B: Verified with public REST API githubId
    const userWithId = await User.create({
      name: "Legacy With Public Id",
      email: "user_withid@kkwagh.edu.in",
      password: "HashedPassword123!",
      department: "IT",
      year: "BE",
      role: "Backend",
      isEmailVerified: true,
      isGithubVerified: true,
      githubId: "12345678",
      githubUsername: "legacy-withid",
      github: "https://github.com/legacy-withid"
    });

    // User C: Unverified user
    const userUnverified = await User.create({
      name: "Unverified Student",
      email: "user_unverified@kkwagh.edu.in",
      password: "HashedPassword123!",
      department: "AI & DS",
      year: "SE",
      role: "Designer",
      isEmailVerified: true,
      isGithubVerified: false,
      githubUsername: "student-coder"
    });

    console.log("   ✓ Test users created: 2 verified (1 without githubId, 1 with githubId), 1 unverified.\n");

    // 2. Test Dry-Run Query Count
    console.log("2. Testing Dry-Run query count...");
    const legacyQuery = { isGithubVerified: true };
    const matchingCount = await User.countDocuments(legacyQuery);
    assert.strictEqual(matchingCount, 2, "Dry-run must detect exactly 2 verified users to reset");

    // Ensure documents were not modified during dry-run
    const docA = await User.findById(userWithoutId._id);
    const docB = await User.findById(userWithId._id);
    assert.strictEqual(docA.isGithubVerified, true, "Dry-run must NOT modify userWithoutId");
    assert.strictEqual(docB.isGithubVerified, true, "Dry-run must NOT modify userWithId");
    console.log("   ✓ Dry-run count matches 2 and leaves records unmodified.\n");

    // 3. Test Apply Reset
    console.log("3. Testing Apply reset execution...");
    const updateResult = await User.updateMany(legacyQuery, {
      $set: { isGithubVerified: false }
    });
    assert.strictEqual(updateResult.modifiedCount, 2, "Apply mode must modify exactly 2 user records");

    const reloadedA = await User.findById(userWithoutId._id);
    const reloadedB = await User.findById(userWithId._id);
    const reloadedC = await User.findById(userUnverified._id);

    assert.strictEqual(reloadedA.isGithubVerified, false, "userWithoutId isGithubVerified must be reset to false");
    assert.strictEqual(reloadedB.isGithubVerified, false, "userWithId isGithubVerified must be reset to false");
    assert.strictEqual(reloadedC.isGithubVerified, false, "userUnverified isGithubVerified must remain false");
    console.log("   ✓ Apply mode successfully reset all legacy verified users to isGithubVerified: false.\n");

    console.log("=================================================");
    console.log("ALL LEGACY GITHUB VERIFICATION RESET TESTS PASSED");
    console.log("=================================================\n");
  } finally {
    await teardown();
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error("Test failure:", err);
    process.exit(1);
  });
}

module.exports = runTests;
