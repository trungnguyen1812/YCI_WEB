/**
 * yci-admin-combo.js
 * Quản lý Combo sản phẩm — trang /admin/combos
 */
(function () {
    "use strict";

    // ── Helpers ──────────────────────────────────────────────────────────
    function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
    function money(n) {
        if (n == null || isNaN(n)) return "—";
        return Number(n).toLocaleString("vi-VN") + "đ";
    }
    // Thêm prefix data:image nếu chưa có (base64 từ backend không có prefix)
    function toImgSrc(base64) {
        if (!base64) return null;
        if (base64.startsWith("data:")) return base64;
        return "data:image/jpeg;base64," + base64;
    }
    function moneyRaw(n) {
        if (n == null || isNaN(n)) return 0;
        return Number(n);
    }
    function escHtml(s) {
        if (!s) return "";
        return String(s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function toast(msg, type) {
        if (window.YCI && YCI.toast) { YCI.toast(msg, type); return; }
        alert(msg);
    }
    function iconRefresh() {
        if (window.lucide) lucide.createIcons();
        else if (window.YCI && YCI.iconRefresh) YCI.iconRefresh();
    }
    async function apiGet(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Lỗi tải dữ liệu: " + url);
        return res.json();
    }
    async function apiPost(url, formData) {
        const res = await fetch(url, { method: "POST", body: formData });
        return res.json();
    }
    async function apiPut(url, formData) {
        const res = await fetch(url, { method: "PUT", body: formData });
        return res.json();
    }
    async function apiPutJson(url, body) {
        const res = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return res.json();
    }
    async function apiDelete(url) {
        const res = await fetch(url, { method: "DELETE" });
        return res.json();
    }
    function unwrapList(resp) {
        if (!resp) return [];
        if (Array.isArray(resp)) return resp;
        if (resp.data && Array.isArray(resp.data)) return resp.data;
        return [];
    }
    function moneyInputFormat(input) {
        input.addEventListener("input", function () {
            let raw = this.value.replace(/\D/g, "");
            this.value = raw ? Number(raw).toLocaleString("vi-VN") : "";
        });
    }
    function moneyInputValue(input) {
        return Number(input.value.replace(/\D/g, "")) || 0;
    }
    function setMoneyInput(input, value) {
        input.value = value ? Number(value).toLocaleString("vi-VN") : "";
    }

    // ── State ─────────────────────────────────────────────────────────────
    const state = {
        combos: [],
        allProducts: [],
        addSelected: [],  // { id, name, brand, thumbnail }
        editSelected: [],
        addNewImages: [],
        editNewImages: [],
        editSavedImages: [] // { id, url }
    };

    // ── DOM refs ──────────────────────────────────────────────────────────
    const tableBody     = document.getElementById("comboTableBody");
    const emptyState    = document.getElementById("comboEmpty");
    const searchInput   = document.getElementById("comboSearch");
    const statusFilter  = document.getElementById("comboStatusFilter");

    const modalAdd      = document.getElementById("modalAddCombo");
    const formAdd       = document.getElementById("formAddCombo");
    const addPriceInput = document.getElementById("addComboPrice");
    const addSavingNote = document.getElementById("addComboSavingNote");
    const addPrevEl     = document.getElementById("addComboImagePreview");
    const addImgInput   = document.getElementById("addComboImages");
    const addSearchInput   = document.getElementById("addComboProductSearch");
    const addDropdown      = document.getElementById("addComboProductDropdown");
    const addSelectedList  = document.getElementById("addComboSelectedList");

    const modalEdit     = document.getElementById("modalEditCombo");
    const formEdit      = document.getElementById("formEditCombo");
    const editPriceInput = document.getElementById("editComboPrice");
    const editSavingNote = document.getElementById("editComboSavingNote");
    const editPrevEl    = document.getElementById("editComboImagePreview");
    const editImgInput  = document.getElementById("editComboImages");
    const editSearchInput  = document.getElementById("editComboProductSearch");
    const editDropdown     = document.getElementById("editComboProductDropdown");
    const editSelectedList = document.getElementById("editComboSelectedList");

    // ── Money inputs ──────────────────────────────────────────────────────
    if (addPriceInput)  moneyInputFormat(addPriceInput);
    if (editPriceInput) moneyInputFormat(editPriceInput);

    // ── Quill Rich Text Editors ───────────────────────────────────────────
    const QUILL_TOOLBAR = [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ color: [] }, { background: [] }],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ align: [] }],
        ["link"],
        ["clean"]
    ];

    let quillAdd  = null;
    let quillEdit = null;

    function initQuill() {
        if (typeof Quill === "undefined") return;
        if (!quillAdd) {
            quillAdd = new Quill("#addComboDescEditor", {
                theme: "snow",
                placeholder: "Mô tả chi tiết gói combo: bao gồm thiết bị gì, phù hợp cho buổi chụp nào...",
                modules: { toolbar: QUILL_TOOLBAR }
            });
            quillAdd.on("text-change", () => {
                const hidden = document.getElementById("addComboDescHidden");
                if (hidden) hidden.value = quillAdd.root.innerHTML === "<p><br></p>" ? "" : quillAdd.root.innerHTML;
            });
        }
        if (!quillEdit) {
            quillEdit = new Quill("#editComboDescEditor", {
                theme: "snow",
                placeholder: "Mô tả chi tiết gói combo...",
                modules: { toolbar: QUILL_TOOLBAR }
            });
            quillEdit.on("text-change", () => {
                const hidden = document.getElementById("editComboDescHidden");
                if (hidden) hidden.value = quillEdit.root.innerHTML === "<p><br></p>" ? "" : quillEdit.root.innerHTML;
            });
        }
    }

    // Quill cần DOM đã render — init ngay hoặc sau DOMContentLoaded
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initQuill);
    } else {
        initQuill();
    }

    // ── Saving note helpers ───────────────────────────────────────────────
    function updateSavingNote(noteEl, selectedList, priceInput) {
        const total = selectedList.reduce((s, p) => s + (p.depositPrice || 0), 0);
        const combo = moneyInputValue(priceInput);
        noteEl.textContent = "";
        if (total > 0 && combo > 0) {
            const saving = total - combo;
            if (saving > 0) {
                noteEl.textContent = `✓ Tiết kiệm ${money(saving)} so với tổng giá gốc ${money(total)}`;
                noteEl.style.color = "#1c8f65";
            } else {
                noteEl.textContent = `Giá gốc tổng: ${money(total)}`;
                noteEl.style.color = "var(--text-muted)";
            }
        }
    }
    if (addPriceInput)  addPriceInput.addEventListener("input",  () => updateSavingNote(addSavingNote,  state.addSelected,  addPriceInput));
    if (editPriceInput) editPriceInput.addEventListener("input", () => updateSavingNote(editSavingNote, state.editSelected, editPriceInput));

    // ── Modal open/close ──────────────────────────────────────────────────
    function openModal(modal)  { modal.hidden = false; modal.classList.add("is-open");    }
    function closeModal(modal) { modal.hidden = true;  modal.classList.remove("is-open"); }

    document.getElementById("btnOpenAddCombo")?.addEventListener("click", () => {
        formAdd.reset();
        document.getElementById("addComboDescHidden").value = "";
        if (quillAdd) quillAdd.setContents([]);
        state.addSelected = [];
        state.addNewImages = [];
        addPrevEl.hidden = true; addPrevEl.innerHTML = "";
        renderSelectedList(addSelectedList, state.addSelected, "add");
        addSavingNote.textContent = "";
        openModal(modalAdd);
        iconRefresh();
    });
    ["btnCloseAddCombo", "btnCloseAddCombo2"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", () => closeModal(modalAdd));
    });
    ["btnCloseEditCombo", "btnCloseEditCombo2"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", () => closeModal(modalEdit));
    });
    // Click backdrop to close
    [modalAdd, modalEdit].forEach(m => {
        m?.addEventListener("click", (e) => { if (e.target === m) closeModal(m); });
    });

    // ── Image preview ─────────────────────────────────────────────────────
    function handleImageInput(input, prevEl, stateKey) {
        input.addEventListener("change", () => {
            const files = Array.from(input.files);
            state[stateKey] = files;
            renderImagePreview(prevEl, [], files.map((f, i) => ({ f, i, url: URL.createObjectURL(f) })));
        });
    }
    if (addImgInput)  handleImageInput(addImgInput,  addPrevEl,  "addNewImages");
    if (editImgInput) handleImageInput(editImgInput, editPrevEl, "editNewImages");

    function renderImagePreview(container, saved, news) {
        const all = [...saved, ...news];
        container.hidden = !all.length;
        container.innerHTML = [
            ...saved.map(({ id, url }) => `
                <figure class="product-image-preview-item">
                    <img src="${url}" alt="Ảnh đã lưu">
                    <button class="image-preview-remove" type="button" data-del-combo-img="${id}" aria-label="Xóa ảnh">
                        <i data-lucide="x"></i>
                    </button>
                    <span class="image-preview-badge">Đã lưu</span>
                </figure>`),
            ...news.map(({ i, url }) => `
                <figure class="product-image-preview-item is-new">
                    <img src="${url}" alt="Ảnh mới">
                    <span class="image-preview-badge">Ảnh mới</span>
                </figure>`)
        ].join("");

        // Xóa ảnh đã lưu
        container.querySelectorAll("[data-del-combo-img]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const imgId = btn.dataset.delComboImg;
                const comboId = qs("#editComboId").value;
                const result = await apiDelete(`/api/admin/combo/${comboId}/image/${imgId}`);
                if (result.status === "OK" || result.message?.includes("thành công")) {
                    state.editSavedImages = state.editSavedImages.filter(i => String(i.id) !== String(imgId));
                    renderImagePreview(editPrevEl, state.editSavedImages, state.editNewImages.map((f, i) => ({ i, url: URL.createObjectURL(f) })));
                    iconRefresh();
                    toast("Đã xóa ảnh", "success");
                } else {
                    toast(result.message || "Lỗi xóa ảnh", "error");
                }
            });
        });
        iconRefresh();
    }

    // ── Product search & select ───────────────────────────────────────────
    function setupProductSearch(searchEl, dropdownEl, selectedListEl, stateKey, priceInput, savingNoteEl) {
        let debounceTimer;
        searchEl.addEventListener("input", () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const q = searchEl.value.trim().toLowerCase();
                if (!q) { dropdownEl.hidden = true; return; }
                const results = state.allProducts.filter(p =>
                    (p.nameProduct || "").toLowerCase().includes(q) ||
                    (p.brand || "").toLowerCase().includes(q)
                ).slice(0, 8);
                renderDropdown(dropdownEl, results, state[stateKey], selectedListEl, stateKey, priceInput, savingNoteEl, searchEl);
            }, 200);
        });
        searchEl.addEventListener("blur", () => {
            setTimeout(() => { dropdownEl.hidden = true; }, 300);
        });
    }

    function renderDropdown(dropdownEl, results, selected, selectedListEl, stateKey, priceInput, savingNoteEl, searchEl) {
        if (!results.length) { dropdownEl.hidden = true; return; }
        const selectedIds = new Set(selected.map(p => p.id));
        dropdownEl.hidden = false;
        dropdownEl.innerHTML = results.map(p => {
            const isSelected = selectedIds.has(p.idProduct);
            const thumb = p.imageDTOS?.[0]?.imageBase64
                ? `<img src="${toImgSrc(p.imageDTOS[0].imageBase64)}" alt="">`
                : `<div style="width:36px;height:36px;border-radius:6px;background:var(--bg-muted);display:flex;align-items:center;justify-content:center;"><i data-lucide="camera" style="width:14px;height:14px;"></i></div>`;
            return `
                <div class="combo-dropdown-item${isSelected ? " is-selected" : ""}" data-pid="${p.idProduct}">
                    ${thumb}
                    <div>
                        <div class="combo-di-name">${escHtml(p.nameProduct)}</div>
                        <div class="combo-di-meta">${escHtml(p.brand || "")} · ${money(p.depositPrice)}</div>
                    </div>
                </div>`;
        }).join("");
        dropdownEl.querySelectorAll(".combo-dropdown-item:not(.is-selected)").forEach(item => {
            item.addEventListener("mousedown", (e) => {
                // dùng mousedown thay click để fire trước blur
                e.preventDefault();
                const pid = Number(item.dataset.pid);
                const product = state.allProducts.find(p => p.idProduct === pid);
                if (!product) return;
                state[stateKey].push({
                    id: product.idProduct,
                    name: product.nameProduct,
                    brand: product.brand,
                    depositPrice: product.depositPrice,
                    thumbnail: product.imageDTOS?.[0]?.imageBase64
                        ? toImgSrc(product.imageDTOS[0].imageBase64)
                        : null
                });
                dropdownEl.hidden = true;
                searchEl.value = "";
                renderSelectedList(selectedListEl, state[stateKey], stateKey === "addSelected" ? "add" : "edit");
                updateSavingNote(savingNoteEl, state[stateKey], priceInput);
                iconRefresh();
            });
        });
        iconRefresh();
    }

    function renderSelectedList(container, selected, mode) {
        if (!selected.length) {
            container.innerHTML = `<p class="combo-empty-hint">Chưa chọn sản phẩm nào. Tìm kiếm bên trên để thêm.</p>`;
            return;
        }
        container.innerHTML = selected.map((p, idx) => {
            const thumb = p.thumbnail
                ? `<img src="${p.thumbnail}" alt="">`                : `<div style="width:36px;height:36px;border-radius:6px;background:var(--bg-muted);display:flex;align-items:center;justify-content:center;color:var(--text-muted);"><i data-lucide="camera" style="width:14px;height:14px;"></i></div>`;
            return `
                <div class="combo-selected-item" data-idx="${idx}" data-mode="${mode}">
                    ${thumb}
                    <div class="combo-selected-item-info">
                        <strong>${escHtml(p.name)}</strong>
                        <span>${escHtml(p.brand || "")} · ${money(p.depositPrice)}</span>
                    </div>
                    <button class="btn-remove-product" type="button" data-remove-idx="${idx}" data-remove-mode="${mode}" aria-label="Xóa">
                        <i data-lucide="x"></i>
                    </button>
                </div>`;
        }).join("");

        container.querySelectorAll(".btn-remove-product").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = Number(btn.dataset.removeIdx);
                const mode = btn.dataset.removeMode;
                const stateKey = mode === "add" ? "addSelected" : "editSelected";
                state[stateKey].splice(idx, 1);
                renderSelectedList(container, state[stateKey], mode);
                const priceInput = mode === "add" ? addPriceInput : editPriceInput;
                const noteEl = mode === "add" ? addSavingNote : editSavingNote;
                updateSavingNote(noteEl, state[stateKey], priceInput);
                iconRefresh();
            });
        });
        iconRefresh();
    }

    if (addSearchInput) setupProductSearch(addSearchInput, addDropdown, addSelectedList, "addSelected", addPriceInput, addSavingNote);
    if (editSearchInput) setupProductSearch(editSearchInput, editDropdown, editSelectedList, "editSelected", editPriceInput, editSavingNote);

    // ── Render table ──────────────────────────────────────────────────────
    function renderTable() {
        const q      = (searchInput?.value || "").trim().toLowerCase();
        const status = statusFilter?.value || "";
        let list = state.combos.filter(c => {
            const matchQ = !q || (c.nameCombo || "").toLowerCase().includes(q);
            const matchS = !status
                || (status === "active"   &&  c.active)
                || (status === "inactive" && !c.active);
            return matchQ && matchS;
        });

        if (!list.length) {
            tableBody.innerHTML = "";
            emptyState.hidden = false;
            return;
        }
        emptyState.hidden = true;
        tableBody.innerHTML = list.map(c => {
            const thumb = c.imageDTOS?.[0]?.imageBase64
                ? `<img class="combo-thumb" src="${toImgSrc(c.imageDTOS[0].imageBase64)}" alt="">`
                : `<div class="combo-thumb-placeholder"><i data-lucide="package"></i></div>`;

            const chips = (c.products || []).slice(0, 3).map(p =>
                `<span class="combo-product-chip">${escHtml(p.nameProduct)}</span>`
            ).join("") + (c.products?.length > 3 ? `<span class="combo-product-chip">+${c.products.length - 3}</span>` : "");

            const saving = (c.totalBasePrice || 0) - (c.discountPrice || 0);

            return `<tr>
                <td>${thumb}</td>
                <td>
                    <strong>${escHtml(c.nameCombo)}</strong>
                    ${c.description ? `<br><span class="muted" style="font-size:12px;">${escHtml(c.description.slice(0, 60))}${c.description.length > 60 ? "..." : ""}</span>` : ""}
                </td>
                <td><div class="combo-product-chips">${chips || '<span style="color:var(--text-muted);font-size:12px;">—</span>'}</div></td>
                <td><span style="font-size:12px;color:var(--text-muted);">${money(c.totalBasePrice)}</span></td>
                <td>
                    <strong style="color:var(--primary);">${money(c.discountPrice)}</strong>
                    ${saving > 0 ? `<br><span style="font-size:11px;color:#1c8f65;">↓ ${money(saving)}</span>` : ""}
                </td>
                <td>
                    <div class="combo-toggle">
                        <label class="combo-toggle-switch">
                            <input type="checkbox" ${c.active ? "checked" : ""} data-toggle-combo="${c.idCombo}">
                            <span class="combo-toggle-thumb"></span>
                        </label>
                        <span class="combo-toggle-label">${c.active ? "Bật" : "Tắt"}</span>
                    </div>
                </td>
                <td>
                    <div class="button-row">
                        <button class="icon-button sm" type="button" data-edit-combo="${c.idCombo}" aria-label="Sửa">
                            <i data-lucide="pencil"></i>
                        </button>
                        <button class="icon-button sm danger" type="button" data-delete-combo="${c.idCombo}" aria-label="Xóa">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join("");
        iconRefresh();
    }

    searchInput?.addEventListener("input",  renderTable);
    statusFilter?.addEventListener("change", renderTable);

    // ── Toggle active ─────────────────────────────────────────────────────
    tableBody?.addEventListener("change", async (e) => {
        const btn = e.target.closest("[data-toggle-combo]");
        if (!btn) return;
        const id = Number(btn.dataset.toggleCombo);
        const result = await apiPutJson("/api/admin/combo/toggle-active", { idCombo: id });
        if (result.status === "OK" || result.message?.includes("combo")) {
            const combo = state.combos.find(c => c.idCombo === id);
            if (combo) combo.active = !combo.active;
            renderTable();
            toast(result.message, "success");
        } else {
            toast(result.message || "Lỗi", "error");
            renderTable(); // reset checkbox
        }
    });

    // ── Edit combo ────────────────────────────────────────────────────────
    tableBody?.addEventListener("click", async (e) => {
        const editBtn = e.target.closest("[data-edit-combo]");
        if (editBtn) {
            const id = Number(editBtn.dataset.editCombo);
            const combo = state.combos.find(c => c.idCombo === id);
            if (!combo) return;

            qs("#editComboId").value         = combo.idCombo;
            qs("#editComboName").value        = combo.nameCombo || "";
            // Load mô tả vào Quill editor
            document.getElementById("editComboDescHidden").value = combo.description || "";
            if (quillEdit) {
                quillEdit.root.innerHTML = combo.description || "";
            }
            setMoneyInput(editPriceInput, combo.discountPrice);
            qs("#editComboTitle").textContent = combo.nameCombo || "Sửa combo";

            // Load sản phẩm đã chọn
            state.editSelected = (combo.products || []).map(p => ({
                id: p.idProduct,
                name: p.nameProduct,
                brand: p.brand,
                depositPrice: p.depositPrice,
                thumbnail: p.thumbnailBase64 ? toImgSrc(p.thumbnailBase64) : null
            }));
            renderSelectedList(editSelectedList, state.editSelected, "edit");
            updateSavingNote(editSavingNote, state.editSelected, editPriceInput);

            // Load ảnh đã lưu
            state.editSavedImages = (combo.imageDTOS || []).map(img => ({
                id: img.idImage,
                url: toImgSrc(img.imageBase64)
            }));
            state.editNewImages = [];
            if (editImgInput) editImgInput.value = "";
            renderImagePreview(editPrevEl, state.editSavedImages, []);

            openModal(modalEdit);
            iconRefresh();
            return;
        }

        // Delete
        const delBtn = e.target.closest("[data-delete-combo]");
        if (delBtn) {
            const id = Number(delBtn.dataset.deleteCombo);
            const combo = state.combos.find(c => c.idCombo === id);
            if (!confirm(`Xóa combo "${combo?.nameCombo || id}"? Hành động không thể hoàn tác.`)) return;
            const result = await apiDelete(`/api/admin/combo/${id}`);
            if (result.status === "OK" || result.message?.includes("thành công")) {
                state.combos = state.combos.filter(c => c.idCombo !== id);
                renderTable();
                toast(result.message, "success");
            } else {
                toast(result.message || "Lỗi xóa", "error");
            }
        }
    });

    // ── Submit add combo ──────────────────────────────────────────────────
    formAdd?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.addSelected.length) {
            toast("Vui lòng chọn ít nhất một sản phẩm", "error");
            return;
        }
        const btn = document.getElementById("btnSubmitAddCombo");
        btn.disabled = true;

        // Sync Quill → hidden input trước khi build FormData
        if (quillAdd) {
            const html = quillAdd.root.innerHTML;
            document.getElementById("addComboDescHidden").value = html === "<p><br></p>" ? "" : html;
        }

        const fd = new FormData(formAdd);
        // Xóa discountPrice dạng string có dấu phẩy, gửi số thuần
        fd.set("discountPrice", moneyInputValue(addPriceInput));
        // Gửi productIds
        fd.delete("productIds");
        state.addSelected.forEach(p => fd.append("productIds", p.id));

        try {
            const result = await apiPost("/api/admin/combo", fd);
            if (result.status === "OK" || result.message?.includes("thành công")) {
                closeModal(modalAdd);
                toast(result.message, "success");
                await load();
            } else {
                toast(result.message || "Lỗi tạo combo", "error");
            }
        } finally {
            btn.disabled = false;
        }
    });

    // ── Submit edit combo ─────────────────────────────────────────────────
    formEdit?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.editSelected.length) {
            toast("Vui lòng chọn ít nhất một sản phẩm", "error");
            return;
        }
        const btn = document.getElementById("btnSubmitEditCombo");
        btn.disabled = true;

        // Sync Quill → hidden input trước khi build FormData
        if (quillEdit) {
            const html = quillEdit.root.innerHTML;
            document.getElementById("editComboDescHidden").value = html === "<p><br></p>" ? "" : html;
        }

        const fd = new FormData(formEdit);
        fd.set("discountPrice", moneyInputValue(editPriceInput));
        fd.delete("productIds");
        state.editSelected.forEach(p => fd.append("productIds", p.id));

        try {
            const result = await apiPut("/api/admin/combo", fd);
            if (result.status === "OK" || result.message?.includes("thành công")) {
                closeModal(modalEdit);
                toast(result.message, "success");
                await load();
            } else {
                toast(result.message || "Lỗi cập nhật combo", "error");
            }
        } finally {
            btn.disabled = false;
        }
    });

    // ── Load data ─────────────────────────────────────────────────────────
    async function load() {
        try {
            const [comboResp, productResp] = await Promise.all([
                apiGet("/api/combo"),
                apiGet("/api/product/all")
            ]);
            state.combos      = unwrapList(comboResp);
            state.allProducts = unwrapList(productResp);
            renderTable();
        } catch (err) {
            toast(err.message, "error");
        }
    }

    load();
})();
