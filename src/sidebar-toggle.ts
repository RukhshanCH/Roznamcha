// src/sidebar-toggle.ts
(() => {
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    if (!sidebar) return;

    let backdrop = document.querySelector<HTMLElement>('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
    }

    const toggles = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-toggle]'));
    const mainContent = document.querySelector<HTMLElement>('.main-content');

    const open = () => {
        sidebar!.classList.add('open');
        sidebar!.classList.remove('closed');
        // ── keep React's collapsed state in sync on mobile ──
        sidebar!.classList.remove('collapsed');
        sidebar!.removeAttribute('inert');
        backdrop!.classList.add('visible');
        document.documentElement.classList.add('no-scroll');
        document.body.classList.add('no-scroll');
        mainContent?.classList.add('sidebar-open');
    };

    const close = () => {
        sidebar!.classList.remove('open');
        sidebar!.classList.add('closed');
        // ── keep React's collapsed state in sync on mobile ──
        sidebar!.classList.add('collapsed');
        sidebar!.setAttribute('inert', 'true');
        backdrop!.classList.remove('visible');
        document.documentElement.classList.remove('no-scroll');
        document.body.classList.remove('no-scroll');
        mainContent?.classList.remove('sidebar-open');
    };

    toggles.forEach(t => {
        t.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return;
            e.preventDefault();
            const isOpen = sidebar!.classList.contains('open');
            isOpen ? close() : open();
        });
    });

    backdrop.addEventListener('click', () => {
        if (window.innerWidth <= 768) close();
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar!.classList.remove('open', 'closed');
            sidebar!.removeAttribute('inert');
            backdrop!.classList.remove('visible');
            document.documentElement.classList.remove('no-scroll');
            document.body.classList.remove('no-scroll');
            mainContent?.classList.remove('sidebar-open');
        } else {
            if (!sidebar!.classList.contains('closed') && !sidebar!.classList.contains('open')) {
                close();
            }
        }
    });

    // Initialize
    if (window.innerWidth <= 768) {
        close();
    }
})();