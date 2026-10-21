# TeamForge — Production Deployment Checklist 🚀

A comprehensive, production-readiness verification checklist for deploying the **TeamForge** campus hackathon team-matching platform for K.K. Wagh Institute of Engineering Education and Research (KKWIEER).

---

## 1. Environment Variables & Secrets Configuration

> ⚠️ **CRITICAL SECURITY REQUIREMENT**: Rotate every secret before deploying and never share the project zip with `.env` inside.
> Always verify with `npm run check-secrets` to confirm `.env` is untracked and all placeholder secrets are replaced.

Create a production `.env` file on your server (ensure permissions are set to `chmod 600 .env` and never commit it to git):

```bash
# Core Environment
NODE_ENV=production
PORT=8080

# Operational Database (MongoDB Replica Set or Atlas)
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.kkwagh.mongodb.net/teamforge_prod?retryWrites=true&w=majority

# Session & CSRF Security (Must be 32+ characters cryptographically random)
SESSION_SECRET=GENERATE_A_64_CHAR_HEX_SECRET_openssl_rand_hex_32
COOKIE_SECRET=GENERATE_A_32_CHAR_HEX_SECRET_openssl_rand_hex_16
CSRF_SECRET=GENERATE_A_32_CHAR_HEX_SECRET_openssl_rand_hex_16

# Data Seeding (Must be strictly false in production)
SEED=false

# College Domain Enforcement
ALLOWED_DOMAIN=kkwagh.edu.in

# OAuth Credential Providers (Optional in dev; required for OAuth verification)
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_CALLBACK_URL=https://teamforge.kkwagh.edu.in/auth/github/callback

LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_CALLBACK_URL=https://teamforge.kkwagh.edu.in/auth/linkedin/callback
```

- [ ] `SESSION_SECRET` is set and non-guessable (server fails to start if missing).
- [ ] `COOKIE_SECRET` and `CSRF_SECRET` are set and non-guessable.
- [ ] `SEED=false` in production.
- [ ] Production callback URLs configured in GitHub and LinkedIn Developer Consoles.

### OAuth Application Setup (GitHub & LinkedIn)

#### GitHub OAuth App Creation Steps:
1. Log into GitHub and go to **Settings > Developer settings > OAuth Apps > New OAuth App** (or visit `https://github.com/settings/applications/new`).
2. Fill in the application registration details:
   - **Application name**: `TeamForge — KKWIEER`
   - **Homepage URL**: `https://teamforge.kkwagh.edu.in` (Production) or `http://localhost:8080` (Local Development)
   - **Application description**: `Campus Hackathon Matching Platform for KKWIEER Students`
   - **Authorization callback URL**:
     - **Production**: `https://teamforge.kkwagh.edu.in/auth/github/callback`
     - **Local Development**: `http://localhost:8080/auth/github/callback`
3. Click **Register application**.
4. Under the application dashboard:
   - Copy the **Client ID** and set `GITHUB_CLIENT_ID` in `.env`.
   - Click **Generate a new client secret**, copy the secret value, and set `GITHUB_CLIENT_SECRET` in `.env`.

#### LinkedIn OAuth App Creation Steps:
1. Log into the LinkedIn Developer Portal at `https://www.linkedin.com/developers/` and click **Create App**.
2. Fill in the app registration details:
   - **App name**: `TeamForge — KKWIEER`
   - **LinkedIn Page**: Associate with the official KKWIEER college or organization page.
   - **Privacy policy URL**: `https://teamforge.kkwagh.edu.in/privacy` (or institutional URL).
   - **App logo**: Upload the official TeamForge emblem.
3. Click **Create app**.
4. In the app management dashboard:
   - Navigate to the **Products** tab and request access to **Sign In with LinkedIn using OpenID Connect** (enables `openid`, `profile`, `email` scopes).
   - Navigate to the **Auth** tab:
     - Under **OAuth 2.0 settings**, add the exact Authorized redirect URLs for your app:
       - **Production**: `https://teamforge.kkwagh.edu.in/auth/linkedin/callback`
       - **Local Development**: `http://localhost:8080/auth/linkedin/callback`
     - Copy the **Client ID** and set `LINKEDIN_CLIENT_ID` in `.env`.
     - Copy the **Primary Client Secret** and set `LINKEDIN_CLIENT_SECRET` in `.env`.

---

## 2. Database & Schema Verification

* **Operational Database Engine**: MongoDB via Mongoose ODM and `connect-mongo`.
* **Embedded Development Fallback**: Active in development mode (`NODE_ENV !== "production"`) if local mongod is not running. In production (`NODE_ENV=production`), application strictly connects to `MONGODB_URI`.
- [ ] Ensure MongoDB Atlas automated daily backups and point-in-time recovery are enabled.
- [ ] Verify database indexes on collections:
  - `users`: `email` (unique), `lockedEvents`, `skills.name`, `lastActive`.
  - `team_request_actions`: `(senderId, receiverId, teamRequirementId, role, status)`, `expiresAt`.
  - `shortlists`: unique composite index `(requesterId, candidateId)`.
  - `team_reviews`: compound index `(eventId, reviewerId, revieweeId)`.
  - `sessions`: TTL index `expires`.

