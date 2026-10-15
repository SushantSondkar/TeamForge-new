# TeamForge — Production Deployment Checklist 🚀

A comprehensive, production-readiness verification checklist for deploying the **TeamForge** campus hackathon team-matching platform for K.K. Wagh Institute of Engineering Education and Research (KKWIEER).

---

## 1. Environment Variables & Secrets Configuration

Create a production `.env` file on your server (ensure permissions are set to `chmod 600 .env` and never commit it to git):

```bash
# Core Environment
NODE_ENV=production
PORT=3000

# Database
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.kkwagh.mongodb.net/teamforge_prod?retryWrites=true&w=majority
# Or Supabase / PostgreSQL direct connection:
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

# Session & CSRF Security (Must be 32+ characters cryptographically random)
SESSION_SECRET=GENERATE_A_64_CHAR_HEX_SECRET_openssl_rand_hex_32
COOKIE_SECRET=GENERATE_A_32_CHAR_HEX_SECRET_openssl_rand_hex_16

# Data Seeding (Must be strictly false in production)
SEED=false

# College Domain Enforcement
ALLOWED_DOMAIN=kkwagh.edu.in

# OAuth Credential Providers
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_CALLBACK_URL=https://teamforge.kkwagh.edu.in/auth/github/callback

LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_CALLBACK_URL=https://teamforge.kkwagh.edu.in/auth/linkedin/callback
```

- [ ] `SESSION_SECRET` is set and non-guessable (server fails to start if missing).
- [ ] `SEED=false` in production.
- [ ] Production callback URLs configured in GitHub and LinkedIn Developer Consoles.

---

## 2. Database & Schema Verification

- [ ] Execute `migrations/001_initial_schema.sql` if deploying to Supabase / PostgreSQL.
- [ ] Verify Row Level Security (RLS) is enabled for all tables:
  - `profiles`, `user_skills`, `events`, `team_requests`, `team_roles`, `team_request_actions`, `locked_events`, `contact_sharing_consent`, `team_reputation`, `shortlists`.
- [ ] Verify unique composite index on shortlists: `(requester_id, candidate_id)`.
- [ ] Verify unique composite index on locked events: `(user_id, event_id)`.
- [ ] Verify double-blind team reviews index: `(event_id, reviewer_id, reviewee_id)`.
- [ ] Ensure MongoDB / PostgreSQL automated daily backups and point-in-time recovery are enabled.

---

## 3. Security & Compliance Checklist

- [ ] **Campus Email Restriction**: Server-side validation strictly enforces `@kkwagh.edu.in` during signup.
- [ ] **CSRF Protection**: CSRF tokens embedded in all `POST` forms via `tiny-csrf` with secure HTTP cookies.
- [ ] **Rate Limiting**: `express-rate-limit` active on `/login`, `/signup`, and `/forgot-password` to prevent brute force.
- [ ] **Credential Handling**: Passwords hashed with bcrypt (salt rounds >= 10); secrets never logged in server console.
- [ ] **Per-Event Locking**: Users can only be locked into one team per event; other events remain unlocked.
- [ ] **Double-Blind Integrity**: Peer reviews remain hidden until both teammates submit; skills are only verified if ticked, never marked "rejected".
- [ ] **Admin Gating**: Only campus administrators (`currentUser.isAdmin === true`) can approve club/department organizer applications.
- [ ] **TLS / HTTPS**: Configure NGINX reverse proxy or Cloudflare SSL certificate (`Strict-Transport-Security` header enabled).

---

## 4. Performance, Caching & Process Management

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
- [ ] **Action Expiry Daemon**: Background periodic check (`checkTimeoutsAndExpiries()`) running every 15–30 minutes to auto-expire stale requests and release locked candidate slots.

---

## 5. NGINX Reverse Proxy Sample Configuration

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
        proxy_pass http://127.0.0.1:3000;
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
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }
}
```

---

## 6. Pre-Launch Sanity Test Suite

Run the full automated test suite before opening DNS to campus students:

```bash
npm test
```

Expected output:
- **Phase 4**: 8/8 matching engine tests passed (100%)
- **Phase 5**: 6/6 unified actions & state machine tests passed (100%)
- **Phase 6**: 7/7 GitHub & LinkedIn verification tests passed (100%)
- **Phase 7**: 5/5 post-event reviews & skill verification tests passed (100%)
- **Phase 8**: 4/4 leaderboard formula, 5-stage tie-breaking & filtering tests passed (100%)
- **Total**: 30/30 unit tests passing cleanly.

---

## 7. Post-Launch Verification

- [ ] Sign up with a `@kkwagh.edu.in` address and confirm successful registration.
- [ ] Attempt sign up with `@gmail.com` and verify rejection with an informative error message.
- [ ] Log in as admin, navigate to `/admin/organizers`, and verify organizer approval workflow.
- [ ] Browse `/leaderboard` and verify filtering by department, year, and skill.
- [ ] Create an event, promote it, and verify that it renders on the dashboard hero section.
- [ ] Verify peer review workflow after an event date passes.
