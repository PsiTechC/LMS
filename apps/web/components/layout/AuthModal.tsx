"use client";

import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "@/lib/auth-context";

// Shared input style — used across sign-in/sign-up fields. Focus ring/border
// swap is handled globally (input:focus in globals.css), this just keeps the
// resting state consistent and gives every field a subtle hover cue so the
// form doesn't feel static before you've clicked into anything.
const inputStyle = (hover: boolean): React.CSSProperties => ({
  width: "100%", border: `1px solid ${hover ? "#c7bda3" : "#E6DED0"}`, borderRadius: 8,
  padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: "#182848",
  outline: "none", boxSizing: "border-box", transition: "border-color 0.16s ease, box-shadow 0.16s ease",
});

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [hover, setHover] = useState(false);
  return (
    <input
      {...props}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...inputStyle(hover), ...(props.style ?? {}) }}
    />
  );
}

// Close (✕) button for the modal's dark gradient header — subtle fill +
// brighten on hover so it reads as interactive against the navy background.
function HeaderCloseButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Close"
      style={{
        width: 28, height: 28, border: `1px solid rgba(255,255,255,${hover ? 0.35 : 0.2})`, borderRadius: "50%",
        background: hover ? "rgba(255,255,255,0.12)" : "transparent", cursor: "pointer",
        color: hover ? "#fff" : "rgba(255,255,255,0.7)", fontSize: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease",
        transform: hover ? "scale(1.06)" : "scale(1)",
      }}
    >✕</button>
  );
}

// Full-width CTA with hover/press feedback — mirrors .xa-btn-primary's
// :active scale from globals.css since this modal is portaled and uses
// inline styles rather than the shared button classes. `variant="navy"`
// covers the one non-CTA confirm action (post-signup "Go to Sign In"),
// keeping the single-gold-CTA-per-screen rule intact everywhere else.
function PrimaryButton({ loading, onClick, children, variant = "gold" }: {
  loading?: boolean; onClick: () => void; children: React.ReactNode; variant?: "gold" | "navy";
}) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const base = variant === "navy" ? "#182848" : "#C8A860";
  const hoverColor = variant === "navy" ? "#22335e" : "#bb9a54";
  const glow = variant === "navy" ? "0 4px 12px rgba(24,40,72,0.3)" : "0 4px 12px rgba(200,168,96,0.35)";
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        width: "100%", padding: "11px", background: loading ? "#C9BFA8" : hover ? hoverColor : base,
        border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13,
        cursor: loading ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif", marginBottom: 12,
        transform: active && !loading ? "scale(0.98)" : "scale(1)",
        boxShadow: hover && !loading ? glow : "none",
        transition: "background 0.16s ease, transform 0.1s ease, box-shadow 0.16s ease",
      }}
    >
      {children}
    </button>
  );
}

// Icon/utility button (e.g. "Send OTP" beside the code field) — ghost style
// per the design system's utility-button variant, with a hover fill so it
// doesn't sit visually dead next to the code input.
function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: `1px solid ${hover ? "#c7bda3" : "#E6DED0"}`, borderRadius: 8,
        background: hover ? "#EFE9DC" : "#F7F5F0", cursor: "pointer", fontSize: 12, fontWeight: 700,
        color: "#182848", fontFamily: "Poppins,sans-serif", padding: "0 14px", whiteSpace: "nowrap",
        transition: "background 0.16s ease, border-color 0.16s ease",
      }}
    >
      {children}
    </button>
  );
}

// Role-picker card (Participant / Business Admin) in the sign-up form — adds
// a hover lift so the two options read as clickable before the user commits.
function RoleOption({ selected, color, onClick, abbr, label, desc }: {
  selected: boolean; color: string; onClick: () => void; abbr: string; label: string; desc: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "10px 14px",
        border: `1.5px solid ${selected ? color : hover ? "#c7bda3" : "#E6DED0"}`, borderRadius: 10,
        background: selected ? `${color}10` : "#fff", cursor: "pointer", fontFamily: "Poppins,sans-serif",
        transform: hover && !selected ? "translateY(-1px)" : "translateY(0)",
        transition: "border-color 0.16s ease, transform 0.16s ease, background 0.16s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: selected ? color : "#C9BFA8", color: "#fff", fontWeight: 800, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.16s ease" }}>{abbr}</div>
        <span style={{ fontSize: 12, fontWeight: selected ? 700 : 500, color: selected ? color : "#182848" }}>{label}</span>
      </div>
      <span style={{ fontSize: 10, color: "#4A5573", paddingLeft: 30 }}>{desc}</span>
    </button>
  );
}

