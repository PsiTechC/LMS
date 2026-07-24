"use client";

import { useEffect, useState, use } from "react";
import { certificatesApi, VerifyResultDTO } from "@/lib/certificates-api";

// Public, login-less certificate verification page - the serial code in the
// URL is the only credential, matching survey-external/[token]'s pattern for
// a standalone respondent-facing page (no LMS chrome, branded on its own).

const NAVY = "#182848";
const ORANGE = "#C8A860";
const GREEN = "#22c55e";
const RED = "#ef4444";
const PAGE = "#F7F5F0";
const BORDER = "#E6DED0";
const MUTED = "#4A5573";
const CARD_SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

type Phase = "loading" | "error" | "result";

export default function VerifyCertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<VerifyResultDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    certificatesApi.verify(code)
      .then((r) => { if (!cancelled) { setResult(r); setPhase("result"); } })
      .catch(() => { if (!cancelled) setPhase("error"); });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div style={{
      minHeight: "100vh", background: PAGE, fontFamily: "Poppins, sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW,
        maxWidth: 440, width: "100%", padding: "36px 32px", textAlign: "center",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: ORANGE, letterSpacing: 0.5, marginBottom: 18 }}>
          CERTIFICATE VERIFICATION
        </div>

        {phase === "loading" && (
          <div style={{ fontSize: 13, color: MUTED }}>Checking certificate…</div>
        )}

        {phase === "error" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Unable to verify</div>
            <div style={{ fontSize: 12, color: MUTED }}>Something went wrong checking this certificate. Please try again shortly.</div>
          </>
        )}

        {phase === "result" && result && !result.valid && (
          <>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✕</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: RED, marginBottom: 6 }}>
              {result.revoked ? "Certificate Revoked" : "Certificate Not Found"}
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>
              {result.revoked
                ? "This certificate has been revoked and is no longer valid."
                : "No certificate matches this verification code."}
            </div>
          </>
        )}

        {phase === "result" && result && result.valid && (
          <>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: GREEN, marginBottom: 14 }}>Valid Certificate</div>
            <div style={{ textAlign: "left", background: "#F7F5F0", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <Row label="Participant" value={result.participant_name} />
              <Row label="Program" value={result.program_title} />
              <Row label="Issued" value={result.issued_at ? new Date(result.issued_at).toLocaleDateString() : undefined} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: MUTED, fontWeight: 600 }}>{label}</span>
      <span style={{ color: NAVY, fontWeight: 700 }}>{value ?? "—"}</span>
    </div>
  );
}
