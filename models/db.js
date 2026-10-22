const mongoose = require("mongoose");
let memoryServerInstance = null;
let connectionPromise = null;

const connectDB = async () => {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    // Check if in-memory database is explicitly requested
    if (process.env.USE_MEMORY_DB === "true") {
      console.warn("\n************************************************************");
      console.warn("⚠️  LOUD WARNING: USE_MEMORY_DB=true is active!");
      console.warn("⚠️  Starting in-memory MongoMemoryServer.");
      console.warn("⚠️  ALL DATA WILL BE LOST WHEN THE SERVER RESTARTS / EXITS!");
      console.warn("************************************************************\n");
      try {
        const { MongoMemoryServer } = require("mongodb-memory-server");
        memoryServerInstance = await MongoMemoryServer.create();
        const memUri = memoryServerInstance.getUri() + "teamforge";
        process.env.MONGODB_URI = memUri;
        await mongoose.connect(memUri);
        console.log(`In-memory MongoDB connected successfully at ${memUri}`);
      } catch (memErr) {
        console.error("FATAL: Failed to start in-memory MongoDB:", memErr.message);
        process.exit(1);
      }
    } else {
      // Normal run path: MONGODB_URI must be provided in all environments. No default fallback URI.
      const mongoURI = process.env.MONGODB_URI;

      if (!mongoURI || !mongoURI.trim()) {
        console.error("FATAL: MONGODB_URI environment variable is missing.");
        console.error("Set MONGODB_URI in your environment or set USE_MEMORY_DB=true for local in-memory demos.");
        process.exit(1);
      }

      const maskedUri = mongoURI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
      const connectOptions = {
        serverSelectionTimeoutMS: 5000
      };
      // If URI path lacks database name (e.g. ends in .mongodb.net/), default to teamforge
      if (process.env.MONGODB_DB_NAME) {
        connectOptions.dbName = process.env.MONGODB_DB_NAME;
      } else {
        try {
          const parsed = new URL(mongoURI.replace(/^mongodb(\+srv)?:\/\//, "http://"));
          const pathname = (parsed.pathname || "").replace(/^\//, "").trim();
          if (!pathname) {
            connectOptions.dbName = "teamforge";
          }
        } catch (_) {}
      }

      try {
        await mongoose.connect(mongoURI, connectOptions);
        console.log(`MongoDB connected successfully via MONGODB_URI (${maskedUri})`);
      } catch (error) {
        console.error(`FATAL: Failed to connect to MongoDB (${maskedUri}): ${error.message}`);
        if (error.message.includes("bad auth") || error.message.includes("Authentication failed")) {
          console.error("\n💡 TROUBLESHOOTING MONGODB AUTHENTICATION FAILURE:");
          console.error("1. Check Atlas Database Access: Ensure the username matches exactly and the password is correct.");
          console.error("2. If your password contains special characters (@, :, #, %, ?, etc.), URL-encode them (e.g. @ -> %40).");
          console.error("3. Ensure the Atlas Database User has 'Read and write to any database' privilege.");
          console.error("4. Check Atlas Network Access: Ensure '0.0.0.0/0' (Allow access from anywhere) is configured.\n");
        }
        process.exit(1);
      }
    }

    try {
      if (process.env.SEED === "true") {
        console.log("SEED=true detected. Seeding initial database records...");
        const seedUsers = require("./seedUsers");
        await seedUsers();
      } else {
        console.log("SEED is not true. Skipping seedUsers.");
      }

      // Run legacy action migration and timeout checks
      const { migrateLegacyData, checkTimeoutsAndExpiries } = require("../utils/actionStateMachine");
      await migrateLegacyData();
      await checkTimeoutsAndExpiries();
    } catch (postConnErr) {
      console.warn("Post-connection setup notice:", postConnErr.message);
    }

    return mongoose;
  })();

  return connectionPromise;
};

module.exports = connectDB;
