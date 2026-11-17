-- Smart Asset Management System: database setup
-- Bootstrap for a new project database only. Inspect live state and obtain approval before execution.
-- Not a migration or a rerunnable script. Existing tables must be inspected separately.


CREATE DATABASE IF NOT EXISTS asset_management_system;
USE asset_management_system;

CREATE TABLE roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    dob DATE,
    role_id INT,
    profile_image VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE labs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    lab_name VARCHAR(100) NOT NULL,
    lab_code VARCHAR(50) UNIQUE,
    room_number VARCHAR(50),
    department VARCHAR(100),
    description TEXT,
    qr_code VARCHAR(255),
    extra_details JSON NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    asset_name VARCHAR(100) NOT NULL,
    asset_code VARCHAR(100) UNIQUE,
    category_id INT,
    lab_id INT,

    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),

    processor VARCHAR(100),
    ram VARCHAR(50),
    storage VARCHAR(100),

    purchase_date DATE,
    warranty_expiry DATE,

    asset_condition VARCHAR(50),
    asset_status VARCHAR(50),

    assigned_to VARCHAR(100),
    extra_details LONGTEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (lab_id) REFERENCES labs(id)
);

CREATE TABLE maintenance (
    id INT PRIMARY KEY AUTO_INCREMENT,
    asset_id INT,
    issue_description TEXT,
    maintenance_status VARCHAR(100),
    technician_name VARCHAR(100),
    maintenance_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    activity TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO roles (role_name)
VALUES
('Super Admin'),
('Admin'),
('Viewer'),
('Technician');