# TeamForge — Live Demonstration Guide 🎓
**Project:** Design Thinking (DT) Final Project  
**Institution:** K.K. Wagh Institute of Engineering Education and Research (KKWIEER), Nashik  
**Target Audience:** DT Course Professor & Evaluation Panel  

---

## 1. Quick Setup & Starting the Application

### Prerequisites
* **Node.js**: v18 or later (tested on Node.js v24)
* **MongoDB**: Either local MongoDB service OR the built-in embedded MongoDB engine (automatic zero-config fallback)

### Step 1: Install Dependencies
Open PowerShell or your terminal in the project directory:
```bash
npm install
```

### Step 2: Environment Configuration
Ensure `.env` exists in the project root (copied from `.env.example`):
```env
PORT=8080
MONGODB_URI=mongodb://127.0.0.1:27017/teamforge
SESSION_SECRET=teamforge-super-secret-session-key-32-chars!
COOKIE_SECRET=teamforge-super-secret-cookie-key-32-chars!
CSRF_SECRET=teamforge-super-secret-csrf-key-32-chars!
SEED=false
```

### Step 3: Start the Application
Run the start command:
```bash
npm start
```
* **Expected Terminal Output**:
  ```
  MongoDB connected successfully via MONGODB_URI
  Server is running on port 8080
  ```
  *(If local MongoDB service is not running on port 27017, TeamForge's resilient embedded database engine will automatically start and log: `Starting embedded local database engine for development/demo... Embedded MongoDB connected successfully`)*

### Step 4: Open in Browser
Navigate to:
```
http://localhost:8080
```

---

## 2. Test / Demonstration Accounts
*Do not use hardcoded or pre-cooked credentials. Register two fresh student accounts live through the registration form to prove genuine database persistence.*

| Role | Suggested Name | Suggested Institutional Email | Password | Department | Year | Skills |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Student A (Team Creator)** | Sushant Patil | `sushant_comp@kkwagh.edu.in` | `DemoPass123#` | Computer Engineering | TE | `Node.js:5, Express:4, MongoDB:4` |
| **Student B (Candidate)** | Aaradhya Wabale | `aaradhya_it@kkwagh.edu.in` | `DemoPass123#` | Information Technology | TE | `React:5, TypeScript:4, Tailwind:4` |

---

## 3. Step-by-Step Live Demonstration Walkthrough

### Step 1: Register Student B (Candidate Account)
1. In your browser (or Incognito Window 1), go to `http://localhost:8080/signup`.
2. Fill in:
   * **Full Name**: `Aaradhya Wabale`
   * **College Email**: `aaradhya_it@kkwagh.edu.in` *(Note: Point out the `@kkwagh.edu.in` institutional restriction to your professor)*
   * **Department**: `Information Technology`
   * **Academic Year**: `TE (Third Year)`
   * **Core Skills & Proficiency**: `React:5, TypeScript:4, Tailwind:4`
   * **Password**: `DemoPass123#`
   * **Confirm Password**: `DemoPass123#`
3. Click **Create Account**.
4. **Expected Result**: The account is securely hashed with bcrypt and persisted in MongoDB. The browser is redirected to `/profile?welcome=true` with session established.
5. Click **Logout** in the navigation bar to return to `/login`.

---

### Step 2: Register Student A (Team Creator Account)
1. Go to `http://localhost:8080/signup`.
2. Fill in:
   * **Full Name**: `Sushant Patil`
   * **College Email**: `sushant_comp@kkwagh.edu.in`
   * **Department**: `Computer Engineering`
   * **Academic Year**: `TE (Third Year)`
   * **Core Skills & Proficiency**: `Node.js:5, Express:4, MongoDB:4`
   * **Password**: `DemoPass123#`
   * **Confirm Password**: `DemoPass123#`
3. Click **Create Account**.
4. **Expected Result**: Student A is registered in MongoDB and logged into their dashboard at `http://localhost:8080/`.

---

### Step 3: Create an Event-Specific Team Requirement (Wizard)
1. On the Dashboard or top navbar, click **+ Create Team Requirement** (or go to `/team-requirement/new`).
2. **Context Step**:
   * If an event is listed (e.g. Smart India Hackathon), select it. If no event exists, visit `/events/new` to create one (e.g. `SIH 2026 - Hardware & Software Edition`).
   * Click **Next: Define Team**.
3. **Define Team Step**:
   * **Project Name**: `Smart Campus Tracker`
   * **Team Size**: `4`
   * **Theme**: `Smart Automation`
   * **Project Requirement**: `Automate lab inventory and student verification`
   * **Deliverables**: `Working prototype and presentation`
   * Click **Next: Add Roles**.
4. **Add Roles Step**:
   * **Role Title**: `Frontend Developer`
   * **Required Skills**: `React, TypeScript`
   * **Preferred Skills**: `Tailwind`
   * **Proficiency**: `Intermediate`
   * **Openings**: `1`
   * Click **Add Role**, then click **Next: Review**.
5. **Review & Submit Step**:
   * Review all entered data.
   * Click **Confirm & Submit**.
6. **Expected Result**: 
   * The team requirement is validated and saved to MongoDB.
   * Student A is locked into this event (`lockedEvents` in DB).
   * The browser redirects to Dashboard (`/?teamId=...`).
   * The **Active Team Status** card now shows `Smart Campus Tracker`, `1 / 4 Active`, and role `Frontend Developer (1 Opening)`.

---

### Step 4: Discover Candidates & Explain Matching Formula
1. On the Dashboard, locate the **Recommended Candidates** card.
2. Observe candidate **Aaradhya Wabale**:
   * **Match Score**: Calculated dynamically using the TeamForge formula:
     $$\text{Match Score} = \text{round}(100 \times (0.40S + 0.25C + 0.20R + 0.10A + 0.05T))$$
   * Notice the breakdown tags:
     * `Skills: %` (Term S: React & TypeScript coverage)
     * `Cred: %` (Term C: Baseline & credentials)
     * `Rep: %` (Term R: Reviews and shortlists)
     * `Active: %` (Term T: Fresh login timestamp)
3. Explain to your professor:
   > *"TeamForge does not use random or mock data. The matching engine evaluates skill overlap against role requirements, checks institutional eligibility, filters out candidates already committed to other teams in this event, and prioritizes active students."*

---

### Step 5: Send Invitation to Candidate
1. Click the **Invite** button next to Aaradhya Wabale.
2. The button updates to **Invited** (green).
3. **Expected Result in DB**:
   * A `TeamRequestAction` document is created with `status: "PENDING"` and `direction: "INVITE"`.
   * A persistent `Notification` document is inserted for Aaradhya Wabale.
   * The candidate is logged in the `Shortlists` collection.
4. Click **Logout** from Student A's account.

---

### Step 6: Log in as Student B & Accept Invitation
1. Go to `http://localhost:8080/login`.
2. Enter:
   * **Email**: `aaradhya_it@kkwagh.edu.in`
   * **Password**: `DemoPass123#`
3. Click **Log In**.
4. Look at the **New Invites Received** card on the dashboard (or click the bell icon in navbar).
5. You will see:
   * **Project**: `Smart Campus Tracker`
   * **Role**: `Frontend Developer`
   * **Sender**: `Sushant Patil`
   * Action buttons: `[Accept]` and `[Decline]`
6. Click **Accept**.
7. **Expected Result**:
   * Status transitions to `ACCEPTED`.
   * Notice the badge: `ACCEPTED · Awaiting lead confirmation`.
   * Point out to your professor:
     > *"Under TeamForge's unified state machine, candidate acceptance never prematurely locks a candidate. The initiating team lead must confirm to prevent double-booking."*
8. Click **Logout**.

---

### Step 7: Log back in as Student A & Confirm Candidate
1. Go to `http://localhost:8080/login`.
2. Log in with `sushant_comp@kkwagh.edu.in` / `DemoPass123#`.
3. Look at the Dashboard:
   * A prominent purple banner appears: **Action Required: Pending Match Confirmations (1)**.
   * `Aaradhya Wabale accepted your invite! Please confirm to lock into Smart Campus Tracker.`
4. Click **🔒 Confirm & Lock Match**.
5. **Expected Result**:
   * Status transitions: `ACCEPTED` $\rightarrow$ `CONFIRMED` $\rightarrow$ `LOCKED`.
   * **Role Openings** in MongoDB decrements from `1` to `0`.
   * Student B's user profile now has the event ID in `lockedEvents`.
   * The Active Team Status card updates dynamically to **`2 / 4 Active`**!
   * Both students receive mutual match lock notifications with contact sharing enabled.

---

### Step 8: Verify Event Locking & Security
1. Log out and try to access `http://localhost:8080/profile` without logging in:
   * **Expected Result**: Redirected immediately to `/login` (Protected Route middleware).
2. Log back in as Student B (`aaradhya_it@kkwagh.edu.in`):
   * Student B is locked for this specific SIH event, but their availability remains unlocked for other distinct competitions (event-scoped locking).

---

## 4. Resetting Data for Another Demo Run
To clear demo records and start fresh:
1. Stop the application (`Ctrl+C` in terminal).
2. If using embedded MongoDB, restarting `npm start` automatically resets the in-memory database.
3. If using persistent local MongoDB service, you can run:
   ```bash
   node -e "const mongoose = require('mongoose'); (async () => { await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/teamforge'); await mongoose.connection.dropDatabase(); console.log('Database reset clean!'); process.exit(0); })();"
   ```

---

## 5. Summary of Architecture for Professor Q&A
* **Frontend**: Vanilla HTML5/CSS3 + EJS templates (no heavy single-page-app overhead, easy to inspect and maintain).
* **Backend**: Node.js & Express 5 with modular RESTful routing.
* **Authentication**: Password hashing with bcrypt, session fixation protection (`session.regenerate()`), secure HTTP-only cookies, and CSRF validation on all state-changing endpoints.
* **Database**: MongoDB & Mongoose with schema validations and atomic increments/decrements.
* **Matching Engine**: Deterministic multi-factor scoring (Skills 40%, Credibility 25%, Reputation 20%, Availability 10%, Recency 5%) with a strict 50% required-skill coverage eligibility gate.
