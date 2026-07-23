import { test, expect, type Page } from "@playwright/test";

// Responsive smoke test - added as part of the mobile-responsiveness fix
// pass (see globals.css's xa-kpi-*/xa-two-col/xa-table-wrap classes). Not a
// general E2E suite: it only asserts what that fix pass promised - no
// page-level horizontal overflow, and the page actually renders for the
// role it's gated to - across the three viewports the fix targeted.
//
// Auth: the LMS backend (api/cmd/server) issues JWTs via POST /auth/login.
// Rather than driving the login form (slower, and login-flow correctness
// isn't what this suite is testing), each test logs in via that endpoint
// directly and seeds localStorage with the resulting token before the app
// ever loads - the same pattern the app's own client reads it with (see
// apps/web/lib/api.ts's `xa_token` key).
//
// Credentials are QA seed-org fixtures created by `api/cmd/seed`, whose own
// output prints this exact password to the console - it is not a production
// secret. See api/cmd/seed/db.go (seedPassword) and personas.go for the
// account list.
const SEED_PASSWORD = "QaSeed!2026";

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 700 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "desktop-1366", width: 1366, height: 768 },
];

interface RouteCase {
  name: string;
  email: string;
  path: string;
  waitText: string;
}

// One representative route per role, plus every screen touched by the
// responsive fix pass that a role can reach (see the Stage 1 validation
// matrix) - not an exhaustive tour of the whole app.
const ROUTES: RouteCase[] = [
  { name: "participant-home", email: "tejas@convis.ai", path: "/dashboard/participant", waitText: "Journey" },
  { name: "participant-leaderboard", email: "tejas@convis.ai", path: "/dashboard/participant?tab=leaderboard", waitText: "Leaderboard" },
  { name: "participant-prework", email: "tejas@convis.ai", path: "/dashboard/participant?tab=prework", waitText: "Pre-Work" },
  { name: "faculty-home", email: "rohit@psitech.co.in", path: "/dashboard/faculty", waitText: "Dashboard" },
  { name: "faculty-capstone", email: "rohit@psitech.co.in", path: "/dashboard/faculty?tab=fac-capstone", waitText: "Capstone" },
  { name: "coach-home", email: "akanksha@psitech.co.in", path: "/dashboard/coach", waitText: "Dashboard" },
  { name: "coach-notes", email: "akanksha@psitech.co.in", path: "/dashboard/coach?tab=coach-notes", waitText: "Session Note" },
  { name: "coach-docs", email: "akanksha@psitech.co.in", path: "/dashboard/coach?tab=coach-docs", waitText: "Document" },
  { name: "coach-engagements", email: "akanksha@psitech.co.in", path: "/dashboard/coach?tab=coach-engagements", waitText: "Engagement" },
  { name: "pm-role-management", email: "vaishnavi@psitech.co.in", path: "/dashboard/program-manager?tab=pm-roles", waitText: "Role" },
  { name: "pm-cohorts", email: "vaishnavi@psitech.co.in", path: "/dashboard/program-manager?tab=pm-cohort", waitText: "Cohort" },
  { name: "superadmin-orgs", email: "tejas@psitech.co.in", path: "/dashboard/superadmin", waitText: "Organizations" },
  { name: "superadmin-capstone", email: "tejas@psitech.co.in", path: "/dashboard/superadmin?tab=sa-capstone", waitText: "Capstone" },
  { name: "superadmin-faculty", email: "tejas@psitech.co.in", path: "/dashboard/superadmin?tab=sa-faculty", waitText: "Faculty" },
  { name: "superadmin-leaderboard", email: "tejas@psitech.co.in", path: "/dashboard/superadmin?tab=sa-leaderboard", waitText: "Leaderboard" },
  { name: "superadmin-surveys", email: "tejas@psitech.co.in", path: "/dashboard/superadmin?tab=sa-surveys", waitText: "Survey" },
  { name: "superadmin-content", email: "tejas@psitech.co.in", path: "/dashboard/superadmin?tab=sa-content", waitText: "Content" },
  { name: "superadmin-feedback360", email: "tejas@psitech.co.in", path: "/dashboard/superadmin?tab=sa-360-manage", waitText: "360" },
];

async function login(request: import("@playwright/test").APIRequestContext, email: string): Promise<string> {
  const res = await request.post("http://localhost:8080/api/v1/auth/login", {
    data: { email, password: SEED_PASSWORD },
  });
  expect(res.ok(), `login failed for ${email}: ${await res.text()}`).toBeTruthy();
  const json = await res.json();
  return json.data.access_token as string;
}

async function checkOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      hasOverflow: root.scrollWidth > root.clientWidth + 1,
    };
  });
}

// Interaction-driven surfaces - these require actually opening a modal/
// dropdown before the overflow risk is reachable (the fix for each was
// applied in Stage 2 of the wider responsive audit: CoachSessionNotes.tsx's
// note-list panel and the Cohort/ProgramParticipants filter dropdown).
const INTERACTION_VIEWPORTS = VIEWPORTS.filter((v) => v.name === "mobile-320" || v.name === "mobile-375");

