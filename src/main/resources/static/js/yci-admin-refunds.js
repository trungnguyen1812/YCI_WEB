/* ══════════════════════════════════════════════════════════════
   Admin: Hủy đơn & Hoàn tiền thủ công
   ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    if (document.body.dataset.page !== 'admin-refunds') return;

    // ── Tab switching ──────────────────────────────────────────
    const tabs = { cancellations: document.getElementById('tabCancellations'),
                   refunds:       document.getElementById('tabRefunds'),
                   history:       document.getElementById('tabHistory') };
    let activeTab = 'cancellations';

    document.querySelectorAll('[data-refund-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-refund-tab]').forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            activeTab = btn.dataset.refundTab;
            Object.keys(tabs).forEach(k => { tabs[k].hidden = k !== activeTab; });
            if (activeTab === 'history') loadHistory();
        });
    });

    // ── Modal helpers ──────────────────────────────────────────
    function openModal(el) {
        el.hidden = false;
        document.body.classList.add('bmodal-open');
        requestAnimationFrame(() => el.classList.add('is-open'));
    }
    function closeModal(el) {
        el.classList.remove('is-open');
        el.addEventListener('transitionend', () => {
            el.hidden = true; document.body.classList.remove('bmodal-open');
        }, { once: true });
    }

    const modalApprove = document.getElementById('modalApprove');
    const modalConfirm = document.getElementById('modalConfirmRefund');
    document.querySelectorAll('[data-close-approve]').forEach(b => b.addEventListener('click', () => closeModal(modalApprove)));
    document.querySelectorAll('[data-close-confirm-refund]').forEach(b => b.addEventListener('click', () => closeModal(modalConfirm)));
    [modalApprove, modalConfirm].forEach(m => m?.addEventListener('click', e => { if (e.target === m) closeModal(m); }));

    // ── Status labels ──────────────────────────────────────────
    const cancelStatus = { PENDING:'sc-waiting', APPROVED:'sc-accepted', REJECTED:'sc-cancelled' };
    const cancelLabel  = { PENDING:'Chờ duyệt', APPROVED:'Đã duyệt', REJECTED:'Từ chối' };
    const refundStatus = { PENDING_TRANSFER:'sc-waiting', TRANSFERRED:'sc-completed', FAILED:'sc-cancelled' };
    const refundLabel  = { PENDING_TRANSFER:'Chờ CK', TRANSFERRED:'Đã hoàn', FAILED:'Thất bại' };

    function maskNo(no) { if (!no) return '—'; return no.length > 4 ? '*'.repeat(no.length-4)+no.slice(-4) : no; }

    // ── Load Cancellations ─────────────────────────────────────
    async function loadCancellations() {
        try {
            const res  = await YCI.apiGet('/api/admin/cancellations');
            const list = res.data || [];
            document.getElementById('cancelCount').textContent = list.filter(r => r.status === 'PENDING').length;
            document.getElementById('cancelTable').innerHTML = list.map(r => `
                <tr>
                    <td><strong>#${r.idCancellation}</strong></td>
                    <td><a href="#" style="color:var(--teal);">#${r.idBooking}</a></td>
                    <td>
                        <strong>${YCI.escapeHtml(r.customerName || '—')}</strong>
                        <br><span class="muted">${YCI.escapeHtml(r.customerPhone || '')}</span>
                    </td>
                    <td style="max-width:160px;word-break:break-word;">${YCI.escapeHtml(r.reason || '—')}</td>
                    <td style="font-size:12px;">
                        ${r.refundBankName ? `<strong>${YCI.escapeHtml(r.refundBankName)}</strong><br>` : ''}
                        ${r.refundAccountNoMasked ? `${r.refundAccountNoMasked}<br>` : ''}
                        ${r.refundAccountName ? `<span class="muted">${YCI.escapeHtml(r.refundAccountName)}</span>` : '<span class="muted">Chưa cung cấp</span>'}
                    </td>
                    <td><strong style="color:var(--teal-dark);">${YCI.money(r.depositPaid || 0)}</strong></td>
                    <td><span class="status-pill ${cancelStatus[r.status]||'sc-default'}">${cancelLabel[r.status]||r.status}</span></td>
                    <td>
                        ${r.status === 'PENDING' ? `
                        <button class="button ghost" type="button" style="font-size:12px;min-height:34px;"
                                data-approve-cancel="${r.idCancellation}"
                                data-booking="${r.idBooking}"
                                data-customer="${YCI.escapeHtml(r.customerName||'')}"
                                data-paid="${r.depositPaid||0}"
                                data-bank="${YCI.escapeHtml(r.refundBankName||'')}"
                                data-accno="${YCI.escapeHtml(r.refundAccountNoMasked||'')}"
                                data-accname="${YCI.escapeHtml(r.refundAccountName||'')}">
                            Xử lý
                        </button>` : '—'}
                    </td>
                </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--muted);">Chưa có yêu cầu hủy.</td></tr>';
        } catch (e) { YCI.toast(e.message, 'error'); }
    }

    // ── Load Pending Refunds ────────────────────────────────────
    async function loadRefunds() {
        try {
            const res  = await YCI.apiGet('/api/admin/refunds/pending');
            const list = res.data || [];
            document.getElementById('refundCount').textContent = list.length;
            document.getElementById('refundTable').innerHTML = list.map(r => `
                <tr>
                    <td><strong>#${r.idRefund}</strong></td>
                    <td>#${r.idBooking}</td>
                    <td>${YCI.escapeHtml(r.customerName||'—')}</td>
                    <td style="font-size:12px;">
                        ${r.refundBankName ? `<strong>${YCI.escapeHtml(r.refundBankName)}</strong><br>` : ''}
                        ${r.refundAccountNoMasked || ''}
                        ${r.refundAccountName ? `<br><span class="muted">${YCI.escapeHtml(r.refundAccountName)}</span>` : ''}
                    </td>
                    <td><strong style="color:#1a56db;">${YCI.money(r.approvedAmount||0)}</strong></td>
                    <td><span class="status-pill ${refundStatus[r.status]||'sc-default'}">${refundLabel[r.status]||r.status}</span></td>
                    <td>
                        <button class="button primary" type="button" style="font-size:12px;min-height:34px;"
                                data-confirm-refund="${r.idRefund}"
                                data-amount="${r.approvedAmount||0}"
                                data-customer="${YCI.escapeHtml(r.customerName||'')}"
                                data-bank="${YCI.escapeHtml(r.refundBankName||'')}"
                                data-accno="${YCI.escapeHtml(r.refundAccountNoMasked||'')}"
                                data-accname="${YCI.escapeHtml(r.refundAccountName||'')}">
                            Xác nhận đã CK
                        </button>
                    </td>
                </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted);">Không có khoản chờ chuyển khoản.</td></tr>';
        } catch (e) { YCI.toast(e.message, 'error'); }
    }

    // ── Load History ───────────────────────────────────────────
    async function loadHistory() {
        try {
            const res  = await YCI.apiGet('/api/admin/refunds');
            const list = res.data || [];
            document.getElementById('historyTable').innerHTML = list.map(r => `
                <tr>
                    <td>#${r.idRefund}</td>
                    <td>#${r.idBooking}</td>
                    <td>${YCI.escapeHtml(r.customerName||'—')}</td>
                    <td><strong>${YCI.money(r.actualAmount||0)}</strong></td>
                    <td style="font-size:12px;font-family:monospace;">${YCI.escapeHtml(r.transferRef||'—')}</td>
                    <td><span class="muted">${r.transferredAt ? new Date(r.transferredAt).toLocaleString('vi-VN') : '—'}</span></td>
                    <td><span class="status-pill ${refundStatus[r.status]||'sc-default'}">${refundLabel[r.status]||r.status}</span></td>
                </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted);">Chưa có lịch sử.</td></tr>';
        } catch (e) { YCI.toast(e.message, 'error'); }
    }

    // ── Approve modal ───────────────────────────────────────────
    document.getElementById('cancelTable')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-approve-cancel]');
        if (!btn) return;
        document.getElementById('approveCancelId').value = btn.dataset.approveCancel;
        document.getElementById('approveRefundAmount').value = '';
        document.getElementById('approveAdminNote').value = '';
        document.getElementById('approveModalTitle').textContent =
            `Xử lý hủy Đơn #${btn.dataset.booking} — ${btn.dataset.customer}`;
        document.getElementById('approveInfoBox').innerHTML = `
            <div style="display:grid;gap:6px;">
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:var(--muted);">Đã cọc</span>
                    <strong style="color:var(--teal-dark);">${YCI.money(Number(btn.dataset.paid))}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:var(--muted);">Ngân hàng nhận hoàn</span>
                    <strong>${YCI.escapeHtml(btn.dataset.bank||'Chưa cung cấp')}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:var(--muted);">Số TK</span>
                    <strong style="font-family:monospace;">${YCI.escapeHtml(btn.dataset.accno||'—')}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:var(--muted);">Tên chủ TK</span>
                    <strong>${YCI.escapeHtml(btn.dataset.accname||'—')}</strong>
                </div>
            </div>`;
        openModal(modalApprove);
        YCI.moneyInput(modalApprove);
    });

    document.getElementById('formApprove')?.addEventListener('submit', async e => {
        e.preventDefault();
        const id    = document.getElementById('approveCancelId').value;
        const amtEl = document.getElementById('approveRefundAmount');
        const amt   = YCI.parseMoneyInput(amtEl);
        const note  = document.getElementById('approveAdminNote').value;
        const btn   = document.getElementById('btnApprove');
        btn.disabled = true;
        try {
            await YCI.apiJson(`/api/admin/cancellations/${id}/approve`, 'PUT', {
                refundAmount: amt || null,
                adminNote: note
            });
            YCI.toast('Đã duyệt hủy đơn và tạo bản ghi hoàn tiền.', 'success');
            closeModal(modalApprove);
            await loadCancellations();
            await loadRefunds();
        } catch (err) { YCI.toast(err.message, 'error'); }
        finally { btn.disabled = false; }
    });

    document.getElementById('btnReject')?.addEventListener('click', async () => {
        const id   = document.getElementById('approveCancelId').value;
        const note = document.getElementById('approveAdminNote').value;
        if (!confirm('Xác nhận từ chối yêu cầu hủy này?')) return;
        try {
            await YCI.apiJson(`/api/admin/cancellations/${id}/reject`, 'PUT', { adminNote: note });
            YCI.toast('Đã từ chối yêu cầu hủy.', 'success');
            closeModal(modalApprove);
            await loadCancellations();
        } catch (err) { YCI.toast(err.message, 'error'); }
    });

    // ── Confirm refund modal ────────────────────────────────────
    document.getElementById('refundTable')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-confirm-refund]');
        if (!btn) return;
        document.getElementById('confirmRefundId').value = btn.dataset.confirmRefund;
        const fmt = new Intl.NumberFormat('vi-VN').format(Number(btn.dataset.amount));
        document.getElementById('confirmActualAmount').value = fmt;
        document.getElementById('confirmTransferRef').value = '';
        document.getElementById('confirmTransferNote').value = '';
        document.getElementById('confirmRefundInfo').innerHTML = `
            <strong>Khách:</strong> ${YCI.escapeHtml(btn.dataset.customer)}<br>
            <strong>Số tiền duyệt:</strong> ${YCI.money(Number(btn.dataset.amount))}<br>
            <strong>Ngân hàng:</strong> ${YCI.escapeHtml(btn.dataset.bank||'—')}<br>
            <strong>Số TK:</strong> <span style="font-family:monospace;">${YCI.escapeHtml(btn.dataset.accno||'—')}</span><br>
            <strong>Tên chủ TK:</strong> ${YCI.escapeHtml(btn.dataset.accname||'—')}`;
        openModal(modalConfirm);
        YCI.moneyInput(modalConfirm);
    });

    document.getElementById('formConfirmRefund')?.addEventListener('submit', async e => {
        e.preventDefault();
        const id       = document.getElementById('confirmRefundId').value;
        const actualEl = document.getElementById('confirmActualAmount');
        const actual   = YCI.parseMoneyInput(actualEl);
        const ref      = document.getElementById('confirmTransferRef').value.trim();
        const note     = document.getElementById('confirmTransferNote').value.trim();
        if (!ref) { YCI.toast('Vui lòng nhập mã tham chiếu giao dịch.', 'error'); return; }
        try {
            await YCI.apiJson(`/api/admin/refunds/${id}/confirm-transferred`, 'PUT', {
                actualAmount: actual, transferRef: ref, transferNote: note
            });
            YCI.toast('Đã xác nhận hoàn tiền thành công.', 'success');
            closeModal(modalConfirm);
            await loadRefunds();
        } catch (err) { YCI.toast(err.message, 'error'); }
    });

    document.getElementById('btnMarkFailed')?.addEventListener('click', async () => {
        const id     = document.getElementById('confirmRefundId').value;
        const reason = prompt('Lý do chuyển khoản thất bại:');
        if (!reason) return;
        try {
            await YCI.apiJson(`/api/admin/refunds/${id}/mark-failed`, 'PUT', { failureReason: reason });
            YCI.toast('Đã đánh dấu thất bại. Cần xử lý lại.', 'success');
            closeModal(modalConfirm);
            await loadRefunds();
        } catch (err) { YCI.toast(err.message, 'error'); }
    });

    // ── Init ───────────────────────────────────────────────────
    loadCancellations();
    loadRefunds();

})();
