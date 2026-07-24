# XA-LMS Mobile UI System and Role-Aware Navigation Specification

## Status

Permanent mobile UI and navigation specification.

This document is intended to be used together with:

- `.claude/agents/engineering-mobile-app-builder.md`
- root `CLAUDE.md`
- `apps/claude.md`
- `apps/mobile/CLAUDE.md`
- applicable `AGENTS.md` files

It defines how the XA-LMS mobile application should look, navigate, scale across personas, and preserve parity with the existing web application without modifying the web implementation.

---

# 1. Purpose

XA-LMS supports seven canonical backend roles:

- `superadmin`
- `superadmin_secondary`
- `program_manager`
- `faculty`
- `coach`
- `participant`
- `participant_retailer`

The mobile app must be built persona by persona, but it must use one shared:

- design system
- role-aware navigation model
- permission resolver
- app shell
- responsive system
- state system
- accessibility standard
- component library

Do not create seven unrelated mobile applications inside one repository.

The app should take functional and visual direction from the web application, but mobile work must not modify `apps/web` unless explicitly required by a separate approved task.

---

# 2. Instruction precedence

Follow instructions in this order:

1. Root repository instructions
2. Backend API and RBAC contracts
3. `apps/claude.md`
4. `apps/mobile/CLAUDE.md`
5. Applicable `AGENTS.md`
6. This specification
7. `.claude/agents/engineering-mobile-app-builder.md`
8. Task-specific prompt

When documentation conflicts with working code:

- inspect the implementation
- verify API and permission behavior
- report the conflict
- preserve working contracts
- do not silently rewrite architecture

The current mobile source is the practical source of truth when stale documentation still describes an Expo starter.

---

# 3. Non-negotiable boundaries

## Mobile-only implementation

Normal mobile UI work must remain inside:

```text
apps/mobile
```

Do not modify:

```text
apps/web
api
```

unless the task explicitly requires and approves those changes.

## Platform rules

Use:

- React Native
- Expo
- TypeScript strict mode
- React Navigation
- `StyleSheet`
- native safe areas
- native keyboard handling
- `FlatList` and `SectionList` for large datasets
- existing API modules
- existing authentication
- existing SecureStore behavior
- centralized 401 handling
- backend permission checks

Do not use:

- DOM elements
- CSS files
- Tailwind for native UI
- browser storage
- web-only APIs
- browser layout assumptions
- WebView as a substitute for normal native screens
- direct role-name checks where permission checks are required
- fake production data
- non-functional buttons
- routes that are not implemented or authorized

---

# 4. Canonical persona model

| Role | Mobile status | Default landing area |
|---|---|---|
| `participant` | Main implementation in progress | Home |
| `participant_retailer` | Partial | Notifications or approved workspace |
| `coach` | Not implemented | Dashboard |
| `faculty` | Not implemented | Dashboard |
| `program_manager` | Not implemented | Dashboard |
| `superadmin` | Not implemented | Organizations |
| `superadmin_secondary` | Not implemented | Organizations |

Role names alone are not enough to expose mobile destinations.

Every destination must be resolved using:

1. authenticated backend role
2. effective backend permissions
3. feature availability
4. mobile screen availability
5. organization or program context
6. feature flags, when present

---

# 5. Shared role-aware navigation architecture

The mobile app must use one centralized navigation registry.

## Required conceptual type

```ts
export type MobileDestination = {
  key: string;
  routeName: string;
  label: string;
  icon: string;
  priority: number;
  group: 'primary' | 'more' | 'contextual';
  allowedRoles?: string[];
  requiredPermissions?: string[];
  featureFlag?: string;
  badgeSource?: 'notifications' | 'tasks' | 'none';
  isImplemented: boolean;
};
```

The exact code shape may differ, but the architecture must preserve these concepts.

## Runtime resolution flow

```text
Authenticated user
        ↓
Canonical backend role
        ↓
Effective permissions
        ↓
Implemented mobile destinations
        ↓
Feature and context checks
        ↓
Resolved primary tabs
        ↓
Resolved More destinations
        ↓
Contextual-only routes
```

## Required shared modules

Recommended structure:

