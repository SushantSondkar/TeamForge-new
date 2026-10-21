const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const requireLogin = require("../middleware/auth");

// -------------------------------------------------------------
// 1. GET /events - List all events
// -------------------------------------------------------------
router.get("/", async (req, res) => {
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

// Helper ensuring caller is authorized to create/publish events
function canManageEvents(user) {
  return Boolean(user && (user.isAdmin || (user.isOrganizer && user.organizerStatus === "APPROVED")));
}

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
// 3. POST /events/new - Create a new event (Protected: Admin or Approved Organizer)
// -------------------------------------------------------------
router.post("/new", requireLogin, async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return res.status(403).send("Forbidden: Only approved organizers or administrators can create events.");
    }

    const { name, organizer, date, deadline, mode, link, description } = req.body;

    if (!name || !organizer || !date || !deadline) {
      return res.render("events/new", {
        error: "Name, organizer, event date, and registration deadline are required.",
        currentUser: req.user
      });
    }

    const event = new Event({
      name: String(name).trim(),
      organizer: String(organizer).trim(),
      date: new Date(date),
      deadline: new Date(deadline),
      mode: mode || "Offline",
      link: link ? String(link).trim() : "",
      description: description ? String(description).trim() : "",
      createdBy: req.user._id
    });

    await event.save();
    console.log(`New event created: ${event.name} by ${req.user.email}`);

    res.redirect(`/events/${event._id}`);
  } catch (err) {
    console.error("Error creating event:", err.message);
    res.render("events/new", {
      error: `Failed to create event: ${err.message}`,
      currentUser: req.user
    });
  }
});

// -------------------------------------------------------------
// 4. GET /events/:id - Event detail page & Team creation entry point
// -------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).send("Invalid event ID format.");
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).render("home", {
        latestTeam: null,
        recommendedCandidates: [],
        recommendedOpportunities: [],
        myApplications: [],
        teamApplicationCount: 0,
        sentInvites: [],
        receivedInvites: [],
        currentUser: req.user || null,
        error: "Event not found"
      });
    }

    // Retrieve teams registered for this event (omit creator email to isolate contact info)
    const teams = await TeamRequirement.find({ eventId: event._id })
      .populate("createdBy", "name department role")
      .sort({ createdAt: -1 });

    const currentUser = req.user || null;
    const isLocked = currentUser && currentUser.lockedEvents && currentUser.lockedEvents.includes(event._id.toString());
    const userTeam = currentUser ? teams.find(t => t.createdBy && t.createdBy._id.equals(currentUser._id)) : null;

    res.render("events/show", {
      event,
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
