ALTER TABLE survey_responses DROP COLUMN IF EXISTS external_respondent_id;
DROP TABLE IF EXISTS survey_external_respondents;
