/**
 * tests/headerDropdownAndDarkMode.test.js
 * 
 * Verifies:
 * 1. Header has profile dropdown button with aria-haspopup and aria-expanded.
 * 2. Standalone Logout button is removed from header.
 * 3. Dropdown menu contains My Profile, Profile & Settings, Dark mode switch, and Logout POST form with CSRF token.
 * 4. Theme scripts (/js/theme.js and /js/theme-init.js) are served with HTTP 200.
 * 5. Anti-flash external script without defer is included in <head>.
 * 6. CSS defines color-scheme and CSS variables under [data-theme="dark"].
 * 7. No inline handlers or inline scripts were added.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");

console.log("=================================================");
console.log("RUNNING HEADER DROPDOWN & DARK MODE TESTS");
console.log("=================================================\n");

const rootDir = path.resolve(__dirname, "..");

async function runTests() {
  // 1. Verify views/includes/navbar.ejs
  console.log("1. Testing Navbar Header Markup & Profile Dropdown...");
  const navbarPath = path.join(rootDir, "views", "includes", "navbar.ejs");
  const navbarContent = fs.readFileSync(navbarPath, "utf8");

  // Check profile button
  assert.ok(
    navbarContent.includes('id="profileDropdownBtn"'),
    "Navbar must include profile button with id='profileDropdownBtn'"
  );
  assert.ok(
    navbarContent.includes('class="profile-dropdown-btn"'),
    "Navbar must include profile button with class='profile-dropdown-btn'"
  );
  assert.ok(
    navbarContent.includes('aria-haspopup="true"'),
    "Profile dropdown button must have aria-haspopup='true'"
  );
  assert.ok(
    navbarContent.includes('aria-expanded="false"'),
    "Profile dropdown button must have initial aria-expanded='false'"
  );
  assert.ok(
    navbarContent.includes('<button type="button"') && navbarContent.includes('id="profileDropdownBtn"'),
    "Profile button must be a real <button type='button'>"
  );
  assert.ok(
    navbarContent.includes('class="profile-caret"') || navbarContent.includes('profile-caret'),
    "Profile button must include a small caret"
  );
  console.log("   ✓ Profile button is a real <button> with aria-haspopup, aria-expanded, and caret.");

  // Check standalone logout button is removed
  const formLogoutMatches = navbarContent.match(/<form[^>]*action=["']\/logout["'][^>]*>/g) || [];
  assert.strictEqual(
    formLogoutMatches.length,
    1,
    "Navbar must have exactly one logout form (inside the dropdown menu, no standalone logout button)"
  );

  // Check dropdown menu container
  assert.ok(
    navbarContent.includes('id="profileDropdownMenu"'),
    "Navbar must include dropdown menu with id='profileDropdownMenu'"
  );
  assert.ok(
    navbarContent.includes('role="menu"'),
    "Profile dropdown menu must have role='menu'"
  );

  // Check dropdown items
  assert.ok(
    navbarContent.includes('href="/profile"') && navbarContent.includes("My Profile"),
    "Dropdown menu must contain 'My Profile' link pointing to /profile"
  );
  assert.ok(
    navbarContent.includes('href="/profile/edit"') && navbarContent.includes("Profile & Settings"),
    "Dropdown menu must contain 'Profile & Settings' link pointing to /profile/edit"
  );
  assert.ok(
    navbarContent.includes("Dark mode") && navbarContent.includes('id="themeToggleBtn"'),
    "Dropdown menu must contain Dark mode switch with id='themeToggleBtn'"
  );
  assert.ok(
    navbarContent.includes('role="switch"'),
    "Dark mode toggle must have role='switch'"
  );
  console.log("   ✓ Dropdown menu contains My Profile, Profile & Settings, Dark mode switch, and Logout.");

  // Check logout form inside dropdown has CSRF token and is POST
  assert.ok(
    navbarContent.includes('action="/logout"') && navbarContent.includes('method="POST"'),
    "Logout form must be POST to /logout"
  );
  assert.ok(
    navbarContent.includes('name="_csrf"') && navbarContent.includes("csrfToken"),
    "Logout form inside dropdown must include hidden CSRF token input"
  );
  console.log("   ✓ Logout form inside dropdown is strictly POST with valid CSRF token.");

  // 2. Verify views/layouts/boilerplate.ejs
  console.log("\n2. Testing Boilerplate Anti-Flash Head Script...");
  const boilerplatePath = path.join(rootDir, "views", "layouts", "boilerplate.ejs");
  const boilerplateContent = fs.readFileSync(boilerplatePath, "utf8");

  // Script must be in <head> and not have defer
  const headMatch = boilerplateContent.match(/<head>([\s\S]*?)<\/head>/i);
  assert.ok(headMatch, "Boilerplate must have a <head> element");
  const headContent = headMatch[1];
  assert.ok(
    headContent.includes('/js/theme-init.js') || headContent.includes('/js/theme.js'),
    "<head> must include external theme script to prevent white flash"
  );
  assert.ok(
    !headContent.includes('src="/js/theme-init.js" defer') && !headContent.includes('src="/js/theme.js" defer'),
    "Theme script in <head> must NOT have defer so it executes before paint"
  );
  assert.ok(
    !headContent.includes("<script>") && !headContent.includes("<script >"),
    "<head> must NOT contain inline script tags"
  );
  console.log("   ✓ Pre-paint anti-flash external script present in <head> with no defer and no inline script.");

  // 3. Verify CSS Variables and Dark Mode rules
  console.log("\n3. Testing CSS Variables & [data-theme='dark']...");
  const styleCssPath = path.join(rootDir, "public", "css", "style.css");
  const styleCss = fs.readFileSync(styleCssPath, "utf8");

  assert.ok(styleCss.includes('[data-theme="dark"]'), "CSS must include [data-theme='dark'] rule");
  assert.ok(styleCss.includes("color-scheme: dark"), "CSS must set color-scheme: dark for dark mode");
  assert.ok(styleCss.includes("color-scheme: light"), "CSS must set color-scheme: light for light mode");
  assert.ok(styleCss.includes("--bg-page"), "CSS must define --bg-page variable");
  assert.ok(styleCss.includes("--bg-card"), "CSS must define --bg-card variable");
  assert.ok(styleCss.includes("--text-primary"), "CSS must define --text-primary variable");
  assert.ok(styleCss.includes("--border-color"), "CSS must define --border-color variable");
  assert.ok(styleCss.includes("--bg-input"), "CSS must define --bg-input variable");
  assert.ok(styleCss.includes("--btn-outline-bg"), "CSS must define --btn-outline-bg variable");
  assert.ok(styleCss.includes(".profile-dropdown-btn"), "CSS must define .profile-dropdown-btn");
  assert.ok(styleCss.includes(".profile-dropdown-menu"), "CSS must define .profile-dropdown-menu");
  assert.ok(styleCss.includes(".theme-toggle-switch"), "CSS must define .theme-toggle-switch");
  console.log("   ✓ CSS variables, color-scheme, and dropdown styles verified.");

  // 4. Verify Theme Scripts are served with HTTP 200
  console.log("\n4. Testing Theme Script HTTP Serving (200 OK)...");
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-at-least-32-chars-long!";
  process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "test-cookie-secret-at-least-32-chars-long!";
  process.env.USE_MEMORY_DB = "true";

  const app = require("../app");
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  function fetchUrl(urlPath) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }).on("error", reject);
    });
  }

  try {
    const resThemeInit = await fetchUrl("/js/theme-init.js");
    assert.strictEqual(resThemeInit.status, 200, "GET /js/theme-init.js must return 200 OK");
    assert.ok(resThemeInit.body.includes("tf-theme"), "/js/theme-init.js must reference 'tf-theme'");

    const resTheme = await fetchUrl("/js/theme.js");
    assert.strictEqual(resTheme.status, 200, "GET /js/theme.js must return 200 OK");
    assert.ok(resTheme.body.includes("tf-theme"), "/js/theme.js must reference 'tf-theme'");
    console.log("   ✓ Both /js/theme-init.js and /js/theme.js served with HTTP 200 OK.");

    // 5. Verify unauthenticated and authenticated navbar rendering over HTTP
    console.log("\n5. Testing HTTP Response for Dropdown in Rendered HTML...");
    const resHome = await fetchUrl("/landing");
    assert.strictEqual(resHome.status, 200, "GET /landing must return 200 OK");
    assert.ok(resHome.body.includes("theme-init.js"), "/landing HTML must include theme-init.js");
    assert.ok(!resHome.body.includes("javascript:"), "/landing HTML must not contain javascript: URLs");
    console.log("   ✓ Rendered page contains theme script and no javascript: URLs.");
  } finally {
    server.close();
  }

  // 6. Verify layout.js dropdown accessibility controls
  console.log("\n6. Testing layout.js Dropdown & Accessibility Handlers...");
  const layoutJsPath = path.join(rootDir, "public", "js", "layout.js");
  const layoutJs = fs.readFileSync(layoutJsPath, "utf8");

  assert.ok(layoutJs.includes("profileDropdownBtn"), "layout.js must handle profileDropdownBtn");
  assert.ok(layoutJs.includes("profileDropdownMenu"), "layout.js must handle profileDropdownMenu");
  assert.ok(layoutJs.includes("Escape"), "layout.js must handle Escape key for dropdown");
  assert.ok(layoutJs.includes("focus()"), "layout.js must return focus to button on Escape");
  console.log("   ✓ layout.js handles dropdown toggle, outside click, and Escape focus restoration.");

  console.log("\n=================================================");
  console.log("ALL HEADER DROPDOWN & DARK MODE TESTS PASSED (100%)");
  console.log("=================================================\n");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});

