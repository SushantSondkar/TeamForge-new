const mongoose = require("mongoose");
let memoryServerInstance = null;
let connectionPromise = null;

const connectDB = async () => {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    let mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/teamforge";

    try {
      await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 2500
      });
      console.log(`MongoDB connected successfully via MONGODB_URI (${mongoURI})`);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        try {
          console.log(`Local MongoDB not reachable at ${mongoURI}. Starting embedded local database engine for development/demo...`);
          const { MongoMemoryServer } = require("mongodb-memory-server");
          memoryServerInstance = await MongoMemoryServer.create();
          mongoURI = memoryServerInstance.getUri() + "teamforge";
          process.env.MONGODB_URI = mongoURI;
          await mongoose.connect(mongoURI);
          console.log(`Embedded MongoDB connected successfully at ${mongoURI}`);
        } catch (innerErr) {
          console.error("Failed to start embedded MongoDB:", innerErr.message);
          throw innerErr;
        }
      } else {
        console.error(`MongoDB connection error: ${error.message}`);
        throw error;
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
