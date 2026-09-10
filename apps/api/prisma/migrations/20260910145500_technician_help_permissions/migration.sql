CREATE TABLE "technician_help_permissions" (
  "id" UUID NOT NULL,
  "helper_id" UUID NOT NULL,
  "target_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "technician_help_permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "technician_help_permissions_helper_id_target_id_key" ON "technician_help_permissions"("helper_id", "target_id");
CREATE INDEX "technician_help_permissions_target_id_idx" ON "technician_help_permissions"("target_id");
ALTER TABLE "technician_help_permissions" ADD CONSTRAINT "technician_help_permissions_helper_id_fkey" FOREIGN KEY ("helper_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technician_help_permissions" ADD CONSTRAINT "technician_help_permissions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_visits" ADD COLUMN "assisted_for_technician_id" UUID;
CREATE INDEX "maintenance_visits_assisted_for_technician_id_performed_at_idx" ON "maintenance_visits"("assisted_for_technician_id", "performed_at");
ALTER TABLE "maintenance_visits" ADD CONSTRAINT "maintenance_visits_assisted_for_technician_id_fkey" FOREIGN KEY ("assisted_for_technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
