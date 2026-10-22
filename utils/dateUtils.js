/**
 * utils/dateUtils.js
 * 
 * Centralized Date & Time Formatting Service for TeamForge.
 * Strictly forces "Asia/Kolkata" (IST) timezone across all rendered views and emails.
 */

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const DEFAULT_LOCALE = "en-IN";

/**
 * Format date for display (e.g., "25 Oct 2026" or "Sunday, 25 Oct 2026")
 * 
 * @param {Date|string|number} date 
 * @param {Intl.DateTimeFormatOptions} [options] 
 * @returns {string} Formatted date string in Asia/Kolkata time
 */
function formatDate(date, options = {}) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";

  const mergedOptions = {
    timeZone: DEFAULT_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options
  };

  return d.toLocaleDateString(DEFAULT_LOCALE, mergedOptions);
}

/**
 * Format date and time for display (e.g., "25 Oct 2026, 05:30 pm")
 * 
 * @param {Date|string|number} date 
 * @param {Intl.DateTimeFormatOptions} [options] 
 * @returns {string} Formatted datetime string in Asia/Kolkata time
 */
function formatDateTime(date, options = {}) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";

  const mergedOptions = {
    timeZone: DEFAULT_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options
  };

  return d.toLocaleString(DEFAULT_LOCALE, mergedOptions);
}

/**
 * Format time for display (e.g., "05:30 pm")
 * 
 * @param {Date|string|number} date 
 * @param {Intl.DateTimeFormatOptions} [options] 
 * @returns {string} Formatted time string in Asia/Kolkata time
 */
function formatTime(date, options = {}) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";

  const mergedOptions = {
    timeZone: DEFAULT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options
  };

  return d.toLocaleTimeString(DEFAULT_LOCALE, mergedOptions);
}

module.exports = {
  formatDate,
  formatDateTime,
  formatTime,
  DEFAULT_TIMEZONE,
  DEFAULT_LOCALE
};

