ALTER TABLE "maintenance_attempts" ADD COLUMN "assisted_for_technician_id" UUID;
ALTER TABLE "maintenance_attempts" ADD CONSTRAINT "maintenance_attempts_assisted_for_technician_id_fkey" FOREIGN KEY ("assisted_for_technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "maintenance_attempts_assisted_for_technician_id_attempted_at_idx" ON "maintenance_attempts"("assisted_for_technician_id", "attempted_at");