```text
apps/mobile/src/navigation/
  registry.ts
  resolveDestinations.ts
  roleNavigation.ts
  types.ts
```

Recommended responsibilities:

### `registry.ts`

Contains all possible mobile destinations.

It must not expose incomplete screens as available.

### `resolveDestinations.ts`

Filters destinations using:

- role
- permissions
- implementation status
- feature availability
- organization context
- program context

### `roleNavigation.ts`

Defines persona priorities without duplicating route definitions.

### `types.ts`

Contains shared route and destination types.

---

# 6. Primary navigation rules

## Primary navigation should remain focused

The default recommendation is a maximum of five directly exposed primary destinations.

The rail may technically support more, but overflow must normally move into More.

Reasons:

- clearer navigation
- easier accessibility
- less accidental swiping
- better compact-phone behavior
- lower cognitive load
- simpler active-state restoration
- safer deep-link behavior

## More is mandatory

Use More for:

- lower-priority modules
- account pages
- settings
- help
- secondary workflows
- future modules
- persona-specific management tools
- destinations that are not frequently accessed

Do not treat More as a dumping ground. It must be sectioned and permission-aware.

## Contextual routes

Some routes should not appear in primary navigation.

Examples:

- activity detail
- session detail
- assessment attempt
- submission form
- content viewer
- profile edit
- change password
- grading detail
- organization detail
- cohort detail
- coaching note detail

These should be opened from their parent workflow.

---

# 7. Sliding bubble-tab rail

## Component name

Use:

```text
RoleAwareBubbleTabBar
```

Recommended subcomponents:

```text
TabBubble
TabRail
TabBadge
```

## Purpose

The bubble rail provides a polished native navigation surface that can adapt to different personas while keeping a consistent app identity.

## Layout behavior

- Place the rail at the bottom of the app.
- Respect bottom safe-area insets.
- Keep content padded above the rail.
- Use a white or warm-neutral surface.
- Use circular or softly rounded tab bubbles.
- Keep labels visible.
- Use one consistent vector icon system.
- Do not use emojis or text glyphs.
- Selected state must not depend on color alone.

## Active tab

The active tab should:

- be slightly larger
- use a stronger visual fill
- use a high-contrast icon and label
- expose selected accessibility state
- remain fully visible
- auto-scroll into view when needed

Avoid making the active bubble so large that it hides neighboring destinations.

## Inactive tabs

Inactive tabs should:

- remain readable
- use neutral surface treatment
- preserve sufficient contrast
- remain touch-friendly
- show badges when applicable

## Horizontal sliding

When direct destinations exceed the available width:

- use a horizontal `FlatList` or `ScrollView`
- allow touch scrolling
- keep scroll behavior predictable
- automatically reveal the selected item
- preserve first and last edge padding
- avoid hidden or clipped bubbles
- prevent content overlap
- avoid a visible scrollbar unless product design later requires one

## Auto-centering

When a destination becomes active:

- calculate its layout position
- scroll it into the visible region
- center it when practical
- avoid unnecessary movement when already visible
- keep first and last destinations aligned safely at edges

## Press behavior

- Pressing an inactive bubble switches tabs.
- Pressing the active bubble may return to the root of that tab.
- Do not unexpectedly reset a nested stack unless this behavior is explicitly implemented and documented.
- Rapid repeated presses must not cause overlapping animations or duplicate navigation actions.

## Animation

The initial implementation should use React Native `Animated` only.

Allowed:

- small scale change
- small translate change
- restrained opacity transition
- subtle label emphasis

Avoid:

- bouncing
- large spring overshoot
- rotation
- continuous glow
- blur-heavy animation
- expensive per-frame shadow changes

Respect reduced-motion preference where supported.

## Low-end Android behavior

The rail must remain usable without animation.

Navigation correctness is more important than animation.

---

# 8. Navigation behavior by persona

## Participant

Default:

```text
Home
Journey
Sessions
Notifications
More
```

More may contain:

- Assessments
- Profile
- Settings
- future permitted modules

Contextual routes:

- Activity Detail
- Submission
- Session Detail
- Attendance
- Assessment Intro
- Assessment Attempt
- Assessment Result
- Content Viewer
- Edit Profile
- Change Password

## Participant Retailer

