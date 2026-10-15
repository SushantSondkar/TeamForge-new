const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/teamforge";
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log("MongoDB connected successfully via MONGODB_URI");

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
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    console.error("Local MongoDB is not running. Please start local MongoDB using 'brew services start mongodb-community' or 'mongod'.");
  }
};

module.exports = connectDB;
