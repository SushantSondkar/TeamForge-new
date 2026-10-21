# TeamForge 🛡️⚡

> The intelligent, campus-tailored hackathon team matching and collaboration platform.

TeamForge connects student developers, designers, and project leads for hackathons, engineering competitions, and capstone projects. Built specifically for collegiate environments, it eliminates chaotic spreadsheet matchmaking through algorithmic skill scoring, mutual-consent action workflows, and double-blind peer review reputation.

---

## 🚀 Key Features

- **Algorithmic Compatibility Scoring**: Multi-dimensional candidate matching based on required/preferred technical skills, experience levels, availability, and reputation score with a deterministic 5-stage tie-breaker.
- **Unified Action State Machine**: Safe, transactional lifecycle (`PENDING` → `ACCEPTED` → `LOCKED` or `DECLINED` / `EXPIRED`) for invitations and applications with 24-hour mutual confirmation locking and event-scoped concurrency guards.
- **Background Cron Scheduler**: Distributed atomic MongoDB locking (`jobs` collection) running every 10 minutes to process reminders, expiries, and confirmation timeouts safely without duplicate processing across server instances.
- **Smart Notification Digests**: In-app unread badges (desktop navbar, mobile drawer, and sidebar) paired with 5-minute rolling window batched transactional email digests.
- **Profile Completeness Guide**: Real-time completeness calculation with missing fields checklist ensuring fair algorithmic recommendations.
- **Privacy Controls**: "Hide my profile" toggle instantly excludes users from public searches, recommendation carousels, and the campus leaderboard while preserving active team memberships.
- **Double-Blind Peer Reviews**: Post-event mutual teammate reviews unlock only after both sides submit, preventing retaliatory scores and cultivating verified skill badges.
- **Campus Email Gatekeeper**: Hardened domain verification (`ALLOWED_DOMAIN`) restricting account registration to authorized campus students, complemented by GitHub and LinkedIn OAuth account verification.
- **Responsive & Accessible**: Native CSS design system tailored for mobile (360px) up to ultra-wide displays (1280px+) with accessible tap targets and clean typography.

---

## 🛠️ Technology Stack

- **Runtime & Framework**: Node.js (>=20 LTS), Express 5
- **Database & Persistence**: MongoDB Atlas, Mongoose 9 ODM, `connect-mongo` (TTL persistent session store)
- **Templating & UI**: EJS, `ejs-mate` layout engine, Vanilla CSS
- **Security & Hardening**: `helmet`, `tiny-csrf` (cookie + header-to-body adapter), `express-rate-limit`, `bcryptjs` (salt rounds >= 10), HTTP-only Secure SameSite cookies
- **Email Delivery**: `nodemailer` (SMTP relay with Brevo, Resend, Gmail App Passwords, or safe masked local console logger)
- **Automated Testing**: Node.js built-in assertion runner and `mongodb-memory-server`

---

## 💻 How to Run Locally

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0
- MongoDB installed locally **OR** set `USE_MEMORY_DB=true` (zero installation required!)

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/teamforge.git
   cd teamforge
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure local environment**:
   Copy the example environment configuration:
   ```bash
   cp .env.example .env
   ```

4. **Choose your database mode**:
   - **Option A: In-Memory Database (Fastest / Zero Setup)**:
     Open `.env` and set:
     ```env
     USE_MEMORY_DB=true
     ```
     *Data runs in RAM using `mongodb-memory-server` and resets when the server stops.*
   - **Option B: Local or Remote MongoDB**:
     Ensure MongoDB is running on port 27017 and set in `.env`:
     ```env
     MONGODB_URI=mongodb://127.0.0.1:27017/teamforge
     USE_MEMORY_DB=false
     ```

