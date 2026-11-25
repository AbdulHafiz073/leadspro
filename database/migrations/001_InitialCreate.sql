-- =======================================================
-- LeadHunter Pro - MySQL 8.0 Initial Database Migration
-- Character Set: utf8mb4, Collation: utf8mb4_unicode_ci
-- =======================================================

CREATE DATABASE IF NOT EXISTS `leadhunterpro`
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE `leadhunterpro`;

-- 1. Table: Users
CREATE TABLE IF NOT EXISTS `Users` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Email` VARCHAR(255) NOT NULL,
    `PasswordHash` VARCHAR(255) NOT NULL,
    `FullName` VARCHAR(150) NOT NULL,
    `Role` ENUM('Admin', 'User') NOT NULL DEFAULT 'User',
    `CreatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `IsActive` TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `UX_Users_Email` (`Email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table: Countries
CREATE TABLE IF NOT EXISTS `Countries` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(100) NOT NULL,
    `Code` VARCHAR(2) NOT NULL,
    `IsActive` TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `UX_Countries_Code` (`Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default target countries
INSERT INTO `Countries` (`Id`, `Name`, `Code`, `IsActive`) VALUES
(1, 'India', 'IN', 1),
(2, 'United States', 'US', 1),
(3, 'United Kingdom', 'GB', 1),
(4, 'United Arab Emirates', 'AE', 1),
(5, 'Canada', 'CA', 1),
(6, 'Australia', 'AU', 1),
(7, 'Germany', 'DE', 1),
(8, 'Singapore', 'SG', 1)
ON DUPLICATE KEY UPDATE `Name` = VALUES(`Name`), `IsActive` = VALUES(`IsActive`);

-- 3. Table: Leads
CREATE TABLE IF NOT EXISTS `Leads` (
    `Id` BIGINT NOT NULL AUTO_INCREMENT,
    `BusinessName` VARCHAR(255) NOT NULL,
    `ContactPerson` VARCHAR(150) NULL,
    `Email` VARCHAR(255) NULL,
    `PhoneNumber` VARCHAR(50) NULL,
    `WhatsAppNumber` VARCHAR(50) NULL,
    `WebsiteUrl` VARCHAR(500) NULL,
    `HasWebsite` TINYINT(1) NOT NULL DEFAULT 0,
    `Address` VARCHAR(500) NULL,
    `City` VARCHAR(100) NOT NULL,
    `State` VARCHAR(100) NULL,
    `CountryId` INT NOT NULL,
    `PostalCode` VARCHAR(20) NULL,
    `Latitude` DECIMAL(10, 8) NULL,
    `Longitude` DECIMAL(11, 8) NULL,
    `Category` VARCHAR(100) NOT NULL,
    `Source` ENUM('Google Places', 'SerpAPI', 'Manual') NOT NULL DEFAULT 'Google Places',
    `GooglePlaceId` VARCHAR(255) NULL,
    `Rating` DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
    `ReviewCount` INT NOT NULL DEFAULT 0,
    `LeadScore` INT NOT NULL DEFAULT 0,
    `WebsiteStatus` ENUM('NoWebsite', 'Outdated', 'HasWebsite', 'NeedsUpdate') NOT NULL DEFAULT 'NoWebsite',
    `LastCheckedAt` DATETIME(6) NULL,
    `CreatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `UpdatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `IsSelected` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `UX_Leads_GooglePlaceId` (`GooglePlaceId`),
    KEY `IX_Leads_CountryId` (`CountryId`),
    KEY `IX_Leads_Category` (`Category`),
    KEY `IX_Leads_LeadScore` (`LeadScore`),
    KEY `IX_Leads_WebsiteStatus` (`WebsiteStatus`),
    CONSTRAINT `FK_Leads_Countries_CountryId` FOREIGN KEY (`CountryId`) REFERENCES `Countries` (`Id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Table: OutreachTemplates
CREATE TABLE IF NOT EXISTS `OutreachTemplates` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `UserId` INT NOT NULL,
    `Name` VARCHAR(150) NOT NULL,
    `Channel` ENUM('WhatsApp', 'Email', 'Twitter', 'Instagram', 'Telegram') NOT NULL,
    `Subject` VARCHAR(255) NULL,
    `Body` TEXT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`Id`),
    KEY `IX_OutreachTemplates_UserId` (`UserId`),
    KEY `IX_OutreachTemplates_Channel` (`Channel`),
    CONSTRAINT `FK_OutreachTemplates_Users_UserId` FOREIGN KEY (`UserId`) REFERENCES `Users` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Table: OutreachLogs
CREATE TABLE IF NOT EXISTS `OutreachLogs` (
    `Id` BIGINT NOT NULL AUTO_INCREMENT,
    `LeadId` BIGINT NOT NULL,
    `UserId` INT NOT NULL,
    `Channel` ENUM('WhatsApp', 'Email', 'Twitter', 'Instagram', 'Telegram') NOT NULL,
    `MessageBody` TEXT NOT NULL,
    `Status` ENUM('Pending', 'Sent', 'Failed', 'Delivered') NOT NULL DEFAULT 'Pending',
    `SentAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `ErrorMessage` VARCHAR(500) NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_OutreachLogs_LeadId` (`LeadId`),
    KEY `IX_OutreachLogs_UserId` (`UserId`),
    KEY `IX_OutreachLogs_Channel` (`Channel`),
    KEY `IX_OutreachLogs_Status` (`Status`),
    CONSTRAINT `FK_OutreachLogs_Leads_LeadId` FOREIGN KEY (`LeadId`) REFERENCES `Leads` (`Id`) ON DELETE CASCADE,
    CONSTRAINT `FK_OutreachLogs_Users_UserId` FOREIGN KEY (`UserId`) REFERENCES `Users` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Table: DailyFetchLogs
CREATE TABLE IF NOT EXISTS `DailyFetchLogs` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `FetchDate` DATE NOT NULL,
    `CountryId` INT NOT NULL,
    `LeadsAdded` INT NOT NULL DEFAULT 0,
    `Status` ENUM('Success', 'Failed') NOT NULL DEFAULT 'Success',
    `StartedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `CompletedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `ErrorMessage` VARCHAR(500) NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_DailyFetchLogs_CountryId` (`CountryId`),
    KEY `IX_DailyFetchLogs_FetchDate` (`FetchDate`),
    CONSTRAINT `FK_DailyFetchLogs_Countries_CountryId` FOREIGN KEY (`CountryId`) REFERENCES `Countries` (`Id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
