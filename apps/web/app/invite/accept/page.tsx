"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { invitationsApi, ValidateTokenDTO } from "@/lib/invitations-api";

type PageState = "validating" | "ready" | "submitting" | "success" | "error";

const ROLE_LABEL: Record<string, string> = {
  participant: "Participant",
  faculty: "Faculty",
  coach: "Coach",
};

function AcceptInviteContent() {
  const params      = useSearchParams();
  const router      = useRouter();
  const token       = params.get("token") ?? "";

  const [pageState, setPageState] = useState<PageState>("validating");
  const [invite, setInvite]       = useState<ValidateTokenDTO | null>(null);
  const [errorMsg, setErrorMsg]   = useState("");

  const [name, setName]           = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [fieldError, setFieldError] = useState("");

  // Validate token on mount
  useEffect(() => {
    if (!token) { setErrorMsg("No invite token found. Please use the link from your email."); setPageState("error"); return; }
    invitationsApi.validate(token)
      .then((res) => { setInvite(res.data); setName(res.data?.name ?? ""); setPageState("ready"); })
      .catch((e: unknown) => { setErrorMsg((e as Error).message || "Invalid or expired invite link."); setPageState("error"); });
  }, [token]);

  async function handleAccept() {
    if (!name.trim()) { setFieldError("Please enter your full name"); return; }
    if (password.length < 6) { setFieldError("Password must be at least 6 characters"); return; }
    setFieldError("");
    setPageState("submitting");
    try {
      await invitationsApi.accept({ token, password, name: name.trim() });
      setPageState("success");
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || "Something went wrong. Please try again.");
      setPageState("error");
    }
  }

  // ── Validating ────────────────────────────────────────────────
  if (pageState === "validating") {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 16, animation: "spin 1s linear infinite" }}>◎</div>
          <div style={{ fontSize: 14, color: "#8b90a7" }}>Validating your invite link…</div>
        </div>
      </Shell>
    );
  }

  // ── Error ─────────────────────────────────────────────────────
  if (pageState === "error") {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "40px 32px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>
            Invalid Invite
          </div>
          <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6, marginBottom: 24 }}>
            {errorMsg}
          </div>
          <div style={{ fontSize: 12, color: "#8b90a7" }}>
            Contact your Program Manager to request a new invite.
          </div>
        </div>
      </Shell>
    );
  }

  // ── Success ───────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "40px 32px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>
            You're enrolled!
          </div>
          <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6, marginBottom: 28 }}>
            Your account has been created and you've been enrolled in the program.
            Log in to start your leadership journey.
          </div>
          <button
            onClick={() => router.push("/login")}
            style={{
              padding: "12px 32px", background: "#EF4E24", border: "none", borderRadius: 10,
              cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#fff",
              fontFamily: "Poppins, sans-serif",
            }}
          >Go to Login →</button>
        </div>
      </Shell>
    );
  }

  // ── Registration form ─────────────────────────────────────────
  return (
    <Shell>
      {/* Invite banner */}
      <div style={{
        background: "#1C2551", padding: "20px 28px",
      }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", letterSpacing: 1, marginBottom: 6 }}>
          YOU'VE BEEN INVITED
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
          Join as {ROLE_LABEL[invite?.role ?? ""] ?? invite?.role}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          Complete your profile to enroll
        </div>
      </div>

      <div style={{ padding: "28px 28px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Full name — editable so the invitee can set or correct it */}
        <div>
          <label style={lbl}>FULL NAME *</label>
          <input
            type="text"
            style={inp}
            placeholder="Your full name"
            value={name}
            onChange={(e) => { setName(e.target.value); setFieldError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleAccept(); }}
          />
        </div>

        {invite?.department && (
          <div>
            <label style={lbl}>DEPARTMENT</label>
            <div style={{
              ...inp, background: "#F8F9FC", color: "#8b90a7",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 12 }}>🔒</span>
              {invite.department}
            </div>
          </div>
        )}

        <div>
          <label style={lbl}>EMAIL ADDRESS</label>
          <div style={{
            ...inp, background: "#F8F9FC", color: "#8b90a7",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 12 }}>🔒</span>
            {invite?.email}
          </div>
        </div>

        <div>
          <label style={lbl}>ROLE</label>
          <div style={{
            ...inp, background: "#F8F9FC", color: "#8b90a7",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 12 }}>🔒</span>
            {ROLE_LABEL[invite?.role ?? ""] ?? invite?.role}
          </div>
        </div>

        {/* Only password is editable — everything else was set by PM */}
        <div>
          <label style={lbl}>CREATE PASSWORD *</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              style={{ ...inp, paddingRight: 40 }}
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleAccept(); }}
            />
            <button
              onClick={() => setShowPass((v) => !v)}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, color: "#8b90a7",
              }}
            >{showPass ? "Hide" : "Show"}</button>
          </div>
        </div>

        {fieldError && (
          <div style={{
            padding: "10px 14px", background: "rgba(239,78,36,0.06)",
            borderRadius: 8, border: "1px solid rgba(239,78,36,0.2)",
            fontSize: 12, color: "#EF4E24",
          }}>{fieldError}</div>
        )}

        <button
          onClick={handleAccept}
          disabled={pageState === "submitting"}
          style={{
            padding: "13px", background: pageState === "submitting" ? "#D0D3E0" : "#EF4E24",
            border: "none", borderRadius: 10,
            cursor: pageState === "submitting" ? "default" : "pointer",
            fontSize: 14, fontWeight: 700, color: "#fff",
            fontFamily: "Poppins, sans-serif", marginTop: 4,
          }}
        >
          {pageState === "submitting" ? "Enrolling…" : "Create Account & Enroll →"}
        </button>

        <div style={{ fontSize: 11, color: "#8b90a7", textAlign: "center", lineHeight: 1.5 }}>
          By enrolling you agree to the XA LMS terms of use.
          Your role and email are set by your Program Manager. You can set your name below.
        </div>
      </div>
    </Shell>
  );
}

// useSearchParams() requires a Suspense boundary during static generation (Next 16).
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <Shell>
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 16, animation: "spin 1s linear infinite" }}>◎</div>
          <div style={{ fontSize: 14, color: "#8b90a7" }}>Loading…</div>
        </div>
      </Shell>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}

// ── Shell layout ──────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#F8F9FC",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "Poppins, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1C2551", letterSpacing: -0.5 }}>
            XA <span style={{ color: "#EF4E24" }}>LMS</span>
          </div>
          <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>by Executive Acceleration</div>
        </div>

        <div style={{
          background: "#fff", borderRadius: 16, overflow: "hidden",
          boxShadow: "0 4px 32px rgba(28,37,81,0.10)", border: "1px solid #EAECF4",
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#8b90a7",
  letterSpacing: 0.5, display: "block", marginBottom: 6,
};

const inp: React.CSSProperties = {
  width: "100%", border: "1px solid #EAECF4", borderRadius: 8,
  padding: "10px 14px", fontSize: 13, fontFamily: "Poppins, sans-serif",
  color: "#1C2551", boxSizing: "border-box", outline: "none",
};
