CREATE TABLE "sap_confirmations" (
    "confirmation_id" TEXT NOT NULL,
    "dealer" TEXT,
    "point_code" TEXT,
    "point_name" TEXT,
    "record_date" DATE NOT NULL,
    "creator" TEXT,
    "net_value" DECIMAL(14,2),
    "status" TEXT,
    "contact" TEXT,
    "cost_center" TEXT,
    "transaction_type" TEXT,
    "system_status" TEXT,
    "product_id" TEXT NOT NULL DEFAULT '203',
    "source_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sap_confirmations_pkey" PRIMARY KEY ("confirmation_id")
);
CREATE INDEX "sap_confirmations_record_date_idx" ON "sap_confirmations"("record_date");
CREATE INDEX "sap_confirmations_point_code_idx" ON "sap_confirmations"("point_code");
CREATE INDEX "sap_confirmations_status_idx" ON "sap_confirmations"("status");
