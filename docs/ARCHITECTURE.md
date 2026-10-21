# TeamForge Platform Architecture & Technical Reference

TeamForge is an intelligent, high-trust campus team formation and collaboration platform built for college hackathons and engineering project competitions.

---

## 1. Why MongoDB Instead of the Originally Planned Supabase

The TeamForge platform was originally envisioned around a Supabase/PostgreSQL relational architecture with row-level security. During architectural prototyping, MongoDB (via Mongoose) was selected to match the dynamic, hierarchical nature of campus hackathon team structures. Hackathon team listings require deeply nested, heterogeneous roles with variable required and preferred skill arrays, nested prior team members, flexible deliverables, and dynamic multi-stage state tracking that evolve rapidly across hackathon seasons without requiring heavy relational migration overhead. Furthermore, MongoDB's atomic document update primitives—such as array-element targeting queries (`roles.openings: { $gt: 0 }` with `$inc: { "roles.$.openings": -1 }`) and distributed atomic lease locks (`jobs` collection)—provided single-database atomic operations without needing an external message broker or Redis instance. This significantly reduced deployment complexity on free-tier web hosting (e.g., Render + MongoDB Atlas), keeping operational costs at zero while maintaining strict ACID guarantees at the document level.

---

## 2. MongoDB Collections and Data Models

### `users`
Represents student and administrator profiles.
* `name` (String, required): Student full name.
* `email` (String, required, unique, lowercase): Institutional email ending with `@kkwagh.edu.in`.
* `password` (String, required): bcrypt-hashed password (salt rounds: 10).
* `department` (String, enum): Engineering department (e.g., Computer, IT, AI & DS, E&TC).
* `year` (String, enum): Academic year (FE, SE, TE, BE).
* `skills` (Array of objects): `[{ name: String, level: Number (1-5), verified: Boolean, verificationsCount: Number }]`.
* `bio` (String): Student background and technical goals.
* `availability` (String, enum): `Immediate`, `Flexible`, `Weekends Only`, `Not Available`.
* `portfolioUrl` (String): URL to student portfolio or personal website.
* `contact` (Object): `{ email: String, phone: String, linkedin: String, discord: String }`.
* `contactConsent` (Boolean): Master toggle for sharing contact details with locked teammates.
* `isProfileHidden` (Boolean): User privacy toggle to hide profile from discover and leaderboard.
* `emailNotifications` (Boolean): User toggle for email delivery of platform notifications.
* `isEmailVerified` (Boolean): Institutional email verification flag.
* `verificationToken` (String, hashed): One-time verification token.
* `verificationExpires` (Date): Verification token expiry (24 hours).
* `resetPasswordToken` (String, hashed): Forgot-password token.
* `resetPasswordExpires` (Date): Password reset token expiry (1 hour).
* `isGithubVerified` (Boolean): Flag indicating linked GitHub account.
* `githubUsername` (String): GitHub profile handle.
* `githubData` (Object): Synced public statistics (`publicRepos`, `followers`, `totalStars`, `topLanguages`, `lastSyncedAt`). Notice: OAuth tokens are strictly excluded from storage.
* `lockedEvents` (Array of Strings): Event IDs or project keys where the candidate is committed to a locked team.
* `teammateRating` (Number, 0.0 - 1.0): Aggregate peer rating normalized from 5-star reviews.
* `reviewCount` (Number): Number of revealed post-event peer reviews.
* `hackathonsWon` (Number): Verified wins count.
* `shortlistCount` (Number): Number of times shortlisted by team leads.
* `isAdmin` (Boolean): Campus administrator privilege flag.
* `isOrganizer` (Boolean): Student club or hackathon organizer privilege flag.
* `organizerStatus` (String, enum): `NONE`, `PENDING`, `APPROVED`, `REJECTED`.
* `organizationName` (String): Campus club / council name for organizers.
* `lastActive` (Date): Timestamp of most recent user interaction.

### `events`
Campus hackathons and engineering competitions.
* `name` (String, required): Event title.
* `organizer` (String, required): Organizing student chapter, department, or company.
* `date` (Date, required): Official event date.
* `deadline` (Date, required): Registration and team formation closing deadline.
* `mode` (String, enum): `Online`, `Offline`, `Hybrid`.
* `link` (String): Official competition link.
* `description` (String): Event details, problem tracks, and eligibility.
* `minTeamSize` / `maxTeamSize` (Number): Team member boundary limits.
* `isPromoted` (Boolean): Pinned spotlight banner flag.
* `promotedTagline` (String): Subtitle for featured events.
* `prizePool` (String): Competition prize pool description.
* `createdBy` (ObjectId -> User): Creator user reference.

