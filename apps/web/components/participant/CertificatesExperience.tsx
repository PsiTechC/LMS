"use client";

import { useCallback, useEffect, useState } from "react";
import { certificatesApi, CertificateDTO } from "@/lib/certificates-api";

const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const MUTED = "var(--xa-muted)";
const PAGE = "var(--xa-bg)";
const BORDER = "#E6DED0";
const SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

export default function CertificatesExperience() {
  const [certs, setCerts] = useState<CertificateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await certificatesApi.listMine();
      setCerts(res.data);
    } catch {
      setCerts([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  async function handleDownload(cert: CertificateDTO) {
    setDownloadingId(cert.id);
    try {
      const { blobUrl } = await certificatesApi.downloadFile(cert.id);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${cert.program_title.replace(/[^a-z0-9]+/gi, "_")}_certificate.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      // best-effort - a failed download shouldn't crash the tab
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, background: PAGE, minHeight: "100%" }}>
        <div style={{ fontSize: 13, color: MUTED }}>Loading your certificates…</div>
      </div>
    );
  }

  if (certs.length === 0) {
    return (
      <div style={{ padding: 24, background: PAGE, minHeight: "100%" }}>
        <div style={{
          background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: SHADOW,
          padding: "48px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>No certificates yet</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>
            Complete a program that has a certificate attached and it will appear here automatically.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: PAGE, minHeight: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      {certs.map((cert) => (
        <div key={cert.id} style={{
          background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: SHADOW,
          padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(200,168,96,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: ORANGE, flexShrink: 0 }}>⬢</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{cert.program_title}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
                Issued {new Date(cert.issued_at).toLocaleDateString()} · {cert.serial_code}
                {cert.manually_issued && " · Manually issued"}
              </div>
            </div>
          </div>
          <button
            onClick={() => handleDownload(cert)}
            disabled={downloadingId === cert.id}
            style={{
              padding: "9px 18px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff",
              fontSize: 12, fontWeight: 700, cursor: downloadingId === cert.id ? "not-allowed" : "pointer",
              fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap",
            }}
          >
            {downloadingId === cert.id ? "Downloading…" : "Download"}
          </button>
        </div>
      ))}
    </div>
  );
}
