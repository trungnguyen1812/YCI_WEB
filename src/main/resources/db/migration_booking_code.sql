-- ── Migration: thêm cột booking_code vào bảng bookings ──────────────
-- Chạy 1 lần trên DB trước khi khởi động lại ứng dụng

ALTER TABLE bookings
    ADD COLUMN booking_code VARCHAR(20) NULL UNIQUE AFTER id_booking;

-- Backfill mã HD cho tất cả đơn cũ (chưa có code)
UPDATE bookings
SET booking_code = CONCAT('HD', LPAD(id_booking, 6, '0'))
WHERE booking_code IS NULL;

-- (Tuỳ chọn) Đặt NOT NULL sau khi backfill xong
ALTER TABLE bookings
    MODIFY COLUMN booking_code VARCHAR(20) NOT NULL;
