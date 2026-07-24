# Responsive Certification Inventory and Matrix

## Scope

The browser certification suite derives its dashboard inventory from `components/layout/nav-config.ts`, so the matrix follows the application's actual sidebar routes rather than a hand-maintained subset. Each listed dashboard tab is exercised at 320x700, 360x800, 375x812, 390x844, 420x900, 768x900, 1024x768, and 1366x768. The same checks run against fourteen public routes.

| Parent route | Role | Surfaces | Component source | Interaction | Responsive pattern | Risk | Test status |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| `/dashboard/participant` | Participant | 14 (12 sidebar tabs, profile, settings) | `app/dashboard/participant/page.tsx` and participant components | sidebar/tab navigation; page actions | KPI grids, stacked content, table scrollers, modal overlays | High | Automated route/viewport coverage |
| `/dashboard/faculty` | Faculty | 12 (10 sidebar tabs, profile, settings) | `app/dashboard/faculty/page.tsx` and faculty components | sidebar/tab navigation; content and grading actions | two-column layouts collapse; tables scroll | High | Automated route/viewport coverage |
| `/dashboard/coach` | Coach | 8 (6 sidebar tabs, profile, settings) | `app/dashboard/coach/page.tsx` and coach components | sidebar/tab navigation; session-note modal | panels stack; drawer/modal boundaries | High | Automated route/viewport coverage plus targeted modal test |
| `/dashboard/program-manager` | Program Manager | 13 (11 sidebar tabs, profile, settings) | `app/dashboard/program-manager/page.tsx` and PM components | sidebar/tab navigation; cohort filter | filter grids collapse; dropdown stays in viewport | High | Automated route/viewport coverage plus targeted dropdown test |
| `/dashboard/superadmin` | Superadmin | 23 (21 sidebar tabs, profile, settings) | `app/dashboard/superadmin/page.tsx` and admin components | sidebar/tab navigation; organization panels | tables/charts/forms use responsive utilities | High | Automated route/viewport coverage |
| Public routes | Public | 14 | all `app/**/page.tsx` pages | auth, invitation, external-token, and callback states | wrapping headers/forms and contained error states | Medium | Automated route/viewport coverage |

## Surface inventory

- Public: `/`, `/about`, `/coaching`, `/e-learning`, `/for-organizations`, `/open-programs`, `/assessments`, `/login`, `/invite/accept`, `/join/[code]`, `/rater/[token]`, `/survey-external/[token]`, `/verify-email`, `/zoom/callback`.
- Dashboard route files: index redirect, participant, faculty, coach, program manager, superadmin, and sessions.
- Query-param pages: all 60 sidebar tabs for the five QA-seeded personas, plus profile and settings for every persona (70 dashboard surfaces total).
- Overlays and interaction states: auth modal, confirmation modal, content/question/certificate modals, session attendance/breakout/live-poll overlays, coach session-note modal, organization configuration panels, dropdowns, filters, tables, charts, calendars, rich content editors, upload controls, empty/loading/error states.

## Automated assertion

Every certification case asserts `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`. It also lists visible elements extending outside the viewport, excluding descendants of intentionally horizontally scrollable containers such as `.xa-table-wrap` and `.xa-calendar-wrap`. Screenshots are captured for each successful case under `test-results/responsive/certification`.

## Explicit exceptions / blockers

- Token-dependent routes (`/join/[code]`, `/rater/[token]`, `/survey-external/[token]`) are loaded with an invalid token to certify their reachable error state. A valid invitation/rating/survey flow needs a freshly created token and is therefore not automatically testable without test-data mutation.
- `participant_retailer` and `superadmin_secondary` have no documented seed credentials in `tests/README.md`; their locked/permission-specific states are blocked by missing QA personas.
- The full browser matrix has not been executed in this environment yet. Focused public and authenticated mobile proofs pass; full execution remains required before production certification.