const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=================================================");
console.log("RUNNING PHASE 10D: BRANDING & ASSETS TESTS");
console.log("=================================================\n");

function runTests() {
  const rootDir = path.join(__dirname, "..");
  const imagesDir = path.join(rootDir, "public", "images");

  // 1. Verify existence and non-zero size of all brand assets
  console.log("1. Testing Brand Asset Existence in public/images/...");
  const expectedFiles = [
    "logo-horizontal.svg",
    "logo-horizontal.png",
    "logo-icon.svg",
    "logo-icon.png",
    "favicon.ico",
    "favicon-32.png",
    "apple-touch-icon.png",
    "og-image.png"
  ];

  for (const file of expectedFiles) {
    const filePath = path.join(imagesDir, file);
    assert.ok(fs.existsSync(filePath), `Expected asset ${file} must exist`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 0, `Asset ${file} must have non-zero file size`);
  }
  console.log("   ✓ All 8 brand image files are present with valid file sizes.");

  // 2. Verify public/site.webmanifest
  console.log("2. Testing Web Manifest (site.webmanifest)...");
  const manifestPath = path.join(rootDir, "public", "site.webmanifest");
  assert.ok(fs.existsSync(manifestPath), "public/site.webmanifest must exist");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.strictEqual(manifest.name, "TeamForge — Campus Hackathon & Project Teaming");
  assert.strictEqual(manifest.short_name, "TeamForge");
  assert.strictEqual(manifest.theme_color, "#1E3A8A");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, "Manifest must specify multiple icon sizes");
  console.log("   ✓ Web manifest is valid JSON and defines TeamForge colors and icons.");

  // 3. Verify views/layouts/boilerplate.ejs
  console.log("3. Testing Boilerplate Layout Metadata & Social Tags...");
  const boilerplate = fs.readFileSync(path.join(rootDir, "views", "layouts", "boilerplate.ejs"), "utf8");
  assert.ok(boilerplate.includes('<meta name="theme-color" content="#1E3A8A">'), "Boilerplate must include theme-color #1E3A8A");
  assert.ok(boilerplate.includes('rel="icon" type="image/x-icon" href="/images/favicon.ico"'), "Favicon ico link required");
  assert.ok(boilerplate.includes('rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png"'), "Favicon 32 link required");
  assert.ok(boilerplate.includes('rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png"'), "Apple touch icon link required");
  assert.ok(boilerplate.includes('rel="manifest" href="/site.webmanifest"'), "Manifest link required");
  assert.ok(boilerplate.includes('property="og:title"'), "Open Graph title tag required");
  assert.ok(boilerplate.includes('property="og:image"'), "Open Graph image tag required");
  assert.ok(boilerplate.includes('property="og:url"'), "Open Graph URL tag required");
  assert.ok(boilerplate.includes('name="twitter:card"'), "Twitter card tag required");
  assert.ok(boilerplate.includes('name="twitter:image"'), "Twitter image tag required");
  console.log("   ✓ Boilerplate includes all favicon links, manifest, theme-color, and OG/Twitter tags.");

  // 4. Verify views/includes/navbar.ejs
  console.log("4. Testing Navbar Brand Logo Markup & Responsive Classes...");
  const navbar = fs.readFileSync(path.join(rootDir, "views", "includes", "navbar.ejs"), "utf8");
  assert.ok(navbar.includes('href="/"'), "Navbar brand must link to /");
  assert.ok(navbar.includes('src="/images/logo-horizontal.svg"'), "Navbar must include horizontal logo");
  assert.ok(navbar.includes('src="/images/logo-icon.svg"'), "Navbar must include square logo icon");
  assert.ok(navbar.includes('alt="TeamForge"'), "Navbar logo must have alt text");
  assert.ok(navbar.includes('navbar-brand-full'), "Navbar logo must have desktop class");
  assert.ok(navbar.includes('navbar-brand-icon'), "Navbar logo must have mobile icon class");
  console.log("   ✓ Navbar correctly renders brand logos with responsive classes and alt text.");

  // 5. Verify Auth views and Landing page have logo centered above form
  console.log("5. Testing Auth Views & Landing Page Logo Integration...");
  const authViews = ["login.ejs", "signup.ejs", "forgot-password.ejs", "reset-password.ejs"];
  for (const view of authViews) {
    const content = fs.readFileSync(path.join(rootDir, "views", view), "utf8");
    assert.ok(content.includes('src="/images/logo-icon.svg"'), `${view} must include logo-icon.svg`);
    assert.ok(content.includes('alt="TeamForge Logo"'), `${view} must have logo alt text`);
  }
  const landing = fs.readFileSync(path.join(rootDir, "views", "landing.ejs"), "utf8");
  assert.ok(landing.includes('src="/images/logo-horizontal.svg"'), "landing.ejs must include logo-horizontal.svg");
  console.log("   ✓ Auth and landing views properly display centered brand logos.");

  // 6. Verify Email Template Hosted Logo
  console.log("6. Testing Email Template Hosted Logo URL...");
  const { renderEmailLayout, getBaseUrl } = require("../utils/emailTemplates");
  const rendered = renderEmailLayout({
    title: "Test Email",
    heading: "Hello Developer",
    bodyHtml: "<p>Testing email body</p>",
    buttonText: "Click Here",
    actionUrl: "http://localhost:8080/test"
  });
  const expectedHostedLogo = `${getBaseUrl()}/images/logo-horizontal.png`;
  assert.ok(rendered.includes(expectedHostedLogo), "Email layout must embed hosted logo URL using getBaseUrl()");
  assert.ok(rendered.includes('alt="TeamForge"'), "Email logo must have alt text");
  console.log("   ✓ Email layout correctly embeds hosted logo URL.");

  // 7. Verify Cache-Control configuration in app.js
  console.log("7. Testing Static Cache-Control in app.js...");
  const appJs = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
  assert.ok(appJs.includes('app.use("/images"'), "app.js must serve /images route");
  assert.ok(appJs.includes("maxAge: \"30d\""), "app.js must set long maxAge for /images");
  assert.ok(appJs.includes("immutable: true"), "app.js must set immutable for /images");
  assert.ok(appJs.includes("res.locals.appBaseUrl"), "app.js must expose res.locals.appBaseUrl");
  console.log("   ✓ Express static options configure long immutable Cache-Control for /images.");

  console.log("\n=================================================");
  console.log("ALL PHASE 10D BRANDING TESTS PASSED (100%)");
  console.log("=================================================");
}

runTests();
