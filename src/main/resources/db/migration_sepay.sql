-- ══════════════════════════════════════════════════════════════
-- YCI SePay Integration Migration
-- Chạy một lần duy nhất trên DB YCI
-- ══════════════════════════════════════════════════════════════

-- 1. Thêm các cột vào payment_booking để hỗ trợ SePay tracking
ALTER TABLE payment_booking
    ADD COLUMN IF NOT EXISTS reference_code  VARCHAR(100) NULL COMMENT 'Mã tham chiếu duy nhất gắn vào nội dung QR',
    ADD COLUMN IF NOT EXISTS payment_status  VARCHAR(30)  NOT NULL DEFAULT 'PENDING'
        COMMENT 'PENDING | PAID | EXPIRED | FAILED',
    ADD COLUMN IF NOT EXISTS gateway_txn_id  VARCHAR(200) NULL COMMENT 'Transaction ID từ SePay webhook',
    ADD COLUMN IF NOT EXISTS gateway_payload TEXT         NULL COMMENT 'Raw webhook JSON từ SePay (audit)',
    ADD COLUMN IF NOT EXISTS expires_at      DATETIME     NULL COMMENT 'Thời hạn thanh toán QR';

-- Index để tìm nhanh theo reference_code (webhook sẽ gọi liên tục)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_ref ON payment_booking(reference_code);

-- 2. Bảng yêu cầu hủy đơn
CREATE TABLE IF NOT EXISTS cancellation_requests (
    id_cancellation    BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_booking         BIGINT NOT NULL,
    id_user            BIGINT NOT NULL,
    reason             TEXT   NOT NULL               COMMENT 'Lý do hủy của khách',
    status             VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        COMMENT 'PENDING | APPROVED | REJECTED',
    admin_note         TEXT   NULL                   COMMENT 'Ghi chú của admin khi duyệt/từ chối',
    id_admin           BIGINT NULL                   COMMENT 'Admin đã xử lý',
    processed_at       DATETIME NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Thông tin tài khoản nhận hoàn tiền (khách cung cấp khi gửi yêu cầu)
    refund_bank_name   VARCHAR(100) NULL             COMMENT 'Tên ngân hàng nhận hoàn',
    refund_account_no  VARCHAR(50)  NULL             COMMENT 'Số tài khoản nhận hoàn',
    refund_account_name VARCHAR(200) NULL            COMMENT 'Tên chủ tài khoản nhận hoàn',
    -- Chống gửi trùng: mỗi booking chỉ có 1 yêu cầu đang PENDING
    UNIQUE KEY uq_booking_pending (id_booking, status),
    FOREIGN KEY (id_booking) REFERENCES bookings(id_booking) ON DELETE CASCADE,
    FOREIGN KEY (id_user)    REFERENCES users(id_user)       ON DELETE CASCADE
);

-- 3. Bảng hoàn tiền thủ công
CREATE TABLE IF NOT EXISTS refunds (
    id_refund          BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_cancellation    BIGINT NOT NULL               COMMENT 'FK sang cancellation_requests',
    id_booking         BIGINT NOT NULL,
    approved_amount    DOUBLE NOT NULL               COMMENT 'Số tiền admin duyệt hoàn',
    actual_amount      DOUBLE NULL                   COMMENT 'Số tiền thực tế đã chuyển khoản',
    status             VARCHAR(30) NOT NULL DEFAULT 'PENDING_TRANSFER'
        COMMENT 'PENDING_TRANSFER | TRANSFERRED | FAILED',
    -- Thông tin tài khoản nhận (sao chép từ cancellation để tránh thay đổi sau duyệt)
    refund_bank_name   VARCHAR(100) NULL,
    refund_account_no  VARCHAR(50)  NULL,
    refund_account_name VARCHAR(200) NULL,
    -- Admin xác nhận đã chuyển khoản
    transfer_ref       VARCHAR(200) NULL             COMMENT 'Mã tham chiếu GD ngân hàng khi hoàn',
    transfer_note      TEXT NULL,
    transferred_at     DATETIME NULL,
    id_admin           BIGINT NULL                   COMMENT 'Admin xác nhận đã chuyển',
    admin_note         TEXT NULL,
    -- Lý do thất bại nếu FAILED
    failure_reason     TEXT NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Chống xác nhận trùng
    UNIQUE KEY uq_refund_transferred (id_cancellation, status),
    FOREIGN KEY (id_cancellation) REFERENCES cancellation_requests(id_cancellation),
    FOREIGN KEY (id_booking)      REFERENCES bookings(id_booking)
);

-- 4. Thêm status codes cần thiết nếu chưa có
INSERT IGNORE INTO status (status_code) VALUES
    ('PENDING_DEPOSIT'),   -- Đơn đã tạo, chờ khách chuyển cọc QR
    ('CANCEL_REQUESTED'),  -- Khách đã gửi yêu cầu hủy, chờ admin duyệt
    ('REFUND_PENDING'),    -- Admin đã duyệt hủy, đang chờ chuyển tiền hoàn
    ('REFUNDED');          -- Đã hoàn tiền xong

-- 5. Thêm phương thức thanh toán SePay nếu chưa có
INSERT IGNORE INTO payments_method (method) VALUES ('SePay QR');

-- Xác nhận
SELECT 'Migration SePay hoàn tất' AS result;
