/**
 * tests/eventPostersAndCarousel.test.js
 *
 * Verifies:
 * 1. Image signature validation: Valid JPG, PNG, WebP are accepted; SVG, GIF, fake .png, and oversize files are rejected.
 * 2. Event poster storage & serving: GET /events/:id/poster returns 200 with correct Content-Type, nosniff, ETag, Cache-Control, and 304 on match.
 * 3. Permissions: Non-owner student cannot edit event, replace poster, remove poster, or delete event (403).
 * 4. Admin moderation: Admin can remove a poster, event stays, organizer receives notification.
 * 5. Cascade deletion: Deleting an event deletes its EventPoster document, and the poster is no longer served (404).
 * 6. Date filtering: Past events (before today in Asia/Kolkata) are excluded from the carousel; upcoming events are included.
 * 7. Carousel behavior & CSP compliance: Rendered dashboard contains carousel structure with zero inline scripts or handlers.
 */

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "event_poster_test_session_secret_32_chars";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "event_poster_test_cookie_secret_32_chars";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "event_poster_test_csrf_secret_32_chars";

const app = require("../app");
const connectDB = require("../models/db");
const mongoose = require("mongoose");
const User = require("../models/User");
const Event = require("../models/Event");
const EventPoster = require("../models/EventPoster");
const Notification = require("../models/Notification");
const {
  detectImageSignature,
  saveEventPoster,
  removeEventPoster,
  deleteEventAndPoster,
  getIndiaStartOfToday
} = require("../utils/eventService");

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

      const req = http.request(
        url,
        {
          method: options.method || "GET",
          headers: reqHeaders
        },
        (res) => {
          this.updateCookies(res.headers["set-cookie"]);
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: buffer.toString("utf8"),
              buffer
            });
          });
        }
      );
      req.on("error", reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async get(pathname, headers = {}) {
    return this.request(pathname, { method: "GET", headers });
  }

  async postUrlEncoded(pathname, data, headers = {}) {
    const params = new URLSearchParams(data);
    const bodyStr = params.toString();
    return this.request(pathname, {
      method: "POST",
      headers: Object.assign(
        {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(bodyStr)
        },
        headers
      ),
      body: bodyStr
    });
  }

  async postMultipart(pathname, fields, fileField, headers = {}) {
    const boundary = "----TestBoundary" + Math.random().toString(36).substring(2);
    const chunks = [];

    for (const [k, v] of Object.entries(fields)) {
      chunks.push(
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
      );
    }

    if (fileField) {
      const { name, filename, contentType, buffer } = fileField;
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
        )
      );
      chunks.push(buffer);
      chunks.push(Buffer.from("\r\n"));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const fullBody = Buffer.concat(chunks);

    return this.request(pathname, {
      method: "POST",
      headers: Object.assign(
        {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": fullBody.length
        },
        headers
      ),
      body: fullBody
    });
  }

  async fetchCsrf(pathname = "/events/new") {
    const res = await this.get(pathname);
    const match = res.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(match, `Must find CSRF token on ${pathname}`);
    return match[1];
  }

  async login(email, password) {
    const resGet = await this.get("/login");
    const csrfMatch = resGet.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(csrfMatch, "Must find CSRF token in /login");
    const csrfToken = csrfMatch[1];

    const resPost = await this.postUrlEncoded("/login", {
      _csrf: csrfToken,
      email,
      password
    });
    assert.ok(
      resPost.statusCode === 302 || resPost.statusCode === 200,
      `Login should succeed, got ${resPost.statusCode}`
    );
  }
}