Until permissions are verified:

```text
Notifications
More
```

More may contain:

- Profile
- Settings
- approved retailer tools

Do not expose Assessments until backend permission behavior is verified using a real retailer account.

## Coach

Recommended future primary destinations:

```text
Dashboard
Engagements
Sessions
Notifications
More
```

More may contain:

- Notes
- Outline
- Documents
- Profile
- Settings

## Faculty

Recommended future primary destinations:

```text
Dashboard
Sessions
Grading
Notifications
More
```

More may contain:

- Program Content
- Cohorts
- Capstone
- Coaching
- Discussions
- Profile
- Settings

## Program Manager

Recommended future primary destinations:

```text
Dashboard
Programs
Cohorts
Notifications
More
```

More may contain:

- Analytics
- Faculty
- Content
- Coaching
- Feedback 360
- Discussions
- Role Management
- Profile
- Settings

Primary-PM-only capabilities must be permission-resolved, not role-name assumed.

## Super Admin

Recommended future primary destinations:

```text
Organizations
Programs
Management
Notifications
More
```

More may contain:

- Analytics
- Audit
- Platform Health
- Billing
- Integrations
- Profile
- Settings

## Secondary Super Admin

Use the same destination registry as Super Admin, filtered by effective permissions.

Do not maintain a duplicate navigation implementation.

---

# 9. Web-to-native parity rules

The web app is a reference for:

- workflows
- hierarchy
- labels
- status meaning
- business behavior
- responsive intent
- permissions
- information architecture

The web app is not a source for direct layout copying.

## Native mappings

| Web pattern | Native mapping |
|---|---|
| Sidebar | Bottom tabs + More |
| Mobile drawer | Native modal/drawer only when context requires it |
| Browser modal | Native stack modal, `Modal`, or approved bottom sheet |
| Desktop tabs | Segmented control or nested navigation |
| KPI grid | Adaptive phone grid |
| Wide table | Native rows/cards; horizontal scroll only when unavoidable |
| Breadcrumb | Stack back navigation |
| Hover | Pressed and accessibility states |
| Sticky web action | Safe-area-aware bottom action bar |
| Notification drawer | Notifications tab/list |
| File link | Native open/share/download flow |
| Meeting URL | React Native `Linking` |
| Dropdown | Native menu/action sheet/segmented control |

Do not change web behavior to simplify mobile.

---

# 10. Shared visual system

## Existing core colors

```text
Navy:       #182848
Gold:       #C8A860
Page:       #F7F5F0
Surface:    #FFFFFF
Border:     #E6DED0
Meta/slate: #4A5573
```

## Typography

Use Poppins:

- 400
- 500
- 600
- 700
- 800

## Shape

- standard radius: 12 dp
- hero radius: 18–24 dp when justified
- touch target: at least 44 × 44 dp where practical
- phone page gutter: 16 dp
- standard card padding: 16 dp

## Missing semantic tokens to introduce when needed

- pressed surface
- selected surface
- disabled surface
- permission-denied surface
- destructive surface
- positive state
- warning state
- live state
- tab rail height
- active bubble size
- inactive bubble size
- tablet maximum content width
- animation duration
- reduced-motion duration

Do not scatter magic values across screens.

## Gradient rules

Use gradients only for:

- dashboard hero
- program summary
- profile hero
- milestone or achievement state

Do not apply gradients to every component.

---

# 11. Shared component system

## Shell and navigation

### `AppHeader`

Supports:

- title
- back
- search
- menu
- notifications
- unread indicator
- safe-area spacing
- long-title handling

### `RoleAwareBubbleTabBar`

Supports:

- runtime destination list
- active bubble
- horizontal overflow
- badges
- accessibility
- safe-area handling
- active-item auto-scroll

### `PageHeader`

Supports:

- title
- subtitle
- context
- action
- status

## Dashboard and content

### `DashboardHero`

Supports:

- program or persona context
- progress
- status
- primary action
- optional illustration

### `KPIStatCard`

Supports:

- label
- value
- trend
- icon
- supporting text
- press behavior
- loading state

### `SectionHeader`

Supports:

- title
- description
- action
- See All

### `DataRow`

Supports:

