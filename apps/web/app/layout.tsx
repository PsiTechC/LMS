import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { BrandThemeProvider } from "@/lib/brand-theme";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "XA LMS — Leadership Development Platform",
  description: "AI-powered leadership development by Executive Acceleration",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${poppins.variable}`}>
      <body className="h-full" style={{ fontFamily: "var(--font-poppins), Poppins, -apple-system, sans-serif" }}>
        <AuthProvider><BrandThemeProvider>{children}</BrandThemeProvider></AuthProvider>
      </body>
    </html>
  );
}
