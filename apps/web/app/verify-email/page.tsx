"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiResponse, LoginResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUserFromVerify } = useAuth();

  const [status, setStatus] = useState<"verifying" | "success" | "error" | "already">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in this link. Please check your email for the correct link.");
      return;
    }

    api.post<ApiResponse<LoginResponse>>("/auth/verify-email", { token })
      .then((res) => {
        const { access_token, user } = res.data;
        localStorage.setItem("xa_token", access_token);
        setUserFromVerify(user);
        setStatus("success");

        // Redirect to dashboard after 1.8s
        setTimeout(() => {
          const roleMap: Record<string, string> = {
            superadmin:      "/dashboard/superadmin",
            program_manager: "/dashboard/program-manager",
            faculty:         "/dashboard/faculty",
            coach:           "/dashboard/coach",
            participant:     "/dashboard/participant",
          };
          router.replace(roleMap[user.role] || "/dashboard/participant");
        }, 1800);
      })
      .catch((err: Error) => {
        const msg = err.message || "";
        if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired")) {
          setStatus("error");
          setMessage("This verification link is invalid or has expired. Request a new one below.");
        } else {
          setStatus("error");
          setMessage("Something went wrong. Please try again or request a new verification link.");
        }
      });
  }, [params, router, setUserFromVerify]);

  return (
    <div style={{
      minHeight: "100vh", background: "#F7F5F0",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "Poppins, sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 460,
        padding: "48px 40px", textAlign: "center",
        boxShadow: "0 8px 40px rgba(24, 40, 72,0.10)",
        border: "1px solid #E6DED0",
      }}>
        {/* Logo */}
        <div style={{
          width: 52, height: 52, background: "rgba(200, 168, 96,0.1)", borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px", overflow: "hidden",
        }}>
          <img src="/intellique-app-icon.png" alt="Intellique" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>

        {status === "verifying" && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#182848", marginBottom: 10 }}>
              Verifying your email…
            </div>
            <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.6 }}>
              Please wait while we confirm your address.
            </div>
            <div style={{
              margin: "28px auto 0", width: 36, height: 36, border: "3px solid #E6DED0",
              borderTop: "3px solid #C8A860", borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{
              width: 52, height: 52, background: "rgba(34,197,94,0.1)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", fontSize: 24, color: "#22c55e",
            }}>✓</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#182848", marginBottom: 10 }}>
              Email verified!
            </div>
            <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.6 }}>
              Your account is now active. Redirecting you to your dashboard…
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{
              width: 52, height: 52, background: "rgba(200, 168, 96,0.1)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", fontSize: 22, color: "#C8A860",
            }}>✕</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#182848", marginBottom: 10 }}>
              Verification failed
            </div>
            <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.6, marginBottom: 28 }}>
              {message}
            </div>
            <ResendForm />
          </>
        )}
      </div>
    </div>
  );
}

function ResendForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await api.post("/auth/resend-verification", { email });
    } catch {
      // Silently handle - server always returns 200
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div style={{
        padding: "14px 18px", background: "rgba(34,197,94,0.07)",
        border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10,
        fontSize: 13, color: "#22c55e", fontWeight: 600,
      }}>
        If that email is registered, a new link has been sent. Check your inbox.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, marginBottom: 8 }}>
        RESEND VERIFICATION EMAIL
      </div>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        style={{
          width: "100%", border: "1px solid #E6DED0", borderRadius: 8,
          padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif",
          color: "#182848", boxSizing: "border-box", outline: "none", marginBottom: 10,
        }}
        onKeyDown={(e) => { if (e.key === "Enter") handleResend(); }}
      />
      <button
        onClick={handleResend}
        disabled={!email.trim() || loading}
        style={{
          width: "100%", padding: "10px", background: email.trim() && !loading ? "#C8A860" : "#C9BFA8",
          border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: email.trim() && !loading ? "pointer" : "default",
          fontFamily: "Poppins, sans-serif",
        }}
      >{loading ? "Sending…" : "Send New Link"}</button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#F7F5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "Poppins, sans-serif", fontSize: 13, color: "#4A5573" }}>Loading…</div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