5. **Start the development server**:
   ```bash
   npm start
   ```
   Open your browser to [http://localhost:8080](http://localhost:8080).

---

## 🧪 Testing & Quality Assurance

Run the comprehensive 13-suite automated test matrix:

```bash
npm test
```

### Test Suites Included:
1. `validateEnv.test.js`: Production environment validation, secret length & zero-leak checks.
2. `matchingEngine.test.js`: Algorithmic scoring, skill level weighting, and 5-stage tie-breaker logic.
3. `phase5StateMachine.test.js`: Action lifecycle, mutual confirmation, and event-locking.
4. `phase6GithubVerification.test.js`: GitHub/LinkedIn profile link extraction and verification.
5. `phase7PostEventReviews.test.js`: Double-blind review submission, peer endorsements, and reputation.
6. `phase8Leaderboard.test.js`: Department, year, and skill leaderboard rankings.
7. `mailer.test.js`: Email masking, SMTP integration, and email template link generation.
8. `integration.test.js`: Complete student journey from registration to team lock.
9. `securityFixes.test.js`: NoSQL injection guards, object-level access controls, and XSS escaping.
10. `discoverSearch.test.js`: Server-side text search with regex escaping, dynamic filters, and pagination.
11. `scheduler.test.js`: Background cron scheduler, MongoDB distributed locks, and reminder idempotency.
12. `branding.test.js`: Brand asset presence, web manifest, favicon metadata, and Open Graph tags.
13. `phase10eSmallGaps.test.js`: Notification batching, unread count badges, 404/500 error pages, and missing fields guide.

Audit secrets hygiene:
```bash
npm run check-secrets
```

---

## ⚙️ Environment Variables Reference

| Variable | Description | Required in Production | Default / Fallback |
|---|---|:---:|---|
| `PORT` | Web server listening port | No | `8080` (Local) / `10000` (Render) |
| `NODE_ENV` | Runtime environment (`production` or `development`) | Yes | `development` |
| `MONGODB_URI` | MongoDB connection string (Atlas or Replica Set) | Yes (when `USE_MEMORY_DB=false`) | None |
| `USE_MEMORY_DB` | Start in-memory ephemeral MongoDB instance | Dev only | `false` |
| `SESSION_SECRET` | Cryptographically random secret for express-session (min 32 chars) | Yes | None |
| `COOKIE_SECRET` | Secret key for signed cookies (min 32 chars) | Yes | None |
| `CSRF_SECRET` | Secret key for CSRF token generator (min 32 chars) | Yes | None |
| `APP_BASE_URL` | Canonical public URL used in email links and metadata | Yes | `http://localhost:8080` |
| `SUPPORT_EMAIL` | Contact email for problem reports and error views | Yes | None (Hidden if empty) |
| `ALLOWED_DOMAIN` | Institutional email domain restriction for student signups | No | `kkwagh.edu.in` |
| `SMTP_HOST` | Outgoing SMTP server hostname | Yes | None (Logs to console in dev) |
| `SMTP_PORT` | SMTP port (`587` for TLS, `465` for SSL) | Yes | `587` |
| `SMTP_USER` | SMTP authentication username / account | Yes | None |
| `SMTP_PASS` | SMTP authentication password / API key | Yes | None |
| `SMTP_SECURE` | Use SSL/TLS connection (`true` for 465, `false` for 587) | No | `false` |
| `MAIL_FROM` | Sender display name and email address | No | `"TeamForge" <noreply@yourdomain.com>` |
| `SEED` | Automatically seed demo data on boot (`true`/`false`) | Prohibited in prod | `false` |
| `GITHUB_CLIENT_ID` | GitHub OAuth application client ID | Optional | None |
| `GITHUB_CLIENT_SECRET`| GitHub OAuth application client secret | Optional | None |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth application client ID | Optional | None |
| `LINKEDIN_CLIENT_SECRET`| LinkedIn OAuth application client secret | Optional | None |

---

## 📁 Project Structure

```text
TeamForge/
├── app.js                   # Application entry point & Express configuration
├── models/                  # Mongoose data schemas & business logic
│   ├── User.js              # Student profiles, skills, verification & completeness
│   ├── TeamRequirement.js   # Open hackathon team roles & skill specifications
│   ├── TeamRequestAction.js # Unified invitation/application state machine
│   ├── Event.js             # Campus hackathon events & registration deadlines
│   ├── TeamReview.js        # Double-blind peer reviews & skill endorsements
│   └── db.js                # Database connection manager & lifecycle
├── routes/                  # Express route handlers
│   ├── index.js             # Core navigation, dashboard, discover & profile routes
│   ├── auth.js              # Signup, login, logout, OAuth & password resets
│   ├── invites.js           # Team invitation management & actions
│   ├── applications.js      # Candidate role applications
│   ├── events.js            # Hackathon event creation & management
│   └── admin.js             # Campus organizer review & administration
├── utils/                   # Shared utility modules
│   ├── matchingEngine.js    # Algorithmic candidate compatibility scoring
│   ├── actionStateMachine.js# State machine transitions & notification batcher
│   ├── scheduler.js         # Distributed background cron runner
│   ├── mailer.js            # SMTP transport & masked recipient logger
│   ├── emailTemplates.js    # Responsive HTML & text email templates
│   ├── leaderboardService.js# Daily reputation rankings & tie-breakers
│   └── validateEnv.js       # Production startup environment validator
├── views/                   # EJS interface templates
│   ├── layouts/             # Master boilerplate layout
│   ├── includes/            # Navbar, footer, and dashboard sidebar partials
│   ├── 404.ejs              # Friendly not-found page
│   ├── 500.ejs              # Server error page with report CTA
│   └── how-it-works.ejs     # 4-step interactive platform guide
├── scripts/                 # Operational management CLI scripts
│   ├── setupAdmin.js        # Provision campus administrators
│   └── checkSecrets.js      # Audit repository secrets hygiene
├── tests/                   # Automated unit, integration & regression test suites
├── public/                  # Static assets (CSS, client JS, brand logos, icons)
├── render.yaml              # Render Cloud Blueprint deployment specification
├── DEPLOYMENT_CHECKLIST.md  # Step-by-step production rollout guide
└── package.json             # Dependencies, engines, and run scripts
```

---

## 🔍 Known Limitations

An honest, transparent assessment of current platform architectural characteristics:

1. **Free-Tier Host Cold Starts**: On free cloud tiers (such as Render or Railway free containers), services automatically spin down after 15 minutes of inactivity. The initial request after a spin-down may experience a 30 to 50 second cold start delay while the container boots.
2. **In-Process Notification Batching**: The 5-minute rolling window notification digest queue is managed in Node.js process memory. While it gracefully flushes on SIGTERM/SIGINT, horizontal multi-instance scaling would require an external distributed queue (such as Redis with BullMQ) to guarantee state sharing across instances.
3. **Database-Level Search Indexing**: The Discover search engine currently utilizes MongoDB regex queries with character escaping. For datasets exceeding tens of thousands of simultaneous open roles, upgrading to Atlas Search or Elasticsearch will provide enhanced phonetic and full-text ranking.
4. **Single-Domain Institutional Model**: The authentication pipeline restricts user registrations to a single campus domain specified by `ALLOWED_DOMAIN`. Multi-tenant support across multiple college domains requires defining domain access lists.
5. **Polling-Based Real-Time Updates**: Notification badges and request states update on page loads and actions. Real-time instantaneous badge pushes without page interaction would require introducing persistent WebSockets.

---

## 📄 License
ISC License. Built with ❤️ for student builders and hackathon innovators.
