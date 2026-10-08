const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/teamforge", {
        serverSelectionTimeoutMS: 2000 // fail fast if DB is down
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    // Do not exit process in development if Mongo is missing, just mock it or log
    // process.exit(1); 
  }
};

module.exports = connectDB;
