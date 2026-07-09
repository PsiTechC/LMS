# Participant Requirements Sheet — XA-LMS

**Role focus:** Participant (the learner) and its relationships with **Program Manager (PM / Business Admin)**, **Faculty**, and **Coach**.

**Sources cross-checked:**
1. `elev8-reference.jsx` — the finalized reference UI (what is actually designed/built).
2. Requirement document images — all 8 sections **4.1.1 → 4.1.10** with client (SS) / vendor (AS-R) comment threads showing finalized decisions.

**Legend — `Status` column:**
- ✅ **In UI + In Req** — Feature is in the requirement doc AND present in the reference UI (finalized & designed).
- 📄 **In Req only** — Finalized in requirements but NOT yet in the reference UI (needs build).
- 🎨 **In UI only** — Present in reference UI but not explicitly listed in these requirement sections (UI-added enhancement).
- ⛔ **Removed** — Explicitly decided to remove per comment thread.

**Legend — `Tag` column:** `Dashboard` · `Pre-Work` · `Assessments` · `360` · `Live Sessions` · `Coaching` · `Capstone` · `Surveys` · `Gamification` · `Progress` · `Certification` · `Cross-Role` (defines a PM/Faculty/Coach relationship).

---

## Module 4.1.1 — Dashboard & Learning Hub

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Dashboard | Personalized "My Journey" dashboard (program progress, upcoming activities, AI recommendations) | Dashboard → "AI Daily Focus" banner + 4 stat cards + Upcoming Activities list + Learning Contract. | **[SS52] Define scope/logic → [AS53R52]** Alerts, prompts & progress suggestions. [SS54R52] Samples shown in UX demo — clear. | Dashboard | High | ✅ In UI + In Req |
| Dashboard | Visual timeline of all program phases with completion indicators + locked/unlocked status | Dashboard → "Learning Journey Timeline" (done ✓ / active ● / locked dots) + sidebar "Current Phase" box. | Finalized (green). | Dashboard / Progress | High | ✅ In UI + In Req |
| Dashboard | Activity cards with due dates, estimated time, type icon & priority flags | Dashboard → Upcoming Activities rows (type badge, due date, "Due Today" flag, progress bar, Continue/Review). | Finalized (green). | Dashboard | Medium | ✅ In UI + In Req |
| Dashboard | Notification center (in-app, email, push) for reminders, feedback received, cohort updates | Header bell icon → notification dropdown (in-app). Email/push are backend channels. | **[SS55] Visualize core process + list of notifications → [AS56R55]** Agree, to be done in development phase. | Dashboard / Cross-Role | High | ✅ In UI + In Req *(in-app dropdown built; full notification list, email & push 📄 dev-phase)* |
| Dashboard | AI-generated "Daily Focus" prompt based on learning contract + schedule | Dashboard → "✦ AI Daily Focus" banner with contextual insight. | **[SS57] Scope + example → [SS58R57]** Discussed with examples — clear. | Dashboard | Medium | ✅ In UI + In Req |
| Dashboard | Personalized resource library with AI-tagged recommended articles, videos & tools | AI recommendation cards appear in Pre-Work; no standalone resource-library view. | **[SS59] Source? → [AS60R59]** Internal Library + external links (viewed on host platforms). [SS61R59] Clear. | Dashboard / Pre-Work | Medium | 📄 In Req only *(AI recos shown inline; dedicated tagged resource library to build)* |

---