- icon
- title
- metadata
- status
- trailing action

## Status and states

### `StatusBadge`

All status labels and colors must be centralized.

### `LoadingState`

### `EmptyState`

### `ErrorState`

### `OfflineState`

### `PermissionState`

### `LoadingSkeleton`

Do not build separate incompatible state components for each persona.

## Lists and forms

### `MenuListItem`

### `FilterBar`

### `SearchField`

### `SegmentedControl`

### `BottomActionBar`

## Domain components

Reusable across personas when semantics align:

- `SessionCard`
- `AssessmentCard`
- `NotificationRow`
- `ActivityCard`
- `ProfileHero`
- `ResponsiveScreen`
- `ResponsiveGrid`
- `ContentViewer`

Persona-specific components must remain inside their domain folder when they are not genuinely reusable.

---

# 12. Responsive native rules

Test each major screen at:

- 320–360 dp compact phone
- 375–390 dp standard phone
- 420–480 dp large phone
- 600–768 dp tablet
- landscape

## Phones

- use single-column content by default
- allow selected two-column KPI layouts
- keep primary actions reachable
- avoid horizontal page scrolling
- ensure bubble rail does not obscure content

## Tablets

- do not stretch phone cards edge to edge
- use controlled content width
- use balanced columns when useful
- keep the same navigation registry
- a future side rail may be considered only after explicit approval

## Landscape

- reflow content
- preserve touch targets
- preserve safe areas
- avoid oversized hero sections
- keep the tab rail usable

---

# 13. State requirements

Every major screen must support relevant states:

- loading
- refreshing
- empty
- offline
- HTTP error
- permission denied
- locked
- disabled
- submitted
- pending review
- success
- destructive confirmation

Do not show blank screens during loading.

Do not expose a disabled route without explaining why when practical.

---

# 14. Accessibility

Required:

- `accessibilityLabel` for icon-only actions
- selected state for active tabs
- readable contrast
- color-independent status meaning
- dynamic type support
- logical focus order
- large enough touch targets
- screen-reader-friendly labels
- reduced-motion handling
- predictable Android Back behavior

For the bubble rail:

- each bubble must announce label and selected state
- unread counts must be announced
- horizontal scrolling must not make destinations unreachable
- large text must not collapse the rail into unusable layout

---

# 15. Deep links and state restoration

Before enabling production deep linking:

- define route mapping
- define persona restrictions
- define permission fallback
- define tab selection behavior
- define nested-stack behavior

When a deep link targets a tab:

1. resolve permissions
2. confirm the screen exists
3. activate the correct tab
4. auto-scroll the bubble into view
5. open the nested destination
6. show a permission state or safe fallback when unavailable

Navigation state should remain stable during:

- permission refresh
- organization context refresh
- program context refresh
- role switching
- logout/login
- app restore

Do not silently reset every tab when registry data refreshes.

---

# 16. Active program context

Participant Home and Journey must not assume the first enrollment is always active.

Use one shared source of truth for active program context.

The chosen program should:

- remain consistent across relevant tabs
- survive normal navigation
- update dependent data safely
- fall back when enrollment is removed
- avoid stale program-specific screens

The exact storage mechanism must be selected after inspecting current state architecture.

---

# 17. Route activation checklist

A destination may be registered as visible only when all are true:

- screen exists
- route is typed
- API contract exists
- permissions are verified
- loading state exists
- empty state exists
- error state exists
- permission-denied behavior exists
- navigation entry works
- Android Back works
- safe-area behavior works
- compact-phone layout works
- no placeholder-only production route remains

Never register a destination before its screen and permission contract are ready.

---

# 18. Relationship with `engineering-mobile-app-builder.md`

## This specification owns

- shared visual system
- role-aware destination model
- bubble-tab behavior
- persona navigation priorities
- responsive rules
- shared component contracts
- state presentation
- accessibility
- parity strategy
- device certification expectations

## `engineering-mobile-app-builder.md` owns

- implementation workflow
- repository inspection discipline
- architecture-preservation behavior
- code-quality expectations
- validation process
- reporting format
- change-scope discipline

## Higher-level instructions own

- API contracts
- RBAC
- authentication
- security
- repository-wide constraints