test.describe("interaction-driven surfaces", () => {
  for (const vp of INTERACTION_VIEWPORTS) {
    test(`coach session-notes create modal @ ${vp.name} has no horizontal overflow`, async ({ page, request, baseURL }) => {
      const token = await login(request, "akanksha@psitech.co.in");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript((t) => window.localStorage.setItem("xa_token", t), token);
      await page.goto(`${baseURL}/dashboard/coach?tab=coach-notes`, { waitUntil: "networkidle", timeout: 30_000 });
      await expect(page.getByText("Session Note").first()).toBeVisible({ timeout: 10_000 });

      const overflowBeforeOpen = await checkOverflow(page);
      expect(overflowBeforeOpen.hasOverflow, "note list + detail split should not overflow before opening the modal").toBe(false);

      await page.getByRole("button", { name: "+ New Session Note" }).click();
      await page.waitForTimeout(400);
      const overflowWithModalOpen = await checkOverflow(page);
      expect(overflowWithModalOpen.hasOverflow, "create-note modal should not overflow the page").toBe(false);
      await page.screenshot({ path: `test-results/responsive/interaction-coach-notes-modal-${vp.name}.png`, fullPage: true });
    });

    test(`program-manager cohort filter dropdown @ ${vp.name} has no horizontal overflow`, async ({ page, request, baseURL }) => {
      const token = await login(request, "vaishnavi@psitech.co.in");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript((t) => window.localStorage.setItem("xa_token", t), token);
      await page.goto(`${baseURL}/dashboard/program-manager?tab=pm-cohort`, { waitUntil: "networkidle", timeout: 30_000 });
      await expect(page.getByText("Cohort").first()).toBeVisible({ timeout: 10_000 });

      // The filter dropdown only renders when the account has more than one
      // program (see CohortManagement.tsx) - skip gracefully rather than
      // fail if this seeded account only has one, instead of timing out.
      const dropdownTrigger = page.locator("#program-filter-dropdown-root button").first();
      const triggerCount = await dropdownTrigger.count();
      test.skip(triggerCount === 0, "seeded account has only one program - filter dropdown doesn't render");

      await dropdownTrigger.click();
      await page.waitForTimeout(400);
      const overflow = await checkOverflow(page);
      expect(overflow.hasOverflow, "open cohort filter dropdown should not overflow the page").toBe(false);
      await page.screenshot({ path: `test-results/responsive/interaction-cohort-dropdown-${vp.name}.png`, fullPage: true });
    });
  }
});

for (const route of ROUTES) {
  test.describe(route.name, () => {
    for (const vp of VIEWPORTS) {
      test(`${route.name} @ ${vp.name} has no horizontal overflow`, async ({ page, request, baseURL }) => {
        const token = await login(request, route.email);

        // pageErrors = uncaught JS exceptions - always a real bug, never expected.
        // consoleErrors = console.error() calls made by app code (not resource-load
        // noise, which the browser reports as a generic "Failed to load resource"
        // console message with no URL - that's tracked precisely via the
        // "response" listener below instead, where it can actually be matched
        // against a specific endpoint).
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const failedRequests: { method: string; url: string; status: number }[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("console", (msg) => {
          if (msg.type() === "error" && !/^Failed to load resource:/.test(msg.text())) {
            consoleErrors.push(msg.text());
          }
        });
        page.on("response", (res) => {
          if (res.status() >= 400) {
            failedRequests.push({ method: res.request().method(), url: res.url(), status: res.status() });
          }
        });

        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.addInitScript((t) => {
          window.localStorage.setItem("xa_token", t);
        }, token);

        await page.goto(`${baseURL}${route.path}`, { waitUntil: "networkidle", timeout: 30_000 });

        // Never redirected back to the public landing/login page.
        expect(page.url(), "should not have redirected to login/landing").toContain("/dashboard/");

        await expect(page.getByText(route.waitText).first()).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(500); // let async data-driven layout settle

        const overflow = await checkOverflow(page);
        expect(overflow.hasOverflow, `page-level horizontal overflow at ${vp.name}: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`).toBe(false);

        await page.screenshot({ path: `test-results/responsive/${route.name}-${vp.name}.png`, fullPage: true });

        // A failed HTTP response (>=400) is only "harmless" here if it's an
        // explicitly documented, already-known case:
        //   - 404s for optional resources (avatars, etc.) - genuinely absent data.
        //   - GET /branding/current returning 403, and ONLY when logged in as
        //     the coach persona (route.email === the coach seed account) - a
        //     real, pre-existing backend permissions gap this suite
        //     discovered (api/internal/organizations' branding route doesn't
        //     grant RoleCoach), unrelated to responsive layout. Documented
        //     here rather than fixed, since this task is layout-only and must
        //     not touch permissions - see the Stage 2 delivery report.
        //     Deliberately narrow: method + status + exact path + persona all
        //     must match, so a 403 on any OTHER endpoint, or a branding 403
        //     for any OTHER role, still fails the test.
        const isKnownCoachBrandingForbidden = (r: { method: string; url: string; status: number }) =>
          route.email === "akanksha@psitech.co.in" &&
          r.method === "GET" &&
          r.status === 403 &&
          new URL(r.url).pathname === "/api/v1/branding/current";
        const unexpectedFailedRequests = failedRequests.filter((r) =>
          r.status !== 404 && !isKnownCoachBrandingForbidden(r)
        );
        expect(
          unexpectedFailedRequests,
          `unexpected failed requests:\n${unexpectedFailedRequests.map((r) => `${r.status} ${r.method} ${r.url}`).join("\n")}`
        ).toEqual([]);
        expect(pageErrors, `unexpected page errors:\n${pageErrors.join("\n")}`).toEqual([]);
        expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
      });
    }
  });
}