## Module 4.1.2 — Pre-Work & Self-Paced Learning

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Pre-Work | Access to SCORM/xAPI/H5P/PDF/Video content modules with progress saving | Pre-Work → module cards (Video/PDF/Case Study/Assessment) with type icon, duration, progress bar, Start/Resume/Done. | Finalized (green). | Pre-Work | High | ✅ In UI + In Req *(card list + progress built; SCORM/xAPI/H5P player = backend integration)* |
| Pre-Work | Estimated completion time per module + adaptive sequencing based on prior knowledge | Duration shown per module; "Estimated remaining" in Module Progress card; AI Recommendation card suggests order. | Finalized (green). Adaptive sequencing driven by AI recommendation. | Pre-Work | Medium | ✅ In UI + In Req *(est. time built; true adaptive sequencing logic 📄 to build)* |
| Pre-Work | Note-taking & highlighting tool within content viewer | Pre-Work → "Note-Taking" card with textarea + Save Note. | Finalized (green). Highlighting within viewer 📄 to build. | Pre-Work | Medium | ✅ In UI + In Req *(notes built; in-content highlighting to build)* |
| Pre-Work | Completion gates requiring minimum engagement (e.g. 80% video watched) before advancing | Not shown in reference UI as an enforced gate. | Finalized (green). Maps to activity `config_json` completion rules. | Pre-Work | Medium | 📄 In Req only |
| Pre-Work | Mobile-responsive content viewer with offline-access capability | Mobile app has participant views; offline-access not shown. | Finalized (green). | Pre-Work | Medium | 📄 In Req only *(mobile views exist; offline caching to build)* |

---

## Module 4.1.3 — Assessments

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Assessments | Multiple assessment types (MCQ, drag-and-drop, scenario-based, rating scales, open-ended) | Assessments → Upcoming shows "MCQ + Open-ended", "Rating Scale". Survey engine covers mcq/rating/open types. | Finalized (green). | Assessments | High | ✅ In UI + In Req *(types referenced; drag-and-drop & scenario players to build)* |
| Assessments | Timed & untimed options with attempt limits configured by Program Manager | Upcoming assessments show duration; attempt limits set in activity config. | **[SS65] Define logic → [AS66R65]** Predefined time period. [SS67R65] Clear. Limits configured by PM (relationship). | Assessments / Cross-Role | High | ✅ In UI + In Req *(display built; PM config maps to assessment activity config_json)* |
| Assessments | Instant auto-scored results with competency-level breakdown (future: cohort/peer/function/region/industry comparison) | Assessments → Results tab: Competency Progress (pre vs post), Overall Score dial, quartile badge. | **[SS62] Capture comparison variables → [AS63R62]** Depends on client org structure & program type. [SS64R62] Clear. | Assessments / Cross-Role | High | ✅ In UI + In Req *(scoring + competency built; cohort/segment comparison = future)* |
| Assessments | Retake logic with configurable cooling-off periods + score averaging | Not shown in reference UI. | Finalized (green). Maps to assessment activity config (attempts, cooling_off_hours, scoring_method). | Assessments | Medium | 📄 In Req only |
| Assessments | AI-generated personalized developmental commentary based on results | Assessments → "✦ AI Developmental Commentary" card. | **[SS68] Explain → [AS69R68]** AI-generated interpretations. [SS70R68] Clear. | Assessments | Medium | ✅ In UI + In Req |
| Assessments | Psychometric instrument integration (DISC, MBTI, Hogan, EQ-i) via API or manual upload | Assessments → "Psychometric Results" card (DISC, MBTI, EQ-i). | **[SS71] Recommend manual… → [AS72R71]** Agree (API + manual upload both). | Assessments / Cross-Role | Medium | ✅ In UI + In Req *(results display built; API/manual-upload ingestion to wire)* |

---

