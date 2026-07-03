"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { api, ApiResponse } from "./api";
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

export const DEFAULT_BRAND_KIT: BrandKitDTO = {
  primary: "#EF4E24",
  sidebar: "#1C2551",
  accent: "#EF4E24",
  surface: "#F5F7FB",
  text: "#1C2551",
  font: "Poppins",
  logo_text: "XA LMS",
  logo_url: "",
};

const BrandThemeContext = createContext<{ refreshBrand: () => Promise<void> }>({ refreshBrand: async () => {} });

export const brandingApi = {
  current: () => api.get<ApiResponse<BrandKitDTO>>("/branding/current"),
  get: (orgId: string) => api.get<ApiResponse<BrandKitDTO>>(`/branding/${orgId}`),
  update: (orgId: string, body: Partial<BrandKitDTO>) => api.patch<ApiResponse<BrandKitDTO>>(`/branding/${orgId}`, body),
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
