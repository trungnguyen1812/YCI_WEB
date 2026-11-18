(function () {
    async function loadProducts() {
        return YCI.unwrapList(await YCI.apiGet("/api/product/all"));
    }

    async function loadCategories() {
        return YCI.unwrapList(await YCI.apiGet("/api/category"));
    }

    function bootHome() {
        Promise.all([loadProducts(), loadCategories(), YCI.apiGet("/api/combo")])
            .then(([products, categories, comboResponse]) => {
                const available = products.filter((item) => String(item.status || "").toUpperCase().includes("AVAILABLE"));
                const featured = YCI.qs("[data-featured-products]");
                const strip = YCI.qs("[data-category-strip]");
                const comboGrid = YCI.qs("[data-combo-home-grid]");
                const comboSection = document.getElementById("combos");

                YCI.qs("[data-stat-products]").textContent = products.length;
                YCI.qs("[data-stat-categories]").textContent = categories.length;
                YCI.qs("[data-stat-available]").textContent = available.length;

                strip.innerHTML = categories.slice(0, 4).map((category) => `
                    <a class="category-card" href="/products?category=${category.idCategory}">
                        <strong>${YCI.escapeHtml(category.nameCategory)}</strong>
                        <p class="muted">${YCI.escapeHtml(category.description || "Thiết bị phù hợp cho nhiều lịch chụp.")}</p>
                    </a>
                `).join("");
                // ── Combo section ───────────────────────────────────
                const combos = YCI.unwrapList(comboResponse).filter(c => c.active);
                if (!combos.length) {
                    if (comboSection) comboSection.hidden = true;
                } else {
                    if (comboSection) comboSection.hidden = false;
                    comboGrid.innerHTML = combos.slice(0, 4).map((combo) => {
                        const thumb = combo.imageDTOS?.[0]?.imageBase64
                            ? (combo.imageDTOS[0].imageBase64.startsWith("data:") ? combo.imageDTOS[0].imageBase64 : "data:image/jpeg;base64," + combo.imageDTOS[0].imageBase64)
                            : null;
                        const origPerDay  = combo.totalPricePerDay || 0;
                        const dealPerDay  = combo.discountPrice || 0;
                        const saving      = origPerDay > 0 ? origPerDay - dealPerDay : 0;
                        const savingPct   = origPerDay > 0 ? Math.round((saving / origPerDay) * 100) : 0;
                        const badgeText   = savingPct > 0 ? `Tiết kiệm ${savingPct}%` : (saving > 0 ? `Tiết kiệm ${YCI.money(saving)}` : "Combo ưu đãi");
                        const productNames = (combo.products || []).map(p => YCI.escapeHtml(p.nameProduct)).join(" · ");
                        const statusHtml  = combo.comboStatus && combo.comboStatus !== "AVAILABLE"
                            ? `<span class="status-pill ${YCI.statusClass(combo.comboStatus)}" style="position:absolute;top:14px;right:14px;z-index:2;">${YCI.escapeHtml(YCI.statusLabel(combo.comboStatus))}</span>`
                            : "";
                        return `
                            <article class="combo-home-card">
                                <div class="combo-home-badge">
                                    <i data-lucide="tag"></i> ${badgeText}
                                </div>
                                ${statusHtml}
                                <a class="combo-home-media ${thumb ? "" : "is-placeholder"}" href="/combos/${combo.idCombo}">
                                    ${thumb
                                        ? `<img src="${thumb}" alt="${YCI.escapeHtml(combo.nameCombo)}">`
                                        : `<div class="combo-home-media-ph"><i data-lucide="package"></i></div>`
                                    }
                                </a>
                                <div class="combo-home-body">
                                    <h3><a href="/combos/${combo.idCombo}">${YCI.escapeHtml(combo.nameCombo)}</a></h3>
                                    <div class="combo-home-items">
                                        <i data-lucide="layers"></i>
                                        <span>${productNames || "Xem chi tiết combo"}</span>
                                    </div>
                                    <div class="combo-home-price">
                                        ${origPerDay > 0 ? `<s class="combo-home-orig">${YCI.money(origPerDay)}</s>` : ""}
                                        <div>
                                            <strong class="combo-home-deal">${YCI.money(dealPerDay)}</strong>
                                            <span class="combo-home-unit">/ngày</span>
                                        </div>
                                    </div>
                                    ${combo.comboStatus === "RENTING" || combo.comboStatus === "UNAVAILABLE"
                                        ? `<button class="button full" disabled style="opacity:.55;cursor:not-allowed;border-radius:12px;">
                                                <i data-lucide="clock"></i> ${YCI.statusLabel(combo.comboStatus)}
                                           </button>`
                                        : `<a class="button primary full combo-home-cta" href="/combos/${combo.idCombo}" data-combo-id="${combo.idCombo}">
                                                <i data-lucide="calendar-plus"></i> Đặt combo này
                                           </a>`
                                    }                                </div>
                            </article>
                        `;
                    }).join("");

                    // Gắn event "Đặt combo" cho từng card
                    comboGrid.querySelectorAll("[data-combo-id]").forEach(btn => {
                        btn.addEventListener("click", async (e) => {
                            e.preventDefault();
                            const comboId = Number(btn.dataset.comboId);
                            const c = combos.find(x => x.idCombo === comboId);
                            if (!c) return;
                            if (c.comboStatus === "RENTING" || c.comboStatus === "UNAVAILABLE") {
                                YCI.toast("Combo này hiện đang được thuê hoặc không khả dụng.", "error");
                                return;
                            }
                            await addComboToCart(c);
                        });
                    });
                }

                // ── Featured products ────────────────────────────────
                const featuredProducts = [...products].sort((left, right) => {
                    return Number((right.imageDTOS || []).length > 0) - Number((left.imageDTOS || []).length > 0);
                });
                featured.innerHTML = featuredProducts.slice(0, 6).map(YCI.productCard).join("");
                YCI.iconRefresh();
            })
            .catch((error) => YCI.toast(error.message, "error"));
    }

    function bootCatalog() {
        // Lấy loại catalog từ data attribute trên body
        const catalogType = document.body.dataset.catalogType || "all";

        const state = {
            products: [],
            categories: [],
            search: new URLSearchParams(window.location.search).get("q") || "",
            category: new URLSearchParams(window.location.search).get("category") || "",
            status: ""
        };
        const list = YCI.qs("[data-product-list]");
        const empty = YCI.qs("[data-empty-products]");
        const searchInput = YCI.qs("[data-product-search]");
        const statusFilter = YCI.qs("[data-status-filter]");
        const categoryFilter = YCI.qs("[data-category-filter]");

        // Keyword lọc theo loại catalog
        const CATALOG_KEYWORDS = {
            cameras: ["máy ảnh", "camera", "mirrorless", "dslr", "fullframe"],
            accessories: ["ống kính", "lens", "đèn", "flash", "tripod", "phụ kiện", "filter", "bag", "túi", "hood", "cap"]
        };

        function matchesCatalogType(product) {
            if (catalogType === "all") return true;
            const keywords = CATALOG_KEYWORDS[catalogType];
            if (!keywords) return true;
            const text = YCI.cleanText([
                product.nameProduct, product.brand, product.categoryName, product.description
            ].join(" ")).toLowerCase();
            return keywords.some(kw => text.includes(kw));
        }

        function renderFilters() {
            const buttons = [{ idCategory: "", nameCategory: "Tất cả" }, ...state.categories];
            categoryFilter.innerHTML = buttons.map((category) => `
                <button class="segment ${String(category.idCategory) === String(state.category) ? "is-active" : ""}"
                        type="button"
                        data-category-id="${category.idCategory}">
                    ${YCI.escapeHtml(category.nameCategory)}
                </button>
            `).join("");
        }

        function render() {
            const keyword = state.search.trim().toLowerCase();
            const filtered = state.products.filter((product) => {
                const text = YCI.cleanText([product.nameProduct, product.brand, product.serialNumber, product.categoryName].join(" ")).toLowerCase();
                const matchSearch = !keyword || text.includes(keyword);
                const matchCategory = !state.category || String(product.categoryId) === String(state.category);
                const matchStatus = !state.status || String(product.status || "").toUpperCase().includes(state.status);
                const matchType = matchesCatalogType(product);
                return matchSearch && matchCategory && matchStatus && matchType;
            });
            list.innerHTML = filtered.map(YCI.productCard).join("");
            empty.hidden = filtered.length > 0;
            YCI.qs("[data-catalog-count]").textContent = state.products.filter(matchesCatalogType).length;
            YCI.qs("[data-catalog-available]").textContent = state.products
                .filter(p => matchesCatalogType(p) && String(p.status || "").toUpperCase().includes("AVAILABLE")).length;
            YCI.updateCartCount();
            YCI.iconRefresh();
        }

        searchInput.value = state.search;
        searchInput.addEventListener("input", () => {
            state.search = searchInput.value;
            render();
        });
        statusFilter.addEventListener("change", () => {
            state.status = statusFilter.value;
            render();
        });
        categoryFilter.addEventListener("click", (event) => {
            const button = event.target.closest("[data-category-id]");
            if (!button) {
                return;
            }
            state.category = button.dataset.categoryId;
            renderFilters();
            render();
        });

        Promise.all([loadProducts(), loadCategories()])
            .then(([products, categories]) => {
                state.products = products;
                state.categories = categories;
                renderFilters();
                render();
            })
            .catch((error) => YCI.toast(error.message, "error"));
    }

    function bootProductDetail() {
        const root = YCI.qs("[data-product-id]");
        const id = root?.dataset.productId;
        if (!id) {
            return;
        }
        YCI.apiGet(`/api/product/id-product=${id}`)
            .then((response) => {
                const product = YCI.unwrapData(response);
                const images = YCI.allProductImages(product);
                const mainImage = YCI.qs("[data-product-image]");
                mainImage.onerror = () => {
                    mainImage.onerror = null;
                    mainImage.src = YCI.FALLBACK_IMAGE;
                };
                mainImage.src = images[0];
                mainImage.alt = YCI.cleanText(product.nameProduct || "Thiết bị YCI");
                YCI.qs("[data-product-crumb]").textContent = YCI.cleanText(product.nameProduct || "Chi tiết");
                YCI.qs("[data-product-name]").textContent = YCI.cleanText(product.nameProduct || "Thiết bị");
                YCI.qs("[data-product-description]").textContent = YCI.cleanText(product.description || "Chưa có mô tả.");
                YCI.qs("[data-product-brand]").textContent = YCI.cleanText(product.brand || "-");
                YCI.qs("[data-product-category]").textContent = YCI.cleanText(product.categoryName || "-");
                YCI.qs("[data-product-serial]").textContent = YCI.cleanText(product.serialNumber || "-");
                YCI.qs("[data-product-deposit]").textContent = YCI.money(product.depositPrice);
                const status = YCI.qs("[data-product-status]");
                status.textContent = YCI.statusLabel(product.status);
                status.className = `status-pill ${YCI.statusClass(product.status)}`;
                YCI.qs("[data-product-prices]").innerHTML = (product.rentalPriceDTOS || []).length
                    ? `<div class="price-list">${product.rentalPriceDTOS.map((price) => `<span class="price-chip">${YCI.escapeHtml(price.rentalType)} ${YCI.money(price.price)}</span>`).join("")}</div>`
                    : `<p class="muted">Chưa có giá thuê cho thiết bị này.</p>`;
                YCI.qs("[data-product-thumbs]").innerHTML = images.map((image, index) => `
                    <button class="${index === 0 ? "is-active" : ""}" type="button" data-thumb-index="${index}">
                        <img src="${image}" alt="Ảnh ${index + 1}" ${YCI.imageFallbackAttribute()}>
                    </button>
                `).join("");
                YCI.qs("[data-product-thumbs]").addEventListener("click", (event) => {
                    const button = event.target.closest("[data-thumb-index]");
                    if (!button) {
                        return;
                    }
                    mainImage.src = images[Number(button.dataset.thumbIndex)];
                    YCI.qsa("[data-thumb-index]").forEach((item) => item.classList.toggle("is-active", item === button));
                });
                if (YCI.isAdminUser()) {
                    YCI.qs("[data-product-actions]").innerHTML = `<span class="price-chip subtle">Tài khoản quản trị chỉ xem thông tin, không thể thêm hoặc đặt thuê.</span>`;
                } else {
                    YCI.qs("[data-add-current-product]").addEventListener("click", () => YCI.addToCart(product.idProduct));
                }
                YCI.iconRefresh();
            })
            .catch((error) => YCI.toast(error.message, "error"));
    }

    function bootPricing() {

        Promise.all([
            loadProducts(),
            YCI.apiGet("/api/deposit-type"),
            YCI.apiGet("/api/admin/rental-regulation")
        ])
            .then(([products, depositResponse, regulationResponse]) => {

                // ── Bảng giá ──────────────────────────────────────────
                YCI.qs("[data-pricing-table]").innerHTML = products.length
                    ? products.map((product) => `
                        <tr>
                            <td data-label="Thiết bị"><strong>${YCI.escapeHtml(product.nameProduct)}</strong><br><span class="muted">${YCI.escapeHtml(product.brand || "YCI Camera")}</span></td>
                            <td data-label="Danh mục">${YCI.escapeHtml(product.categoryName || "-")}</td>
                            <td data-label="Tình trạng"><span class="status-pill ${YCI.statusClass(product.status)}">${YCI.escapeHtml(YCI.statusLabel(product.status))}</span></td>
                            <td data-label="Giá thuê">${(product.rentalPriceDTOS || []).map((price) => `<span class="price-chip">${YCI.escapeHtml(price.rentalType)} ${YCI.money(price.price)}</span>`).join(" ") || `<span class="price-chip subtle">Chưa có giá</span>`}</td>
                            <td data-label="Cọc tham chiếu"><strong>${YCI.money(product.depositPrice)}</strong></td>
                        </tr>
                    `).join("")
                    : `<tr><td colspan="5"><div class="empty-state small"><i data-lucide="tag"></i><h3>Chưa có bảng giá</h3><p>Khi quản trị thêm thiết bị và giá thuê, dữ liệu sẽ hiển thị tại đây.</p></div></td></tr>`;

                // ── Chính sách cọc ─────────────────────────────────────
                const depositIcons = ["shield", "diamond", "star", "zap", "award"];
                const depositColors = [
                    { bg: "linear-gradient(135deg,#fff0f7,#fff)", accent: "#e91e83" },
                    { bg: "linear-gradient(135deg,#f0f7ff,#fff)", accent: "#4f6fae" },
                    { bg: "linear-gradient(135deg,#f0fff8,#fff)", accent: "#1c8f65" },
                    { bg: "linear-gradient(135deg,#fffbf0,#fff)", accent: "#b06a00" },
                    { bg: "linear-gradient(135deg,#f7f0ff,#fff)", accent: "#7c3aed" }
                ];
                const deposits = YCI.unwrapList(depositResponse);
                const depositList = deposits.length ? deposits : [
                    { type: "Đặt lịch tiêu chuẩn", percentDeposit: 30 },
                    { type: "Thiết bị giá trị cao", percentDeposit: 50 },
                    { type: "Lịch cao điểm / ngày lễ", percentDeposit: 70 }
                ];
                const depositEl = YCI.qs("[data-deposit-types]");
                if (depositEl) {
                    depositEl.innerHTML = depositList.map((deposit, idx) => {
                        const color = depositColors[idx % depositColors.length];
                        const icon = depositIcons[idx % depositIcons.length];
                        const pct = Number(deposit.percentDeposit || 0);
                        return `
                            <article class="pricing-deposit-card" style="background:${color.bg}">
                                <div class="pricing-deposit-icon" style="color:${color.accent};background:${color.accent}18">
                                    <i data-lucide="${icon}"></i>
                                </div>
                                <div class="pricing-deposit-pct" style="color:${color.accent}">${pct}%</div>
                                <h3>${YCI.escapeHtml(deposit.type || "Chính sách cọc")}</h3>
                                <p>Mức cọc ${pct}% trên tổng giá thuê, áp dụng khi nhân viên xác nhận đơn.</p>
                            </article>
                        `;
                    }).join("");
                }

                // ── Quy định thuê từ hệ thống ──────────────────────────
                const regulationItems = YCI.unwrapList(regulationResponse)
                    .map((item) => item.regulation)
                    .filter(Boolean);
                const regulationEl = YCI.qs("[data-pricing-regulations]");
                if (regulationEl) {
                    if (regulationItems.length) {
                        regulationEl.innerHTML = regulationItems.map((text) => `
                            <div class="pricing-reg-item">
                                <span class="pricing-reg-dot"><i data-lucide="check-circle-2"></i></span>
                                <p>${YCI.escapeHtml(text)}</p>
                            </div>
                        `).join("");
                    } else {
                        regulationEl.innerHTML = `
                            <div class="pricing-reg-item"><span class="pricing-reg-dot"><i data-lucide="check-circle-2"></i></span><p>Khách cần đăng nhập và cung cấp thông tin liên hệ hợp lệ khi tạo đơn thuê.</p></div>
                            <div class="pricing-reg-item"><span class="pricing-reg-dot"><i data-lucide="check-circle-2"></i></span><p>Mỗi đơn có thể gồm nhiều thiết bị; giá thuê tính theo gói giờ hoặc ngày đã chọn.</p></div>
                            <div class="pricing-reg-item"><span class="pricing-reg-dot"><i data-lucide="check-circle-2"></i></span><p>YCI giữ thiết bị sau khi nhân viên xác nhận đơn và khách hoàn thành đặt cọc.</p></div>
                            <div class="pricing-reg-item"><span class="pricing-reg-dot"><i data-lucide="check-circle-2"></i></span><p>Thiết bị cần trả đúng giờ; phí trả trễ được tính theo thực tế tại thời điểm hoàn trả.</p></div>
                            <div class="pricing-reg-item"><span class="pricing-reg-dot"><i data-lucide="check-circle-2"></i></span><p>Hư hỏng phát sinh được thông báo và xử lý theo quy định cửa hàng trước khi tất toán.</p></div>
                        `;
                    }
                }

                YCI.iconRefresh();
            })
            .catch((error) => YCI.toast(error.message, "error"));

    }

    function bootRegulations() {
        const fallbackGroups = [
            {
                key: "rental",
                icon: "camera",
                eyebrow: "Thuê thiết bị",
                title: "Quy định thuê thiết bị",
                items: [
                    "Khách cần đăng nhập, cung cấp thông tin liên hệ và giấy tờ thế chấp hợp lệ khi tạo đơn thuê.",
                    "Mỗi đơn có thể gồm nhiều thiết bị; giá thuê được tính theo gói giờ/ngày đã chọn.",
                    "YCI chỉ giữ thiết bị sau khi nhân viên xác nhận đơn và mức cọc tương ứng."
                ]
            },
            {
                key: "schedule",
                icon: "calendar-check",
                eyebrow: "Giữ lịch",
                title: "Quy định giữ lịch",
                items: [
                    "Lịch đặt được ưu tiên theo thời điểm gửi yêu cầu và tình trạng sẵn sàng của thiết bị.",
                    "Khách nên gửi yêu cầu sớm để nhân viên kiểm tra trùng lịch trước ngày nhận máy.",
                    "Đơn chưa xác nhận có thể bị hủy nếu thiết bị không còn phù hợp với lịch thuê."
                ]
            },
            {
                key: "pickup",
                icon: "clipboard-check",
                eyebrow: "Nhận máy",
                title: "Nhận thiết bị",
                items: [
                    "Khi nhận máy, khách và nhân viên cùng đối chiếu serial, phụ kiện đi kèm và tình trạng ngoại hình.",
                    "Khách thanh toán cọc hoặc khoản cần thu theo xác nhận trước khi mang thiết bị đi.",
                    "YCI khuyến nghị kiểm tra pin, thẻ nhớ, cap và phụ kiện ngay tại quầy."
                ]
            },
            {
                key: "return",
                icon: "rotate-ccw",
                eyebrow: "Hoàn trả",
                title: "Trả thiết bị",
                items: [
                    "Thiết bị cần được trả đúng giờ theo đơn thuê để tránh phí trả trễ.",
                    "Nhân viên kiểm tra lại tình trạng trước khi tất toán hoặc ghi nhận khoản còn lại.",
                    "Khách nên giữ nguyên phụ kiện, hộp túi và tình trạng vệ sinh như khi nhận."
                ]
            },
            {
                key: "fees",
                icon: "wrench",
                eyebrow: "Phát sinh",
                title: "Hư hỏng và phí phát sinh",
                items: [
                    "Phí trả trễ, vệ sinh hoặc sửa chữa được ghi nhận theo thực tế khi hoàn trả.",
                    "Nếu thiết bị hư hỏng, YCI sẽ kiểm tra mức độ và thông báo chi phí xử lý cho khách.",
                    "Các khoản phát sinh sẽ được cộng vào phần thanh toán còn lại của đơn thuê."
                ]
            },
            {
                key: "payment",
                icon: "wallet-cards",
                eyebrow: "Cọc và thanh toán",
                title: "Cọc và thanh toán",
                items: [
                    "Tiền cọc hiển thị trên website là mức tham khảo; mức thực thu do nhân viên áp dụng khi xác nhận.",
                    "Thanh toán và số tiền còn lại được theo dõi trong lịch sử đơn thuê của khách.",
                    "Sau khi trả máy và không có phát sinh, khoản cọc được đối soát theo quy định cửa hàng."
                ]
            }
        ];

        function ruleCard(group, items, isFallback = false) {
            const lines = items && items.length ? items : group.items;
            const colorMap = {
                rental:   { accent: "#e91e83", bg: "rgba(233,30,131,.08)",  light: "#fff0f7" },
                schedule: { accent: "#4f6fae", bg: "rgba(79,111,174,.08)", light: "#f0f7ff" },
                pickup:   { accent: "#1c8f65", bg: "rgba(28,143,101,.08)", light: "#f0fff8" },
                return:   { accent: "#b06a00", bg: "rgba(176,106,0,.08)",  light: "#fffbf0" },
                fees:     { accent: "#bd1f54", bg: "rgba(189,31,84,.08)",  light: "#fff0f4" },
                payment:  { accent: "#7c3aed", bg: "rgba(124,58,237,.08)", light: "#f7f0ff" }
            };
            const c = colorMap[group.key] || colorMap.rental;
            return `
                <article class="reg-card" id="${group.key}">
                    <div class="reg-card-header" style="background:${c.light}">
                        <span class="reg-card-icon" style="background:${c.bg};color:${c.accent}">
                            <i data-lucide="${group.icon}"></i>
                        </span>
                        <div>
                            <p class="reg-card-eyebrow" style="color:${c.accent}">${YCI.escapeHtml(group.eyebrow)}</p>
                            <h2 class="reg-card-title">${YCI.escapeHtml(group.title)}</h2>
                        </div>
                    </div>
                    <div class="reg-card-body">
                        <ol class="reg-list">
                            ${lines.map((line) => `
                                <li class="reg-list-item">
                                    <span class="reg-list-dot" style="background:${c.accent}18;color:${c.accent}">
                                        <i data-lucide="check"></i>
                                    </span>
                                    <span>${YCI.escapeHtml(line)}</span>
                                </li>
                            `).join("")}
                        </ol>
                    </div>
                </article>
            `;
        }

        Promise.all([
            YCI.apiGet("/api/admin/rental-regulation"),
            YCI.apiGet("/api/admin/schedule-keeping-regulation")
        ])
            .then(([rentalResponse, scheduleResponse]) => {
                const rentalItems = YCI.unwrapList(rentalResponse).map((item) => item.regulation).filter(Boolean);
                const scheduleItems = YCI.unwrapList(scheduleResponse).map((item) => item.scheduleKeepingRegulation).filter(Boolean);
                const board = YCI.qs("[data-regulation-board]");
                board.innerHTML = fallbackGroups.map((group) => {
                    if (group.key === "rental") {
                        return ruleCard(group, rentalItems, rentalItems.length === 0);
                    }
                    if (group.key === "schedule") {
                        return ruleCard(group, scheduleItems, scheduleItems.length === 0);
                    }
                    return ruleCard(group, group.items, true);
                }).join("");
                YCI.iconRefresh();

                // Highlight active sidebar link on scroll
                const navLinks = document.querySelectorAll(".reg-nav-link");
                if (navLinks.length) {
                    const cards = document.querySelectorAll(".reg-card[id]");
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting) {
                                navLinks.forEach((l) => l.classList.remove("is-active"));
                                const active = document.querySelector(`.reg-nav-link[href="#${entry.target.id}"]`);
                                if (active) active.classList.add("is-active");
                            }
                        });
                    }, { rootMargin: "-30% 0px -60% 0px" });
                    cards.forEach((c) => observer.observe(c));
                }
            })
            .catch((error) => YCI.toast(error.message, "error"));
    }

    function bootBooking() {
        const cartNode       = YCI.qs("[data-booking-cart]");
        const emptyNode      = YCI.qs("[data-empty-cart]");
        const totalNode      = YCI.qs("[data-booking-total]");
        const depositRefNode = YCI.qs("[data-booking-deposit-reference]");
        const form           = YCI.qs("[data-booking-form]");
        const durationInfo   = document.getElementById("durationInfo");
        const durationText   = document.getElementById("durationText");
        const timelineWrap   = document.getElementById("bookingTimeline");
        const weekLabel      = document.getElementById("tlWeekLabel");
        const btnPrev        = document.getElementById("tlPrev");
        const btnNext        = document.getElementById("tlNext");

        const dateRowDaily   = document.getElementById("dateRowDaily");
        const dateRowHourly  = document.getElementById("dateRowHourly");
        const inputDateStart = document.getElementById("inputDateStart");
        const inputDateEnd   = document.getElementById("inputDateEnd");
        const inputTimeStart = document.getElementById("inputTimeStart");
        const inputTimeEnd   = document.getElementById("inputTimeEnd");

        // ── Detect combo-booking flag NGAY ĐẦU (trước mọi render) ──────
        let comboBookingInfo = null;
        try {
            const raw = sessionStorage.getItem("yci.combo-booking");
            if (raw) {
                comboBookingInfo = JSON.parse(raw);
                sessionStorage.removeItem("yci.combo-booking");
            }
        } catch (e) {}

        let products = [], selectedProducts = [], allBookings = [];
        // Nếu đặt combo → bắt buộc daily, không cho đổi
        let priceType = comboBookingInfo ? "daily" : "hourly";
        let rentalTypesList = [];
        let tlViewDate = new Date();
        let tlWeekOffset = 0;

        // Nếu có combo → switch UI ngay, trước khi render
        if (comboBookingInfo) {
            document.querySelectorAll("[data-price-type]").forEach(b => {
                b.classList.toggle("is-active", b.dataset.priceType === "daily");
            });
            if (dateRowDaily)  dateRowDaily.hidden  = false;
            if (dateRowHourly) dateRowHourly.hidden = true;
            const priceTypeRow = document.querySelector(".booking-price-type-row");
            if (priceTypeRow) {
                priceTypeRow.innerHTML = `
                    <div class="combo-booking-banner">
                        <i data-lucide="package"></i>
                        <div class="combo-booking-banner-info">
                            <strong>${YCI.escapeHtml(comboBookingInfo.nameCombo || "Combo")}</strong>
                            <span>Chỉ thuê theo <strong>ngày</strong>. Chọn ngày bắt đầu và kết thúc bên dưới.</span>
                        </div>
                        <div class="combo-booking-price">
                            <strong>${YCI.money(comboBookingInfo.discountPrice)}</strong>
                            <small>/ngày</small>
                        </div>
                    </div>`;
                YCI.iconRefresh();
            }
        }

        const pad = n => String(n).padStart(2, "0");
        const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
        const startOfWeek = d => { const r = new Date(d); r.setDate(r.getDate()-((r.getDay()+6)%7)); r.setHours(0,0,0,0); return r; };

        function hourlyPrice(p) {
            const pr = (p.rentalPriceDTOS||[]).find(x => /gi[oờ]|hour/i.test(x.rentalType));
            return pr ? Number(pr.price||0) : ((p.rentalPriceDTOS||[]).length ? Number(p.rentalPriceDTOS[0].price||0) : 0);
        }
        function dailyPrice(p) {
            const pr = (p.rentalPriceDTOS||[]).find(x => /ng[àa]y|day/i.test(x.rentalType));
            return pr ? Number(pr.price||0) : 0;
        }
        function selectedRentalType() {
            if (priceType === "daily") return rentalTypesList.find(rt => /ng[àa]y|day/i.test(rt.type)) || rentalTypesList[0] || null;
            return rentalTypesList.find(rt => /gi[oờ]|hour/i.test(rt.type)) || rentalTypesList[0] || null;
        }

        function calcDailyDays() {
            if (!inputDateStart.value || !inputDateEnd.value) return 0;
            const s = new Date(inputDateStart.value), e = new Date(inputDateEnd.value);
            return (isNaN(s)||isNaN(e)||e<=s) ? 0 : Math.ceil((e-s)/86400000);
        }
        function calcHourlyHours() {
            if (!inputTimeStart.value || !inputTimeEnd.value) return 0;
            const s = new Date(inputTimeStart.value), e = new Date(inputTimeEnd.value);
            return (isNaN(s)||isNaN(e)||e<=s) ? 0 : Math.ceil((e-s)/3600000);
        }
        function calcTotal() {
            if (priceType === "daily") {
                const d = calcDailyDays();
                // Nếu đặt combo: dùng discountPrice của combo thay vì tổng lẻ
                if (comboBookingInfo && comboBookingInfo.discountPrice) {
                    return comboBookingInfo.discountPrice * d;
                }
                return selectedProducts.reduce((s,p) => s + dailyPrice(p)*d, 0);
            }
            const h = calcHourlyHours();
            return selectedProducts.reduce((s,p) => s + hourlyPrice(p)*h, 0);
        }

        function fmtDate(val) { if (!val) return "—"; const d=new Date(val); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`; }
        function fmtDT(val) { if (!val) return "—"; const d=new Date(val); return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

        function updateTotals() {
            totalNode.textContent = YCI.money(calcTotal());
            // Cọc: với combo dùng tổng cọc các thiết bị, với lẻ như bình thường
            depositRefNode.textContent = YCI.money(selectedProducts.reduce((s,p) => s+Number(p.depositPrice||0), 0));
            if (priceType === "daily") {
                const d = calcDailyDays();
                if (d > 0) {
                    const priceLabel = comboBookingInfo
                        ? `${YCI.money(comboBookingInfo.discountPrice)} × ${d} ngày`
                        : `${d} ngày`;
                    durationText.textContent = `${priceLabel} · ${fmtDate(inputDateStart.value)} → ${fmtDate(inputDateEnd.value)}`;
                    durationInfo.hidden = false;
                } else {
                    durationInfo.hidden = true;
                }
            } else {
                const h = calcHourlyHours();
                if (h > 0) { durationText.textContent = `${h} giờ · ${fmtDT(inputTimeStart.value)} → ${fmtDT(inputTimeEnd.value)}`; durationInfo.hidden = false; }
                else durationInfo.hidden = true;
            }
        }

        function renderCart() {
            const ids = YCI.readCart();
            selectedProducts = ids.map(id => products.find(p => Number(p.idProduct)===Number(id))).filter(Boolean);
            emptyNode.hidden = selectedProducts.length > 0;

            if (comboBookingInfo) {
                // Chế độ combo — hiện danh sách thiết bị nhưng không hiện giá lẻ
                cartNode.innerHTML = selectedProducts.map(p => `
                    <article class="booking-item"><div class="booking-item-main">
                        <img src="${YCI.productImage(p)}" alt="${YCI.escapeHtml(p.nameProduct)}" ${YCI.imageFallbackAttribute()}>
                        <div>
                            <strong>${YCI.escapeHtml(p.nameProduct)}</strong>
                            <p class="muted">${YCI.escapeHtml(p.categoryName||"")} · ${YCI.escapeHtml(p.brand||"")}</p>
                            <span class="price-chip" style="background:#fff0f7;color:#b41463;margin-top:4px;">Giá tính theo combo</span>
                        </div>
                    </div></article>`).join("");
            } else {
                cartNode.innerHTML = selectedProducts.map(p => {
                    const pH = hourlyPrice(p), pD = dailyPrice(p);
                    const chips = [pH?`<span class="price-chip">${YCI.money(pH)} / giờ</span>`:null, pD?`<span class="price-chip" style="background:#e8f0fe;color:#1a56db;">${YCI.money(pD)} / ngày</span>`:null].filter(Boolean).join("")||`<span class="price-chip subtle">Chưa có giá</span>`;
                    return `<article class="booking-item"><div class="booking-item-main">
                        <img src="${YCI.productImage(p)}" alt="${YCI.escapeHtml(p.nameProduct)}" ${YCI.imageFallbackAttribute()}>
                        <div><strong>${YCI.escapeHtml(p.nameProduct)}</strong><p class="muted">${YCI.escapeHtml(p.categoryName||"")} · ${YCI.escapeHtml(p.brand||"")}</p>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${chips}</div>
                        <span class="price-chip subtle" style="margin-top:4px;">Cọc ${YCI.money(p.depositPrice)}</span></div>
                        <button class="icon-button danger" type="button" data-remove-cart="${p.idProduct}" aria-label="Xóa"><i data-lucide="x"></i></button>
                    </div></article>`;
                }).join("");
            }
            updateTotals(); renderTimeline(); YCI.iconRefresh();
        }

        cartNode.addEventListener("click", async e => { const b=e.target.closest("[data-remove-cart]"); if(!b)return; await YCI.removeFromCart(b.dataset.removeCart); renderCart(); });
        YCI.qs("[data-clear-cart]")?.addEventListener("click", async () => { await YCI.clearCart(); renderCart(); });

        // ── Price type toggle ─────────────────────────────────
        document.querySelectorAll("[data-price-type]").forEach(btn => {
            btn.addEventListener("click", () => {
                if (comboBookingInfo) return; // lock khi đặt combo
                document.querySelectorAll("[data-price-type]").forEach(b => b.classList.remove("is-active"));                btn.classList.add("is-active");
                priceType = btn.dataset.priceType;
                dateRowDaily.hidden = priceType !== "daily";
                dateRowHourly.hidden = priceType !== "hourly";
                updateTotals(); renderTimeline();
            });
        });

        // ── Date inputs (daily) ────────────────────────────────
        const todayStr = dateStr(new Date());
        inputDateStart.min = todayStr; inputDateEnd.min = todayStr;
        inputDateStart.addEventListener("change", () => {
            // Reset nếu chọn ngày trong quá khứ
            if (inputDateStart.value && inputDateStart.value < todayStr) {
                inputDateStart.value = todayStr;
                YCI.toast("Ngày bắt đầu không được ở trong quá khứ.", "error");
            }
            if (inputDateEnd.value && inputDateEnd.value <= inputDateStart.value)
                inputDateEnd.value = dateStr(addDays(new Date(inputDateStart.value), 1));
            inputDateEnd.min = inputDateStart.value || todayStr;
            updateTotals(); renderTimeline();
        });
        inputDateEnd.addEventListener("change", () => { updateTotals(); renderTimeline(); });

        // ── Datetime inputs (hourly) ───────────────────────────
        const nowIso = () => new Date().toISOString().slice(0,16);
        inputTimeStart.min = nowIso();
        inputTimeStart.addEventListener("change", () => {
            // Reset nếu chọn giờ trong quá khứ
            if (inputTimeStart.value && inputTimeStart.value < nowIso()) {
                inputTimeStart.value = "";
                YCI.toast("Giờ bắt đầu không được ở trong quá khứ.", "error");
                return;
            }
            if (inputTimeStart.value) {
                if (!inputTimeEnd.value || inputTimeEnd.value <= inputTimeStart.value) {
                    const d = new Date(inputTimeStart.value); d.setHours(d.getHours()+1);
                    inputTimeEnd.value = `${dateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }
                inputTimeEnd.min = inputTimeStart.value;
            }
            updateTotals(); renderTimeline();
        });
        inputTimeEnd.addEventListener("change", () => { updateTotals(); renderTimeline(); });

        // ── Timeline ───────────────────────────────────────────
        // Trả về true nếu máy đang có đơn RENTING (chưa được trả, kể cả quá hẹn)
        function isProductRenting(productId) {
            return allBookings.some(b => {
                const s = String(b.status || "").toUpperCase();
                if (s !== "RENTING") return false;
                return (b.bookingDetailDTOS||[]).some(d => Number(d.productBookingDTO?.idProduct||d.idProduct)===Number(productId));
            });
        }
        function isBusy(productId, dateFrom, dateTo) {
            return allBookings.some(b => {
                // Bỏ qua đơn đã hủy, đã trả, hoàn tất
                const s = String(b.status || "").toUpperCase();
                if (s.includes("CANCEL") || s.includes("RETURNED") || s.includes("COMPLETED")) return false;
                // Đơn RENTING được xử lý riêng bằng isProductRenting — bỏ qua ở đây
                if (s === "RENTING") return false;
                const has = (b.bookingDetailDTOS||[]).some(d => Number(d.productBookingDTO?.idProduct||d.idProduct)===Number(productId));
                if (!has) return false;
                return new Date(b.timeStart||"") < dateTo && new Date(b.timeEnd||"") > dateFrom;
            });
        }
        function isDaySelected(ds) {
            if (!inputDateStart.value || !inputDateEnd.value) return false;
            return new Date(ds) >= new Date(inputDateStart.value) && new Date(ds) < new Date(inputDateEnd.value);
        }
        function isHourSelected(ds, h) {
            if (!inputTimeStart.value || !inputTimeEnd.value) return false;
            const s = new Date(inputTimeStart.value), e = new Date(inputTimeEnd.value);
            return s < new Date(`${ds}T${pad(h+1)}:00:00`) && e > new Date(`${ds}T${pad(h)}:00:00`);
        }

        // ── DAILY timeline (14-day grid) ──────────────────────
        function renderDailyTimeline() {
            if (!selectedProducts.length) { timelineWrap.innerHTML = `<div class="empty-state small"><i data-lucide="calendar-x-2"></i><p>Thêm thiết bị vào giỏ để xem lịch.</p></div>`; YCI.iconRefresh(); return; }
            const start = addDays(startOfWeek(new Date()), tlWeekOffset*7);
            const days = Array.from({length:14}, (_,i) => addDays(start, i));
            const today = dateStr(new Date());
            weekLabel.textContent = `${pad(days[0].getDate())}/${pad(days[0].getMonth()+1)} – ${pad(days[13].getDate())}/${pad(days[13].getMonth()+1)}/${days[13].getFullYear()}`;
            const dLabels = days.map(d => { const ds=dateStr(d), dow=["CN","T2","T3","T4","T5","T6","T7"][d.getDay()]; return `<div class="tl-day-header ${ds===today?"tl-today":""}" data-date="${ds}"><span class="tl-dow">${dow}</span><span class="tl-dd">${pad(d.getDate())}</span><span class="tl-mo">${pad(d.getMonth()+1)}</span></div>`; }).join("");
            const rows = selectedProducts.map(p => {
                const rented = isProductRenting(p.idProduct);
                const cells = days.map(d => {
                    const ds=dateStr(d), sel=isDaySelected(ds), td=ds===today;
                    if (rented) {
                        return `<div class="tl-cell tl-rented" data-date="${ds}" data-product="${p.idProduct}" data-rented-tip="⚠ Máy chưa được trả">🟠</div>`;
                    }
                    // Ngày trong quá khứ — không cho chọn
                    if (ds < todayStr) {
                        return `<div class="tl-cell tl-past" data-date="${ds}" data-product="${p.idProduct}" title="Ngày đã qua"></div>`;
                    }
                    const busy=isBusy(p.idProduct,new Date(`${ds}T00:00`),new Date(`${ds}T23:59`));
                    let c="tl-cell"; if(busy)c+=" tl-busy"; else if(sel)c+=" tl-selected"; else if(td)c+=" tl-today-cell"; else c+=" tl-free";
                    return `<div class="${c}" data-date="${ds}" data-product="${p.idProduct}" title="${busy?"Đã đặt":sel?"Lịch bạn chọn":"Trống"}">${busy?"🔴":sel?"🟢":""}</div>`;
                }).join("");
                return `<div class="tl-row"><div class="tl-product-label"><img src="/api/product/${p.idProduct}/image" alt="" onerror="this.style.display='none'" style="width:28px;height:22px;object-fit:cover;border-radius:4px;flex-shrink:0;"><span>${YCI.escapeHtml(p.nameProduct)}</span>${rented?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;white-space:nowrap;margin-left:4px;">Chưa trả</span>`:""}</div><div class="tl-cells">${cells}</div></div>`;
            }).join("");
            timelineWrap.innerHTML = `<div class="tl-grid"><div class="tl-header-row"><div class="tl-product-label tl-header-label">Thiết bị</div><div class="tl-cells">${dLabels}</div></div>${rows}</div>`;
            timelineWrap.querySelectorAll(".tl-free, .tl-today-cell").forEach(cell => { cell.style.cursor="pointer"; cell.addEventListener("click", () => {
                const ds=cell.dataset.date;
                // Không cho click ngày trong quá khứ
                if (ds < todayStr) return;
                if(!inputDateStart.value||(inputDateStart.value&&inputDateEnd.value)){inputDateStart.value=ds;inputDateEnd.value="";inputDateEnd.min=ds;} else { if(ds>inputDateStart.value)inputDateEnd.value=ds; else inputDateStart.value=ds; } updateTotals(); renderTimeline(); }); });
            YCI.iconRefresh();
        }

        // ── HOURLY timeline (single day, 8h-21h) ───────────────
        const H_START = 8, H_END = 21;
        function renderHourlyTimeline() {
            if (!selectedProducts.length) { timelineWrap.innerHTML = `<div class="empty-state small"><i data-lucide="calendar-x-2"></i><p>Thêm thiết bị vào giỏ để xem lịch.</p></div>`; YCI.iconRefresh(); return; }
            const ds = dateStr(tlViewDate), today = dateStr(new Date());
            const hours = Array.from({length:H_END-H_START+1}, (_,i) => H_START+i);
            const dow = ["Chủ nhật","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7"][tlViewDate.getDay()];
            weekLabel.textContent = `${dow}, ${pad(tlViewDate.getDate())}/${pad(tlViewDate.getMonth()+1)}/${tlViewDate.getFullYear()}`;
            const hLabels = hours.map(h => `<div class="tl-hour-header ${ds===today?"tl-today":""}">${pad(h)}h</div>`).join("");
            const rows = selectedProducts.map(p => {
                const rented = isProductRenting(p.idProduct);
                const cells = hours.map(h => {
                    const s=new Date(`${ds}T${pad(h)}:00`), e=new Date(`${ds}T${pad(h+1)}:00`);
                    const past = ds===today && h < new Date().getHours();
                    // Máy đang RENTING → khóa toàn bộ, bất kể giờ nào
                    if (rented) {
                        return `<div class="tl-cell tl-hour-cell tl-rented" data-date="${ds}" data-hour="${h}" data-product="${p.idProduct}" data-rented-tip="⚠ Máy chưa được trả">🟠</div>`;
                    }
                    const busy=isBusy(p.idProduct,s,e), sel=isHourSelected(ds,h);
                    let c="tl-cell tl-hour-cell"; if(busy)c+=" tl-busy"; else if(sel)c+=" tl-selected"; else if(past)c+=" tl-past"; else c+=" tl-free";
                    return `<div class="${c}" data-date="${ds}" data-hour="${h}" data-product="${p.idProduct}" title="${busy?"Đã đặt":sel?"Lịch bạn chọn":past?"Đã qua":"Trống"}">${busy?"🔴":sel?"🟢":""}</div>`;
                }).join("");
                return `<div class="tl-row"><div class="tl-product-label"><img src="/api/product/${p.idProduct}/image" alt="" onerror="this.style.display='none'" style="width:28px;height:22px;object-fit:cover;border-radius:4px;flex-shrink:0;"><span>${YCI.escapeHtml(p.nameProduct)}</span>${rented?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;white-space:nowrap;margin-left:4px;">Chưa trả</span>`:""}</div><div class="tl-cells tl-hour-cells">${cells}</div></div>`;
            }).join("");
            timelineWrap.innerHTML = `<div class="tl-grid tl-grid-hourly"><div class="tl-header-row"><div class="tl-product-label tl-header-label">Thiết bị</div><div class="tl-cells tl-hour-cells">${hLabels}</div></div>${rows}</div>`;
            timelineWrap.querySelectorAll(".tl-free").forEach(cell => { cell.style.cursor="pointer"; cell.addEventListener("click", () => {
                const ds=cell.dataset.date, h=Number(cell.dataset.hour), val=`${ds}T${pad(h)}:00`;
                // Lần 1: chỉ set start, để end trống
                // Lần 2: set end = (giờ click + 1):00
                // Nếu cả 2 đã có → reset, set start mới
                if (!inputTimeStart.value || (inputTimeStart.value && inputTimeEnd.value)) {
                    inputTimeStart.value = val;
                    inputTimeEnd.value = "";
                    inputTimeEnd.min = val;
                } else {
                    // end = giờ click + 1 (vì mỗi ô = [h, h+1))
                    const endVal = `${ds}T${pad(h + 1)}:00`;
                    if (h + 1 > Number(inputTimeStart.value.split("T")[1].split(":")[0])) {
                        inputTimeEnd.value = endVal;
                    } else {
                        // Click trước start → reset start
                        inputTimeStart.value = val;
                        inputTimeEnd.value = "";
                        inputTimeEnd.min = val;
                    }
                }
                updateTotals(); renderTimeline();
            }); });
            YCI.iconRefresh();
        }

        function renderTimeline() { if (priceType==="daily") renderDailyTimeline(); else renderHourlyTimeline(); }

        btnPrev.addEventListener("click", () => { if(priceType==="daily"){tlWeekOffset--;} else {tlViewDate=addDays(tlViewDate,-1);} renderTimeline(); });
        btnNext.addEventListener("click", () => { if(priceType==="daily"){tlWeekOffset++;} else {tlViewDate=addDays(tlViewDate,1);} renderTimeline(); });

        // ── Submit ─────────────────────────────────────────────
        form.addEventListener("submit", async e => {
            e.preventDefault();
            if (!selectedProducts.length) { YCI.toast("Cần chọn ít nhất một thiết bị.", "error"); return; }
            const rt = selectedRentalType();
            if (!rt) { YCI.toast("Hệ thống chưa có loại giá phù hợp.", "error"); return; }
            const now = new Date();
            const toBackend = v => { if(!v)return""; if(v.includes("T")){const[d,t]=v.split("T");const[y,m,day]=d.split("-");return `${day}-${m}-${y} ${t}:00`;} const[y,m,day]=v.split("-");return `${day}-${m}-${y} 08:00:00`; };
            let payload;
            if (priceType === "daily") {
                if (!inputDateStart.value || !inputDateEnd.value) { YCI.toast("Vui lòng chọn ngày.", "error"); return; }
                if (new Date(inputDateStart.value) < new Date(todayStr)) { YCI.toast("Ngày bắt đầu không được ở trong quá khứ.", "error"); return; }
                if (inputDateEnd.value <= inputDateStart.value) { YCI.toast("Ngày kết thúc phải sau ngày bắt đầu.", "error"); return; }
                payload = { timeStart:toBackend(inputDateStart.value), timeEnd:toBackend(inputDateEnd.value), note:form.elements.note.value||"", userId:Number(form.elements.userId.value), totalAmount:calcTotal(), idRentalType:rt.idRentalType, productIds:selectedProducts.map(p=>p.idProduct), comboPrice: comboBookingInfo ? comboBookingInfo.discountPrice : null };
            } else {
                if (!inputTimeStart.value || !inputTimeEnd.value) { YCI.toast("Vui lòng chọn giờ.", "error"); return; }
                if (new Date(inputTimeStart.value) < now) { YCI.toast("Giờ bắt đầu không được ở trong quá khứ.", "error"); return; }
                if (inputTimeEnd.value <= inputTimeStart.value) { YCI.toast("Giờ kết thúc phải sau giờ bắt đầu.", "error"); return; }
                payload = { timeStart:toBackend(inputTimeStart.value), timeEnd:toBackend(inputTimeEnd.value), note:form.elements.note.value||"", userId:Number(form.elements.userId.value), totalAmount:calcTotal(), idRentalType:rt.idRentalType, productIds:selectedProducts.map(p=>p.idProduct) };
            }
            try { await YCI.apiJson("/api/booking","POST",payload); await YCI.clearCart(); YCI.toast("Đã gửi yêu cầu thuê.","success"); setTimeout(()=>window.location.assign("/orders"),700); }
            catch(err){ YCI.toast(err.message,"error"); }
        });

        // ── Init ───────────────────────────────────────────────
        async function loadPaged(url) { let p=1,tp=1,it=[]; do{const s=url.includes("?")?"&":"?";const r=await YCI.apiGet(`${url}${s}page=${p}`);it.push(...YCI.unwrapList(r));tp=Number(r.totalPage||1);p++;}while(p<=tp); return it; }
        Promise.all([loadProducts(), loadPaged("/api/admin/booking"), YCI.apiGet("/api/admin/rental-type").then(YCI.unwrapList), YCI.loadCart(true)])
            .then(([pl, bk, rts]) => { products=pl; allBookings=bk; rentalTypesList=rts; renderCart(); })
            .catch(err => YCI.toast(err.message, "error"));
    }

    function bootProfile() {
        const profileForm = YCI.qs("[data-profile-form]");
        const passwordForm = YCI.qs("[data-password-form]");
        profileForm?.addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                await YCI.apiJson("/api/profile", "PUT", YCI.formObject(profileForm));
                YCI.toast("Đã cập nhật hồ sơ.", "success");
            } catch (error) {
                YCI.toast(error.message, "error");
            }
        });
        passwordForm?.addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                await YCI.apiJson("/api/password", "PUT", YCI.formObject(passwordForm));
                passwordForm.reset();
                YCI.toast("Đã cập nhật mật khẩu.", "success");
            } catch (error) {
                YCI.toast(error.message, "error");
            }
        });
    }

    function bootOrders() {
        const user = window.YCI_SESSION?.user;
        if (!user?.idUser) return;

        // ── Modal chi tiết đơn ────────────────────────────────
        const modalDetail   = document.getElementById("modalOrderDetail");
        const detailBody    = document.getElementById("orderDetailBody");
        const detailTitle   = document.getElementById("orderDetailTitle");
        const detailEyebrow = document.getElementById("orderDetailEyebrow");

        function openDetailModal(booking) {
            if (!modalDetail) return;
            detailEyebrow.textContent = booking.bookingCode || ('#' + booking.idBooking);
            detailTitle.textContent   = (booking.userBookingDTO || {}).fullName || "Khách hàng";

            const devices = (booking.bookingDetailDTOS || []).map(d => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);">
                    <div>
                        <strong style="font-size:14px;">${YCI.escapeHtml(d.productBookingDTO?.nameProduct || "Thiết bị")}</strong>
                        <p style="font-size:12px;color:var(--muted);margin:2px 0 0;">
                            ${YCI.escapeHtml(d.productBookingDTO?.serialNumber || "")}
                            ${d.productBookingDTO?.brand ? '· ' + YCI.escapeHtml(d.productBookingDTO.brand) : ""}
                        </p>
                    </div>
                    <strong style="color:var(--teal-dark);white-space:nowrap;">${YCI.money(d.totalPrice)}</strong>
                </div>`).join("") || `<p class="muted">Không có thiết bị.</p>`;

            const payments = (booking.paymentBookingDTOS || []).map(p => {
                const isSurcharge = p.note && p.note.includes("Phụ thu");
                const isDeposit   = p.note && p.note.includes("cọc");
                const tagColor    = isSurcharge ? "#b45309" : isDeposit ? "#0369a1" : "#065f46";
                const tagBg       = isSurcharge ? "#fef3c7"  : isDeposit ? "#e0f2fe"  : "#e6fbf1";
                const tag         = p.note
                    ? `<span style="font-size:11px;padding:1px 7px;border-radius:10px;background:${tagBg};color:${tagColor};font-weight:600;">${YCI.escapeHtml(p.note)}</span>`
                    : "";
                return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:7px 0;border-bottom:1px solid var(--line);">
                    <div style="display:flex;flex-direction:column;gap:3px;">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <strong style="color:#1c8f65;">${YCI.money(p.price)}</strong>
                            ${tag}
                        </div>
                        <span style="color:var(--muted);">${YCI.escapeHtml(p.paymentMethod || "—")} · ${YCI.formatDate(p.paidAt)}</span>
                    </div>
                    <span style="font-size:12px;color:var(--muted);white-space:nowrap;">Còn ${YCI.money(p.remainAmount)}</span>
                </div>`;
            }).join("") || `<p class="muted" style="font-size:13px;">Chưa có thanh toán.</p>`;

            const summary = YCI.bookingSummary(booking);
            detailBody.innerHTML = `
                <!-- Thời gian -->
                <div style="background:var(--surface-2);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="color:var(--muted);">Thời gian thuê</span>
                        <strong>${YCI.formatDate(booking.timeStart)} → ${YCI.formatDate(booking.timeEnd)}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="color:var(--muted);">Trạng thái</span>
                        <span class="status-pill ${YCI.statusClass(booking.status)}">${YCI.escapeHtml(YCI.statusLabel(booking.status))}</span>
                    </div>
                    ${booking.note ? `<div style="display:flex;justify-content:space-between;">
                        <span style="color:var(--muted);">Ghi chú</span>
                        <span>${YCI.escapeHtml(booking.note)}</span>
                    </div>` : ""}
                </div>

                <!-- Thiết bị -->
                <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 4px;">Thiết bị thuê</p>
                <div style="margin-bottom:16px;">${devices}</div>

                <!-- Tổng tiền -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">
                    <div style="background:var(--surface-2);border-radius:10px;padding:10px 12px;text-align:center;">
                        <p style="font-size:11px;color:var(--muted);margin:0 0 4px;">Tổng đơn</p>
                        <strong style="font-size:15px;">${YCI.money(booking.totalAmount)}</strong>
                    </div>
                    <div style="background:#e6fbf1;border-radius:10px;padding:10px 12px;text-align:center;">
                        <p style="font-size:11px;color:var(--muted);margin:0 0 4px;">Đã thanh toán</p>
                        <strong style="font-size:15px;color:#1c8f65;">${YCI.money(summary.paid)}</strong>
                    </div>
                    <div style="background:#fff8e1;border-radius:10px;padding:10px 12px;text-align:center;">
                        <p style="font-size:11px;color:var(--muted);margin:0 0 4px;">Còn lại</p>
                        <strong style="font-size:15px;color:#b66a00;">${YCI.money(summary.remain)}</strong>
                    </div>
                </div>

                <!-- Lịch sử thanh toán -->
                <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 4px;">Lịch sử thanh toán</p>
                <div style="margin-bottom:16px;">${payments}</div>

                <div class="pmodal-footer" style="padding:14px 0 0;">
                    <button class="button ghost" type="button" id="closeOrderDetailModal2" style="width:100%;">Đóng</button>
                </div>`;

            document.getElementById("closeOrderDetailModal2")?.addEventListener("click", closeDetailModal);
            modalDetail.hidden = false;
            document.body.classList.add("bmodal-open");
            requestAnimationFrame(() => modalDetail.classList.add("is-open"));
            YCI.iconRefresh();
        }

        function closeDetailModal() {
            if (!modalDetail) return;
            modalDetail.classList.remove("is-open");
            modalDetail.addEventListener("transitionend", () => {
                modalDetail.hidden = true;
                if (document.querySelectorAll(".pmodal-overlay:not([hidden])").length === 0)
                    document.body.classList.remove("bmodal-open");
            }, { once: true });
        }
        document.getElementById("closeOrderDetailModal")?.addEventListener("click", closeDetailModal);
        modalDetail?.addEventListener("click", (e) => { if (e.target === modalDetail) closeDetailModal(); });

        // ── Modal QR ────────────────────────────────────────────
        const modalQR      = document.getElementById("modalQR");
        const qrImage      = document.getElementById("qrImage");
        const qrPaidBadge  = document.getElementById("qrPaidBadge");
        const qrPolling    = document.getElementById("qrPollingStatus");
        let qrPollInterval = null;

        function openQRModal(qr) {
            document.getElementById("qrModalTitle").textContent = `Cọc đơn ${qr.bookingCode || ('#' + qr.idBooking)}`;
            qrImage.src = qr.qrImageUrl || "";
            qrPaidBadge.hidden = true;
            qrPolling.hidden = false;
            document.getElementById("qrBankCode").textContent     = qr.bankCode || "";
            document.getElementById("qrAccountNo").textContent    = qr.accountNumber || "";
            document.getElementById("qrAccountName").textContent  = qr.accountName || "";
            document.getElementById("qrAmount").textContent       = YCI.money(qr.amount);
            document.getElementById("qrTransferContent").textContent = qr.referenceCode || "";
            document.getElementById("qrExpiresAt").textContent    = qr.expiresAt
                ? new Date(qr.expiresAt).toLocaleString("vi-VN") : "—";
            modalQR.hidden = false;
            document.body.classList.add("bmodal-open");
            requestAnimationFrame(() => modalQR.classList.add("is-open"));

            // Poll status
            if (qrPollInterval) clearInterval(qrPollInterval);
            qrPollInterval = setInterval(async () => {
                try {
                    const res = await YCI.apiGet(`/api/deposit/status/${qr.idBooking}`);
                    const data = res.data || res;
                    if (data.depositPaid) {
                        clearInterval(qrPollInterval);
                        qrPaidBadge.hidden = false;
                        qrPolling.hidden = true;
                        qrImage.style.opacity = "0.4";
                        setTimeout(() => { closeModal(modalQR); window.location.reload(); }, 2500);
                    }
                } catch (_) {}
            }, 4000);
        }

        function closeModal(el) {
            if (qrPollInterval) { clearInterval(qrPollInterval); qrPollInterval = null; }
            el.classList.remove("is-open");
            el.addEventListener("transitionend", () => {
                el.hidden = true;
                document.body.classList.remove("bmodal-open");
            }, { once: true });
        }

        document.getElementById("closeQrModal")?.addEventListener("click", () => closeModal(modalQR));
        document.getElementById("closeQrModal2")?.addEventListener("click", () => closeModal(modalQR));
        modalQR?.addEventListener("click", e => { if (e.target === modalQR) closeModal(modalQR); });

        // ── Modal Cancel Request ─────────────────────────────────
        const modalCancel = document.getElementById("modalCancelRequest");
        document.getElementById("closeCancelModal")?.addEventListener("click", () => closeModal(modalCancel));
        document.getElementById("closeCancelModal2")?.addEventListener("click", () => closeModal(modalCancel));
        modalCancel?.addEventListener("click", e => { if (e.target === modalCancel) closeModal(modalCancel); });

        document.getElementById("formCancelRequest")?.addEventListener("submit", async e => {
            e.preventDefault();
            const bookingId   = document.getElementById("cancelBookingId").value;
            const reason      = document.getElementById("cancelReason").value.trim();
            const bankName    = document.getElementById("cancelBankName").value.trim();
            const accountNo   = document.getElementById("cancelAccountNo").value.trim();
            const accountName = document.getElementById("cancelAccountName").value.trim();
            if (!reason) { YCI.toast("Vui lòng nhập lý do hủy.", "error"); return; }
            const btn = document.getElementById("btnSubmitCancelRequest");
            btn.disabled = true;
            try {
                await YCI.apiJson(`/api/booking/${bookingId}/cancel-request`, "POST", {
                    reason, bankName, accountNo, accountName
                });
                YCI.toast("Đã gửi yêu cầu hủy. Admin sẽ xem xét sớm nhất.", "success");
                closeModal(modalCancel);
                setTimeout(() => window.location.reload(), 800);
            } catch (err) {
                YCI.toast(err.message, "error");
            } finally {
                btn.disabled = false;
            }
        });

        // ── Mã QR nhận máy (cho đơn đã xác nhận) ─────────────────
        const modalPickup = document.getElementById("modalPickupQR");
        const pickupQrBox = document.getElementById("pickupQrBox");
        const pickupQrTitle = document.getElementById("pickupQrTitle");

        function openPickupModal(booking) {
            if (!modalPickup || typeof QRCode === "undefined") {
                YCI.toast("Không tạo được mã QR. Vui lòng tải lại trang.", "error");
                return;
            }
            const name = (booking.userBookingDTO || {}).fullName || "";
            const phone = (booking.userBookingDTO || {}).phone || "";
            // Nội dung QR: YCI | mã đơn | tên khách | số điện thoại
            const payload = "YCI|" + booking.idBooking + "|" + (booking.bookingCode || '') + "|" + name + "|" + phone;
            pickupQrTitle.textContent = "Mã nhận máy · " + (booking.bookingCode || ('#' + booking.idBooking));
            pickupQrBox.innerHTML = "";
            new QRCode(pickupQrBox, {
                text: payload, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M
            });
            modalPickup.hidden = false;
            document.body.classList.add("bmodal-open");
            requestAnimationFrame(() => modalPickup.classList.add("is-open"));
            YCI.iconRefresh();
        }
        function closePickupModal() {
            if (!modalPickup) return;
            modalPickup.classList.remove("is-open");
            modalPickup.addEventListener("transitionend", () => {
                modalPickup.hidden = true;
                document.body.classList.remove("bmodal-open");
            }, { once: true });
        }
        document.getElementById("closePickupQrModal")?.addEventListener("click", closePickupModal);
        document.getElementById("closePickupQrModal2")?.addEventListener("click", closePickupModal);
        modalPickup?.addEventListener("click", (e) => { if (e.target === modalPickup) closePickupModal(); });

        // ── Render orders ────────────────────────────────────────
        YCI.apiGet(`/api/booking/id-user=${user.idUser}`)
            .then((response) => {
                const bookings = YCI.unwrapList(response)
                    .sort((a, b) => Number(b.idBooking) - Number(a.idBooking));
                const node = YCI.qs("[data-customer-orders]");
                if (!bookings.length) {
                    node.innerHTML = `<div class="surface empty-state"><i data-lucide="clipboard-list"></i><h3>Chưa có đơn thuê</h3><p>Đơn thuê mới sẽ xuất hiện tại đây sau khi gửi yêu cầu.</p></div>`;
                    YCI.iconRefresh();
                    return;
                }

                node.innerHTML = bookings.map((booking) => {
                    const summary  = YCI.bookingSummary(booking);
                    const products = (booking.bookingDetailDTOS || [])
                        .map(d => d.productBookingDTO?.nameProduct).filter(Boolean).join(", ");
                    const status   = String(booking.status || "").toUpperCase();

                    // Nút thanh toán cọc QR
                    const showQR = status === "PENDING_DEPOSIT"
                        || status === "WAITING ACCEPT" || status === "WAITING_ACCEPT";
                    const qrBtn = showQR
                        ? `<button class="button primary" type="button" data-pay-qr="${booking.idBooking}" style="min-height:42px;">
                               <i data-lucide="qr-code"></i> Thanh toán cọc
                           </button>`
                        : "";

                    // Cảnh báo: cần thanh toán cọc để đơn được xác nhận
                    const depositPaid = (booking.paymentBookingDTOS || [])
                        .some((p) => (p.paymentStatus || "").toUpperCase() === "PAID");
                    const depositWarn = (showQR && !depositPaid) ? `
                        <div class="deposit-notice" style="display:flex;gap:10px;align-items:flex-start;background:#fff8e1;border:1px solid #f3d27a;border-radius:12px;padding:12px 14px;margin-top:4px;">
                            <i data-lucide="alert-triangle" style="color:#b66a00;flex-shrink:0;margin-top:2px;"></i>
                            <div style="font-size:13px;color:#8a5300;line-height:1.45;">
                                <strong style="color:#b66a00;">Cần thanh toán cọc</strong><br>
                                Đơn sẽ được xác nhận sau khi bạn thanh toán tiền cọc. Nhấn nút "Thanh toán cọc" bên dưới để tiếp tục.
                            </div>
                        </div>` : "";

                    // Nút Mã QR nhận máy (đơn đã xác nhận)
                    const showPickupQR = status === "ACCEPTED" || status === "RENTING";
                    const pickupBtn = showPickupQR
                        ? `<button class="button ghost" type="button" data-pickup-qr="${booking.idBooking}"
                               style="min-height:42px;border-color:rgba(233,30,131,.35);color:var(--teal-dark);font-weight:700;gap:7px;">
                               <i data-lucide="qr-code" style="width:16px;height:16px;"></i> Mã QR nhận máy
                           </button>`
                        : "";

                    // Nút yêu cầu hủy
                    const canCancel = ["WAITING ACCEPT","WAITING_ACCEPT","PENDING_DEPOSIT","ACCEPTED"].includes(status);
                    const alreadyRequested = status === "CANCEL_REQUESTED";
                    const cancelBtn = alreadyRequested
                        ? `<span class="status-pill sc-waiting" style="font-size:12px;">Đang chờ admin duyệt hủy</span>`
                        : canCancel
                            ? `<button class="button ghost" type="button" data-cancel-request="${booking.idBooking}"
                                       style="min-height:42px;color:var(--danger);border-color:var(--danger);">
                                   <i data-lucide="x-circle"></i> Yêu cầu hủy
                               </button>`
                            : "";

                    // Cảnh báo quá hạn trả máy (đơn RENTING đã qua timeEnd)
                    const isRenting = status === "RENTING";
                    const timeEnd   = booking.timeEnd ? new Date(booking.timeEnd) : null;
                    const now       = new Date();
                    const isOverdue = isRenting && timeEnd && now > timeEnd;
                    const overdueMs = isOverdue ? now - timeEnd : 0;
                    const overdueMins = Math.floor(overdueMs / 60000);
                    const overdueHours = Math.floor(overdueMs / 3600000);
                    const overdueLabel = overdueHours > 0
                        ? `${overdueHours} giờ ${overdueMins % 60} phút`
                        : `${overdueMins} phút`;
                    // Tính phí trễ ước tính để hiện trong info-grid
                    const lateHours = isOverdue ? Math.ceil(overdueMs / 3600000) : 0;
                    const rentHours = (timeEnd && booking.timeStart)
                        ? Math.max(1, (new Date(booking.timeEnd) - new Date(booking.timeStart)) / 3600000) : 1;
                    const feePerHour = Math.round(booking.totalAmount / rentHours / 1000) * 1000;
                    const estimatedLateFee = lateHours * feePerHour;
                    const overdueWarn = isOverdue ? `
                        <div style="
                            display:flex;gap:12px;align-items:flex-start;
                            background:linear-gradient(135deg,#fff0f4,#fff5f7);
                            border:1.5px solid #f87171;
                            border-left:5px solid #bd1f54;
                            border-radius:12px;
                            padding:14px 16px;
                            margin-top:4px;
                            box-shadow:0 4px 14px rgba(189,31,84,.12);
                        ">
                            <i data-lucide="alarm-clock" style="color:#bd1f54;flex-shrink:0;width:22px;height:22px;margin-top:1px;"></i>
                            <div style="line-height:1.5;">
                                <strong style="color:#bd1f54;font-size:14px;display:block;margin-bottom:3px;">
                                    ⏰ Đã quá hạn trả máy ${overdueLabel}!
                                </strong>
                                <span style="font-size:13px;color:#7f1d1d;">
                                    Thời hạn trả là <strong>${YCI.formatDate(booking.timeEnd)}</strong>.
                                    Phí phát sinh sẽ được tính theo từng giờ trễ.
                                    Vui lòng liên hệ cửa hàng ngay.
                                </span>
                            </div>
                        </div>` : "";

                    return `
                    <article class="surface order-card${isOverdue ? ' order-card--overdue' : ''}">
                        ${isOverdue ? `<div style="height:4px;background:linear-gradient(90deg,#bd1f54,#f87171,#bd1f54);border-radius:var(--radius) var(--radius) 0 0;margin:-1px -1px 0;"></div>` : ""}
                        <div class="order-head">
                            <div>
                                <p class="eyebrow">${YCI.escapeHtml(booking.bookingCode || ('#' + booking.idBooking))} · ${YCI.formatDate(booking.createdAt)}</p>
                                <h2>${YCI.escapeHtml(products || "Đơn thuê thiết bị")}</h2>
                                <p class="muted">${YCI.formatDate(booking.timeStart)} → ${YCI.formatDate(booking.timeEnd)}</p>
                            </div>
                            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
                                <span class="status-pill ${YCI.statusClass(booking.status)}">${YCI.escapeHtml(YCI.statusLabel(booking.status))}</span>
                                <button class="button ghost" type="button" data-view-booking="${booking.idBooking}"
                                    style="font-size:12px;padding:5px 12px;min-height:32px;gap:5px;border-color:var(--line);">
                                    <i data-lucide="eye" style="width:13px;height:13px;"></i> Xem chi tiết
                                </button>
                            </div>
                        </div>
                        <div class="info-grid" style="${isOverdue ? 'grid-template-columns:repeat(4,minmax(0,1fr));' : ''}">
                            <div class="info-card">
                                <strong ${isOverdue ? `style="color:#bd1f54;"` : ''}>${YCI.money(isOverdue ? booking.totalAmount + estimatedLateFee : booking.totalAmount)}</strong>
                                <p class="muted">${isOverdue ? 'Tổng (+ phí trễ)' : 'Tổng giá trị'}</p>
                            </div>
                            ${isOverdue ? `
                            <div class="info-card" style="background:#fff0f0;border-color:#ffb3b3;">
                                <strong style="color:#bd1f54;">${YCI.money(estimatedLateFee)}</strong>
                                <p class="muted" style="color:#bd1f54;">Phí trễ ~${lateHours}h</p>
                            </div>` : ''}
                            <div class="info-card"><strong>${YCI.money(summary.paid)}</strong><p class="muted">Đã cọc / thanh toán</p></div>
                            <div class="info-card"><strong>${YCI.money(isOverdue ? Math.max(0, booking.totalAmount + estimatedLateFee - summary.paid) : summary.remain)}</strong><p class="muted">Còn lại</p></div>
                        </div>
                        ${(() => {
                            // Hiện thông tin trễ thực tế nếu đơn đã COMPLETED
                            if (status === "COMPLETED") {
                                const returnDetails = (booking.bookingDetailDTOS || [])
                                    .map(d => d.returnDetailDTO).filter(Boolean);
                                if (returnDetails.length === 0) return '';
                                const totalLateHours  = returnDetails.reduce((s, r) => s + (r.lateHours  || 0), 0);
                                const totalLateFee    = returnDetails.reduce((s, r) => s + (r.lateFee    || 0), 0);
                                const totalCleaning   = returnDetails.reduce((s, r) => s + (r.cleaningFee || 0), 0);
                                const totalDamage     = returnDetails.reduce((s, r) => s + (r.damageFee  || 0), 0);
                                const totalExtra      = totalLateFee + totalCleaning + totalDamage;
                                if (totalExtra === 0) return '';
                                return `
                                <div style="display:flex;gap:10px;align-items:flex-start;
                                    background:#f7fffb;border:1px solid #6ee7b7;
                                    border-left:4px solid #1c8f65;border-radius:12px;
                                    padding:12px 14px;margin-top:4px;">
                                    <i data-lucide="receipt" style="color:#1c8f65;flex-shrink:0;width:18px;height:18px;margin-top:2px;"></i>
                                    <div style="font-size:13px;line-height:1.55;width:100%;">
                                        <strong style="color:#065f46;display:block;margin-bottom:6px;">
                                            Phụ phí ghi nhận khi trả máy
                                        </strong>
                                        ${totalLateHours > 0 ? `<div style="display:flex;justify-content:space-between;">
                                            <span style="color:var(--muted);">Phí trễ (${totalLateHours}h)</span>
                                            <strong style="color:#bd1f54;">${YCI.money(totalLateFee)}</strong>
                                        </div>` : ''}
                                        ${totalCleaning > 0 ? `<div style="display:flex;justify-content:space-between;">
                                            <span style="color:var(--muted);">Phí vệ sinh</span>
                                            <strong>${YCI.money(totalCleaning)}</strong>
                                        </div>` : ''}
                                        ${totalDamage > 0 ? `<div style="display:flex;justify-content:space-between;">
                                            <span style="color:var(--muted);">Phí hư hỏng</span>
                                            <strong>${YCI.money(totalDamage)}</strong>
                                        </div>` : ''}
                                        <div style="display:flex;justify-content:space-between;
                                            padding-top:6px;border-top:1px solid #b7f5d8;margin-top:4px;">
                                            <strong style="color:#065f46;">Tổng phụ phí</strong>
                                            <strong style="color:#065f46;">${YCI.money(totalExtra)}</strong>
                                        </div>
                                    </div>
                                </div>`;
                            }
                            return '';
                        })()}
                        ${overdueWarn}
                        ${depositWarn}
                        ${qrBtn || pickupBtn || cancelBtn ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">${qrBtn}${pickupBtn}${cancelBtn}</div>` : ""}
                    </article>`;
                }).join("");

                YCI.iconRefresh();

                // ── Event delegation ─────────────────────────────
                node.addEventListener("click", async (e) => {
                    // Xem chi tiết đơn
                    const viewBtn = e.target.closest("[data-view-booking]");
                    if (viewBtn) {
                        const bk = bookings.find(b => String(b.idBooking) === String(viewBtn.dataset.viewBooking));
                        if (bk) openDetailModal(bk);
                        return;
                    }

                    // Thanh toán cọc QR
                    const payBtn = e.target.closest("[data-pay-qr]");
                    if (payBtn) {
                        try {
                            const qr = await YCI.apiGet(`/api/deposit/qr/${payBtn.dataset.payQr}`);
                            const data = (qr.data || qr);
                            if (data.error) { YCI.toast(data.error, "error"); return; }
                            openQRModal(data);
                        } catch (err) { YCI.toast(err.message, "error"); }
                        return;
                    }

                    // Mã QR nhận máy
                    const pickupBtnEl = e.target.closest("[data-pickup-qr]");
                    if (pickupBtnEl) {
                        const bk = bookings.find(b => String(b.idBooking) === String(pickupBtnEl.dataset.pickupQr));
                        if (bk) openPickupModal(bk);
                        return;
                    }

                    // Yêu cầu hủy
                    const cancelBtn = e.target.closest("[data-cancel-request]");
                    if (cancelBtn) {
                        const bid = cancelBtn.dataset.cancelRequest;
                        const bk = bookings.find(b => String(b.idBooking) === String(bid));
                        document.getElementById("cancelBookingId").value = bid;
                        document.getElementById("cancelModalTitle").textContent = `Hủy đơn ${bookings.find(b => String(b.idBooking) === String(bid))?.bookingCode || ('#' + bid)}`;
                        document.getElementById("cancelReason").value = "";
                        document.getElementById("cancelBankName").value = "";
                        document.getElementById("cancelAccountNo").value = "";
                        document.getElementById("cancelAccountName").value = "";
                        modalCancel.hidden = false;
                        document.body.classList.add("bmodal-open");
                        requestAnimationFrame(() => modalCancel.classList.add("is-open"));
                        return;
                    }

                    // Hủy nhanh (không cọc — backward compat)
                    const oldCancelBtn = e.target.closest("[data-cancel-booking]");
                    if (oldCancelBtn) {
                        try {
                            await YCI.apiJson(`/api/booking/id=${oldCancelBtn.dataset.cancelBooking}/cancel?userId=${user.idUser}`, "PUT", {});
                            YCI.toast("Đã hủy đơn thuê.", "success");
                            setTimeout(() => window.location.reload(), 500);
                        } catch (err) { YCI.toast(err.message, "error"); }
                    }
                });
            })
            .catch((error) => YCI.toast(error.message, "error"));
    }

    // ── Helper: thêm tất cả sản phẩm combo vào cart + redirect booking ──
    async function addComboToCart(combo) {
        if (YCI.isAdminUser()) {
            YCI.toast("Tài khoản quản trị không thể đặt thuê.", "error");
            return;
        }
        const user = window.YCI_SESSION?.user;
        if (!user) {
            YCI.toast("Vui lòng đăng nhập để đặt combo.", "error");
            setTimeout(() => { window.location.href = "/login"; }, 1200);
            return;
        }
        const productIds = (combo.products || []).map(p => p.idProduct).filter(Boolean);
        if (!productIds.length) {
            YCI.toast("Combo chưa có sản phẩm.", "error");
            return;
        }
        // Thêm tất cả sản phẩm vào cart
        await YCI.loadCart(true);
        const existing = YCI.readCart();
        const merged = Array.from(new Set([...existing, ...productIds.map(Number)]));
        await YCI.writeCart(merged);
        // Lưu flag để booking page biết đây là đặt combo (force daily mode)
        try {
            sessionStorage.setItem("yci.combo-booking", JSON.stringify({
                idCombo: combo.idCombo,
                nameCombo: combo.nameCombo,
                discountPrice: combo.discountPrice
            }));
        } catch (e) {}
        YCI.toast(`Đã thêm ${productIds.length} thiết bị vào giỏ. Đang chuyển đến đặt lịch...`, "success");
        setTimeout(() => { window.location.href = "/booking"; }, 900);
    }

    function bootComboDetail() {
        const root = YCI.qs("[data-combo-id]");
        const id = root?.dataset.comboId;
        if (!id) return;

        YCI.apiGet(`/api/combo/${id}`)
            .then((response) => {
                const combo = YCI.unwrapData ? YCI.unwrapData(response) : (response.data || response);
                if (!combo) { YCI.toast("Không tìm thấy combo", "error"); return; }

                // Helper ảnh base64
                function imgSrc(b64) {
                    if (!b64) return YCI.FALLBACK_IMAGE;
                    return b64.startsWith("data:") ? b64 : "data:image/jpeg;base64," + b64;
                }

                // Breadcrumb + tiêu đề
                YCI.qs("[data-combo-crumb]").textContent = combo.nameCombo || "Chi tiết combo";
                YCI.qs("[data-combo-name]").textContent = combo.nameCombo || "";
                const descEl = YCI.qs("[data-combo-description]");
                if (combo.description) {
                    // Render HTML từ Quill (rich text)
                    descEl.innerHTML = combo.description;
                    descEl.classList.add("combo-rich-desc");
                } else {
                    descEl.hidden = true;
                }

                // Ảnh combo
                const images = (combo.imageDTOS || []).map(img => imgSrc(img.imageBase64));
                const mainImg = YCI.qs("[data-combo-main-img]");
                if (images.length) {
                    mainImg.src = images[0];
                    mainImg.alt = combo.nameCombo || "Combo";
                    mainImg.onerror = () => { mainImg.src = YCI.FALLBACK_IMAGE; };
                    // Thumbnails
                    const thumbsEl = YCI.qs("[data-combo-thumbs]");
                    if (images.length > 1) {
                        thumbsEl.innerHTML = images.map((url, i) => `
                            <button class="${i === 0 ? "is-active" : ""}" type="button" data-thumb-index="${i}">
                                <img src="${url}" alt="Ảnh ${i + 1}">
                            </button>`).join("");
                        thumbsEl.addEventListener("click", (e) => {
                            const btn = e.target.closest("[data-thumb-index]");
                            if (!btn) return;
                            mainImg.src = images[Number(btn.dataset.thumbIndex)];
                            thumbsEl.querySelectorAll("[data-thumb-index]").forEach(b =>
                                b.classList.toggle("is-active", b === btn));
                        });
                    } else {
                        thumbsEl.hidden = true;
                    }
                } else {
                    mainImg.src = YCI.FALLBACK_IMAGE;
                    YCI.qs("[data-combo-thumbs]").hidden = true;
                }

                // Giá
                const origPerDay = combo.totalPricePerDay || 0;
                const dealPerDay = combo.discountPrice || 0;
                const saving = origPerDay > 0 ? origPerDay - dealPerDay : 0;
                const savingPct = origPerDay > 0 ? Math.round((saving / origPerDay) * 100) : 0;

                YCI.qs("[data-combo-orig-price]").textContent = origPerDay > 0 ? YCI.money(origPerDay) + "/ngày" : "—";
                YCI.qs("[data-combo-deal-price]").textContent = dealPerDay > 0 ? YCI.money(dealPerDay) : "Liên hệ";

                const savingEl = YCI.qs("[data-combo-saving]");
                if (saving > 0) {
                    savingEl.hidden = false;
                    YCI.qs("[data-combo-saving-text]").textContent =
                        `Tiết kiệm ${YCI.money(saving)}/ngày (${savingPct}%) so với thuê lẻ từng thiết bị`;
                }

                // Danh sách sản phẩm trong combo
                const products = combo.products || [];
                const countEl = YCI.qs("[data-combo-items-count]");
                if (countEl) countEl.textContent = `${products.length} thiết bị`;

                const grid = YCI.qs("[data-combo-items-grid]");
                if (products.length) {
                    grid.innerHTML = products.map(p => {
                        const thumb = p.thumbnailBase64 ? imgSrc(p.thumbnailBase64) : YCI.FALLBACK_IMAGE;
                        const dayPrice = p.pricePerDay ? `<span class="price-chip">${YCI.money(p.pricePerDay)}/ngày</span>` : "";
                        return `
                            <a class="combo-item-card" href="/products/${p.idProduct}">
                                <div class="combo-item-media">
                                    <img src="${thumb}" alt="${YCI.escapeHtml(p.nameProduct)}"
                                         onerror="this.src='${YCI.FALLBACK_IMAGE}'">
                                </div>
                                <div class="combo-item-body">
                                    <h4>${YCI.escapeHtml(p.nameProduct)}</h4>
                                    <p class="muted">${YCI.escapeHtml(p.brand || "")} · ${YCI.escapeHtml(p.categoryName || "")}</p>
                                    <div class="combo-item-price">${dayPrice}</div>
                                </div>
                                <i data-lucide="arrow-right" class="combo-item-arrow"></i>
                            </a>`;
                    }).join("");
                } else {
                    grid.innerHTML = `<p class="muted">Chưa có sản phẩm trong combo này.</p>`;
                }

                // ── CTA đặt combo ────────────────────────────────────
                const ctaBtn = YCI.qs(".combo-detail-cta");
                if (ctaBtn) {
                    if (combo.comboStatus === "RENTING" || combo.comboStatus === "UNAVAILABLE") {
                        // Thay CTA bằng badge trạng thái
                        ctaBtn.outerHTML = `
                            <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
                                 border-radius:12px;background:var(--bg-muted);border:1px solid var(--border-color);">
                                <span class="status-pill ${YCI.statusClass(combo.comboStatus)}">${YCI.statusLabel(combo.comboStatus)}</span>
                                <span style="font-size:13px;color:var(--text-muted);">
                                    ${combo.comboStatus === "RENTING"
                                        ? "Combo hiện đang được thuê. Vui lòng quay lại sau."
                                        : "Combo hiện không khả dụng."}
                                </span>
                            </div>`;
                    } else {
                        ctaBtn.removeAttribute("href");
                        ctaBtn.setAttribute("type", "button");
                        ctaBtn.addEventListener("click", () => addComboToCart(combo));
                    }
                }

                // Hiển thị trạng thái combo ở panel giá
                if (combo.comboStatus && combo.comboStatus !== "AVAILABLE") {
                    const pricePanel = YCI.qs(".combo-detail-price-panel");
                    if (pricePanel) {
                        const statusEl = document.createElement("div");
                        statusEl.style.cssText = "display:flex;align-items:center;gap:8px;";
                        statusEl.innerHTML = `
                            <span class="status-pill ${YCI.statusClass(combo.comboStatus)}">${YCI.statusLabel(combo.comboStatus)}</span>
                            <span style="font-size:12px;color:var(--text-muted);">Trạng thái combo</span>`;
                        pricePanel.prepend(statusEl);
                    }
                }

                YCI.iconRefresh();
            })
            .catch((err) => YCI.toast(err.message, "error"));
    }

    function bootCatalogCombos() {
        const grid  = document.getElementById("comboCatalogGrid");
        const empty = document.getElementById("comboCatalogEmpty");
        const searchEl = document.getElementById("comboSearchInput");
        let allCombos = [];

        function renderCombos(list) {
            if (!list.length) { grid.innerHTML = ""; empty.hidden = false; return; }
            empty.hidden = true;
            grid.innerHTML = list.map(combo => {
                const thumb = combo.imageDTOS?.[0]?.imageBase64
                    ? (combo.imageDTOS[0].imageBase64.startsWith("data:") ? combo.imageDTOS[0].imageBase64 : "data:image/jpeg;base64," + combo.imageDTOS[0].imageBase64)
                    : null;
                const origPerDay = combo.totalPricePerDay || 0;
                const dealPerDay = combo.discountPrice || 0;
                const saving = origPerDay > 0 ? origPerDay - dealPerDay : 0;
                const savingPct = origPerDay > 0 ? Math.round((saving / origPerDay) * 100) : 0;
                const badgeText = savingPct > 0 ? `Tiết kiệm ${savingPct}%` : "Combo ưu đãi";
                const productNames = (combo.products || []).map(p => YCI.escapeHtml(p.nameProduct)).join(" · ");
                const isUnavailable = combo.comboStatus === "RENTING" || combo.comboStatus === "UNAVAILABLE";
                const statusPill = combo.comboStatus && combo.comboStatus !== "AVAILABLE"
                    ? `<span class="status-pill ${YCI.statusClass(combo.comboStatus)}" style="position:absolute;top:14px;right:14px;z-index:2;">${YCI.escapeHtml(YCI.statusLabel(combo.comboStatus))}</span>`
                    : "";
                return `
                    <article class="combo-home-card combo-catalog-card">
                        <div class="combo-home-badge"><i data-lucide="tag"></i> ${badgeText}</div>
                        ${statusPill}
                        <a class="combo-home-media ${thumb ? "" : "is-placeholder"}" href="/combos/${combo.idCombo}">
                            ${thumb ? `<img src="${thumb}" alt="${YCI.escapeHtml(combo.nameCombo)}">` : `<div class="combo-home-media-ph"><i data-lucide="package"></i></div>`}
                        </a>
                        <div class="combo-home-body">
                            <h3><a href="/combos/${combo.idCombo}">${YCI.escapeHtml(combo.nameCombo)}</a></h3>
                            <div class="combo-home-items"><i data-lucide="layers"></i><span>${productNames || "Xem chi tiết"}</span></div>
                            <div class="combo-home-price">
                                ${origPerDay > 0 ? `<s class="combo-home-orig">${YCI.money(origPerDay)}</s>` : ""}
                                <div><strong class="combo-home-deal">${YCI.money(dealPerDay)}</strong><span class="combo-home-unit">/ngày</span></div>
                            </div>
                            ${isUnavailable
                                ? `<button class="button full" disabled style="opacity:.55;cursor:not-allowed;border-radius:12px;"><i data-lucide="clock"></i> ${YCI.statusLabel(combo.comboStatus)}</button>`
                                : `<a class="button primary full combo-home-cta" href="/combos/${combo.idCombo}" data-combo-id="${combo.idCombo}"><i data-lucide="calendar-plus"></i> Đặt combo này</a>`
                            }
                        </div>
                    </article>`;
            }).join("");

            // Gắn event đặt combo
            grid.querySelectorAll("[data-combo-id]").forEach(btn => {
                btn.addEventListener("click", async e => {
                    e.preventDefault();
                    const c = allCombos.find(x => x.idCombo === Number(btn.dataset.comboId));
                    if (!c) return;
                    if (c.comboStatus === "RENTING" || c.comboStatus === "UNAVAILABLE") {
                        YCI.toast("Combo này hiện đang được thuê hoặc không khả dụng.", "error");
                        return;
                    }
                    await addComboToCart(c);
                });
            });
            YCI.iconRefresh();
        }

        searchEl?.addEventListener("input", () => {
            const q = searchEl.value.trim().toLowerCase();
            renderCombos(q ? allCombos.filter(c => (c.nameCombo || "").toLowerCase().includes(q)) : allCombos);
        });

        YCI.apiGet("/api/combo")
            .then(resp => {
                allCombos = YCI.unwrapList(resp).filter(c => c.active);
                renderCombos(allCombos);
            })
            .catch(err => YCI.toast(err.message, "error"));
    }

    document.addEventListener("DOMContentLoaded", () => {
        const page = document.body.dataset.page;
        if (page === "home") bootHome();
        if (page === "catalog") bootCatalog();
        if (page === "catalog-combos") bootCatalogCombos();
        if (page === "product-detail") bootProductDetail();
        if (page === "combo-detail") bootComboDetail();
        if (page === "pricing") bootPricing();
        if (page === "regulations") bootRegulations();
        if (page === "booking") bootBooking();
        if (page === "profile") bootProfile();
        if (page === "orders") bootOrders();
    });
})();
