DROP TABLE IF EXISTS faculty_l4_scores;
DROP TABLE IF EXISTS faculty_l3_scores;
DROP TABLE IF EXISTS faculty_l2_scores;
DROP TABLE IF EXISTS faculty_l1_scores;

ALTER TABLE users
  DROP COLUMN IF EXISTS onboarding_status,
  DROP COLUMN IF EXISTS certifications,
  DROP COLUMN IF EXISTS linkedin_url,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS bio,
  DROP COLUMN IF EXISTS specialization;