export default function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (role: string) => void; }) {
  const { login, otpLogin, sendOtp, register } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  // post-signup state: show "check your email"
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);
  // sign-in: "unverified" state to show resend option
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [role, setRole] = useState("participant");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── OTP login (dev) ──
  const [otpEnabled, setOtpEnabled] = useState(false); // feature available on server?
  const [otpMode, setOtpMode] = useState(false);       // user chose OTP login?
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState("");

  useEffect(() => {
    // Show the OTP option only when the server has it enabled.
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"}/auth/otp-status`)
      .then(r => r.json())
      .then(j => setOtpEnabled(!!j?.data?.enabled))
      .catch(() => setOtpEnabled(false));
  }, []);

  async function handleSendOtp() {
    if (!email) { setError("Enter your email first"); return; }
    setError(""); setOtpSent("");
    try {
      const msg = await sendOtp(email);
      setOtpSent(msg || "Code sent.");
    } catch { setOtpSent("Could not send the code. Please try again."); }
  }

  async function handleOtpSignIn() {
    if (!email || !otp) { setError("Email and OTP are required"); return; }
    setLoading(true); setError("");
    try {
      await otpLogin(email, otp.trim());
      const token = localStorage.getItem("xa_token") ?? "";
      const payload = token ? JSON.parse(atob(token.split(".")[1])) : {};
      onSuccess(payload.role || "participant");
    } catch (e: unknown) {
      setError((e as Error).message || "Invalid or expired code");
    } finally { setLoading(false); }
  }

  function switchTab(t: "signin" | "signup") {
    setTab(t); setError(""); setUnverifiedEmail(null); setResendSent(false);
  }

  async function handleSignIn() {
    if (!email || !pass) { setError("Email and password are required"); return; }
    setLoading(true); setError(""); setUnverifiedEmail(null);
    try {
      await login(email, pass);
      const token = localStorage.getItem("xa_token") ?? "";
      const payload = token ? JSON.parse(atob(token.split(".")[1])) : {};
      onSuccess(payload.role || "participant");
    } catch (e: unknown) {
      const msg = (e as Error).message || "";
      if (msg.toLowerCase().includes("not verified") || msg.toLowerCase().includes("verify")) {
        setUnverifiedEmail(email);
        setError("Your email address has not been verified yet.");
      } else {
        setError(msg || "Invalid credentials");
      }
    } finally { setLoading(false); }
  }

  async function handleSignUp() {
    if (!name || !email || !pass) { setError("All fields are required"); return; }
    if (pass.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    try {
      const apiRole = role === "programManager" ? "program_manager" : "participant";
      await register(name, email, pass, apiRole);
      setSignedUpEmail(email);
    } catch (e: unknown) {
      setError((e as Error).message || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  }

  async function handleResendFromSignIn() {
    if (!unverifiedEmail) return;
    setResendSent(false);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"}/auth/resend-verification`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
    } catch { /* server always returns 200 */ }
    setResendSent(true);
  }

  // ── Post-signup: check your email screen ────────────────────────
  // Rendered via a portal to <body> — the page's <main> (DashboardShell)
  // has a CSS `transform` for its entrance animation, which creates a new
  // containing block for `position: fixed` descendants. Without the portal,
  // this overlay would be pinned to <main>'s box instead of the real
  // viewport, leaving the header undimmed and exposing bright gaps on scroll.
  if (signedUpEmail) {
    if (typeof document === "undefined") return null;
    return ReactDOM.createPortal(
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        className="xa-modal-overlay"
        style={{ position:"fixed", inset:0, background:"rgba(24, 40, 72,0.58)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Poppins,sans-serif" }}
      >
        <div className="xa-modal-content" style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:440, overflow:"hidden", boxShadow:"0 24px 64px rgba(24, 40, 72,0.28)" }}>
          {/* Gradient header */}
          <div style={{ background:"linear-gradient(135deg,#182848,#2d3a7c)", padding:"24px 32px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, background:"rgba(200, 168, 96,0.15)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}><img src="/intellique-icon-reversed.png" alt="Intellique" style={{ width:"70%", height:"70%", objectFit:"contain" }} /></div>
              <div>
                <div style={{ color:"#fff", fontWeight:700, fontSize:13 }}>Intellique</div>
                <div style={{ color:"rgba(255,255,255,0.4)", fontSize:9, letterSpacing:1 }}>BY EXECUTIVE ACCELERATION</div>
              </div>
            </div>
            <HeaderCloseButton onClick={onClose} />
          </div>

          <div style={{ padding:"32px 32px 28px", textAlign:"center" }}>
            <div style={{ width:56, height:56, background:"rgba(34,197,94,0.1)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px", fontSize:26, color:"#22c55e" }}>✉</div>
            <div style={{ fontSize:17, fontWeight:700, color:"#182848", marginBottom:10 }}>Check your inbox</div>
            <div style={{ fontSize:13, color:"#4A5573", lineHeight:1.7, marginBottom:22 }}>
              We sent a verification link to<br />
              <strong style={{ color:"#182848" }}>{signedUpEmail}</strong>.<br /><br />
              Click the link in the email to activate your account. The link expires in 24 hours.
            </div>
            <div style={{ padding:"12px 16px", background:"rgba(200, 168, 96,0.05)", border:"1px solid rgba(200, 168, 96,0.15)", borderRadius:10, fontSize:12, color:"#C8A860", marginBottom:22, lineHeight:1.6 }}>
              No SMTP configured in dev? The link is printed in the API server logs.
            </div>
            <PrimaryButton variant="navy" onClick={() => { setSignedUpEmail(null); switchTab("signin"); setEmail(signedUpEmail); }}>
              Go to Sign In
            </PrimaryButton>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Rendered via a portal to <body> for the same containing-block reason as
  // the post-signup screen above.
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="xa-modal-overlay"
      style={{ position:"fixed", inset:0, background:"rgba(24, 40, 72,0.58)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Poppins,sans-serif" }}
    >
      <div className="xa-modal-content" style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:440, overflow:"hidden", boxShadow:"0 24px 64px rgba(24, 40, 72,0.28)" }}>
        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#182848,#2d3a7c)", padding:"20px 32px 0", position:"relative" }}>
          <div style={{ position:"absolute", top:14, right:16 }}><HeaderCloseButton onClick={onClose} /></div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <div style={{ width:32, height:32, background:"rgba(200, 168, 96,0.15)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}><img src="/intellique-icon-reversed.png" alt="Intellique" style={{ width:"70%", height:"70%", objectFit:"contain" }} /></div>
            <div>
              <div style={{ color:"#fff", fontWeight:700, fontSize:13 }}>Intellique</div>
              <div style={{ color:"rgba(255,255,255,0.4)", fontSize:9, letterSpacing:1 }}>BY EXECUTIVE ACCELERATION</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:0 }}>
            {([ ["signin","Sign In"], ["signup","Create Account"] ] as const).map(([key, label]) => (
              <button key={key} onClick={() => switchTab(key)} style={{ flex:1, padding:"9px 0", border:"none", background:"transparent", cursor:"pointer", fontSize:12, fontWeight:tab===key?700:400, color:tab===key?"#fff":"rgba(255,255,255,0.45)", borderBottom:tab===key?"2.5px solid #C8A860":"2.5px solid transparent", transition:"color 0.16s ease, border-color 0.2s cubic-bezier(0.2,0,0,1)", fontFamily:"Poppins,sans-serif" }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding:"20px 32px 24px" }}>
          {error && (
            <div style={{ background:"rgba(200, 168, 96,0.06)", border:"1px solid rgba(200, 168, 96,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#C8A860", fontWeight:600 }}>{error}</div>
          )}

          {/* Email-not-verified inline prompt */}
          {unverifiedEmail && (
            <div style={{ background:"rgba(74, 85, 115,0.07)", border:"1px solid rgba(74, 85, 115,0.22)", borderRadius:8, padding:"12px 14px", marginBottom:14, fontSize:12, color:"#4A5573" }}>
              {resendSent
                ? "New link sent — check your inbox (or API logs in dev)."
                : <>
                    Haven&apos;t received it?{" "}
                    <span onClick={handleResendFromSignIn} style={{ fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>Resend verification email</span>
                  </>
              }
            </div>
          )}

          {tab === "signin" && (
            <>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#4A5573", display:"block", marginBottom:5, letterSpacing:0.5 }}>EMAIL ADDRESS</label>
                <FieldInput value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" />
              </div>

              {/* OTP-login toggle — appears when email is typed and the server has the dev feature on */}
              {otpEnabled && email && (
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
                  <button onClick={()=>{ setOtpMode(m=>!m); setError(""); setOtpSent(""); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, fontWeight:700, color:"#4A5573", fontFamily:"Poppins,sans-serif" }}>
                    {otpMode ? "← Use password" : "Login with OTP →"}
                  </button>
                </div>
              )}

              {!otpMode ? (
                <>
                  <div style={{ marginBottom:16 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:"#4A5573", display:"block", marginBottom:5, letterSpacing:0.5 }}>PASSWORD</label>
                    <FieldInput type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e => e.key==="Enter" && handleSignIn()} placeholder="••••••••" />
                  </div>
                  <PrimaryButton loading={loading} onClick={handleSignIn}>
                    {loading ? "Signing In…" : "Sign In →"}
                  </PrimaryButton>
                </>
              ) : (
                <>
                  <div style={{ marginBottom:8 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:"#4A5573", display:"block", marginBottom:5, letterSpacing:0.5 }}>ONE-TIME CODE</label>
                    <div style={{ display:"flex", gap:8 }}>
                      <FieldInput value={otp} onChange={e=>setOtp(e.target.value)} onKeyDown={e => e.key==="Enter" && handleOtpSignIn()} placeholder="Enter OTP" inputMode="numeric" style={{ flex:1, letterSpacing:2 }} />
                      <SecondaryButton onClick={handleSendOtp}>Send OTP</SecondaryButton>
                    </div>
                  </div>
                  {otpSent && <div style={{ fontSize:11, color:"#22c55e", marginBottom:8 }}>{otpSent}</div>}
                  <PrimaryButton loading={loading} onClick={handleOtpSignIn}>
                    {loading ? "Verifying…" : "Sign In with OTP →"}
                  </PrimaryButton>
                </>
              )}

              <div style={{ textAlign:"center", fontSize:11, color:"#4A5573" }}>
                No account?{" "}
                <span onClick={()=>switchTab("signup")} style={{ color:"#C8A860", cursor:"pointer", fontWeight:600 }}>Create one →</span>
              </div>
            </>
          )}

          {tab === "signup" && (
            <>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#4A5573", display:"block", marginBottom:5, letterSpacing:0.5 }}>FULL NAME</label>
                <FieldInput value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#4A5573", display:"block", marginBottom:5, letterSpacing:0.5 }}>WORK EMAIL</label>
                <FieldInput value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#4A5573", display:"block", marginBottom:5, letterSpacing:0.5 }}>PASSWORD</label>
                <FieldInput type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Min. 6 characters" />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#4A5573", display:"block", marginBottom:8, letterSpacing:0.5 }}>I AM A</label>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[
                    { key:"participant",    label:"Participant",    desc:"Learner",       color:"#C8A860", abbr:"P" },
                    { key:"programManager", label:"Business Admin", desc:"Manages programs", color:"#182848", abbr:"BA" },
                  ].map(p => (
                    <RoleOption key={p.key} selected={role===p.key} color={p.color} onClick={()=>setRole(p.key)} abbr={p.abbr} label={p.label} desc={p.desc} />
                  ))}
                </div>
              </div>
              <PrimaryButton loading={loading} onClick={handleSignUp}>
                {loading ? "Creating Account…" : "Create Account →"}
              </PrimaryButton>
              <div style={{ textAlign:"center", fontSize:11, color:"#4A5573" }}>
                Already have an account?{" "}
                <span onClick={()=>switchTab("signin")} style={{ color:"#C8A860", cursor:"pointer", fontWeight:600 }}>Sign In</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
