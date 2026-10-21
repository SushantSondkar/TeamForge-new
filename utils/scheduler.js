/**
 * utils/scheduler.js
 * 
 * Scheduled job daemon for TeamForge.
 * Periodically triggers checkTimeoutsAndExpiries() with mutual exclusion:
 * 1. In-process boolean lock (isRunning) to prevent overlapping ticks within a single process.
 * 2. Atomic MongoDB lock document on the 'jobs' collection (findOneAndUpdate with lockedUntil)
 *    to prevent duplicate processing across multi-instance or clustered deployments.
 * 3. Uses .unref() on setInterval so it never blocks clean server or test shutdown.
 */

const Job = require("../models/Job");
const { checkTimeoutsAndExpiries } = require("./actionStateMachine");

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5-minute lease safety window
const JOB_NAME = "checkTimeoutsAndExpiries";

let isRunning = false;
let intervalId = null;

/**
 * Attempts to acquire an atomic distributed lock in MongoDB and process-level lock.
 * 
 * @param {string} jobName
 * @param {number} lockDurationMs
 * @returns {Promise<boolean>} True if lock was acquired, false otherwise
 */
async function acquireJobLock(jobName = JOB_NAME, lockDurationMs = DEFAULT_LOCK_DURATION_MS) {
  // 1. In-process overlap prevention
  if (isRunning) {
    return false;
  }

  try {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + lockDurationMs);

    // 2. Ensure the lock document exists (upsert without overwriting existing lockedUntil)
    await Job.updateOne(
      { _id: jobName },
      { $setOnInsert: { lockedUntil: new Date(0), createdAt: now } },
      { upsert: true }
    );

    // 3. Atomically acquire lock if unlocked or previous lock has expired
    const lockedJob = await Job.findOneAndUpdate(
      {
        _id: jobName,
        $or: [
          { lockedUntil: null },
          { lockedUntil: { $lte: now } }
        ]
      },
      {
        $set: {
          lockedUntil: lockExpiresAt,
          lastRunAt: now
        }
      },
      { returnDocument: "after" }
    );

    if (!lockedJob) {
      // Lock is currently held by another server instance
      return false;
    }

    isRunning = true;
    return true;
  } catch (err) {
    console.warn(`[Scheduler] Lock acquisition error for ${jobName}:`, err.message);
    return false;
  }
}

/**
 * Releases the distributed and in-process lock.
 * 
 * @param {string} jobName
 * @returns {Promise<void>}
 */
async function releaseJobLock(jobName = JOB_NAME) {
  isRunning = false;
  try {
    await Job.updateOne(
      { _id: jobName },
      {
        $set: {
          lockedUntil: new Date(0),
          lastFinishedAt: new Date()
        }
      }
    );
  } catch (err) {
    console.warn(`[Scheduler] Could not release lock for ${jobName}:`, err.message);
  }
}

/**
 * Runs a single scheduled execution with atomic locking.
 * 
 * @param {Object} [options]
 * @param {string} [options.jobName=JOB_NAME]
 * @param {number} [options.lockDurationMs=DEFAULT_LOCK_DURATION_MS]
 * @returns {Promise<{ executed: boolean, result?: any, reason?: string }>}
 */
async function runScheduledJob({ jobName = JOB_NAME, lockDurationMs = DEFAULT_LOCK_DURATION_MS } = {}) {
  const acquired = await acquireJobLock(jobName, lockDurationMs);
  if (!acquired) {
    return { executed: false, reason: "locked" };
  }

  try {
    const result = await checkTimeoutsAndExpiries();
    return { executed: true, result };
  } catch (err) {
    console.error("[Scheduler] Error executing scheduled job:", err);
    throw err;
  } finally {
    await releaseJobLock(jobName);
  }
}

/**
 * Starts the scheduler loop with setInterval.
 * Applies .unref() so the timer does not prevent process termination.
 * 
 * @param {number} [intervalMs=DEFAULT_INTERVAL_MS] Interval in milliseconds (default: 10 mins)
 * @returns {NodeJS.Timeout} The timer instance
 */
function startScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
  if (intervalId) {
    return intervalId;
  }

  intervalId = setInterval(async () => {
    try {
      await runScheduledJob();
    } catch (err) {
      console.error("[Scheduler] Interval execution failed:", err.message);
    }
  }, intervalMs);

  // Unref interval so it does not block graceful shutdown or process exit
  if (intervalId && typeof intervalId.unref === "function") {
    intervalId.unref();
  }

  return intervalId;
}

/**
 * Stops the scheduler loop and clears the active interval.
 */
function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
}

module.exports = {
  startScheduler,
  stopScheduler,
  runScheduledJob,
  acquireJobLock,
  releaseJobLock,
  getIsRunning: () => isRunning,
  DEFAULT_INTERVAL_MS,
  JOB_NAME
};
