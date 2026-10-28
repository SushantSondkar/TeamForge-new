const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const Event = require("../models/Event");
const EventPoster = require("../models/EventPoster");
const Notification = require("../models/Notification");
const TeamRequirement = require("../models/TeamRequirement");
const requireLogin = require("../middleware/auth");
const {
  detectImageSignature,
  saveEventPoster,
  removeEventPoster,
  deleteEventAndPoster,
  generatePosterETag
} = require("../utils/eventService");

// Rate limiter for poster upload and modification actions
const posterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many poster upload attempts. Please try again later."
});

// Helper ensuring caller is authorized to create/publish events
function canManageEvents(user) {
  return Boolean(user && (user.isAdmin || (user.isOrganizer && user.organizerStatus === "APPROVED")));
}

// Helper ensuring caller is authorized to edit/delete/manage a specific event and its poster
function canManageEvent(user, event) {
  if (!user || !event) return false;
  if (user.isAdmin) return true;
  if (event.createdBy && event.createdBy.equals(user._id)) {
    return Boolean(user.isOrganizer && user.organizerStatus === "APPROVED");
  }
  return false;
}

// -------------------------------------------------------------
// 1. GET /events - List all events
// -------------------------------------------------------------
router.get("/", requireLogin, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    const currentUser = req.user || null;

    // Attach team counts and user lock state
    const eventsWithMeta = await Promise.all(
      events.map(async (evt) => {
        const teamCount = await TeamRequirement.countDocuments({ eventId: evt._id });
        const isLocked = currentUser && currentUser.lockedEvents && currentUser.lockedEvents.includes(evt._id.toString());
        return {
          ...evt.toObject(),
          teamCount,
          isLocked
        };
      })
    );

    res.render("events/index", {
      events: eventsWithMeta,
      currentUser
    });
  } catch (err) {
    console.error("Error loading events list:", err.message);
    res.render("events/index", { events: [], currentUser: req.user || null, error: "Failed to load events." });
  }
});

// -------------------------------------------------------------
// 2. GET /events/new - Render event creation form (Protected: Admin or Approved Organizer)
// -------------------------------------------------------------
router.get("/new", requireLogin, (req, res) => {
  if (!canManageEvents(req.user)) {
    return res.status(403).render("events/new", {
      error: "Forbidden: Only approved organizers or administrators can publish campus events.",
      currentUser: req.user
    });
  }
  res.render("events/new", { error: null, currentUser: req.user });
});

// -------------------------------------------------------------
// 3. POST /events/new - Create a new event with optional poster upload
// -------------------------------------------------------------
router.post("/new", requireLogin, posterLimiter, async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return res.status(403).send("Forbidden: Only approved organizers or administrators can create events.");
    }

    if (req.fileValidationError) {
      return res.status(400).render("events/new", {
        error: req.fileValidationError,
        currentUser: req.user
      });
    }

    const { name, organizer, date, deadline, mode, type, link, description } = req.body;

    if (!name || !organizer || !date || !deadline) {
      return res.status(400).render("events/new", {
        error: "Name, organizer, event date, and registration deadline are required.",
        currentUser: req.user
      });
    }

    // Validate uploaded poster image signature
    if (req.file) {
      const detected = detectImageSignature(req.file.buffer);
      if (!detected) {
        return res.status(400).render("events/new", {
          error: "Invalid file type. Only JPG, PNG or WebP images are allowed.",
          currentUser: req.user
        });
      }
    }

    const event = new Event({
      name: String(name).trim(),
      organizer: String(organizer).trim(),
      date: new Date(date),
      deadline: new Date(deadline),
      mode: mode || "Offline",
      type: type || "Hackathon",
      link: link ? String(link).trim() : "",
      description: description ? String(description).trim() : "",
      createdBy: req.user._id,
      hasPoster: Boolean(req.file)
    });

    await event.save();

    if (req.file) {
      await saveEventPoster(event._id, req.file.buffer, req.user._id);
    }

    console.log(`New event created: ${event.name} by user ID ${req.user._id}`);
    res.redirect(`/events/${event._id}`);
  } catch (err) {
    console.error("Error creating event:", err.message);
    res.status(400).render("events/new", {
      error: `Failed to create event: ${err.message}`,
      currentUser: req.user
    });
  }
});

// -------------------------------------------------------------
// 4. GET /events/:id/poster - Serve event poster binary safely
// -------------------------------------------------------------
router.get("/:id/poster", requireLogin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).send("Poster not found.");
    }

    // Safety check: Never serve a poster whose event no longer exists
    const eventExists = await Event.exists({ _id: req.params.id });
    if (!eventExists) {
      return res.status(404).send("Event not found.");
    }

    const poster = await EventPoster.findOne({ eventId: req.params.id });
    if (!poster || !poster.data) {
      return res.status(404).send("Poster not found.");
    }

    const etag = generatePosterETag(poster.data, poster.updatedAt);
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    res.set("Content-Type", poster.contentType || "image/jpeg");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    res.set("ETag", etag);

    return res.send(poster.data);
  } catch (err) {
    console.error("Error serving event poster:", err.message);
    return res.status(500).send("Error loading event poster.");
  }
});

