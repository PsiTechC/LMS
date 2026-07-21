import SiteHeader from "@/components/layout/SiteHeader";
import Link from "next/link";

export default function ComingSoonPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F7F5F0", fontFamily: "Poppins, sans-serif" }}>
      <SiteHeader />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "20vh", padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>🚧</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#182848", marginBottom: 12 }}>Development in Progress</h1>
        <p style={{ fontSize: 16, color: "#4A5573", maxWidth: 500, lineHeight: 1.6, marginBottom: 32 }}>
          This feature is currently under development and will be available soon. Check back later!
        </p>
        <Link href="/open-programs" style={{ padding: "12px 24px", background: "#C8A860", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
          Back to Open Programs
        </Link>
      </div>
    </div>
  );
}
