const express = require('express');
const router = express.Router();

router.get("/", (req, res) => {
  res.render("home");
});

router.get("/discover", (req, res) => {
  res.render("discover");
});

router.get("/notifications", (req, res) => {
  res.render("notifications");
});

router.get("/profile", (req, res) => {
  res.render("profile");
});

module.exports = router;
