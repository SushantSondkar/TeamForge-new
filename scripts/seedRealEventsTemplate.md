# Real Campus Hackathons Seeding & Entry Guide 🏆

> **Policy**: In accordance with TeamForge platform integrity standards, **no mock, dummy, or synthetic event records are hardcoded in the codebase or automatically seeded in production**. All real upcoming hackathons must be published through the verified administrator/organizer web interface.

This guide provides faculty coordinators, student club leaders, and campus administrators with the exact entry templates to publish real, verifiable upcoming hackathons and engineering competitions on TeamForge.

---

## 1. Prerequisites to Publish Events

To create events on the platform:
1. Log in with an **Administrator Account** (`currentUser.isAdmin === true`), **OR**
2. Apply for **Organizer Status** at `/organizer/apply` and have your campus club/chapter approved by the admin team.

---

## 2. Event Creation Form Fields

Navigate to:
```text
https://<your-app-domain>/events/new
```

When creating an event, the web form requires:
- **Event Name**: Official title of the competition.
- **Organizer**: Department, student chapter, or institution body hosting the event.
- **Official Website / Registration URL**: Link to official rules or portal (**FILL IN YOURSELF**).
- **Mode**: `Offline`, `Online`, or `Hybrid`.
- **Event Date**: The start date of the competition.
- **Registration & Team Lock Deadline**: The hard cutoff date and time after which team rosters are permanently locked.
- **Description**: Official problem statements, round structure, and submission guidelines.
- **Tags / Categories**: Search keywords for discovery.

---

## 3. Real Event Entry Templates

> **Note**: Do not invent dates, names, or links. The official website field is marked as **FILL IN YOURSELF**. Replace bracketed placeholders with verified official details before publishing.

### Event 1: Smart India Hackathon (SIH) — Campus Qualifier
*Real nationwide competition organized by Ministry of Education's Innovation Cell (MIC) & AICTE.*

- **Event Name**: `Smart India Hackathon (SIH) — Internal Campus Qualifier`
- **Official Website**: `FILL IN YOURSELF`
- **Organizer**: `[FILL IN YOURSELF: e.g. Institutional Innovation Council (IIC) / College Tech Committee]`
- **Mode**: `Offline` (or `Hybrid`)
- **Theme**: `[FILL IN YOURSELF: Select current official SIH themes, e.g. Smart Automation, Clean & Green Tech, MedTech]`
- **Description**:
  > Official internal qualification round for college teams aiming to represent the institute at the National Smart India Hackathon. Teams must select published problem statements from the official portal and build working software or hardware prototypes. Top nominated teams will receive institutional mentorship.
- **Event Date**: `[FILL IN YOURSELF: YYYY-MM-DD]`
- **Registration Deadline**: `[FILL IN YOURSELF: YYYY-MM-DDTHH:MM]`
- **Team Size**: Exactly `6` members (Per official national SIH rules: exactly 6 student members per team, must include at least 1 female teammate)
- **Tags**: `SIH, National, Innovation, Government, Hardware, Software`

---

### Event 2: Verified Campus / Departmental Technical Hackathon
*Template for real campus hackathons organized by accredited student associations or departments.*

- **Event Name**: `[FILL IN YOURSELF: Real Event Name]`
- **Official Website**: `FILL IN YOURSELF`
- **Organizer**: `[FILL IN YOURSELF: Real Department or Student Chapter, e.g. Computer Engineering Student Association]`
- **Mode**: `[FILL IN YOURSELF: Offline / Online / Hybrid]`
- **Theme**: `[FILL IN YOURSELF: Real Competition Themes / Problem Tracks]`
- **Description**: `[FILL IN YOURSELF: Official event description, round criteria, and submission rules]`
- **Event Date**: `[FILL IN YOURSELF: YYYY-MM-DD]`
- **Registration Deadline**: `[FILL IN YOURSELF: YYYY-MM-DDTHH:MM]`
- **Team Size Constraints**: `[FILL IN YOURSELF: e.g. Min 2, Max 4]`
- **Tags**: `[FILL IN YOURSELF: e.g. Web, AI, Mobile, Campus]`

---

## 4. Post-Event Reviews Checklist

Once an event's end date has passed:
1. TeamForge automatically unlocks the double-blind peer review interface at `/reviews/event/<eventId>`.
2. All locked teammates receive an in-app notification prompt to review their peers on:
   - Technical contribution (1-5)
   - Reliability & task completion (1-5)
   - Communication (1-5)
   - Teamwork (1-5)
   - Peer skill endorsements
3. Individual review ratings remain strictly confidential until both teammates submit, protecting student psychological safety and platform trust.
