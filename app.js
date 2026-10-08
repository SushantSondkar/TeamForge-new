const express = require("express");
const app = express();
const ejsMate = require("ejs-mate");
const connectDB = require("./models/db");

// Import Routes
const indexRoutes = require("./routes/index");
const teamReqRoutes = require("./routes/teamRequirements");

// Connect to Database
connectDB();

// App Configurations
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);

// Middleware
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use Routes
app.use("/", indexRoutes);
app.use("/team-requirement", teamReqRoutes);

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).send("Page Not Found");
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  const { status = 500, message = "Internal Server Error" } = err;
  console.error("Global Error Handler caught:", err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).send(`Validation Error: ${err.message}`);
  }

  res.status(status).send(message);
});

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
