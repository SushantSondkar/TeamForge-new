# Real Campus Hackathons Seeding & Entry Guide 🏆

> **Policy**: In accordance with TeamForge platform integrity standards, **no mock, dummy, or synthetic event records are hardcoded in the codebase or automatically seeded in production**. All real upcoming hackathons must be published through the verified administrator/organizer web interface.

This guide provides faculty coordinators, student club leaders, and campus administrators with the exact workflow and templates to publish real upcoming hackathons and engineering competitions on TeamForge.

---

## 1. Prerequisites to Publish Events

To create events on the platform:
1. Log in with an **Administrator Account** (`currentUser.isAdmin === true`), **OR**
2. Apply for **Organizer Status** at `/organizer/apply` and have your campus club/chapter approved by the admin team.

---

## 2. Event Creation Workflow

1. Navigate to:
   ```text
   https://<your-app-domain>/events/new
   ```
2. Complete the verified event form:
   - **Event Name**: Official title of the competition.
   - **Theme / Track**: Problem statement categories (e.g. AI/ML, Smart Automation, Web3, Healthcare, FinTech).
   - **Description**: Detailed eligibility criteria, round structure, and submission guidelines.
   - **Event Start & End Dates**: Competition execution timeline.
   - **Registration & Team Lock Deadline**: The hard cutoff timestamp after which team rosters are permanently locked.
   - **Team Size Constraints**: Minimum and maximum allowed team size (typically 2 to 4 members).
   - **Tags**: Comma-separated search keywords (e.g. `Hackathon, AI, Hardware, SIH, Inter-Collegiate`).
3. Click **Create & Publish Event**.
4. In the Admin Dashboard (`/events`), click **Promote Event** to pin the competition to the top of the student dashboard hero section.

---

## 3. Real Event Entry Templates

Use these ready-to-use templates modeled after standard Indian collegiate hackathons:

### Template A: Smart India Hackathon (SIH) Internal Campus Qualifier
- **Event Name**: `Smart India Hackathon 2026 — Internal Campus Selection`
- **Theme**: `Smart Automation, Clean Tech, Smart Education, Healthcare & AgriTech`
- **Description**:
  > Official internal qualification round for KKWIEER teams aiming to represent the institute at the National Smart India Hackathon. Teams must select problem statements from the official portal and build working software or hardware prototypes. Top 15 teams receive institutional nomination and faculty mentorship.
- **Minimum Team Size**: `6` (Must include at least 1 female teammate per SIH national rules)
- **Maximum Team Size**: `6`
- **Registration Deadline**: `2026-09-15T18:00`
- **Event Dates**: `2026-09-20` to `2026-09-21`
- **Tags**: `SIH, National, Innovation, Government, Hardware, Software`

---

### Template B: Annual Campus TechFest Hackathon (Equinox / Innowave)
- **Event Name**: `Equinox 2026: 24-Hour CodeSprint`
- **Theme**: `Generative AI, Web3 & Decentralized Systems, Sustainable Smart Cities`
- **Description**:
  > The flagship annual 24-hour inter-departmental hackathon organized by the Computer and IT Engineering Student Associations. Features live mentor rounds, cloud credits, industry jury evaluations, and cash prizes for top three multidisciplinary prototypes.
- **Minimum Team Size**: `2`
- **Maximum Team Size**: `4`
- **Registration Deadline**: `2026-03-01T23:59`
- **Event Dates**: `2026-03-07` to `2026-03-08`
- **Tags**: `TechFest, 24Hour, Coding, GenerativeAI, Web3, CashPrize`

---

### Template C: CSI / ACM Student Chapter Web & Mobile Dev Hackathon
- **Event Name**: `DevForge 2026: Full-Stack Innovation Challenge`
- **Theme**: `Developer Tools, EdTech Platforms, Open Source Campus Utilities`
- **Description**:
  > A 36-hour sprint focused on shipping high-impact full-stack web and mobile applications that solve daily campus logistics, attendance tracking, alumni networking, or placement preparation. Hosted by CSI Student Branch.
- **Minimum Team Size**: `3`
- **Maximum Team Size**: `4`
- **Registration Deadline**: `2026-04-10T20:00`
- **Event Dates**: `2026-04-15` to `2026-04-17`
- **Tags**: `CSI, FullStack, React, Node, Mobile, OpenSource`

---

## 4. Post-Event Reviews Checklist

Once an event's end date has passed:
1. TeamForge automatically unlocks the double-blind peer review interface at `/reviews/event/<eventId>`.
2. All locked teammates receive a notification prompt to review their peers on:
   - Technical contribution
   - Communication & teamwork
   - Skill endorsements
3. Individual review ratings remain strictly confidential until both teammates submit, protecting student psychological safety and platform trust.