### `team_requirements`
Team openings posted by team leaders.
* `projectName` (String, required): Project or idea title.
* `theme` (String, required): Competition track or domain.
* `eventId` (ObjectId -> Event, optional): Associated hackathon.
* `createdBy` (ObjectId -> User, required): Team leader reference.
* `teamSize` (Number, 1-20): Target team capacity.
* `projectRequirement` (String): Problem statement and system architecture goals.
* `deliverables` (String): Expected prototype outcomes.
* `deadline` (Date): Application deadline.
* `roles` (Array of objects): Subdocuments defining open positions:
  * `title` (String): Position title (e.g., "Full-Stack Developer").
  * `requiredSkills` (Array of Strings): Mandatory skills.
  * `preferredSkills` (Array of Strings): Nice-to-have skills.
  * `proficiency` (String, enum): `Intermediate`, `Advanced`, `Expert`.
  * `openings` (Number, >= 0): Open spots remaining for this specific role.
* `existingMembers` (Array of objects): `[{ name: String, role: String }]`.
* `status` (String, enum): `OPEN`, `CLOSED`.

### `team_request_actions`
Unified state machine table for all interaction requests (both invites and applications).
* `direction` (String, enum, required): `INVITE` (lead invites candidate) or `APPLY` (candidate applies to team).
* `senderId` (ObjectId -> User, required): Initiator of the action.
* `receiverId` (ObjectId -> User, required): Recipient of the action.
* `teamRequirementId` (ObjectId -> TeamRequirement, required): Targeted team opening.
* `eventId` (ObjectId -> Event, optional): Associated hackathon.
* `role` (String, required): Target role title.
* `status` (String, enum): `PENDING`, `ACCEPTED`, `CONFIRMED`, `LOCKED`, `DECLINED`, `EXPIRED`, `ROLE_FILLED`.
* `confirmedByRequester` (Boolean): True once the original sender confirms match.
* `confirmationExpiresAt` (Date): 24-hour timeout window for requester confirmation.
* `expiresAt` (Date): 7-day timeout window for pending actions.
* `reminderSentAt` (Date): Idempotency timestamp for 24h expiration warning email.
* `senderContactConsent` (Boolean): Initiator contact sharing consent.
* `receiverContactConsent` (Boolean): Recipient contact sharing consent.

### `team_reviews`
Double-blind post-event peer evaluations and skill endorsements.
* `reviewerId` (ObjectId -> User): Review author.
* `revieweeId` (ObjectId -> User): Teammate evaluated.
* `eventId` (ObjectId -> Event): Associated hackathon.
* `teamRequirementId` (ObjectId -> TeamRequirement): Associated team.
* `technicalRating` (Number, 1-5): Technical capability rating.
* `collaborationRating` (Number, 1-5): Teamwork and communication rating.
* `punctualityRating` (Number, 1-5): Reliability and deadline adherence rating.
* `overallScore` (Number, 1-5): Weighted average rating.
* `feedback` (String): Constructive feedback (min 10 chars).
* `verifiedSkills` (Array of Strings): Skill endorsements from peer.
* `isRevealed` (Boolean): Double-blind reveal flag (true only when both peers review or deadline elapses).

### `notifications`
In-app alerts and notifications.
* `userId` (ObjectId -> User): Recipient.
* `title` (String): Alert heading.
* `subtitle` (String): Descriptive text (strictly excludes unmasked private contact information).
* `type` (String, enum): `info`, `success`, `warning`, `danger`.
* `actionId` (ObjectId -> TeamRequestAction, optional): Related action.
* `link` (String): Navigation path.
* `read` (Boolean): Unread badge indicator.

### `feedbacks`
Platform user satisfaction ratings.
* `userId` (ObjectId -> User, optional): Submitting student.
* `rating` (Number, 1-5): Star rating.
* `category` (String, enum): `general`, `matching`, `ui_ux`, `bug`, `feature_request`.
* `comment` (String): Student comments.

### `shortlists`
Tracking saved/shortlisted candidates.
* `userId` (ObjectId -> User): Student who was shortlisted.
* `shortlistedBy` (ObjectId -> User): Team lead who shortlisted.

### `announcements`
Event-day pinned banner announcements.
* `title` (String): Banner headline.
* `text` (String): Detailed broadcast message.
* `active` (Boolean): Visibility flag.
* `expiresAt` (Date): Automatic banner hide timestamp.
* `createdBy` (ObjectId -> User): Admin publisher.

