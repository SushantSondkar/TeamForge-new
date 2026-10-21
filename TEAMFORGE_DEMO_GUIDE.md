# TeamForge — 5-Minute Live Demonstration & Evaluation Guide 🎓

**Project:** TeamForge — Collegiate Hackathon Team Matching & Collaboration Platform  
**Target Audience:** Design Thinking Evaluation Panel, Department Faculty & Pilot Reviewers  
**Platform URL:** `https://<your-app-name>.onrender.com` (or `http://localhost:8080` locally)  

---

## ⏱️ The 5-Minute Live Demo Script (Minute-by-Minute)

This demo script follows two real student accounts across the complete matchmaking and competition lifecycle on the live deployed site.

```text
[0:00 - 1:00] Landing Page & Campus Authentication Gatekeeper
[1:00 - 2:00] Profile Completeness Bar, Missing Fields & GitHub Verification
[2:00 - 3:00] Team Creation Wizard & Server-Side Discover Search
[3:00 - 4:00] Two-Way Request Lifecycle: 24h Timer, Mutual Confirmation Lock & Feedback
[4:00 - 5:00] Double-Blind Peer Reviews, Campus Leaderboard & Admin Live Stats
```

---

### Minute 1 (0:00 – 1:00): First Impression & Campus Email Gatekeeper
1. **Open the live application**:
   - Navigate to `https://<your-app-name>.onrender.com/` (or `http://localhost:8080`).
2. **Point out the value proposition**:
   - *"TeamForge eliminates WhatsApp chaos and last-minute spreadsheet scrambles by providing an institutional hackathon matchmaking platform."*
   - Show the **Interactive Match Engine Formula**:
     $$\text{MatchScore} = 40\% S + 25\% C + 20\% R + 10\% A + 5\% T$$
3. **Demonstrate Campus Email Verification**:
   - Click **Sign Up**. Attempt to enter an external email (`test@gmail.com`).
   - Point out the instant client and server rejection: only authorized `@<ALLOWED_DOMAIN>` emails (e.g. `@kkwagh.edu.in`) are allowed.
   - Log in with real student account **Student A** (`sushant_comp@kkwagh.edu.in`).

---

### Minute 2 (1:00 – 2:00): Profile Completeness & GitHub Verification
1. **Navigate to `/profile`**:
   - Highlight the **Profile Completeness Bar** ($20\% + 15\% + 15\% + 20\% + 15\% + 15\% = 100\%$).
   - Point out that this percentage matches the exact 5th-stage tie-breaker used in the matching engine.
   - Point out the **Missing Fields Guide**: clearly shows what remaining details (e.g. Bio, external portfolio, GitHub link) are needed to reach 100%.
2. **Showcase Verified GitHub Integration**:
   - Show the blue **Verified GitHub Profile** badge (`github.com/username`).
   - Explain: *"TeamForge pulls public repos and commit activity via GitHub OAuth to prove genuine coding skills, preventing fake resumes."*
3. **Show Privacy Control**:
   - Point to the **"Hide my profile"** toggle. Explain that students can take a break from hackathons and vanish from public searches and leaderboard with one click without losing existing team locks.

---

### Minute 3 (2:00 – 3:00): Wizard Creation & Algorithmic Search
1. **Open the 4-Step Team Requirement Wizard** (`/team-requirement/new`):
   - Step 1: Select Event (`Smart India Hackathon 2026`).
   - Step 2: Define Project (`Smart Campus Transit`, Team Size: 4).
   - Step 3: Add Open Roles (`Frontend Developer`, Required: `React, TypeScript`, Openings: 1).
   - Step 4: Review & Submit.
2. **Demonstrate Discover Search** (`/discover`):
   - Switch to the **Search Teams** tab.
   - Type `React` in the search box; select `Smart India Hackathon` from the event dropdown.
   - Point out that the query uses safe regex escaping and dynamic filters populated from active database requirements.
   - Show candidate cards with the detailed **Match Score breakdown** pills (`Skills: 92%`, `Cred: 85%`, `Rep: 90%`).

---

### Minute 4 (3:00 – 4:00): Unified Request Lifecycle & Mutual Lock
1. **Send an Invitation**:
   - From Student A's dashboard, click **Invite** on candidate **Student B** (`aaradhya_it@kkwagh.edu.in`).
   - The button transitions smoothly to `Invited` and queues a transactional notification.
