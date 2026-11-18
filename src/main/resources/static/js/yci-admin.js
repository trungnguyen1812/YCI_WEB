(function () {
    async function loadPaged(url) {
        let page = 1;
        let totalPage = 1;
        const items = [];
        do {
            const separator = url.includes("?") ? "&" : "?";
            const response = await YCI.apiGet(`${url}${separator}page=${page}`);
            items.push(...YCI.unwrapList(response));
            totalPage = Number(response.totalPage || 1);
            page += 1;
        } while (page <= totalPage);
        return items;
    }

    // Trạng thái đơn bị loại khỏi doanh thu (đã hủy, đang chờ hủy, đã hoàn tiền)
    const CANCELLED_STATUSES = new Set(["CANCELLED", "CANCEL_REQUESTED", "REFUNDED"]);

    function financeOf(booking) {
        // Đơn đã hủy / hoàn tiền không tính vào doanh thu
        if (CANCELLED_STATUSES.has((booking.status || "").toUpperCase().replace(/ /g, "_"))) {
            return { paid: 0, remain: 0 };
        }
        // Chỉ đếm khoản thanh toán thực sự PAID
        const payments = (booking.paymentBookingDTOS || [])
            .filter(p => (p.paymentStatus || "").toUpperCase() === "PAID");
        const paid = payments.reduce((sum, p) => sum + Number(p.price || 0), 0);
        const lastPayment = payments[payments.length - 1];
        const remain = lastPayment ? Number(lastPayment.remainAmount || 0) : Number(booking.totalAmount || 0);
        return { paid, remain };
    }

    async function adminResources() {
        const [products, bookings, users, statuses, deposits, payments, rentalTypes, categories] = await Promise.all([
            YCI.apiGet("/api/product/all").then(YCI.unwrapList),
            loadPaged("/api/admin/booking"),
            loadPaged("/api/user"),
            YCI.apiGet("/api/admin/status").then(YCI.unwrapList),
            YCI.apiGet("/api/deposit-type").then(YCI.unwrapList),
            YCI.apiGet("/api/payment-method").then(YCI.unwrapList),
            YCI.apiGet("/api/admin/rental-type").then(YCI.unwrapList),
            YCI.apiGet("/api/category").then(YCI.unwrapList)
        ]);
        return { products, bookings, users, statuses, deposits, payments, rentalTypes, categories };
    }

    function bootDashboard() {
        adminResources()
            .then(({ products, bookings, users }) => {
                // Chỉ tính doanh thu từ đơn chưa hủy / chưa hoàn tiền
                const activeBookings = bookings.filter(b => !CANCELLED_STATUSES.has((b.status || "").toUpperCase().replace(/ /g, "_")));
                const paid = activeBookings.reduce((sum, booking) => sum + financeOf(booking).paid, 0);
                YCI.qs("[data-admin-products]").textContent = products.length;
                YCI.qs("[data-admin-bookings]").textContent = bookings.length;
                YCI.qs("[data-admin-users]").textContent = users.length;
                YCI.qs("[data-admin-revenue]").textContent = YCI.money(paid);

                YCI.qs("[data-dashboard-bookings]").innerHTML = [...bookings]
                    .sort((a, b) => Number(b.idBooking) - Number(a.idBooking))
                    .slice(0, 6).map((booking) => `
                    <a class="compact-item" href="/admin/bookings">
                        <div>
                            <strong>Đơn ${YCI.escapeHtml(booking.bookingCode || ('#' + booking.idBooking))} — ${YCI.escapeHtml(booking.userBookingDTO?.fullName || "Khách hàng")}</strong>
                            <p>${YCI.formatDate(booking.timeStart)} · ${YCI.money(booking.totalAmount)}</p>
                        </div>
                        <span class="status-pill ${YCI.statusClass(booking.status)}">${YCI.escapeHtml(YCI.statusLabel(booking.status))}</span>
                    </a>
                `).join("") || `<p class="muted">Chưa có đơn thuê.</p>`;

                const grouped = products.reduce((acc, product) => {
                    const key = product.status || "Chưa rõ";
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});
                YCI.qs("[data-dashboard-status]").innerHTML = Object.entries(grouped).map(([status, count]) => `
                    <div class="compact-item">
                        <div>
                            <strong>${YCI.escapeHtml(YCI.statusLabel(status))}</strong>
                            <p>${count} thiết bị</p>
                        </div>
                        <span class="status-pill ${YCI.statusClass(status)}">${count}</span>
                    </div>
                `).join("") || `<p class="muted">Chưa có dữ liệu thiết bị.</p>`;

                // Boot charts after DOM is ready
                if (window.YCI_CHARTS) {
                    window.YCI_CHARTS.boot(products, bookings, users);
                }

                YCI.iconRefresh();
            })
            .catch((error) => YCI.toast(error.message, "error"));
    }

    function bootAdminBookings() {
        const state = {
            bookings: [],
            statuses: [],
            deposits: [],
            payments: [],
            search: "",
            status: "",
            selected: null
        };
        const table        = YCI.qs("[data-admin-bookings-table]");
        const statusFilter = YCI.qs("[data-admin-booking-status]");
        const search       = YCI.qs("[data-admin-booking-search]");
        const statusTabs   = YCI.qs("[data-booking-status-tabs]");
        const readOnly     = false;
        const pg           = YCI.paginate(document.getElementById("pgBookings"), 15);

        // ── Modal elements ──────────────────────────────────────
        const modal      = document.getElementById("bookingModal");
        const modalTitle = document.getElementById("bmodalTitle");
        const modalEye   = document.getElementById("bmodalEyebrow");
        const modalMeta  = document.getElementById("bmodalMeta");
        const modalBody  = document.getElementById("bmodalBody");
        const modalClose = document.getElementById("bmodalClose");

        function openModal() {
            modal.hidden = false;
            document.body.classList.add("bmodal-open");
            requestAnimationFrame(() => modal.classList.add("is-open"));
            modalClose.focus();
        }

        function closeModal() {
            modal.classList.remove("is-open");
            modal.addEventListener("transitionend", () => {
                modal.hidden = true;
                document.body.classList.remove("bmodal-open");
                state.selected = null;
            }, { once: true });
        }

        // Close on overlay click
        modal?.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
        modalClose?.addEventListener("click", closeModal);

        // Close on Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !modal.hidden) closeModal();
        });

        // ── Quét QR nhận máy (nhân viên quét mã của khách) ────────
        const scanModalHtml = `
        <div class="bmodal-overlay" id="scanModal" aria-modal="true" role="dialog" hidden>
            <div class="bmodal-box" style="max-width:440px;">
                <div class="bmodal-header">
                    <div class="bmodal-title-group">
                        <p class="eyebrow">Quét mã QR</p>
                        <h2>Quét mã nhận máy của khách</h2>
                    </div>
                    <button class="bmodal-close" type="button" id="scanClose" aria-label="Đóng">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="bmodal-body" style="padding:18px 22px;">
                    <div id="scanReader" style="width:100%;border-radius:12px;overflow:hidden;min-height:240px;background:#111;"></div>
                    <p class="muted" style="font-size:13px;margin-top:10px;text-align:center;">Đưa camera vào mã QR trên điện thoại của khách.</p>
                    <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px;">
                        <p class="muted" style="font-size:12px;margin:0 0 8px;">Không quét được? Nhập mã đơn thủ công:</p>
                        <div style="display:flex;gap:8px;">
                            <input id="scanManualId" type="text" inputmode="numeric" placeholder="Mã đơn (VD: 1234)" style="flex:1;padding:9px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px;background:#fff;">
                            <button class="button primary" type="button" id="scanManualBtn"><i data-lucide="search"></i> Mở đơn</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        if (!document.getElementById("scanModal")) {
            document.body.insertAdjacentHTML("beforeend", scanModalHtml);
            YCI.iconRefresh();
        }
        const scanModal = document.getElementById("scanModal");
        const scanCloseBtn = document.getElementById("scanClose");
        let qrScanner = null;
        let scanLocked = false;

        // Nút "Quét QR" đặt cạnh nút Tải lại — joined button group
        const refreshBtn = YCI.qs("[data-refresh-admin-bookings]");
        if (refreshBtn) {
            const btnGroup = document.createElement("div");
            btnGroup.style.cssText = "display:flex;align-items:center;flex-shrink:0;margin-top:6px;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;";
            // Xoá border riêng của nút Tải lại để dùng border của group
            refreshBtn.style.cssText += ";border:none;border-radius:0;margin:0;border-right:1px solid var(--line);";
            refreshBtn.parentNode.insertBefore(btnGroup, refreshBtn);
            btnGroup.appendChild(refreshBtn);
            btnGroup.insertAdjacentHTML("beforeend",
                `<button class="button ghost" type="button" id="btnScanQr"
                    style="border:none;border-radius:0;margin:0;color:var(--teal-dark);font-weight:700;gap:7px;">
                    <i data-lucide="scan-line" style="width:16px;height:16px;"></i> Quét QR
                 </button>`);
        }
        YCI.iconRefresh();

        // Tra cứu đơn theo mã và mở modal chi tiết
        async function openBookingById(id) {
            try {
                const res = await YCI.apiGet("/api/booking/id=" + id);
                const booking = YCI.unwrapData(res);
                if (!booking || !booking.idBooking) {
                    YCI.toast("Không tìm thấy đơn #" + id, "error");
                    return;
                }
                state.selected = booking;
                renderModal();
            } catch (err) {
                YCI.toast((err && err.message) ? err.message : ("Không tìm thấy đơn #" + id), "error");
            }
        }

        async function closeScanModal() {
            if (qrScanner) {
                try { await qrScanner.stop(); } catch (_) {}
                try { qrScanner.clear(); } catch (_) {}
                qrScanner = null;
            }
            if (!scanModal) return;
            scanModal.classList.remove("is-open");
            scanModal.addEventListener("transitionend", () => {
                scanModal.hidden = true;
                // chỉ bỏ khóa cuộn nếu modal đơn không đang mở
                if (!modal || modal.hidden) document.body.classList.remove("bmodal-open");
            }, { once: true });
        }

        async function openScanModal() {
            if (!scanModal) return;
            scanLocked = false;
            scanModal.hidden = false;
            document.body.classList.add("bmodal-open");
            requestAnimationFrame(() => scanModal.classList.add("is-open"));
            YCI.iconRefresh();
            if (typeof Html5Qrcode === "undefined") {
                YCI.toast("Trình duyệt không hỗ trợ quét QR. Hãy nhập mã đơn bên dưới.", "error");
                return;
            }
            try {
                qrScanner = new Html5Qrcode("scanReader");
                await qrScanner.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 240, height: 240 } },
                    onScanSuccess,
                    () => {}
                );
            } catch (err) {
                YCI.toast("Không mở được camera: " + ((err && err.message) ? err.message : err), "error");
            }
        }

        async function onScanSuccess(decodedText) {
            if (scanLocked) return;
            if (!decodedText || !decodedText.startsWith("YCI|")) {
                YCI.toast("Mã QR không phải mã đơn YCI. Vui lòng quét lại.", "error");
                return; // tiếp tục quét
            }
            scanLocked = true;
            const parts = decodedText.split("|");
            const id = parts[1];
            YCI.toast("Đã quét đơn #" + id, "success");
            await closeScanModal();
            await openBookingById(id);
        }

        document.getElementById("btnScanQr")?.addEventListener("click", openScanModal);
        scanCloseBtn?.addEventListener("click", closeScanModal);
        scanModal?.addEventListener("click", (e) => { if (e.target === scanModal) closeScanModal(); });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && scanModal && !scanModal.hidden) closeScanModal();
        });
        document.getElementById("scanManualBtn")?.addEventListener("click", () => {
            const input = document.getElementById("scanManualId");
            const id = ((input && input.value) || "").trim();
            if (!id) { YCI.toast("Vui lòng nhập mã đơn.", "error"); return; }
            closeScanModal();
            openBookingById(id);
        });

        async function load() {
            const [bookings, statuses, deposits, payments] = await Promise.all([
                loadPaged("/api/admin/booking"),
                YCI.apiGet("/api/admin/status").then(YCI.unwrapList),
                YCI.apiGet("/api/deposit-type").then(YCI.unwrapList),
                YCI.apiGet("/api/payment-method").then(YCI.unwrapList)
            ]);
            state.bookings = bookings;
            state.statuses = statuses;
            state.deposits = deposits;
            state.payments = payments;
            YCI.setOptions(statusFilter, statuses, (item) => item.statusCode, (item) => YCI.statusLabel(item.statusCode), "Tất cả trạng thái");
            render();
        }

        function filteredBookings() {
            const keyword = state.search.trim().toLowerCase();
            return state.bookings
                .filter((booking) => {
                    const customer = booking.userBookingDTO || {};
                    const products = (booking.bookingDetailDTOS || []).map((detail) => detail.productBookingDTO?.nameProduct).join(" ");
                    const text = YCI.cleanText([booking.idBooking, customer.fullName, customer.phone, customer.email, products].join(" ")).toLowerCase();
                    const matchSearch = !keyword || text.includes(keyword);
                    const matchStatus = !state.status || booking.status === state.status;
                    return matchSearch && matchStatus;
                })
                .sort((a, b) => Number(b.idBooking) - Number(a.idBooking)); // mới nhất lên đầu
        }

        function render() {
            renderStatusTabs();
            const all  = filteredBookings();
            const page = pg.slice(all);
            table.innerHTML = page.map((booking) => {
                const devices = (booking.bookingDetailDTOS || [])
                    .map(d => YCI.escapeHtml(d.productBookingDTO?.nameProduct || "?"))
                    .slice(0, 2).join(", ")
                    + ((booking.bookingDetailDTOS || []).length > 2 ? ` +${(booking.bookingDetailDTOS || []).length - 2}` : "");
                return `
                <tr data-booking-row="${booking.idBooking}" title="Nhấn để xem chi tiết">
                    <td>
                        <strong style="font-size:15px;">${YCI.escapeHtml(booking.bookingCode || ('#' + booking.idBooking))}</strong>
                        <br><span class="muted" style="font-size:12px;">${YCI.formatDate(booking.createdAt)}</span>
                    </td>
                    <td>
                        <strong>${YCI.escapeHtml(booking.userBookingDTO?.fullName || "-")}</strong>
                        <br><span class="muted">${YCI.escapeHtml(booking.userBookingDTO?.phone || "")}</span>
                    </td>
                    <td>
                        <span style="white-space:nowrap;">${YCI.formatDate(booking.timeStart)}</span>
                        <br><span class="muted" style="white-space:nowrap;">→ ${YCI.formatDate(booking.timeEnd)}</span>
                    </td>
                    <td>
                        <span class="booking-device-list">${devices || "—"}</span>
                    </td>
                    <td><strong style="color:var(--teal-dark);">${YCI.money(booking.totalAmount)}</strong></td>
                    <td><span class="status-pill ${YCI.statusClass(booking.status)}">${YCI.escapeHtml(YCI.statusLabel(booking.status))}</span></td>
                    <td>
                        <div class="button-row">
                            <button class="icon-button sm" type="button" data-booking-row="${booking.idBooking}" aria-label="Xem chi tiết">
                                <i data-lucide="eye"></i>
                            </button>
                            ${(booking.status === "CANCEL_REQUESTED" || booking.status === "CANCELLED")
                                ? `<a class="icon-button sm" href="/admin/refunds" title="Xử lý hoàn tiền" aria-label="Xử lý hoàn tiền" style="color:var(--danger);">
                                       <i data-lucide="hand-coins"></i>
                                   </a>`
                                : ""
                            }
                        </div>
                    </td>
                </tr>`;
            }).join("") || `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted);">Không có đơn thuê phù hợp.</td></tr>`;
            pg.render(all.length);
            YCI.iconRefresh();
        }

        function renderStatusTabs() {
            if (!statusTabs) {
                return;
            }
            const counts = state.bookings.reduce((acc, booking) => {
                const key = booking.status || "";
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            const items = [
                { value: "", label: "Tất cả", count: state.bookings.length },
                ...Object.entries(counts).map(([value, count]) => ({
                    value,
                    label: YCI.statusLabel(value),
                    count
                }))
            ];
            statusTabs.innerHTML = items.map((item) => `
                <button class="admin-tab ${String(state.status) === String(item.value) ? "is-active" : ""}"
                        type="button"
                        data-booking-status-tab="${YCI.escapeHtml(item.value)}">
                    <span>${YCI.escapeHtml(item.label)}</span>
                    <strong>${item.count}</strong>
                </button>
            `).join("");
        }

        function options(items, valueKey, labelKey) {
            return items.map((item) => {
                const label = labelKey === "statusCode" ? YCI.statusLabel(item[labelKey]) : item[labelKey];
                return `<option value="${item[valueKey]}">${YCI.escapeHtml(label)}</option>`;
            }).join("");
        }

        function depositOptions() {
            return state.deposits.map((item) => {
                const percent = Number(item.percentDeposit || 0);
                return `<option value="${item.idDepositType}">${YCI.escapeHtml(item.type)} (${percent}% giá thuê)</option>`;
            }).join("");
        }

        function updateDepositPreview(form, booking) {
            if (!form || !booking) {
                return;
            }
            const preview = form.querySelector("[data-accept-deposit-preview]");
            const deposit = state.deposits.find((item) => String(item.idDepositType) === String(form.elements.depositTypeId.value));
            const percent = Number(deposit?.percentDeposit || 0);
            const total = Number(booking.totalAmount || 0);
            const depositAmount = total * percent / 100;
            preview.innerHTML = `
                <span>Cọc cần thu (${percent}%)</span>
                <strong>${YCI.money(depositAmount)}</strong>
                <small>Còn lại sau cọc: ${YCI.money(total - depositAmount)}</small>
            `;
        }

        function renderModal() {
            const booking = state.selected;
            if (!booking) return;

            const customer = booking.userBookingDTO || {};
            const detailOptions = (booking.bookingDetailDTOS || []).map((detail) => `
                <option value="${detail.idBookingDetail}">${YCI.escapeHtml(detail.productBookingDTO?.nameProduct || `Chi tiết #${detail.idBookingDetail}`)}</option>
            `).join("");
            const payments = booking.paymentBookingDTOS || [];
            const finance  = financeOf(booking);
            // Đã cọc = có ít nhất một khoản thanh toán ở trạng thái PAID
            const depositPaid = payments.some((p) => (p.paymentStatus || "").toUpperCase() === "PAID");

            // ── Header ──
            modalEye.textContent = `Đơn thuê ${booking.bookingCode || ('#' + booking.idBooking)}`;
            modalTitle.textContent = customer.fullName || "Khách hàng";
            modalMeta.innerHTML = `
                <span class="status-pill ${YCI.statusClass(booking.status)}">${YCI.escapeHtml(YCI.statusLabel(booking.status))}</span>
                <span class="bmodal-date">${YCI.formatDate(booking.timeStart)} → ${YCI.formatDate(booking.timeEnd)}</span>
            `;

            // ── Body ──
            let html = `
                <!-- Finance summary -->
                <div class="bmodal-finance-row">
                    <div class="bmodal-fin-card">
                        <span>Tổng đơn</span>
                        <strong>${YCI.money(booking.totalAmount)}</strong>
                    </div>
                    <div class="bmodal-fin-card good">
                        <span>Đã thu</span>
                        <strong>${YCI.money(finance.paid)}</strong>
                    </div>
                    <div class="bmodal-fin-card ${finance.remain > 0 ? 'warn' : 'good'}">
                        <span>Còn lại</span>
                        <strong>${YCI.money(finance.remain)}</strong>
                    </div>
                </div>

                <!-- Two-column layout — balanced -->
                <div class="bmodal-cols">

                    <!-- LEFT: Khách hàng + Thanh toán -->
                    <div class="bmodal-col">

                        <!-- Customer info -->
                        <div class="bmodal-section">
                            <h3 class="bmodal-section-title">
                                <i data-lucide="user"></i> Khách hàng
                            </h3>
                            <div class="bmodal-info-list">
                                <div class="bmodal-info-row"><span>Họ tên</span><strong>${YCI.escapeHtml(customer.fullName || "—")}</strong></div>
                                <div class="bmodal-info-row"><span>Điện thoại</span><strong>${YCI.escapeHtml(customer.phone || "—")}</strong></div>
                                <div class="bmodal-info-row"><span>Email</span><strong>${YCI.escapeHtml(customer.email || "—")}</strong></div>
                            </div>
                        </div>

                        <!-- Payment history -->
                        <div class="bmodal-section">
                            <h3 class="bmodal-section-title">
                                <i data-lucide="receipt"></i> Lịch sử thanh toán
                            </h3>
                            <div class="bmodal-payment-list">
                                ${payments.map(p => {
                                    const isSurcharge = p.note && p.note.includes("Phụ thu");
                                    const isDeposit   = p.note && p.note.includes("cọc");
                                    const tagColor    = isSurcharge ? "#b45309" : isDeposit ? "#0369a1" : "#065f46";
                                    const tagBg       = isSurcharge ? "#fef3c7"  : isDeposit ? "#e0f2fe"  : "#e6fbf1";
                                    const tag         = p.note
                                        ? `<span style="font-size:11px;padding:1px 7px;border-radius:10px;background:${tagBg};color:${tagColor};border:1px solid ${tagBg};font-weight:600;">${YCI.escapeHtml(p.note)}</span>`
                                        : "";
                                    return `<div class="bmodal-payment-item">
                                        <div>
                                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                                <strong>${YCI.money(p.price)}</strong>
                                                ${tag}
                                            </div>
                                            <span>${YCI.escapeHtml(p.paymentMethod || "")} · ${YCI.formatDate(p.paidAt)}</span>
                                        </div>
                                        <span class="price-chip">Còn ${YCI.money(p.remainAmount)}</span>
                                    </div>`;
                                }).join("") || `<p class="muted" style="font-size:13px;">Chưa ghi nhận thanh toán.</p>`}
                            </div>
                        </div>

                    </div>

                    <!-- RIGHT: Thiết bị + Hành động -->
                    <div class="bmodal-col">

                        <!-- Devices -->
                        <div class="bmodal-section">
                            <h3 class="bmodal-section-title">
                                <i data-lucide="camera"></i> Thiết bị thuê
                            </h3>
                            <div class="bmodal-device-list">
                                ${(booking.bookingDetailDTOS || []).map(d => `
                                    <div class="bmodal-device-item">
                                        <div class="bmodal-device-info">
                                            <strong>${YCI.escapeHtml(d.productBookingDTO?.nameProduct || "Thiết bị")}</strong>
                                            <span>${YCI.escapeHtml(d.productBookingDTO?.serialNumber || "")} · ${YCI.escapeHtml(d.productBookingDTO?.brand || "")}</span>
                                        </div>
                                        <div class="bmodal-device-price">${YCI.money(d.totalPrice)}</div>
                                    </div>
                                `).join("") || `<p class="muted">Không có thiết bị.</p>`}
                            </div>
                        </div>

                        <!-- Quick action -->
                        <div class="bmodal-section bmodal-action-section accent-pink" id="bmodalActionSection">
                            <h3 class="bmodal-section-title">
                                <i data-lucide="clipboard-check"></i> Hành động
                            </h3>
                            ${(() => {
                                const isWaiting = booking.status === "WAITING ACCEPT"
                                    || booking.status === "WAITING_ACCEPT"
                                    || booking.status === "PENDING_DEPOSIT";
                                if (isWaiting && depositPaid) {
                                    return `
                                        <button class="button primary" type="button" id="btnQuickAccept" style="width:100%;">
                                            <i data-lucide="circle-check"></i> Xác nhận đơn
                                        </button>
                                        <small class="field-note" style="margin-top:8px;display:block;text-align:center;">
                                            Đơn sẽ được duyệt tự động với mức cọc mặc định.
                                        </small>
                                    `;
                                }
                                if (isWaiting && !depositPaid) {
                                    return `
                                        <div class="bmodal-info-list">
                                            <div class="bmodal-info-row">
                                                <span>Trạng thái hiện tại</span>
                                                <strong><span class="status-pill ${YCI.statusClass(booking.status)}">${YCI.escapeHtml(YCI.statusLabel(booking.status))}</span></strong>
                                            </div>
                                        </div>
                                        <p class="muted" style="font-size:13px;margin-top:10px;">
                                            Khách chưa thanh toán cọc. Chưa thể xác nhận đơn lúc này.
                                        </p>
                                    `;
                                }
                                return `
                                    <div class="bmodal-info-list">
                                        <div class="bmodal-info-row">
                                            <span>Trạng thái hiện tại</span>
                                            <strong><span class="status-pill ${YCI.statusClass(booking.status)}">${YCI.escapeHtml(YCI.statusLabel(booking.status))}</span></strong>
                                        </div>
                                    </div>
                                    ${booking.status === "ACCEPTED" ? `
                                        <!-- Toggle thu CCCD -->
                                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;background:#f9f0f5;border:1px solid rgba(233,30,131,.2);border-radius:10px;margin-bottom:12px;user-select:none;">
                                            <span style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;">
                                                <input type="checkbox" id="toggleCCCD" style="opacity:0;width:0;height:0;position:absolute;">
                                                <span id="toggleCCCDTrack" style="position:absolute;inset:0;border-radius:999px;background:#ddd;transition:background .2s;"></span>
                                                <span id="toggleCCCDThumb" style="position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:transform .2s;"></span>
                                            </span>
                                            <span style="font-size:13px;font-weight:600;color:var(--ink);">Đã thu CCCD / giấy tờ của khách</span>
                                        </label>
                                        <button class="button primary" type="button" id="btnStartRenting" style="width:100%;opacity:.4;pointer-events:none;" disabled>
                                            <i data-lucide="play-circle"></i> Bắt đầu cho thuê
                                        </button>
                                        <small class="field-note" style="margin-top:8px;display:block;text-align:center;">
                                            Xác nhận đã thu CCCD để mở nút bên trên.
                                        </small>
                                    ` : booking.status === "RENTING" ? (() => {
                                        // Tính giờ trễ
                                        const timeEnd = booking.timeEnd ? new Date(booking.timeEnd) : null;
                                        const now = new Date();
                                        const diffMs = timeEnd ? now - timeEnd : 0;
                                        const diffMins = Math.floor(diffMs / 60000);
                                        const lateHours = diffMs > 0 ? Math.ceil(diffMs / 3600000) : 0;
                                        const isOverdue = diffMs > 0;
                                        const isOver1h  = diffMs > 3600000;

                                        // Tính phí/giờ = tổng đơn / số giờ thuê (ước lượng)
                                        const rentHours = timeEnd && booking.timeStart
                                            ? Math.max(1, (new Date(booking.timeEnd) - new Date(booking.timeStart)) / 3600000)
                                            : 1;
                                        const feePerHour = Math.round(booking.totalAmount / rentHours / 1000) * 1000;
                                        const estimatedLateFee = lateHours * feePerHour;

                                        return `
                                        ${isOverdue ? `
                                            <div style="background:${isOver1h ? '#fff0f0' : '#fff8e1'};border:1px solid ${isOver1h ? '#ffb3b3' : '#f3d27a'};border-radius:10px;padding:10px 12px;margin-bottom:12px;">
                                                <div style="font-size:13px;font-weight:700;color:${isOver1h ? '#bd1f54' : '#b66a00'};">
                                                    ${isOver1h ? '🔴' : '⚠️'} Trễ ${diffMins} phút (${lateHours} giờ)
                                                </div>
                                                ${isOver1h ? `<div style="font-size:12px;color:#bd1f54;margin-top:4px;">Phí trễ ước tính: ~${YCI.money(estimatedLateFee)} (${YCI.money(feePerHour)}/giờ)</div>` : ''}
                                            </div>
                                        ` : ''}
                                        <input type="hidden" id="returnLateHours" value="${lateHours}">
                                        <input type="hidden" id="returnFeePerHour" value="${feePerHour}">
                                        <button class="button primary" type="button" id="btnOpenReturnWizard" style="width:100%;">
                                            <i data-lucide="package-check"></i> Bắt đầu quy trình trả máy
                                        </button>
                                        <small class="field-note" style="margin-top:8px;display:block;text-align:center;">
                                            Nhân viên xác nhận từng bước: kiểm tra → thanh toán → hoàn tất.
                                        </small>`;
                                    })() : `
                                        <p class="muted" style="font-size:13px;margin-top:10px;">
                                            Đơn đã được xử lý. Không cần thao tác thêm.
                                        </p>
                                    `}
                                `;
                            })()}
                        </div>

                    </div>
                </div>

                <!-- Handover checklist (full width) -->
                <div class="bmodal-checklist">
                    <div class="bmodal-checklist-item"><i data-lucide="scan-line"></i><span>Đối chiếu serial và phụ kiện trước khi giao thiết bị</span></div>
                    <div class="bmodal-checklist-item"><i data-lucide="receipt"></i><span>Ghi nhận cọc, phí phát sinh và thanh toán còn lại</span></div>
                </div>
            `;

            if (readOnly) {
                html = `
                    <div class="view-only-note" style="margin-bottom:16px;">
                        <i data-lucide="eye"></i>
                        <span>Quản trị viên chỉ xem thông tin đơn tại màn này.</span>
                    </div>
                ` + html;
            }

            modalBody.innerHTML = html;

            // Remove forms if readOnly
            if (readOnly) {
                modalBody.querySelectorAll("form").forEach(f => f.remove());
                modalBody.querySelectorAll(".bmodal-action-section").forEach(s => s.remove());
            }

            openModal();
            YCI.iconRefresh();

            // Wire toggle CCCD → mở/tắt nút Bắt đầu cho thuê
            const toggleCCCD  = document.getElementById("toggleCCCD");
            const toggleTrack = document.getElementById("toggleCCCDTrack");
            const toggleThumb = document.getElementById("toggleCCCDThumb");
            const rentBtn     = document.getElementById("btnStartRenting");
            if (toggleCCCD && rentBtn) {
                toggleCCCD.addEventListener("change", () => {
                    const on = toggleCCCD.checked;
                    toggleTrack.style.background  = on ? "var(--teal)" : "#ddd";
                    toggleThumb.style.transform   = on ? "translateX(18px)" : "translateX(0)";
                    rentBtn.disabled              = !on;
                    rentBtn.style.opacity         = on ? "1"   : ".4";
                    rentBtn.style.pointerEvents   = on ? "auto" : "none";
                });
            }
        }

        table.addEventListener("click", (event) => {
            const row = event.target.closest("[data-booking-row]");
            if (!row) return;
            state.selected = state.bookings.find((booking) => Number(booking.idBooking) === Number(row.dataset.bookingRow));
            if (state.selected) renderModal();
        });
        search?.addEventListener("input", () => {
            state.search = search.value;
            pg.reset(); render();
        });
        statusFilter?.addEventListener("change", () => {
            state.status = statusFilter.value;
            pg.reset(); render();
        });
        statusTabs?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-booking-status-tab]");
            if (!button) return;
            state.status = button.dataset.bookingStatusTab || "";
            if (statusFilter) statusFilter.value = state.status;
            pg.reset(); render();
        });
        document.getElementById("pgBookings")?.addEventListener("pg:change", () => render());
        YCI.qs("[data-refresh-admin-bookings]")?.addEventListener("click", () => load().catch((error) => YCI.toast(error.message, "error")));

        // Quick accept button
        modalBody?.addEventListener("click", async (event) => {
            const btn = event.target.closest("#btnQuickAccept");
            if (!btn) return;
            btn.disabled = true;
            try {
                const deposit = state.deposits[0];
                const payment = state.payments[0];
                if (!deposit || !payment) {
                    YCI.toast("Cần cấu hình loại cọc và phương thức thanh toán trước.", "error");
                    btn.disabled = false; return;
                }
                await YCI.apiJson("/api/admin/booking/accept", "PUT", {
                    bookingId: state.selected.idBooking,
                    depositTypeId: deposit.idDepositType,
                    paymentMethodId: payment.idPaymentsMethod
                });
                YCI.toast("Đã xác nhận đơn.", "success");
                closeModal();
                await load();
            } catch (error) {
                YCI.toast(error.message, "error");
                btn.disabled = false;
            }
        });

        // Nút "Bắt đầu cho thuê" — chuyển ACCEPTED → RENTING
        modalBody?.addEventListener("click", async (event) => {
            const btn = event.target.closest("#btnStartRenting");
            if (!btn) return;
            btn.disabled = true;
            try {
                const rentingStatus = state.statuses.find(s =>
                    s.statusCode === "RENTING" || s.statusCode === "Đang thuê"
                );
                if (!rentingStatus) {
                    YCI.toast("Không tìm thấy trạng thái RENTING trong hệ thống.", "error");
                    btn.disabled = false; return;
                }
                await YCI.apiJson("/api/admin/booking/status", "PUT", {
                    bookingId: state.selected.idBooking,
                    statusId:  rentingStatus.idStatus
                });
                YCI.toast("Đã chuyển sang Đang thuê.", "success");
                closeModal();
                await load();
            } catch (error) {
                YCI.toast(error.message, "error");
                btn.disabled = false;
            }
        });

        // ── Wizard 3 bước trả máy ───────────────────────────────
        modalBody?.addEventListener("click", (event) => {
            const btn = event.target.closest("#btnOpenReturnWizard");
            if (!btn) return;
            openReturnWizard(state.selected);
        });

        function openReturnWizard(booking) {
            const timeEnd    = booking.timeEnd ? new Date(booking.timeEnd) : null;
            const now        = new Date();
            const diffMs     = timeEnd ? Math.max(0, now - timeEnd) : 0;
            const lateHours  = Math.ceil(diffMs / 3600000);
            const rentHours  = (timeEnd && booking.timeStart)
                ? Math.max(1, (new Date(booking.timeEnd) - new Date(booking.timeStart)) / 3600000) : 1;
            const feePerHour = Math.round(booking.totalAmount / rentHours / 1000) * 1000;
            const lateFee    = lateHours * feePerHour;
            const devices    = booking.bookingDetailDTOS || [];
            const codeLabel  = booking.bookingCode || ('#' + booking.idBooking);

            // Tạo modal wizard nếu chưa có
            if (!document.getElementById("returnWizardModal")) {
                document.body.insertAdjacentHTML("beforeend", `
                <div class="bmodal-overlay" id="returnWizardModal" hidden aria-modal="true" role="dialog">
                    <div class="bmodal-box" style="max-width:600px;">
                        <div class="bmodal-header">
                            <div class="bmodal-title-group">
                                <p class="eyebrow" id="wizardEyebrow">Quy trình trả máy</p>
                                <h2 id="wizardTitle">—</h2>
                            </div>
                            <button class="bmodal-close" type="button" id="returnWizardClose" aria-label="Đóng">
                                <i data-lucide="x"></i>
                            </button>
                        </div>
                        <div id="wizardStepBar" style="display:flex;gap:0;padding:0 28px;border-bottom:1px solid var(--line);"></div>
                        <div class="bmodal-body" id="wizardBody" style="padding:22px 28px 24px;"></div>
                    </div>
                </div>`);
                document.getElementById("returnWizardClose")?.addEventListener("click", closeReturnWizard);
                document.getElementById("returnWizardModal")?.addEventListener("click", (e) => {
                    if (e.target === document.getElementById("returnWizardModal")) closeReturnWizard();
                });
                YCI.iconRefresh();
            }

            const wiz = { step: 1, lateHours, feePerHour, lateFee, cleaningFee: 0, damageFee: 0, description: "" };

            function closeReturnWizard() {
                const m = document.getElementById("returnWizardModal");
                if (!m) return;
                m.classList.remove("is-open");
                m.addEventListener("transitionend", () => {
                    m.hidden = true;
                    if (modal.hidden) document.body.classList.remove("bmodal-open");
                }, { once: true });
            }

            function renderStepBar() {
                const steps = [
                    { label: "Kiểm tra thiết bị",   icon: "scan-line" },
                    { label: "Tính toán thanh toán", icon: "receipt" },
                    { label: "Xác nhận hoàn tất",    icon: "check-circle-2" }
                ];
                document.getElementById("wizardStepBar").innerHTML = steps.map((s, i) => {
                    const done    = wiz.step > i + 1;
                    const active  = wiz.step === i + 1;
                    const color   = done ? "#1c8f65" : active ? "var(--teal-dark)" : "var(--muted)";
                    const bgCirc  = done ? "#1c8f65"  : active ? "var(--teal)"    : "var(--line)";
                    const border  = done ? "#1c8f65"  : active ? "var(--teal)"    : "transparent";
                    return `<div style="flex:1;text-align:center;padding:10px 4px;
                        font-size:11px;font-weight:700;color:${color};
                        border-bottom:3px solid ${border};transition:all .2s;">
                        <div style="display:inline-flex;align-items:center;justify-content:center;
                            width:24px;height:24px;border-radius:50%;margin-bottom:4px;font-size:11px;
                            background:${bgCirc};color:${done || active ? '#fff' : 'var(--muted)'};">
                            ${done ? '✓' : i + 1}
                        </div><br>${s.label}
                    </div>`;
                }).join(`<div style="flex:0 0 1px;align-self:center;height:1px;background:var(--line);"></div>`);
            }

            // ── BƯỚC 1: Kiểm tra thiết bị ──────────────────────
            function renderStep1() {
                document.getElementById("wizardBody").innerHTML = `
                    <p style="font-size:13px;color:var(--muted);margin:0 0 14px;">
                        Xác nhận đã nhận lại đầy đủ thiết bị từ khách hàng.
                    </p>
                    <div style="display:grid;gap:8px;margin-bottom:16px;">
                        ${devices.map((d, i) => `
                        <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                            border:1px solid var(--line);border-radius:10px;cursor:pointer;
                            background:#fff7fb;user-select:none;">
                            <input type="checkbox" id="chkDevice${i}" checked
                                style="width:18px;height:18px;accent-color:var(--teal);flex-shrink:0;">
                            <div style="flex:1;min-width:0;">
                                <strong style="font-size:14px;">
                                    ${YCI.escapeHtml(d.productBookingDTO?.nameProduct || 'Thiết bị')}
                                </strong>
                                <p style="font-size:12px;color:var(--muted);margin:2px 0 0;">
                                    ${YCI.escapeHtml(d.productBookingDTO?.serialNumber || '')}
                                    ${d.productBookingDTO?.brand ? '· ' + YCI.escapeHtml(d.productBookingDTO.brand) : ''}
                                </p>
                            </div>
                            <span style="font-size:13px;color:var(--teal-dark);font-weight:700;white-space:nowrap;">
                                ${YCI.money(d.totalPrice)}
                            </span>
                        </label>`).join("")}
                    </div>
                    <label style="font-size:12px;font-weight:700;color:var(--muted);display:grid;gap:5px;margin-bottom:20px;">
                        GHI CHÚ TÌNH TRẠNG
                        <textarea id="wizDescInput" rows="2"
                            placeholder="VD: Máy sạch, đủ phụ kiện, không hư hỏng..."
                            style="padding:10px 12px;border:1px solid var(--line);border-radius:9px;
                                   font-size:13px;resize:vertical;font-family:inherit;"
                        >${wiz.description}</textarea>
                    </label>
                    <div style="display:flex;justify-content:flex-end;">
                        <button class="button primary" type="button" id="wizNext1" style="min-width:140px;">
                            Tiếp theo <i data-lucide="arrow-right" style="width:15px;height:15px;"></i>
                        </button>
                    </div>`;
                YCI.iconRefresh();
                document.getElementById("wizNext1")?.addEventListener("click", () => {
                    wiz.description = document.getElementById("wizDescInput")?.value?.trim() || "";
                    wiz.step = 2; renderStepBar(); renderStep2();
                });
            }

            // ── BƯỚC 2: Tính toán thanh toán ───────────────────
            function calcTotals() {
                const extra      = wiz.lateFee + wiz.cleaningFee + wiz.damageFee;
                const alreadyPaid = (booking.paymentBookingDTOS || [])
                    .filter(p => (p.paymentStatus || "").toUpperCase() === "PAID")
                    .reduce((s, p) => s + Number(p.price || 0), 0);
                const grandTotal = booking.totalAmount + extra;
                const stillOwed  = Math.max(0, grandTotal - alreadyPaid);
                return { extra, alreadyPaid, grandTotal, stillOwed };
            }

            function renderStep2() {
                const { extra, alreadyPaid, grandTotal, stillOwed } = calcTotals();
                document.getElementById("wizardBody").innerHTML = `
                    <p style="font-size:13px;color:var(--muted);margin:0 0 14px;">
                        Nhập phí phát sinh (nếu có) — tổng thanh toán sẽ cập nhật tự động.
                    </p>

                    ${wiz.lateHours > 0 ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:10px 14px;background:#fff0f0;border:1px solid #ffb3b3;
                        border-radius:10px;margin-bottom:10px;">
                        <span style="font-size:13px;color:#bd1f54;font-weight:600;">
                            ⏰ Phí trễ ${wiz.lateHours}h × ${YCI.money(wiz.feePerHour)}/giờ
                        </span>
                        <strong style="color:#bd1f54;">${YCI.money(wiz.lateFee)}</strong>
                    </div>` : ''}

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                        <label style="font-size:12px;font-weight:700;color:var(--muted);display:grid;gap:5px;">
                            PHÍ VỆ SINH (nếu có)
                            <input type="number" id="wizCleanInput" min="0" step="1000" value="${wiz.cleaningFee}"
                                style="padding:9px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px;">
                        </label>
                        <label style="font-size:12px;font-weight:700;color:var(--muted);display:grid;gap:5px;">
                            PHÍ HƯ HỎNG (nếu có)
                            <input type="number" id="wizDamageInput" min="0" step="1000" value="${wiz.damageFee}"
                                style="padding:9px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px;">
                        </label>
                    </div>

                    <!-- Bảng tổng thanh toán -->
                    <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:12px;
                        padding:14px 16px;margin-bottom:20px;">
                        <p style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
                            color:var(--muted);margin:0 0 10px;">Tổng kết thanh toán</p>
                        <div style="display:grid;gap:6px;font-size:13px;">
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:var(--muted);">Tiền thuê gốc</span>
                                <strong>${YCI.money(booking.totalAmount)}</strong>
                            </div>
                            ${wiz.lateHours > 0 ? `
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:#bd1f54;">Phí trễ giờ</span>
                                <strong style="color:#bd1f54;">${YCI.money(wiz.lateFee)}</strong>
                            </div>` : ''}
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:var(--muted);">Phí vệ sinh + hư hỏng</span>
                                <strong id="w2ExtraRow">${YCI.money(wiz.cleaningFee + wiz.damageFee)}</strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:8px 0;
                                border-top:1px solid var(--line);margin-top:4px;">
                                <span style="font-weight:800;font-size:14px;">Tổng cộng</span>
                                <strong id="w2GrandRow" style="font-size:16px;color:var(--teal-dark);">
                                    ${YCI.money(grandTotal)}
                                </strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:var(--muted);">Đã thu (cọc)</span>
                                <strong style="color:#1c8f65;">- ${YCI.money(alreadyPaid)}</strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:10px 12px;
                                border-radius:10px;margin-top:4px;
                                background:${stillOwed > 0 ? '#fff0f0' : '#e6fbf1'};
                                border:1px solid ${stillOwed > 0 ? '#ffb3b3' : '#b7f5d8'};">
                                <span style="font-weight:800;color:${stillOwed > 0 ? '#bd1f54' : '#1c8f65'};">
                                    ${stillOwed > 0 ? '💰 Thu thêm từ khách' : '✅ Đã đủ'}
                                </span>
                                <strong id="w2OwedRow" style="font-size:16px;color:${stillOwed > 0 ? '#bd1f54' : '#1c8f65'};">
                                    ${YCI.money(stillOwed)}
                                </strong>
                            </div>
                        </div>
                    </div>

                    <div style="display:flex;justify-content:space-between;gap:10px;">
                        <button class="button ghost" type="button" id="wizBack2">
                            <i data-lucide="arrow-left" style="width:15px;height:15px;"></i> Quay lại
                        </button>
                        <button class="button primary" type="button" id="wizNext2" style="min-width:160px;">
                            Xem tổng kết <i data-lucide="arrow-right" style="width:15px;height:15px;"></i>
                        </button>
                    </div>`;
                YCI.iconRefresh();

                function liveRecalc() {
                    wiz.cleaningFee = Number(document.getElementById("wizCleanInput")?.value || 0);
                    wiz.damageFee   = Number(document.getElementById("wizDamageInput")?.value || 0);
                    const { extra: ex, grandTotal: gt, stillOwed: ow } = calcTotals();
                    const el = (id) => document.getElementById(id);
                    if (el("w2ExtraRow"))  el("w2ExtraRow").textContent  = YCI.money(wiz.cleaningFee + wiz.damageFee);
                    if (el("w2GrandRow"))  el("w2GrandRow").textContent  = YCI.money(gt);
                    if (el("w2OwedRow")) {
                        el("w2OwedRow").textContent = YCI.money(ow);
                        el("w2OwedRow").style.color = ow > 0 ? "#bd1f54" : "#1c8f65";
                    }
                }
                document.getElementById("wizCleanInput")?.addEventListener("input", liveRecalc);
                document.getElementById("wizDamageInput")?.addEventListener("input", liveRecalc);

                document.getElementById("wizBack2")?.addEventListener("click", () => {
                    wiz.step = 1; renderStepBar(); renderStep1();
                });
                document.getElementById("wizNext2")?.addEventListener("click", () => {
                    wiz.cleaningFee = Number(document.getElementById("wizCleanInput")?.value || 0);
                    wiz.damageFee   = Number(document.getElementById("wizDamageInput")?.value || 0);
                    wiz.step = 3; renderStepBar(); renderStep3();
                });
            }

            // ── BƯỚC 3: Xác nhận hoàn tất ──────────────────────
            function renderStep3() {
                const { alreadyPaid, grandTotal, stillOwed } = calcTotals();
                const totalExtra = wiz.lateFee + wiz.cleaningFee + wiz.damageFee;

                document.getElementById("wizardBody").innerHTML = `
                    <p style="font-size:13px;color:var(--muted);margin:0 0 14px;">
                        Xem lại và chọn phương thức thanh toán trước khi hoàn tất đơn.
                    </p>

                    <!-- Tóm tắt -->
                    <div style="background:#f7fffb;border:1.5px solid #1c8f65;border-radius:12px;
                        padding:14px 16px;margin-bottom:16px;">
                        <p style="font-size:12px;font-weight:800;letter-spacing:.08em;
                            text-transform:uppercase;color:#1c8f65;margin:0 0 10px;">
                            ✅ Tóm tắt đơn ${YCI.escapeHtml(codeLabel)}
                        </p>
                        <div style="display:grid;gap:6px;font-size:13px;">
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:var(--muted);">Khách hàng</span>
                                <strong>${YCI.escapeHtml((booking.userBookingDTO || {}).fullName || '—')}</strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:var(--muted);">Tiền thuê gốc</span>
                                <strong>${YCI.money(booking.totalAmount)}</strong>
                            </div>
                            ${totalExtra > 0 ? `
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:#bd1f54;">Phụ phí</span>
                                <strong style="color:#bd1f54;">+${YCI.money(totalExtra)}</strong>
                            </div>` : ''}
                            <div style="display:flex;justify-content:space-between;
                                padding:8px 0;border-top:1px solid #b7f5d8;margin-top:2px;">
                                <span style="font-weight:800;">Tổng thu</span>
                                <strong style="font-size:15px;color:var(--teal-dark);">
                                    ${YCI.money(grandTotal)}
                                </strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:var(--muted);">Đã cọc</span>
                                <strong style="color:#1c8f65;">- ${YCI.money(alreadyPaid)}</strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;
                                padding:10px 12px;border-radius:10px;margin-top:2px;
                                background:${stillOwed > 0 ? '#fff0f0' : '#e6fbf1'};
                                border:1px solid ${stillOwed > 0 ? '#ffb3b3' : '#b7f5d8'};">
                                <span style="font-weight:800;
                                    color:${stillOwed > 0 ? '#bd1f54' : '#1c8f65'};">
                                    ${stillOwed > 0 ? '💰 Thu thêm từ khách' : '✅ Đã thanh toán đủ'}
                                </span>
                                <strong style="font-size:16px;
                                    color:${stillOwed > 0 ? '#bd1f54' : '#1c8f65'};">
                                    ${YCI.money(stillOwed)}
                                </strong>
                            </div>
                            ${wiz.description ? `
                            <div style="display:flex;justify-content:space-between;gap:12px;">
                                <span style="color:var(--muted);flex-shrink:0;">Ghi chú</span>
                                <span style="text-align:right;">
                                    ${YCI.escapeHtml(wiz.description)}
                                </span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Chọn phương thức thanh toán -->
                    ${stillOwed > 0 ? `
                    <p style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;
                        color:var(--muted);margin:0 0 10px;">Phương thức thu ${YCI.money(stillOwed)}</p>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
                        <label id="optCash" style="display:flex;flex-direction:column;align-items:center;
                            gap:8px;padding:16px 12px;border:2px solid var(--line);border-radius:12px;
                            cursor:pointer;transition:all .18s;background:#fff;user-select:none;">
                            <input type="radio" name="payMethod" value="cash"
                                style="position:absolute;opacity:0;pointer-events:none;">
                            <span style="font-size:26px;">💵</span>
                            <span style="font-size:14px;font-weight:700;color:var(--ink);">Tiền mặt</span>
                            <span style="font-size:11px;color:var(--muted);">Thu trực tiếp tại quầy</span>
                        </label>
                        <label id="optTransfer" style="display:flex;flex-direction:column;align-items:center;
                            gap:8px;padding:16px 12px;border:2px solid var(--line);border-radius:12px;
                            cursor:pointer;transition:all .18s;background:#fff;user-select:none;">
                            <input type="radio" name="payMethod" value="transfer"
                                style="position:absolute;opacity:0;pointer-events:none;">
                            <span style="font-size:26px;">🏦</span>
                            <span style="font-size:14px;font-weight:700;color:var(--ink);">Chuyển khoản</span>
                            <span style="font-size:11px;color:var(--muted);">Khách CK trước khi nhận máy</span>
                        </label>
                    </div>
                    <!-- Xác nhận đã thu -->
                    <label id="confirmPayLabel" style="display:none;align-items:center;gap:10px;
                        padding:11px 14px;background:#f0fdf9;border:1px solid #6ee7b7;
                        border-radius:10px;margin-bottom:16px;cursor:pointer;user-select:none;">
                        <input type="checkbox" id="chkPayConfirm"
                            style="width:18px;height:18px;accent-color:#1c8f65;flex-shrink:0;">
                        <span id="confirmPayText" style="font-size:13px;font-weight:600;color:#065f46;">
                            Đã nhận tiền mặt từ khách
                        </span>
                    </label>` : `
                    <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;
                        background:#e6fbf1;border:1px solid #6ee7b7;border-radius:10px;margin-bottom:16px;">
                        <span style="font-size:20px;">✅</span>
                        <span style="font-size:13px;font-weight:600;color:#065f46;">
                            Khách đã thanh toán đủ — không cần thu thêm.
                        </span>
                    </div>`}

                    <!-- Nút hành động -->
                    <div style="display:flex;justify-content:space-between;gap:10px;">
                        <button class="button ghost" type="button" id="wizBack3">
                            <i data-lucide="arrow-left" style="width:15px;height:15px;"></i> Quay lại
                        </button>
                        <button class="button primary" type="button" id="wizConfirm"
                            style="min-width:180px;${stillOwed > 0 ? 'opacity:.4;pointer-events:none;' : ''}"
                            ${stillOwed > 0 ? 'disabled' : ''}>
                            <i data-lucide="check-circle-2" style="width:16px;height:16px;"></i>
                            Hoàn tất đơn
                        </button>
                    </div>`;

                YCI.iconRefresh();

                // Wire payment option selection
                if (stillOwed > 0) {
                    const optCash     = document.getElementById("optCash");
                    const optTransfer = document.getElementById("optTransfer");
                    const confirmLbl  = document.getElementById("confirmPayLabel");
                    const confirmChk  = document.getElementById("chkPayConfirm");
                    const confirmTxt  = document.getElementById("confirmPayText");
                    const confirmBtn  = document.getElementById("wizConfirm");

                    // Container hiện nội dung phụ (bộ đếm tiền mặt / QR CK)
                    confirmLbl.insertAdjacentHTML("beforebegin",
                        `<div id="payDetailBox" style="margin-bottom:12px;"></div>`);
                    const payDetailBox = document.getElementById("payDetailBox");

                    function renderCashPanel() {
                        const denoms = [500000,200000,100000,50000,20000,10000,5000,2000,1000];
                        let received = 0;

                        function updateConfirm() {
                            const enough = received >= stillOwed;
                            if (enough) {
                                confirmTxt.textContent   = received === stillOwed
                                    ? "Đã nhận đủ tiền"
                                    : "Đã nhận đủ, tiền thối: " + YCI.money(received - stillOwed);
                                confirmLbl.style.display = "flex";
                            } else {
                                confirmLbl.style.display = "none";
                                confirmChk.checked       = false;
                                confirmBtn.disabled      = true;
                                confirmBtn.style.opacity = ".4";
                                confirmBtn.style.pointerEvents = "none";
                            }
                        }

                        function renderCash() {
                            const change = received - stillOwed;
                            payDetailBox.innerHTML = `
                                <div style="background:#f9f5ff;border:1px solid #d8b4fe;
                                    border-radius:12px;padding:14px;">
                                    <p style="font-size:12px;font-weight:800;text-transform:uppercase;
                                        letter-spacing:.07em;color:#7c3aed;margin:0 0 10px;">💵 Tiền mặt</p>

                                    <!-- Nút nhanh -->
                                    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;">
                                        <button type="button" id="btnPayExact"
                                            style="padding:7px 14px;border-radius:9px;border:2px solid #7c3aed;
                                            background:#7c3aed;color:#fff;font-size:13px;font-weight:700;
                                            cursor:pointer;white-space:nowrap;">
                                            ✅ Trả đủ ${YCI.money(stillOwed)}
                                        </button>
                                        ${denoms.filter(d => d >= 10000).map(d => `
                                        <button type="button" data-add="${d}"
                                            style="padding:7px 12px;border-radius:9px;border:1px solid #c4b5fd;
                                            background:#ede9fe;color:#5b21b6;font-size:13px;font-weight:600;
                                            cursor:pointer;white-space:nowrap;">
                                            +${d >= 1000000 ? (d/1000000)+'M' : (d/1000)+'k'}
                                        </button>`).join("")}
                                        <button type="button" id="btnResetCash"
                                            style="padding:7px 12px;border-radius:9px;border:1px solid #fca5a5;
                                            background:#fff0f0;color:#b91c1c;font-size:13px;font-weight:600;
                                            cursor:pointer;">↺ Reset</button>
                                    </div>

                                    <!-- Tổng kết -->
                                    <div style="display:grid;gap:6px;font-size:13px;">
                                        <div style="display:flex;justify-content:space-between;align-items:center;">
                                            <span style="color:var(--muted);">Khách đưa</span>
                                            <strong style="font-size:16px;color:#7c3aed;">${YCI.money(received)}</strong>
                                        </div>
                                        <div style="display:flex;justify-content:space-between;align-items:center;">
                                            <span style="color:var(--muted);">Cần thu</span>
                                            <strong>${YCI.money(stillOwed)}</strong>
                                        </div>
                                        <div style="display:flex;justify-content:space-between;align-items:center;
                                            padding:8px 12px;border-radius:9px;
                                            background:${received === 0 ? '#f5f5f5' : change >= 0 ? '#e6fbf1' : '#fff0f0'};
                                            border:1px solid ${received === 0 ? '#e0e0e0' : change >= 0 ? '#6ee7b7' : '#ffb3b3'};">
                                            <span style="font-weight:700;color:${received === 0 ? '#aaa' : change >= 0 ? '#065f46' : '#bd1f54'};">
                                                ${received === 0 ? 'Chưa nhận tiền' : change >= 0 ? '💰 Tiền thối' : '⚠️ Còn thiếu'}
                                            </span>
                                            <strong style="font-size:16px;color:${received === 0 ? '#aaa' : change >= 0 ? '#065f46' : '#bd1f54'};">
                                                ${received === 0 ? '—' : YCI.money(Math.abs(change))}
                                            </strong>
                                        </div>
                                    </div>
                                </div>`;

                            document.getElementById("btnPayExact")?.addEventListener("click", () => {
                                received = stillOwed;
                                renderCash(); updateConfirm();
                            });
                            document.getElementById("btnResetCash")?.addEventListener("click", () => {
                                received = 0;
                                renderCash(); updateConfirm();
                            });
                            payDetailBox.querySelectorAll("[data-add]").forEach(btn => {
                                btn.addEventListener("click", () => {
                                    received += Number(btn.dataset.add);
                                    renderCash(); updateConfirm();
                                });
                            });
                        }
                        renderCash();
                        confirmLbl.style.display = "none"; // ẩn cho đến khi đủ tiền
                    }

                    async function renderTransferPanel() {
                        payDetailBox.innerHTML = `<div style="text-align:center;padding:12px;color:var(--muted);font-size:13px;">Đang tải QR...</div>`;
                        try {
                            const bank   = await YCI.apiGet("/api/bank-info");
                            const bk     = bank.data || bank;
                            const content = encodeURIComponent("Thanh toan don " + codeLabel);
                            const qrUrl  = "https://qr.sepay.vn/img?acc=" + bk.accountNumber
                                         + "&bank=" + bk.bankCode
                                         + "&amount=" + Math.round(stillOwed)
                                         + "&des=" + content + "&template=compact";
                            payDetailBox.innerHTML = `
                                <div style="background:#f0f9ff;border:1px solid #7dd3fc;
                                    border-radius:12px;padding:14px;text-align:center;">
                                    <p style="font-size:12px;font-weight:800;text-transform:uppercase;
                                        letter-spacing:.07em;color:#0369a1;margin:0 0 10px;">🏦 QR Chuyển khoản</p>
                                    <img src="${qrUrl}" alt="QR"
                                        style="width:190px;height:190px;border-radius:10px;
                                        border:1px solid #bae6fd;display:block;margin:0 auto 12px;">
                                    <div style="text-align:left;font-size:13px;display:grid;gap:5px;">
                                        <div style="display:flex;justify-content:space-between;">
                                            <span style="color:var(--muted);">Ngân hàng</span>
                                            <strong>${YCI.escapeHtml(bk.bankCode)}</strong>
                                        </div>
                                        <div style="display:flex;justify-content:space-between;">
                                            <span style="color:var(--muted);">Số TK</span>
                                            <strong style="font-family:monospace;">${YCI.escapeHtml(bk.accountNumber)}</strong>
                                        </div>
                                        <div style="display:flex;justify-content:space-between;">
                                            <span style="color:var(--muted);">Tên TK</span>
                                            <strong>${YCI.escapeHtml(bk.accountName)}</strong>
                                        </div>
                                        <div style="display:flex;justify-content:space-between;">
                                            <span style="color:var(--muted);">Số tiền</span>
                                            <strong style="color:#0369a1;font-size:15px;">${YCI.money(stillOwed)}</strong>
                                        </div>
                                        <div style="padding:6px 10px;background:#fff;border-radius:8px;border:1px dashed #7dd3fc;">
                                            <p style="font-size:11px;color:var(--muted);margin:0 0 2px;font-weight:700;text-transform:uppercase;">Nội dung CK</p>
                                            <p style="font-size:13px;font-weight:800;color:#0369a1;margin:0;">Thanh toan don ${YCI.escapeHtml(codeLabel)}</p>
                                        </div>
                                    </div>
                                </div>`;
                            confirmTxt.textContent   = "Khách đã chuyển khoản " + YCI.money(stillOwed) + " thành công";
                            confirmLbl.style.display = "flex";
                        } catch {
                            payDetailBox.innerHTML = `<p style="color:var(--muted);font-size:13px;">Không tải được QR.</p>`;
                        }
                    }

                    async function selectMethod(method) {
                        wiz.payMethod = method;
                        const isCash = method === "cash";
                        optCash.style.borderColor      = isCash  ? "var(--teal)" : "var(--line)";
                        optCash.style.background       = isCash  ? "var(--surface-2)" : "#fff";
                        optTransfer.style.borderColor  = !isCash ? "var(--teal)" : "var(--line)";
                        optTransfer.style.background   = !isCash ? "var(--surface-2)" : "#fff";
                        confirmChk.checked             = false;
                        confirmBtn.disabled            = true;
                        confirmBtn.style.opacity       = ".4";
                        confirmBtn.style.pointerEvents = "none";
                        if (isCash) renderCashPanel();
                        else await renderTransferPanel();
                    }

                    optCash.addEventListener("click",     () => selectMethod("cash"));
                    optTransfer.addEventListener("click", () => selectMethod("transfer"));

                    confirmChk?.addEventListener("change", () => {
                        const ok = confirmChk.checked;
                        confirmBtn.disabled            = !ok;
                        confirmBtn.style.opacity       = ok ? "1"    : ".4";
                        confirmBtn.style.pointerEvents = ok ? "auto" : "none";
                    });
                }

                document.getElementById("wizBack3")?.addEventListener("click", () => {
                    wiz.step = 2; renderStepBar(); renderStep2();
                });

                document.getElementById("wizConfirm")?.addEventListener("click", async () => {
                    const confirmBtn = document.getElementById("wizConfirm");
                    if (confirmBtn) {
                        confirmBtn.disabled = true;
                        confirmBtn.innerHTML = '<i data-lucide="loader-2" style="width:15px;height:15px;animation:spin 1s linear infinite;"></i> Đang xử lý...';
                        YCI.iconRefresh();
                    }
                    try {
                        await YCI.apiJson("/api/admin/booking/complete", "PUT", {
                            bookingId:      booking.idBooking,
                            lateHours:      wiz.lateHours,
                            lateFeePerHour: wiz.feePerHour,
                            cleaningFee:    wiz.cleaningFee,
                            damageFee:      wiz.damageFee,
                            description:    wiz.description,
                            paymentMethod:  wiz.payMethod || "cash"
                        });
                        YCI.toast("✅ Hoàn tất đơn " + codeLabel, "success");
                        closeReturnWizard();
                        closeModal();
                        await load();
                    } catch (err) {
                        YCI.toast(err.message, "error");
                        if (confirmBtn) {
                            confirmBtn.disabled = false;
                            confirmBtn.innerHTML = '<i data-lucide="check-circle-2"></i> Hoàn tất đơn';
                            YCI.iconRefresh();
                        }
                    }
                });
            }

            // Mở modal wizard
            const m = document.getElementById("returnWizardModal");
            document.getElementById("wizardEyebrow").textContent = "Quy trình trả máy";
            document.getElementById("wizardTitle").textContent   = codeLabel + " — " + ((booking.userBookingDTO || {}).fullName || "");
            wiz.step = 1;
            renderStepBar();
            renderStep1();
            m.hidden = false;
            document.body.classList.add("bmodal-open");
            requestAnimationFrame(() => m.classList.add("is-open"));
            YCI.iconRefresh();
        }

        load().catch((error) => YCI.toast(error.message, "error"));
    }

    function bootAdminProducts() {
        // ── State ──────────────────────────────────────────────
        const state = {
            products:     [],
            categories:   [],
            rentalTypes:  [],
            search:       "",
            category:     "",
            status:       "",
            // add modal
            addImages:    [],
            addPreviewUrls: [],
            // edit modal
            editProduct:  null,
            editImages:   [],
            editPreviewUrls: []
        };

        // ── DOM refs — table ───────────────────────────────────
        const table          = YCI.qs("[data-admin-products-table]");
        const productSearch  = YCI.qs("[data-admin-product-search]");
        const categoryFilter = YCI.qs("[data-admin-product-category-filter]");
        const statusFilter   = YCI.qs("[data-admin-product-status-filter]");
        const pg             = YCI.paginate(document.getElementById("pgProducts"), 15);

        // ── DOM refs — add modal ───────────────────────────────
        const modalAdd       = document.getElementById("modalAddProduct");
        const formAdd        = document.getElementById("formAddProduct");
        const addImageInput  = YCI.qs("[data-add-product-image-input]");
        const addImagePrev   = YCI.qs("[data-add-product-image-preview]");
        const addCatSelect   = YCI.qs("[data-add-product-category]");

        // ── DOM refs — edit modal ──────────────────────────────
        const modalEdit      = document.getElementById("modalEditProduct");
        const formEdit       = document.getElementById("formEditProduct");
        const editImageInput = YCI.qs("[data-edit-product-image-input]");
        const editImagePrev  = YCI.qs("[data-edit-product-image-preview]");
        const editCatSelect  = YCI.qs("[data-edit-product-category]");
        const editPriceList  = document.getElementById("editPriceList");

        // ── Helpers: find the hourly / daily rental type ───────
        function hourlyRentalType() {
            return state.rentalTypes.find(rt =>
                /gi[oờ]|hour|h\b/i.test(rt.type)
            ) || null;
        }

        function dailyRentalType() {
            return state.rentalTypes.find(rt =>
                /ng[àa]y|day/i.test(rt.type)
            ) || null;
        }

        // ── Modal open/close ────────────────────────────────────
        function openModal(el) {
            el.hidden = false;
            document.body.classList.add("bmodal-open");
            requestAnimationFrame(() => el.classList.add("is-open"));
        }

        function closeModal(el) {
            el.classList.remove("is-open");
            el.addEventListener("transitionend", () => {
                el.hidden = true;
                document.body.classList.remove("bmodal-open");
            }, { once: true });
        }

        // Close on overlay click or Esc
        [modalAdd, modalEdit].forEach(m => {
            m?.addEventListener("click", e => { if (e.target === m) closeModal(m); });
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                if (modalAdd && !modalAdd.hidden) closeModal(modalAdd);
                if (modalEdit && !modalEdit.hidden) closeModal(modalEdit);
            }
        });
        document.querySelectorAll("[data-close-add-modal]").forEach(b => b.addEventListener("click", () => closeModal(modalAdd)));
        document.querySelectorAll("[data-close-edit-modal]").forEach(b => b.addEventListener("click", () => closeModal(modalEdit)));

        // ── Image helpers ───────────────────────────────────────
        function syncInput(input, files) {
            const dt = new DataTransfer();
            files.forEach(f => dt.items.add(f));
            input.files = dt.files;
        }

        function releaseUrls(arr) {
            arr.forEach(u => URL.revokeObjectURL(u));
            arr.length = 0;
        }

        function renderPreview(container, savedImages, newFiles, previewUrls, productId, onDeleteSaved, onRemoveNew) {
            releaseUrls(previewUrls);
            const saved = (savedImages || []).map((img, i) => {
                const url = img.idImage
                    ? `/api/product/${productId}/image/${img.idImage}`
                    : (img.imageBase64
                        ? (img.imageBase64.startsWith("data:") ? img.imageBase64 : `data:image/jpeg;base64,${img.imageBase64}`)
                        : "");
                return { id: img.idImage, i, url };
            });
            const news = newFiles.map((f, i) => {
                const url = URL.createObjectURL(f);
                previewUrls.push(url);
                return { f, i, url };
            });
            const all = [...saved, ...news];
            container.hidden = !all.length;
            container.innerHTML = [
                ...saved.map(({ id, i, url }) => `
                    <figure class="product-image-preview-item">
                        <img src="${url}" alt="Ảnh ${i + 1}">
                        ${id ? `<button class="image-preview-remove" type="button" data-del-saved-img="${id}" aria-label="Xóa ảnh"><i data-lucide="x"></i></button>` : ""}
                        <span class="image-preview-badge">Đã lưu</span>
                    </figure>`),
                ...news.map(({ f, i, url }) => `
                    <figure class="product-image-preview-item is-new">
                        <img src="${url}" alt="${YCI.escapeHtml(f.name)}">
                        <button class="image-preview-remove" type="button" data-remove-new-img="${i}" aria-label="Loại ảnh"><i data-lucide="x"></i></button>
                        <span class="image-preview-badge">Ảnh mới</span>
                    </figure>`)
            ].join("");
            YCI.iconRefresh();
        }

        // ── Load all data ───────────────────────────────────────
        async function load() {
            const [products, categories, rentalTypes] = await Promise.all([
                YCI.apiGet("/api/product/all").then(YCI.unwrapList),
                YCI.apiGet("/api/category").then(YCI.unwrapList),
                YCI.apiGet("/api/admin/rental-type").then(YCI.unwrapList)
            ]);
            state.products    = products;
            state.categories  = categories;
            state.rentalTypes = rentalTypes;

            // Populate category selects
            const catOpts = `<option value="">Chọn danh mục</option>` +
                categories.map(c => `<option value="${c.idCategory}">${YCI.escapeHtml(c.nameCategory)}</option>`).join("");
            if (addCatSelect)  addCatSelect.innerHTML  = catOpts;
            if (editCatSelect) editCatSelect.innerHTML = catOpts;
            YCI.setOptions(categoryFilter, categories, c => c.idCategory, c => c.nameCategory, "Tất cả danh mục");
            if (categoryFilter) categoryFilter.value = state.category;

            // Update price type labels in add modal
            const ht = hourlyRentalType();
            const dt = dailyRentalType();
            const hourLabel  = document.getElementById("addPriceTypeName");
            const dailyLabel = document.getElementById("addDailyTypeName");
            if (hourLabel  && ht) hourLabel.textContent  = ht.type;
            if (dailyLabel && dt) dailyLabel.textContent = dt.type;

            renderStatusFilter();
            render();
        }

        function renderStatusFilter() {
            if (!statusFilter) return;
            const statuses = [...new Set(state.products.map(p => p.status).filter(Boolean))];
            statusFilter.innerHTML = `<option value="">Tất cả tình trạng</option>` +
                statuses.map(s => `<option value="${YCI.escapeHtml(s)}">${YCI.escapeHtml(YCI.statusLabel(s))}</option>`).join("");
            statusFilter.value = state.status;
        }

        function filteredProducts() {
            const kw = state.search.trim().toLowerCase();
            return state.products
                .filter(p => {
                    const txt = YCI.cleanText([p.nameProduct, p.brand, p.serialNumber, p.categoryName, p.description].join(" ")).toLowerCase();
                    return (!kw || txt.includes(kw))
                        && (!state.category || String(p.categoryId) === String(state.category))
                        && (!state.status   || String(p.status || "") === String(state.status));
                })
                .sort((a, b) => Number(b.idProduct) - Number(a.idProduct)); // mới nhất lên đầu
        }

        // ── Render table ────────────────────────────────────────
        function render() {
            const all     = filteredProducts();
            const products = pg.slice(all);
            table.innerHTML = products.map(p => {
                const hourPrice  = (p.rentalPriceDTOS || []).find(pr => /gi[oờ]|hour/i.test(pr.rentalType));
                const dailyPrice = (p.rentalPriceDTOS || []).find(pr => /ng[àa]y|day/i.test(pr.rentalType));
                const priceHtml  = [
                    hourPrice  ? `<span style="white-space:nowrap;"><strong style="color:var(--teal-dark);">${YCI.money(hourPrice.price)}</strong> <span class="muted" style="font-size:11px;">/ giờ</span></span>` : null,
                    dailyPrice ? `<span style="white-space:nowrap;"><strong style="color:#4f6fae;">${YCI.money(dailyPrice.price)}</strong> <span class="muted" style="font-size:11px;">/ ngày</span></span>` : null,
                ].filter(Boolean).join("<br>") || `<span class="muted">Chưa có giá</span>`;

                const isActive = p.active !== false; // null/undefined → true

                return `
                <tr class="${isActive ? "" : "product-row-inactive"}">
                    <td style="width:70px;padding:8px 10px;">
                        <img src="/api/product/${p.idProduct}/image"
                             alt="${YCI.escapeHtml(p.nameProduct)}"
                             style="width:56px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--line);background:#fff7fb;"
                             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                        <div style="display:none;width:56px;height:44px;border-radius:8px;border:1px solid var(--line);background:#fff7fb;align-items:center;justify-content:center;">
                            <i data-lucide="image" style="width:18px;height:18px;color:var(--line);"></i>
                        </div>
                    </td>
                    <td>
                        <strong>${YCI.escapeHtml(p.nameProduct)}</strong>
                        <br><span class="muted">${YCI.escapeHtml(p.brand || "")} · ${YCI.escapeHtml(p.serialNumber || "")}</span>
                    </td>
                    <td>${YCI.escapeHtml(p.categoryName || "—")}</td>
                    <td>${priceHtml}</td>
                    <td><strong>${YCI.money(p.depositPrice)}</strong></td>
                    <td>
                        <span class="status-pill ${YCI.statusClass(p.status)}">${YCI.escapeHtml(YCI.statusLabel(p.status))}</span>
                    </td>
                    <td>
                        <label class="product-toggle" title="${isActive ? "Đang hiển thị — nhấn để ẩn" : "Đang ẩn — nhấn để hiện"}">
                            <input type="checkbox" ${isActive ? "checked" : ""}
                                   data-toggle-product="${p.idProduct}"
                                   style="display:none;">
                            <span class="product-toggle-track ${isActive ? "is-on" : ""}">
                                <span class="product-toggle-thumb"></span>
                            </span>
                            <span class="product-toggle-label">${isActive ? "Bật" : "Tắt"}</span>
                        </label>
                    </td>
                    <td>
                        <div class="button-row">
                            <button class="icon-button sm" type="button" data-edit-product="${p.idProduct}" aria-label="Sửa">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button class="icon-button sm danger" type="button" data-delete-product="${p.idProduct}" aria-label="Xóa">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
            }).join("") || `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted);">Không có thiết bị phù hợp.</td></tr>`;
            pg.render(all.length);
            YCI.iconRefresh();
        }

        // ── Open Add modal ──────────────────────────────────────
        document.getElementById("btnOpenAddProduct")?.addEventListener("click", () => {
            formAdd.reset();
            state.addImages = [];
            releaseUrls(state.addPreviewUrls);
            addImagePrev.innerHTML = "";
            addImagePrev.hidden = true;
            openModal(modalAdd);
            // Bind money inputs sau khi modal mở
            YCI.moneyInput(modalAdd);
        });

        // ── ADD: image input ────────────────────────────────────
        addImageInput?.addEventListener("change", () => {
            const known = new Set(state.addImages.map(f => `${f.name}:${f.size}`));
            Array.from(addImageInput.files || []).forEach(f => {
                const key = `${f.name}:${f.size}`;
                if (!known.has(key)) { state.addImages.push(f); known.add(key); }
            });
            syncInput(addImageInput, state.addImages);
            renderPreview(addImagePrev, [], state.addImages, state.addPreviewUrls, null, null, null);
        });

        addImagePrev?.addEventListener("click", e => {
            const btn = e.target.closest("[data-remove-new-img]");
            if (!btn) return;
            state.addImages.splice(Number(btn.dataset.removeNewImg), 1);
            syncInput(addImageInput, state.addImages);
            renderPreview(addImagePrev, [], state.addImages, state.addPreviewUrls, null, null, null);
        });

        // ── ADD: submit ─────────────────────────────────────────
        formAdd?.addEventListener("submit", async e => {
            e.preventDefault();
            if (!state.addImages.length) {
                YCI.toast("Cần chọn ít nhất 1 hình ảnh cho thiết bị.", "error");
                return;
            }
            const priceVal = YCI.parseMoneyInput(document.getElementById("addPriceValue") || formAdd.elements.pricePerHour);
            if (!priceVal || priceVal <= 0) {
                YCI.toast("Vui lòng nhập giá thuê hợp lệ.", "error");
                return;
            }
            const ht = hourlyRentalType();
            if (!ht) {
                YCI.toast("Chưa có loại giá giờ trong hệ thống. Vui lòng thêm loại giá tại trang Cấu hình.", "error");
                return;
            }
            const btn = document.getElementById("btnSubmitAddProduct");
            btn.disabled = true;
            try {
                // 1) Create product
                const fd = new FormData();
                ["nameProduct", "brand", "description", "serialNumber", "idCategory"]
                    .forEach(n => { if (formAdd.elements[n]?.value) fd.append(n, formAdd.elements[n].value); });
                // depositPrice — parse từ money-formatted input
                const depositVal = YCI.parseMoneyInput(document.getElementById("addDepositPrice") || formAdd.elements.depositPrice);
                if (depositVal) fd.append("depositPrice", depositVal);
                state.addImages.forEach(f => fd.append("images", f));
                const createResp = await YCI.apiForm("/api/admin/product", "POST", fd);

                // 2) Reload products to find the newly created product (match by serial)
                const allProds = await YCI.apiGet("/api/product/all").then(YCI.unwrapList);
                const serial = formAdd.elements.serialNumber?.value?.trim();
                const newProd = allProds.find(p => p.serialNumber === serial);

                if (newProd) {
                    // Giá theo giờ
                    await YCI.apiJson("/api/admin/product/rental-price", "POST", {
                        productId: newProd.idProduct,
                        typeId:    ht.idRentalType,
                        price:     priceVal
                    });
                    // Giá theo ngày (tùy chọn)
                    const dailyVal = YCI.parseMoneyInput(document.getElementById("addDailyPriceValue"));
                    const dt = dailyRentalType();
                    if (dailyVal > 0 && dt) {
                        await YCI.apiJson("/api/admin/product/rental-price", "POST", {
                            productId: newProd.idProduct,
                            typeId:    dt.idRentalType,
                            price:     dailyVal
                        });
                    }
                }

                YCI.toast("Đã thêm thiết bị thành công.", "success");
                closeModal(modalAdd);
                await load();
            } catch (err) {
                YCI.toast(err.message, "error");
            } finally {
                btn.disabled = false;
            }
        });

        // ── Open Edit modal ─────────────────────────────────────
        async function openEditModal(productId) {
            const product = state.products.find(p => Number(p.idProduct) === Number(productId));
            if (!product) return;

            state.editProduct     = product;
            state.editImages      = [];
            releaseUrls(state.editPreviewUrls);

            // Fill fields
            document.getElementById("editProductId").value      = product.idProduct;
            document.getElementById("editNameProduct").value    = YCI.cleanText(product.nameProduct || "");
            document.getElementById("editBrand").value          = YCI.cleanText(product.brand || "");
            document.getElementById("editSerialNumber").value   = YCI.cleanText(product.serialNumber || "");
            // depositPrice — hiển thị dạng có dấu chấm
            const depositEl = document.getElementById("editDepositPrice");
            if (depositEl) depositEl.value = product.depositPrice
                ? Number(product.depositPrice).toLocaleString("vi-VN")
                : "";
            document.getElementById("editDescription").value    = YCI.cleanText(product.description || "");
            if (editCatSelect) editCatSelect.value               = product.categoryId || "";

            document.getElementById("modalEditEyebrow").textContent = `#${product.idProduct}`;
            document.getElementById("modalEditTitle").textContent   = product.nameProduct || "Sửa thiết bị";

            // Render existing images preview
            renderPreview(editImagePrev, product.imageDTOS || [], [], state.editPreviewUrls, product.idProduct);

            // Render prices
            renderEditPrices(product);

            openModal(modalEdit);
            // Bind money inputs sau khi modal render xong
            YCI.moneyInput(modalEdit);
        }

        function renderEditPrices(product) {
            const prices = product.rentalPriceDTOS || [];
            if (!editPriceList) return;

            // Helper: add-price widget cho 1 loại
            function addPriceWidget(rt, color = "var(--teal)") {
                const wrapId  = `addPrice_${rt.idRentalType}`;
                const inputId = `addPriceInput_${rt.idRentalType}`;
                const btnId   = `addPriceBtn_${rt.idRentalType}`;
                return `
                    <div class="pmodal-price-box" style="border-color:rgba(79,111,174,.25);">
                        <div class="pmodal-price-label" style="color:${color};">
                            <i data-lucide="plus-circle" style="color:${color};"></i>
                            <span>Thêm giá <strong>${YCI.escapeHtml(rt.type)}</strong></span>
                        </div>
                        <input id="${inputId}" type="text" inputmode="numeric"
                               placeholder="Nhập giá..." autocomplete="off" data-money-input>
                        <button class="button primary" type="button" id="${btnId}" style="width:100%;">
                            <i data-lucide="plus"></i> Thêm giá ${YCI.escapeHtml(rt.type)}
                        </button>
                    </div>`;
            }

            if (!prices.length) {
                // No prices at all — show both add widgets
                const ht = hourlyRentalType();
                const dt = dailyRentalType();
                editPriceList.innerHTML = (ht ? addPriceWidget(ht, "var(--teal)") : "") +
                                          (dt ? addPriceWidget(dt, "#4f6fae") : "");
                YCI.iconRefresh();
                YCI.moneyInput(editPriceList);

                [ht, dt].filter(Boolean).forEach(rt => {
                    const btn   = document.getElementById(`addPriceBtn_${rt.idRentalType}`);
                    const input = document.getElementById(`addPriceInput_${rt.idRentalType}`);
                    btn?.addEventListener("click", async () => {
                        const val = YCI.parseMoneyInput(input);
                        if (!val || val <= 0) { YCI.toast("Nhập giá hợp lệ.", "error"); return; }
                        try {
                            await YCI.apiJson("/api/admin/product/rental-price", "POST", {
                                productId: product.idProduct,
                                typeId:    rt.idRentalType,
                                price:     val
                            });
                            YCI.toast(`Đã thêm giá ${rt.type}.`, "success");
                            await load();
                            state.editProduct = state.products.find(p => Number(p.idProduct) === Number(product.idProduct)) || null;
                            if (state.editProduct) renderEditPrices(state.editProduct);
                        } catch (err) { YCI.toast(err.message, "error"); }
                    });
                });
                return;
            }

            // Has some prices — render existing rows
            const existingTypeIds = new Set(prices.map(pr => {
                const rt = state.rentalTypes.find(r => r.type === pr.rentalType);
                return rt ? rt.idRentalType : null;
            }).filter(Boolean));

            const rows = prices.map(pr => `
                <div class="pmodal-price-row" data-price-row="${pr.idRentalPrice}">
                    <div class="pmodal-price-label">
                        <i data-lucide="${/ng[àa]y|day/i.test(pr.rentalType) ? "calendar" : "clock"}"></i>
                        <span>${YCI.escapeHtml(pr.rentalType)}</span>
                    </div>
                    <input type="text" inputmode="numeric"
                           value="${pr.price ? Number(pr.price).toLocaleString("vi-VN") : ""}"
                           autocomplete="off"
                           data-price-input="${pr.idRentalPrice}"
                           data-money-input
                           placeholder="Giá thuê...">
                    <button class="button ghost" type="button" data-save-price="${pr.idRentalPrice}" style="white-space:nowrap;">
                        <i data-lucide="check"></i> Lưu
                    </button>
                    <button class="icon-button sm danger" type="button" data-del-price="${pr.idRentalPrice}" aria-label="Xóa giá">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>`).join("");

            // Add widgets for missing price types
            const missingWidgets = [hourlyRentalType(), dailyRentalType()]
                .filter(rt => rt && !existingTypeIds.has(rt.idRentalType))
                .map((rt, i) => addPriceWidget(rt, i === 0 ? "var(--teal)" : "#4f6fae"))
                .join("");

            editPriceList.innerHTML = rows + missingWidgets;
            YCI.iconRefresh();
            YCI.moneyInput(editPriceList);

            // Bind add-price buttons for missing types
            [hourlyRentalType(), dailyRentalType()].filter(rt => rt && !existingTypeIds.has(rt.idRentalType)).forEach(rt => {
                const btn   = document.getElementById(`addPriceBtn_${rt.idRentalType}`);
                const input = document.getElementById(`addPriceInput_${rt.idRentalType}`);
                btn?.addEventListener("click", async () => {
                    const val = YCI.parseMoneyInput(input);
                    if (!val || val <= 0) { YCI.toast("Nhập giá hợp lệ.", "error"); return; }
                    try {
                        await YCI.apiJson("/api/admin/product/rental-price", "POST", {
                            productId: product.idProduct,
                            typeId:    rt.idRentalType,
                            price:     val
                        });
                        YCI.toast(`Đã thêm giá ${rt.type}.`, "success");
                        await load();
                        state.editProduct = state.products.find(p => Number(p.idProduct) === Number(product.idProduct)) || null;
                        if (state.editProduct) renderEditPrices(state.editProduct);
                    } catch (err) { YCI.toast(err.message, "error"); }
                });
            });
        }

        // ── Edit: price save/delete inside modal ────────────────
        editPriceList?.addEventListener("click", async e => {
            const saveBtn = e.target.closest("[data-save-price]");
            const delBtn  = e.target.closest("[data-del-price]");
            if (saveBtn) {
                const id  = Number(saveBtn.dataset.savePrice);
                const row = editPriceList.querySelector(`[data-price-row="${id}"]`);
                const priceEl = row?.querySelector(`[data-price-input="${id}"]`);
                const val = priceEl ? YCI.parseMoneyInput(priceEl) : 0;
                if (!val || val <= 0) { YCI.toast("Nhập giá hợp lệ.", "error"); return; }
                try {
                    await YCI.apiJson("/api/admin/product/rental-price", "PUT", { idRentalPrice: id, price: val });
                    YCI.toast("Đã cập nhật giá.", "success");
                    await load();
                    state.editProduct = state.products.find(p => Number(p.idProduct) === Number(state.editProduct?.idProduct)) || null;
                } catch (err) { YCI.toast(err.message, "error"); }
            }
            if (delBtn) {
                const id = delBtn.dataset.delPrice;
                try {
                    await YCI.request(`/api/admin/product/rental-price/id=${id}`, { method: "DELETE" });
                    YCI.toast("Đã xóa giá.", "success");
                    await load();
                    state.editProduct = state.products.find(p => Number(p.idProduct) === Number(state.editProduct?.idProduct)) || null;
                    if (state.editProduct) renderEditPrices(state.editProduct);
                } catch (err) { YCI.toast(err.message, "error"); }
            }
        });

        // ── Edit: image management ──────────────────────────────
        editImageInput?.addEventListener("change", () => {
            const known = new Set(state.editImages.map(f => `${f.name}:${f.size}`));
            Array.from(editImageInput.files || []).forEach(f => {
                const key = `${f.name}:${f.size}`;
                if (!known.has(key)) { state.editImages.push(f); known.add(key); }
            });
            syncInput(editImageInput, state.editImages);
            renderPreview(editImagePrev,
                state.editProduct?.imageDTOS || [],
                state.editImages, state.editPreviewUrls,
                state.editProduct?.idProduct);
        });

        editImagePrev?.addEventListener("click", async e => {
            const delSaved  = e.target.closest("[data-del-saved-img]");
            const removeNew = e.target.closest("[data-remove-new-img]");
            if (delSaved && state.editProduct) {
                delSaved.disabled = true;
                try {
                    await YCI.request(`/api/admin/product/${state.editProduct.idProduct}/image/${delSaved.dataset.delSavedImg}`, { method: "DELETE" });
                    YCI.toast("Đã xóa hình ảnh.", "success");
                    await load();
                    state.editProduct = state.products.find(p => Number(p.idProduct) === Number(state.editProduct?.idProduct)) || null;
                    renderPreview(editImagePrev,
                        state.editProduct?.imageDTOS || [],
                        state.editImages, state.editPreviewUrls,
                        state.editProduct?.idProduct);
                } catch (err) { delSaved.disabled = false; YCI.toast(err.message, "error"); }
            }
            if (removeNew) {
                state.editImages.splice(Number(removeNew.dataset.removeNewImg), 1);
                syncInput(editImageInput, state.editImages);
                renderPreview(editImagePrev,
                    state.editProduct?.imageDTOS || [],
                    state.editImages, state.editPreviewUrls,
                    state.editProduct?.idProduct);
            }
        });

        // ── Edit: submit ────────────────────────────────────────
        formEdit?.addEventListener("submit", async e => {
            e.preventDefault();
            const btn = document.getElementById("btnSubmitEditProduct");
            btn.disabled = true;
            try {
                const fd = new FormData();
                ["nameProduct", "brand", "description", "serialNumber", "idCategory"]
                    .forEach(n => {
                        const el = formEdit.elements[n] || document.getElementById("edit" + n.charAt(0).toUpperCase() + n.slice(1));
                        const val = el?.value;
                        if (val) fd.append(n, val);
                    });
                // depositPrice — parse từ money-formatted input
                const depEl = document.getElementById("editDepositPrice");
                const depVal = depEl ? YCI.parseMoneyInput(depEl) : 0;
                if (depVal) fd.append("depositPrice", depVal);
                // idProduct from hidden
                if (document.getElementById("editProductId")?.value)
                    fd.set("idProduct", document.getElementById("editProductId").value);
                state.editImages.forEach(f => fd.append("images", f));
                await YCI.apiForm("/api/admin/product", "PUT", fd);
                YCI.toast("Đã cập nhật thiết bị.", "success");
                closeModal(modalEdit);
                await load();
            } catch (err) {
                YCI.toast(err.message, "error");
            } finally {
                btn.disabled = false;
            }
        });

        // ── Table click ─────────────────────────────────────────
        table.addEventListener("click", async e => {
            const editBtn = e.target.closest("[data-edit-product]");
            const delBtn  = e.target.closest("[data-delete-product]");
            if (editBtn) openEditModal(editBtn.dataset.editProduct);
            if (delBtn) {
                if (!confirm("Xóa thiết bị này?")) return;
                try {
                    await YCI.request(`/api/admin/product/id-product=${delBtn.dataset.deleteProduct}`, { method: "DELETE" });
                    YCI.toast("Đã xóa thiết bị.", "success");
                    await load();
                } catch (err) { YCI.toast(err.message, "error"); }
            }
        });

        // ── Inline active toggle ────────────────────────────────
        table.addEventListener("click", async e => {
            const chk = e.target.closest("[data-toggle-product]");
            if (!chk) return;
            e.preventDefault(); // ngăn checkbox tự check — ta xử lý manually
            const idProduct = Number(chk.dataset.toggleProduct);
            const label = chk.closest(".product-toggle");
            if (label) label.style.pointerEvents = "none";
            try {
                await YCI.apiJson("/api/admin/product/toggle-active", "PUT", { idProduct });
                // Cập nhật state cục bộ và re-render dòng
                const prod = state.products.find(p => Number(p.idProduct) === idProduct);
                if (prod) prod.active = prod.active === false ? true : false;
                YCI.toast(prod?.active ? "Đã bật thiết bị — hiển thị trên trang khách." : "Đã tắt thiết bị — ẩn khỏi trang khách.", "success");
                render();
            } catch (err) {
                YCI.toast(err.message, "error");
                if (label) label.style.pointerEvents = "";
            }
        });

        // ── Filters ─────────────────────────────────────────────
        productSearch?.addEventListener("input",  () => { state.search   = productSearch.value; pg.reset(); render(); });
        categoryFilter?.addEventListener("change", () => { state.category = categoryFilter.value; pg.reset(); render(); });
        statusFilter?.addEventListener("change",   () => { state.status   = statusFilter.value; pg.reset(); render(); });
        document.getElementById("pgProducts")?.addEventListener("pg:change", () => render());

        load().catch(err => YCI.toast(err.message, "error"));
    }

    function bootCustomers() {
        const state = { users: [], search: "", role: "" };
        const table    = YCI.qs("[data-customers-table]");
        const input    = YCI.qs("[data-customer-search]");
        const roleTabs = YCI.qs("[data-account-role-tabs]");
        const pg       = YCI.paginate(document.getElementById("pgCustomers"), 15);

        // ── Modal refs ──────────────────────────────────────────
        const modalAdd  = document.getElementById("modalAddUser");
        const modalEdit = document.getElementById("modalEditUser");
        const formAdd   = document.getElementById("formAddUser");
        const formEdit  = document.getElementById("formEditUser");

        // ── Modal helpers ───────────────────────────────────────
        function openModal(el) {
            el.hidden = false;
            document.body.classList.add("bmodal-open");
            requestAnimationFrame(() => el.classList.add("is-open"));
        }
        function closeModal(el) {
            el.classList.remove("is-open");
            el.addEventListener("transitionend", () => {
                el.hidden = true;
                document.body.classList.remove("bmodal-open");
            }, { once: true });
        }

        [modalAdd, modalEdit].forEach(m => {
            m?.addEventListener("click", e => { if (e.target === m) closeModal(m); });
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                if (modalAdd && !modalAdd.hidden)  closeModal(modalAdd);
                if (modalEdit && !modalEdit.hidden) closeModal(modalEdit);
            }
        });
        document.querySelectorAll("[data-close-add-user]").forEach(b  => b.addEventListener("click", () => closeModal(modalAdd)));
        document.querySelectorAll("[data-close-edit-user]").forEach(b => b.addEventListener("click", () => closeModal(modalEdit)));

        // ── Load all users ──────────────────────────────────────
        async function load() {
            const users = await loadPaged("/api/user");
            state.users = users;
            render();
        }

        // ── Stats tabs ──────────────────────────────────────────
        function roleCounts() {
            return state.users.reduce((acc, user) => {
                const role = Number(user.role ?? 1);
                acc.total += 1;
                if (role === 0) acc.admins += 1;
                else if (role === 2) acc.staff += 1;
                else acc.customers += 1;
                return acc;
            }, { total: 0, customers: 0, staff: 0, admins: 0 });
        }

        function renderRoleTabs(counts) {
            YCI.qs("[data-account-total]")     && (YCI.qs("[data-account-total]").textContent     = counts.total);
            YCI.qs("[data-account-customers]") && (YCI.qs("[data-account-customers]").textContent = counts.customers);
            YCI.qs("[data-account-staff]")     && (YCI.qs("[data-account-staff]").textContent     = counts.staff);
            YCI.qs("[data-account-admins]")    && (YCI.qs("[data-account-admins]").textContent    = counts.admins);
            if (!roleTabs) return;
            const items = [
                { value: "", label: "Tất cả",       count: counts.total },
                { value: "1", label: "Khách hàng",  count: counts.customers },
                { value: "2", label: "Nhân viên",   count: counts.staff },
                { value: "0", label: "Quản trị",    count: counts.admins }
            ];
            roleTabs.innerHTML = items.map(item => `
                <button class="admin-tab ${String(state.role) === String(item.value) ? "is-active" : ""}"
                        type="button" data-account-role="${item.value}">
                    <span>${item.label}</span>
                    <strong>${item.count}</strong>
                </button>`).join("");
        }

        function roleLabel(r) {
            const n = Number(r ?? 1);
            if (n === 0) return "Quản trị";
            if (n === 2) return "Nhân viên";
            return "Khách hàng";
        }

        function roleBadge(r) {
            const n = Number(r ?? 1);
            const cls = n === 0 ? "sc-cancelled" : n === 2 ? "sc-accepted" : "sc-available";
            return `<span class="status-pill ${cls}">${roleLabel(r)}</span>`;
        }

        // ── Render table ────────────────────────────────────────
        function render() {
            const counts = roleCounts();
            renderRoleTabs(counts);
            const keyword = state.search.trim().toLowerCase();
            const allUsers = state.users
                .filter(user => {
                    const text = YCI.cleanText([user.fullName, user.email, user.phone].join(" ")).toLowerCase();
                    return (!keyword || text.includes(keyword))
                        && (state.role === "" || String(Number(user.role ?? 1)) === state.role);
                })
                .sort((a, b) => Number(b.idUser) - Number(a.idUser)); // mới nhất lên đầu
            const users = pg.slice(allUsers);
            table.innerHTML = users.map(user => `
                <tr>
                    <td>
                        <strong>${YCI.escapeHtml(user.fullName || "—")}</strong>
                    </td>
                    <td>
                        ${YCI.escapeHtml(user.email || "—")}
                        <br><span class="muted">${YCI.escapeHtml(user.phone || "")}</span>
                    </td>
                    <td><span class="muted">${YCI.escapeHtml(user.address || "—")}</span></td>
                    <td>${roleBadge(user.role)}</td>
                    <td><span class="muted">${YCI.formatDate(user.createdAt)}</span></td>
                    <td>
                        <div class="button-row">
                            <button class="icon-button sm" type="button"
                                    data-edit-user="${user.idUser}" aria-label="Sửa">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button class="icon-button sm danger" type="button"
                                    data-delete-user="${user.idUser}"
                                    data-user-name="${YCI.escapeHtml(user.fullName || "tài khoản này")}"
                                    aria-label="Xóa">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>`).join("") || `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted);">Không có tài khoản phù hợp.</td></tr>`;
            pg.render(allUsers.length);
            YCI.iconRefresh();
        }

        // ── Filters ─────────────────────────────────────────────
        input?.addEventListener("input", () => { state.search = input.value; pg.reset(); render(); });
        roleTabs?.addEventListener("click", e => {
            const btn = e.target.closest("[data-account-role]");
            if (!btn) return;
            state.role = btn.dataset.accountRole || "";
            pg.reset(); render();
        });
        document.getElementById("pgCustomers")?.addEventListener("pg:change", () => render());

        // ── Table actions ────────────────────────────────────────
        table.addEventListener("click", async e => {
            // Edit
            const editBtn = e.target.closest("[data-edit-user]");
            if (editBtn) {
                const user = state.users.find(u => Number(u.idUser) === Number(editBtn.dataset.editUser));
                if (!user) return;
                document.getElementById("editUserId").value   = user.idUser;
                document.getElementById("editFullName").value = YCI.cleanText(user.fullName || "");
                document.getElementById("editEmail").value    = YCI.cleanText(user.email || "");
                document.getElementById("editPhone").value    = YCI.cleanText(user.phone || "");
                document.getElementById("editAddress").value  = YCI.cleanText(user.address || "");
                document.getElementById("editRole").value     = String(user.role ?? 1);
                document.getElementById("modalEditUserEyebrow").textContent = `#${user.idUser}`;
                document.getElementById("modalEditUserTitle").textContent   = user.fullName || "Sửa tài khoản";
                openModal(modalEdit);
                return;
            }
            // Delete
            const delBtn = e.target.closest("[data-delete-user]");
            if (delBtn) {
                const name = delBtn.dataset.userName || "tài khoản này";
                if (!confirm(`Xóa ${name}? Toàn bộ đơn thuê liên quan sẽ bị xóa theo.`)) return;
                try {
                    await YCI.request(`/api/admin/user/id=${delBtn.dataset.deleteUser}`, { method: "DELETE" });
                    YCI.toast("Đã xóa tài khoản.", "success");
                    await load();
                } catch (err) { YCI.toast(err.message, "error"); }
            }
        });

        // ── Old role inline select (kept for compatibility) ──────
        table.addEventListener("change", async e => {
            const sel = e.target.closest("[data-role-user]");
            if (!sel) return;
            try {
                await YCI.apiJson("/api/admin/user/role", "PUT", {
                    idUser: Number(sel.dataset.roleUser),
                    role:   Number(sel.value)
                });
                YCI.toast("Đã cập nhật phân quyền.", "success");
            } catch (err) { YCI.toast(err.message, "error"); }
        });

        // ── Add user submit ──────────────────────────────────────
        document.getElementById("btnOpenAddUser")?.addEventListener("click", () => {
            formAdd.reset();
            openModal(modalAdd);
        });

        formAdd?.addEventListener("submit", async e => {
            e.preventDefault();
            const btn = document.getElementById("btnSubmitAddUser");
            btn.disabled = true;
            try {
                const payload = {
                    fullName: formAdd.elements.fullName.value.trim(),
                    email:    formAdd.elements.email.value.trim(),
                    phone:    formAdd.elements.phone.value.trim(),
                    password: formAdd.elements.password.value,
                    address:  formAdd.elements.address.value.trim(),
                    role:     Number(formAdd.elements.role.value)
                };
                await YCI.apiJson("/api/admin/user", "POST", payload);
                YCI.toast("Đã tạo tài khoản.", "success");
                closeModal(modalAdd);
                await load();
            } catch (err) {
                YCI.toast(err.message, "error");
            } finally {
                btn.disabled = false;
            }
        });

        // ── Edit user submit ─────────────────────────────────────
        formEdit?.addEventListener("submit", async e => {
            e.preventDefault();
            const btn  = document.getElementById("btnSubmitEditUser");
            const id   = Number(document.getElementById("editUserId").value);
            btn.disabled = true;
            try {
                // Update profile (fullName, email, phone, address)
                await YCI.apiJson("/api/profile", "PUT", {
                    idUser:   id,
                    fullName: formEdit.elements.fullName.value.trim(),
                    email:    formEdit.elements.email.value.trim(),
                    phone:    formEdit.elements.phone.value.trim(),
                    address:  formEdit.elements.address.value.trim()
                });
                // Update role separately if changed
                const newRole = Number(formEdit.elements.role.value);
                const old = state.users.find(u => Number(u.idUser) === id);
                if (old && Number(old.role ?? 1) !== newRole) {
                    await YCI.apiJson("/api/admin/user/role", "PUT", { idUser: id, role: newRole });
                }
                YCI.toast("Đã cập nhật tài khoản.", "success");
                closeModal(modalEdit);
                await load();
            } catch (err) {
                YCI.toast(err.message, "error");
            } finally {
                btn.disabled = false;
            }
        });

        load().catch(err => YCI.toast(err.message, "error"));
    }

    function bootFinance() {
        const pgFin = YCI.paginate(document.getElementById("pgFinance"), 15);

        function renderFinanceTable(bookings) {
            const all  = [...bookings].sort((a, b) => Number(b.idBooking) - Number(a.idBooking)); // mới nhất lên đầu
            const page = pgFin.slice(all);
            YCI.qs("[data-finance-table]").innerHTML = page.map((booking) => {
                const finance = financeOf(booking);
                return `
                    <tr>
                        <td><strong>${YCI.escapeHtml(booking.bookingCode || ('#' + booking.idBooking))}</strong><br><span class="muted">${YCI.formatDate(booking.createdAt)}</span></td>
                        <td>${YCI.escapeHtml(booking.userBookingDTO?.fullName || "-")}</td>
                        <td>${YCI.money(finance.paid)}</td>
                        <td>${YCI.money(finance.remain)}</td>
                        <td><span class="status-pill ${YCI.statusClass(booking.status)}">${YCI.escapeHtml(YCI.statusLabel(booking.status))}</span></td>
                    </tr>
                `;
            }).join("") || `<tr><td colspan="5">Chưa có dữ liệu thanh toán.</td></tr>`;
            pgFin.render(all.length);
        }

        document.getElementById("pgFinance")?.addEventListener("pg:change", () => {
            // bookings stored on window for re-render
            if (window._financeBookings) renderFinanceTable(window._financeBookings);
        });

        Promise.all([loadPaged("/api/admin/booking"), YCI.apiGet("/api/admin/revenue/statistics")])
            .then(([bookings, statsResponse]) => {
                const stats = YCI.unwrapData(statsResponse) || {};
                window._financeBookings = bookings;
                const totals = bookings.reduce((acc, booking) => {
                    const finance = financeOf(booking);
                    acc.paid += finance.paid;
                    acc.remain += finance.remain;
                    acc.total += Number(booking.totalAmount || 0);
                    if ((booking.paymentBookingDTOS || []).length) {
                        acc.count += 1;
                    }
                    return acc;
                }, { paid: 0, remain: 0, total: 0, count: 0 });
                YCI.qs("[data-finance-paid]").textContent = YCI.money(stats.totalPaid ?? totals.paid);
                YCI.qs("[data-finance-remain]").textContent = YCI.money(stats.totalRemaining ?? totals.remain);
                YCI.qs("[data-finance-total]").textContent = YCI.money(stats.totalBookingAmount ?? totals.total);
                YCI.qs("[data-finance-count]").textContent = stats.paymentCount ?? totals.count;
                renderFinanceTable(bookings);
                const breakdown = [
                    ["Theo ngày", stats.revenueByDay || {}],
                    ["Theo tháng", stats.revenueByMonth || {}],
                    ["Theo năm", stats.revenueByYear || {}]
                ];
                YCI.qs("[data-revenue-breakdown]").innerHTML = breakdown.map(([title, values]) => `
                    <article class="info-card">
                        <h3>${title}</h3>
                        <div class="compact-list">
                            ${Object.entries(values).map(([key, value]) => `
                                <div class="compact-item"><strong>${YCI.escapeHtml(key)}</strong><span>${YCI.money(value)}</span></div>
                            `).join("") || `<p class="muted">Chưa có dữ liệu.</p>`}
                        </div>
                    </article>
                `).join("");
            })
            .catch((error) => YCI.toast(error.message, "error"));
    }

    function bootSettings() {
        const configs = [
            {
                name: "category",
                form: "[data-category-form]",
                list: "[data-category-list]",
                load: "/api/category",
                add: ["/api/admin/category", "POST"],
                update: ["/api/admin/update", "PUT"],
                remove: (item) => `/api/admin/category/idCate=${item.idCategory}`,
                id: "idCategory",
                label: "nameCategory",
                sub: "description"
            },
            {
                name: "status",
                form: "[data-status-form]",
                list: "[data-status-list]",
                load: "/api/admin/status",
                add: ["/api/admin/status", "POST"],
                update: ["/api/admin/status", "PUT"],
                remove: (item) => `/api/admin/status/id=${item.idStatus}`,
                id: "idStatus",
                label: "statusCode"
            },
            {
                name: "rentalRegulation",
                form: "[data-rental-regulation-form]",
                list: "[data-rental-regulation-list]",
                load: "/api/admin/rental-regulation",
                add: ["/api/admin/rental-regulation", "POST"],
                update: ["/api/admin/rental-regulation", "PUT"],
                remove: (item) => `/api/admin/rental-regulation/id=${item.idRentalRegulations}`,
                id: "idRentalRegulations",
                label: "regulation"
            },
            {
                name: "schedule",
                form: "[data-schedule-form]",
                list: "[data-schedule-list]",
                load: "/api/admin/schedule-keeping-regulation",
                add: ["/api/admin/schedule-keeping-regulation", "POST"],
                update: ["/api/admin/schedule-keeping-regulation", "PUT"],
                remove: (item) => `/api/admin/schedule-keeping-regulation/id=${item.idScheduleKeepingRegulations}`,
                id: "idScheduleKeepingRegulations",
                label: "scheduleKeepingRegulation"
            }
        ];

        function payloadFrom(form) {
            const payload = YCI.formObject(form);
            Object.keys(payload).forEach((key) => {
                if (payload[key] === "") {
                    delete payload[key];
                }
                if (key.startsWith("id") || key === "percentDeposit") {
                    payload[key] = Number(payload[key]);
                }
            });
            return payload;
        }

        function setup(config) {
            const form = YCI.qs(config.form);
            const list = YCI.qs(config.list);
            let items = [];

            async function load() {
                items = YCI.unwrapList(await YCI.apiGet(config.load));
                list.innerHTML = items.map((item) => `
                    <div class="compact-item">
                        <div>
                            <strong>${YCI.escapeHtml(item[config.label] || "-")}</strong>
                            <p>${YCI.escapeHtml(config.sub ? item[config.sub] ?? "" : "")}</p>
                        </div>
                        <div class="button-row">
                            <button class="icon-button" type="button" data-config-edit="${item[config.id]}" aria-label="Sửa"><i data-lucide="pencil"></i></button>
                            <button class="icon-button danger" type="button" data-config-delete="${item[config.id]}" aria-label="Xóa"><i data-lucide="trash-2"></i></button>
                        </div>
                    </div>
                `).join("") || `<p class="muted">Chưa có dữ liệu.</p>`;
                YCI.iconRefresh();
            }

            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                const payload = payloadFrom(form);
                const isUpdate = Boolean(payload[config.id]);
                const [url, method] = isUpdate ? config.update : config.add;
                try {
                    await YCI.apiJson(url, method, payload);
                    YCI.toast("Đã lưu cấu hình.", "success");
                    form.reset();
                    await load();
                } catch (error) {
                    YCI.toast(error.message, "error");
                }
            });

            list.addEventListener("click", async (event) => {
                const edit = event.target.closest("[data-config-edit]");
                const remove = event.target.closest("[data-config-delete]");
                if (edit) {
                    const item = items.find((entry) => String(entry[config.id]) === edit.dataset.configEdit);
                    if (!item) return;
                    Object.keys(item).forEach((key) => {
                        if (form.elements[key]) {
                            form.elements[key].value = item[key] ?? "";
                        }
                    });
                }
                if (remove) {
                    const item = items.find((entry) => String(entry[config.id]) === remove.dataset.configDelete);
                    if (!item) return;
                    try {
                        await YCI.request(config.remove(item), { method: "DELETE" });
                        YCI.toast("Đã xóa cấu hình.", "success");
                        await load();
                    } catch (error) {
                        YCI.toast(error.message, "error");
                    }
                }
            });

            load().catch((error) => YCI.toast(error.message, "error"));
        }

        configs.forEach(setup);
    }

    document.addEventListener("DOMContentLoaded", () => {
        const page = document.body.dataset.page;
        if (page === "admin-dashboard") bootDashboard();
        if (page === "admin-bookings" || page === "staff-bookings") bootAdminBookings();
        if (page === "admin-products") bootAdminProducts();
        if (page === "admin-customers") bootCustomers();
        if (page === "admin-finance") bootFinance();
        if (page === "admin-settings") bootSettings();
    });
})();
