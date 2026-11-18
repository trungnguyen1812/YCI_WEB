-- ============================================================
-- YCI_WEB — Combo feature migration
-- Chạy trên database YCI trước khi khởi động ứng dụng
-- ============================================================

CREATE TABLE IF NOT EXISTS combo (
    id_combo       BIGINT       AUTO_INCREMENT PRIMARY KEY,
    name_combo     VARCHAR(255) NOT NULL,
    description    TEXT,
    discount_price DOUBLE,
    active         TINYINT(1)   NOT NULL DEFAULT 1,
    created_at     DATETIME,
    updated_at     DATETIME
);

CREATE TABLE IF NOT EXISTS combo_items (
    id_combo_item BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_combo      BIGINT NOT NULL,
    id_product    BIGINT NOT NULL,
    CONSTRAINT fk_combo_item_combo   FOREIGN KEY (id_combo)   REFERENCES combo(id_combo)    ON DELETE CASCADE,
    CONSTRAINT fk_combo_item_product FOREIGN KEY (id_product) REFERENCES products(id_product)
);

CREATE TABLE IF NOT EXISTS combo_image (
    id_combo_image BIGINT AUTO_INCREMENT PRIMARY KEY,
    image          LONGBLOB,
    id_combo       BIGINT NOT NULL,
    CONSTRAINT fk_combo_image_combo FOREIGN KEY (id_combo) REFERENCES combo(id_combo) ON DELETE CASCADE
);
