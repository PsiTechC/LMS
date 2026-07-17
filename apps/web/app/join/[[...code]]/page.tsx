"use client";

import { useState, useEffect, use, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { attendanceApi, CheckInResponse } from "@/lib/attendance-api";
import AuthModal from "@/components/layout/AuthModal";
import QrScanner from "@/components/join/QrScanner";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

type ResultState =
  | { kind: "success"; already: boolean; title: string }
  | { kind: "session_ended" }
  | { kind: "not_enrolled" }
  | { kind: "invalid_code" }
  | { kind: "error"; message: string };

// A scanned QR encodes the full join_url (e.g.
// https://host/join/XAC4RE?t=<signed-token>) — pull the code (last path
// segment) and token (?t=) back out of it.
function parseJoinUrl(text: string): { code: string; token?: string } | null {
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const code = parts[parts.length - 1];
    if (!code) return null;
    return { code, token: url.searchParams.get("t") ?? undefined };
  } catch {
    return null;
  }
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F7F5F0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, ...ff }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 440, padding: "40px 32px", textAlign: "center" as const, boxShadow: "0 8px 40px rgba(24, 40, 72,0.10)", border: "1px solid #E6DED0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, background: "rgba(200, 168, 96,0.15)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(200, 168, 96,0.25)", overflow: "hidden" }}>
            <img src="/intellique-app-icon.png" alt="Intellique" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#182848" }}>Intellique</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function ResultView({ result, onRetry }: { result: ResultState; onRetry: () => void }) {
  const icon = { success: "✓", session_ended: "◔", not_enrolled: "✕", invalid_code: "?", error: "!" }[result.kind];
  const color = result.kind === "success" ? "#22c55e" : result.kind === "not_enrolled" || result.kind === "error" ? "#ef4444" : "#4A5573";
  const bg = `${color}14`;

  let title: string;
  let subtitle: string;
  let showRetry = false;

  switch (result.kind) {
    case "success":
      title = result.already ? "You're already checked in" : "You're marked present";
      subtitle = result.title;
      break;
    case "session_ended":
      title = "Check-in is closed";
      subtitle = "This attendance session has ended.";
      break;
    case "not_enrolled":
      title = "You're not enrolled";
      subtitle = "Your account isn't enrolled in this program's cohort.";
      break;
    case "invalid_code":
      title = "Session not found";
      subtitle = "Check the code and try again.";
      showRetry = true;
      break;
    case "error":
      title = "Something went wrong";
      subtitle = result.message;
      showRetry = true;
      break;
  }

  return (
    <div>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28, color, fontWeight: 700 }}>
        {icon}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#182848", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.6 }}>{subtitle}</div>
      {showRetry && (
        <button
          onClick={onRetry}
          style={{ ...ff, marginTop: 24, width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#C8A860", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          Try another code
        </button>
      )}
    </div>
  );
}

