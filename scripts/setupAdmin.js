/**
 * TeamForge Administrator Provisioning Script
 * 
 * Safely provisions or promotes a campus administrator account in MongoDB.
 * Never uses hardcoded default passwords.
 * 
 * Usage:
 *   node scripts/setupAdmin.js promote <email>
 *   node scripts/setupAdmin.js create <name> <email> <password>
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("../models/db");
const User = require("../models/User");

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  if (!action || (action !== "promote" && action !== "create")) {
    console.log(`
Usage:
  node scripts/setupAdmin.js promote <email>
  node scripts/setupAdmin.js create <name> <email> <password>

Examples:
  node scripts/setupAdmin.js promote principal@kkwagh.edu.in
  node scripts/setupAdmin.js create "Campus Admin" admin@kkwagh.edu.in "SecureSecret99#"
    `);
    process.exit(1);
  }

  await connectDB();

  if (action === "promote") {
    const email = args[1];
    if (!email) {
      console.error("Error: Please specify the email to promote to admin.");
      process.exit(1);
    }
    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      console.error(`Error: User with email ${cleanEmail} was not found.`);
      process.exit(1);
    }
    user.isAdmin = true;
    user.isOrganizer = true;
    user.organizerStatus = "APPROVED";
    await user.save();
    console.log(`Success! User ${user.name} (${user.email}) is now an Administrator.`);
    process.exit(0);
  }

  if (action === "create") {
    const name = args[1];
    const email = args[2];
    const password = args[3];

    if (!name || !email || !password) {
      console.error("Error: Please provide name, email, and password.");
      process.exit(1);
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail.endsWith("@kkwagh.edu.in")) {
      console.error("Error: Admin email must end with @kkwagh.edu.in");
      process.exit(1);
    }

    if (password.length < 8) {
      console.error("Error: Admin password must be at least 8 characters long.");
      process.exit(1);
    }

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      existing.isAdmin = true;
      existing.isOrganizer = true;
      existing.organizerStatus = "APPROVED";
      existing.password = await bcrypt.hash(password, 10);
      await existing.save();
      console.log(`Updated existing user ${cleanEmail} as Administrator.`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new User({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      department: "Computer Engineering",
      year: "BE",
      role: "Faculty Coordinator",
      isAdmin: true,
      isOrganizer: true,
      organizerStatus: "APPROVED",
      isEmailVerified: true,
      availability: 1.0,
      credibility: 1.0,
      teammateRating: 1.0
    });

    await newAdmin.save();
    console.log(`Success! Admin user created: ${newAdmin.name} (${newAdmin.email})`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Admin setup failed:", err.message);
  process.exit(1);
});
