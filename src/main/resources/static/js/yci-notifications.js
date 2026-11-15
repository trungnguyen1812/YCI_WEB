/* ══════════════════════════════════════════════════════════════
   YCI Notifications — Bell icon, dropdown, polling, sound
   ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const user = window.YCI_SESSION?.user;
    if (!user) return; // không đăng nhập → bỏ qua

    const btn       = document.getElementById('notifBellBtn');
    const dropdown  = document.getElementById('notifDropdown');
    const badge     = document.getElementById('notifBadge');
    const list      = document.getElementById('notifList');
    const readAllBtn = document.getElementById('notifReadAll');
    if (!btn) return;

    let prevUnread  = 0;
    let isOpen      = false;

    // ── Âm thanh thông báo (Web Audio API) ─────────────────────
    function playNotifSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();

            // Nốt 1: ding cao
            const o1 = ctx.createOscillator();
            const g1 = ctx.createGain();
            o1.connect(g1); g1.connect(ctx.destination);
            o1.type = 'sine';
            o1.frequency.setValueAtTime(880, ctx.currentTime);
            o1.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.08);
            g1.gain.setValueAtTime(0.35, ctx.currentTime);
            g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            o1.start(ctx.currentTime);
            o1.stop(ctx.currentTime + 0.35);

            // Nốt 2: ding tiếp theo
            const o2 = ctx.createOscillator();
            const g2 = ctx.createGain();
            o2.connect(g2); g2.connect(ctx.destination);
            o2.type = 'sine';
            o2.frequency.setValueAtTime(1320, ctx.currentTime + 0.18);
            o2.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.38);
            g2.gain.setValueAtTime(0, ctx.currentTime + 0.18);
            g2.gain.setValueAtTime(0.28, ctx.currentTime + 0.20);
            g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
            o2.start(ctx.currentTime + 0.18);
            o2.stop(ctx.currentTime + 0.55);

            // Tự đóng context sau
            setTimeout(() => { try { ctx.close(); } catch (_) {} }, 800);
        } catch (_) {
            // Trình duyệt không hỗ trợ AudioContext → bỏ qua
        }
    }

    // ── Relative time ──────────────────────────────────────────
    function timeAgo(iso) {
        if (!iso) return '';
        const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (diff < 60) return 'Vừa xong';
        if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
        return `${Math.floor(diff / 86400)} ngày trước`;
    }

    // ── Type → icon + accent ───────────────────────────────────
    function typeIcon(type) {
        switch ((type || '').toUpperCase()) {
            case 'SUCCESS': return { icon: 'check-circle', color: '#1c8f65' };
            case 'WARNING': return { icon: 'alert-triangle', color: '#b66a00' };
            case 'ERROR':   return { icon: 'x-circle', color: '#bd1f54' };
            default:        return { icon: 'bell', color: '#4f6fae' };
        }
    }

    // ── Render dropdown list ───────────────────────────────────
    function renderList(notifications) {
        if (!notifications || !notifications.length) {
            list.innerHTML = `
                <div class="notif-empty">
                    <i data-lucide="bell-off"></i>
                    <p>Chưa có thông báo</p>
                </div>`;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        list.innerHTML = notifications.map(n => {
            const { icon, color } = typeIcon(n.type);
            const unread = !n.isRead;
            return `
            <div class="notif-item ${unread ? 'is-unread' : ''}"
                 data-notif-id="${n.idNotification}"
                 ${n.link ? `data-notif-link="${n.link}"` : ''}>
                <div class="notif-icon-wrap" style="--nc:${color};">
                    <i data-lucide="${icon}"></i>
                </div>
                <div class="notif-content">
                    <p class="notif-title">${escHtml(n.title)}</p>
                    <p class="notif-msg">${escHtml(n.message)}</p>
                    <span class="notif-time">${timeAgo(n.createdAt)}</span>
                </div>
                ${unread ? '<span class="notif-dot"></span>' : ''}
            </div>`;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    function escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── Fetch notifications ────────────────────────────────────
    async function fetchNotifications() {
        try {
            const res = await fetch('/api/notifications', { credentials: 'same-origin' });
            if (!res.ok) return [];
            const json = await res.json();
            return json.data || [];
        } catch (_) { return []; }
    }

    async function fetchUnreadCount() {
        try {
            const res = await fetch('/api/notifications/unread-count', { credentials: 'same-origin' });
            if (!res.ok) return 0;
            const json = await res.json();
            return Number(json.count || 0);
        } catch (_) { return 0; }
    }

    async function markAllRead() {
        try {
            await fetch('/api/notifications/read-all', {
                method: 'PUT', credentials: 'same-origin'
            });
        } catch (_) {}
    }

    async function markOneRead(id) {
        try {
            await fetch(`/api/notifications/${id}/read`, {
                method: 'PUT', credentials: 'same-origin'
            });
        } catch (_) {}
    }

    // ── Update badge ───────────────────────────────────────────
    function updateBadge(count) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
    }

    // ── Bell animation ─────────────────────────────────────────
    function ringBell() {
        btn.classList.add('notif-ring');
        setTimeout(() => btn.classList.remove('notif-ring'), 700);
    }

    // ── Polling loop (mỗi 20 giây) ────────────────────────────
    async function poll() {
        const count = await fetchUnreadCount();
        updateBadge(count);
        // Nếu có thông báo mới so với lần trước → rung + âm thanh
        if (count > prevUnread) {
            ringBell();
            playNotifSound();
        }
        prevUnread = count;
    }

    // ── Open / close dropdown ──────────────────────────────────
    async function openDropdown() {
        isOpen = true;
        dropdown.hidden = false;
        dropdown.classList.add('is-open');
        list.innerHTML = `<div class="notif-loading"><span class="notif-spinner"></span></div>`;
        const notifs = await fetchNotifications();
        renderList(notifs);
    }

    function closeDropdown() {
        isOpen = false;
        dropdown.classList.remove('is-open');
        dropdown.addEventListener('transitionend', () => { dropdown.hidden = true; }, { once: true });
    }

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeDropdown();
        } else {
            await openDropdown();
        }
    });

    // Click outside → close
    document.addEventListener('click', (e) => {
        if (isOpen && !document.getElementById('notifBellWrap')?.contains(e.target)) {
            closeDropdown();
        }
    });

    // Click notification item
    list.addEventListener('click', async (e) => {
        const item = e.target.closest('.notif-item');
        if (!item) return;
        const id   = item.dataset.notifId;
        const link = item.dataset.notifLink;
        if (id) {
            item.classList.remove('is-unread');
            item.querySelector('.notif-dot')?.remove();
            await markOneRead(id);
            prevUnread = Math.max(0, prevUnread - 1);
            updateBadge(prevUnread);
        }
        if (link) {
            closeDropdown();
            window.location.href = link;
        }
    });

    // Mark all read
    readAllBtn?.addEventListener('click', async () => {
        await markAllRead();
        list.querySelectorAll('.notif-item').forEach(i => {
            i.classList.remove('is-unread');
            i.querySelector('.notif-dot')?.remove();
        });
        prevUnread = 0;
        updateBadge(0);
    });

    // ── Start polling ──────────────────────────────────────────
    poll();
    setInterval(poll, 20000); // mỗi 20 giây

})();
