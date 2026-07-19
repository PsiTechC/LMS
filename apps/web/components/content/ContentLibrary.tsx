"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { contentApi, AssetDTO, LibraryStatsDTO, UpdateAssetPayload, Question } from "@/lib/content-api";
import { OrgResponse } from "@/lib/api";
import UploadOnlyModal from "./UploadOnlyModal";
import QuestionBuilderModal from "./QuestionBuilderModal";
import CertificateModal from "./CertificateModal";
import CaseStudyModal from "./CaseStudyModal";
import OthersModal from "./OthersModal";
import { QuestionEditorList } from "./QuestionEditor";

// ── Design tokens ─────────────────────────────────────────────────
const NAVY   = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const INDIGO = "#4A5573";
const GREEN  = "#22c55e";
const BG     = "var(--xa-bg)";
const BORDER = "#E6DED0";
const MUTED  = "var(--xa-muted)";

// ── Asset type definitions (matching elev8-reference LIBRARY_TYPES) ──
const ASSET_TYPES = [
  { key: "all",        label: "All",            icon: "◈", color: NAVY   },
  { key: "quiz",       label: "Quiz",            icon: "✦", color: INDIGO },
  { key: "elearning",  label: "eLearning",       icon: "▤", color: NAVY   },
  { key: "assessment", label: "Assessment",      icon: "◎", color: ORANGE },
  { key: "video",      label: "Video",           icon: "▶", color: NAVY   },
  { key: "case_study", label: "Case Study",      icon: "◈", color: INDIGO },
  { key: "survey",     label: "Survey",          icon: "≡", color: MUTED  },
  { key: "l1_reaction",label: "L1 · Reaction",  icon: "≡", color: GREEN  },
  { key: "l2_learning",label: "L2 · Learning",  icon: "≡", color: GREEN  },
  { key: "l3_behaviour",label:"L3 · Behaviour", icon: "≡", color: GREEN  },
  { key: "l4_impact",  label: "L4 · Impact",    icon: "≡", color: GREEN  },
  { key: "certificate",label: "Certificate",    icon: "🏆", color: "#f59e0b" },
] as const;

type TypeKey = typeof ASSET_TYPES[number]["key"];

