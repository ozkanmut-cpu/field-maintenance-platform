ALTER TABLE "users"
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_login_at" TIMESTAMP(3);