function JoinPageContent({ codeParam }: { codeParam?: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("t") ?? undefined;

  const [codeInput, setCodeInput] = useState(codeParam ?? "");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  async function submitCheckIn(code: string, token?: string) {
    setSubmitting(true);
    setScanError("");
    try {
      const res = await attendanceApi.checkIn(code, token);
      const data = res.data as CheckInResponse;
      setResult({ kind: "success", already: data.already_checked_in, title: data.class_session_title });
    } catch (err: unknown) {
      const e = err as ApiError;
      switch (e.code) {
        case "SESSION_ENDED":
          setResult({ kind: "session_ended" });
          break;
        case "FORBIDDEN":
          setResult({ kind: "not_enrolled" });
          break;
        case "INVALID_TOKEN":
        case "NOT_FOUND":
          setResult({ kind: "invalid_code" });
          break;
        default:
          setResult({ kind: "error", message: e.message || "Something went wrong. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Auto check-in once logged in, only when arrived via a full scanned/shared
  // link (both code and token present) — a bare code with no token falls
  // through to the manual-entry form below instead.
  useEffect(() => {
    if (authLoading || !user || autoSubmitted || !codeParam || !tokenParam) return;
    let cancelled = false;
    async function run() {
      if (cancelled) return;
      setAutoSubmitted(true);
      await submitCheckIn(codeParam!, tokenParam!);
    }
    run();
    return () => { cancelled = true; };
  }, [authLoading, user, codeParam, tokenParam, autoSubmitted]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeInput.trim() || submitting) return;
    submitCheckIn(codeInput.trim().toUpperCase());
  }

  function handleScanDecoded(decodedText: string) {
    setScanning(false);
    const parsed = parseJoinUrl(decodedText);
    if (!parsed) {
      setScanError("That QR code doesn't look like a valid check-in code.");
      return;
    }
    setCodeInput(parsed.code);
    submitCheckIn(parsed.code, parsed.token);
  }

  function retry() {
    setResult(null);
    setCodeInput("");
  }

  if (authLoading) {
    return <JoinShell><div style={{ fontSize: 13, color: "#4A5573" }}>Loading…</div></JoinShell>;
  }

  if (!user) {
    return (
      <>
        <JoinShell>
          <div style={{ fontSize: 13, color: "#4A5573" }}>Log in to check in to this session.</div>
        </JoinShell>
        <AuthModal onClose={() => router.push("/")} onSuccess={() => { /* effects above resume once `user` is set */ }} />
      </>
    );
  }

  if (result) {
    return <JoinShell><ResultView result={result} onRetry={retry} /></JoinShell>;
  }

  if (codeParam && tokenParam && (submitting || !autoSubmitted)) {
    return <JoinShell><div style={{ fontSize: 13, color: "#4A5573" }}>Checking you in…</div></JoinShell>;
  }

  return (
    <JoinShell>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#182848", marginBottom: 6 }}>Session Check-In</div>
      <div style={{ fontSize: 12, color: "#4A5573", marginBottom: 24 }}>Enter the session code, or scan its QR.</div>

      <form onSubmit={handleManualSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          placeholder="e.g. XAC4RE"
          maxLength={6}
          style={{ ...ff, border: "1px solid #E6DED0", borderRadius: 10, padding: "12px 14px", fontSize: 20, fontWeight: 800, letterSpacing: 4, color: "#C8A860", textAlign: "center" as const, textTransform: "uppercase" as const }}
        />
        <button
          type="submit"
          disabled={submitting || !codeInput.trim()}
          style={{ ...ff, padding: "12px 0", borderRadius: 10, border: "none", background: submitting || !codeInput.trim() ? "#D1D5DB" : "#C8A860", color: "#fff", fontSize: 13, fontWeight: 700, cursor: submitting || !codeInput.trim() ? "not-allowed" : "pointer" }}
        >
          {submitting ? "Checking in…" : "Check In"}
        </button>
      </form>

      {!scanning ? (
        <button
          onClick={() => { setScanning(true); setScanError(""); }}
          style={{ ...ff, width: "100%", padding: "11px 0", borderRadius: 10, border: "1px solid #E6DED0", background: "#fff", color: "#182848", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          📷 Scan QR
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <QrScanner onDecoded={handleScanDecoded} onError={(msg) => { setScanning(false); setScanError(msg); }} />
          <button
            onClick={() => setScanning(false)}
            style={{ ...ff, padding: "9px 0", borderRadius: 10, border: "1px solid #E6DED0", background: "#fff", color: "#4A5573", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel scan
          </button>
        </div>
      )}

      {scanError && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#ef4444", lineHeight: 1.5 }}>
          {scanError} — you can still type the code above.
        </div>
      )}
    </JoinShell>
  );
}

export default function JoinPage({ params }: { params: Promise<{ code?: string[] }> }) {
  const { code } = use(params);
  const codeParam = code?.[0];
  return (
    <Suspense fallback={<JoinShell><div style={{ fontSize: 13, color: "#4A5573" }}>Loading…</div></JoinShell>}>
      <JoinPageContent codeParam={codeParam} />
    </Suspense>
  );
}
