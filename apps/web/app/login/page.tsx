"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(dashboardRoute(user.role));
    }
  }, [user, loading, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingScreen />;

  return (
    <div style={styles.root}>
      {/* Left panel — brand */}
      <div style={styles.left}>
        <div style={styles.brandMark}>
          <span style={styles.brandXA}>XA</span>
        </div>
        <h1 style={styles.brandTitle}>XA LMS</h1>
        <p style={styles.brandSub}>AI-Powered Leadership Development</p>
        <p style={styles.brandByLine}>by Executive Acceleration</p>

        <div style={styles.featureList}>
          {[
            "Cohort-based leadership programs",
            "AI coaching & personalized insights",
            "360° feedback & assessments",
            "Real-time analytics for organizations",
          ].map((f) => (
            <div key={f} style={styles.featureItem}>
              <span style={styles.featureDot}>✦</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div style={styles.right}>
        <div style={styles.card}>
          <div style={styles.cardLogo}>
            <div style={styles.cardLogoMark}>XA</div>
          </div>
          <h2 style={styles.cardTitle}>Welcome back</h2>
          <p style={styles.cardSub}>Sign in to your XA LMS account</p>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={styles.input}
                autoComplete="email"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={styles.input}
                autoComplete="current-password"
              />
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}

            <button type="submit" disabled={busy} style={styles.submitBtn}>
              {busy ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p style={styles.footer}>
            XA LMS · Secure platform by Executive Acceleration
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F5F7FB" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#EF4E24", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18, margin: "0 auto 12px" }}>XA</div>
        <p style={{ color: "#8b90a7", fontSize: 13 }}>Loading…</p>
      </div>
    </div>
  );
}

function dashboardRoute(role: string): string {
  switch (role) {
    case "superadmin":     return "/dashboard/superadmin";
    case "program_manager": return "/dashboard/program-manager";
    case "faculty":        return "/dashboard/faculty";
    default:               return "/dashboard/participant";
  }
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "Poppins, sans-serif",
  },
  left: {
    flex: 1,
    background: "linear-gradient(160deg, #1C2551 0%, #2d3a7c 100%)",
    padding: "60px 56px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    color: "#fff",
  },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: "rgba(239,78,36,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    border: "1px solid rgba(239,78,36,0.3)",
  },
  brandXA: { fontSize: 22, fontWeight: 800, color: "#EF4E24" },
  brandTitle: { fontSize: 36, fontWeight: 800, lineHeight: 1.1, marginBottom: 8 },
  brandSub: { fontSize: 16, color: "rgba(255,255,255,0.65)", marginBottom: 4 },
  brandByLine: { fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: 1, marginBottom: 48 },
  featureList: { display: "flex", flexDirection: "column", gap: 16 },
  featureItem: { display: "flex", alignItems: "flex-start", gap: 12, fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 },
  featureDot: { color: "#EF4E24", flexShrink: 0, marginTop: 1 },
  right: {
    width: 480,
    background: "#F5F7FB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 4px 24px rgba(28,37,81,0.10)",
    border: "1px solid #EAECF4",
  },
  cardLogo: { display: "flex", justifyContent: "center", marginBottom: 24 },
  cardLogoMark: {
    width: 44,
    height: 44,
    borderRadius: 11,
    background: "#EF4E24",
    color: "#fff",
    fontWeight: 800,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 22, fontWeight: 700, color: "#1C2551", textAlign: "center", marginBottom: 4 },
  cardSub: { fontSize: 13, color: "#8b90a7", textAlign: "center", marginBottom: 28 },
  form: { display: "flex", flexDirection: "column", gap: 18 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" },
  input: {
    border: "1px solid #EAECF4",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    color: "#1C2551",
    outline: "none",
    transition: "border-color 0.15s",
    background: "#fff",
    width: "100%",
  },
  errorBox: {
    background: "rgba(239,78,36,0.08)",
    border: "1px solid rgba(239,78,36,0.25)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#EF4E24",
  },
  submitBtn: {
    background: "#EF4E24",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "Poppins, sans-serif",
    marginTop: 4,
  },
  footer: { fontSize: 11, color: "#8b90a7", textAlign: "center", marginTop: 24 },
};