## Module 4.1.4 — 360° Feedback

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| 360 | Self-nomination of raters (peers, direct reports, managers) within platform constraints | 360 → "Manage Raters" tab: nominate rater (name/email/relationship), quorum requirements per relationship. | **[SS73] They are also personas → [AS74R73]** Only user access for the rater (limited role). [SS75R73] That's the way it will be. | 360 / Cross-Role | High | ✅ In UI + In Req |
| 360 | Anonymous feedback submission by raters with progress reminders | 360 → "Response Tracker" tab: per-rater status, Send Reminder / Remind All Pending, deadline. | Finalized (green). Rater responses anonymous; reminders built. | 360 / Cross-Role | High | ✅ In UI + In Req |
| 360 | Visual competency spider/radar chart comparing self vs. others | 360 → "360 Results" tab: SVG radar (Self vs Others) + per-competency bars. | Finalized (green). | 360 | Medium | ✅ In UI + In Req |
| 360 | AI-generated narrative development report (strengths, blind spots, recommended actions) | 360 → "✦ AI Narrative Summary" card (Strengths / Blind Spots / Development Theme). | Finalized (green). | 360 | Medium | ✅ In UI + In Req |
| 360 | Downloadable PDF feedback report with privacy controls | 360 → "Download PDF Report" button. | **[SS76] Who validates? Format? → [SS77R76]/[AS78R76]** SA does validation; user-wise access controls. [SS79R76]/[SS80]/[AS81R80] Types of controls mostly access-based. | 360 / Cross-Role | Medium | ✅ In UI + In Req *(download built; granular privacy/validation controls 📄 to build)* |

---

## Module 4.1.5 — Classroom & Live Sessions

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Live Sessions | Session calendar with integrated virtual meeting links (Zoom, Teams, Google Meet) | **Desktop = placeholder stub.** Mobile → upcoming session card + "Join Zoom Session" + session list (Zoom/Teams/In-Person). | Finalized (green). | Live Sessions / Cross-Role | High | 📄 In Req only *(mobile stub + desktop placeholder; full calendar + meeting integration to build)* |
| Live Sessions | Pre-session preparation checklist and reading list | Not present in participant reference UI. | Finalized (green). | Live Sessions | Medium | 📄 In Req only |
| Live Sessions | In-session: digital attendance confirmation, live polling, Q&A, breakout group assignment | Not in participant view. Faculty side has session tools (Live Poll, Breakout, Timer, Attendance, QR). | **[SS80] Define types of controls → [AS81R80]** Mostly access/config-based. Participant consumes; Faculty runs the tools (relationship). | Live Sessions / Cross-Role | High | 📄 In Req only *(faculty tools built; participant-side attendance/poll/Q&A/breakout to build)* |
| Live Sessions | Post-session: reflection journal (prompted + open), session resources download | Reflection journal referenced as an activity type; not a dedicated participant post-session view. | Finalized (green). | Live Sessions | Medium | 📄 In Req only |
| Live Sessions | Recording access (if enabled) with timestamp navigation + AI-generated transcript & summary | Not present in participant reference UI. | **[SS82] Define scope → [AS83R82]** Will give timestamp navigation + AI transcript/summary. | Live Sessions | Medium | 📄 In Req only |

---

## Module 4.1.6 — Coaching (Individual, Group & Peer Learning)

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Coaching | Assigned coach + participant profiles & contacts | Coaching page → "My Coach" card shows coach name, title/credential (ICF PCC), avatar, next session chip. | Finalized (green). Participant sees their assigned coach; coach sees assigned participant (relationship). | Coaching / Cross-Role | High | ✅ In UI + In Req |
| Coaching | Assigned coaching cohort view (member profiles + contacts) | Group coaching phase exists in journey; cohort/member listing for group coaching. | Finalized (green). Participant can view the coaching cohort members. | Coaching / Cross-Role | Medium | 📄 In Req only *(individual coach card built; cohort member list not in participant UI yet)* |
| Coaching | Shared coaching session agenda + pre-session goal input + post-session notes | "Upcoming Session Agenda" list, Action Tracker (pre/post commitments), Session History with "View AI Summary". | Finalized (green). Agenda & AI summaries visible to participant; notes authored by Coach/Faculty. | Coaching / Cross-Role | High | ✅ In UI + In Req |
| Coaching | Peer coaching pair assignment with guided conversation prompts | *Not present in participant reference UI.* Expected: paired participant + prompt list. | **[SS84] Explain scope → [AS85R84]** Each incident gets separate briefing/questions as prompts; **decided by Program Manager / Faculty.** [SS86R84] Clear. | Coaching / Cross-Role | Medium | 📄 In Req only |
| Coaching | Action Learning Set (ALS) workspace — challenge submission, peer commentary, accountability tracker | *Not present in participant reference UI.* (Capstone Team Workspace is the closest analog.) | Finalized (green). Accountability tracker for the ALS group. | Coaching | Medium | 📄 In Req only |
| Coaching | AI coaching prompt generator for self-reflection between sessions | "✦ AI Coaching Prompt" card with reflective question, **Reflect →** and **New Prompt** buttons. | Finalized. AI can ask self-reflective questions based on summary/notes of the previous session ([AS91R90] context). | Coaching | Medium | ✅ In UI + In Req |
| Coaching | Coaching journey timeline (done / upcoming / locked sessions) | "Coaching Journey Timeline" — vertical timeline with status dots, expandable AI summaries + actions set. | 🎨 UI enhancement supporting the coaching flow. | Coaching | Medium | 🎨 In UI only |
| Coaching | Coaching stats (sessions done, active goals, actions done, coaching score) | 4 stat cards at top of Coaching page. | 🎨 UI enhancement. | Coaching / Progress | Low | 🎨 In UI only |

