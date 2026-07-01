"use client";

import { useState, useEffect } from "react";
import { sessionsApi, ActionItemDTO } from "@/lib/faculty-api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

const STATUS_CYCLE: Record<string, string> = {
  open:        "in_progress",
  in_progress: "completed",
  completed:   "open",
};

const STATUS_LABEL: Record<string, string> = {
  open:        "Open",
  in_progress: "In Progress",
  completed:   "Done",
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  open: {
    background: "#f59e0b20", color: "#f59e0b",
  },
  in_progress: {
    background: "#6B73BF20", color: "#6B73BF",
  },
  completed: {
    background: "#22c55e20", color: "#22c55e",
  },
};

function Toast({ msg, color, onClose }: { msg: string; color: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, background: color, color: "#fff",
      borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 600,
      boxShadow: "0 8px 32px rgba(28,37,81,0.22)", zIndex: 9999, ...ff,
    }}>
      {msg}
    </div>
  );
}

interface Props {
  sessionId: string;
  isFaculty: boolean;
}

export default function ActionTags({ sessionId, isFaculty }: Props) {
  const [open,    setOpen]   = useState(false);
  const [items,   setItems]  = useState<ActionItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);
  const [toast,   setToast]  = useState<{ msg: string; color: string } | null>(null);

  // Add form state
  const [adding,   setAdding]   = useState(false);
  const [formDesc, setFormDesc] = useState("");
  const [formPart, setFormPart] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving,   setSaving]   = useState(false);

  // Load on first expand
  async function loadItems() {
    if (loaded) return;
    setLoading(true);
    try {
      const r = await sessionsApi.listActionItems(sessionId);
      setItems(r.data ?? []);
      setLoaded(true);
    } catch {
      setToast({ msg: "Failed to load action items", color: "#ef4444" });
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) loadItems();
  }

  async function cycleStatus(item: ActionItemDTO) {
    const next = STATUS_CYCLE[item.status] ?? "open";
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i));
    try {
      await sessionsApi.updateActionItem(sessionId, item.id, { status: next });
    } catch {
      // Revert on failure
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i));
      setToast({ msg: "Failed to update status", color: "#ef4444" });
    }
  }

  async function submitAction() {
    if (!formDesc.trim()) {
      setToast({ msg: "Description is required", color: "#f59e0b" });
      return;
    }
    setSaving(true);
    try {
      const r = await sessionsApi.createActionItem(sessionId, {
        description:    formDesc.trim(),
        participant_id: formPart.trim() || undefined,
        due_date:       formDate || undefined,
      });
      if (r.data) {
        setItems(prev => [...prev, r.data!]);
        setFormDesc("");
        setFormPart("");
        setFormDate("");
        setAdding(false);
      }
    } catch {
      setToast({ msg: "Failed to create action item", color: "#ef4444" });
    } finally {
      setSaving(false);
    }
  }

  if (!isFaculty) return null;

  return (
    <>
      <div style={{ borderTop: "1px solid #EAECF4", marginTop: 16, paddingTop: 14 }}>
        {/* Collapsible header */}
        <button
          onClick={toggleOpen}
          style={{
            ...ff,
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", background: "none", border: "none",
            cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0,
          }}
        >
          <span style={{ fontSize: 12, color: "#8b90a7" }}>{open ? "▾" : "▸"}</span>
          <span style={{ ...ff, fontSize: 12, fontWeight: 700, color: "#1C2551" }}>
            Action Tags
          </span>
          {loaded && items.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#EF4E24",
              background: "#EF4E2420", borderRadius: 20, padding: "2px 8px", marginLeft: 4,
            }}>
              {items.length}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#8b90a7" }}>
            {open ? "collapse" : "expand"}
          </span>
        </button>

        {open && (
          <div>
            {loading ? (
              <div style={{ ...ff, fontSize: 12, color: "#8b90a7", padding: "8px 0" }}>
                Loading…
              </div>
            ) : (
              <>
                {/* Action list */}
                {items.length === 0 && !adding ? (
                  <div style={{ ...ff, fontSize: 12, color: "#8b90a7", padding: "8px 0" }}>
                    No action items yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                    {items.map(item => (
                      <div key={item.id} style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        background: "#FAFBFD", borderRadius: 8, padding: "10px 12px",
                        border: "1px solid #EAECF4",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            ...ff, fontSize: 12, fontWeight: 600, color: "#1C2551",
                            textDecoration: item.status === "completed" ? "line-through" : "none",
                            color: item.status === "completed" ? "#8b90a7" : "#1C2551",
                          }}>
                            {item.description}
                          </div>
                          {item.due_date && (
                            <div style={{ ...ff, fontSize: 10, color: "#8b90a7", marginTop: 2 }}>
                              Due {new Date(item.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </div>
                          )}
                        </div>
                        {/* Clickable status badge */}
                        <button
                          onClick={() => cycleStatus(item)}
                          title="Click to cycle status"
                          style={{
                            ...ff, fontSize: 10, fontWeight: 700, borderRadius: 20,
                            padding: "3px 10px", border: "none", cursor: "pointer",
                            flexShrink: 0,
                            ...STATUS_STYLE[item.status],
                          }}
                        >
                          {STATUS_LABEL[item.status] ?? item.status}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add form */}
                {adding ? (
                  <div style={{
                    background: "#F5F7FB", borderRadius: 10, padding: "14px 14px",
                    border: "1px solid #EAECF4", display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Action description…"
                      value={formDesc}
                      onChange={e => setFormDesc(e.target.value)}
                      style={{
                        ...ff, border: "1px solid #EAECF4", borderRadius: 7,
                        padding: "8px 10px", fontSize: 12, color: "#1C2551",
                        outline: "none", width: "100%", boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Participant ID (optional)"
                        value={formPart}
                        onChange={e => setFormPart(e.target.value)}
                        style={{
                          ...ff, flex: 1, border: "1px solid #EAECF4", borderRadius: 7,
                          padding: "8px 10px", fontSize: 12, color: "#1C2551",
                          outline: "none", boxSizing: "border-box",
                        }}
                      />
                      <input
                        type="date"
                        value={formDate}
                        onChange={e => setFormDate(e.target.value)}
                        style={{
                          ...ff, border: "1px solid #EAECF4", borderRadius: 7,
                          padding: "8px 10px", fontSize: 12, color: "#1C2551",
                          outline: "none",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => { setAdding(false); setFormDesc(""); setFormPart(""); setFormDate(""); }}
                        style={{
                          ...ff, fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 7,
                          border: "1px solid #EAECF4", background: "#fff", color: "#8b90a7", cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitAction}
                        disabled={saving}
                        style={{
                          ...ff, fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 7,
                          border: "none", background: saving ? "#8b90a7" : "#EF4E24",
                          color: "#fff", cursor: saving ? "not-allowed" : "pointer",
                        }}
                      >
                        {saving ? "Saving…" : "Add"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAdding(true)}
                    style={{
                      ...ff, fontSize: 11, fontWeight: 700, color: "#EF4E24",
                      background: "none", border: "1px dashed #EF4E2440",
                      borderRadius: 7, padding: "7px 14px", cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    + Add Action
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} onClose={() => setToast(null)} />}
    </>
  );
}
