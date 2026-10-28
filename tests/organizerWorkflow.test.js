/**
 * tests/organizerWorkflow.test.js
 * 
 * End-to-end tests for the Hackathon Organizer Application & Review Workflow:
 * 1. Submit application with valid fields & length/format checks.
 * 2. Duplicate pending blocked (code check & MongoDB partial unique index).
 * 3. Student blocked from posting or promoting hackathons before approval.
 * 4. Admin approval grants organizer status, atomic update, and enables posting.
 * 5. Reject requires non-empty reason, stores reason, and enforces 7-day cooldown.
 * 6. Self-approval blocked (admin cannot approve or reject own application).
 * 7. Non-admin blocked from admin review panel and decision routes.
 * 8. Dashboard button shows "+ Post New Hackathon" for approved/admin, "Apply for Organizer Status" for others.
 */

const assert = require("assert");
const http = require("http");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "organizer_workflow_test_session_secret_32";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "organizer_workflow_test_cookie_secret_32";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "organizer_workflow_test_csrf_secret_32";

const app = require("../app");
const User = require("../models/User");
const Event = require("../models/Event");
const Notification = require("../models/Notification");
const OrganizerApplication = require("../models/OrganizerApplication");

class SessionClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = {};
  }

  updateCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const cookieHeaders = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const ch of cookieHeaders) {
      const parts = ch.split(";")[0].split("=");
      const name = parts[0].trim();
      const val = parts.slice(1).join("=").trim();
      this.cookies[name] = val;
    }
  }

  getCookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  request(pathname, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(pathname, this.baseUrl);
      const reqHeaders = Object.assign({}, options.headers || {});
      const cookieStr = this.getCookieHeader();
      if (cookieStr) {
        reqHeaders["Cookie"] = cookieStr;
      }

      const req = http.request(url, {
        method: options.method || "GET",
        headers: reqHeaders
      }, (res) => {
        this.updateCookies(res.headers["set-cookie"]);
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });
      req.on("error", reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async get(pathname) {
    return this.request(pathname, { method: "GET" });
  }

  async post(pathname, data, headers = {}) {
    const isJson = typeof data === "object" && !(data instanceof URLSearchParams);
    const bodyStr = isJson ? JSON.stringify(data) : data.toString();
    const contentType = isJson ? "application/json" : "application/x-www-form-urlencoded";
    return this.request(pathname, {
      method: "POST",
      headers: Object.assign({
        "Content-Type": contentType,
        "Content-Length": Buffer.byteLength(bodyStr)
      }, headers),
      body: bodyStr
    });
  }

  async login(email, password) {
    const resGet = await this.get("/login");
    assert.strictEqual(resGet.statusCode, 200, "GET /login must return 200");
    const csrfMatch = resGet.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(csrfMatch, "Must find CSRF token in /login HTML form");
    const csrfToken = csrfMatch[1];

    const formData = new URLSearchParams();
    formData.append("_csrf", csrfToken);
    formData.append("email", email);
    formData.append("password", password);

    const resPost = await this.post("/login", formData);
    assert.ok([200, 302].includes(resPost.statusCode), `POST /login must redirect or return 200, got ${resPost.statusCode}`);
    return csrfToken;
  }

  async extractCsrf(pathname) {
    const res = await this.get(pathname);
    const csrfMatch = res.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(csrfMatch, `Must find CSRF token on ${pathname}`);
    return csrfMatch[1];
  }
}

async function runOrganizerWorkflowTests() {
  console.log("=================================================");
  console.log("RUNNING HACKATHON ORGANIZER WORKFLOW TESTS");
  console.log("=================================================\n");

  const connectDB = require("../models/db");
  await connectDB();

  // Create clean state
  await User.deleteMany({});
  await Event.deleteMany({});
  await Notification.deleteMany({});
  await OrganizerApplication.deleteMany({});

  // Ensure indexes (especially partial unique index on pending status) are created in MongoDB
  await OrganizerApplication.syncIndexes();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server active on ephemeral port ${port}`);

  try {
    const passwordHash = await bcrypt.hash("Password123!", 10);

    const student1 = await User.create({
      name: "Aarav Sharma",
      email: "aarav.sharma@kkwagh.edu.in",
      password: passwordHash,
      department: "Computer Engineering",
      year: "TE",
      role: "Candidate",
      isEmailVerified: true
    });

    const student2 = await User.create({
      name: "Bhavna Patel",
      email: "bhavna.patel@kkwagh.edu.in",
      password: passwordHash,
      department: "Information Technology",
      year: "BE",
      role: "Candidate",
      isEmailVerified: true
    });

    const admin1 = await User.create({
      name: "Dr. Admin One",
      email: "admin1@kkwagh.edu.in",
      password: passwordHash,
      department: "Computer Engineering",
      isAdmin: true,
      role: "Candidate",
      isEmailVerified: true
    });

    const admin2 = await User.create({
      name: "Dr. Admin Two",
      email: "admin2@kkwagh.edu.in",
      password: passwordHash,
      department: "Information Technology",
      isAdmin: true,
      role: "Candidate",
      isEmailVerified: true
    });

    // -------------------------------------------------------------
    // Test 1: Submit valid application
    // -------------------------------------------------------------
    console.log("1. Testing valid organizer application submission...");
    const clientStudent1 = new SessionClient(baseUrl);
    await clientStudent1.login(student1.email, "Password123!");

    let csrf1 = await clientStudent1.extractCsrf("/organizer/apply");

    const validPayload = new URLSearchParams();
    validPayload.append("_csrf", csrf1);
    validPayload.append("organizationName", "KKWIEER ACM Chapter");
    validPayload.append("department", "Computer Engineering");
    validPayload.append("applicantRole", "Student President");
    validPayload.append("facultyCoordinatorName", "Prof. R. M. Kulkarni");
    validPayload.append("facultyCoordinatorEmail", "faculty.coordinator@college.edu");
    validPayload.append("plannedEventDetails", "Equinox Hackathon 2026: 36-hour inter-collegiate coding hackathon on April 10-11, 2026.");
    validPayload.append("proofLink", "https://drive.google.com/file/d/permission-letter-2026/view");
    validPayload.append("reason", "We require verified organizer status to officially publish and promote Equinox 2026 on TeamForge.");

    const resSubmit = await clientStudent1.post("/organizer/apply", validPayload);
    assert.ok([200, 302].includes(resSubmit.statusCode), `Submission must redirect, got ${resSubmit.statusCode}`);

    const app1 = await OrganizerApplication.findOne({ applicantId: student1._id });
    assert.ok(app1, "OrganizerApplication record must exist in DB");
    assert.strictEqual(app1.status, "PENDING");
    assert.strictEqual(app1.organizationName, "KKWIEER ACM Chapter");
    assert.strictEqual(app1.facultyCoordinatorEmail, "faculty.coordinator@college.edu");

    const student1Updated = await User.findById(student1._id);
    assert.strictEqual(student1Updated.organizerStatus, "PENDING", "User.organizerStatus must be PENDING");
    assert.strictEqual(student1Updated.isOrganizer, false, "User.isOrganizer must remain false");

    // Student visits /organizer/apply and sees pending review
    const resApplyView = await clientStudent1.get("/organizer/apply");
    assert.strictEqual(resApplyView.statusCode, 200);
    assert.ok(resApplyView.body.includes("Pending Review") || resApplyView.body.includes("PENDING"), "Pending review banner must be rendered");
    assert.ok(!resApplyView.body.includes("Submit Organizer Application"), "Form must not be shown to pending applicant");
    console.log("   ✓ Application created with status 'PENDING', User synced, and pending review state displayed.");

    // -------------------------------------------------------------
    // Test 2: Duplicate pending application blocked
    // -------------------------------------------------------------
    console.log("2. Testing duplicate pending application blocked...");
    csrf1 = await clientStudent1.extractCsrf("/organizer/apply");
    const duplicatePayload = new URLSearchParams();
    duplicatePayload.append("_csrf", csrf1);
    duplicatePayload.append("organizationName", "KKWIEER ACM Chapter Duplicate");
    duplicatePayload.append("department", "Computer Engineering");
    duplicatePayload.append("applicantRole", "Student President");
    duplicatePayload.append("facultyCoordinatorName", "Prof. R. M. Kulkarni");
    duplicatePayload.append("facultyCoordinatorEmail", "faculty.coordinator@college.edu");
    duplicatePayload.append("plannedEventDetails", "Equinox Hackathon 2026: 36-hour hackathon.");
    duplicatePayload.append("proofLink", "https://drive.google.com/file/d/permission-letter-2026/view");
    duplicatePayload.append("reason", "Trying to submit again.");

    const resDuplicate = await clientStudent1.post("/organizer/apply", duplicatePayload);
    assert.strictEqual(resDuplicate.statusCode, 400, "Duplicate submission must return 400 Bad Request");
    assert.ok(resDuplicate.body.includes("already have an organizer application pending review"), "Must explain pending application exists");

    // Test MongoDB partial unique index directly
    let threwIndexError = false;
    try {
      await OrganizerApplication.create({
        applicantId: student1._id,
        organizationName: "Another Org",
        department: "Computer",
        applicantRole: "Lead",
        facultyCoordinatorName: "Prof. Test",
        facultyCoordinatorEmail: "test@college.edu",
        plannedEventDetails: "Planned Event Details 123",
        proofLink: "https://proof.example.com",
        reason: "Reason for applying again",
        status: "PENDING"
      });
    } catch (dbErr) {
      threwIndexError = dbErr.code === 11000;
    }
    assert.ok(threwIndexError, "MongoDB partial unique index must enforce single PENDING application per applicantId");
    console.log("   ✓ Duplicate pending submission blocked at route and database partial index level.");

    // -------------------------------------------------------------
    // Test 3: Student blocked from posting before approval
    // -------------------------------------------------------------
    console.log("3. Testing student blocked from posting/promoting hackathons before approval...");
    // Student 1 (PENDING)
    const resNewEventGet = await clientStudent1.get("/events/new");
    assert.strictEqual(resNewEventGet.statusCode, 403, "Pending student must be blocked from GET /events/new (403)");

    const csrfStudent1ForEvent = await clientStudent1.extractCsrf("/dashboard");
    const newEventForm1 = new URLSearchParams();
    newEventForm1.append("_csrf", csrfStudent1ForEvent);
    newEventForm1.append("name", "Unauthorized Student Hackathon");
    newEventForm1.append("organizer", "Unauthorized Student");
    newEventForm1.append("date", "2026-05-01");
    newEventForm1.append("deadline", "2026-04-20");
    const resNewEventPost = await clientStudent1.post("/events/new", newEventForm1);
    assert.strictEqual(resNewEventPost.statusCode, 403, "Pending student must be blocked from POST /events/new (403)");

    // Regular student (NONE)
    const clientStudent2 = new SessionClient(baseUrl);
    await clientStudent2.login(student2.email, "Password123!");
    const csrfStudent2ForEvent = await clientStudent2.extractCsrf("/dashboard");
    const newEventForm2 = new URLSearchParams();
    newEventForm2.append("_csrf", csrfStudent2ForEvent);
    newEventForm2.append("name", "Unauthorized Regular Student Hackathon");
    newEventForm2.append("organizer", "Regular Student");
    newEventForm2.append("date", "2026-05-01");
    newEventForm2.append("deadline", "2026-04-20");
    const resStudent2Post = await clientStudent2.post("/events/new", newEventForm2);
    assert.strictEqual(resStudent2Post.statusCode, 403, "Regular student must be blocked from POST /events/new (403)");
    console.log("   ✓ Non-approved students strictly blocked with HTTP 403 on server side.");

    // -------------------------------------------------------------
    // Test 4: Admin approval workflow
    // -------------------------------------------------------------
    console.log("4. Testing admin approval, atomic update, and organizer capability...");
    const clientAdmin1 = new SessionClient(baseUrl);
    await clientAdmin1.login(admin1.email, "Password123!");

    const resAdminList = await clientAdmin1.get("/admin/organizers");
    assert.strictEqual(resAdminList.statusCode, 200);
    assert.ok(resAdminList.body.includes("KKWIEER ACM Chapter"), "Admin view must list pending applications");
    assert.ok(resAdminList.body.includes("View Submitted Proof Link") || resAdminList.body.includes("https://drive.google.com"), "Proof link must be rendered safely");

    const csrfAdmin1 = await clientAdmin1.extractCsrf("/admin/organizers");
    const approveForm = new URLSearchParams();
    approveForm.append("_csrf", csrfAdmin1);

    const resApprove = await clientAdmin1.post(`/admin/organizers/${app1._id}/approve`, approveForm);
    assert.ok([200, 302].includes(resApprove.statusCode));

    // Verify DB update
    const app1Approved = await OrganizerApplication.findById(app1._id);
    assert.strictEqual(app1Approved.status, "APPROVED");
    assert.strictEqual(app1Approved.reviewedBy.toString(), admin1._id.toString());
    assert.ok(app1Approved.reviewedAt instanceof Date);

    const student1Approved = await User.findById(student1._id);
    assert.strictEqual(student1Approved.isOrganizer, true, "User.isOrganizer must be true");
    assert.strictEqual(student1Approved.organizerStatus, "APPROVED", "User.organizerStatus must be APPROVED");

    // Notification created
    const notifApproved = await Notification.findOne({ userId: student1._id, type: "success" });
    assert.ok(notifApproved, "In-app approval notification must be created");

    // Atomic update check: double approval returns 409
    const clientAdmin2 = new SessionClient(baseUrl);
    await clientAdmin2.login(admin2.email, "Password123!");
    const csrfAdmin2 = await clientAdmin2.extractCsrf("/admin/organizers");
    const resDoubleApprove = await clientAdmin2.post(`/admin/organizers/${app1._id}/approve`, new URLSearchParams({ _id: app1._id, _csrf: csrfAdmin2 }));
    assert.strictEqual(resDoubleApprove.statusCode, 409, "Double approve must return 409 Conflict");

    // Approved student can now create an event
    const csrfStudent1 = await clientStudent1.extractCsrf("/events/new");
    const validEvent = new URLSearchParams();
    validEvent.append("_csrf", csrfStudent1);
    validEvent.append("name", "Equinox Hackathon 2026");
    validEvent.append("organizer", "KKWIEER ACM Chapter");
    validEvent.append("date", "2026-04-10");
    validEvent.append("deadline", "2026-04-05");
    validEvent.append("mode", "Offline");
    validEvent.append("description", "Annual coding battle for KKWIEER engineering students.");

    const resCreateEvent = await clientStudent1.post("/events/new", validEvent);
    assert.ok([200, 302].includes(resCreateEvent.statusCode), `Approved organizer must be able to create events, got ${resCreateEvent.statusCode}`);

    const createdEvent = await Event.findOne({ name: "Equinox Hackathon 2026" });
    assert.ok(createdEvent, "Event must be saved in database by newly approved organizer");
    console.log("   ✓ Admin approval updates status atomically, syncs user, creates notification, and grants event creation rights.");

    // -------------------------------------------------------------
    // Test 5: Reject requires a reason and enforces 7-day cooldown
    // -------------------------------------------------------------
    console.log("5. Testing rejection requires a reason and enforces 7-day cooldown...");
    // Student 2 submits an application
    const csrfStudent2 = await clientStudent2.extractCsrf("/organizer/apply");
    const app2Payload = new URLSearchParams();
    app2Payload.append("_csrf", csrfStudent2);
    app2Payload.append("organizationName", "Robotics Club");
    app2Payload.append("department", "Mechanical / Robotics");
    app2Payload.append("applicantRole", "Coordinator");
    app2Payload.append("facultyCoordinatorName", "Prof. S. Joshi");
    app2Payload.append("facultyCoordinatorEmail", "s.joshi@college.edu");
    app2Payload.append("plannedEventDetails", "BotRace 2026 robotics hackathon.");
    app2Payload.append("proofLink", "https://club.kkwagh.edu.in/robotics/botrace");
    app2Payload.append("reason", "Host inter-departmental robotics hardware hackathon.");

    await clientStudent2.post("/organizer/apply", app2Payload);
    const app2 = await OrganizerApplication.findOne({ applicantId: student2._id, status: "PENDING" });
    assert.ok(app2, "Student 2 application must be created");

    // Admin rejects without reason -> 400
    let csrfAdmin1Reject = await clientAdmin1.extractCsrf("/admin/organizers");
    const emptyRejectForm = new URLSearchParams();
    emptyRejectForm.append("_csrf", csrfAdmin1Reject);
    emptyRejectForm.append("rejectionReason", "   ");

    const resEmptyReject = await clientAdmin1.post(`/admin/organizers/${app2._id}/reject`, emptyRejectForm);
    assert.strictEqual(resEmptyReject.statusCode, 400, "Rejecting without reason must return 400 Bad Request");

    // Admin rejects with valid reason
    csrfAdmin1Reject = await clientAdmin1.extractCsrf("/admin/organizers");
    const validRejectForm = new URLSearchParams();
    validRejectForm.append("_csrf", csrfAdmin1Reject);
    validRejectForm.append("rejectionReason", "Departmental HOD authorization letter is missing from the proof link.");

    const resReject = await clientAdmin1.post(`/admin/organizers/${app2._id}/reject`, validRejectForm);
    assert.ok([200, 302].includes(resReject.statusCode));

    const app2Rejected = await OrganizerApplication.findById(app2._id);
    assert.strictEqual(app2Rejected.status, "REJECTED");
    assert.strictEqual(app2Rejected.rejectionReason, "Departmental HOD authorization letter is missing from the proof link.");

    const student2Rejected = await User.findById(student2._id);
    assert.strictEqual(student2Rejected.organizerStatus, "REJECTED");
    assert.strictEqual(student2Rejected.isOrganizer, false);

    // Notification created
    const notifRejected = await Notification.findOne({ userId: student2._id, type: "danger" });
    assert.ok(notifRejected, "In-app rejection notification must be created with reason");
    assert.ok(notifRejected.subtitle.includes("Departmental HOD authorization letter"), "Notification subtitle must state rejection reason");

    // Check student 2 view: shows rejection reason and 7-day cooldown
    const resStudent2ApplyView = await clientStudent2.get("/organizer/apply");
    assert.strictEqual(resStudent2ApplyView.statusCode, 200);
    assert.ok(resStudent2ApplyView.body.includes("Application Not Approved"), "Must display rejection card");
    assert.ok(resStudent2ApplyView.body.includes("Departmental HOD authorization letter"), "Must display rejection reason in view");
    assert.ok(resStudent2ApplyView.body.includes("7-Day Reapplication Cooldown"), "Must display cooldown notice");

    // Reapply immediately blocked
    const csrfStudent2Reapply = await clientStudent2.extractCsrf("/organizer/apply");
    const reapplyPayload = new URLSearchParams(app2Payload);
    reapplyPayload.set("_csrf", csrfStudent2Reapply);

    const resEarlyReapply = await clientStudent2.post("/organizer/apply", reapplyPayload);
    assert.strictEqual(resEarlyReapply.statusCode, 400, "Reapplying before 7-day cooldown must return 400");
    assert.ok(resEarlyReapply.body.includes("waiting period is required"), "Must communicate 7-day waiting period");
    console.log("   ✓ Rejection requires non-empty reason, displays reason safely, and enforces 7-day cooldown.");

    // -------------------------------------------------------------
    // Test 6: Self-approval blocked
    // -------------------------------------------------------------
    console.log("6. Testing self-approval blocked...");
    // Create an application on behalf of admin1
    const adminApp = await OrganizerApplication.create({
      applicantId: admin1._id,
      organizationName: "Admin AI Lab Chapter",
      department: "Computer",
      applicantRole: "Advisor",
      facultyCoordinatorName: "Dr. Admin",
      facultyCoordinatorEmail: "admin.faculty@college.edu",
      plannedEventDetails: "AI Hackathon 2026",
      proofLink: "https://ailab.kkwagh.edu.in",
      reason: "Host university AI hackathon.",
      status: "PENDING"
    });

    // Admin 1 attempts to approve own application
    let csrfAdmin1Self = await clientAdmin1.extractCsrf("/admin/organizers");
    const selfApproveForm = new URLSearchParams({ _csrf: csrfAdmin1Self });
    const resSelfApprove = await clientAdmin1.post(`/admin/organizers/${adminApp._id}/approve`, selfApproveForm);
    assert.strictEqual(resSelfApprove.statusCode, 403, "Self-approval must return 403 Forbidden");

    // Admin 1 attempts to reject own application
    csrfAdmin1Self = await clientAdmin1.extractCsrf("/admin/organizers");
    const selfRejectForm = new URLSearchParams({ _csrf: csrfAdmin1Self, rejectionReason: "Self reject test" });
    const resSelfReject = await clientAdmin1.post(`/admin/organizers/${adminApp._id}/reject`, selfRejectForm);
    assert.strictEqual(resSelfReject.statusCode, 403, "Self-rejection must return 403 Forbidden");

    // Admin 2 (different administrator) CAN approve
    const csrfAdmin2Approve = await clientAdmin2.extractCsrf("/admin/organizers");
    const approveByAdmin2 = await clientAdmin2.post(`/admin/organizers/${adminApp._id}/approve`, new URLSearchParams({ _csrf: csrfAdmin2Approve }));
    assert.ok([200, 302].includes(approveByAdmin2.statusCode), "Different administrator can approve");
    console.log("   ✓ Administrators strictly forbidden from approving or deciding their own application (403).");

    // -------------------------------------------------------------
    // Test 7: Non-admin blocked from admin review panel
    // -------------------------------------------------------------
    console.log("7. Testing non-admin blocked from review page and decision routes...");
    const resNonAdminPanel = await clientStudent1.get("/admin/organizers");
    assert.strictEqual(resNonAdminPanel.statusCode, 403, "Non-admin student must be forbidden from /admin/organizers (403)");

    const csrfStudent1ForAdmin = await clientStudent1.extractCsrf("/dashboard");
    const resNonAdminApprove = await clientStudent1.post(`/admin/organizers/${adminApp._id}/approve`, new URLSearchParams({ _csrf: csrfStudent1ForAdmin }));
    assert.strictEqual(resNonAdminApprove.statusCode, 403, "Non-admin student must be forbidden from approving (403)");

    const csrfStudent1ForReject = await clientStudent1.extractCsrf("/dashboard");
    const resNonAdminReject = await clientStudent1.post(`/admin/organizers/${adminApp._id}/reject`, new URLSearchParams({ _csrf: csrfStudent1ForReject, rejectionReason: "test" }));
    assert.strictEqual(resNonAdminReject.statusCode, 403, "Non-admin student must be forbidden from rejecting (403)");
    console.log("   ✓ Non-admin access to review panel and decision POST routes strictly blocked with HTTP 403.");

    // -------------------------------------------------------------
    // Test 8: Dashboard button reflects role
    // -------------------------------------------------------------
    console.log("8. Testing dashboard buttons reflect role correctly...");
    // Admin 1 sees "+ Post New Hackathon" and does not see "Apply for Organizer Status"
    const resDashboardAdmin = await clientAdmin1.get("/dashboard");
    assert.strictEqual(resDashboardAdmin.statusCode, 200);
    assert.ok(resDashboardAdmin.body.includes("+ Post New Hackathon"), "Admin must see '+ Post New Hackathon'");
    assert.ok(!resDashboardAdmin.body.includes("Apply for Organizer Status"), "Admin must NOT see 'Apply for Organizer Status'");

    // Approved organizer (student 1) sees "+ Post New Hackathon" and does not see "Apply for Organizer Status"
    const resDashboardApproved = await clientStudent1.get("/dashboard");
    assert.strictEqual(resDashboardApproved.statusCode, 200);
    assert.ok(resDashboardApproved.body.includes("+ Post New Hackathon"), "Approved organizer must see '+ Post New Hackathon'");
    assert.ok(!resDashboardApproved.body.includes("Apply for Organizer Status"), "Approved organizer must NOT see 'Apply for Organizer Status'");

    // Regular / rejected student (student 2) sees "Apply for Organizer Status" and not "+ Post New Hackathon" in that card
    const resDashboardStudent = await clientStudent2.get("/dashboard");
    assert.strictEqual(resDashboardStudent.statusCode, 200);
    assert.ok(resDashboardStudent.body.includes("Apply for Organizer Status"), "Regular student must see 'Apply for Organizer Status'");
    console.log("   ✓ Dashboard accurately renders '+ Post New Hackathon' for admins/organizers and 'Apply for Organizer Status' for students.");

    // -------------------------------------------------------------
    // Test 9: Input validation edge cases
    // -------------------------------------------------------------
    console.log("9. Testing faculty coordinator email & proof link validation edge cases...");
    const student3 = await User.create({
      name: "Chirag Varma",
      email: "chirag.varma@kkwagh.edu.in",
      password: passwordHash,
      department: "AIDS",
      year: "SE",
      role: "Candidate",
      isEmailVerified: true
    });
    const clientStudent3 = new SessionClient(baseUrl);
    await clientStudent3.login(student3.email, "Password123!");
    const csrf3 = await clientStudent3.extractCsrf("/organizer/apply");

    // Case 1: Faculty email equal to applicant email
    const sameEmailPayload = new URLSearchParams();
    sameEmailPayload.append("_csrf", csrf3);
    sameEmailPayload.append("organizationName", "Chirag Tech Club");
    sameEmailPayload.append("department", "AIDS");
    sameEmailPayload.append("applicantRole", "Lead");
    sameEmailPayload.append("facultyCoordinatorName", "Prof. Same");
    sameEmailPayload.append("facultyCoordinatorEmail", "chirag.varma@kkwagh.edu.in"); // same as student!
    sameEmailPayload.append("plannedEventDetails", "AI coding competition for students.");
    sameEmailPayload.append("proofLink", "https://drive.google.com/test");
    sameEmailPayload.append("reason", "Test email matching applicant.");

    const resSameEmail = await clientStudent3.post("/organizer/apply", sameEmailPayload);
    assert.strictEqual(resSameEmail.statusCode, 400, "Faculty email identical to applicant must be rejected (400)");
    assert.ok(resSameEmail.body.includes("Faculty coordinator email must be different from your own account email"));

    // Case 2: Malformed or dangerous proofLink (javascript:)
    const csrf3Case2 = await clientStudent3.extractCsrf("/organizer/apply");
    const badLinkPayload = new URLSearchParams(sameEmailPayload);
    badLinkPayload.set("_csrf", csrf3Case2);
    badLinkPayload.set("facultyCoordinatorEmail", "different.faculty@college.edu");
    badLinkPayload.set("proofLink", "javascript:alert(1)");

    const resBadLink = await clientStudent3.post("/organizer/apply", badLinkPayload);
    assert.strictEqual(resBadLink.statusCode, 400, "Non-http proof link must be rejected (400)");
    assert.ok(resBadLink.body.includes("valid HTTP or HTTPS proof link is required"));
    console.log("   ✓ Faculty email check and URL protocol validation confirmed.");

    console.log("\n=================================================");
    console.log("ALL 9 HACKATHON ORGANIZER WORKFLOW TESTS PASSED (100%)");
    console.log("=================================================");

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.disconnect();
    if (typeof connectDB.stopMemoryServer === "function") {
      await connectDB.stopMemoryServer();
    }
    setTimeout(() => {
      process.exit(0);
    }, 100).unref();
  }
}

runOrganizerWorkflowTests().then(() => {
  setTimeout(() => process.exit(0), 100);
}).catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
