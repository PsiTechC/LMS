"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { api, ApiResponse, BASE_URL } from "./api";
import { useAuth } from "./auth-context";

export interface BrandKitDTO {
  primary: string;
  sidebar: string;
  accent: string;
  surface: string;
  text: string;
  font: string;
  logo_text: string;
  logo_url: string;
}

// resolveBrandLogoURL turns a stored logo_url into something an <img> tag can
// actually load. An uploaded org logo is stored as a relative API path
// (/api/v1/organizations/:orgId/logo/:logoId/file - see
// api/internal/organizations/logo_service.go), which resolves against the
// FRONTEND's own origin if used as-is in an <img src>, not the API's origin -
// a silent broken-image icon, not an error anyone sees in the console. The
// route is "token-authenticated... so an <img src> tag can load it directly"
// (handler.go's own doc comment) - same convention as profileApi.avatarSrc
// for user avatars, mirrored here since org logos are a distinct DTO.
// Absolute URLs (e.g. the DEFAULT_BRAND_KIT's own "/intellique-app-icon.png"
// static asset, or a future externally-hosted logo) pass through unchanged.
export function resolveBrandLogoURL(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (/^https?:\/\//.test(logoUrl) || logoUrl.startsWith("/intellique")) return logoUrl;
  const apiOrigin = BASE_URL.endsWith("/api/v1") ? BASE_URL.slice(0, -7) : BASE_URL;
  const token = typeof window !== "undefined" ? (localStorage.getItem("xa_token") ?? "") : "";
  const sep = logoUrl.includes("?") ? "&" : "?";
  return `${apiOrigin}${logoUrl}${sep}token=${encodeURIComponent(token)}`;
}

export const DEFAULT_BRAND_KIT: BrandKitDTO = {
  primary: "#C8A860",
  sidebar: "#182848",
  accent: "#C8A860",
  surface: "#F7F5F0",
  text: "#182848",
  font: "Poppins",
  logo_text: "Intellique",
  logo_url: "/intellique-app-icon.png",
};

const BrandThemeContext = createContext<{ refreshBrand: () => Promise<void> }>({ refreshBrand: async () => {} });

export const brandingApi = {
  current: () => api.get<ApiResponse<BrandKitDTO>>("/branding/current"),
  get: (orgId: string) => api.get<ApiResponse<BrandKitDTO>>(`/branding/${orgId}`),
  update: (orgId: string, body: Partial<BrandKitDTO>) => api.patch<ApiResponse<BrandKitDTO>>(`/branding/${orgId}`, body),

  // Multipart upload - bypasses the JSON-only `api` helper, same pattern as
  // contentApi.create in content-api.ts.
  async uploadLogo(orgId: string, file: File): Promise<ApiResponse<{ logo_url: string }>> {
    const form = new FormData();
    form.append("file", file);
    const token = typeof window !== "undefined" ? localStorage.getItem("xa_token") ?? "" : "";
    const res = await fetch(`${BASE_URL}/organizations/${orgId}/logo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
    return json as ApiResponse<{ logo_url: string }>;
  },

  deleteLogo: (orgId: string) => api.delete<ApiResponse<null>>(`/organizations/${orgId}/logo`),
};

function applyBrand(brand: BrandKitDTO) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--xa-primary", brand.primary || DEFAULT_BRAND_KIT.primary);
  root.style.setProperty("--xa-sidebar", brand.sidebar || DEFAULT_BRAND_KIT.sidebar);
  root.style.setProperty("--xa-accent", brand.accent || DEFAULT_BRAND_KIT.accent);
  root.style.setProperty("--xa-bg", brand.surface || DEFAULT_BRAND_KIT.surface);
  root.style.setProperty("--xa-text", brand.text || DEFAULT_BRAND_KIT.text);
  root.style.setProperty("--xa-navy", brand.text || DEFAULT_BRAND_KIT.text);
  root.style.setProperty("--xa-orange", brand.primary || DEFAULT_BRAND_KIT.primary);
  root.style.setProperty("--xa-brand-font", brand.font || DEFAULT_BRAND_KIT.font);
  root.style.setProperty("--xa-logo-text", `"${(brand.logo_text || DEFAULT_BRAND_KIT.logo_text).replace(/"/g, "")}"`);
}

export function BrandThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const refreshBrand = useCallback(async () => {
    if (!user) {
      applyBrand(DEFAULT_BRAND_KIT);
      return;
    }
    try {
      const res = await brandingApi.current();
      applyBrand(res.data ?? DEFAULT_BRAND_KIT);
    } catch {
      applyBrand(DEFAULT_BRAND_KIT);
    }
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(refreshBrand);
  }, [refreshBrand]);

  return <BrandThemeContext.Provider value={{ refreshBrand }}>{children}</BrandThemeContext.Provider>;
}

export function useBrandTheme() {
  return useContext(BrandThemeContext);
}
