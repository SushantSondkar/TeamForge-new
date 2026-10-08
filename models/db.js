const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/teamforge";
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log("MongoDB connected successfully");
    const seedUsers = require("./seedUsers");
    await seedUsers();
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    console.error("Local MongoDB is not running. Please start local MongoDB using 'brew services start mongodb-community' or 'mongod'.");
  }
};

module.exports = connectDB;
