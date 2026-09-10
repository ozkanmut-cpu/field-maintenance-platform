ALTER TABLE "points" DROP CONSTRAINT IF EXISTS "points_code_key";
ALTER TABLE "points" ALTER COLUMN "region_id" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "points_code_idx" ON "points"("code");
