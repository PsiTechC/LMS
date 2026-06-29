"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { useAuth } from "@/lib/auth-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FacultyMember { name: string; abbr: string; }

interface OpenProgram {
  id: string;
  title: string;
  tagline: string;
  category: string;
  university: string;
  format: string;
  level: string;
  cost: number;
  duration: string;
  durationWeeks: number;
  nextBatch: string;
  seatsLeft: number;
  enrolled: number;
  rating: number;
  reviews: number;
  color: string;
  facultyList: FacultyMember[];
  outcomes: string[];
}

// ─── Static program catalog (with rich metadata matching the HTML reference) ──

const OPEN_PROGRAMS: OpenProgram[] = [
  { id:"op1", title:"Leadership Accelerator", tagline:"Build the mindset & skills of a transformative leader", category:"Leadership", university:"ISB Hyderabad", format:"Hybrid", level:"Senior Manager", cost:85000, duration:"12 Weeks", durationWeeks:12, nextBatch:"Aug 4, 2026", seatsLeft:8, enrolled:248, rating:4.8, reviews:124, color:"#EF4E24",
    facultyList:[{name:"Prof. Kavita Rao",abbr:"KR"},{name:"Dr. Arun Mehta",abbr:"AM"}],
    outcomes:["Strategic decision-making","Executive presence","Change leadership","Stakeholder influence"],
  },
  { id:"op2", title:"Strategic Thinking for Leaders", tagline:"See the big picture. Make decisions that matter.", category:"Strategy", university:"IIM Ahmedabad", format:"Online Live", level:"Mid–Senior Manager", cost:55000, duration:"8 Weeks", durationWeeks:8, nextBatch:"Jul 14, 2026", seatsLeft:15, enrolled:312, rating:4.7, reviews:89, color:"#1C2551",
    facultyList:[{name:"Prof. Vikram Bose",abbr:"VB"},{name:"Dr. Nita Sharma",abbr:"NS"}],
    outcomes:["Strategic frameworks","Competitive analysis","Business case development","Scenario planning"],
  },
  { id:"op3", title:"Women in Leadership", tagline:"Designed for women leaders ready to own the room", category:"Leadership", university:"XLRI Jamshedpur", format:"Hybrid", level:"All Levels", cost:65000, duration:"10 Weeks", durationWeeks:10, nextBatch:"Sep 1, 2026", seatsLeft:4, enrolled:186, rating:4.9, reviews:97, color:"#6B73BF",
    facultyList:[{name:"Dr. Meera Krishnan",abbr:"MK"},{name:"Prof. Anita Das",abbr:"AD"}],
    outcomes:["Confidence & presence","Negotiation skills","Navigating bias","Building strategic networks"],
  },
  { id:"op4", title:"Executive Presence Masterclass", tagline:"Command the room. Inspire your team. Lead with conviction.", category:"Communication", university:"IIM Bangalore", format:"Online Live", level:"All Levels", cost:28000, duration:"4 Weeks", durationWeeks:4, nextBatch:"Jul 7, 2026", seatsLeft:22, enrolled:430, rating:4.6, reviews:215, color:"#EF4E24",
    facultyList:[{name:"Prof. Suresh Patel",abbr:"SP"}],
    outcomes:["Executive communication","Storytelling for impact","Presence under pressure","Board-level confidence"],
  },
  { id:"op5", title:"Finance for Non-Finance Leaders", tagline:"Speak the language of business. Drive financial outcomes.", category:"Finance", university:"IIM Calcutta", format:"Online Live", level:"Mid Manager", cost:38000, duration:"6 Weeks", durationWeeks:6, nextBatch:"Aug 18, 2026", seatsLeft:18, enrolled:275, rating:4.5, reviews:142, color:"#22c55e",
    facultyList:[{name:"Prof. Rajesh Kumar",abbr:"RK"},{name:"Dr. Aisha Kapoor",abbr:"AK"}],
    outcomes:["P&L understanding","Business case creation","Financial storytelling","Budget conversations"],
  },
  { id:"op6", title:"Digital Transformation Leader", tagline:"Lead your organization through the digital revolution", category:"Technology", university:"ISB Hyderabad", format:"Hybrid", level:"Senior Manager", cost:72000, duration:"10 Weeks", durationWeeks:10, nextBatch:"Sep 15, 2026", seatsLeft:12, enrolled:167, rating:4.7, reviews:73, color:"#1C2551",
    facultyList:[{name:"Prof. Deepak Rao",abbr:"DR"},{name:"Dr. Sunita Verma",abbr:"SV"}],
    outcomes:["Digital strategy","AI & ML literacy","Change management for tech","Data-driven leadership"],
  },
  { id:"op7", title:"High-Impact Communication", tagline:"Say less. Mean more. Influence at every level.", category:"Communication", university:"IIM Bangalore", format:"Online Live", level:"All Levels", cost:18000, duration:"3 Weeks", durationWeeks:3, nextBatch:"Jul 21, 2026", seatsLeft:30, enrolled:520, rating:4.4, reviews:268, color:"#6B73BF",
    facultyList:[{name:"Prof. Leena Shah",abbr:"LS"}],
    outcomes:["Clarity in communication","Influence without authority","Written communication","Virtual presence"],
  },
  { id:"op8", title:"Building Resilient Teams", tagline:"Create teams that thrive under pressure and uncertainty", category:"HR & People", university:"XLRI Jamshedpur", format:"Hybrid", level:"Manager–Senior Manager", cost:42000, duration:"6 Weeks", durationWeeks:6, nextBatch:"Aug 25, 2026", seatsLeft:9, enrolled:198, rating:4.8, reviews:91, color:"#EF4E24",
    facultyList:[{name:"Dr. Sanjay Kulkarni",abbr:"SK"},{name:"Prof. Radha Menon",abbr:"RM"}],
    outcomes:["Psychological safety","Team performance models","Conflict resolution","High-performance culture"],
  },
  { id:"op9", title:"Organizational Design & Change", tagline:"Architect organizations that adapt and endure", category:"HR & People", university:"IIM Bangalore", format:"Online Live", level:"Senior Manager–Director", cost:58000, duration:"8 Weeks", durationWeeks:8, nextBatch:"Oct 6, 2026", seatsLeft:20, enrolled:134, rating:4.6, reviews:54, color:"#6B73BF",
    facultyList:[{name:"Prof. Girish Mani",abbr:"GM"},{name:"Dr. Priya Verma",abbr:"PV"}],
    outcomes:["Org design principles","Change management","Culture shaping","Restructuring playbook"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCost(c: number): string {
  if (c >= 100000) return "₹" + (c / 100000).toFixed(1) + "L";
  return "₹" + (c / 1000).toFixed(0) + "K";
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ display:"inline-flex", gap:2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color:i<=Math.round(rating)?"#f59e0b":"#E0E3EF", fontSize:12 }}>★</span>
      ))}
    </span>
  );
}

