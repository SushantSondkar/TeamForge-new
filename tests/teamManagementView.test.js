const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

console.log("=================================================");
console.log("RUNNING TEAM MANAGEMENT VIEW COMPATIBILITY TESTS");
console.log("=================================================\n");

const templatePath = path.join(__dirname, "..", "views", "applications", "team.ejs");
const templateContent = fs.readFileSync(templatePath, "utf8");

const mockTeam = {
  _id: "507f191e810c19729de860ea",
  projectName: "Test Hackathon Project",
  projectRequirement: "Building full-stack app",
  theme: "WEB3 & AI",
  teamSize: 4,
  roles: [
    { title: "Frontend Lead", openings: 1 },
    { title: "Backend Engineer", openings: 1 }
  ]
};

function createMockApp({ id = "507f1f77bcf86cd799439011", direction, status, bothOptedIn = false, myContactOptIn = false }) {
  return {
    _id: id,
    direction: direction,
    status: status,
    role: "Frontend Lead",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    bothOptedIn: bothOptedIn,
    myContactOptIn: myContactOptIn,
    applicantId: {
      _id: "6ae18b1b5c884d41ad340e29",
      name: direction === "APPLY" ? "Alice Candidate" : "Bob Invitee",
      email: "student@kkwagh.edu.in",
      github: "studentdev",
      linkedin: "student-dev",
      profilePic: null,
      skills: [{ name: "React" }, { name: "Node.js" }]
    }
  };
}

function renderTeamView(applications, extraLocals = {}) {
  const locals = {
    team: mockTeam,
    applications: applications,
    receivedApplications: applications.filter(a => a.direction === "APPLY"),
    sentInvitations: applications.filter(a => a.direction === "INVITE"),
    csrfToken: "test_csrf_token_12345",
    formatDate: (d) => new Date(d).toLocaleDateString(),
    layout: (p) => {},
    ...extraLocals
  };
  return ejs.render(templateContent, locals, { views: [path.join(__dirname, "..", "views")] });
}