---

## Module 4.1.7 — Capstone & Action Learning Project

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Capstone | Team workspace — shared document area, task board, team discussion forum | Capstone → "Team Workspace" tab: Team members list (with roles/status) + Shared Workspace file list. | **[SS87] What do you mean? → [AS88R87]** The participant responsible for each part & their position on the progress chart is **updated by team members themselves.** [SS89R87] Clear. | Capstone / Cross-Role | High | ✅ In UI + In Req *(discussion forum thread not shown in this tab; task board simplified to file list)* |
| Capstone | Capstone project submission portal (multi-format: PPT, PDF, video pitch, written report) | Capstone → "My Capstone" → Project Submission: drag-drop upload (PPTX/PDF/video link, max 50 MB) → Submit; shows "Submission Received" state. | Finalized (green). | Capstone | High | ✅ In UI + In Req |
| Capstone | Real-time panel assessment view during presentation day (scores released post-event) | Capstone → "Panel Feedback" tab: locked until completed, then shows scores + per-panelist ratings & comments. | Finalized (green). Scores released post-event (tab locked before session). | Capstone / Cross-Role | High | ✅ In UI + In Req |
| Capstone | Peer assessment module with structured rubric for cross-team evaluation | Capstone → "Peer Review" tab: assigned peers, 1–5 rating + constructive feedback textarea → Submit Review. | Finalized (green). | Capstone / Cross-Role | High | ✅ In UI + In Req |
| Capstone | AI-assisted capstone feedback & improvement suggestions pre-submission | "✦ AI Feedback Preview" card on My Capstone tab with draft commentary. | Finalized (green). | Capstone | Medium | ✅ In UI + In Req |
| Capstone | Project brief + checklist + overall progress | Status banner (progress %), "Project Brief" card (format/audience/evaluation/deadline), "Checklist" card. | 🎨 UI enhancement supporting the capstone flow. | Capstone / Progress | Medium | 🎨 In UI only |

---

## Module 4.1.8 — Surveys

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Surveys | Pre-, mid-, post-program survey completion with deadline reminders | Surveys page → survey cards typed Pre/Mid/Post-Program with due dates, "Due Soon" status, Start Survey modal. | Finalized (green). | Surveys | High | ✅ In UI + In Req |
| Surveys | Pulse-check surveys (weekly/bi-weekly micro-surveys) on application, confidence, support | "Mid-Program Pulse Check" card (5 min); Session-type quick surveys. | Finalized (green). Short recurring pulse surveys. | Surveys | Medium | ✅ In UI + In Req |
| Surveys | Anonymous survey participation with confirmation of anonymity | "Anonymous" green chip on cards + inside modal; submit confirmation states response recorded "anonymously". | Finalized (green). | Surveys | High | ✅ In UI + In Req |
| Surveys | Multiple question types (Likert, NPS, MCQ, star rating, open text) | SurveyModal renders likert / nps / mcq / rating / open question types with progress bar & pagination. | 🎨 UI enhancement realizing the survey requirement. | Surveys | Medium | 🎨 In UI only |
| Surveys | AI survey insights (feedback loop → resources added) | "✦ AI Survey Insights" banner explains how responses shaped the program (e.g., extra pre-work added). | 🎨 UI enhancement. | Surveys | Low | 🎨 In UI only |

