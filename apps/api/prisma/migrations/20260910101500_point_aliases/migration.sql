CREATE TABLE "point_aliases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "point_id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "point_aliases_point_id_normalized_key"
ON "point_aliases"("point_id", "normalized");

CREATE INDEX "point_aliases_normalized_idx"
ON "point_aliases"("normalized");

ALTER TABLE "point_aliases"
ADD CONSTRAINT "point_aliases_point_id_fkey"
FOREIGN KEY ("point_id") REFERENCES "points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "point_aliases"
ADD CONSTRAINT "point_aliases_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