// ─── Program Card ─────────────────────────────────────────────────────────────

function ProgramCard({ prog, wishlist, onWishlist }: { prog: OpenProgram; wishlist: string[]; onWishlist: (id: string) => void; }) {
  const isWishlisted = wishlist.includes(prog.id);
  return (
    <div style={{ background:"#fff", borderRadius:16, border:"1px solid #EAECF4", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 1px 6px rgba(28,37,81,0.07)" }}>
      <div style={{ height:4, background:prog.color }}></div>
      <div style={{ padding:"16px 18px 14px", flex:1, display:"flex", flexDirection:"column" }}>
        {/* Category + wishlist */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <span style={{ background:prog.color+"18", color:prog.color, fontSize:10, fontWeight:700, borderRadius:20, padding:"3px 10px" }}>{prog.category}</span>
            <span style={{ background:"#F5F7FB", color:"#8b90a7", fontSize:10, fontWeight:500, borderRadius:20, padding:"3px 10px" }}>{prog.format}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onWishlist(prog.id); }}
            style={{ width:30, height:30, borderRadius:"50%", border:"1.5px solid "+(isWishlisted?"#EF4E24":"#EAECF4"), background:isWishlisted?"rgba(239,78,36,0.06)":"#fff", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", color:isWishlisted?"#EF4E24":"#D0D3E0", flexShrink:0 }}
          >♥</button>
        </div>
        {/* Title + tagline */}
        <div style={{ fontSize:15, fontWeight:700, color:"#1C2551", marginBottom:4, lineHeight:1.3 }}>{prog.title}</div>
        <div style={{ fontSize:11, color:"#8b90a7", marginBottom:10, lineHeight:1.4 }}>{prog.tagline}</div>
        {/* University */}
        <div style={{ fontSize:11, color:"#6B73BF", fontWeight:600, marginBottom:6 }}>🎓 {prog.university}</div>
        {/* Faculty */}
        <div style={{ display:"flex", gap:4, marginBottom:12, flexWrap:"wrap" }}>
          {prog.facultyList.slice(0,2).map(f => (
            <span key={f.name} style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, color:"#8b90a7", background:"#F5F7FB", borderRadius:20, padding:"2px 8px" }}>
              <span style={{ width:14, height:14, borderRadius:"50%", background:"#1C2551", color:"#fff", fontSize:7, display:"inline-flex", alignItems:"center", justifyContent:"center", fontWeight:700, flexShrink:0 }}>{f.abbr}</span>
              {f.name}
            </span>
          ))}
        </div>
        {/* Outcomes */}
        <div style={{ flex:1, marginBottom:12 }}>
          {prog.outcomes.slice(0,3).map((o, i) => (
            <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:7, marginBottom:5 }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:prog.color, flexShrink:0, marginTop:5 }}></span>
              <span style={{ fontSize:11, color:"#4a5074", lineHeight:1.4 }}>{o}</span>
            </div>
          ))}
        </div>
        {/* Meta row */}
        <div style={{ display:"flex", gap:12, marginBottom:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:"#8b90a7" }}>⏱ {prog.duration}</span>
          <span style={{ fontSize:11, color:"#8b90a7" }}>📅 {prog.nextBatch}</span>
          <span style={{ fontSize:11, color:prog.seatsLeft<=5?"#EF4E24":"#8b90a7", fontWeight:prog.seatsLeft<=5?700:400 }}>🪑 {prog.seatsLeft} seats left</span>
        </div>
        {/* Rating */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
          <StarRating rating={prog.rating} />
          <span style={{ fontSize:12, fontWeight:700, color:"#1C2551" }}>{prog.rating}</span>
          <span style={{ fontSize:11, color:"#8b90a7" }}>({prog.reviews})</span>
        </div>
        {/* Price + CTA */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:"auto" }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:"#1C2551" }}>{formatCost(prog.cost)}</div>
            <div style={{ fontSize:10, color:"#8b90a7" }}>+ 18% GST</div>
          </div>
          <button style={{ padding:"8px 16px", background:"#EF4E24", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────

function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (role: string) => void; }) {
  const { login, register } = useAuth();
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
  if (signedUpEmail) {
    return (
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
      </div>
    );
  }

  return (
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
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#8b90a7", display:"block", marginBottom:5, letterSpacing:0.5 }}>PASSWORD</label>
                <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e => e.key==="Enter" && handleSignIn()} placeholder="••••••••" style={{ width:"100%", border:"1px solid #EAECF4", borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#1C2551", outline:"none", boxSizing:"border-box" }} />
              </div>
              <button onClick={handleSignIn} disabled={loading} style={{ width:"100%", padding:"11px", background:loading?"#D0D3E0":"#EF4E24", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:loading?"not-allowed":"pointer", fontFamily:"Poppins,sans-serif", marginBottom:12 }}>
                {loading ? "Signing In…" : "Sign In →"}
              </button>
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
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

const CATS = ["All","Leadership","Strategy","Communication","Finance","Technology","HR & People"];

export default function LandingPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [filters, setFilters] = useState({ university:"All", format:"All", duration:"All", cost:"All" });
  const [sort, setSort] = useState("popular");
  const [authOpen, setAuthOpen] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    try { setWishlist(JSON.parse(localStorage.getItem("xa_wishlist") || "[]")); } catch {}

    let cancelled = false;
    programsApi.listPublic().then(res => {
      if (!cancelled && res.data) setLiveCount(res.data.length);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function toggleWishlist(id: string) {
    setWishlist(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem("xa_wishlist", JSON.stringify(next));
      return next;
    });
  }

  function setFilter(key: string, val: string) {
    setFilters(prev => ({ ...prev, [key]: val }));
  }

  const anyFilter = category !== "All" || Object.values(filters).some(v => v !== "All") || search;

  const filtered = OPEN_PROGRAMS.filter(p => {
    if (search && ![p.title, p.category, p.university, p.tagline].join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== "All" && p.category !== category) return false;
    if (filters.university !== "All" && p.university !== filters.university) return false;
    if (filters.format !== "All" && p.format !== filters.format) return false;
    if (filters.duration !== "All") {
      if (filters.duration === "Under 4 Weeks" && p.durationWeeks >= 4) return false;
      if (filters.duration === "4–8 Weeks" && (p.durationWeeks < 4 || p.durationWeeks > 8)) return false;
      if (filters.duration === "8+ Weeks" && p.durationWeeks <= 8) return false;
    }
    if (filters.cost !== "All") {
      if (filters.cost === "Under ₹25K" && p.cost >= 25000) return false;
      if (filters.cost === "₹25K–₹50K" && (p.cost < 25000 || p.cost >= 50000)) return false;
      if (filters.cost === "₹50K–₹75K" && (p.cost < 50000 || p.cost >= 75000)) return false;
      if (filters.cost === "₹75K+" && p.cost < 75000) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sort === "popular") return b.enrolled - a.enrolled;
    if (sort === "rating") return b.rating - a.rating;
    if (sort === "price-low") return a.cost - b.cost;
    if (sort === "price-high") return b.cost - a.cost;
    return 0;
  });

  function handleAuthSuccess(role: string) {
    setAuthOpen(false);
    const roleMap: Record<string, string> = {
      superadmin: "/dashboard/superadmin",
      program_manager: "/dashboard/program-manager",
      faculty: "/dashboard/faculty",
      participant: "/dashboard/participant",
    };
    router.push(roleMap[role] || "/dashboard/participant");
  }

  return (
    <div style={{ minHeight:"100vh", background:"#F5F7FB", fontFamily:"Poppins,sans-serif" }}>

      {/* ── Sticky Header ── */}
      <header style={{ position:"sticky", top:0, zIndex:200, background:"#fff", borderBottom:"1px solid #EAECF4", boxShadow:"0 2px 12px rgba(28,37,81,0.06)" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", alignItems:"center", padding:"0 16px", height:64, gap:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <div style={{ width:34, height:34, background:"rgba(239,78,36,0.1)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", color:"#EF4E24", fontWeight:800, fontSize:14 }}>XA</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1C2551", lineHeight:1.2 }}>XA LMS</div>
              <div style={{ fontSize:9, color:"#8b90a7", letterSpacing:1 }}>OPEN PROGRAMS</div>
            </div>
          </div>
          <nav style={{ display:"flex", gap:22, flex:1 }}>
            {["Programs","For Organizations","About","Alumni Network"].map(item => (
              <a key={item} href="#" onClick={e=>e.preventDefault()} style={{ fontSize:13, color:"#8b90a7", fontWeight:500, textDecoration:"none" }}>{item}</a>
            ))}
          </nav>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            {wishlist.length > 0 && (
              <button style={{ position:"relative", display:"flex", alignItems:"center", gap:6, padding:"7px 14px", border:"1px solid #EAECF4", borderRadius:22, background:"#fff", cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>
                <span style={{ color:"#EF4E24", fontSize:14 }}>♥</span>
                <span style={{ fontSize:12, color:"#1C2551", fontWeight:600 }}>Wishlist</span>
                <span style={{ position:"absolute", top:-5, right:-5, width:16, height:16, background:"#EF4E24", borderRadius:"50%", color:"#fff", fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>{wishlist.length}</span>
              </button>
            )}
            <button onClick={() => setAuthOpen(true)} style={{ padding:"9px 20px", background:"#1C2551", border:"none", borderRadius:22, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Poppins,sans-serif", whiteSpace:"nowrap" }}>
              Login / Sign Up
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div style={{ background:"linear-gradient(135deg,#0f1635 0%,#1C2551 55%,#0f1635 100%)", padding:"60px 24px 52px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 72% 50%,rgba(239,78,36,0.15) 0%,transparent 62%)" }}></div>
        <div style={{ maxWidth:1200, margin:"0 auto", position:"relative" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:7, background:"rgba(239,78,36,0.15)", border:"1px solid rgba(239,78,36,0.35)", borderRadius:20, padding:"4px 14px", marginBottom:20 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#EF4E24", display:"inline-block" }}></span>
            <span style={{ fontSize:11, color:"#EF4E24", fontWeight:700, letterSpacing:0.5 }}>OPEN ENROLLMENT · BATCH 2026</span>
          </div>
          <div style={{ fontSize:46, fontWeight:800, color:"#fff", marginBottom:14, lineHeight:1.15, maxWidth:640 }}>
            Transform Your<br /><span style={{ color:"#EF4E24" }}>Leadership Journey</span>
          </div>
          <div style={{ fontSize:15, color:"rgba(255,255,255,0.6)", marginBottom:30, maxWidth:520, lineHeight:1.65 }}>
            World-class open programs from IIMs, ISB &amp; XLRI. Join 10,000+ leaders who have elevated their careers with Executive Acceleration.
          </div>
          {/* Search bar */}
          <div style={{ display:"flex", gap:0, maxWidth:540, background:"#fff", borderRadius:12, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.25)", marginBottom:36 }}>
            <span style={{ display:"flex", alignItems:"center", paddingLeft:16, color:"#8b90a7", fontSize:16, flexShrink:0 }}>🔍</span>
            <input
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search programs, topics, universities…"
              style={{ flex:1, border:"none", padding:"14px 16px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#1C2551", outline:"none" }}
            />
            {search && <button onClick={()=>setSearch("")} style={{ padding:"0 12px", background:"transparent", border:"none", cursor:"pointer", color:"#8b90a7", fontSize:16 }}>✕</button>}
            <button style={{ padding:"0 24px", background:"#EF4E24", border:"none", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"Poppins,sans-serif", flexShrink:0 }}>Search</button>
          </div>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,auto)", gap:"0 36px" }}>
            {[["50+","Open Programs"],["200+","Expert Faculty"],["10K+","Alumni Network"],["15+","Partner Institutions"]].map(([val,label]) => (
              <div key={label}>
                <div style={{ fontSize:24, fontWeight:800, color:"#EF4E24" }}>{val}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Category Pills ── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #EAECF4", position:"sticky", top:64, zIndex:150 }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 16px" }}>
          <div style={{ display:"flex", gap:8, overflowX:"auto", padding:"12px 0" }}>
            {CATS.map(cat => (
              <button key={cat} onClick={()=>setCategory(cat)} style={{ flexShrink:0, padding:"7px 18px", border:"1.5px solid "+(category===cat?"#EF4E24":"#EAECF4"), borderRadius:20, background:category===cat?"rgba(239,78,36,0.08)":"#fff", color:category===cat?"#EF4E24":"#8b90a7", fontSize:12, fontWeight:category===cat?700:500, cursor:"pointer", fontFamily:"Poppins,sans-serif", whiteSpace:"nowrap" }}>{cat}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ background:"#F5F7FB", borderBottom:"1px solid #EAECF4" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"10px 16px", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          {([
            ["university","University",["All","IIM Ahmedabad","IIM Bangalore","IIM Calcutta","ISB Hyderabad","XLRI Jamshedpur"]],
            ["format","Format",["All","Online Live","Hybrid","In-Person"]],
            ["duration","Duration",["All","Under 4 Weeks","4–8 Weeks","8+ Weeks"]],
            ["cost","Cost",["All","Under ₹25K","₹25K–₹50K","₹50K–₹75K","₹75K+"]],
          ] as [string,string,string[]][]).map(([key,label,opts]) => {
            const val = filters[key as keyof typeof filters];
            return (
              <div key={key} style={{ position:"relative" }}>
                <select value={val} onChange={e=>setFilter(key,e.target.value)} style={{ appearance:"none", background:"#fff", border:"1.5px solid "+(val!=="All"?"#EF4E24":"#EAECF4"), borderRadius:8, padding:"7px 28px 7px 12px", fontSize:12, fontFamily:"Poppins,sans-serif", color:val!=="All"?"#EF4E24":"#8b90a7", cursor:"pointer", fontWeight:val!=="All"?700:400, outline:"none" }}>
                  {opts.map(o => <option key={o} value={o}>{o==="All"?label+": All":o}</option>)}
                </select>
                <span style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", fontSize:9, color:"#8b90a7" }}>▼</span>
              </div>
            );
          })}
          {anyFilter && (
            <button onClick={()=>{setFilters({university:"All",format:"All",duration:"All",cost:"All"});setCategory("All");setSearch("");}} style={{ padding:"7px 14px", border:"1.5px solid #EF4E24", borderRadius:8, background:"rgba(239,78,36,0.06)", color:"#EF4E24", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>Clear All ✕</button>
          )}
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:12, color:"#8b90a7" }}>Sort:</span>
            <div style={{ position:"relative" }}>
              <select value={sort} onChange={e=>setSort(e.target.value)} style={{ appearance:"none", background:"#fff", border:"1.5px solid #EAECF4", borderRadius:8, padding:"7px 24px 7px 10px", fontSize:12, fontFamily:"Poppins,sans-serif", color:"#1C2551", cursor:"pointer", outline:"none" }}>
                <option value="popular">Most Popular</option>
                <option value="rating">Highest Rated</option>
                <option value="price-low">Price: Low → High</option>
                <option value="price-high">Price: High → Low</option>
              </select>
              <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", fontSize:9, color:"#8b90a7" }}>▼</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results header ── */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"14px 16px 0" }}>
        <div style={{ fontSize:13, color:"#8b90a7" }}>
          <strong style={{ color:"#1C2551" }}>{filtered.length}</strong> program{filtered.length!==1?"s":""} found
          {liveCount > 0 && <span style={{ marginLeft:8, color:"#22c55e", fontSize:11, fontWeight:600 }}>· {liveCount} live on your platform</span>}
        </div>
      </div>

      {/* ── Program Grid ── */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"14px 16px 56px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"72px 20px", background:"#fff", borderRadius:16, border:"1px solid #EAECF4" }}>
            <div style={{ fontSize:40, marginBottom:14, opacity:0.35 }}>🔍</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#1C2551", marginBottom:6 }}>No programs match your filters</div>
            <div style={{ fontSize:13, color:"#8b90a7", marginBottom:20 }}>Try adjusting your search or clearing the filters</div>
            <button onClick={()=>{setFilters({university:"All",format:"All",duration:"All",cost:"All"});setCategory("All");setSearch("");}} style={{ padding:"10px 24px", background:"#EF4E24", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>Clear All Filters</button>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
            {filtered.map(prog => (
              <ProgramCard key={prog.id} prog={prog} wishlist={wishlist} onWishlist={toggleWishlist} />
            ))}
          </div>
        )}
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />}
    </div>
  );
}
