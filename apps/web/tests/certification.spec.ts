import { test, expect, type Page } from "@playwright/test";
import { NAV_CONFIG, type NavItem } from "../components/layout/nav-config";

const SEED_PASSWORD = "QaSeed!2026";
const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 700 },
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-420", width: 420, height: 900 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "desktop-1366", width: 1366, height: 768 },
];

const PERSONAS = [
  { role: "participant" as const, email: "tejas@convis.ai", path: "/dashboard/participant" },
  { role: "faculty" as const, email: "rohit@psitech.co.in", path: "/dashboard/faculty" },
  { role: "coach" as const, email: "akanksha@psitech.co.in", path: "/dashboard/coach" },
  { role: "program_manager" as const, email: "vaishnavi@psitech.co.in", path: "/dashboard/program-manager" },
  { role: "superadmin" as const, email: "tejas@psitech.co.in", path: "/dashboard/superadmin" },
];

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => item.children ? flatten(item.children) : [item]);
}

const DASHBOARD_SURFACES = PERSONAS.flatMap((persona) => [
  ...flatten(NAV_CONFIG[persona.role].items).map((item) => ({
    name: `${persona.role}-${item.id}`,
    email: persona.email,
    path: item.id === "dashboard" || item.id.endsWith("-dashboard") || item.id === "sa-orgs" ? persona.path : `${persona.path}?tab=${item.id}`,
  })),
  ...["profile", "settings"].map((tab) => ({ name: `${persona.role}-${tab}`, email: persona.email, path: `${persona.path}?tab=${tab}` })),
]);

const PUBLIC_SURFACES = ["/", "/about", "/coaching", "/e-learning", "/for-organizations", "/open-programs", "/assessments", "/login", "/invite/accept", "/join/invalid", "/rater/invalid", "/survey-external/invalid", "/verify-email", "/zoom/callback"];

async function login(request: import("@playwright/test").APIRequestContext, email: string) {
  const response = await request.post("http://localhost:8080/api/v1/auth/login", { data: { email, password: SEED_PASSWORD } });
  expect(response.ok(), `login failed for ${email}: ${await response.text()}`).toBeTruthy();
  return (await response.json()).data.access_token as string;
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width < 1 || rect.height < 1) return false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) return false;
      }
      return rect.left < -1 || rect.right > innerWidth + 1;
    }).slice(0, 20).map((element) => ({ tag: element.tagName, id: element.id, className: String(element.className), text: (element.textContent || "").trim().slice(0, 80) }));
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, offenders };
  });
}

for (const surface of DASHBOARD_SURFACES) {
  for (const viewport of VIEWPORTS) {
    test(`${surface.name} @ ${viewport.name} is horizontally contained`, async ({ page, request, baseURL }) => {
      const token = await login(request, surface.email);
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => localStorage.setItem("xa_token", value), token);
      await page.goto(`${baseURL}${surface.path}`, { waitUntil: "networkidle", timeout: 30_000 });
      await page.locator(".xa-loading-screen").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
      expect(page.url()).toContain("/dashboard/");
      const result = await overflow(page);
      expect(result.scrollWidth, `page overflow: ${result.scrollWidth} > ${result.clientWidth}`).toBeLessThanOrEqual(result.clientWidth + 1);
      expect(result.offenders, `off-viewport elements: ${JSON.stringify(result.offenders, null, 2)}`).toEqual([]);
      await page.screenshot({ path: `test-results/responsive/certification/${surface.name}-${viewport.name}.png`, fullPage: true });
    });
  }
}

for (const path of PUBLIC_SURFACES) {
  for (const viewport of VIEWPORTS) {
    test(`public-${path.replaceAll("/", "_") || "home"} @ ${viewport.name} is horizontally contained`, async ({ page, baseURL }) => {
      await page.setViewportSize(viewport);
      await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle", timeout: 30_000 });
      const result = await overflow(page);
      expect(result.scrollWidth, `page overflow: ${result.scrollWidth} > ${result.clientWidth}`).toBeLessThanOrEqual(result.clientWidth + 1);
      expect(result.offenders, `off-viewport elements: ${JSON.stringify(result.offenders, null, 2)}`).toEqual([]);
      await page.screenshot({ path: `test-results/responsive/certification/public-${path.replaceAll("/", "_") || "home"}-${viewport.name}.png`, fullPage: true });
    });
  }
}