### `jobs`
MongoDB distributed lease locks for the background scheduler.
* `_id` (String): Unique lock name (e.g., `scheduler_cron_lock`).
* `lockedAt` (Date): Lock acquisition timestamp.
* `expiresAt` (Date): Lease expiration timestamp for auto-recovery.

---

## 3. Application Routes by Feature

| Feature | Method & Route | Access Control | Description |
| :--- | :--- | :--- | :--- |
| **System** | `GET /healthz` | Public | Readiness and liveness probe (checks DB connectivity) |
| **Authentication** | `GET /signup`, `POST /signup` | Public | Student signup with institutional `@kkwagh.edu.in` validation |
| | `GET /login`, `POST /login` | Public | Rate-limited authentication |
| | `GET /verify-email`, `GET /resend-verification` | Public | One-time token institutional email verification |
| | `GET /forgot-password`, `POST /forgot-password` | Public | Time-limited password reset dispatch |
| | `GET /reset-password/:token`, `POST /reset-password` | Public | Secure token-authenticated password update |
| | `GET /logout` | Authenticated | Session destruction |
| | `GET /auth/github`, `GET /auth/github/callback` | Authenticated | GitHub OAuth link and stat synchronization |
| **Profile & Settings**| `GET /profile`, `POST /profile` | Authenticated | Student skills, bio, portfolio, and contact management |
| | `POST /profile/privacy` | Authenticated | Toggle `isProfileHidden` and `emailNotifications` |
| **Discover & Search** | `GET /` | Public / Auth | Landing page & active team requirements preview |
| | `GET /discover` | Public / Auth | Paginated search (10/page) with skill, event, and keyword filters |
| | `GET /leaderboard` | Public / Auth | Campus leaderboard (top 50) with reputation metrics |
| | `GET /how-it-works` | Public | 4-step interactive platform onboarding workflow |
| **Team Requirements** | `GET /team-requirement/new` | Authenticated | Multi-step wizard: context, define-team, roles, review |
| | `POST /team-requirement/submit` | Authenticated | Validates and persists requirement; locks lead for event |
| | `GET /team-requirement/:id` | Authenticated | Detail page with matched candidate discovery |
| | `GET /team-requirement/:id/recommendations` | Owner Only | Scored candidate recommendation endpoint |
| **Actions: Invites** | `POST /invites/send` | Team Lead Only | Creates `INVITE` action (direction: `INVITE`, status: `PENDING`) |
| | `POST /invites/:id/accept` | Candidate Only | Candidate accepts; status transitions to `ACCEPTED` |
| | `POST /invites/:id/confirm` | Team Lead Only | Lead confirms; transitions to `LOCKED`; decrements opening |
| | `POST /invites/:id/decline` | Candidate / Lead | Declines invitation; status transitions to `DECLINED` |
| | `POST /invites/:id/consent` | Team Members | Mutual contact sharing consent toggle |
| **Actions: Applications**| `POST /applications/apply` | Candidate Only | Creates `APPLY` action (direction: `APPLY`, status: `PENDING`) |
| | `POST /applications/:id/accept` | Team Lead Only | Lead accepts; status transitions to `ACCEPTED` |
| | `POST /applications/:id/confirm` | Candidate Only | Candidate confirms; transitions to `LOCKED`; decrements opening |
| | `POST /applications/:id/decline` | Candidate / Lead | Declines application; status transitions to `DECLINED` |
| | `POST /applications/:id/consent` | Team Members | Mutual contact sharing consent toggle |
| | `GET /applications/team/:id` | Team Lead Only | View list of candidates who applied to team |
| **Events** | `GET /events` | Public / Auth | Complete list of campus events and hackathons |
| | `GET /events/new`, `POST /events/new` | Admin / Organizer | Create and publish campus hackathon event |
| | `GET /events/:id` | Public / Auth | Hackathon detail page with associated teams |
| | `POST /events/:id/promote` | Admin / Organizer | Toggle promoted banner settings |
| **Reviews & Verification** | `GET /reviews` | Authenticated | Double-blind review opportunities and received ratings |
| | `POST /reviews/submit` | Authenticated | Submit double-blind teammate review and skill endorsements |
| **Feedback** | `POST /feedback` | Authenticated | Submit 1-5 star user feedback with rate limiting |
| **Admin Panel** | `GET /admin/stats` | Admin Only | Real-time platform metrics (all-time & last 7 days) |
| | `GET /admin/stats/export` | Admin Only | Anonymous platform stats CSV export with formula escaping |
| | `GET /admin/feedback` | Admin Only | View student feedback list (capped at 200) |
| | `GET /admin/feedback/export` | Admin Only | Anonymous feedback CSV export with formula escaping |
| | `GET /admin/banner`, `POST /admin/banner` | Admin Only | Event-day pinned announcement banner controls |
| | `GET /admin/organizers` | Admin Only | Review student club organizer status applications |

