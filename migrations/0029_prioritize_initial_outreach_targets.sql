-- Prioritize autonomous intake targets that historically produce adequate
-- owner/staff contacts, so first-touch inventory does not dry up behind
-- broad zero-email search targets.

CREATE INDEX IF NOT EXISTS "idx_Lead_intake_target_yield"
  ON "Lead" ("city", "niche", "axiomScore", "axiomTier", "emailType", "isArchived");

UPDATE "ScrapeTarget"
SET "totalLeadsFound" =
      "totalLeadsFound" +
      COALESCE((
        SELECT CAST(json_extract("ScrapeJob"."statsJson", '$.leadsFound') AS INTEGER)
        FROM "ScrapeJob"
        WHERE "ScrapeJob"."id" = "ScrapeTarget"."lastJobId"
          AND "ScrapeJob"."statsJson" IS NOT NULL
          AND json_valid("ScrapeJob"."statsJson")
      ), 0),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "lastJobId" IS NOT NULL
  AND "totalLeadsFound" = 0;

INSERT OR IGNORE INTO "ScrapeTarget"
  ("id","niche","city","region","country","radius","maxDepth","active","totalRuns","totalLeadsFound")
VALUES
('st_axiom_custom_cabinetry_guelph','Custom Cabinetry','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_custom_cabinetry_waterloo','Custom Cabinetry','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_custom_cabinetry_kitchener','Custom Cabinetry','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_custom_cabinetry_cambridge','Custom Cabinetry','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_custom_cabinetry_london','Custom Cabinetry','London','ON','CA','25',10,1,0,0),
('st_axiom_custom_cabinetry_hamilton','Custom Cabinetry','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_roofers_waterloo','Roofers','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_roofers_cambridge','Roofers','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_roofers_guelph','Roofers','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_roofers_kitchener','Roofers','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_roofers_london','Roofers','London','ON','CA','25',10,1,0,0),
('st_axiom_roofers_hamilton','Roofers','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_commercial_cleaning_cambridge','Commercial Cleaning','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_commercial_cleaning_kitchener','Commercial Cleaning','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_commercial_cleaning_waterloo','Commercial Cleaning','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_commercial_cleaning_guelph','Commercial Cleaning','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_commercial_cleaning_london','Commercial Cleaning','London','ON','CA','25',10,1,0,0),
('st_axiom_commercial_cleaning_hamilton','Commercial Cleaning','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_concrete_london','Concrete','London','ON','CA','25',10,1,0,0),
('st_axiom_concrete_cambridge','Concrete','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_concrete_kitchener','Concrete','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_concrete_waterloo','Concrete','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_concrete_guelph','Concrete','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_concrete_hamilton','Concrete','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_landscaping_cambridge','Landscaping','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_landscaping_kitchener','Landscaping','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_landscaping_waterloo','Landscaping','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_landscaping_london','Landscaping','London','ON','CA','25',10,1,0,0),
('st_axiom_landscaping_guelph','Landscaping','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_landscaping_hamilton','Landscaping','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_hvac_cambridge','HVAC','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_hvac_london','HVAC','London','ON','CA','25',10,1,0,0),
('st_axiom_hvac_kitchener','HVAC','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_hvac_waterloo','HVAC','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_hvac_guelph','HVAC','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_hvac_hamilton','HVAC','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_med_spas_hamilton','Med-Spas','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_med_spas_cambridge','Med-Spas','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_med_spas_london','Med-Spas','London','ON','CA','25',10,1,0,0),
('st_axiom_med_spas_guelph','Med-Spas','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_med_spas_kitchener','Med-Spas','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_med_spas_waterloo','Med-Spas','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_plumbing_waterloo','Plumbing','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_plumbing_cambridge','Plumbing','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_plumbing_kitchener','Plumbing','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_plumbing_london','Plumbing','London','ON','CA','25',10,1,0,0),
('st_axiom_plumbing_guelph','Plumbing','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_plumbing_hamilton','Plumbing','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_electricians_kitchener','Electricians','Kitchener','ON','CA','25',10,1,0,0),
('st_axiom_electricians_waterloo','Electricians','Waterloo','ON','CA','25',10,1,0,0),
('st_axiom_electricians_cambridge','Electricians','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_electricians_guelph','Electricians','Guelph','ON','CA','25',10,1,0,0),
('st_axiom_salon_brampton','Salon','Brampton','ON','CA','25',10,1,0,0),
('st_axiom_salon_hamilton','Salon','Hamilton','ON','CA','25',10,1,0,0),
('st_axiom_salon_cambridge','Salon','Cambridge','ON','CA','25',10,1,0,0),
('st_axiom_salon_kitchener','Salon','Kitchener','ON','CA','25',10,1,0,0);