---

## 3. Security & Compliance Checklist

- [ ] **Campus Email Restriction**: Server-side validation strictly enforces `@kkwagh.edu.in` during signup.
- [ ] **Department & Year Whitelist**: Server validates against authorized engineering departments and academic years (`FE`, `SE`, `TE`, `BE`).
- [ ] **CSRF Protection**: CSRF tokens embedded in all `POST` forms via `tiny-csrf` with secure HTTP cookies and header-to-body adapter.
- [ ] **Rate Limiting**: `express-rate-limit` active on `/login`, `/signup`, and `/forgot-password` to prevent brute force.
- [ ] **Credential Handling**: Passwords hashed with bcrypt (salt rounds >= 10); hashes never sent to clients or views.
- [ ] **Session Fixation Defense**: `req.session.regenerate()` executed on all successful logins and new signups.
- [ ] **POST-Only Logout**: Destroys session server-side and clears browser cookie `connect.sid`.
- [ ] **Ownership Enforcement**: Team leads can only send invites and view recommendations for team requirements they own.
- [ ] **Per-Event Locking**: Users can only be locked into one team per event; other events remain unlocked.
- [ ] **Double-Blind Integrity**: Peer reviews remain hidden until both teammates submit; skills are only verified if ticked, never marked "rejected".
- [ ] **Admin Gating**: Only campus administrators (`currentUser.isAdmin === true`) can approve club/department organizer applications.
- [ ] **Reverse-Proxy Cookie Security**: In production (`NODE_ENV=production`), `trust proxy` is set to 1 and `cookie.secure: true` is enforced for HTTPS.

---

## 4. Administrator Provisioning

Never seed or deploy an administrator account with default credentials. Use the controlled admin setup script:

```bash
# Option A: Promote an existing registered student account:
node scripts/setupAdmin.js promote principal@kkwagh.edu.in

# Option B: Create a new faculty administrator with a strong password:
node scripts/setupAdmin.js create "Campus Admin" admin@kkwagh.edu.in "YourStrongPassword123#"
```

---

## 5. Performance, Caching & Process Management

- [ ] **Process Manager (PM2)**: Run the application with PM2 for automated restarts and zero-downtime reloads:
  ```bash
  npm install -g pm2
  pm2 start app.js --name "teamforge" -i max --env production
  pm2 save
  pm2 startup
  ```
- [ ] **Daily Leaderboard Cache**: Cached with 24-hour TTL (`utils/leaderboardService.js`). Manual refresh available via `/leaderboard?refresh=true`.
- [ ] **GitHub REST API Cache**: 24-hour cache active to avoid rate-limiting under GitHub's 60 req/hr unauthenticated / 5000 req/hr authenticated quota.
- [ ] **Static Asset Caching**: Public directory (`public/css`, `public/js`, images) served with caching headers in NGINX reverse proxy.
- [x] **Action Expiry Daemon**: Periodic background scheduler (`utils/scheduler.js`) running `checkTimeoutsAndExpiries()` every 10 minutes with MongoDB distributed lock and 24h reminder/expiry notifications.

---

## 6. NGINX Reverse Proxy Sample Configuration

```nginx
server {
    listen 80;
    server_name teamforge.kkwagh.edu.in;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name teamforge.kkwagh.edu.in;

    ssl_certificate /etc/letsencrypt/live/teamforge.kkwagh.edu.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/teamforge.kkwagh.edu.in/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://127.0.0.1:8080;
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }
}
```

---

## 7. Pre-Launch Sanity Test Suite

Run the full automated unit and integration test suite before opening DNS to campus students:

```bash
npm test
```

Expected output:
- **Phase 4**: 8/8 matching engine tests passed (100%)
- **Phase 5**: 6/6 unified actions & state machine tests passed (100%)
- **Phase 6**: 7/7 GitHub & LinkedIn verification tests passed (100%)
- **Phase 7**: 5/5 post-event reviews & skill verification tests passed (100%)
- **Phase 8**: 4/4 leaderboard formula, 5-stage tie-breaking & filtering tests passed (100%)
- **Integration**: 8/8 end-to-end integration workflows passed (100%)
- **Total**: 38/38 tests passing cleanly.

---

## 8. Post-Launch Verification

- [ ] Sign up with a `@kkwagh.edu.in` address and confirm successful registration.
- [ ] Attempt sign up with `@gmail.com` and verify rejection with an informative error message.
- [ ] Log in as admin, navigate to `/admin/organizers`, and verify organizer approval workflow.
- [ ] Browse `/leaderboard` and verify filtering by department, year, and skill.
- [ ] Create an event, promote it, and verify that it renders on the dashboard hero section.
- [ ] Verify peer review workflow after an event date passes.
