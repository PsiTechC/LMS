"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { profileApi, ProfileResponse } from "@/lib/profile-api";

// ── Design tokens ─────────────────────────────────────────────────
const NAVY   = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const BORDER = "#E6DED0";
const BG     = "var(--xa-bg)";
const MUTED  = "var(--xa-muted)";

const ROLE_LABEL: Record<string, string> = {
  superadmin:      "Super Administrator",
  program_manager: "Program Manager (Business Admin)",
  faculty:         "Faculty",
  participant:     "Participant",
};

const ROLE_COLOR: Record<string, string> = {
  superadmin:      "#22c55e",
  program_manager: NAVY,
  faculty:         "#4A5573",
  participant:     ORANGE,
};

export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  const [profile, setProfile]   = useState<ProfileResponse | null>(null);
  const [name, setName]         = useState("");
  const [mobile, setMobile]     = useState("");
  const [about, setAbout]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError]         = useState("");
  const fileRef                 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    profileApi.getMe()
      .then(r => {
        const p = r.data;
        setProfile(p);
        setName(p.name);
        setMobile(p.mobile_number ?? "");
        setAbout(p.about ?? "");
      })
      .catch(() => {
        // Fallback to auth context user if API not available
        if (user) {
          setName(user.name);
          setProfile({
            id: user.id, email: user.email, name: user.name,
            role: user.role, avatar_url: user.avatar_url,
            mobile_number: "", about: "", created_at: "",
          });
        }
      });
  }, [user]);

  async function handleAvatarUpload(file: File) {
    setAvatarError("");
    if (file.size > 2 * 1024 * 1024) { setAvatarError("Image must be under 2MB"); return; }
    setAvatarUploading(true);
    try {
      const res = await profileApi.uploadAvatar(file);
      const urlWithBuster = res.data.avatar_url + (res.data.avatar_url.includes("?") ? "&" : "?") + "t=" + Date.now();
      setProfile((p) => (p ? { ...p, avatar_url: urlWithBuster } : p));
      updateUser({ avatar_url: urlWithBuster });
    } catch (e: unknown) {
      setAvatarError(e instanceof Error ? e.message : "Failed to upload photo");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setError("");
    try {
      const res = await profileApi.updateMe({ name: name.trim(), mobile_number: mobile.trim(), about: about.trim() });
      setProfile(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return (
    <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>Loading profile…</div>
  );

  const initials  = profile.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const roleColor = ROLE_COLOR[profile.role] ?? NAVY;
  const avatarSrc = profileApi.avatarSrc(profile.avatar_url);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 0" }}>
      <div style={card}>
        {/* Avatar + role badge */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 28 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              background: avatarSrc ? "transparent" : roleColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, fontWeight: 700, color: "#fff", overflow: "hidden",
              border: `3px solid ${BORDER}`,
            }}>
              {avatarSrc
                ? <img src={avatarSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : initials}
            </div>
            <button
              title="Upload photo"
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              style={{
                position: "absolute", bottom: 0, right: 0,
                width: 24, height: 24, borderRadius: "50%",
                background: ORANGE, border: "2px solid #fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: avatarUploading ? "not-allowed" : "pointer", fontSize: 11, color: "#fff",
                opacity: avatarUploading ? 0.6 : 1,
              }}
            >
              {avatarUploading ? "…" : "✎"}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleAvatarUpload(file);
                e.target.value = "";
              }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 6 }}>{profile.name}</div>
            <div style={{
              display: "inline-block",
              background: `${roleColor}14`, color: roleColor,
              fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 12px",
            }}>
              {ROLE_LABEL[profile.role] ?? profile.role}
            </div>
            {avatarError && <div style={{ marginTop: 6, fontSize: 11, color: "#ef4444" }}>{avatarError}</div>}
          </div>
        </div>

        <div style={divider} />

        {/* Form fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 20 }}>
          <Field label="FULL NAME" value={name} onChange={setName} placeholder="Your full name" />
          <ReadonlyField label="EMAIL ADDRESS" value={profile.email} />
          <ReadonlyField label="ROLE" value={ROLE_LABEL[profile.role] ?? profile.role} note="Assigned by platform administrator" />
          <Field label="MOBILE NUMBER" value={mobile} onChange={setMobile} placeholder="+91 98765 43210" />
          <Field label="ABOUT" value={about} onChange={setAbout}
            placeholder={"Tell us about yourself — your role, goals, and what you hope to get from this program…"}
            multiline rows={4}
          />
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#ef4444" }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleSave} disabled={saving}
            style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, multiline, rows }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; rows?: number;
}) {
  const shared: React.CSSProperties = {
    border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
    fontSize: 13, color: NAVY, width: "100%", fontFamily: "Poppins,sans-serif",
    outline: "none", background: "#fff", boxSizing: "border-box",
  };
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} rows={rows ?? 3}
            style={{ ...shared, resize: "vertical", lineHeight: 1.5 }} />
        : <input value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} style={shared} />
      }
    </div>
  );
}

function ReadonlyField({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
          fontSize: 13, color: NAVY, background: BG, flex: 1,
        }}>{value}</div>
        {note && <div style={{ fontSize: 11, color: MUTED, marginLeft: 12, whiteSpace: "nowrap" }}>{note}</div>}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`,
  boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", padding: 28,
};
const divider: React.CSSProperties = {
  height: 1, background: BORDER, margin: "0 -28px",
};
const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: MUTED,
  letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6,
};
const primaryBtn: React.CSSProperties = {
  background: ORANGE, color: "#fff", border: "none",
  borderRadius: 8, padding: "9px 24px", fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "Poppins,sans-serif",
};
