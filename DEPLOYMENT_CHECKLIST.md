# TeamForge — Production Deployment Guide & Checklist 🚀

Target Architecture: **Render (or Railway) Web Service** + **MongoDB Atlas (M0 Free Tier)**.

This step-by-step guide walks beginners through deploying TeamForge to production securely and reliably.

---

## Prerequisites
- A [GitHub](https://github.com) account.
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (Free M0 cluster).
- A [Render](https://render.com) account (Free Web Service tier).
- An SMTP email service account ([Brevo](https://www.brevo.com/), [Resend](https://resend.com/), or Gmail App Password).

---

## Step 1: Provision MongoDB Atlas Database

1. **Create an M0 Free Cluster**:
   - Log into MongoDB Atlas and click **Create Deployment**.
   - Choose the **M0 Free** shared tier and select your nearest cloud region.
   - Name your cluster (e.g., `Cluster0`) and click **Create**.

2. **Create a Database User**:
   - Navigate to **Security > Database Access > Add New Database User**.
   - Select **Password Authentication**.
   - Set a username (e.g., `teamforge_admin`) and generate a strong password. Save this password securely.
   - Set **Database User Privileges** to **Read and write to any database**.

3. **Configure Network Access (IP Access List)**:
   - Go to **Security > Network Access > Add IP Access List Entry**.
   - Click **Allow Access from Anywhere** (`0.0.0.0/0`).
   - **Trade-off Explanation**: Cloud hosts like Render and Railway use dynamic outbound IP pools on free and shared tiers. To allow Render's containers to connect to Atlas, `0.0.0.0/0` is necessary initially. Your database remains strictly protected by strong user authentication (SCRAM-SHA-256) and TLS encryption.
   - **How to tighten later**: If upgrading to dedicated cloud hosting (Render Team/Enterprise, AWS VPC, or Railway Static Outbound IPs), replace `0.0.0.0/0` with your host's specific static outbound CIDR blocks or configure VPC peering.

4. **Obtain Connection String**:
   - Go to **Database > Clusters > Connect > Drivers > Node.js**.
   - Copy the SRV URI:
     ```text
     mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/teamforge?retryWrites=true&w=majority
     ```
   - Replace `<username>` and `<password>` with your database user credentials. This value will be your `MONGODB_URI`.

---

## Step 2: Generate Cryptographic Secrets

TeamForge requires three distinct, cryptographically random secrets for session management, cookie signing, and CSRF defense. Each must be at least 32 characters and never match `.env.example` placeholders.

Generate them locally in your terminal using Node.js:

```bash
# Run this command 3 times to get 3 unique secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save each generated 64-character hex string for:
- `SESSION_SECRET`
- `COOKIE_SECRET`
- `CSRF_SECRET`

---

## Step 3: Configure OAuth Applications (GitHub & LinkedIn)

Determine your production application URL first. For Render, this is typically `https://<your-app-name>.onrender.com` (or your custom domain).

### A. GitHub OAuth Application:
1. Go to GitHub **Settings > Developer settings > OAuth Apps > New OAuth App** (`https://github.com/settings/applications/new`).
2. Fill in:
   - **Application name**: `TeamForge Campus Platform`
   - **Homepage URL**: `https://<your-app-name>.onrender.com`
   - **Authorization callback URL**: `https://<your-app-name>.onrender.com/auth/github/callback`
3. Click **Register application**.
4. Note your **Client ID** (`GITHUB_CLIENT_ID`).
5. Click **Generate a new client secret** and save the value (`GITHUB_CLIENT_SECRET`).

### B. LinkedIn OAuth Application:
1. Visit the LinkedIn Developer Portal (`https://www.linkedin.com/developers/`) and click **Create App**.
2. Fill in the app name, associate with your institution/company page, and upload an icon.
3. In the **Products** tab, request **Sign In with LinkedIn using OpenID Connect**.
4. In the **Auth** tab, under **Authorized redirect URLs for your app**, add:
   - `https://<your-app-name>.onrender.com/auth/linkedin/callback`
5. Note your **Client ID** (`LINKEDIN_CLIENT_ID`) and **Client Secret** (`LINKEDIN_CLIENT_SECRET`).

---

## Step 4: Set Up SMTP Email Provider & Verify Sender

TeamForge dispatches student email verifications, password resets, action reminders, and batched notification digests via SMTP.

1. **Recommended Free Providers**:
   - **Brevo (formerly Sendinblue)**: 300 free emails/day. Create an account, verify your sender email, and obtain SMTP credentials from **SMTP & API**.
   - **Resend**: 100 free emails/day. Add your sending domain or use verified sender.
   - **Gmail App Password**: For small-scale testing, enable 2FA on a Google account and generate a 16-character App Password.
2. Note your credentials:
   - `SMTP_HOST` (e.g., `smtp-relay.brevo.com` or `smtp.gmail.com`)
   - `SMTP_PORT` (e.g., `587`)
   - `SMTP_USER` (your SMTP account username/email)
   - `SMTP_PASS` (your SMTP password or API key)
   - `SMTP_SECURE` (`false` for port 587, `true` for port 465)
   - `MAIL_FROM` (e.g., `"TeamForge" <notifications@yourverifieddomain.com>`)
   - `SUPPORT_EMAIL` (e.g., `support@yourdomain.com`)

---

## Step 5: Push to GitHub & Deploy on Render

1. **Verify Git Cleanliness**:
   - Ensure `.env` is **NOT** committed:
     ```bash
     git status --short
     # Confirm .env does NOT appear
     ```
   - Push your code to your private or public GitHub repository.

2. **Connect to Render**:
   - In Render Dashboard, click **New > Web Service**.
   - Connect your GitHub repository.
   - Render automatically detects `render.yaml` Blueprint if you use Blueprint, or you can configure manually:
     - **Name**: `teamforge`
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Health Check Path**: `/healthz`

3. **Set Production Environment Variables on Render**:
   In the **Environment** tab, add the following variables:

| Variable | Recommended / Required Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enforces production security validations |
| `PORT` | `10000` | Render sets this automatically or uses 10000 |
| `MONGODB_URI` | `mongodb+srv://...` | From Atlas (Step 1) |
| `SESSION_SECRET` | *(64-hex generated in Step 2)* | Minimum 32 chars |
| `COOKIE_SECRET` | *(64-hex generated in Step 2)* | Minimum 32 chars |
| `CSRF_SECRET` | *(64-hex generated in Step 2)* | Minimum 32 chars |
| `APP_BASE_URL` | `https://<your-app-name>.onrender.com` | No trailing slash |
| `SUPPORT_EMAIL` | `support@yourdomain.com` | Shown in footer & error states |
| `SMTP_HOST` | `smtp-relay.brevo.com` | From Step 4 |
| `SMTP_PORT` | `587` | Standard SMTP port |
| `SMTP_USER` | *(your SMTP username)* | From Step 4 |
| `SMTP_PASS` | *(your SMTP password)* | From Step 4 |
| `SMTP_SECURE` | `false` | `false` for TLS 587 |
| `MAIL_FROM` | `"TeamForge" <noreply@yourdomain.com>` | Verified sender address |
| `ALLOWED_DOMAIN` | `kkwagh.edu.in` | Restricts student signups |
| `SEED` | `false` | Must be `false` in production |
| `GITHUB_CLIENT_ID` | *(From Step 3)* | Optional in dev, needed for OAuth |
| `GITHUB_CLIENT_SECRET` | *(From Step 3)* | Optional in dev, needed for OAuth |
| `LINKEDIN_CLIENT_ID` | *(From Step 3)* | Optional in dev, needed for OAuth |
| `LINKEDIN_CLIENT_SECRET` | *(From Step 3)* | Optional in dev, needed for OAuth |

4. Click **Deploy Web Service**.
5. Once built, verify Render displays a green checkmark and that `GET /healthz` returns `{"status":"ok", ...}` with HTTP 200.

---

## Step 6: Create the Campus Administrator Account

Never seed default administrator credentials in production. Use the controlled admin setup script against production:

### Method A: Via Render Web Shell (Recommended)
1. In your Render Web Service dashboard, click **Shell**.
2. Run the admin provisioning command:
   ```bash
   node scripts/setupAdmin.js create "Campus Admin" admin@kkwagh.edu.in "YourStrongPassword123#!"
   ```
   *(Or promote an already registered student)*:
   ```bash
   node scripts/setupAdmin.js promote student@kkwagh.edu.in
   ```

### Method B: Locally Connecting to Atlas
Run locally pointing `MONGODB_URI` to your Atlas cluster:
```bash
MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/teamforge?retryWrites=true&w=majority" node scripts/setupAdmin.js create "Campus Admin" admin@kkwagh.edu.in "YourStrongPassword123#!"
```

---

## Step 7: Post-Deploy Smoke Test Checklist

Execute these 9 sequential user scenarios against your live production URL:

- [ ] **1. Student Signup**: Sign up with an authorized student email (`@<ALLOWED_DOMAIN>`). Verify non-allowed domains (e.g. `@gmail.com`) are rejected.
- [ ] **2. Verify Email**: Check student inbox, click the verification link, and confirm email address is marked verified.
- [ ] **3. Student Login & Profile Setup**: Log in, edit profile, add skills, department, and bio. Verify completeness bar reflects accurate percentage.
- [ ] **4. Create Team Requirement**: Create a new project role/team requirement. Verify wizard validates steps smoothly.
- [ ] **5. Send Invite**: Send an invitation from student A to student B. Check flash message confirms "Invitation sent successfully".
- [ ] **6. Accept Invitation**: Log in as student B, navigate to `/actions`, and accept the invitation. Verify flash message and status transition to `ACCEPTED`.
- [ ] **7. Confirm Match**: Confirm the accepted action to trigger mutual locking (`LOCKED`). Verify candidate availability lock is event-scoped.
- [ ] **8. Notifications & Badges**: Check unread notification counter badge on desktop and mobile, click "Mark all as read", and verify badge resets to 0. Verify batched email delivery.
- [ ] **9. Organizer Application & Review**: Submit organizer application with faculty coordinator details and proof document (`/organizer/apply`). Verify pending state prevents unauthorized posting (`/events/new`). Log in as campus administrator (`/admin/organizers`), approve application, and verify organizer role is granted with event creation rights.
- [ ] **10. Logout**: Click logout (POST-only) and verify session is invalidated server-side.

---

## Step 8: Database Backups & Disaster Recovery

Data preservation is essential for campus hackathon events and team records.

1. **MongoDB Atlas Automated Backups**:
   - In MongoDB Atlas, automated continuous snapshot backups are included on dedicated tiers (M10+).
   - On the Free M0 tier, enable automated alerts under **Alerts** for disk and connection usage.
2. **Nightly / Weekly `mongodump` Backup Routine**:
   - Take regular backups using MongoDB Database Tools:
     ```bash
     mongodump --uri="mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/teamforge" --out=./backups/$(date +%Y-%m-%d)
     ```
   - Store backup archives encrypted in off-site object storage (AWS S3, Cloudflare R2, or Google Cloud Storage).
   - To restore in disaster recovery scenarios:
     ```bash
     mongorestore --uri="mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/teamforge" --drop ./backups/<date>/teamforge
     ```
