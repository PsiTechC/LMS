"use client";

import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useRouter } from "next/navigation";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { programsApi, ProgramDTO, isPaypalOrder } from "@/lib/programs-api";
import { useAuth } from "@/lib/auth-context";
import { loadRazorpayScript } from "@/lib/razorpay";
import SiteHeader from "@/components/layout/SiteHeader";
import AuthModal from "@/components/layout/AuthModal";

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
  paymentRequired: boolean;
  currency: string;
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

// ─── Map real API programs → landing-card shape ───────────────────────────────
// Fields the API doesn't carry (rating, university, faculty, cost) degrade to
// sensible defaults so the marketplace card still renders cleanly.

function apiProgramToCard(p: ProgramDTO): OpenProgram {
  const weeks = p.duration_weeks || 0;
  return {
    id: p.id,
    title: p.title,
    tagline: p.description || "Open enrollment program",
    category: "Leadership",
    university: "Executive Acceleration",
    format: "Online Live",
    level: "All Levels",
    cost: p.payment_required ? p.price_amount / 100 : 0,
    paymentRequired: p.payment_required,
    currency: p.currency || "INR",
    duration: weeks ? `${weeks} Weeks` : "Self-paced",
    durationWeeks: weeks,
    nextBatch: p.start_date ? new Date(p.start_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Rolling",
    seatsLeft: 0,
    enrolled: p.enrolled_count || 0,
    rating: 0,
    reviews: 0,
    color: p.color || "#C8A860",
    facultyList: [],
    outcomes: [],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Pre-existing bug fixed alongside PayPal work: this always showed "₹"
// regardless of currency — harmless while every program was INR-only
// (Razorpay-only), but actively misleading once non-INR/PayPal programs
// exist (a USD payer seeing "Pay ₹19.99" mid-checkout is a real trust
// problem, not cosmetic).
const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
function formatCost(c: number, currency: string = "INR"): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency + " ";
  if (currency === "INR") {
    if (c >= 100000) return symbol + (c / 100000).toFixed(1) + "L";
    if (c >= 1000) return symbol + (c / 1000).toFixed(0) + "K";
    return symbol + c.toLocaleString("en-IN");
  }
  return symbol + c.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function ProgramCard({ prog, wishlist, onWishlist, onEnroll }: { prog: OpenProgram; wishlist: string[]; onWishlist: (id: string) => void; onEnroll: (prog: OpenProgram) => void; }) {
  const isWishlisted = wishlist.includes(prog.id);
  return (
    <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E6DED0", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 1px 6px rgba(24, 40, 72,0.07)" }}>
      <div style={{ height:4, background:prog.color }}></div>
      <div style={{ padding:"16px 18px 14px", flex:1, display:"flex", flexDirection:"column" }}>
        {/* Category + wishlist */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <span style={{ background:prog.color+"18", color:prog.color, fontSize:10, fontWeight:700, borderRadius:20, padding:"3px 10px" }}>{prog.category}</span>
            <span style={{ background:"#F7F5F0", color:"#4A5573", fontSize:10, fontWeight:500, borderRadius:20, padding:"3px 10px" }}>{prog.format}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onWishlist(prog.id); }}
            style={{ width:30, height:30, borderRadius:"50%", border:"1.5px solid "+(isWishlisted?"#C8A860":"#E6DED0"), background:isWishlisted?"rgba(200, 168, 96,0.06)":"#fff", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", color:isWishlisted?"#C8A860":"#C9BFA8", flexShrink:0 }}
          >♥</button>
        </div>
        {/* Title + tagline */}
        <div style={{ fontSize:15, fontWeight:700, color:"#182848", marginBottom:4, lineHeight:1.3 }}>{prog.title}</div>
        <div style={{ fontSize:11, color:"#4A5573", marginBottom:10, lineHeight:1.4 }}>{prog.tagline}</div>
        {/* University */}
        <div style={{ fontSize:11, color:"#4A5573", fontWeight:600, marginBottom:6 }}>🎓 {prog.university}</div>
        {/* Faculty */}
        <div style={{ display:"flex", gap:4, marginBottom:12, flexWrap:"wrap" }}>
          {prog.facultyList.slice(0,2).map(f => (
            <span key={f.name} style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, color:"#4A5573", background:"#F7F5F0", borderRadius:20, padding:"2px 8px" }}>
              <span style={{ width:14, height:14, borderRadius:"50%", background:"#182848", color:"#fff", fontSize:7, display:"inline-flex", alignItems:"center", justifyContent:"center", fontWeight:700, flexShrink:0 }}>{f.abbr}</span>
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
          <span style={{ fontSize:11, color:"#4A5573" }}>⏱ {prog.duration}</span>
          <span style={{ fontSize:11, color:"#4A5573" }}>📅 {prog.nextBatch}</span>
          <span style={{ fontSize:11, color:prog.seatsLeft<=5?"#C8A860":"#4A5573", fontWeight:prog.seatsLeft<=5?700:400 }}>🪑 {prog.seatsLeft} seats left</span>
        </div>
        {/* Rating */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
          <StarRating rating={prog.rating} />
          <span style={{ fontSize:12, fontWeight:700, color:"#182848" }}>{prog.rating}</span>
          <span style={{ fontSize:11, color:"#4A5573" }}>({prog.reviews})</span>
        </div>
        {/* Price + CTA */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:"auto" }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:"#182848" }}>{prog.cost > 0 ? formatCost(prog.cost, prog.currency) : "Free"}</div>
            {prog.cost > 0 && <div style={{ fontSize:10, color:"#4A5573" }}>+ 18% GST</div>}
          </div>
          <button onClick={() => onEnroll(prog)} style={{ padding:"8px 16px", background:"#C8A860", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>
            Enroll →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

const CATS = ["All","Leadership","Strategy","Communication","Finance","Technology","HR & People"];

export default function OpenProgramsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [filters, setFilters] = useState({ university:"All", format:"All", duration:"All", cost:"All" });
  const [sort, setSort] = useState("popular");
  const [authOpen, setAuthOpen] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [openPrograms, setOpenPrograms] = useState<OpenProgram[]>([]);
  // Enroll flow: the program the visitor is enrolling into (null = closed).
  const [enrollTarget, setEnrollTarget] = useState<OpenProgram | null>(null);
  // When a not-logged-in user clicks Enroll, we open Auth first, then resume.
  const [pendingEnroll, setPendingEnroll] = useState<OpenProgram | null>(null);

  useEffect(() => {
    try { setWishlist(JSON.parse(localStorage.getItem("xa_wishlist") || "[]")); } catch {}

    let cancelled = false;
    programsApi.listPublic().then(res => {
      if (!cancelled && res.data) setOpenPrograms(res.data.map(apiProgramToCard));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const liveCount = openPrograms.length;

  const uniqueUniversities = Array.from(new Set(openPrograms.map(p => p.university))).filter(Boolean).sort();
  const uniqueFormats = Array.from(new Set(openPrograms.map(p => p.format))).filter(Boolean).sort();
  const universityOpts = ["All", ...uniqueUniversities];
  const formatOpts = ["All", ...uniqueFormats];

  function handleEnrollClick(prog: OpenProgram) {
    if (!user) { setPendingEnroll(prog); setAuthOpen(true); return; }
    setEnrollTarget(prog);
  }

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

  const filtered = openPrograms.filter(p => {
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
    // If the user clicked Enroll before logging in, resume the enroll flow on the
    // same landing page instead of bouncing to the dashboard.
    if (pendingEnroll) {
      const target = pendingEnroll;
      setPendingEnroll(null);
      setEnrollTarget(target);
      return;
    }
    const roleMap: Record<string, string> = {
      superadmin: "/dashboard/superadmin",
      superadmin_secondary: "/dashboard/superadmin",
      program_manager: "/dashboard/program-manager",
      faculty: "/dashboard/faculty",
      coach: "/dashboard/coach",
      participant: "/dashboard/participant",
      participant_retailer: "/dashboard/participant",
    };
    router.push(roleMap[role] || "/dashboard/participant");
  }

  return (
    <div style={{ minHeight:"100vh", background:"#F7F5F0", fontFamily:"Poppins,sans-serif" }}>

      {/* ── Sticky Header ── */}
      <SiteHeader onAuthOpen={() => setAuthOpen(true)} wishlistCount={wishlist.length} />

      {/* ── Hero ── */}
      <div style={{ background:"linear-gradient(135deg,#0f1635 0%,#182848 55%,#0f1635 100%)", padding:"60px 24px 52px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 72% 50%,rgba(200, 168, 96,0.15) 0%,transparent 62%)" }}></div>
        <div style={{ maxWidth:1200, margin:"0 auto", position:"relative" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:7, background:"rgba(200, 168, 96,0.15)", border:"1px solid rgba(200, 168, 96,0.35)", borderRadius:20, padding:"4px 14px", marginBottom:20 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#C8A860", display:"inline-block" }}></span>
            <span style={{ fontSize:11, color:"#C8A860", fontWeight:700, letterSpacing:0.5 }}>OPEN ENROLLMENT · BATCH 2026</span>
          </div>
          <div style={{ fontSize:"clamp(30px, 7vw, 46px)", fontWeight:800, color:"#fff", marginBottom:14, lineHeight:1.15, maxWidth:640 }}>
            Transform Your<br /><span style={{ color:"#C8A860" }}>Leadership Journey</span>
          </div>
          <div style={{ fontSize:15, color:"rgba(255,255,255,0.6)", marginBottom:30, maxWidth:520, lineHeight:1.65 }}>
            World-class open programs from IIMs, ISB &amp; XLRI. Join 10,000+ leaders who have elevated their careers with Executive Acceleration.
          </div>
          {/* Search bar */}
          <div style={{ display:"flex", gap:0, maxWidth:540, background:"#fff", borderRadius:12, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.25)", marginBottom:36 }}>
            <span style={{ display:"flex", alignItems:"center", paddingLeft:16, color:"#4A5573", fontSize:16, flexShrink:0 }}>🔍</span>
            <input
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search programs, topics, universities…"
              style={{ flex:1, border:"none", padding:"14px 16px", fontSize:13, fontFamily:"Poppins,sans-serif", color:"#182848", outline:"none" }}
              suppressHydrationWarning
            />
            {search && <button onClick={()=>setSearch("")} style={{ padding:"0 12px", background:"transparent", border:"none", cursor:"pointer", color:"#4A5573", fontSize:16 }}>✕</button>}
            <button style={{ padding:"0 24px", background:"#C8A860", border:"none", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"Poppins,sans-serif", flexShrink:0 }}>Search</button>
          </div>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(110px, auto))", gap:"18px 36px" }}>
            {[["50+","Open Programs"],["200+","Expert Faculty"],["10K+","Alumni Network"],["15+","Partner Institutions"]].map(([val,label]) => (
              <div key={label}>
                <div style={{ fontSize:24, fontWeight:800, color:"#C8A860" }}>{val}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Category Pills ── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E6DED0", position:"sticky", top:64, zIndex:150 }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 16px" }}>
          <div style={{ display:"flex", gap:8, overflowX:"auto", padding:"12px 0" }}>
            {CATS.map(cat => (
              <button key={cat} onClick={()=>setCategory(cat)} style={{ flexShrink:0, padding:"7px 18px", border:"1.5px solid "+(category===cat?"#C8A860":"#E6DED0"), borderRadius:20, background:category===cat?"rgba(200, 168, 96,0.08)":"#fff", color:category===cat?"#C8A860":"#4A5573", fontSize:12, fontWeight:category===cat?700:500, cursor:"pointer", fontFamily:"Poppins,sans-serif", whiteSpace:"nowrap" }}>{cat}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ background:"#F7F5F0", borderBottom:"1px solid #E6DED0" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"10px 16px", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          {([
            ["university","University", universityOpts],
            ["format","Format", formatOpts],
            ["duration","Duration",["All","Under 4 Weeks","4–8 Weeks","8+ Weeks"]],
            ["cost","Cost",["All","Under ₹25K","₹25K–₹50K","₹50K–₹75K","₹75K+"]],
          ] as [string,string,string[]][]).map(([key,label,opts]) => {
            const val = filters[key as keyof typeof filters];
            return (
              <div key={key} style={{ position:"relative" }}>
                <select value={val} onChange={e=>setFilter(key,e.target.value)} style={{ appearance:"none", background:"#fff", border:"1.5px solid "+(val!=="All"?"#C8A860":"#E6DED0"), borderRadius:8, padding:"7px 28px 7px 12px", fontSize:12, fontFamily:"Poppins,sans-serif", color:val!=="All"?"#C8A860":"#4A5573", cursor:"pointer", fontWeight:val!=="All"?700:400, outline:"none" }}>
                  {opts.map(o => <option key={o} value={o}>{o==="All"?label+": All":o}</option>)}
                </select>
                <span style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", fontSize:9, color:"#4A5573" }}>▼</span>
              </div>
            );
          })}
          {anyFilter && (
            <button onClick={()=>{setFilters({university:"All",format:"All",duration:"All",cost:"All"});setCategory("All");setSearch("");}} style={{ padding:"7px 14px", border:"1.5px solid #C8A860", borderRadius:8, background:"rgba(200, 168, 96,0.06)", color:"#C8A860", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>Clear All ✕</button>
          )}
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:12, color:"#4A5573" }}>Sort:</span>
            <div style={{ position:"relative" }}>
              <select value={sort} onChange={e=>setSort(e.target.value)} style={{ appearance:"none", background:"#fff", border:"1.5px solid #E6DED0", borderRadius:8, padding:"7px 24px 7px 10px", fontSize:12, fontFamily:"Poppins,sans-serif", color:"#182848", cursor:"pointer", outline:"none" }}>
                <option value="popular">Most Popular</option>
                <option value="rating">Highest Rated</option>
                <option value="price-low">Price: Low → High</option>
                <option value="price-high">Price: High → Low</option>
              </select>
              <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", fontSize:9, color:"#4A5573" }}>▼</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results header ── */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"14px 16px 0" }}>
        <div style={{ fontSize:13, color:"#4A5573" }}>
          <strong style={{ color:"#182848" }}>{filtered.length}</strong> program{filtered.length!==1?"s":""} found
          {liveCount > 0 && <span style={{ marginLeft:8, color:"#22c55e", fontSize:11, fontWeight:600 }}>· {liveCount} live on your platform</span>}
        </div>
      </div>

      {/* ── Program Grid ── */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"14px 16px 56px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"72px 20px", background:"#fff", borderRadius:16, border:"1px solid #E6DED0" }}>
            <div style={{ fontSize:40, marginBottom:14, opacity:0.35 }}>🔍</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#182848", marginBottom:6 }}>No programs match your filters</div>
            <div style={{ fontSize:13, color:"#4A5573", marginBottom:20 }}>Try adjusting your search or clearing the filters</div>
            <button onClick={()=>{setFilters({university:"All",format:"All",duration:"All",cost:"All"});setCategory("All");setSearch("");}} style={{ padding:"10px 24px", background:"#C8A860", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>Clear All Filters</button>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:20 }}>
            {filtered.map(prog => (
              <ProgramCard key={prog.id} prog={prog} wishlist={wishlist} onWishlist={toggleWishlist} onEnroll={handleEnrollClick} />
            ))}
          </div>
        )}
      </div>

      {authOpen && <AuthModal onClose={() => { setAuthOpen(false); setPendingEnroll(null); }} onSuccess={handleAuthSuccess} />}
      {enrollTarget && (
        <EnrollModal
          prog={enrollTarget}
          onClose={() => setEnrollTarget(null)}
          onEnrolled={() => { setEnrollTarget(null); router.push("/dashboard/participant"); }}
        />
      )}
    </div>
  );
}

// ─── Enroll Flow (program summary → Razorpay Checkout for paid programs, direct enroll for free ones) ─────────────

type PaymentMethod = "razorpay" | "paypal";

function EnrollModal({ prog, onClose, onEnrolled }: { prog: OpenProgram; onClose: () => void; onEnrolled: () => void; }) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  // Manual payment-method choice — participant picks regardless of currency
  // (backend's SelectProvider(currency) is only the fallback when omitted).
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [paypalOrder, setPaypalOrder] = useState<{ payment_order_id: string; paypal_order_id: string; currency: string; amount: number } | null>(null);
  const [paypalOrderLoading, setPaypalOrderLoading] = useState(false);

  async function confirmFreeEnroll() {
    setLoading(true); setError("");
    try {
      await programsApi.enroll(prog.id);
      onEnrolled();
    } catch (e) {
      setError((e as Error).message || "Enrollment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // The entire body of this function is the pre-existing Razorpay checkout
  // logic, unmodified — only extracted so it can be dispatched to from the
  // method-choice step below instead of being the sole payment path.
  async function payAndEnrollRazorpay() {
    setLoading(true); setError("");
    try {
      const order = (await programsApi.createPaymentOrder(prog.id, "razorpay")).data;
      if (isPaypalOrder(order)) throw new Error("Unexpected payment provider response");
      await loadRazorpayScript();
      const razorpay = new window.Razorpay!({
        key: order.razorpay_key_id,
        order_id: order.razorpay_order_id,
        amount: order.amount,
        currency: order.currency,
        name: order.program_name,
        prefill: { name: user?.name, email: user?.email },
        handler: async (response) => {
          setVerifying(true);
          try {
            await programsApi.verifyPayment(response);
            onEnrolled();
          } catch (e) {
            setError((e as Error).message || "Payment verification failed. If your payment succeeded, it will be confirmed automatically shortly.");
          } finally {
            setVerifying(false);
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      razorpay.open();
    } catch (e) {
      setError((e as Error).message || "Unable to start payment. Please try again.");
      setLoading(false);
    }
  }

  // Selecting PayPal creates the order up front (server-side, via Phase 3's
  // endpoint) so <PayPalButtons>'s createOrder callback below can just
  // return the already-created paypal_order_id — never creating a second
  // order client-side.
  async function selectPaypal() {
    setMethod("paypal"); setError(""); setPaypalOrderLoading(true);
    try {
      const order = (await programsApi.createPaymentOrder(prog.id, "paypal")).data;
      if (!isPaypalOrder(order)) throw new Error("Unexpected payment provider response");
      setPaypalOrder({ payment_order_id: order.payment_order_id, paypal_order_id: order.paypal_order_id, currency: order.currency, amount: order.amount });
    } catch (e) {
      setError((e as Error).message || "Unable to start PayPal checkout. Please try again.");
      setMethod(null);
    } finally {
      setPaypalOrderLoading(false);
    }
  }

  // Polls the order's status after capture — the PAYMENT.CAPTURE.COMPLETED
  // webhook (Phase 4) is the sole source of truth for finalization, so the
  // frontend waits for `enrolled` to flip true rather than trusting the
  // client-side approval/capture response alone.
  async function pollUntilEnrolled(paymentOrderId: string) {
    const maxAttempts = 20; // ~40s at 2s intervals
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const status = (await programsApi.getPaymentOrderStatus(paymentOrderId)).data;
        if (status.enrolled) {
          onEnrolled();
          return;
        }
      } catch {
        // transient poll failure — keep trying until maxAttempts
      }
    }
    setVerifying(false);
    setError("Your payment is still processing. This can take a minute — check your dashboard shortly, you'll be enrolled automatically once it completes.");
  }

  async function handlePaypalApprove() {
    if (!paypalOrder) return;
    setVerifying(true); setError("");
    try {
      await programsApi.capturePaypalOrder(paypalOrder.payment_order_id);
      await pollUntilEnrolled(paypalOrder.payment_order_id);
    } catch (e) {
      setVerifying(false);
      setError((e as Error).message || "Payment capture failed. Please try again.");
    }
  }

  const confirmEnroll = prog.paymentRequired ? payAndEnrollRazorpay : confirmFreeEnroll;

  // Rendered via a portal to <body> — same containing-block reason as AuthModal above.
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:"rgba(24, 40, 72,0.58)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Poppins,sans-serif" }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:460, overflow:"hidden", boxShadow:"0 24px 64px rgba(24, 40, 72,0.28)" }}>
        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#182848,#2d3a7c)", padding:"20px 28px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ color:"rgba(255,255,255,0.5)", fontSize:10, letterSpacing:1, fontWeight:700, marginBottom:4 }}>{step === 1 ? "ENROLL · STEP 1 OF 2" : "PAYMENT · STEP 2 OF 2"}</div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:16 }}>{prog.title}</div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, border:"1px solid rgba(255,255,255,0.2)", borderRadius:"50%", background:"transparent", cursor:"pointer", color:"rgba(255,255,255,0.7)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
        </div>

        <div style={{ padding:"24px 28px 26px" }}>
          {error && <div style={{ background:"rgba(200, 168, 96,0.06)", border:"1px solid rgba(200, 168, 96,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#C8A860", fontWeight:600 }}>{error}</div>}

          {step === 1 && (
            <>
              <div style={{ fontSize:13, color:"#4A5573", lineHeight:1.7, marginBottom:18 }}>{prog.tagline}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:22 }}>
                {[["Duration", prog.duration],["Next Batch", prog.nextBatch],["Format", prog.format],["Price", prog.cost > 0 ? formatCost(prog.cost, prog.currency) : "Free"]].map(([k,v]) => (
                  <div key={k} style={{ background:"#F7F5F0", border:"1px solid #E6DED0", borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#4A5573", letterSpacing:0.5, marginBottom:4, textTransform:"uppercase" }}>{k}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#182848" }}>{v}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(2)} style={{ width:"100%", padding:"12px", background:"#C8A860", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>Continue to Payment →</button>
            </>
          )}

          {step === 2 && prog.paymentRequired && method === null && (
            <>
              <div style={{ fontSize:13, color:"#4A5573", lineHeight:1.7, marginBottom:16, textAlign:"center" }}>Choose how you&apos;d like to pay {formatCost(prog.cost, prog.currency)}.</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:18 }}>
                <button onClick={() => setMethod("razorpay")} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", border:"1.5px solid #E6DED0", borderRadius:10, background:"#fff", cursor:"pointer", fontFamily:"Poppins,sans-serif", textAlign:"left" }}>
                  <span style={{ width:36, height:36, borderRadius:8, background:"rgba(74, 85, 115,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>💳</span>
                  <span>
                    <span style={{ display:"block", fontSize:13, fontWeight:700, color:"#182848" }}>Pay with Razorpay</span>
                    <span style={{ display:"block", fontSize:11, color:"#4A5573", marginTop:2 }}>Cards, UPI, netbanking &amp; wallets</span>
                  </span>
                </button>
                <button onClick={selectPaypal} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", border:"1.5px solid #E6DED0", borderRadius:10, background:"#fff", cursor:"pointer", fontFamily:"Poppins,sans-serif", textAlign:"left" }}>
                  <span style={{ width:36, height:36, borderRadius:8, background:"rgba(0,82,204,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>🅿️</span>
                  <span>
                    <span style={{ display:"block", fontSize:13, fontWeight:700, color:"#182848" }}>Pay with PayPal</span>
                    <span style={{ display:"block", fontSize:11, color:"#4A5573", marginTop:2 }}>PayPal balance, cards &amp; bank</span>
                  </span>
                </button>
              </div>
              <button onClick={() => setStep(1)} style={{ width:"100%", padding:"12px", background:"#fff", border:"1px solid #E6DED0", borderRadius:10, color:"#182848", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"Poppins,sans-serif" }}>Back</button>
            </>
          )}

          {step === 2 && (!prog.paymentRequired || method !== null) && (
            <>
              <div style={{ textAlign:"center", padding:"10px 0 20px" }}>
                <div style={{ width:56, height:56, background:"rgba(74, 85, 115,0.1)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:26 }}>💳</div>
                {prog.paymentRequired ? (
                  <>
                    <div style={{ fontSize:16, fontWeight:700, color:"#182848", marginBottom:8 }}>{verifying ? "Confirming your payment…" : `Pay ${formatCost(prog.cost, prog.currency)} to enroll`}</div>
                    <div style={{ fontSize:13, color:"#4A5573", lineHeight:1.7 }}>
                      {verifying ? "Please don't close this window." : method === "paypal" ? "Complete your payment securely with PayPal below." : "You'll be redirected to Razorpay Checkout to complete your payment securely."}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:16, fontWeight:700, color:"#182848", marginBottom:8 }}>Free enrollment</div>
                    <div style={{ fontSize:13, color:"#4A5573", lineHeight:1.7 }}>This program doesn&apos;t require payment. Click Enroll to start learning right away.</div>
                  </>
                )}
              </div>

              {method === "paypal" ? (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {paypalOrderLoading || verifying ? (
                    <div style={{ textAlign:"center", padding:"12px 0", fontSize:12, color:"#4A5573" }}>{verifying ? "Waiting for confirmation…" : "Starting PayPal checkout…"}</div>
                  ) : paypalOrder ? (
                    <PayPalScriptProvider options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "", currency: paypalOrder.currency, intent: "capture" }}>
                      <PayPalButtons
                        style={{ layout: "vertical" }}
                        createOrder={() => Promise.resolve(paypalOrder.paypal_order_id)}
                        onApprove={handlePaypalApprove}
                        onError={() => setError("PayPal checkout failed. Please try again.")}
                        onCancel={() => setMethod(null)}
                      />
                    </PayPalScriptProvider>
                  ) : null}
                  <button onClick={() => { setMethod(null); setPaypalOrder(null); setError(""); }} disabled={verifying} style={{ width:"100%", padding:"12px", background:"#fff", border:"1px solid #E6DED0", borderRadius:10, color:"#182848", fontWeight:600, fontSize:13, cursor:verifying?"not-allowed":"pointer", fontFamily:"Poppins,sans-serif" }}>Choose a different method</button>
                </div>
              ) : (
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => (prog.paymentRequired ? setMethod(null) : setStep(1))} disabled={loading} style={{ flex:1, padding:"12px", background:"#fff", border:"1px solid #E6DED0", borderRadius:10, color:"#182848", fontWeight:600, fontSize:13, cursor:loading?"not-allowed":"pointer", fontFamily:"Poppins,sans-serif" }}>Back</button>
                  <button onClick={confirmEnroll} disabled={loading} style={{ flex:2, padding:"12px", background:loading?"#C9BFA8":"#C8A860", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:loading?"not-allowed":"pointer", fontFamily:"Poppins,sans-serif" }}>
                    {verifying ? "Verifying…" : loading ? (prog.paymentRequired ? "Opening Checkout…" : "Enrolling…") : (prog.paymentRequired ? "Pay & Enroll" : "Enroll")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