// -------------------------------------------------------------
// 5. GET /events/:id/edit - Render event & poster editing form
// -------------------------------------------------------------
router.get("/:id/edit", requireLogin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).render("404", { currentUser: req.user || null, pageTitle: "404 - Not Found" });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).render("404", { currentUser: req.user || null, pageTitle: "404 - Not Found" });
    }

    if (!canManageEvent(req.user, event)) {
      return res.status(403).send("Forbidden: You are not authorized to edit this event.");
    }

    const posterExists = Boolean(event.hasPoster || (await EventPoster.exists({ eventId: event._id })));

    res.render("events/edit", {
      event,
      hasPoster: posterExists,
      currentUser: req.user,
      error: null
    });
  } catch (err) {
    console.error("Error loading event edit form:", err.message);
    res.redirect("/events");
  }
});

// -------------------------------------------------------------
// 6. POST /events/:id/edit - Update event details & replace/remove poster
// -------------------------------------------------------------
router.post("/:id/edit", requireLogin, posterLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).send("Event not found.");
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found.");
    }

    if (!canManageEvent(req.user, event)) {
      return res.status(403).send("Forbidden: You are not authorized to edit this event.");
    }

    const posterExists = Boolean(event.hasPoster || (await EventPoster.exists({ eventId: event._id })));

    if (req.fileValidationError) {
      return res.status(400).render("events/edit", {
        event,
        hasPoster: posterExists,
        currentUser: req.user,
        error: req.fileValidationError
      });
    }

    const { name, organizer, date, deadline, mode, type, link, description, removePoster } = req.body;

    if (!name || !organizer || !date || !deadline) {
      return res.status(400).render("events/edit", {
        event,
        hasPoster: posterExists,
        currentUser: req.user,
        error: "Name, organizer, event date, and registration deadline are required."
      });
    }

    if (req.file) {
      const detected = detectImageSignature(req.file.buffer);
      if (!detected) {
        return res.status(400).render("events/edit", {
          event,
          hasPoster: posterExists,
          currentUser: req.user,
          error: "Invalid file type. Only JPG, PNG or WebP images are allowed."
        });
      }
    }

    event.name = String(name).trim();
    event.organizer = String(organizer).trim();
    event.date = new Date(date);
    event.deadline = new Date(deadline);
    if (mode) event.mode = mode;
    if (type) event.type = type;
    event.link = link ? String(link).trim() : "";
    event.description = description ? String(description).trim() : "";

    // Handle poster removal
    if (removePoster === "true" || removePoster === "on") {
      await removeEventPoster(event._id);
      event.hasPoster = false;
    }

    // Handle poster replacement
    if (req.file) {
      await saveEventPoster(event._id, req.file.buffer, req.user._id);
      event.hasPoster = true;
    }

    await event.save();
    res.redirect(`/events/${event._id}`);
  } catch (err) {
    console.error("Error updating event:", err.message);
    res.status(400).send(err.message);
  }
});

// -------------------------------------------------------------
// 7. POST /events/:id/poster/remove - Remove poster action
// -------------------------------------------------------------
router.post("/:id/poster/remove", requireLogin, posterLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).send("Event not found.");
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found.");
    }

    if (!canManageEvent(req.user, event)) {
      return res.status(403).send("Forbidden: You are not authorized to remove this poster.");
    }

    await removeEventPoster(event._id);

    // If an administrator removed the poster and is NOT the creator, notify the organizer
    if (req.user.isAdmin && event.createdBy && !event.createdBy.equals(req.user._id)) {
      await Notification.create({
        userId: event.createdBy,
        type: "warning",
        title: "Event poster removed by administrator",
        subtitle: `The poster for your event "${event.name}" was removed by an administrator.`,
        link: `/events/${event._id}`,
        read: false
      });
    }

    const referer = req.headers.referer || `/events/${event._id}`;
    res.redirect(referer);
  } catch (err) {
    console.error("Error removing event poster:", err.message);
    res.status(400).send(err.message);
  }
});

// -------------------------------------------------------------
// 8. POST /events/:id/delete - Delete event and its poster cascade
// -------------------------------------------------------------
router.post("/:id/delete", requireLogin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).send("Event not found.");
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found.");
    }

    if (!canManageEvent(req.user, event)) {
      return res.status(403).send("Forbidden: You are not authorized to delete this event.");
    }

    await deleteEventAndPoster(event._id);
    console.log(`Event "${event.name}" and associated poster deleted.`);
    res.redirect("/events");
  } catch (err) {
    console.error("Error deleting event:", err.message);
    res.status(400).send(err.message);
  }
});

// -------------------------------------------------------------
// 9. GET /events/:id - Event detail page & Team creation entry point
// -------------------------------------------------------------
router.get("/:id", requireLogin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).render("404", {
        currentUser: req.user || null,
        pageTitle: "404 - Page Not Found"
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).render("404", {
        currentUser: req.user || null,
        pageTitle: "404 - Page Not Found"
      });
    }

    // Check if poster exists
    const hasPoster = Boolean(event.hasPoster || (await EventPoster.exists({ eventId: event._id })));

    // Retrieve teams registered for this event (omit creator email to isolate contact info)
    const teams = await TeamRequirement.find({ eventId: event._id })
      .populate("createdBy", "name department role")
      .sort({ createdAt: -1 });

    const currentUser = req.user || null;
    const isLocked = currentUser && currentUser.lockedEvents && currentUser.lockedEvents.includes(event._id.toString());
    const userTeam = currentUser ? teams.find(t => t.createdBy && t.createdBy._id.equals(currentUser._id)) : null;

    res.render("events/show", {
      event,
      hasPoster,
      teams,
      currentUser,
      isLocked,
      userTeam
    });
  } catch (err) {
    console.error("Error loading event detail:", err.message);
    res.redirect("/events");
  }
});

module.exports = router;