---

## Module 4.1.9 — Leaderboard & Gamification

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Gamification | Personal points dashboard showing earned points by activity category | Leaderboard → "My Points Breakdown" card (Module Completions, Assessments, Discussions, Reflections, Coaching Attendance) + Total. | Finalized (green). | Gamification | Medium | ✅ In UI + In Req |
| Gamification | Cohort leaderboard with rank, points, streak display + opt-in/opt-out privacy controls | Leaderboard → "Cohort Leaderboard" list (rank, avatar, streak, points, "You" highlight). | **[SS96] Define → [AS97R96]** HR/Program Manager can suggest the Super Admin keep or remove this. **[SS98R96] A toggle will be created to enable/disable the view.** (Privacy toggle = to build.) | Gamification / Cross-Role | High | ✅ In UI + In Req *(leaderboard built; opt-in/opt-out privacy toggle 📄 to build)* |
| Gamification | Team leaderboard for group activities (capstone, peer challenges) | *Not present in participant reference UI* (only cohort/individual leaderboard shown). | **[SS93] Define Scope → [AS94R93]** **This can be removed** as it needs an external link to project data. [SS95R93] Noted. | Gamification | Low | ⛔ Removed |
| Gamification | Badge collection with achievement criteria + social sharing | Leaderboard → "My Badges" card (earned vs locked chips with criteria tooltips). | Finalized (green). Social sharing = LinkedIn-style share (see 4.1.10). | Gamification | Medium | ✅ In UI + In Req *(badge display built; explicit "social share" action on badge not shown)* |
| Gamification | Streak tracker for consistent engagement + daily login rewards | Streak shown per leader + Dashboard "Engagement Streak" stat card (current/longest/total active days). | Finalized (green). | Gamification / Progress | Medium | ✅ In UI + In Req |
| Gamification | Milestone celebration animations & congratulatory messages | *Not present as animations in reference UI* (congratulatory copy appears in AI banners / capstone summary). | Finalized (green). | Gamification | Low | 📄 In Req only |

---

## Module 4.1.10 — Progress & Certification

| Module | Feature / Task | How It Looks in the System | Comment / Decision | Tag | Priority | Status |
|---|---|---|---|---|---|---|
| Progress | Real-time program completion % with phase-by-phase breakdown | Dashboard → "Program Progress" stat card (expandable phase breakdown + completion stats) + sidebar "Current Phase" box + Learning Journey Timeline. | **[SS99] Logic — what to consider? → [AS100R99]** Completion % is based on the **Activities** defined in the program process flow, per **activity type / activity completion.** [SS101R99] Clear. | Progress / Cross-Role | High | ✅ In UI + In Req |
| Progress | Learning contract with personal goals, check-in prompts & reflection log | Dashboard → "Learning Contract" card (goals with % + next check-in date). | Finalized (green). Goals set with coach; reflection log via journal activities. | Progress / Cross-Role | Medium | ✅ In UI + In Req *(goals + check-in built; standalone reflection log not a dedicated view)* |
| Certification | Digital certificate generation on program completion with verifiable credential (16-digit alphanumeric code) | Capstone Panel tab (completed) → "Download Certificate"; completed-program AI banner prompts certificate download. | Finalized (green). Verifiable 16-digit alphanumeric code (matches `/v1/certificates/:code/verify` public route). | Certification | High | ✅ In UI + In Req *(download built; 16-digit code + verify link 📄 to wire)* |
| Certification | PDF transcript of all completed activities, assessments & scores | Assessments → "History" tab lists completed assessments + scores; "Download PDF Report" on 360. | **[SS102] Explain** — transcript = consolidated PDF of activities/assessments/scores. (Consolidated transcript export 📄 to build.) | Certification | Medium | 📄 In Req only *(per-area exports exist; single consolidated transcript to build)* |
| Certification | LinkedIn-shareable certificate integration | *Referenced in completed-program AI banner ("Share your achievement on LinkedIn!")* — no share button wired. | **[SS103R102] Please remove it → [SS104R102] Noted.** **Decided to remove LinkedIn share integration.** | Certification | Low | ⛔ Removed |