function runTests() {
  const statuses = ["PENDING", "ACCEPTED", "LOCKED", "ROLE_FILLED", "DECLINED", "REJECTED", "EXPIRED"];
  const directions = ["APPLY", "INVITE"];

  console.log("1. Testing all 14 Direction × Status combinations against origin/main behavior...\n");

  for (const direction of directions) {
    for (const status of statuses) {
      const mockApp = createMockApp({ direction, status });
      const html = renderTeamView([mockApp]);

      if (direction === "APPLY") {
        assert.ok(html.includes("CANDIDATE APPLIED"), `[APPLY/${status}] Must contain CANDIDATE APPLIED label`);

        if (status === "PENDING") {
          assert.ok(html.includes("PENDING REVIEW"), "[APPLY/PENDING] Must show PENDING REVIEW badge");
          assert.ok(html.includes("Awaiting your decision"), "[APPLY/PENDING] Must show Awaiting your decision text");
          assert.ok(html.includes(`action="/applications/${mockApp._id}/accept"`), "[APPLY/PENDING] Must contain accept form");
          assert.ok(html.includes("Accept Application"), "[APPLY/PENDING] Must contain Accept Application button");
          assert.ok(html.includes(`action="/applications/${mockApp._id}/reject"`), "[APPLY/PENDING] Must contain decline form");
          assert.ok(html.includes("Decline"), "[APPLY/PENDING] Must contain Decline button");
          assert.ok(!html.includes("Cancel Invite"), "[APPLY/PENDING] Must NOT contain Cancel Invite for incoming application");
        } else if (status === "ACCEPTED") {
          assert.ok(html.includes("ACCEPTED"), "[APPLY/ACCEPTED] Must show ACCEPTED badge");
          assert.ok(html.includes("Awaiting candidate confirmation"), "[APPLY/ACCEPTED] Must show Awaiting candidate confirmation");
          assert.ok(!html.includes("Accept Application"), "[APPLY/ACCEPTED] Must not show Accept button");
        } else if (status === "LOCKED") {
          assert.ok(html.includes("🔒 LOCKED"), "[APPLY/LOCKED] Must show 🔒 LOCKED badge");
          assert.ok(html.includes("Confirmed Member"), "[APPLY/LOCKED] Must show Confirmed Member label");
        } else if (status === "ROLE_FILLED") {
          assert.ok(html.includes("ROLE FILLED"), "[APPLY/ROLE_FILLED] Must show ROLE FILLED badge");
        } else if (status === "DECLINED" || status === "REJECTED") {
          assert.ok(html.includes("DECLINED"), `[APPLY/${status}] Must show DECLINED badge`);
        } else if (status === "EXPIRED") {
          assert.ok(html.includes("EXPIRED"), "[APPLY/EXPIRED] Must show EXPIRED badge");
        }
      } else {
        // direction === 'INVITE'
        assert.ok(html.includes("INVITED BY YOU"), `[INVITE/${status}] Must contain INVITED BY YOU label`);

        if (status === "PENDING") {
          assert.ok(html.includes("INVITE SENT"), "[INVITE/PENDING] Must show INVITE SENT badge");
          assert.ok(html.includes("Waiting for candidate response"), "[INVITE/PENDING] Must show Waiting for candidate response text");
          assert.ok(html.includes(`action="/applications/${mockApp._id}/reject"`), "[INVITE/PENDING] Must contain real POST reject form for Cancel Invite");
          assert.ok(html.includes('data-confirm="Cancel this team invitation?"'), "[INVITE/PENDING] Must contain data-confirm attribute on form");
          assert.ok(html.includes("Cancel Invite"), "[INVITE/PENDING] Must contain Cancel Invite button text");
          assert.ok(!html.includes("Accept Application"), "[INVITE/PENDING] Must NOT contain Accept Application button");
        } else if (status === "ACCEPTED") {
          assert.ok(html.includes("CANDIDATE ACCEPTED"), "[INVITE/ACCEPTED] Must show CANDIDATE ACCEPTED badge");
          assert.ok(html.includes("Action required: Confirm spot"), "[INVITE/ACCEPTED] Must show Action required: Confirm spot text");
          assert.ok(html.includes(`action="/applications/${mockApp._id}/confirm"`), "[INVITE/ACCEPTED] Must contain POST confirm form");
          assert.ok(html.includes("Confirm & Lock Spot"), "[INVITE/ACCEPTED] Must contain Confirm & Lock Spot button");
          assert.ok(html.includes(`action="/applications/${mockApp._id}/reject"`), "[INVITE/ACCEPTED] Must contain POST decline form");
          assert.ok(html.includes("Decline"), "[INVITE/ACCEPTED] Must contain Decline button");
        } else if (status === "LOCKED") {
          assert.ok(html.includes("🔒 LOCKED"), "[INVITE/LOCKED] Must show 🔒 LOCKED badge");
          assert.ok(html.includes("Confirmed Member"), "[INVITE/LOCKED] Must show Confirmed Member label");
        } else if (status === "ROLE_FILLED") {
          assert.ok(html.includes("ROLE FILLED"), "[INVITE/ROLE_FILLED] Must show ROLE FILLED badge");
        } else if (status === "DECLINED" || status === "REJECTED") {
          assert.ok(html.includes("DECLINED"), `[INVITE/${status}] Must show DECLINED badge`);
        } else if (status === "EXPIRED") {
          assert.ok(html.includes("EXPIRED"), "[INVITE/EXPIRED] Must show EXPIRED badge");
        }
      }
      console.log(`   ✓ Verified [${direction} / ${status}]`);
    }
  }

  // 2. Testing real status fallback for unknown/custom status
  console.log("\n2. Testing Real Status Fallback (no forced PENDING conversion)...");
  const customApp = createMockApp({ direction: "INVITE", status: "CUSTOM_UNDER_REVIEW" });
  const customHtml = renderTeamView([customApp]);
  assert.ok(customHtml.includes("CUSTOM_UNDER_REVIEW"), "Must preserve custom status badge text");
  assert.ok(!customHtml.includes("INVITE SENT"), "Must not turn custom status into INVITE SENT/PENDING");
  console.log("   ✓ Unknown statuses correctly display their real status string.");

  // 3. Testing Contact Sharing States for LOCKED actions
  console.log("\n3. Testing Contact Sharing States for LOCKED actions...");
  const lockedUnshared = createMockApp({ direction: "APPLY", status: "LOCKED", bothOptedIn: false, myContactOptIn: false });
  const htmlUnshared = renderTeamView([lockedUnshared]);
  assert.ok(htmlUnshared.includes("Share Contact Info"), "Must show Share Contact Info button when neither shared");
  assert.ok(htmlUnshared.includes(`action="/applications/${lockedUnshared._id}/contact-consent"`), "Must point to contact-consent route");

  const lockedAwaiting = createMockApp({ direction: "APPLY", status: "LOCKED", bothOptedIn: false, myContactOptIn: true });
  const htmlAwaiting = renderTeamView([lockedAwaiting]);
  assert.ok(htmlAwaiting.includes("Waiting for teammate consent"), "Must show Waiting for teammate consent when self opted in");

  const lockedMutual = createMockApp({ direction: "APPLY", status: "LOCKED", bothOptedIn: true, myContactOptIn: true });
  const htmlMutual = renderTeamView([lockedMutual]);
  assert.ok(htmlMutual.includes("student@kkwagh.edu.in"), "Must show student email on mutual consent");
  assert.ok(htmlMutual.includes("github.com/studentdev"), "Must show student GitHub on mutual consent");
  assert.ok(htmlMutual.includes("LinkedIn:"), "Must show student LinkedIn on mutual consent");
  console.log("   ✓ All 3 contact sharing states verified.");

  // 4. Testing WAI-ARIA Tabs, Roles, Keyboard Nav markup, and External Script
  console.log("\n4. Testing Tab Layout, ARIA roles, and External Script integration...");
  const allHtml = renderTeamView([
    createMockApp({ id: "1", direction: "APPLY", status: "PENDING" }),
    createMockApp({ id: "2", direction: "INVITE", status: "PENDING" })
  ]);
  assert.ok(allHtml.includes('role="tablist"'), "Must contain role='tablist'");
  assert.ok(allHtml.includes('id="tab-all-activity"'), "Must contain tab-all-activity");
  assert.ok(allHtml.includes('id="tab-received-applications"'), "Must contain tab-received-applications");
  assert.ok(allHtml.includes('id="tab-sent-invitations"'), "Must contain tab-sent-invitations");
  assert.ok(allHtml.includes('id="pane-all-activity"'), "Must contain pane-all-activity");
  assert.ok(allHtml.includes('id="pane-received-applications"'), "Must contain pane-received-applications");
  assert.ok(allHtml.includes('id="pane-sent-invitations"'), "Must contain pane-sent-invitations");
  assert.ok(allHtml.includes('src="/js/team-manage.js"'), "Must include external /js/team-manage.js script");
  assert.ok(!allHtml.includes("<script>"), "Must NOT contain any inline <script> block");
  assert.ok(!allHtml.includes("onclick="), "Must NOT contain any inline onclick handler");
  assert.ok(!allHtml.includes("onsubmit="), "Must NOT contain any inline onsubmit handler");
  console.log("   ✓ Tab accessibility and CSP-compliance verified.");

  // 5. Testing public/*.html for inline handlers and scripts
  console.log("\n5. Testing public/ directory for any .html files with inline handlers/scripts...");
  const publicDir = path.join(__dirname, "..", "public");
  function checkDirHtml(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        checkDirHtml(full);
      } else if (item.endsWith(".html")) {
        const content = fs.readFileSync(full, "utf8");
        assert.ok(!/\bon[a-zA-Z]+\s*=/g.test(content), `public HTML ${item} must not contain inline event handlers`);
        assert.ok(!/href\s*=\s*['"]\s*javascript:/gi.test(content), `public HTML ${item} must not contain javascript: URLs`);
        assert.ok(!/<script(?![^>]*\bsrc\b)[^>]*>/gi.test(content), `public HTML ${item} must not contain inline <script> tags`);
        console.log(`   ✓ Checked public HTML: ${item}`);
      }
    }
  }
  checkDirHtml(publicDir);
  console.log("   ✓ public/ directory HTML audit complete.");

  console.log("\n=================================================");
  console.log("ALL TEAM MANAGEMENT VIEW COMPATIBILITY TESTS PASSED (100%)");
  console.log("=================================================");
}

runTests();
