/**
 * Discover Page Interactivity (CSP-safe, external script)
 * Handles tab switching with keyboard navigation, URL hash persistence,
 * and search form debounce & auto-submit.
 */
document.addEventListener('DOMContentLoaded', () => {
    const tabList = document.querySelector('.discover-tabs');
    const tabs = Array.from(document.querySelectorAll('.discover-tab'));
    const panes = Array.from(document.querySelectorAll('.tab-pane'));

    function switchTab(tabToActivate, updateHash = true) {
        if (!tabToActivate) return;

        tabs.forEach(t => {
            const isActive = t === tabToActivate;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            t.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        const targetId = tabToActivate.dataset.target;
        panes.forEach(p => {
            const isTarget = p.id === targetId;
            p.classList.toggle('active', isTarget);
        });

        if (updateHash) {
            const hash = tabToActivate.dataset.hash || tabToActivate.dataset.target;
            if (hash && window.location.hash !== '#' + hash) {
                if (history.replaceState) {
                    history.replaceState(null, '', '#' + hash);
                } else {
                    window.location.hash = hash;
                }
            }
        }
    }

    // Tab click listeners
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab, true);
        });
    });

    // Switch-to-tab buttons (e.g. empty-state "Search all teams")
    document.querySelectorAll('[data-switch-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.dataset.switchTab;
            const targetTab = tabs.find(t => t.dataset.target === targetId);
            if (targetTab) {
                targetTab.focus();
                switchTab(targetTab, true);
            }
        });
    });

    // Keyboard navigation
    if (tabList) {
        tabList.addEventListener('keydown', (e) => {
            const currentTab = document.activeElement;
            const currentIndex = tabs.indexOf(currentTab);
            if (currentIndex === -1) return;

            let nextTab = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                nextTab = tabs[(currentIndex + 1) % tabs.length];
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
            } else if (e.key === 'Home') {
                e.preventDefault();
                nextTab = tabs[0];
            } else if (e.key === 'End') {
                e.preventDefault();
                nextTab = tabs[tabs.length - 1];
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchTab(currentTab, true);
                return;
            }

            if (nextTab) {
                nextTab.focus();
                switchTab(nextTab, true);
            }
        });
    }

    // Sync with URL Hash if present
    function syncHash() {
        const rawHash = (window.location.hash || '').replace('#', '').trim();
        if (rawHash) {
            const matchingTab = tabs.find(t => 
                t.dataset.target === rawHash || 
                t.dataset.hash === rawHash ||
                (rawHash === 'search' && t.dataset.target === 'search-teams')
            );
            if (matchingTab) {
                switchTab(matchingTab, false);
            }
        }
    }

    syncHash();
    window.addEventListener('hashchange', syncHash);

    // Progressive Enhancement for Search Form: Auto-submit dropdowns & debounced text search
    const searchForm = document.getElementById('discoverSearchForm');
    const searchInput = document.getElementById('searchQ');
    const filterDropdowns = document.querySelectorAll('.filter-select-dropdown');

    if (searchForm) {
        filterDropdowns.forEach(dropdown => {
            dropdown.addEventListener('change', () => {
                searchForm.submit();
            });
        });

        if (searchInput) {
            let debounceTimeout = null;
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    searchForm.submit();
                }, 400);
            });
        }
    }
});
