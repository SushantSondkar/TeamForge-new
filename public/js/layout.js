/**
 * Global layout & navigation script (CSP-safe, external script)
 * Handles mobile drawer, navbar toggles, flash dismissals, active navigation links,
 * header profile dropdown, and dark mode theme switching.
 */
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;

    // 1. Flash alert dismissal
    document.querySelectorAll('.flash-alert-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const alertBox = btn.closest('.flash-alert');
            if (alertBox) alertBox.remove();
        });
    });

    // 2. Sidebar Drawer controls
    const sidebar = document.getElementById('appSidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    const backdrop = document.getElementById('sidebarBackdrop');

    function openSidebar() {
        if (sidebar) sidebar.classList.add('drawer-open');
        if (backdrop) backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        if (sidebar) sidebar.classList.remove('drawer-open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSidebar();
    });

    // 3. Sidebar active navigation links
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
            link.classList.add('active');
            link.style.backgroundColor = '#2563eb';
            link.style.color = '#ffffff';
            link.style.fontWeight = '600';
            link.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.25)';
        } else {
            link.classList.remove('active');
            link.style.backgroundColor = 'transparent';
            link.style.color = '';
            link.style.fontWeight = '500';
            link.style.boxShadow = 'none';
        }
    });

    // 4. Mobile bottom navigation active link
    document.querySelectorAll('.mobile-nav-item').forEach(link => {
        const href = link.getAttribute('href');
        if (href && (href === currentPath || (href !== '/' && currentPath.startsWith(href)))) {
            link.classList.add('active');
        }
    });

    // 5. Navbar mobile menu toggle
    const navToggleBtn = document.getElementById('navbarMobileToggle');
    const navMenu = document.getElementById('navbarMenu');
    if (navToggleBtn && navMenu) {
        navToggleBtn.addEventListener('click', () => {
            navMenu.classList.toggle('navbar-menu-open');
        });
    }

    // 6. Header Profile Dropdown
    const profileBtn = document.getElementById('profileDropdownBtn');
    const profileMenu = document.getElementById('profileDropdownMenu');

    function openProfileDropdown() {
        if (!profileBtn || !profileMenu) return;
        profileMenu.classList.add('is-open');
        profileMenu.removeAttribute('hidden');
        profileBtn.setAttribute('aria-expanded', 'true');
        profileBtn.classList.add('is-active');
    }

    function closeProfileDropdown() {
        if (!profileBtn || !profileMenu) return;
        profileMenu.classList.remove('is-open');
        profileMenu.setAttribute('hidden', '');
        profileBtn.setAttribute('aria-expanded', 'false');
        profileBtn.classList.remove('is-active');
    }

    if (profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = profileBtn.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
                closeProfileDropdown();
            } else {
                openProfileDropdown();
            }
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (profileBtn.getAttribute('aria-expanded') === 'true') {
                if (!profileMenu.contains(e.target) && !profileBtn.contains(e.target)) {
                    closeProfileDropdown();
                }
            }
        });

        // Close on Escape and return focus to button
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && profileBtn.getAttribute('aria-expanded') === 'true') {
                closeProfileDropdown();
                profileBtn.focus();
            }
        });
    }

    // 7. Dark Mode Controls (Fallback & Sync)
    if (window.TeamForgeTheme && typeof window.TeamForgeTheme.initControls === 'function') {
        window.TeamForgeTheme.initControls();
    }
});