---

## 4. Unified Action State Machine

Every team match follows a symmetric 4-stage lifecycle governed by `utils/actionStateMachine.js`. The state machine operates identically for both `INVITE` and `APPLY` directions:

```mermaid
stateDiagram-v2
    [*] --> PENDING: createAction() [INVITE or APPLY]
    
    PENDING --> DECLINED: declineAction() [Recipient declines]
    PENDING --> EXPIRED: scheduler check [7 days elapsed]
    PENDING --> ACCEPTED: acceptAction() [Recipient accepts]
    
    ACCEPTED --> DECLINED: declineAction() [Either party declines]
    ACCEPTED --> EXPIRED: scheduler check [24h confirmation elapsed]
    ACCEPTED --> LOCKED: confirmAction() [Original Requester confirms]
    
    LOCKED --> ROLE_FILLED: Other pending actions when openings reach 0
    LOCKED --> [*]: Team locked for event; contact consent unlocked
```

### Key Concurrency Invariants
1. **Acceptance Is Never Final**: `acceptAction()` merely transitions the action to `ACCEPTED` and starts a 24-hour confirmation timer (`confirmationExpiresAt`). The candidate is **not** locked, and the role openings are **not** decremented.
2. **Requester Confirmation**: Only the initiating user who originally submitted the request confirms the match.
3. **Atomic Spot Allocation**: `confirmAction()` atomically claims the opening via MongoDB `findOneAndUpdate` with `{ "roles.openings": { $gt: 0 } }`. If openings reach 0, all competing pending actions are automatically updated to `ROLE_FILLED`.
4. **Event-Scoped Locking**: A confirmed candidate is appended to `lockedEvents` strictly for that specific competition. They remain fully eligible for other events.

---

## 5. Candidate Matching Engine & Formula

The matching engine (`utils/recommendations.js`) scores and ranks candidates for a given role:

$$\text{MatchScore} = (0.50 \times S) + (0.20 \times P) + (0.15 \times A) + (0.15 \times R)$$

Where:
* **Skill Overlap Score ($S \in [0, 1]$)**:
  $$S = \frac{|\text{UserSkills} \cap \text{RequiredSkills}|}{|\text{RequiredSkills}|}$$
  Plus a bonus of $+0.1$ for each matched preferred skill (normalized to a maximum of $1.0$).
* **Proficiency Match ($P \in [0, 1]$)**:
  Evaluates candidate skill levels against the target proficiency (`Intermediate` = 2, `Advanced` = 3, `Expert` = 4). Candidates meeting or exceeding the target receive $1.0$; lower proficiencies receive fractional credit ($0.66$ or $0.33$).
* **Availability Match ($A \in [0, 1]$)**:
  * `Immediate`: $1.0$
  * `Flexible`: $0.8$
  * `Weekends Only`: $0.5$
  * `Not Available`: $0.0$
* **Reputation & Verification Score ($R \in [0, 1]$)**:
  Weighted combination of peer-reviewed rating (`teammateRating` $\times 0.6$), GitHub verification status ($+0.2$), and institutional verification ($+0.2$).
* **Tie-Breaker**:
  When candidates have equal MatchScores, the candidate with the higher **Profile Completeness Percentage** is ranked first.

---

## 6. Verification and Trust Model

1. **Institutional Identity**:
   * Restricted registration strictly requiring `@kkwagh.edu.in` email addresses.
   * Cryptographically secure SHA-256 hashed one-time verification tokens sent via institutional SMTP.
2. **GitHub Activity Verification**:
   * OAuth linkage synchronizing public activity (repositories, total stars, top languages, follower count).
   * **Zero Token Persistence**: Access tokens are utilized only in-memory during sync and are immediately discarded. No access tokens are ever written to the database.
3. **Post-Event Double-Blind Reviews**:
   * Teammates locked into an event evaluate each other after the event date passes.
   * Reviews remain hidden until both teammates submit their reviews, preventing retaliatory scores.
   * Endorsed skills increment the candidate's verified skill count on their profile.
4. **Privacy and Safety Controls**:
   * Personal contact details (phone, email, socials) are masked by default. Contact details are revealed only when both teammates mutually opt into contact sharing after being locked into a team.
   * `isProfileHidden` enables students to temporarily remove themselves from discovery and public leaderboards.
