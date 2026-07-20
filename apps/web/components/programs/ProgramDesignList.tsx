"use client";

import { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { programsApi, ProgramDTO, ProgramDetailDTO } from "@/lib/programs-api";
import ConfirmModal from "@/components/shared/ConfirmModal";

const STATUS_FILTERS = ["All", "Active", "Draft", "Upcoming", "Delivered", "Archived", "Open Programs"];

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  draft:     { bg: "rgba(74, 85, 115,0.1)",  color: "#4A5573",  border: "#E6DED0" },
  active:    { bg: "rgba(200, 168, 96,0.1)",    color: "#C8A860",  border: "rgba(200, 168, 96,0.25)" },
  upcoming:  { bg: "rgba(74, 85, 115,0.1)",  color: "#4A5573",  border: "rgba(74, 85, 115,0.25)" },
  delivered: { bg: "rgba(34,197,94,0.1)",    color: "#22c55e",  border: "rgba(34,197,94,0.25)" },
  archived:  { bg: "rgba(24, 40, 72,0.06)",    color: "#182848",  border: "#E6DED0" },
};

export function ProgramDesignList({
  orgId,
  orgName,
  refreshKey,
  onOpenStudio,
  canCreate = true,
  canDuplicate = true,
  canDelete = false,
}: {
  orgId: string;
  orgName?: string;
  refreshKey?: number;
  onOpenStudio: (p: ProgramDetailDTO) => void;
  canCreate?: boolean;
  canDuplicate?: boolean;
  canDelete?: boolean;
}) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [filter, setFilter] = useState("All");
  const [loadingList, setLoadingList] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const loadPrograms = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await programsApi.list(orgId);
      setPrograms(res.data ?? []);
    } catch {
      setPrograms([]);
    } finally {
      setLoadingList(false);
    }
  }, [orgId]);

  // refreshKey bump forces a refetch when returning from the Design Studio —
  // publish/save updates the program on the server but this list wouldn't
  // otherwise know, since it stays mounted across navigation.
  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await loadPrograms(); })();
    return () => { cancelled = true; };
  }, [loadPrograms, refreshKey]);

  async function handleCreate(title: string) {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const created = await programsApi.create(orgId, { title });
      const detail = await programsApi.get(created.data.id);
      if (detail.data) {
        setShowNewModal(false);
        onOpenStudio(detail.data);
      }
    } catch (e: unknown) {
      alert((e as Error).message || "Failed to create program");
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenProgram(id: string) {
    try {
      const res = await programsApi.get(id);
      if (res.data) onOpenStudio(res.data);
    } catch (e: unknown) {
      alert((e as Error).message || "Failed to open program");
    }
  }

  async function handleDuplicate(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDuplicatingId(id);
    try {
      await programsApi.duplicate(id);
      await loadPrograms();
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to duplicate program");
    } finally {
      setDuplicatingId(null);
    }
  }

  function handleDelete(id: string, title: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDelete({ id, title });
  }

  async function runDelete(id: string) {
    setDeletingId(id);
    try {
      await programsApi.delete(id);
      await loadPrograms();
      setConfirmDelete(null);
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to delete program");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = programs
    .filter((p) => filter === "All" || (filter === "Open Programs" ? p.is_open : p.status.toLowerCase() === filter.toLowerCase()));

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "#4A5573", display: "flex", alignItems: "center", gap: 8 }}>
          <span>{programs.length} program{programs.length !== 1 ? "s" : ""} total</span>
          {orgName && (
            <span style={{
              background: "rgba(200, 168, 96,0.08)", border: "1px solid rgba(200, 168, 96,0.2)",
              color: "#C8A860", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
            }}>Viewing: {orgName}</span>
          )}
        </div>
        {canCreate && (
          <button
            onClick={() => setShowNewModal(true)}
            style={{
              padding: "10px 20px", background: "#182848", border: "none",
              borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
              color: "#fff", fontFamily: "Poppins, sans-serif", display: "flex",
              alignItems: "center", gap: 8,
            }}
          >+ New Program Design</button>
        )}
      </div>

      {/* Status filters — single-select pill row; "Open Programs" is one more
          value in the same group (filters to p.is_open instead of p.status). */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 12px", border: `1px solid ${active ? "#182848" : "#E6DED0"}`,
              borderRadius: 20, background: active ? "#182848" : "#fff",
              color: active ? "#fff" : "#4A5573", cursor: "pointer",
              fontSize: 12, fontWeight: active ? 700 : 400,
              fontFamily: "Poppins, sans-serif",
            }}>{f}</button>
          );
        })}
      </div>

      {/* Program grid */}
      {loadingList ? (
        <div style={{ padding: 48, textAlign: "center", color: "#4A5573", fontSize: 13 }}>
          Loading programs…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onNew={() => setShowNewModal(true)} hasFilter={filter !== "All"} canCreate={canCreate} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              onClick={() => handleOpenProgram(p.id)}
              onDuplicate={(e) => handleDuplicate(p.id, e)}
              duplicating={duplicatingId === p.id}
              canDuplicate={canDuplicate}
              onDelete={(e) => handleDelete(p.id, p.title, e)}
              deleting={deletingId === p.id}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewProgramModal
          orgName={orgName}
          onCreate={handleCreate}
          onClose={() => setShowNewModal(false)}
          creating={creating}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete program?"
          message={`"${confirmDelete.title}" will be permanently deleted, including its phases, modules, and activities. This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => runDelete(confirmDelete.id)}
        />
      )}
    </div>
  );
}

function ProgramCard({ program, onClick, onDuplicate, duplicating, canDuplicate, onDelete, deleting, canDelete }: {
  program: ProgramDTO;
  onClick: () => void;
  onDuplicate: (e: React.MouseEvent) => void;
  duplicating: boolean;
  canDuplicate: boolean;
  onDelete: (e: React.MouseEvent) => void;
  deleting: boolean;
  canDelete: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sc = STATUS_COLORS[program.status] ?? STATUS_COLORS.draft;

  const menuItems = [
    {
      label: program.status === "draft" ? "✎  Open Design Studio" : "◎  View Program",
      action: (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(false); onClick(); },
    },
    ...(canDuplicate ? [{
      label: duplicating ? "⧉  Cloning…" : "⧉  Clone Program",
      disabled: duplicating,
      action: (e: React.MouseEvent) => { setMenuOpen(false); onDuplicate(e); },
    }] : []),
    ...(canDelete ? [{
      label: deleting ? "🗑  Deleting…" : "🗑  Delete Program",
      disabled: deleting,
      danger: true,
      action: (e: React.MouseEvent) => { setMenuOpen(false); onDelete(e); },
    }] : []),
  ];

  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", borderRadius: 14, border: "1px solid #E6DED0",
        overflow: "visible", cursor: "pointer",
        boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)",
        transition: "box-shadow 0.15s", position: "relative",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(24, 40, 72,0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(24, 40, 72,0.07)")}
    >
      <div style={{ height: 4, background: program.color, borderRadius: "14px 14px 0 0" }} />

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#182848", lineHeight: 1.4, flex: 1 }}>
            {program.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{
              background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
              borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
            }}>{program.status.toUpperCase()}</div>

            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
                style={{
                  width: 28, height: 28, border: "1px solid #E6DED0", borderRadius: 6,
                  background: menuOpen ? "#F7F5F0" : "#fff", cursor: "pointer",
                  fontSize: 14, color: "#4A5573", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontFamily: "Poppins, sans-serif",
                }}
              >⋮</button>
              {menuOpen && (
                <>
                  <div
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                    style={{ position: "fixed", inset: 0, zIndex: 400 }}
                  />
                  <div style={{
                    position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 500,
                    background: "#fff", border: "1px solid #E6DED0", borderRadius: 10,
                    boxShadow: "0 8px 32px rgba(24, 40, 72,0.14)", minWidth: 180, overflow: "hidden",
                  }}>
                    {menuItems.map(({ label, action, disabled, danger }) => (
                      <button
                        key={label}
                        onClick={(e) => { e.stopPropagation(); if (!disabled) action(e); }}
                        disabled={disabled}
                        style={{
                          display: "block", width: "100%", padding: "10px 14px",
                          background: "none", border: "none", cursor: disabled ? "default" : "pointer",
                          fontSize: 12, color: disabled ? "#4A5573" : danger ? "#ef4444" : "#182848",
                          textAlign: "left", fontFamily: "Poppins, sans-serif", fontWeight: 500,
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Stat label="Phases"     value={program.phase_count} />
          <Stat label="Activities" value={program.activity_count} />
          <Stat label="Weeks"      value={program.duration_weeks} />
        </div>

        <div style={{ fontSize: 11, color: "#4A5573" }}>
          {program.published_at
            ? `Published ${new Date(program.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
            : "Not published yet"}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          style={{
            width: "100%", padding: "8px 0", border: "1px solid #E6DED0", borderRadius: 8,
            background: "#F7F5F0", color: "#182848", cursor: "pointer", fontSize: 12,
            fontWeight: 600, fontFamily: "Poppins, sans-serif", marginTop: 4,
          }}
        >
          {program.status === "draft" ? "Open Design Studio →" : "View Program →"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#4A5573", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#182848" }}>{value}</div>
    </div>
  );
}

function NewProgramModal({
  orgName,
  onCreate,
  onClose,
  creating,
}: {
  orgName?: string;
  onCreate: (title: string) => void;
  onClose: () => void;
  creating: boolean;
}) {
  const [title, setTitle] = useState("");

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "Poppins, sans-serif",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440,
        overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E6DED0" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#182848" }}>New Program Design</div>
          <div style={{ fontSize: 12, color: "#4A5573", marginTop: 4 }}>
            You can rename and configure everything in the design studio.
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {orgName && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
              padding: "10px 14px", background: "rgba(200, 168, 96,0.08)",
              border: "1px solid rgba(200, 168, 96,0.2)", borderRadius: 8,
            }}>
              <span style={{ fontSize: 11, color: "#4A5573", fontWeight: 600 }}>Creating under:</span>
              <span style={{ fontSize: 13, color: "#C8A860", fontWeight: 700 }}>{orgName}</span>
            </div>
          )}
          <label style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, display: "block", marginBottom: 8 }}>
            PROGRAM NAME *
          </label>
          <input
            autoFocus
            style={{
              width: "100%", border: "1px solid #E6DED0", borderRadius: 8,
              padding: "10px 14px", fontSize: 13, fontFamily: "Poppins, sans-serif",
              color: "#182848", boxSizing: "border-box", outline: "none",
            }}
            placeholder="e.g. Leadership Accelerator – Batch 8"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onCreate(title); }}
          />
        </div>
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #E6DED0",
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <button onClick={onClose} style={{
            padding: "9px 20px", background: "#fff", border: "1px solid #E6DED0",
            borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            color: "#182848", fontFamily: "Poppins, sans-serif",
          }}>Cancel</button>
          <button
            onClick={() => onCreate(title)}
            disabled={!title.trim() || creating}
            style={{
              padding: "9px 24px",
              background: title.trim() && !creating ? "#182848" : "#C9BFA8",
              border: "none", borderRadius: 8,
              cursor: title.trim() && !creating ? "pointer" : "default",
              fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
            }}
          >{creating ? "Creating…" : "Create & Open Studio"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EmptyState({ onNew, hasFilter, canCreate }: { onNew: () => void; hasFilter: boolean; canCreate: boolean }) {
  return (
    <div style={{
      padding: 64, textAlign: "center", color: "#4A5573",
      border: "2px dashed #E6DED0", borderRadius: 16, background: "#fff",
    }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>▤</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#182848", marginBottom: 8 }}>
        {hasFilter ? "No programs match this filter" : "No programs yet"}
      </div>
      <div style={{ fontSize: 13, marginBottom: 24 }}>
        {hasFilter ? "Try selecting a different status." : "Design your first leadership program to get started."}
      </div>
      {!hasFilter && canCreate && (
        <button
          onClick={onNew}
          style={{
            padding: "10px 24px", background: "#182848", border: "none",
            borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
            color: "#fff", fontFamily: "Poppins, sans-serif",
          }}
        >+ New Program Design</button>
      )}
    </div>
  );
}
