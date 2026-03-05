CREATE DATABASE IF NOT EXISTS campus_lost_and_found;
USE campus_lost_and_found;

CREATE TABLE items(
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category ENUM('Lost', 'Found') NOT NULL,
    location VARCHAR(255) NOT NULL,
    item_date DATE NOT NULL,
    contact_info VARCHAR(255) NOT NULL,
    status ENUM('Active', 'Resolved') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);