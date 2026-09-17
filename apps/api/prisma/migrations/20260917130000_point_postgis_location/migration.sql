CREATE EXTENSION IF NOT EXISTS "postgis";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "points"
    WHERE
      ("canonical_latitude" IS NULL) <> ("canonical_longitude" IS NULL)
      OR ("canonical_latitude" IS NOT NULL AND ("canonical_latitude" < -90 OR "canonical_latitude" > 90))
      OR ("canonical_longitude" IS NOT NULL AND ("canonical_longitude" < -180 OR "canonical_longitude" > 180))
  ) THEN
    RAISE EXCEPTION 'points contains invalid canonical coordinate pairs';
  END IF;
END
$$;

ALTER TABLE "points"
  ADD CONSTRAINT "points_canonical_coordinate_pair_ck"
    CHECK (("canonical_latitude" IS NULL) = ("canonical_longitude" IS NULL)),
  ADD CONSTRAINT "points_canonical_latitude_ck"
    CHECK ("canonical_latitude" IS NULL OR "canonical_latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "points_canonical_longitude_ck"
    CHECK ("canonical_longitude" IS NULL OR "canonical_longitude" BETWEEN -180 AND 180);

ALTER TABLE "points"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "canonical_latitude" IS NULL THEN NULL
      ELSE ST_SetSRID(
        ST_MakePoint(
          "canonical_longitude"::double precision,
          "canonical_latitude"::double precision
        ),
        4326
      )::geography
    END
  ) STORED;

CREATE INDEX "points_location_gist_idx"
  ON "points"
  USING GIST ("location");
