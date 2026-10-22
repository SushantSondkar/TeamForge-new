/**
 * tests/cssClasses.test.js
 * 
 * Verifies that all CSS classes introduced or refactored in Phase 11F-b
 * have valid, defined rules in either public/css/style.css or the <style>
 * block of the view where they are used.
 * Dynamically parses CSS rules and reports exact line numbers.
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
 * Finds the 1-indexed line number where a CSS rule for the given selector is defined.
 * If isEjs is true, only searches inside <style>...</style> blocks.
 */
function findCssRuleLine(content, selector, isEjs = false) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Matches selector followed by other selectors/whitespace up to '{'
    const ruleRegex = new RegExp('(?:^|[,\\s\\n])(' + escaped + ')(?:[^{]*)\\{', 'gm');

    if (isEjs) {
        const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        let styleTagMatch;
        while ((styleTagMatch = styleTagRegex.exec(content)) !== null) {
            const blockStartOffset = styleTagMatch.index + styleTagMatch[0].indexOf(styleTagMatch[1]);
            const blockContent = styleTagMatch[1];
            let match;
            while ((match = ruleRegex.exec(blockContent)) !== null) {
                const matchOffset = blockStartOffset + match.index;
                const line = content.slice(0, matchOffset).split('\n').length;
                return line;
            }
        }
        return null;
    } else {
        let match;
        while ((match = ruleRegex.exec(content)) !== null) {
            const line = content.slice(0, match.index).split('\n').length;
            return line;
        }
        return null;
    }
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
    { selector: '.is-hidden', globalOnly: true },

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
    { selector: '.is-disabled', globalOnly: true },

    // Leaderboard cache indicator
    { selector: '.cache-status-cached', viewFile: 'leaderboard.ejs' },
    { selector: '.cache-status-fresh', viewFile: 'leaderboard.ejs' }
];

let passCount = 0;

classManifest.forEach(item => {
    const locations = [];

    // Check view <style> block if specified and not global-only
    if (item.viewFile && !item.globalOnly) {
        const viewContent = getViewContent(item.viewFile);
        const line = findCssRuleLine(viewContent, item.selector, true);
        if (line !== null) {
            locations.push(`views/${item.viewFile}:${line}`);
        }
    }

    // Check public/css/style.css if requested, if not found in view, or if global-only
    if (item.globalOnly || item.checkGlobal || locations.length === 0) {
        const line = findCssRuleLine(styleCssContent, item.selector, false);
        if (line !== null) {
            locations.push(`public/css/style.css:${line}`);
        }
    }

    assert(locations.length > 0, `CSS selector "${item.selector}" has no matching rule in ${item.viewFile ? 'views/' + item.viewFile : ''} or public/css/style.css`);
    console.log(`✓ Rule verified for selector "${item.selector}" at ${locations.join(' & ')}`);
    passCount++;
});

const totalChecks = classManifest.length;
assert.strictEqual(passCount, totalChecks, `Expected ${totalChecks} checks to pass, but passed ${passCount}`);

console.log(`\n=================================================`);
console.log(`ALL ${passCount} OF ${totalChecks} CSS CLASS RULES VERIFIED WITH REAL LINE NUMBERS (100%)`);
console.log('=================================================\n');
process.exit(0);
