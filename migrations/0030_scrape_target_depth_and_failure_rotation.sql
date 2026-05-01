-- Keep autonomous scrape jobs short enough for Cloudflare Browser Rendering
-- and rotate away from over-depth failed retries.

UPDATE "ScrapeTarget"
SET "maxDepth" = 6,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" LIKE 'st_axiom_%'
  AND "maxDepth" > 6;

UPDATE "ScrapeJob"
SET "maxDepth" = 6,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'pending'
  AND "niche" IN (
    'Custom Cabinetry',
    'Roofers',
    'Commercial Cleaning',
    'Concrete',
    'Landscaping',
    'HVAC',
    'Med-Spas',
    'Plumbing',
    'Electricians',
    'Salon'
  )
  AND "maxDepth" > 6;