Agents must read both documents.

Neither document should duplicate backend business rules.

---

# 19. Persona-by-persona delivery strategy

## Phase 1 — Shared foundation

- navigation registry
- destination resolver
- route typing
- permission-aware visibility
- shared shell
- More organization
- active-program context decision
- no animated slider yet

## Phase 2 — Participant completion

- Home
- Journey
- content viewer
- sessions
- attendance
- assessments
- notifications
- profile/settings
- missing participant modules in approved order

## Phase 3 — Retailer validation

- verify assessment permissions
- expose only verified routes
- preserve restricted workspace

## Phase 4 — Coach

- dashboard
- engagements
- sessions
- notes
- documents

## Phase 5 — Faculty

- dashboard
- sessions
- grading
- cohorts
- content
- capstone
- discussions

## Phase 6 — Program Manager

- programs
- cohorts
- analytics
- faculty
- content
- coaching administration
- feedback 360
- roles

## Phase 7 — Super Admin

- organizations
- programs
- management
- analytics
- audit
- health
- billing
- integrations

## Phase 8 — Cross-persona certification

- navigation
- permissions
- role switching
- deep links
- tablets
- landscape
- accessibility
- performance
- offline/error states

---

# 20. First implementation slice

The first engineering slice should create the shared navigation foundation without yet introducing the full animated sliding bubble rail.

## Scope

Build:

- centralized destination registry
- destination resolver
- permission-aware filtering
- implementation-aware filtering
- persona priority configuration
- More overflow model
- shared navigation types
- participant behavior preserved
- retailer behavior preserved
- placeholders for unimplemented personas preserved safely

## Likely files

```text
apps/mobile/src/navigation/AppStack.tsx
apps/mobile/src/navigation/ParticipantTabs.tsx
apps/mobile/src/navigation/RetailerTabs.tsx
apps/mobile/src/navigation/registry.ts
apps/mobile/src/navigation/resolveDestinations.ts
apps/mobile/src/navigation/roleNavigation.ts
apps/mobile/src/navigation/types.ts
apps/mobile/src/utils/permissions.ts
```

Use actual repository paths if they differ.

## Out of scope

- slider animation
- Reanimated
- gesture-handler installation
- web changes
- backend changes
- new persona screens
- retailer assessment enablement
- deep-link production rollout
- content viewer
- push notifications

## Acceptance criteria

- participant tabs behave exactly as before
- retailer routes remain restricted
- destinations are resolved centrally
- permission checks are reusable
- incomplete routes do not appear
- More remains available
- no backend or web files change
- `npx tsc --noEmit` passes

---

# 21. Second implementation slice

After the registry is stable, implement:

```text
RoleAwareBubbleTabBar
```

## Scope

- custom React Navigation `tabBar`
- active bubble treatment
- consistent vector icons
- safe-area handling
- horizontal overflow support
- active-item auto-scroll
- unread badges
- accessibility state
- compact-phone support
- reduced-motion-safe animation
- no new dependency unless a verified blocker exists

## Acceptance criteria

- 3, 4, and 5 tabs render without scrolling
- overflow remains reachable
- selected tab is always visible
- labels remain readable
- Android Back behavior is unchanged
- tab content is not obscured
- screen readers can reach all destinations
- rapid presses do not break navigation
- low-end Android remains usable

---

# 22. Required validation

Run supported validation from `apps/mobile`.

At minimum:

```powershell
npx tsc --noEmit
npx expo config --type public
npx expo-doctor
```

Use export/build commands only when appropriate for the slice.

Future automated coverage should include:

- destination resolver unit tests
- permission-filter tests
- registry tests
- tab selection tests
- More overflow tests
- role-navigation tests
- active-tab restoration tests
- deep-link tests
- API client tests
- component rendering tests
- Maestro or Detox flows

---

# 23. Required agent workflow

Before coding:

1. Read all repository instructions.
2. Read this specification.
3. Read `.claude/agents/engineering-mobile-app-builder.md`.
4. Inspect Git status.
5. Inspect current navigation.
6. Inspect permission loading.
7. Inspect route types.
8. Inspect actual installed dependencies.
9. Inspect current persona branching.
10. Report the exact planned changes.

