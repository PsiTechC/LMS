"use client";

import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "@/lib/auth-context";

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
        style={{ position:"fixed", inset:0, background:"rgba(28,37,81,0.58)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Poppins,sans-serif" }}
      >
        <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:440, overflow:"hidden", boxShadow:"0 24px 64px rgba(28,37,81,0.28)" }}>
          {/* Gradient header */}
          <div style={{ background:"linear-gradient(135deg,#1C2551,#2d3a7c)", padding:"24px 32px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, background:"rgba(239,78,36,0.15)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"#EF4E24", fontWeight:800, fontSize:13 }}>XA</div>
              <div>
                <div style={{ color:"#fff", fontWeight:700, fontSize:13 }}>XA LMS</div>
                <div style={{ color:"rgba(255,255,255,0.4)", fontSize:9, letterSpacing:1 }}>BY EXECUTIVE ACCELERATION</div>
              </div>
            </div>
            <button onClick={onClose} style={{ width:28, height:28, border:"1px solid rgba(255,255,255,0.2)", borderRadius:"50%", background:"transparent", cursor:"pointer", color:"rgba(255,255,255,0.7)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>

          <div style={{ padding:"32px 32px 28px", textAlign:"center" }}>
            <div style={{ width:56, height:56, background:"rgba(34,197,94,0.1)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px", fontSize:26, color:"#22c55e" }}>✉</div>
            <div style={{ fontSize:17, fontWeight:700, color:"#1C2551", marginBottom:10 }}>Check your inbox</div>
            <div style={{ fontSize:13, color:"#8b90a7", lineHeight:1.7, marginBottom:22 }}>
              We sent a verification link to<br />
              <strong style={{ color:"#1C2551" }}>{signedUpEmail}</strong>.<br /><br />
              Click the link in the email to activate your account. The link expires in 24 hours.
            </div>
            <div style={{ padding:"12px 16px", background:"rgba(239,78,36,0.05)", border:"1px solid rgba(239,78,36,0.15)", borderRadius:10, fontSize:12, color:"#EF4E24", marginBottom:22, lineHeight:1.6 }}>
              No SMTP configured in dev? The link is printed in the API server logs.
            </div>
            <button
              onClick={() => { setSignedUpEmail(null); switchTab("signin"); setEmail(signedUpEmail); }}
              style={{ width:"100%", padding:"11px", background:"#1C2551", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}
            >Go to Sign In</button>
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
      style={{ position:"fixed", inset:0, background:"rgba(28,37,81,0.58)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Poppins,sans-serif" }}
    >
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:440, overflow:"hidden", boxShadow:"0 24px 64px rgba(28,37,81,0.28)" }}>
        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#1C2551,#2d3a7c)", padding:"20px 32px 0", position:"relative" }}>
          <button onClick={onClose} style={{ position:"absolute", top:14, right:16, width:28, height:28, border:"1px solid rgba(255,255,255,0.2)", borderRadius:"50%", background:"transparent", cursor:"pointer", color:"rgba(255,255,255,0.7)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Poppins,sans-serif" }}>✕</button>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <div style={{ width:32, height:32, background:"rgba(239,78,36,0.15)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"#EF4E24", fontWeight:800, fontSize:13 }}>XA</div>
            <div>
              <div style={{ color:"#fff", fontWeight:700, fontSize:13 }}>XA LMS</div>
              <div style={{ color:"rgba(255,255,255,0.4)", fontSize:9, letterSpacing:1 }}>BY EXECUTIVE ACCELERATION</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:0 }}>
            {([ ["signin","Sign In"], ["signup","Create Account"] ] as const).map(([key, label]) => (
              <button key={key} onClick={() => switchTab(key)} style={{ flex:1, padding:"9px 0", border:"none", background:"transparent", cursor:"pointer", fontSize:12, fontWeight:tab===key?700:400, color:tab===key?"#fff":"rgba(255,255,255,0.45)", borderBottom:tab===key?"2.5px solid #EF4E24":"2.5px solid transparent", fontFamily:"Poppins,sans-serif" }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding:"20px 32px 24px" }}>
          {error && (
            <div style={{ background:"rgba(239,78,36,0.06)", border:"1px solid rgba(239,78,36,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#EF4E24", fontWeight:600 }}>{error}</div>
          )}

          {/* Email-not-verified inline prompt */}
          {unverifiedEmail && (
            <div style={{ background:"rgba(107,115,191,0.07)", border:"1px solid rgba(107,115,191,0.22)", borderRadius:8, padding:"12px 14px", marginBottom:14, fontSize:12, color:"#6B73BF" }}>
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
                <label style={{ fontSize:10, fontWeight:700, color:"#8b90a7", display:"block", marginBottom:5, letterSpacing:0.5 }}>EMAIL ADDRESS</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" style={{ width:"100%", border:"1px solid #EAECF4", borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#1C2551", outline:"none", boxSizing:"border-box" }} />
              </div>

              {/* OTP-login toggle — appears when email is typed and the server has the dev feature on */}
              {otpEnabled && email && (
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
                  <button onClick={()=>{ setOtpMode(m=>!m); setError(""); setOtpSent(""); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, fontWeight:700, color:"#6B73BF", fontFamily:"Poppins,sans-serif" }}>
                    {otpMode ? "← Use password" : "Login with OTP →"}
                  </button>
                </div>
              )}

              {!otpMode ? (
                <>
                  <div style={{ marginBottom:16 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:"#8b90a7", display:"block", marginBottom:5, letterSpacing:0.5 }}>PASSWORD</label>
                    <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e => e.key==="Enter" && handleSignIn()} placeholder="••••••••" style={{ width:"100%", border:"1px solid #EAECF4", borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#1C2551", outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <button onClick={handleSignIn} disabled={loading} style={{ width:"100%", padding:"11px", background:loading?"#D0D3E0":"#EF4E24", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:loading?"not-allowed":"pointer", fontFamily:"Poppins,sans-serif", marginBottom:12 }}>
                    {loading ? "Signing In…" : "Sign In →"}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ marginBottom:8 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:"#8b90a7", display:"block", marginBottom:5, letterSpacing:0.5 }}>ONE-TIME CODE</label>
                    <div style={{ display:"flex", gap:8 }}>
                      <input value={otp} onChange={e=>setOtp(e.target.value)} onKeyDown={e => e.key==="Enter" && handleOtpSignIn()} placeholder="Enter OTP" inputMode="numeric" style={{ flex:1, border:"1px solid #EAECF4", borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#1C2551", outline:"none", boxSizing:"border-box", letterSpacing:2 }} />
                      <button onClick={handleSendOtp} style={{ border:"1px solid #EAECF4", borderRadius:8, background:"#F5F7FB", cursor:"pointer", fontSize:12, fontWeight:700, color:"#1C2551", fontFamily:"Poppins,sans-serif", padding:"0 14px", whiteSpace:"nowrap" }}>Send OTP</button>
                    </div>
                  </div>
                  {otpSent && <div style={{ fontSize:11, color:"#22c55e", marginBottom:8 }}>{otpSent}</div>}
                  <button onClick={handleOtpSignIn} disabled={loading} style={{ width:"100%", padding:"11px", background:loading?"#D0D3E0":"#EF4E24", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:loading?"not-allowed":"pointer", fontFamily:"Poppins,sans-serif", marginBottom:12 }}>
                    {loading ? "Verifying…" : "Sign In with OTP →"}
                  </button>
                </>
              )}

              <div style={{ textAlign:"center", fontSize:11, color:"#8b90a7" }}>
                No account?{" "}
                <span onClick={()=>switchTab("signup")} style={{ color:"#EF4E24", cursor:"pointer", fontWeight:600 }}>Create one →</span>
              </div>
            </>
          )}

          {tab === "signup" && (
            <>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#8b90a7", display:"block", marginBottom:5, letterSpacing:0.5 }}>FULL NAME</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={{ width:"100%", border:"1px solid #EAECF4", borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#1C2551", outline:"none", boxSizing:"border-box" }} />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#8b90a7", display:"block", marginBottom:5, letterSpacing:0.5 }}>WORK EMAIL</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" style={{ width:"100%", border:"1px solid #EAECF4", borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#1C2551", outline:"none", boxSizing:"border-box" }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#8b90a7", display:"block", marginBottom:5, letterSpacing:0.5 }}>PASSWORD</label>
                <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Min. 6 characters" style={{ width:"100%", border:"1px solid #EAECF4", borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#1C2551", outline:"none", boxSizing:"border-box" }} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#8b90a7", display:"block", marginBottom:8, letterSpacing:0.5 }}>I AM A</label>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[
                    { key:"participant",    label:"Participant",    desc:"Learner",       color:"#EF4E24", abbr:"P" },
                    { key:"programManager", label:"Business Admin", desc:"Manages programs", color:"#1C2551", abbr:"BA" },
                  ].map(p => (
                    <button key={p.key} onClick={()=>setRole(p.key)} style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:4, padding:"10px 14px", border:"1.5px solid "+(role===p.key?p.color:"#EAECF4"), borderRadius:10, background:role===p.key?p.color+"10":"#fff", cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:22, height:22, borderRadius:"50%", background:role===p.key?p.color:"#D0D3E0", color:"#fff", fontWeight:800, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{p.abbr}</div>
                        <span style={{ fontSize:12, fontWeight:role===p.key?700:500, color:role===p.key?p.color:"#1C2551" }}>{p.label}</span>
                      </div>
                      <span style={{ fontSize:10, color:"#8b90a7", paddingLeft:30 }}>{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleSignUp} disabled={loading} style={{ width:"100%", padding:"11px", background:loading?"#D0D3E0":"#EF4E24", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:loading?"not-allowed":"pointer", fontFamily:"Poppins,sans-serif", marginBottom:12 }}>
                {loading ? "Creating Account…" : "Create Account →"}
              </button>
              <div style={{ textAlign:"center", fontSize:11, color:"#8b90a7" }}>
                Already have an account?{" "}
                <span onClick={()=>switchTab("signin")} style={{ color:"#EF4E24", cursor:"pointer", fontWeight:600 }}>Sign In</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
