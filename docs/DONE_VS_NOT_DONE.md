# TeamForge: Final Project Audit — Done vs. Not Done

This document provides a transparent, rigorous accounting of all implemented features, verification levels, and known limitations for the course submission and technical audit.

---

## 1. Feature Implementation & Verification Matrix

| Feature / Milestone | Implementation Status | Verification Level | Technical Notes |
| :--- | :--- | :--- | :--- |
| **Institutional Email Auth (`.edu.in`)** | Done | Verified in Test Suite | Regex validation strictly enforces `@kkwagh.edu.in`; cryptographic token generation and SHA-256 hashing verified. |
| **Password Security & Rate Limiting** | Done | Verified in Test Suite | bcrypt hashing with 10 salt rounds; brute-force protection with express-rate-limit; session invalidation on password change. |
| **Session & CSRF Protection** | Done | Verified in Test Suite | HttpOnly, SameSite, double-submit CSRF cookie protection verified across mutation routes. |
| **Student Profile & Portfolio Setup** | Done | Verified in Test Suite | Multi-skill tagging (levels 1-5), bio, availability settings, and dynamic completeness percentage calculation verified. |
| **GitHub Profile Verification** | Done | **Tested with stubbed HTTP only, not with a real GitHub app** | OAuth verification flow and statistical sync tested via simulated HTTP responses (`setFetch`). Zero token persistence in MongoDB confirmed. |
| **Campus Hackathon Event Publishing** | Done | Verified in Test Suite | Event schema, roles, countdown deadlines, and permission guards (Admin & Approved Organizers) verified. |
| **Team Requirement Wizard** | Done | Verified in Test Suite | 4-step wizard: context, define-team, open-roles, and review steps validated and persisted. |
| **Candidate Discovery & Skill Search** | Done | Verified in Test Suite | MongoDB compound indexed search with skill, event, and keyword filtering; closed teams (openings = 0) strictly excluded. |
| **Candidate Matching Engine** | Done | Verified in Test Suite | Multi-factor weighted formula: round(100 * (40% Skill Match + 25% Credibility + 20% Reputation + 10% Availability + 5% Recency)). Candidates must cover >= 50% of required skills. |
| **Unified Action State Machine** | Done | **Verified (Atomic Concurrency Fixed)** | Symmetric 4-stage lifecycle (`PENDING` -> `ACCEPTED` -> `CONFIRMED` -> `LOCKED`). Atomic `findOneAndUpdate` prevents role double-allocation under race conditions. |
| **Double-Blind Teammate Reviews** | Done | Verified in Test Suite | Reviews remain concealed until both teammates submit reviews or event deadline passes, preventing retaliatory bias. |
| **Peer Skill Endorsement System** | Done | Verified in Test Suite | Endorsed skills increment candidate's verified skill counter on profile. |
| **Mutual Contact Sharing Consent** | Done | Verified in Test Suite | Personal contact details (phone, email, discord) are masked by default; unmasked only when both teammates mutually opt in after locking. |
| **Campus Leaderboard** | Done | Verified in Test Suite | Dynamic score calculation: round(100 * (70% Reputation + 30% Activity Recency)), where Reputation = 40% wins + 40% review rating + 20% shortlists, with daily caching and 5-stage tie-breaking hierarchy. |
| **Background Scheduler Daemon** | Done | Verified in Test Suite | 24h reminders, 7d action timeouts, and atomic distributed lock document (`jobs` collection) with `.unref()` clean exit. |
| **Branding & Social Visual Assets** | Done | Verified in Test Suite | Brand lockup logos, square icon, favicons (16, 32, 180px apple touch), web manifest, Open Graph & Twitter meta tags verified. |
| **Admin Stats & Telemetry** | Done | Verified in Test Suite | Real-time counts across users, verified credentials, locked matches, and reviews with last 7 days delta. |
| **Student Feedback Widget & Export** | Done | Verified in Test Suite | 1-5 star rating form with rate limiting; anonymous CSV export with formula injection escaping (`=`, `+`, `-`, `@`). |
| **Production Health Probe (`/healthz`)** | Done | Verified in Test Suite | Starts cleanly under `NODE_ENV=production` and returns `200 OK {"status":"ok","database":"connected"}`. |
| **Browser UI / Mobile UX Rendering** | Done in EJS/Vanilla CSS | **Not verified in a browser or on a real phone** | Executed and validated in automated Node.js and headless integration test environments; visual layout not manually tested across real physical device viewports. |
| **Production Cloud Deployment** | Configured (`render.yaml`) | **Not verified on deployed site** | Deployment blueprint written for Render + MongoDB Atlas; local production mode verified with in-memory DB, but live remote hosting has not been provisioned. |

---

## 2. Known Limitations & Out-of-Scope Behaviors

Per project design decisions and technical audit findings:

1. **No Manual Requirement Editing, Closing, or Deletion**:
   - Once published, a team requirement cannot be edited, manually closed, or deleted by the team lead or any other user.
   - Status transitions are entirely automatic: when all role openings reach `0` through confirmed locks, the requirement automatically stops accepting applications and is excluded from discover search.
2. **No Unilateral Application Withdrawal or Invitation Cancellation**:
   - A candidate cannot withdraw an application once submitted in `PENDING` status.
   - A team lead cannot cancel an invitation once sent in `PENDING` status.
   - Actions remain in `PENDING` until the recipient explicitly accepts or declines, or until the 7-day auto-expiry scheduler automatically expires the request with zero reputation penalty.
3. **Double-Blind Review Window**:
   - Reviews can only be submitted after the associated event date has elapsed. Team members cannot review before the competition concludes.
4. **Third-Party Integrations**:
   - GitHub OAuth verification was executed and tested using a stubbed HTTP test harness; live GitHub OAuth client credentials must be supplied in `.env` for production OAuth handshakes.
   - SMTP notifications require valid third-party credentials (e.g., Brevo or Gmail App Password); automated tests verify template rendering and payload composition using an in-memory transport stub.
