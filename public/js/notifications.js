/**
 * Notifications filter tabs (CSP-safe, external script)
 * Supports click, keyboard navigation (Arrow keys, Home, End, Enter, Space)
 * and URL hash synchronization (#all, #unread).
 */
document.addEventListener('DOMContentLoaded', () => {
    const tabAll = document.getElementById('tab-all');
    const tabUnread = document.getElementById('tab-unread');
    const cards = document.querySelectorAll('.notif-card');
    const tabList = document.querySelector('.notif-tabs');

    if (!tabAll || !tabUnread) return;

    const tabs = [tabAll, tabUnread];

    function applyFilter(type, updateHash = true) {
        if (type === 'unread') {
            tabUnread.style.backgroundColor = '#2563eb';
            tabUnread.style.color = 'white';
            tabUnread.style.border = 'none';
            tabUnread.setAttribute('aria-selected', 'true');
            tabUnread.setAttribute('tabindex', '0');

            tabAll.style.backgroundColor = 'white';
            tabAll.style.color = '#64748b';
            tabAll.style.border = '1px solid #e2e8f0';
            tabAll.setAttribute('aria-selected', 'false');
            tabAll.setAttribute('tabindex', '-1');

            cards.forEach(c => {
                if (c.getAttribute('data-read') === 'false') {
                    c.style.display = 'flex';
                } else {
                    c.style.display = 'none';
                }
            });

            if (updateHash && window.location.hash !== '#unread') {
                if (history.replaceState) {
                    history.replaceState(null, '', '#unread');
                } else {
                    window.location.hash = 'unread';
                }
            }
        } else {
            tabAll.style.backgroundColor = '#2563eb';
            tabAll.style.color = 'white';
            tabAll.style.border = 'none';
            tabAll.setAttribute('aria-selected', 'true');
            tabAll.setAttribute('tabindex', '0');

            tabUnread.style.backgroundColor = 'white';
            tabUnread.style.color = '#64748b';
            tabUnread.style.border = '1px solid #e2e8f0';
            tabUnread.setAttribute('aria-selected', 'false');
            tabUnread.setAttribute('tabindex', '-1');

            cards.forEach(c => c.style.display = 'flex');

            if (updateHash && window.location.hash !== '#all') {
                if (history.replaceState) {
                    history.replaceState(null, '', '#all');
                } else {
                    window.location.hash = 'all';
                }
            }
        }
    }

    // Attach click listeners with addEventListener
    tabAll.addEventListener('click', () => applyFilter('all', true));
    tabUnread.addEventListener('click', () => applyFilter('unread', true));

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
                applyFilter(currentTab === tabUnread ? 'unread' : 'all', true);
                return;
            }

            if (nextTab) {
                nextTab.focus();
                applyFilter(nextTab === tabUnread ? 'unread' : 'all', true);
            }
        });
    }

    // Hash sync
    function syncHash() {
        const hash = (window.location.hash || '').replace('#', '').trim();
        if (hash === 'unread') {
            applyFilter('unread', false);
        } else {
            applyFilter('all', false);
        }
    }

    syncHash();
    window.addEventListener('hashchange', syncHash);
});
