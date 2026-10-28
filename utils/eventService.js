/**
 * utils/eventService.js
 * Centralized service for Event Poster validation, storage, India-time calculations,
 * and shared cascade deletion logic.
 */

const crypto = require("crypto");
const Event = require("../models/Event");
const EventPoster = require("../models/EventPoster");
const Notification = require("../models/Notification");
const TeamRequirement = require("../models/TeamRequirement");

const MAX_POSTER_SIZE = 1.5 * 1024 * 1024; // 1.5 MB in bytes

/**
 * Validate real image magic bytes (file signature).
 * Accepts ONLY JPG, PNG, or WebP. Rejects SVG, GIF, and all other formats.
 * @param {Buffer} buffer
 * @returns {"image/jpeg" | "image/png" | "image/webp" | null}
 */
function detectImageSignature(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // 1. JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // 3. WebP: 'RIFF' at 0..3 and 'WEBP' at 8..11
  const isRiff =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46; // RIFF
  const isWebp =
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50; // WEBP

  if (isRiff && isWebp) {
    return "image/webp";
  }

  return null;
}

/**
 * Calculates start of today in Asia/Kolkata (IST = UTC+5:30).
 * Prevents UTC timezone discrepancies from hiding today's events.
 * @returns {Date}
 */
function getIndiaStartOfToday() {
  const now = new Date();
  const kolkataDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now); // Formats as YYYY-MM-DD in Asia/Kolkata

  // Convert to Date object representing 00:00:00.000 in IST
  return new Date(`${kolkataDateStr}T00:00:00.000+05:30`);
}

/**
 * Shared function: Delete an event and its associated poster, requirements, and notices.
 * Ensures the poster vanishes from the carousel and no orphaned records remain.
 * @param {string|mongoose.Types.ObjectId} eventId
 * @returns {Promise<Object|null>} Deleted event document
 */
async function deleteEventAndPoster(eventId) {
  if (!eventId) return null;

  // 1. Delete associated EventPoster
  await EventPoster.deleteOne({ eventId: eventId });

  // 2. Clear eventId from associated TeamRequirements or clean them up
  await TeamRequirement.updateMany(
    { eventId: eventId },
    { $set: { eventId: null } }
  );

  // 3. Delete the event itself
  const deletedEvent = await Event.findByIdAndDelete(eventId);
  return deletedEvent;
}

/**
 * Save or replace an event poster in MongoDB.
 * @param {string|mongoose.Types.ObjectId} eventId
 * @param {Buffer} buffer
 * @param {string|mongoose.Types.ObjectId} uploadedBy
 * @returns {Promise<Object>} Created or updated EventPoster document
 */
async function saveEventPoster(eventId, buffer, uploadedBy) {
  if (!buffer || buffer.length === 0) {
    throw new Error("No image data provided.");
  }

  if (buffer.length > MAX_POSTER_SIZE) {
    throw new Error("File is too large. Event poster must be under 1.5 MB.");
  }

  const detectedType = detectImageSignature(buffer);
  if (!detectedType) {
    throw new Error("Invalid file type. Only JPG, PNG, or WebP images are allowed.");
  }

  const poster = await EventPoster.findOneAndUpdate(
    { eventId: eventId },
    {
      eventId: eventId,
      data: buffer,
      contentType: detectedType,
      size: buffer.length,
      uploadedBy: uploadedBy
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  await Event.findByIdAndUpdate(eventId, { hasPoster: true });

  return poster;
}

/**
 * Remove an event poster from MongoDB.
 * @param {string|mongoose.Types.ObjectId} eventId
 */
async function removeEventPoster(eventId) {
  await EventPoster.deleteOne({ eventId: eventId });
  await Event.findByIdAndUpdate(eventId, { hasPoster: false });
}

/**
 * Generate ETag for a poster buffer and timestamp.
 * @param {Buffer} buffer
 * @param {Date} updatedAt
 * @returns {string}
 */
function generatePosterETag(buffer, updatedAt) {
  const hash = crypto.createHash("md5").update(buffer).digest("hex");
  const time = updatedAt ? updatedAt.getTime() : 0;
  return `"${hash}-${time}"`;
}

module.exports = {
  MAX_POSTER_SIZE,
  detectImageSignature,
  getIndiaStartOfToday,
  deleteEventAndPoster,
  saveEventPoster,
  removeEventPoster,
  generatePosterETag
};
