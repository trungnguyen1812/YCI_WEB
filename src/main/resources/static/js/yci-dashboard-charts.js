/* ══════════════════════════════════════════════════════════════
   YCI Dashboard Charts — Chart.js powered analytics
   Runs only on admin-dashboard page
   ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    // ── Brand colours ──────────────────────────────────────────
    const PINK   = '#e91e83';
    const CORAL  = '#ff5fa2';
    const BLUE   = '#4f6fae';
    const BLUE_L = '#7b9dd6';
    const GREEN  = '#1c8f65';
    const AMBER  = '#b66a00';
    const PURPLE = '#7c3aed';
    const TEAL_D = '#b41463';
    const MUTED  = '#7b6070';

    // Status → colour map
    const STATUS_COLORS = {
        AVAILABLE:    GREEN,
        RENTING:      PINK,
        MAINTENANCE:  AMBER,
        RESERVED:     BLUE,
        RETURNED:     TEAL_D,
        DAMAGED:      '#bd1f54',
        LOST:         '#4a1030',
    };

    function statusColor(key) {
        if (!key) return MUTED;
        const upper = String(key).toUpperCase();
        return STATUS_COLORS[upper] || MUTED;
    }

    // ── Global Chart.js defaults ────────────────────────────────
    function applyChartDefaults() {
        if (!window.Chart) return;
        Chart.defaults.font.family = '"Be Vietnam Pro", Arial, sans-serif';
        Chart.defaults.font.size   = 13;
        Chart.defaults.color       = '#7b6070';
        Chart.defaults.plugins.legend.display = false;
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(45,27,38,0.92)';
        Chart.defaults.plugins.tooltip.padding         = 12;
        Chart.defaults.plugins.tooltip.cornerRadius    = 10;
        Chart.defaults.plugins.tooltip.titleColor      = '#fff';
        Chart.defaults.plugins.tooltip.bodyColor       = 'rgba(255,255,255,0.80)';
        Chart.defaults.plugins.tooltip.borderWidth     = 0;
    }

    // ── Helpers ─────────────────────────────────────────────────
    function shortMoney(val) {
        if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(1) + ' tỷ';
        if (val >= 1_000_000)     return (val / 1_000_000).toFixed(1) + ' tr';
        if (val >= 1_000)         return (val / 1_000).toFixed(0) + ' k';
        return val.toLocaleString('vi-VN');
    }

    function fullMoney(val) {
        return Number(val).toLocaleString('vi-VN') + ' đ';
    }

    function dateKey(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function monthKey(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    // Generate last N days as YYYY-MM-DD array
    function lastNDays(n) {
        const days = [];
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(dateKey(d.toISOString()));
        }
        return days;
    }

    // Generate last 12 months as YYYY-MM
    function last12Months() {
        const months = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - i);
            months.push(monthKey(d.toISOString()));
        }
        return months;
    }

    function labelDay(ymd) {
        const [, m, d] = ymd.split('-');
        return `${d}/${m}`;
    }

    function labelMonth(ym) {
        const [y, m] = ym.split('-');
        return `T${parseInt(m)}/${y}`;
    }

    // ── Chart: Revenue (line) ───────────────────────────────────
    function buildRevenueChart(bookings) {
        const ctx = document.getElementById('chartRevenue');
        if (!ctx) return;

        const days   = lastNDays(30);
        const revenueMap = {};

        bookings.forEach(b => {
            const key  = dateKey(b.timeStart || b.createdAt);
            const paid = (b.paymentBookingDTOS || [])
                .reduce((s, p) => s + Number(p.price || 0), 0);
            if (key) revenueMap[key] = (revenueMap[key] || 0) + paid;
        });

        const data   = days.map(d => revenueMap[d] || 0);
        const labels = days.map(labelDay);

        // Gradient fill
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0,   'rgba(233,30,131,0.20)');
        gradient.addColorStop(0.7, 'rgba(233,30,131,0.04)');
        gradient.addColorStop(1,   'rgba(233,30,131,0)');

        new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    fill: true,
                    backgroundColor: gradient,
                    borderColor:     PINK,
                    borderWidth:     2.5,
                    pointRadius:     data.map(v => v > 0 ? 4 : 2),
                    pointBackgroundColor: PINK,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    tension:         0.45,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid:  { display: false },
                        ticks: { maxTicksLimit: 10, color: MUTED, font: { size: 11 } },
                        border: { display: false }
                    },
                    y: {
                        grid:  { color: 'rgba(243,201,220,0.35)', drawTicks: false },
                        ticks: {
                            callback: v => shortMoney(v),
                            maxTicksLimit: 6,
                            color: MUTED,
                            font: { size: 11 },
                            padding: 8
                        },
                        border: { display: false }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: items => `Ngày ${items[0].label}`,
                            label: item  => ` Doanh thu: ${fullMoney(item.raw)}`
                        }
                    },
                    legend: { display: false }
                }
            }
        });
    }

    // ── Chart: Equipment status (doughnut) ─────────────────────
    function buildEquipmentChart(products) {
        const ctx = document.getElementById('chartEquipment');
        const legend = document.getElementById('donutLegend');
        if (!ctx) return;

        // Group by status
        const grouped = {};
        products.forEach(p => {
            const key = String(p.status || 'Chưa rõ').toUpperCase();
            grouped[key] = (grouped[key] || 0) + 1;
        });

        const labels = Object.keys(grouped);
        const data   = labels.map(k => grouped[k]);
        const colors = labels.map(statusColor);

        // Friendly label mapping
        const labelMap = {
            AVAILABLE:    'Sẵn sàng',
            RENTING:      'Đang thuê',
            MAINTENANCE:  'Bảo trì',
            RESERVED:     'Đã đặt',
            RETURNED:     'Đã trả',
            DAMAGED:      'Hỏng',
            LOST:         'Mất',
        };
        const friendlyLabels = labels.map(k => labelMap[k] || k);

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: friendlyLabels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderColor: '#fff',
                    borderWidth: 3,
                    hoverOffset: 8,
                    hoverBorderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: item => ` ${item.label}: ${item.raw} thiết bị (${Math.round(item.raw / products.length * 100)}%)`
                        }
                    }
                }
            }
        });

        // Build custom legend below chart
        if (legend) {
            legend.innerHTML = friendlyLabels.map((lbl, i) => `
                <div class="donut-legend-item">
                    <span class="donut-legend-dot" style="background:${colors[i]};"></span>
                    <span class="donut-legend-label">${lbl}</span>
                    <strong class="donut-legend-val">${data[i]}</strong>
                </div>
            `).join('');
        }
    }

    // ── Chart: Bookings per month (bar) ────────────────────────
    function buildBookingsChart(bookings) {
        const ctx = document.getElementById('chartBookings');
        if (!ctx) return;

        const months = last12Months();
        const countMap = {};

        bookings.forEach(b => {
            const key = monthKey(b.timeStart || b.createdAt);
            if (key) countMap[key] = (countMap[key] || 0) + 1;
        });

        const data   = months.map(m => countMap[m] || 0);
        const labels = months.map(labelMonth);

        // Gradient bar colours — highlight current month
        const currentMonth = monthKey(new Date().toISOString());
        const barColors = months.map(m =>
            m === currentMonth
                ? PINK
                : 'rgba(79,111,174,0.72)'
        );

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: barColors,
                    borderRadius: 8,
                    borderSkipped: false,
                    hoverBackgroundColor: PINK,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid:  { display: false },
                        ticks: { color: MUTED, font: { size: 11 } },
                        border: { display: false }
                    },
                    y: {
                        grid:  { color: 'rgba(79,111,174,0.12)', drawTicks: false },
                        ticks: {
                            stepSize: 1,
                            maxTicksLimit: 6,
                            color: MUTED,
                            font: { size: 11 },
                            padding: 8
                        },
                        border: { display: false }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: items => items[0].label,
                            label: item  => ` ${item.raw} đơn thuê`
                        }
                    },
                    legend: { display: false }
                }
            }
        });
    }

    // ── Mini stats panel ────────────────────────────────────────
    function buildMiniStats(bookings, products, users) {
        const el = document.getElementById('miniStatList');
        if (!el) return;

        const totalRevenue = bookings.reduce((s, b) =>
            s + (b.paymentBookingDTOS || []).reduce((ss, p) => ss + Number(p.price || 0), 0), 0);

        const today = dateKey(new Date().toISOString());
        const todayBookings = bookings.filter(b => dateKey(b.timeStart || b.createdAt) === today).length;

        const statusLabelMap = {
            AVAILABLE:   'Sẵn sàng',
            RENTING:     'Đang thuê',
            MAINTENANCE: 'Bảo trì',
        };

        const renting = products.filter(p =>
            String(p.status || '').toUpperCase() === 'RENTING').length;

        const available = products.filter(p =>
            String(p.status || '').toUpperCase() === 'AVAILABLE').length;

        // Avg revenue per booking
        const avgRevenue = bookings.length
            ? Math.round(totalRevenue / bookings.length)
            : 0;

        const stats = [
            { icon: '📅', label: 'Đơn hôm nay',    value: `${todayBookings} đơn`,     color: PINK  },
            { icon: '📷', label: 'Đang cho thuê',   value: `${renting} thiết bị`,      color: CORAL },
            { icon: '✅', label: 'Sẵn sàng thuê',   value: `${available} thiết bị`,    color: GREEN },
            { icon: '💰', label: 'Doanh thu TB/đơn', value: shortMoney(avgRevenue) + ' đ', color: AMBER },
        ];

        el.innerHTML = stats.map(s => `
            <div class="mini-stat-item">
                <div class="mini-stat-icon" style="color:${s.color};">${s.icon}</div>
                <div class="mini-stat-body">
                    <span>${s.label}</span>
                    <strong style="color:${s.color};">${s.value}</strong>
                </div>
            </div>
        `).join('');
    }

    // ── Boot: called from yci-admin.js after data loaded ───────
    //   yci-admin.js calls window.YCI_CHARTS.boot(products, bookings, users)
    const _CANCELLED = new Set(["CANCELLED", "CANCEL_REQUESTED", "REFUNDED"]);

    window.YCI_CHARTS = {
        boot(products, bookings, users) {
            if (!window.Chart) {
                console.warn('Chart.js not loaded');
                return;
            }
            // Lọc đơn đã hủy / hoàn trước khi đưa vào tất cả charts
            const activeBookings = bookings.filter(
                b => !_CANCELLED.has((b.status || "").toUpperCase().replace(/ /g, "_"))
            );
            applyChartDefaults();
            buildRevenueChart(activeBookings);
            buildEquipmentChart(products);
            buildBookingsChart(activeBookings);
            buildMiniStats(activeBookings, products, users);
        }
    };

})();
