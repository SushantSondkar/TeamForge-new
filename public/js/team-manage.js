/**
 * Team Management Tabs & Controls (CSP-safe, external script)
 * Supports keyboard navigation (Arrow keys, Home, End, Enter, Space),
 * URL hash synchronization (#all-activity, #received-applications, #sent-invitations),
 * and event-listener-based button actions.
 */
document.addEventListener('DOMContentLoaded', () => {
    const tabList = document.querySelector('.team-manage-tabs');
    const tabs = Array.from(document.querySelectorAll('.team-manage-tab'));
    const panes = Array.from(document.querySelectorAll('.team-manage-tab-pane'));

    if (!tabList || tabs.length === 0) return;

    /**
     * Switch active tab and corresponding panel.
     * @param {HTMLElement} tabToActivate
     * @param {boolean} updateHash
     */
    function switchTab(tabToActivate, updateHash = true) {
        if (!tabToActivate) return;

        tabs.forEach(tab => {
            const isActive = tab === tabToActivate;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tab.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        const targetPaneId = tabToActivate.getAttribute('aria-controls') || tabToActivate.dataset.target;
        panes.forEach(pane => {
            const isTarget = pane.id === targetPaneId;
            pane.classList.toggle('active', isTarget);
            pane.hidden = !isTarget;
        });

        if (updateHash) {
            const hash = tabToActivate.dataset.hash || tabToActivate.dataset.tab;
            if (hash && window.location.hash !== '#' + hash) {
                if (history.replaceState) {
                    history.replaceState(null, '', '#' + hash);
                } else {
                    window.location.hash = hash;
                }
            }
        }
    }

    // Attach click listeners to tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab, true);
        });
    });

    // Keyboard navigation per WAI-ARIA Tab guidelines
    tabList.addEventListener('keydown', (e) => {
        const currentTab = document.activeElement;
        const currentIndex = tabs.indexOf(currentTab);
        if (currentIndex === -1) return;

        let nextIndex = null;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = (currentIndex + 1) % tabs.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                break;
            case 'Home':
                e.preventDefault();
                nextIndex = 0;
                break;
            case 'End':
                e.preventDefault();
                nextIndex = tabs.length - 1;
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                switchTab(currentTab, true);
                return;
            default:
                return;
        }

        if (nextIndex !== null) {
            const nextTab = tabs[nextIndex];
            nextTab.focus();
            switchTab(nextTab, true);
        }
    });

    /**
     * Synchronize tab selection with the URL hash.
     */
    function syncWithHash() {
        const rawHash = (window.location.hash || '').replace('#', '').trim();
        if (rawHash) {
            const matchingTab = tabs.find(tab => 
                (tab.dataset.hash === rawHash) || 
                (tab.dataset.tab === rawHash) ||
                (tab.id === 'tab-' + rawHash)
            );
            if (matchingTab) {
                switchTab(matchingTab, false);
                return;
            }
        }
        // Default to first tab (All Activity)
        if (tabs[0]) {
            switchTab(tabs[0], false);
        }
    }

    // Sync on initial load and on hash change
    syncWithHash();
    window.addEventListener('hashchange', syncWithHash);

    // Form confirmation listener for forms with data-confirm (CSP-compliant)
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (!form || typeof form.getAttribute !== 'function') return;
        const confirmMsg = form.getAttribute('data-confirm');
        if (confirmMsg) {
            if (!window.confirm(confirmMsg)) {
                e.preventDefault();
            }
        }
    });
});
