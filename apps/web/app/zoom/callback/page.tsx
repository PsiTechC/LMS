"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Lands the browser redirect from api/internal/zoom's oauth callback (which
// itself redirects here after exchanging the code with Zoom), shows a brief
// result message, then bounces the user back to return_to — the screen they
// started the Zoom connection from (defaulting to the faculty dashboard if
// return_to wasn't carried through, e.g. a stale/expired state).
function ZoomCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"success" | "error">("success");

  useEffect(() => {
    const result = params.get("status");
    const returnTo = params.get("return_to") || "/dashboard/faculty";
    setStatus(result === "error" ? "error" : "success");

    const t = setTimeout(() => {
      const sep = returnTo.includes("?") ? "&" : "?";
      router.replace(`${returnTo}${sep}zoom_connected=${result === "error" ? "0" : "1"}`);
    }, 1600);
    return () => clearTimeout(t);
  }, [params, router]);

  return (
    <div style={{
      minHeight: "100vh", background: "#F5F7FB",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "Poppins, sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 420,
        padding: "44px 36px", textAlign: "center",
        boxShadow: "0 8px 40px rgba(28,37,81,0.10)",
        border: "1px solid #EAECF4",
      }}>
        {status === "success" ? (
          <>
            <div style={{
              width: 52, height: 52, background: "rgba(34,197,94,0.1)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", fontSize: 24, color: "#22c55e",
            }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>
              Zoom account connected
            </div>
            <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6 }}>
              Taking you back…
            </div>
          </>
        ) : (
          <>
            <div style={{
              width: 52, height: 52, background: "rgba(239,78,36,0.1)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", fontSize: 22, color: "#EF4E24",
            }}>✕</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>
              Couldn't connect Zoom
            </div>
            <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6 }}>
              Taking you back — you can try again from there.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ZoomCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#F5F7FB", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "Poppins, sans-serif", fontSize: 13, color: "#8b90a7" }}>Loading…</div>
      </div>
    }>
      <ZoomCallbackContent />
    </Suspense>
  );
}
