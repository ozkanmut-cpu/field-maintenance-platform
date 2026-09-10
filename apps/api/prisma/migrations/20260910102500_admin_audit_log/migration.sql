CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_logs_entity_type_entity_id_created_at_idx"
ON "admin_audit_logs"("entity_type", "entity_id", "created_at");

CREATE INDEX "admin_audit_logs_actor_id_created_at_idx"
ON "admin_audit_logs"("actor_id", "created_at");

ALTER TABLE "admin_audit_logs"
ADD CONSTRAINT "admin_audit_logs_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