During coding:

- preserve contracts
- preserve auth
- preserve role behavior
- preserve existing working routes
- avoid unrelated refactors
- avoid new dependencies
- avoid fake data
- avoid direct role checks when permissions are required
- avoid changing web or backend

After coding:

- run validation
- list changed files
- report preserved behavior
- report new behavior
- report unverified device behavior
- report blockers
- confirm whether web or backend were untouched

---

# 24. Prompt for the first navigation-foundation slice

```text
Read these files first:

- /CLAUDE.md
- /apps/claude.md
- /apps/mobile/CLAUDE.md
- all applicable AGENTS.md files
- /.claude/agents/engineering-mobile-app-builder.md
- /apps/mobile/XA_MOBILE_UI_SYSTEM.md

Then inspect the repository in read-only mode before making changes.

Implement only Phase 1 of XA_MOBILE_UI_SYSTEM.md: the shared role-aware navigation foundation.

Requirements:

1. Work only inside apps/mobile.
2. Preserve API, authentication, SecureStore, centralized 401 handling, RBAC, permissions, and existing business logic.
3. Do not modify apps/web or api.
4. Do not add dependencies.
5. Create a centralized mobile destination registry.
6. Create a reusable destination resolver based on:
   - authenticated role
   - effective permissions
   - screen implementation status
   - feature availability
   - persona priority
7. Preserve the current participant tab experience.
8. Preserve the current retailer restrictions.
9. Do not expose retailer Assessments until backend permissions are verified.
10. Keep unimplemented roles on their existing safe placeholder.
11. Keep More as the overflow destination.
12. Do not implement the animated bubble slider in this slice.
13. Do not register placeholder modules as available destinations.
14. Keep route typing strict.
15. Reuse current permission utilities where safe.
16. Avoid duplicate role-specific navigation logic.
17. Run npx tsc --noEmit.

Before coding, report:

- current navigator structure
- current role branching
- current permission source
- current tab definitions
- exact registry/resolver design
- exact files to change
- risks or ambiguities

After coding, report:

- files changed
- behavior preserved
- new shared navigation behavior
- permission behavior
- validation results
- confirmation that apps/web and api were untouched
```

---

# 25. Prompt for the bubble-slider slice

```text
Read all repository instructions, engineering-mobile-app-builder.md, and
apps/mobile/XA_MOBILE_UI_SYSTEM.md.

Inspect the completed navigation registry and resolver before changing anything.

Implement only the shared RoleAwareBubbleTabBar.

Requirements:

1. Work only inside apps/mobile.
2. Use the existing React Navigation tab navigator.
3. Implement a custom tabBar.
4. Use existing @expo/vector-icons.
5. Do not add Reanimated or gesture dependencies.
6. Use React Native Animated only for restrained selected-state motion.
7. Support runtime-resolved destinations.
8. Support active-item auto-scroll.
9. Keep the selected tab visible.
10. Respect bottom safe areas.
11. Prevent content overlap.
12. Expose accessibility labels and selected states.
13. Keep Android Back behavior unchanged.
14. Preserve nested stack state.
15. Support compact phones.
16. Handle 3, 4, and 5 direct destinations cleanly.
17. Keep overflow modules under More by default.
18. Do not modify web, backend, API contracts, or permissions.
19. Run npx tsc --noEmit.

Before coding, report:

- current tabBar implementation
- measured tab layouts available
- active tab handling
- badge sources
- exact animation plan
- exact files to change

After coding, report:

- files changed
- scrolling behavior
- active-tab behavior
- accessibility behavior
- safe-area behavior
- validation results
- device behaviors still requiring emulator or physical-device verification
```

---

# 26. Product decisions still required

The following must be decided separately:

1. Whether retailer receives assessment permissions.
2. Which persona is implemented after participant.
3. Whether more than five direct destinations are ever allowed.
4. The source of truth for active program selection.
5. Whether push notifications are in current scope.
6. Whether production deep links are in current scope.
7. Which native content and file capabilities are approved.
8. Whether tablets retain the bottom bubble rail or later use a side rail.
9. Which QA accounts are available for all seven roles.

Until resolved, use safe defaults and do not expose unsupported behavior.