function typeInfo(key: string) {
  return ASSET_TYPES.find((t) => t.key === key) ?? { key, label: key, icon: "◈", color: MUTED };
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Main Component ────────────────────────────────────────────────
export default function ContentLibrary({ orgId, orgs }: { orgId: string; orgs?: OrgResponse[] }) {
  const [activeType, setActiveType] = useState<TypeKey>("all");
  const [search, setSearch] = useState("");
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [stats, setStats] = useState<LibraryStatsDTO>({ total_assets: 0, active_assets: 0, draft_assets: 0, type_count: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editAsset, setEditAsset] = useState<AssetDTO | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetDTO | null>(null);
  const [page, setPage] = useState(1);
  const [totalAssets, setTotalAssets] = useState(0);
  const PER_PAGE = 21;

  // Reset to page 1 whenever the filters change
  useEffect(() => { setPage(1); }, [orgId, activeType, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contentApi.list(orgId, {
        type: activeType === "all" ? undefined : activeType,
        search: search || undefined,
        page,
        perPage: PER_PAGE,
      });
      setAssets(res.data.assets ?? []);
      setStats(res.data.stats);
      setTotalAssets(res.meta?.total ?? 0);
    } catch {
      setAssets([]);
      setTotalAssets(0);
    } finally {
      setLoading(false);
    }
  }, [orgId, activeType, search, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(totalAssets / PER_PAGE));

  async function handleArchive(id: string) {
    if (!confirm("Archive this asset? It will no longer appear in the library.")) return;
    const target = assets.find((a) => a.id === id);
    if (!target) return;
    try {
      await contentApi.archive(target.org_id, id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setStats((s) => ({ ...s, total_assets: s.total_assets - 1, active_assets: s.active_assets - 1 }));
    } catch (e: unknown) {
      alert((e as Error).message ?? "Failed to archive asset");
    }
  }

  async function handleDelete(id: string) {
    const target = assets.find((a) => a.id === id);
    if (!target) return;
    if (!confirm(`Permanently delete "${target.title}"? This cannot be undone.`)) return;
    try {
      await contentApi.delete(target.org_id, id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setStats((s) => ({
        ...s,
        total_assets: Math.max(0, s.total_assets - 1),
        active_assets: target.status === "active" ? Math.max(0, s.active_assets - 1) : s.active_assets,
        draft_assets: target.status === "draft" ? Math.max(0, s.draft_assets - 1) : s.draft_assets,
      }));
      setTotalAssets((total) => Math.max(0, total - 1));
    } catch (e: unknown) {
      alert((e as Error).message ?? "Failed to delete asset");
    }
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", boxSizing: "border-box" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: MUTED }}>{stats.active_assets} active assets · reusable across programs</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => (orgId || (orgs && orgs.length > 0)) && setShowCreate(true)}
            disabled={!orgId && !(orgs && orgs.length > 0)}
            title={!orgId && !(orgs && orgs.length > 0) ? "No organizations available to create an asset in" : undefined}
            style={{ ...btnPrimStyle, opacity: !orgId && !(orgs && orgs.length > 0) ? 0.5 : 1, cursor: !orgId && !(orgs && orgs.length > 0) ? "not-allowed" : "pointer" }}
          >
            + Create New
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          ["Total Assets", stats.total_assets, NAVY],
          ["Active",       stats.active_assets, GREEN],
          ["Drafts",       stats.draft_assets,  ORANGE],
          ["Types",        stats.type_count,     INDIGO],
        ].map(([label, val, color]) => (
          <div key={label as string} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 1px 3px rgba(24, 40, 72,0.06)" }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label as string}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: color as string }}>{val as number}</div>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: MUTED, pointerEvents: "none" }}>⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search library…"
          style={{
            width: "100%", boxSizing: "border-box", padding: "9px 14px 9px 34px",
            border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12,
            fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none",
          }}
        />
      </div>

      {/* ── Type filter chips ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ASSET_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveType(t.key as TypeKey)}
            style={{
              padding: "5px 12px",
              border: `1.5px solid ${activeType === t.key ? t.color : BORDER}`,
              borderRadius: 20,
              background: activeType === t.key ? t.color + "14" : "#fff",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: activeType === t.key ? 700 : 400,
              color: activeType === t.key ? t.color : MUTED,
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {t.key !== "all" && <span style={{ marginRight: 4 }}>{t.icon}</span>}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Asset grid ── */}
      {loading ? (
        <div style={{ padding: "48px", textAlign: "center", color: MUTED, fontSize: 13 }}>Loading…</div>
      ) : assets.length === 0 ? (
        <div style={{ padding: "60px 40px", textAlign: "center", color: MUTED }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📚</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>No assets found</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Upload or create your first asset to get started</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              orgId={orgId}
              onPreview={() => setPreviewAsset(asset)}
              onEdit={() => setEditAsset(asset)}
              onArchive={() => handleArchive(asset.id)}
              onDelete={() => handleDelete(asset.id)}
            />
          ))}
        </div>
      )}

      {!loading && assets.length > 0 && (
        <Pager page={page} totalPages={totalPages} onChange={setPage} />
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <CreateTypeRouter
          orgId={orgId}
          orgs={orgs}
          onClose={() => setShowCreate(false)}
          onSuccess={(a) => {
            setShowCreate(false);
            setAssets((prev) => [a, ...prev]);
            setStats((s) => ({ ...s, total_assets: s.total_assets + 1, active_assets: s.active_assets + 1 }));
          }}
        />
      )}

      {editAsset && (
        <EditModal
          orgId={editAsset.org_id}
          asset={editAsset}
          onClose={() => setEditAsset(null)}
          onSuccess={(updated) => {
            setEditAsset(null);
            setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          }}
        />
      )}

      {previewAsset && (
        <PreviewModal
          asset={previewAsset}
          orgId={previewAsset.org_id}
          onClose={() => setPreviewAsset(null)}
        />
      )}
    </div>
  );
}

// ── Pager ─────────────────────────────────────────────────────────
function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const btnStyle = (disabled: boolean) => ({
    padding: "7px 14px", borderRadius: 8, border: `1px solid ${BORDER}`,
    background: "#fff", color: disabled ? "#C9BFA8" : NAVY, fontSize: 12, fontWeight: 600,
    fontFamily: "Poppins, sans-serif", cursor: disabled ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "8px 0" }}>
      <button style={btnStyle(page <= 1)} disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>Page {page} of {totalPages}</span>
      <button style={btnStyle(page >= totalPages)} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}

// ── Asset Card ────────────────────────────────────────────────────
function AssetCard({ asset, orgId, onPreview, onEdit, onArchive, onDelete }: {
  asset: AssetDTO;
  orgId: string;
  onPreview: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const ti = typeInfo(asset.asset_type);
  const isActive = asset.status === "active";

  const meta: string[] = [];
  if (asset.question_count) meta.push(`${asset.question_count} questions`);
  if (asset.duration_mins) meta.push(`${asset.duration_mins} min`);
  if (asset.file_size_bytes) meta.push(fmtBytes(asset.file_size_bytes));
  if (asset.program_ids.length) meta.push(`${asset.program_ids.length} program${asset.program_ids.length !== 1 ? "s" : ""}`);

  const canWrite = !!orgId;

  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: 16, boxShadow: "0 1px 3px rgba(24, 40, 72,0.06)",
      display: "flex", flexDirection: "column", gap: 10, minWidth: 0,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: ti.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 14, flexShrink: 0,
        }}>{ti.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, lineHeight: 1.3, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.title}
          </div>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 10,
            background: ti.color + "14", color: ti.color, fontWeight: 700,
          }}>{ti.label}</span>
        </div>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 10, flexShrink: 0,
          background: isActive ? "rgba(34,197,94,0.1)" : "rgba(74, 85, 115,0.1)",
          color: isActive ? GREEN : MUTED, fontWeight: 700,
        }}>{asset.status.charAt(0).toUpperCase() + asset.status.slice(1)}</span>
      </div>

      {/* Meta line */}
      {meta.length > 0 && (
        <div style={{ fontSize: 11, color: MUTED }}>{meta.join(" · ")}</div>
      )}

      {/* Tags */}
      {asset.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {asset.tags.slice(0, 3).map((tag) => (
            <span key={tag} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 8, background: BG, color: MUTED, fontWeight: 600 }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, borderTop: `1px solid ${BG}`, paddingTop: 8 }}>
        <span style={{ fontSize: 10, color: MUTED }}>{asset.used_in_count > 0 ? `Used in ${asset.used_in_count}` : "Not used yet"}</span>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 5, minWidth: 0 }}>
          {asset.has_file && (
            <button onClick={onPreview} style={{ ...cardBtnStyle, color: INDIGO, border: `1px solid ${INDIGO}22`, whiteSpace: "nowrap" }}>▶ View</button>
          )}
          <button
            onClick={() => canWrite && onEdit()}
            disabled={!canWrite}
            title={!canWrite ? "Select a specific organization to edit this asset" : undefined}
            style={{ ...cardBtnStyle, whiteSpace: "nowrap", opacity: !canWrite ? 0.5 : 1, cursor: !canWrite ? "not-allowed" : "pointer" }}
          >Edit</button>
          <button
            onClick={() => canWrite && onArchive()}
            disabled={!canWrite}
            title={!canWrite ? "Select a specific organization to archive this asset" : undefined}
            style={{ ...cardBtnStyle, whiteSpace: "nowrap", border: "1px solid #fecdd3", color: "#ef4444", opacity: !canWrite ? 0.5 : 1, cursor: !canWrite ? "not-allowed" : "pointer" }}
          >Archive</button>
          <button
            onClick={() => canWrite && asset.used_in_count === 0 && onDelete()}
            disabled={!canWrite || asset.used_in_count > 0}
            title={!canWrite ? "Select a specific organization to delete this asset" : asset.used_in_count > 0 ? "This asset is used in a program. Archive it instead." : undefined}
            style={{ ...cardBtnStyle, whiteSpace: "nowrap", border: "1px solid #fecaca", color: "#dc2626", opacity: !canWrite || asset.used_in_count > 0 ? 0.5 : 1, cursor: !canWrite || asset.used_in_count > 0 ? "not-allowed" : "pointer" }}
          >Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Create Type Router ─────────────────────────────────────────────
