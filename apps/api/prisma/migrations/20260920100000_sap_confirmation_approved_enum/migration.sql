-- PostgreSQL requires this enum addition to commit before a later migration
-- may reference APPROVED in a constraint or row value.
ALTER TYPE "PaperworkStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
