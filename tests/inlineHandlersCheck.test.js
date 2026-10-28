const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=================================================");
console.log("RUNNING INLINE HANDLER & CSP AUDIT TEST");
console.log("=================================================\n");

function getAllViewFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllViewFiles(fullPath));
    } else if (file.endsWith(".ejs")) {
      results.push(fullPath);
    }
  }
  return results;
}

function runAudit() {
  const rootDir = path.join(__dirname, "..");
  const viewsDir = path.join(rootDir, "views");
  const viewFiles = getAllViewFiles(viewsDir);

  console.log(`Auditing ${viewFiles.length} EJS view files for inline handlers...\n`);

  const handlerRegex = /\bon[a-zA-Z]+\s*=/g;
  const jsHrefRegex = /href\s*=\s*['"]\s*javascript:/gi;
  const inlineScriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>/gi;

  const violations = [];

  for (const file of viewFiles) {
    const content = fs.readFileSync(file, "utf8");
    const relPath = path.relative(rootDir, file).replace(/\\/g, "/");

    // 1. Check for inline on* attributes (onclick, onchange, onsubmit, etc.)
    let match;
    handlerRegex.lastIndex = 0;
    while ((match = handlerRegex.exec(content)) !== null) {
      // Find line number
      const lineNum = content.slice(0, match.index).split("\n").length;
      violations.push({
        file: relPath,
        line: lineNum,
        type: "Inline event handler attribute",
        match: match[0]
      });
    }

    // 2. Check for javascript: URLs in href attributes
    jsHrefRegex.lastIndex = 0;
    while ((match = jsHrefRegex.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split("\n").length;
      violations.push({
        file: relPath,
        line: lineNum,
        type: "javascript: pseudo-protocol URL",
        match: match[0]
      });
    }

    // 3. Check for inline <script> tags without src
    inlineScriptRegex.lastIndex = 0;
    while ((match = inlineScriptRegex.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split("\n").length;
      violations.push({
        file: relPath,
        line: lineNum,
        type: "Inline <script> tag without src",
        match: match[0]
      });
    }
  }

  // Also verify app.js Content Security Policy does NOT contain 'unsafe-inline'
  const appJsPath = path.join(rootDir, "app.js");
  const appJsContent = fs.readFileSync(appJsPath, "utf8");
  const scriptSrcMatch = appJsContent.match(/scriptSrc:\s*\[([^\]]+)\]/);
  
  if (scriptSrcMatch && scriptSrcMatch[1].includes("'unsafe-inline'")) {
    violations.push({
      file: "app.js",
      line: 0,
      type: "CSP Violation",
      match: "scriptSrc includes 'unsafe-inline'"
    });
  }

  if (violations.length > 0) {
    console.error("FAIL: Found inline handlers or scripts that violate Content Security Policy:");
    for (const v of violations) {
      console.error(`  - [${v.file}:${v.line}] ${v.type}: "${v.match}"`);
    }
    assert.strictEqual(
      violations.length,
      0,
      `Expected 0 inline handlers/scripts across all views, but found ${violations.length}`
    );
  }

  console.log(`✓ Audited ${viewFiles.length} EJS view templates: 0 inline handlers, 0 javascript: links, 0 inline <script> tags found.`);
  console.log("✓ Verified Content Security Policy in app.js does not allow 'unsafe-inline' in scriptSrc.");
  console.log("\n=================================================");
  console.log("ALL INLINE HANDLER & CSP AUDIT TESTS PASSED (100%)");
  console.log("=================================================");
}

runAudit();