// Step 1: pick an asset type. Step 2: route to the type-specific creation
// workflow — upload-only, question-builder (+ AI/upload), certificate config,
// case-study (upload or type), or the generic "others" catch-all form.
// Exported so other creation entry points (e.g. Program Design Studio's
// "Create New" asset tab) can route straight into the same real
// authoring modals instead of duplicating this asset-type classification.
export const UPLOAD_ONLY_TYPES = new Set(["video", "elearning"]);
// "assessment" reuses the exact same question-builder flow as "quiz" (manual
// + AI generation) — previously routed to the generic title-only OthersModal,
// so an assessment asset could never actually contain questions.
export const QUESTION_SET_TYPES = new Set(["quiz", "assessment", "survey", "l1_reaction", "l2_learning", "l3_behaviour", "l4_impact"]);

function CreateTypeRouter({ orgId, orgs, onClose, onSuccess }: {
  orgId: string;
  orgs?: OrgResponse[];
  onClose: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  // When viewing "All Organizations" there's no single owning org for a new
  // asset — ask which org it belongs to before picking an asset type.
  const [pickedOrgId, setPickedOrgId] = useState<string>(orgId);
  const [createType, setCreateType] = useState<string | null>(null);

  if (!pickedOrgId) {
    return (
      <ModalShell title="Create New Asset" onClose={onClose} maxWidth={460}>
        <div style={{ padding: 20 }}>
          <FieldLabel>ORGANIZATION</FieldLabel>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && setPickedOrgId(e.target.value)}
            style={{
              width: "100%", marginTop: 6, fontFamily: "Poppins, sans-serif", fontSize: 13,
              color: NAVY, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: "9px 12px", cursor: "pointer", outline: "none",
            }}
          >
            <option value="" disabled>Select an organization…</option>
            {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </ModalShell>
    );
  }

  if (createType === null) {
    return (
      <ModalShell title="Create New Asset" onClose={onClose} maxWidth={520}>
        <div style={{ padding: 20 }}>
          <FieldLabel>ASSET TYPE</FieldLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {ASSET_TYPES.slice(1).map((t) => (
              <button key={t.key} onClick={() => setCreateType(t.key)} style={{
                padding: "6px 14px",
                border: `1.5px solid ${t.color}`,
                borderRadius: 20,
                background: "#fff",
                cursor: "pointer", fontSize: 12,
                fontWeight: 500,
                color: t.color,
                fontFamily: "Poppins, sans-serif",
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </ModalShell>
    );
  }

  if (UPLOAD_ONLY_TYPES.has(createType)) {
    return <UploadOnlyModal orgId={pickedOrgId} assetType={createType} onClose={onClose} onSuccess={onSuccess} />;
  }
  if (QUESTION_SET_TYPES.has(createType)) {
    return <QuestionBuilderModal orgId={pickedOrgId} assetType={createType} onClose={onClose} onSuccess={onSuccess} />;
  }
  if (createType === "certificate") {
    return <CertificateModal orgId={pickedOrgId} onClose={onClose} onSuccess={onSuccess} />;
  }
  if (createType === "case_study") {
    return <CaseStudyModal orgId={pickedOrgId} onClose={onClose} onSuccess={onSuccess} />;
  }
  return <OthersModal orgId={pickedOrgId} assetType={createType} assetLabel={typeInfo(createType).label} onClose={onClose} onSuccess={onSuccess} />;
}

// ── Edit Modal ────────────────────────────────────────────────────
function EditModal({ orgId, asset, onClose, onSuccess }: {
  orgId: string;
  asset: AssetDTO;
  onClose: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  const isQuestionSetType = QUESTION_SET_TYPES.has(asset.asset_type);
  const [form, setForm] = useState({
    title: asset.title,
    description: asset.description ?? "",
    status: asset.status,
    tags: asset.tags.join(", "),
    question_count: asset.question_count?.toString() ?? "",
    duration_mins: asset.duration_mins?.toString() ?? "",
  });
  const [questions, setQuestions] = useState<Question[]>(asset.question_set?.questions ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ti = typeInfo(asset.asset_type);

  function setF(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: UpdateAssetPayload = {
        title: form.title,
        description: form.description,
        status: form.status,
        tags: form.tags ? form.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        question_count: isQuestionSetType ? questions.length : (form.question_count ? parseInt(form.question_count) : undefined),
        duration_mins: form.duration_mins ? parseInt(form.duration_mins) : undefined,
        question_set: isQuestionSetType ? { questions: questions.map((q, i) => ({ ...q, sort_order: i })) } : undefined,
        file: file ?? undefined,
      };
      const res = await contentApi.update(orgId, asset.id, payload);
      onSuccess(res.data);
    } catch (e: unknown) {
      alert((e as Error).message ?? "Update failed");
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Edit · ${asset.title}`} onClose={onClose} maxWidth={isQuestionSetType ? 620 : 480}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
        {/* Type badge (read-only) */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: ti.color + "14", width: "fit-content" }}>
          <span style={{ fontSize: 12 }}>{ti.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: ti.color }}>{ti.label}</span>
        </div>

        <div>
          <FieldLabel>TITLE</FieldLabel>
          <input value={form.title} onChange={(e) => setF("title", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <FieldLabel>DESCRIPTION</FieldLabel>
          <textarea value={form.description} onChange={(e) => setF("description", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
        <div>
          <FieldLabel>STATUS</FieldLabel>
          <select value={form.status} onChange={(e) => setF("status", e.target.value)} style={inputStyle}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
        </div>
        <div>
          <FieldLabel>TAGS (comma-separated)</FieldLabel>
          <input value={form.tags} onChange={(e) => setF("tags", e.target.value)} style={inputStyle} />
        </div>

        {isQuestionSetType ? (
          <div>
            <FieldLabel>QUESTIONS</FieldLabel>
            <QuestionEditorList assetType={asset.asset_type} questions={questions} onChange={setQuestions} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>QUESTIONS</FieldLabel>
              <input type="number" min="0" value={form.question_count} onChange={(e) => setF("question_count", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <FieldLabel>DURATION (mins)</FieldLabel>
              <input type="number" min="0" value={form.duration_mins} onChange={(e) => setF("duration_mins", e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        {/* File replacement */}
        <div>
          <FieldLabel>REPLACE FILE (optional)</FieldLabel>
          {!file ? (
            <div
              onClick={() => inputRef.current?.click()}
              style={{ border: `1.5px dashed ${BORDER}`, borderRadius: 10, padding: "12px", textAlign: "center", cursor: "pointer", background: BG, fontSize: 11, color: MUTED }}
            >
              <input ref={inputRef} type="file" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
              />
              {asset.has_file ? `Current: ${asset.file_name} · Click to replace` : "Click to attach file"}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8 }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{file.name}</div>
                <div style={{ fontSize: 10, color: MUTED }}>{fmtBytes(file.size)}</div>
              </div>
              <button onClick={() => setFile(null)} style={{ fontSize: 11, color: ORANGE, border: "none", background: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>Remove</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnSecStyle}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{ ...btnPrimStyle, background: saving ? "#C9BFA8" : ORANGE }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Preview Modal ─────────────────────────────────────────────────
function PreviewModal({ asset, orgId, onClose }: {
  asset: AssetDTO;
  orgId: string;
  onClose: () => void;
}) {
  const ti = typeInfo(asset.asset_type);
  const url = contentApi.fileUrl(asset.id, orgId);
  const mime = asset.mime_type ?? "";
  const isVideo  = mime.startsWith("video/") || asset.asset_type === "video";
  const isImage  = mime.startsWith("image/");
  const isPDF    = mime === "application/pdf" || asset.file_name?.endsWith(".pdf");
  const isAudio  = mime.startsWith("audio/");

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,40,0.75)", zIndex: 4000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}
    >
      <div style={{ background: "#1a1f3a", borderRadius: 16, width: "100%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>
        {/* Header */}
        <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: ti.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, flexShrink: 0 }}>{ti.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.title}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{asset.file_name}{asset.file_size_bytes ? ` · ${fmtBytes(asset.file_size_bytes)}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", background: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.6)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", background: "#0d1020", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
          {isVideo && (
            <video
              src={url}
              controls
              autoPlay
              style={{ maxWidth: "100%", maxHeight: "70vh", outline: "none" }}
            />
          )}
          {isImage && (
            <img src={url} alt={asset.title} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }} />
          )}
          {isPDF && (
            <iframe
              src={url}
              style={{ width: "100%", height: "70vh", border: "none", background: "#fff" }}
              title={asset.title}
            />
          )}
          {isAudio && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>🎵</div>
              <audio src={url} controls style={{ width: 320 }} />
            </div>
          )}
          {!isVideo && !isImage && !isPDF && !isAudio && (
            <div style={{ padding: 48, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>Preview not available</div>
              <div style={{ fontSize: 12, marginBottom: 20 }}>{asset.file_name}</div>
              <a
                href={url}
                download={asset.file_name}
                style={{ padding: "9px 20px", background: ORANGE, borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", display: "inline-block" }}
              >
                ⬇ Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────
function ModalShell({ title, onClose, maxWidth, children }: {
  title: string;
  onClose: () => void;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: maxWidth ?? 480, overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{title}</span>
          <button onClick={onClose} style={{ width: 26, height: 26, border: `1px solid ${BORDER}`, borderRadius: "50%", background: "#fff", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, display: "block", marginBottom: 4 }}>{children}</label>;
}

const inputStyle: React.CSSProperties = {
  width: "100%", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "7px 10px",
  fontSize: 12, fontFamily: "Poppins, sans-serif", color: NAVY,
  boxSizing: "border-box", outline: "none",
};

const btnPrimStyle: React.CSSProperties = {
  padding: "8px 16px", border: "none", borderRadius: 8, background: ORANGE,
  cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff",
  fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 6,
};

const btnSecStyle: React.CSSProperties = {
  padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff",
  cursor: "pointer", fontSize: 12, fontWeight: 600, color: NAVY,
  fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 6,
};

const cardBtnStyle: React.CSSProperties = {
  padding: "3px 9px", border: `1px solid ${BORDER}`, borderRadius: 6, background: "#fff",
  cursor: "pointer", fontSize: 10, fontWeight: 600, color: NAVY,
  fontFamily: "Poppins, sans-serif",
};