2. **Accept Invitation (as Student B)**:
   - Log in as Student B in an incognito window.
   - Click the **Notifications** bell with the visible unread count badge.
   - Click **Accept** on the invite.
   - Point out the critical engineering safeguard:
     > *"Under TeamForge's action state machine, acceptance does NOT immediately lock candidate availability. The initiating lead must confirm to prevent double-booking."*
3. **Confirm & Lock**:
   - Back on Student A's dashboard, the purple action banner displays: `Action Required: Confirm Candidate`.
   - Click **Confirm & Lock**.
   - Show the dynamic update: Status becomes `🔒 LOCKED`, Role Openings decrement from 1 to 0, and the candidate is locked for this specific competition.
   - Highlight the **"Rate experience ★"** link prompting student feedback.

---

### Minute 5 (4:00 – 5:00): Reviews, Leaderboard & Admin Live Telemetry
1. **Double-Blind Peer Reviews** (`/reviews`):
   - Explain how post-event reviews remain masked until both teammates submit, eliminating retaliation and encouraging honest feedback.
2. **Campus Leaderboard** (`/leaderboard`):
   - Show ranked students filtered by department, year of study, and technical skill.
   - Point out that hidden profiles are completely absent from rankings.
3. **Admin Live Stats Telemetry** (`/admin/stats`):
   - Log in as the Campus Administrator.
   - Navigate to **Live Stats**:
     - Real counts for Registered Users, Verified Profiles, GitHub Verified, Open Roles, and **Teams LOCKED**.
     - Side-by-side **Last 7 Days** column demonstrating live pilot momentum for faculty evaluation.
   - Click **Export Stats CSV** to demonstrate instant institutional reporting.
   - Open **Student Feedback** (`/admin/feedback`) showing anonymous satisfaction scores and pilot comments.

---

## 📸 High-Resolution Screenshot Checklist for Submission Report

Capture and include these 9 clean screenshots in your final project report or presentation deck:

| # | Screen Name | URL Path | Key Elements to Showcase |
|---|---|---|---|
| 1 | **Landing Page Hero** | `/` or `/landing` | Institutional branding, CTAs, and interactive Match Formula preview card |
| 2 | **Campus Email Signup** | `/signup` | `@ALLOWED_DOMAIN` placeholder and client/server validation message |
| 3 | **Student Profile & Badges** | `/profile` | Completeness percentage, missing fields checklist, and Verified GitHub badge |
| 4 | **Team Requirement Wizard** | `/team-requirement/new` | 4-step progress tracker, role openings, and required/preferred skills |
| 5 | **Discover Search Engine** | `/discover` | Search text input, dynamic skill dropdown, event filter, and match breakdown tags |
| 6 | **Mutual Request Lock** | `/dashboard` or `/home` | `🔒 LOCKED` badge, contact sharing opt-in, and `Rate experience ★` link |
| 7 | **Double-Blind Peer Review** | `/reviews` | Event selector, star ratings for teammates, and peer skill endorsement checkboxes |
| 8 | **Admin Live Stats** | `/admin/stats` | High-level summary cards, detailed table with "Last 7 Days" column, and Export CSV button |
| 9 | **Event-Day Announcement** | `/dashboard` (with banner) | Amber pinned announcement card with broadcast icon, notice text, and expiry date |

---

## 💡 Evaluation Panel Q&A Cheat Sheet

- **Q: How does TeamForge prevent students from ghosting or committing to multiple teams in the same hackathon?**  
  *A: TeamForge enforces an atomic, event-scoped locking mechanism in MongoDB (`lockedEvents` array). Once a student is confirmed into a team for an event, they are disqualified from appearing in candidate recommendations or accepting conflicting invites for that specific event.*

- **Q: How are skill ratings verified to prevent self-reported exaggeration?**  
  *A: Skills are validated through two independent channels: (1) GitHub OAuth verification analyzing real commit volume and repository languages, and (2) Post-event double-blind peer endorsements from verified teammates.*

- **Q: Can user contact details leak before students agree to work together?**  
  *A: Never. Student phone numbers and personal emails remain strictly masked until both parties have mutual agreement and explicitly click "Share Contacts".*
