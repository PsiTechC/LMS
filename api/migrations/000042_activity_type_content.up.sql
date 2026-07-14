-- eLearning/SCORM modules previously collapsed onto activity_type 'video' in
-- the Design Studio picker (no dedicated enum value existed), mislabeling
-- eLearning content as "Video" on the participant side. Add a distinct
-- 'content' value so eLearning modules are structurally identifiable.
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'content';