---

## Participant ↔ Other Roles — Relationship Summary

| Relationship | What the Participant sees | What the other role controls |
|---|---|---|
| **Participant ↔ Coach** | Assigned coach card, session agenda, AI summaries, action tracker, coaching timeline. | Coach authors session notes/outcomes, sets actions, runs sessions (Coach nav: Engagements, Calendar, Session Notes). |
| **Participant ↔ Program Manager (PM)** | Program structure, phases, activities, leaderboard visibility, surveys assigned. | PM designs program/activities (Program Design Studio), decides peer-coaching briefings, controls leaderboard enable/disable toggle, defines completion-% logic via activity flow. |
| **Participant ↔ Faculty** | Sessions, grading results, capstone panel feedback, discussion replies, content library. | Faculty grades, gives panel/capstone feedback, facilitates sessions, sets peer-coaching prompts (with PM), authors coaching notes. |
| **Participant ↔ Peers** | Peer coaching pairs, peer review (capstone), team workspace, cohort leaderboard, discussions. | Peers submit reviews, update own team-workspace task/position, exchange commentary in ALS. |

---

## Open / To-Build Items (finalized in requirements, not yet in reference UI)

**Dashboard & Learning (4.1.1–4.1.2)**
1. **Dedicated resource library** with AI-tagged internal content + external links.
2. **Full notification list** + email & push channels (dev-phase per [AS56R55]).
3. **SCORM/xAPI/H5P content player** integration + in-content highlighting.
4. **Completion gates** (e.g. 80% video watched) + true **adaptive sequencing**.
5. **Offline-access** content caching (mobile).

**Assessments & Live Sessions (4.1.3, 4.1.5)**
6. **Drag-and-drop & scenario-based** assessment players.
7. **Retake logic** (cooling-off + score averaging) via assessment config.
8. **Psychometric API/manual-upload** ingestion pipeline.
9. **Live Sessions participant view** — desktop is a placeholder stub (calendar, meeting links, attendance, polls, Q&A, breakout, recordings, prep checklist, post-session reflection). *(Nav item exists; page is a stub; only a basic mobile version exists.)*
10. **Recording access** + timestamp navigation + AI transcript/summary.

**Coaching / Capstone / Gamification / Certification (4.1.6–4.1.10)**
11. **Coaching cohort member list** (group coaching) for the participant.
12. **Peer coaching pair + guided prompts** (prompts set by PM/Faculty).
13. **Action Learning Set (ALS) workspace** (challenge submission, peer commentary, accountability tracker).
14. **Leaderboard privacy toggle** (opt-in / opt-out; PM/Super Admin controlled).
15. **Milestone celebration animations.**
16. **16-digit verifiable certificate code + public verify link** wiring.
17. **Consolidated PDF transcript** export.
18. **Granular 360 report privacy/validation controls** (SA-validated per [AS78R76]).

## Explicitly Removed (do NOT build)

- **Team leaderboard for group activities** — removed ([AS94R93], needs external project-data link).
- **LinkedIn-shareable certificate integration** — removed ([SS103R102]).
