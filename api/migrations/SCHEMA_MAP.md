# XA-LMS Database Schema Map
# ══════════════════════════════════════════════════════════════════
# This file is the reference before any tables are created.
# Each domain owns its migrations. Add tables sprint by sprint.
# ══════════════════════════════════════════════════════════════════

## Domain → Tables

### Auth
- users               (id, email, name, avatar, role, created_at)
- sessions            (id, user_id, refresh_token, expires_at, ip)
- oauth_accounts      (id, user_id, provider, provider_id, access_token)

### Organization
- organizations       (id, name, slug, logo, settings jsonb)
- org_members         (id, org_id, user_id, role)

### Program
- programs            (id, org_id, title, status, config jsonb)
- program_phases      (id, program_id, title, order, type)
- activities          (id, phase_id, title, type, config jsonb, due_at)

### Enrollment
- cohorts             (id, program_id, name, start_date, end_date)
- enrollments         (id, cohort_id, user_id, status, enrolled_at)

### Content
- content_items       (id, activity_id, type, url, s3_key, metadata jsonb)
- content_progress    (id, user_id, content_id, percent, completed_at)

### Assessment
- assessments         (id, activity_id, type, config jsonb, passing_score)
- questions           (id, assessment_id, body, type, options jsonb, correct jsonb)
- submissions         (id, assessment_id, user_id, answers jsonb, score, submitted_at)

### Coaching
- coaching_sessions   (id, cohort_id, type, scheduled_at, meeting_url)
- session_notes       (id, session_id, author_id, content, visibility)
- coaching_goals      (id, user_id, session_id, goal, status)

### 360 Feedback
- feedback_cycles     (id, program_id, user_id, status, due_at)
- rater_nominations   (id, cycle_id, rater_id, relationship, status)
- feedback_responses  (id, cycle_id, rater_id, competency_id, score, comment)

### Gamification
- points_ledger       (id, user_id, activity_type, points, earned_at)
- badges              (id, name, criteria jsonb, icon_url)
- user_badges         (id, user_id, badge_id, earned_at)
- streaks             (id, user_id, current, longest, last_active_date)

### Notification
- notifications       (id, user_id, type, title, body, read_at, created_at)
- notification_prefs  (id, user_id, channel, type, enabled)

### AI
- ai_conversations    (id, user_id, context_type, context_id)
- ai_messages         (id, conversation_id, role, content, tokens, created_at)

### Analytics (views + materialized, not base tables)
- v_cohort_progress   (view)
- v_engagement_daily  (view)
- v_dropout_signals   (materialized, refreshed daily)

## Migration naming convention
# 000001_init.up.sql            ← extensions (done)
# 000002_auth.up.sql            ← users, sessions, oauth_accounts
# 000003_organizations.up.sql   ← organizations, org_members
# 000004_programs.up.sql        ← programs, phases, activities
# ... and so on, one domain per migration file
