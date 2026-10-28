const rateLimit = require("express-rate-limit");

// Limiter for transactional actions like sending invites and applications
const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many actions submitted from this IP. Please try again after 15 minutes.",
  handler: (req, res, next, options) => {
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(options.statusCode).json({ error: options.message });
    }
    res.status(options.statusCode).send(options.message);
  }
});

// Limiter for peer reviews and story submissions
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many submissions from this IP. Please try again after 15 minutes.",
  handler: (req, res, next, options) => {
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(options.statusCode).json({ error: options.message });
    }
    res.status(options.statusCode).send(options.message);
  }
});

// Limiter for organizer application submissions
const organizerApplyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many organizer applications submitted from this IP. Please try again after 15 minutes.",
  handler: (req, res, next, options) => {
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(options.statusCode).json({ error: options.message });
    }
    res.status(options.statusCode).send(options.message);
  }
});

module.exports = {
  actionLimiter,
  reviewLimiter,
  organizerApplyLimiter
};
