
CREATE DATABASE IF NOT EXISTS pvt_factory;
USE pvt_factory;

CREATE TABLE reports(
 id INT AUTO_INCREMENT PRIMARY KEY,
 datetime DATETIME NOT NULL,
 department VARCHAR(50) NOT NULL,
 type VARCHAR(255) NOT NULL,
 detail TEXT NOT NULL,
 status ENUM('pending','progress','resolved') DEFAULT 'pending'
);

CREATE TABLE reports(
 id INT AUTO_INCREMENT PRIMARY KEY,
 datetime DATETIME NOT NULL,
 department VARCHAR(50) NOT NULL,
 type VARCHAR(255) NOT NULL,
 machine_no VARCHAR(100) DEFAULT NULL, /* 👈 เพิ่มช่องนี้เข้ามาเก็บชื่อเครื่อง */
 detail TEXT NOT NULL,
 status ENUM('pending','progress','resolved') DEFAULT 'pending'
);