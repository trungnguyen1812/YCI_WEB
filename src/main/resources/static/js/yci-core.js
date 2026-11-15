(function () {
    const CART_KEY_PREFIX = "yci.rental.cart";
    const LEGACY_CART_KEY = CART_KEY_PREFIX;
    const FALLBACK_IMAGE = "/images/logo.png";
    let cartIds = [];
    let cartLoaded = false;

    function qs(selector, root = document) {
        return root.querySelector(selector);
    }

    function qsa(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    }

    function cleanText(value) {
        let text = String(value ?? "");
        if (!/[ÃÂÄÆáºá»]/.test(text) || typeof TextDecoder === "undefined") {
            return text;
        }
        for (let index = 0; index < 2; index += 1) {
            try {
                const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 255));
                const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                if (!decoded || decoded === text) {
                    break;
                }
                text = decoded;
            } catch (error) {
                break;
            }
        }
        return text;
    }

    function escapeHtml(value) {
        return cleanText(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function request(url, options = {}) {
        const response = await fetch(url, options);
        const text = await response.text();
        let body = {};
        if (text) {
            try {
                body = JSON.parse(text);
            } catch (error) {
                body = { message: text };
            }
        }
        if (!response.ok) {
            throw new Error(body.message || "Yêu cầu không thành công");
        }
        if (body.status && ["BAD_REQUEST", "NOT_FOUND", "UNAUTHORIZED", "BAD_GATEWAY"].includes(body.status)) {
            throw new Error(body.message || "Yêu cầu không thành công");
        }
        return body;
    }

    function apiGet(url) {
        return request(url);
    }

    function apiJson(url, method, payload) {
        return request(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    }

    function apiForm(url, method, formData) {
        return request(url, { method, body: formData });
    }

    function unwrapList(response) {
        if (!response) {
            return [];
        }
        if (Array.isArray(response)) {
            return response;
        }
        if (Array.isArray(response.data)) {
            return response.data;
        }
        return [];
    }

    function unwrapData(response) {
        return response && Object.prototype.hasOwnProperty.call(response, "data") ? response.data : response;
    }

    function money(value) {
        const number = Number(value || 0);
        return new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
            maximumFractionDigits: 0
        }).format(number);
    }

    function formatDate(value) {
        if (!value) {
            return "-";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value).replace("T", " ");
        }
        return new Intl.DateTimeFormat("vi-VN", {
            dateStyle: "short",
            timeStyle: "short"
        }).format(date);
    }

    function toBackendDate(localDateTimeValue) {
        if (!localDateTimeValue) {
            return "";
        }
        const [datePart, timePart = "00:00"] = localDateTimeValue.split("T");
        const [year, month, day] = datePart.split("-");
        return `${day}-${month}-${year} ${timePart}:00`;
    }

    function formatLocalDateTimeInput(date) {
        const pad = (value) => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function addHoursToLocalValue(localDateTimeValue, hours) {
        const date = new Date(localDateTimeValue);
        if (!localDateTimeValue || Number.isNaN(date.getTime()) || !hours) {
            return "";
        }
        date.setMinutes(date.getMinutes() + Math.round(Number(hours) * 60));
        return formatLocalDateTimeInput(date);
    }

    function rentalDurationHours(type) {
        const normalized = String(type || "").trim().toUpperCase().replace(",", ".");
        const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(H|GIỜ|GIO|HOUR)/);
        if (hourMatch) {
            return Number(hourMatch[1]);
        }
        const dayMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(D|DAY|NGÀY|NGAY)/);
        if (dayMatch) {
            return Number(dayMatch[1]) * 24;
        }
        return 0;
    }

    function formatDuration(hours) {
        const value = Number(hours || 0);
        if (!value) {
            return "chưa rõ thời lượng";
        }
        if (value % 24 === 0) {
            return `${value / 24} ngày`;
        }
        return `${value} giờ`;
    }

    function productImage(product) {
        const firstImage = product?.imageDTOS?.[0];
        if (product?.idProduct && firstImage?.idImage) {
            return `/api/product/${product.idProduct}/image/${firstImage.idImage}`;
        }
        const raw = firstImage?.imageBase64 || product?.imageBase64;
        if (!raw) {
            return FALLBACK_IMAGE;
        }
        if (raw.startsWith("data:") || raw.startsWith("/")) {
            return raw;
        }
        return `data:image/jpeg;base64,${raw}`;
    }

    function allProductImages(product) {
        const images = product?.imageDTOS || [];
        if (!images.length) {
            return [FALLBACK_IMAGE];
        }
        return images.map((image) => {
            if (product?.idProduct && image.idImage) {
                return `/api/product/${product.idProduct}/image/${image.idImage}`;
            }
            const raw = image.imageBase64;
            return raw?.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`;
        });
    }

    function imageFallbackAttribute() {
        return `onerror="this.onerror=null;this.closest('.product-card-media')?.classList.add('is-placeholder');this.src='${FALLBACK_IMAGE}'"`;
    }

    function minPrice(product) {
        const prices = product?.rentalPriceDTOS || [];
        if (!prices.length) {
            return 0;
        }
        return Math.min(...prices.map((price) => Number(price.price || 0)));
    }

    function hasProductImage(product) {
        return Boolean((product?.imageDTOS || []).length || product?.imageBase64);
    }

    function isProductAvailable(product) {
        return String(product?.status || "").toUpperCase().includes("AVAILABLE");
    }

    function statusClass(status) {
        const normalized = String(status || "").toUpperCase().replace(/ /g, "_");
        const map = {
            // Thiết bị
            "AVAILABLE":          "sc-available",
            "RENTED":             "sc-renting",
            "RENTING":            "sc-renting",
            "MAINTENANCE":        "sc-maintenance",
            "UNAVAILABLE":        "sc-unavailable",
            // Đơn thuê
            "WAITING_ACCEPT":     "sc-waiting",
            "WAITING ACCEPT":     "sc-waiting",
            "ACCEPTED":           "sc-accepted",
            "RECEIVED":           "sc-received",
            "NOT_YET_RECEIVED":   "sc-notyetrec",
            "NOT YET RECEIVED":   "sc-notyetrec",
            "RETURNED":           "sc-returned",
            "COMPLETED":          "sc-completed",
            "CANCELLED":          "sc-cancelled",
            "PENDING_DEPOSIT":    "sc-waiting",
            "CANCEL_REQUESTED":   "sc-waiting",
            "REFUND_PENDING":     "sc-notyetrec",
            "REFUNDED":           "sc-completed",
        };
        return map[normalized] || "sc-default";
    }

    function statusLabel(status) {
        const normalized = String(status || "").trim().toUpperCase();
        const labels = {
            "AVAILABLE": "Sẵn sàng",
            "RENTED": "Đang cho thuê",
            "RENTING": "Đang thuê",
            "MAINTENANCE": "Bảo trì",
            "UNAVAILABLE": "Không khả dụng",
            "WAITING ACCEPT": "Chờ xác nhận",
            "WAITING_ACCEPT": "Chờ xác nhận",
            "ACCEPTED": "Đã xác nhận",
            "CANCELLED": "Đã hủy",
            "COMPLETED": "Hoàn tất",
            "RETURNED": "Đã trả",
            "NOT YET RECEIVED": "Chưa nhận",
            "RECEIVED": "Đã nhận",
            "PENDING_DEPOSIT": "Chờ thanh toán cọc",
            "CANCEL_REQUESTED": "Đang yêu cầu hủy",
            "REFUND_PENDING": "Chờ hoàn tiền",
            "REFUNDED": "Đã hoàn tiền"
        };
        return labels[normalized] || status || "Chưa rõ";
    }

    function roleLabel(role) {
        const value = Number(role);
        if (value === 0) {
            return "Quản trị viên";
        }
        if (value === 2) {
            return "Nhân viên";
        }
        return "Khách hàng";
    }

    function currentUserId() {
        return window.YCI_SESSION?.user?.idUser || null;
    }

    function isAdminUser() {
        return Number(window.YCI_SESSION?.user?.role) === 0;
    }

    function currentCartKey() {
        const userId = currentUserId();
        return userId ? `${CART_KEY_PREFIX}.user.${userId}` : `${CART_KEY_PREFIX}.guest`;
    }

    function clearLegacyCart() {
        try {
            sessionStorage.removeItem(LEGACY_CART_KEY);
            localStorage.removeItem(LEGACY_CART_KEY);
        } catch (error) {
            // Storage can be blocked in private browsing; keep the in-memory cart usable.
        }
    }

    function readStoredCart() {
        try {
            const raw = localStorage.getItem(currentCartKey());
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.map((id) => Number(id)).filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    }

    function storeCart(ids) {
        try {
            localStorage.setItem(currentCartKey(), JSON.stringify(ids));
        } catch (error) {
            toast("Trình duyệt đang chặn lưu giỏ hàng. Giỏ hiện chỉ giữ trong phiên mở trang.", "error");
        }
    }

    async function loadCart(force = false) {
        clearLegacyCart();
        if (isAdminUser()) {
            cartIds = [];
            cartLoaded = true;
            updateCartCount();
            return cartIds;
        }
        if (cartLoaded && !force) {
            return cartIds;
        }
        cartIds = readStoredCart();
        cartLoaded = true;
        updateCartCount();
        return cartIds;
    }

    async function ensureCartLoaded() {
        if (!cartLoaded) {
            await loadCart();
        }
        return cartIds;
    }

    function readCart() {
        return cartIds;
    }

    async function writeCart(ids) {
        const userId = currentUserId();
        if (isAdminUser()) {
            cartIds = [];
            updateCartCount();
            toast("Tài khoản quản trị chỉ được xem, không thể thêm hoặc đặt thuê.", "error");
            return cartIds;
        }
        if (!userId) {
            cartIds = [];
            updateCartCount();
            toast("Vui lòng đăng nhập để tiếp tục đặt thuê.", "error");
            return cartIds;
        }
        const uniqueIds = Array.from(new Set(ids.map((id) => Number(id)).filter(Boolean)));
        cartIds = uniqueIds;
        storeCart(uniqueIds);
        updateCartCount();
        return cartIds;
    }

    async function addToCart(id) {
        const userId = currentUserId();
        if (isAdminUser()) {
            toast("Tài khoản quản trị chỉ được xem, không thể thêm hoặc đặt thuê.", "error");
            return [];
        }
        if (!userId) {
            toast("Vui lòng đăng nhập để thêm thiết bị vào đơn thuê.", "error");
            return [];
        }
        await ensureCartLoaded();
        const nextIds = Array.from(new Set([...cartIds, Number(id)].filter(Boolean)));
        await writeCart(nextIds);
        toast("Đã thêm thiết bị vào đơn thuê.", "success");
        return cartIds;
    }

    async function removeFromCart(id) {
        await ensureCartLoaded();
        return writeCart(cartIds.filter((itemId) => Number(itemId) !== Number(id)));
    }

    async function clearCart() {
        return writeCart([]);
    }

    function updateCartCount() {
        const count = readCart().length;
        qsa("[data-cart-count], [data-cart-count-inline]").forEach((node) => {
            node.textContent = String(count);
        });
    }

    function productCard(product) {
        const prices = product.rentalPriceDTOS || [];
        const hasImage = hasProductImage(product);
        const available = isProductAvailable(product);
        const lowestPrice = minPrice(product);
        const priceHtml = prices.length
            ? prices.slice(0, 3).map((price) => `<span class="price-chip">${escapeHtml(price.rentalType)} ${money(price.price)}</span>`).join("")
            : `<span class="price-chip subtle">Chưa có giá</span>`;
        const orderAction = (() => {
            if (isAdminUser()) {
                return `<span class="price-chip subtle">Chỉ xem</span>`;
            }
            if (!available) {
                return `<span class="price-chip subtle">Tạm chưa thuê</span>`;
            }
            return `<button class="button primary compact" type="button" data-add-product="${product.idProduct}"><i data-lucide="plus"></i> Thêm</button>`;
        })();
        return `
            <article class="product-card">
                <a class="product-card-media ${hasImage ? "" : "is-placeholder"}" href="/products/${product.idProduct}">
                    <img src="${productImage(product)}" alt="${escapeHtml(product.nameProduct)}" ${imageFallbackAttribute()}>
                    ${!hasImage ? `<span class="image-placeholder-label">YCI Camera</span>` : ""}
                </a>
                <div class="product-card-body">
                    <div class="card-meta">
                        <span class="status-pill ${statusClass(product.status)}">${escapeHtml(statusLabel(product.status))}</span>
                        <span class="category-label">${escapeHtml(product.categoryName || "Thiết bị")}</span>
                    </div>
                    <h3><a href="/products/${product.idProduct}">${escapeHtml(product.nameProduct)}</a></h3>
                    <p class="muted">${escapeHtml(product.brand || "YCI Camera")}</p>
                    <div class="product-card-price">
                        <small>Giá từ</small>
                        <strong>${lowestPrice ? money(lowestPrice) : "Liên hệ"}</strong>
                    </div>
                    <div class="price-list">${priceHtml}</div>
                    <div class="deposit-line">
                        <span>Cọc tham khảo</span>
                        <strong>${money(product.depositPrice)}</strong>
                    </div>
                    <div class="product-actions">
                        <a class="button ghost" href="/products/${product.idProduct}">Chi tiết</a>
                        ${orderAction}
                    </div>
                </div>
            </article>
        `;
    }

    function bookingSummary(booking) {
        const paid = (booking.paymentBookingDTOS || []).reduce((sum, payment) => sum + Number(payment.price || 0), 0);
        const remain = (booking.paymentBookingDTOS || []).reduce((sum, payment) => sum + Number(payment.remainAmount || 0), 0);
        return { paid, remain };
    }

    function setOptions(select, items, getValue, getLabel, placeholder) {
        if (!select) {
            return;
        }
        select.innerHTML = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "";
        items.forEach((item) => {
            const option = document.createElement("option");
            option.value = getValue(item);
            option.textContent = cleanText(getLabel(item));
            select.appendChild(option);
        });
    }

    function formObject(form) {
        return Object.fromEntries(new FormData(form).entries());
    }

    function toast(message, type = "info") {
        let stack = qs("[data-toast-stack]");
        if (!stack) {
            stack = document.createElement("section");
            stack.className = "flash-stack";
            stack.dataset.toastStack = "true";
            document.body.appendChild(stack);
        }
        const node = document.createElement("div");
        node.className = `flash ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
        node.textContent = message;
        stack.appendChild(node);
        window.setTimeout(() => node.remove(), 4200);
    }

    function iconRefresh() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    document.addEventListener("click", (event) => {
        const addButton = event.target.closest("[data-add-product]");
        if (addButton) {
            addToCart(addButton.dataset.addProduct);
            iconRefresh();
        }
    });

    // ── Money input formatter ─────────────────────────────────
    // Áp dụng cho mọi input có attribute [data-money-input]
    // - Hiển thị dấu chấm ngăn cách hàng nghìn khi người dùng gõ
    // - Lưu giá trị thực (raw number) vào dataset.rawValue để JS đọc khi submit
    // - Tự động bind khi gọi moneyInput(el) hoặc moneyInput() cho toàn trang

    function formatMoneyDisplay(raw) {
        // raw = số nguyên không có dấu chấm
        const n = String(raw).replace(/\D/g, "");
        if (!n) return "";
        return Number(n).toLocaleString("vi-VN"); // → "1.500.000"
    }

    function parseMoneyInput(el) {
        // Đọc raw number từ input đã format
        const raw = String(el.value || "").replace(/\./g, "").replace(/,/g, "").trim();
        return raw ? Number(raw) : 0;
    }

    function bindMoneyInput(el) {
        if (el._moneyBound) return;
        el._moneyBound = true;
        el.setAttribute("autocomplete", "off");

        el.addEventListener("input", () => {
            const pos    = el.selectionStart;
            const before = el.value.length;
            const digits = el.value.replace(/\D/g, "");
            const fmt    = digits ? Number(digits).toLocaleString("vi-VN") : "";
            el.value = fmt;
            // Giữ cursor đúng vị trí sau khi format
            const diff = fmt.length - before;
            try { el.setSelectionRange(pos + diff, pos + diff); } catch (_) {}
        });

        el.addEventListener("blur", () => {
            const digits = el.value.replace(/\D/g, "");
            el.value = digits ? Number(digits).toLocaleString("vi-VN") : "";
        });

        el.addEventListener("focus", () => {
            // Khi focus: select all để dễ xóa / gõ lại
            el.select();
        });
    }

    function moneyInput(rootOrEl) {
        // Nếu truyền một element cụ thể → bind element đó
        // Nếu không truyền hoặc truyền root → bind tất cả [data-money-input] bên trong
        const root = rootOrEl instanceof Element ? rootOrEl : document;
        root.querySelectorAll("[data-money-input]").forEach(bindMoneyInput);
        if (rootOrEl instanceof Element && rootOrEl.matches("[data-money-input]")) {
            bindMoneyInput(rootOrEl);
        }
    }

    // ── Client-side pagination utility ───────────────────────
    // Dùng chung cho mọi bảng admin
    // Cách dùng:
    //   const pg = YCI.paginate(containerEl, pageSize);
    //   pg.render(rows, totalCount);   // rows = HTML string của trang hiện tại
    //   pg.slice(allItems)             // trả về items của trang hiện tại
    //   pg.reset()                     // về trang 1
    function paginate(container, pageSize = 15) {
        let current = 1;
        let total   = 1;

        function build(totalItems) {
            total = Math.max(1, Math.ceil(totalItems / pageSize));
            if (current > total) current = total;
        }

        function slice(arr) {
            build(arr.length);
            const start = (current - 1) * pageSize;
            return arr.slice(start, start + pageSize);
        }

        function render(totalItems) {
            build(totalItems);
            // Render phần controls
            const from  = Math.min((current - 1) * pageSize + 1, totalItems);
            const to    = Math.min(current * pageSize, totalItems);

            // Tạo danh sách trang (max 7 nút)
            function pageNums() {
                const pages = [];
                if (total <= 7) {
                    for (let i = 1; i <= total; i++) pages.push(i);
                    return pages;
                }
                pages.push(1);
                if (current > 3)  pages.push("…");
                for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
                if (current < total - 2) pages.push("…");
                pages.push(total);
                return pages;
            }

            const nums = pageNums().map(p =>
                p === "…"
                    ? `<span class="pg-ellipsis">…</span>`
                    : `<button class="pg-btn ${p === current ? "is-active" : ""}" data-pg="${p}">${p}</button>`
            ).join("");

            container.innerHTML = `
                <div class="pg-info">Hiển thị ${totalItems ? from + "–" + to : 0} / ${totalItems} mục</div>
                <div class="pg-controls">
                    <button class="pg-btn pg-prev" data-pg="${current - 1}" ${current <= 1 ? "disabled" : ""}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    ${nums}
                    <button class="pg-btn pg-next" data-pg="${current + 1}" ${current >= total ? "disabled" : ""}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
            `;

            // Bind click
            container.querySelectorAll("[data-pg]").forEach(btn => {
                if (btn.disabled) return;
                btn.addEventListener("click", () => {
                    const p = Number(btn.dataset.pg);
                    if (p < 1 || p > total || p === current) return;
                    current = p;
                    container.dispatchEvent(new CustomEvent("pg:change", { detail: { page: current } }));
                });
            });
        }

        function reset() { current = 1; }
        function getPage() { return current; }

        return { slice, render, reset, getPage };
    }

    document.addEventListener("DOMContentLoaded", () => {
        loadCart();
        updateCartCount();
        iconRefresh();
        moneyInput(); // bind tất cả input tiền trên trang
    });

    window.YCI = {
        qs,
        qsa,
        request,
        apiGet,
        apiJson,
        apiForm,
        unwrapList,
        unwrapData,
        cleanText,
        escapeHtml,
        money,
        formatDate,
        toBackendDate,
        addHoursToLocalValue,
        rentalDurationHours,
        formatDuration,
        productImage,
        allProductImages,
        minPrice,
        hasProductImage,
        isProductAvailable,
        statusClass,
        statusLabel,
        roleLabel,
        isAdminUser,
        loadCart,
        readCart,
        writeCart,
        addToCart,
        removeFromCart,
        clearCart,
        updateCartCount,
        productCard,
        imageFallbackAttribute,
        bookingSummary,
        setOptions,
        formObject,
        toast,
        iconRefresh,
        FALLBACK_IMAGE,
        moneyInput,
        parseMoneyInput,
        paginate
    };
})();

// ── Password toggle ───────────────────────────────────────
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    // đổi icon eye / eye-off
    btn.innerHTML = isHidden
        ? '<i data-lucide="eye-off"></i>'
        : '<i data-lucide="eye"></i>';
    // re-render lucide icon mới
    if (window.lucide) lucide.createIcons();
}
