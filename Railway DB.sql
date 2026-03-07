USE railway;

DROP TABLE IF EXISTS items;

CREATE TABLE items (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    reporter_name     VARCHAR(100)  NOT NULL,
    title             VARCHAR(255)  NOT NULL,
    description       TEXT          NOT NULL,
    category          ENUM('Lost', 'Found') NOT NULL,
    location          VARCHAR(255)  NOT NULL,
    item_date         DATE          NOT NULL,
    contact_info      VARCHAR(255)  NOT NULL,
    image_path        VARCHAR(255)  DEFAULT NULL,
    verification_code CHAR(64)      NOT NULL,
    status            ENUM('Active', 'Resolved') DEFAULT 'Active',
    created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);