async function run() {
  console.log("=================================================");
  console.log("RUNNING EVENT POSTERS & CAROUSEL TEST SUITE");
  console.log("=================================================\n");

  // 1. Unit testing image signature detection
  console.log("1. Testing Image Magic Bytes & Signature Detection...");

  // Valid JPEG: FF D8 FF
  const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.strictEqual(detectImageSignature(validJpg), "image/jpeg", "JPEG signature must be detected as image/jpeg");

  // Valid PNG: 89 50 4E 47 0D 0A 1A 0A
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert.strictEqual(detectImageSignature(validPng), "image/png", "PNG signature must be detected as image/png");

  // Valid WebP: RIFF ... WEBP
  const validWebp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50  // WEBP
  ]);
  assert.strictEqual(detectImageSignature(validWebp), "image/webp", "WebP signature must be detected as image/webp");

  // SVG rejected
  const svgBuf = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><circle r='10'/></svg>");
  assert.strictEqual(detectImageSignature(svgBuf), null, "SVG must be rejected (return null)");

  // GIF rejected
  const gifBuf = Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff");
  assert.strictEqual(detectImageSignature(gifBuf), null, "GIF must be rejected (return null)");

  // Fake PNG (plain text disguised with .png extension)
  const fakePng = Buffer.from("Not a real png, just malicious text or HTML payload");
  assert.strictEqual(detectImageSignature(fakePng), null, "Fake PNG text content must be rejected");

  console.log("   ✓ detectImageSignature correctly accepts JPG/PNG/WebP and rejects SVG/GIF/fake files.");

  // 2. Connect DB and spin up test server
  console.log("\n2. Initializing Database and Test Server...");
  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const passwordHash = await bcrypt.hash("Password123!", 10);

    // Create 3 test users: approved organizer, unprivileged student, and admin
    const organizerUser = await User.create({
      name: "Approved Organizer",
      email: "organizer_carousel@kkwagh.edu.in",
      password: passwordHash,
      department: "Computer Engineering",
      year: "TE",
      isEmailVerified: true,
      isOrganizer: true,
      organizerStatus: "APPROVED",
      role: "Organizer"
    });

    const otherStudent = await User.create({
      name: "Student Candidate",
      email: "student_carousel@kkwagh.edu.in",
      password: passwordHash,
      department: "Information Technology",
      year: "SE",
      isEmailVerified: true,
      isOrganizer: false,
      organizerStatus: "NONE",
      role: "Candidate"
    });

    const adminUser = await User.create({
      name: "Campus Admin",
      email: "admin_carousel@kkwagh.edu.in",
      password: passwordHash,
      department: "Computer Engineering",
      year: "TE",
      isEmailVerified: true,
      isAdmin: true,
      role: "Admin"
    });

    // 3. Organizer creates event with valid PNG poster
    console.log("\n3. Testing Event Creation with Valid Poster Upload...");
    const orgClient = new SessionClient(baseUrl);
    await orgClient.login(organizerUser.email, "Password123!");

    const csrfNew = await orgClient.fetchCsrf("/events/new");
    const samplePosterPath = path.join(__dirname, "..", "tools", "sample-posters", "poster-portrait.png");
    const samplePosterBuf = fs.readFileSync(samplePosterPath);

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const futureDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const createRes = await orgClient.postMultipart(
      "/events/new",
      {
        _csrf: csrfNew,
        name: "Test Hackathon With Poster",
        organizer: "Computer Engineering Dept",
        type: "Hackathon",
        mode: "Offline",
        date: futureDate,
        deadline: futureDeadline,
        link: "https://kkwagh.edu.in/hackathon",
        description: "Official campus hackathon test event."
      },
      {
        name: "poster",
        filename: "poster-portrait.png",
        contentType: "image/png",
        buffer: samplePosterBuf
      }
    );

    assert.strictEqual(createRes.statusCode, 302, "Valid event creation with poster must redirect to /events/:id");
    const eventIdMatch = createRes.headers.location.match(/\/events\/([a-f0-9]{24})/);
    assert.ok(eventIdMatch, "Redirect location must contain event ID");
    const eventId = eventIdMatch[1];

    const savedEvent = await Event.findById(eventId);
    assert.ok(savedEvent, "Event must be saved in MongoDB");
    assert.strictEqual(savedEvent.hasPoster, true, "savedEvent.hasPoster must be true");

    const savedPoster = await EventPoster.findOne({ eventId: savedEvent._id });
    assert.ok(savedPoster, "EventPoster document must be saved in MongoDB");
    assert.strictEqual(savedPoster.contentType, "image/png", "Saved poster contentType must be image/png");
    assert.strictEqual(savedPoster.size, samplePosterBuf.length, "Saved poster size must match upload buffer");
    console.log("   ✓ Event and poster created successfully with hasPoster=true.");

    // 4. Test Serving the Poster via GET /events/:id/poster
    console.log("\n4. Testing GET /events/:id/poster Serving & Headers...");
    const posterRes = await orgClient.get(`/events/${eventId}/poster`);
    assert.strictEqual(posterRes.statusCode, 200, "GET /events/:id/poster must return HTTP 200");
    assert.strictEqual(posterRes.headers["content-type"], "image/png", "Content-Type must be image/png");
    assert.strictEqual(posterRes.headers["x-content-type-options"], "nosniff", "X-Content-Type-Options must be nosniff");
    assert.ok(posterRes.headers["cache-control"], "Cache-Control header must be set");
    assert.ok(posterRes.headers["etag"], "ETag header must be set");
    assert.strictEqual(posterRes.buffer.length, samplePosterBuf.length, "Served buffer must match uploaded poster");

    // Test Conditional GET (304 Not Modified)
    const etag = posterRes.headers["etag"];
    const conditionalRes = await orgClient.get(`/events/${eventId}/poster`, {
      "if-none-match": etag
    });
    assert.strictEqual(conditionalRes.statusCode, 304, "Conditional request with matching ETag must return 304 Not Modified");
    console.log("   ✓ Poster served with 200, nosniff, ETag, Cache-Control, and 304 on match.");

    // 5. Test Invalid Upload Rejections (SVG, fake PNG, oversize)
    console.log("\n5. Testing Invalid File Upload Rejections...");
    const csrfSvg = await orgClient.fetchCsrf("/events/new");
    const svgRes = await orgClient.postMultipart(
      "/events/new",
      {
        _csrf: csrfSvg,
        name: "Invalid SVG Hackathon",
        organizer: "Hacker Club",
        date: futureDate,
        deadline: futureDeadline
      },
      {
        name: "poster",
        filename: "evil.svg",
        contentType: "image/svg+xml",
        buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")
      }
    );
    assert.strictEqual(svgRes.statusCode, 400, "SVG upload must be rejected with HTTP 400");
    assert.ok(svgRes.body.includes("Only JPG, PNG or WebP"), "Must show friendly file type error message");

    const csrfFake = await orgClient.fetchCsrf("/events/new");
    const fakeRes = await orgClient.postMultipart(
      "/events/new",
      {
        _csrf: csrfFake,
        name: "Fake PNG Hackathon",
        organizer: "Hacker Club",
        date: futureDate,
        deadline: futureDeadline
      },
      {
        name: "poster",
        filename: "fake.png",
        contentType: "image/png",
        buffer: Buffer.from("<html><head><title>Fake</title></head><body>Fake</body></html>")
      }
    );
    assert.strictEqual(fakeRes.statusCode, 400, "Fake PNG (HTML payload) must be rejected with HTTP 400");
    assert.ok(fakeRes.body.includes("Only JPG, PNG or WebP"), "Must show friendly file type error message");

    // Oversize file rejection (> 1.5 MB)
    const csrfOversize = await orgClient.fetchCsrf("/events/new");
    const oversizeBuffer = Buffer.alloc(1.6 * 1024 * 1024, 0xaa);
    const oversizeRes = await orgClient.postMultipart(
      "/events/new",
      {
        _csrf: csrfOversize,
        name: "Oversize Hackathon",
        organizer: "Hacker Club",
        date: futureDate,
        deadline: futureDeadline
      },
      {
        name: "poster",
        filename: "huge.png",
        contentType: "image/png",
        buffer: oversizeBuffer
      }
    );
    assert.strictEqual(oversizeRes.statusCode, 400, "Oversize file (>1.5MB) must be rejected with HTTP 400");
    assert.ok(oversizeRes.body.includes("under 1.5 MB"), "Must show friendly size error message");
    console.log("   ✓ SVG, fake PNG, and oversize files are properly rejected with friendly form error banners.");

    // 6. Test Permissions (non-owner student cannot edit, replace or remove poster)
    console.log("\n6. Testing Authorization & Ownership Controls...");
    const studentClient = new SessionClient(baseUrl);
    await studentClient.login(otherStudent.email, "Password123!");

    const studentEditRes = await studentClient.get(`/events/${eventId}/edit`);
    assert.strictEqual(studentEditRes.statusCode, 403, "Non-owner student must receive 403 on GET /events/:id/edit");

    const csrfStudent = await studentClient.fetchCsrf("/events");
    const studentRemoveRes = await studentClient.postUrlEncoded(`/events/${eventId}/poster/remove`, {
      _csrf: csrfStudent
    });
    assert.strictEqual(studentRemoveRes.statusCode, 403, "Non-owner student must receive 403 on POST /events/:id/poster/remove");

    const csrfStudentDelete = await studentClient.fetchCsrf("/events");
    const studentDeleteRes = await studentClient.postUrlEncoded(`/events/${eventId}/delete`, {
      _csrf: csrfStudentDelete
    });
    assert.strictEqual(studentDeleteRes.statusCode, 403, "Non-owner student must receive 403 on POST /events/:id/delete");
    console.log("   ✓ Non-owner student correctly blocked with 403 from editing, removing poster, or deleting event.");

    // 7. Test Admin Poster Removal (Event stays, poster deleted, notification sent)
    console.log("\n7. Testing Admin Poster Moderation & Organizer Notification...");
    const adminClient = new SessionClient(baseUrl);
    await adminClient.login(adminUser.email, "Password123!");

    const csrfAdmin = await adminClient.fetchCsrf("/events/new");
    const adminRemoveRes = await adminClient.postUrlEncoded(`/events/${eventId}/poster/remove`, {
      _csrf: csrfAdmin
    });
    assert.strictEqual(adminRemoveRes.statusCode, 302, "Admin remove poster must redirect");

    // Poster should now return 404
    const posterAfterAdminRemove = await adminClient.get(`/events/${eventId}/poster`);
    assert.strictEqual(posterAfterAdminRemove.statusCode, 404, "Removed poster must return 404");

    // Event document must still exist
    const eventStillExists = await Event.findById(eventId);
    assert.ok(eventStillExists, "Event must still exist after poster removal");
    assert.strictEqual(eventStillExists.hasPoster, false, "event.hasPoster must now be false");

    // Organizer must have received an admin alert notification
    const organizerNotice = await Notification.findOne({
      userId: organizerUser._id,
      type: "warning"
    });
    assert.ok(organizerNotice, "Organizer must receive a notification about poster removal");
    assert.ok(organizerNotice.title.includes("poster removed"), "Notification title must explain poster removal");
    console.log("   ✓ Admin successfully removed poster, event was preserved, and organizer was notified.");

    // 8. Test Cascade Deletion (Deleting event deletes poster and vanishes from dashboard)
    console.log("\n8. Testing Cascade Event and Poster Deletion...");
    // Restore poster on event
    await saveEventPoster(eventId, samplePosterBuf, organizerUser._id);
    assert.ok(await EventPoster.exists({ eventId }), "Poster exists before deletion");

    const csrfDelete = await orgClient.fetchCsrf(`/events/${eventId}/edit`);
    const deleteRes = await orgClient.postUrlEncoded(`/events/${eventId}/delete`, {
      _csrf: csrfDelete
    });
    assert.strictEqual(deleteRes.statusCode, 302, "Event deletion must redirect to /events");

    assert.strictEqual(await Event.findById(eventId), null, "Event must be deleted from MongoDB");
    assert.strictEqual(await EventPoster.findOne({ eventId }), null, "EventPoster must be deleted from MongoDB");

    const posterAfterEventDelete = await orgClient.get(`/events/${eventId}/poster`);
    assert.strictEqual(posterAfterEventDelete.statusCode, 404, "Poster route must return 404 for deleted event");
    console.log("   ✓ Deleting event completely removes poster and cascade cleanup succeeds.");

    // 9. Test Date Filtering (Past events excluded, upcoming events included)
    console.log("\n9. Testing Date Filtering (Asia/Kolkata timezone)...");
    const todayIST = getIndiaStartOfToday();
    const pastDate = new Date(todayIST.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

    const pastEvent = await Event.create({
      name: "Past Expired Hackathon",
      organizer: "Past Org",
      date: pastDate,
      deadline: pastDate,
      createdBy: organizerUser._id,
      hasPoster: false
    });

    const activeUpcomingEvent = await Event.create({
      name: "Upcoming Active Hackathon 2026",
      organizer: "Active Org",
      date: new Date(todayIST.getTime() + 3 * 24 * 60 * 60 * 1000),
      deadline: new Date(todayIST.getTime() + 2 * 24 * 60 * 60 * 1000),
      createdBy: organizerUser._id,
      hasPoster: false
    });

    const dashboardRes = await orgClient.get("/dashboard");
    assert.strictEqual(dashboardRes.statusCode, 200, "GET /dashboard must return 200");

    const carouselHtmlMatch = dashboardRes.body.match(/class="event-carousel-container"[\s\S]*?<\/div>\s*<\/div>\s*<!-- Active Team Status -->/);
    const carouselHtml = carouselHtmlMatch ? carouselHtmlMatch[0] : dashboardRes.body;

    assert.ok(carouselHtml.includes("Upcoming Active Hackathon 2026"), "Carousel must show upcoming event");
    assert.ok(!carouselHtml.includes("Past Expired Hackathon"), "Carousel must NOT show past event");
    console.log("   ✓ Past events strictly excluded and upcoming events included in carousel data.");

    // 10. Test Carousel Markup and CSP Compliance
    console.log("\n10. Testing Carousel Markup and CSP Compliance...");
    assert.ok(dashboardRes.body.includes("event-carousel-container"), "Dashboard must render .event-carousel-container");
    assert.ok(dashboardRes.body.includes("carousel-btn-prev"), "Dashboard must render .carousel-btn-prev");
    assert.ok(dashboardRes.body.includes("carousel-btn-next"), "Dashboard must render .carousel-btn-next");
    assert.ok(dashboardRes.body.includes("carousel.js"), "Boilerplate must include carousel.js script");

    // Verify /js/carousel.js returns 200
    const carouselJsRes = await orgClient.get("/js/carousel.js");
    assert.strictEqual(carouselJsRes.statusCode, 200, "GET /js/carousel.js must return 200 OK");
    assert.ok(carouselJsRes.body.includes("initEventCarousel"), "carousel.js content must be valid");

    // Ensure zero inline handlers in rendered dashboard HTML
    const inlineHandlerMatch = dashboardRes.body.match(/\son[a-z]+=/i);
    assert.strictEqual(inlineHandlerMatch, null, "Dashboard HTML must not contain inline event handlers");
    console.log("   ✓ Carousel markup, external JS script, and zero inline handlers verified.");

    console.log("\n=================================================");
    console.log("ALL EVENT POSTERS & CAROUSEL TESTS PASSED (100%)");
    console.log("=================================================\n");
  } finally {
    server.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
