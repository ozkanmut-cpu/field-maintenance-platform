-- PostgreSQL requires a committed enum change before a later migration can
-- safely reference the new value in a constraint.
ALTER TYPE "PaperworkStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
