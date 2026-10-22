/**
 * tests/cssClasses.test.js
 * 
 * Verifies that all CSS classes introduced or refactored in Phase 11F-b
 * have valid, defined rules in either public/css/style.css or the <style>
 * block of the view where they are used.
 * No external dependencies (uses Node.js built-in fs, path, assert).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=================================================');
console.log('RUNNING CSS CLASSES & STYLE REFACTOR TESTS');
console.log('=================================================\n');

const ROOT_DIR = path.resolve(__dirname, '..');
const styleCssContent = fs.readFileSync(path.join(ROOT_DIR, 'public', 'css', 'style.css'), 'utf8');

function getViewContent(viewRelPath) {
    return fs.readFileSync(path.join(ROOT_DIR, 'views', viewRelPath), 'utf8');
}

/**
 * Checks if a selector is matched in the CSS content (either in style.css or a view's <style> block).
 */
function hasCssRule(content, selector) {
    // Escape special regex chars like . # $ ^ etc.
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match selector followed eventually by {
    const regex = new RegExp(escaped + '[^{]*\\{', 'm');
    return regex.test(content);
}

// 0a Class verification table mapping: class/selector -> file where rule should be present
const classManifest = [
    // Discover page tabs and pane states
    { selector: '.discover-tab', viewFile: 'discover.ejs', checkGlobal: true },
    { selector: '.discover-tab.active', viewFile: 'discover.ejs', checkGlobal: true },
    { selector: '.tab-pane', viewFile: 'discover.ejs', checkGlobal: true },
    { selector: '.tab-pane.active', viewFile: 'discover.ejs', checkGlobal: true },
    { selector: '#smart-recs.tab-pane.active', viewFile: 'discover.ejs' },

    // Team Requirement Show page roles
    { selector: '.team-role-item', viewFile: 'team-requirement/show.ejs' },
    { selector: '.team-role-item.selected', viewFile: 'team-requirement/show.ejs' },
    { selector: '.role-openings-badge', viewFile: 'team-requirement/show.ejs' },
    { selector: '.role-openings-badge.has-openings', viewFile: 'team-requirement/show.ejs' },
    { selector: '.role-openings-badge.no-openings', viewFile: 'team-requirement/show.ejs' },

    // Team Requirement Open Roles wizard
    { selector: '.role-number.secondary-role', viewFile: 'team-requirement/open-roles.ejs' },
    { selector: '.btn-remove-role', viewFile: 'team-requirement/open-roles.ejs' },
    { selector: '.btn-remove-role.is-hidden', viewFile: 'team-requirement/open-roles.ejs' },

    // Profile page availability & progress fill
    { selector: '.badge-avail', viewFile: 'profile.ejs' },
    { selector: '.badge-avail-free', viewFile: 'profile.ejs' },
    { selector: '.badge-avail-partly', viewFile: 'profile.ejs' },
    { selector: '.badge-avail-busy', viewFile: 'profile.ejs' },
    { selector: '.comp-progress-fill', viewFile: 'profile.ejs' },

    // Profile Edit page photo button
    { selector: '#removePhotoBtn', viewFile: 'profile-edit.ejs' },
    { selector: '#removePhotoBtn.is-hidden', viewFile: 'profile-edit.ejs' },
    { selector: '.is-hidden', viewFile: 'profile-edit.ejs', checkGlobal: true },

    // Notifications page cards & icons
    { selector: '.notif-card.notif-read', viewFile: 'notifications.ejs' },
    { selector: '.notif-card.notif-unread', viewFile: 'notifications.ejs' },
    { selector: '.notif-icon-circle', viewFile: 'notifications.ejs' },
    { selector: '.notif-icon-circle.notif-success', viewFile: 'notifications.ejs' },
    { selector: '.notif-icon-circle.notif-danger', viewFile: 'notifications.ejs' },
    { selector: '.notif-icon-circle.notif-warning', viewFile: 'notifications.ejs' },
    { selector: '.notif-icon-circle.notif-info', viewFile: 'notifications.ejs' },
    { selector: '#markAllReadBtn', viewFile: 'notifications.ejs' },
    { selector: '#markAllReadBtn.is-disabled', viewFile: 'notifications.ejs' },
    { selector: '.is-disabled', viewFile: 'notifications.ejs', checkGlobal: true },

    // Leaderboard cache indicator
    { selector: '.cache-status-cached', viewFile: 'leaderboard.ejs' },
    { selector: '.cache-status-fresh', viewFile: 'leaderboard.ejs' }
];

let passCount = 0;

classManifest.forEach(item => {
    let matchedIn = null;

    // Check view <style> block
    if (item.viewFile) {
        const viewContent = getViewContent(item.viewFile);
        if (hasCssRule(viewContent, item.selector)) {
            matchedIn = `views/${item.viewFile} <style>`;
        }
    }

    // Check public/css/style.css
    if (!matchedIn && hasCssRule(styleCssContent, item.selector)) {
        matchedIn = 'public/css/style.css';
    } else if (item.checkGlobal && hasCssRule(styleCssContent, item.selector)) {
        matchedIn += ' & public/css/style.css';
    }

    assert(matchedIn !== null, `CSS selector "${item.selector}" has no matching rule in views/${item.viewFile} or style.css`);
    console.log(`✓ Rule verified for selector "${item.selector}" in ${matchedIn}`);
    passCount++;
});

const totalChecks = classManifest.length;
assert.strictEqual(passCount, totalChecks, `Expected ${totalChecks} checks to pass, but passed ${passCount}`);

console.log(`\n=================================================`);
console.log(`ALL ${passCount} OF ${totalChecks} CSS CLASS RULES VERIFIED SUCCESSFULLY (100%)`);
console.log('=================================================\n');
process.exit(0);
