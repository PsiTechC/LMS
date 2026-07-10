"use client";

import { useState, useEffect, useCallback } from "react";
import {
  feedback360ManageApi,
  frameworkApi,
  CycleDetail,
  QuorumConfig,
  OpenQuestion,
} from "@/lib/feedback360-manage-api";
import {
  C, ff, cardBox, microLabel, inputStyle, btnPrimary, btnSecondary, btnDisabled, Toggle, CircularCounter,
} from "./styles";

// Five-step Configure wizard for the organization's single 360° configuration:
//   1. Competencies    — add competencies (name + definition)
//   2. Behaviors       — per competency (accordion), the behavior statements raters
//                        rate on a 1–5 scale, each with a "mandatory" toggle
//   3. Open Questions  — three org-level free-text prompts, each with a mandatory toggle
//   4. Quorum          — min responses per relationship
//   5. Review & Lock   — freeze config, move to Assign
//
// Each step has its own Save; the config stays 'draft'/'configuring' until Lock,
// so the admin can leave and resume from the saved framework.

interface WizardCompetency {
  id: string;
  title: string;
  definition: string;
  behaviors: WizardBehavior[];
}
// A behavior statement IS the item a rater rates — there is no separate question.
interface WizardBehavior {
  id: string;         // real id, or tmp-… until first persisted
  statement: string;
  mandatory: boolean; // rater must answer (default true)
}

const STEPS = ["Competencies", "Behaviors", "Open Questions", "Quorum", "Review & Lock"];

// Labels for the three fixed open-ended slots. The prompt text itself is editable;
// these labels just orient the admin.
const OPEN_Q_LABELS = ["Question 1", "Question 2", "Question 3"];

export default function ConfigureWizard({
  orgId,
  onDone,
  onCancel,
}: {
  orgId?: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  // Furthest step reached this session — anything up to it is freely revisitable.
  const [maxStep, setMaxStep] = useState(0);
  const [cycle, setCycle] = useState<CycleDetail | null>(null);
  const [comps, setComps] = useState<WizardCompetency[]>([]);
  const [quorum, setQuorum] = useState<QuorumConfig>({
    skip_manager: 0, manager: 1, peer: 2, direct_report: 1, others: 0, others_label: "",
  });
  // Always exactly three open-ended slots; the server pre-fills prompts.
  const [openQs, setOpenQs] = useState<OpenQuestion[]>([
    { prompt: "", mandatory: true, sort_order: 0 },
    { prompt: "", mandatory: true, sort_order: 1 },
    { prompt: "", mandatory: true, sort_order: 2 },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [err, setErr] = useState("");

  // ── Load cycle + framework ──────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await feedback360ManageApi.getConfig(orgId);
      const c = res.data;
      setCycle(c);
      setQuorum({ ...c.quorum, others_label: c.quorum.others_label ?? "" });
      // Normalize to exactly three slots (server sends its set or the org pre-fill).
      setOpenQs(normalizeOpenQs(c.open_questions));
      // A previously-locked (e.g. reopened) cycle is fully configured — every
      // step is already valid, so allow jumping straight to any of them.
      if (c.was_locked) setMaxStep(STEPS.length - 1);
      const compRes = await frameworkApi.listCompetencies(c.org_id);
      const withBehaviors = await Promise.all(
        (compRes.data ?? []).map(async (comp) => {
          const bRes = await frameworkApi.listBehaviors(comp.id);
          return {
            id: comp.id,
            title: comp.title,
            definition: comp.description ?? "",
            behaviors: (bRes.data ?? []).map((b) => ({
              id: b.id,
              statement: b.statement,
              mandatory: b.mandatory,
            })),
          } as WizardCompetency;
        }),
      );
      setComps(withBehaviors);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  function flashSaved() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }

  // ── Competency editing ──────────────────────────────────────────
  async function addCompetency() {
    if (!cycle) return;
    try {
      // Backend requires a non-empty title on create; seed one and let the admin rename.
      const seed = `Competency ${comps.length + 1}`;
      const res = await frameworkApi.createCompetency(cycle.org_id, {
        title: seed, description: "", category: "leadership",
      });
      setComps((cs) => [...cs, { id: res.data.id, title: seed, definition: "", behaviors: [] }]);
    } catch (e) { setErr((e as Error).message); }
  }

  function patchCompetency(idx: number, patch: Partial<Pick<WizardCompetency, "title" | "definition">>) {
    setComps((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function persistCompetency(idx: number) {
    const comp = comps[idx];
    if (!comp.title.trim()) return; // don't blank a required title
    try {
      await frameworkApi.updateCompetency(comp.id, { title: comp.title.trim(), description: comp.definition });
    } catch { /* re-sent implicitly via subsequent edits */ }
  }

  async function deleteCompetency(idx: number) {
    const comp = comps[idx];
    setComps((cs) => cs.filter((_, i) => i !== idx));
    try { await frameworkApi.deleteCompetency(comp.id); } catch { /* ignore */ }
  }

  // ── Behavior editing (create locally, persist on blur) ──────────
  function addBehavior(compIdx: number) {
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setComps((cs) => cs.map((c, i) => i === compIdx
      ? { ...c, behaviors: [...c.behaviors, { id: tmpId, statement: "", mandatory: true }] }
      : c));
  }

  function patchBehavior(compIdx: number, bIdx: number, patch: Partial<WizardBehavior>) {
    setComps((cs) => cs.map((c, i) => i === compIdx
      ? { ...c, behaviors: c.behaviors.map((b, j) => (j === bIdx ? { ...b, ...patch } : b)) }
      : c));
  }

  // Persist a behavior. Creates on first save (needs a statement), updates after.
  // Toggle changes should persist immediately too, so we accept an override.
  async function persistBehavior(compIdx: number, bIdx: number, override?: Partial<WizardBehavior>) {
    const comp = comps[compIdx];
    const b = { ...comp.behaviors[bIdx], ...override };
    if (!b.statement.trim()) return;
    try {
      const body = {
        statement: b.statement.trim(),
        mandatory: b.mandatory,
        sort_order: bIdx,
      };
      if (b.id.startsWith("tmp-")) {
        const res = await frameworkApi.createBehavior(comp.id, body);
        const realId = res.data.id;
        setComps((cs) => cs.map((c, i) => i === compIdx
          ? { ...c, behaviors: c.behaviors.map((x, j) => (j === bIdx ? { ...x, id: realId } : x)) }
          : c));
      } else {
        await frameworkApi.updateBehavior(b.id, body);
      }
    } catch { /* the lock payload re-sends the full snapshot regardless */ }
  }

  async function deleteBehavior(compIdx: number, bIdx: number) {
    const b = comps[compIdx].behaviors[bIdx];
    setComps((cs) => cs.map((c, i) => i === compIdx
      ? { ...c, behaviors: c.behaviors.filter((_, j) => j !== bIdx) } : c));
    if (!b.id.startsWith("tmp-")) {
      try { await frameworkApi.deleteBehavior(b.id); } catch { /* ignore */ }
    }
  }

  // ── Step Save actions ───────────────────────────────────────────
  async function saveStep(): Promise<boolean> {
    setErr("");
    try {
      if (step === 0) {
        await Promise.all(comps.map((c, i) => persistCompetency(i)));
      }
      if (step === 1) {
        // persist every behavior that has a statement
        await Promise.all(comps.flatMap((c, ci) =>
          c.behaviors.map((_, bi) => persistBehavior(ci, bi))));
      }
      if (step === 2) {
        const filled = openQs.filter((q) => q.prompt.trim());
        if (filled.length === 0) {
          setErr("Add at least one open-ended question.");
          return false;
        }
        await feedback360ManageApi.saveOpenQuestions(orgId, openQs);
      }
      if (step === 3) {
        if (quorum.others >= 1 && !quorum.others_label.trim()) {
          setErr("Name the “Others” category before continuing.");
          return false;
        }
        await feedback360ManageApi.saveQuorum(orgId, quorum);
      }
      flashSaved();
      return true;
    } catch (e) { setErr((e as Error).message); return false; }
  }

  function goTo(i: number) {
    const target = Math.max(0, Math.min(i, STEPS.length - 1));
    setStep(target);
    setMaxStep((m) => Math.max(m, target));
  }

  async function next() {
    if (!(await saveStep())) return;
    goTo(step + 1);
  }
  function back() { setErr(""); setStep((s) => Math.max(s - 1, 0)); }

  // Stepper click. Moving backward is free (work is saved per step); moving
  // forward saves the current step first so nothing is silently dropped.
  async function jump(target: number) {
    setErr("");
    if (target === step) return;
    if (target > step) {
      if (!(await saveStep())) return;
    }
    goTo(target);
  }

  async function lock() {
    setSaving(true); setErr("");
    try {
      const payload = {
        quorum,
        open_questions: openQs
          .filter((q) => q.prompt.trim())
          .map((q, i) => ({ prompt: q.prompt.trim(), mandatory: q.mandatory, sort_order: i })),
        competencies: comps
          .filter((c) => c.title.trim() && c.behaviors.some((b) => b.statement.trim()))
          .map((c) => ({
            competency_id: c.id,
            title: c.title.trim(),
            behaviors: c.behaviors
              .filter((b) => b.statement.trim())
              .map((b, i) => ({
                statement: b.statement.trim(),
                mandatory: b.mandatory,
                sort_order: i,
              })),
          })),
      };
      if (payload.competencies.length === 0) {
        setErr("Add at least one competency with a behavior statement before locking.");
        setSaving(false); return;
      }
      await feedback360ManageApi.lockConfig(orgId, payload);
      onDone();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  if (loading) return <div style={{ ...ff, padding: 40, color: C.muted }}>Loading configuration…</div>;

  return (
    <div style={{ ...ff, display: "flex", flexDirection: "column", gap: 16 }}>
      <Stepper
        step={step}
        maxStep={maxStep}
        allStepsUnlocked={!!cycle?.was_locked}
        onJump={jump}
      />
      {err && <div style={banner.err}>{err}</div>}

      {step === 0 && (
        <CompetenciesStep
          comps={comps}
          onAdd={addCompetency}
          onPatch={patchCompetency}
          onPersist={persistCompetency}
          onDelete={deleteCompetency}
        />
      )}
      {step === 1 && (
        <BehaviorsStep
          comps={comps}
          onAddBehavior={addBehavior}
          onPatchBehavior={patchBehavior}
          onPersistBehavior={persistBehavior}
          onDeleteBehavior={deleteBehavior}
        />
      )}
      {step === 2 && <OpenQuestionsStep openQs={openQs} setOpenQs={setOpenQs} />}
      {step === 3 && <QuorumStep quorum={quorum} setQuorum={setQuorum} />}
      {step === 4 && <ReviewStep comps={comps} quorum={quorum} openQs={openQs} />}

      {/* Footer nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <button style={btnSecondary} onClick={step === 0 ? onCancel : back}>
          {step === 0 ? "Cancel" : "← Back"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {savedFlash && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Saved as draft</span>}
          {step < STEPS.length - 1 ? (
            <button style={btnPrimary} onClick={next}>Save & Continue →</button>
          ) : (
            <button
              style={{ ...btnPrimary, ...(saving ? btnDisabled : {}) }}
              disabled={saving}
              onClick={lock}
            >
              {saving ? "Locking…" : "Lock & Continue to Assign"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────
// Steps are clickable. A step is reachable if it has already been visited
// (<= maxStep), or if the cycle has been through a full Review & Lock at least
// once — a reopened cycle is fully configured, so every step is jumpable.
function Stepper({
  step, maxStep, allStepsUnlocked, onJump,
}: {
  step: number;
  maxStep: number;
  allStepsUnlocked: boolean;
  onJump: (i: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        const reachable = allStepsUnlocked || i <= maxStep;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => reachable && !active && onJump(i)}
              disabled={!reachable}
              title={reachable ? `Go to ${label}` : "Complete the earlier steps first"}
              style={{
                ...ff, display: "flex", alignItems: "center", gap: 8, background: "transparent",
                border: "none", padding: 0, minWidth: 0,
                cursor: reachable && !active ? "pointer" : reachable ? "default" : "not-allowed",
                opacity: reachable ? 1 : 0.55,
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: active ? C.orange : done ? C.navy : C.alt,
                color: active || done ? "#fff" : C.muted,
              }}>{done ? "✓" : i + 1}</span>
              {/* Use the longhand properties only — mixing `textDecoration`
                  (shorthand) with `textDecorationColor` makes React warn about
                  conflicting style props on re-render. */}
              <span style={{
                fontSize: 12, fontWeight: active ? 700 : 500,
                color: active ? C.navy : C.muted, whiteSpace: "nowrap",
                textDecorationLine: reachable && !active ? "underline" : "none",
                textDecorationColor: C.border,
                textUnderlineOffset: 3,
              }}>
                {label}
              </span>
            </button>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: C.border, minWidth: 12 }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 2: competencies (name + definition only) ─────────────────
function CompetenciesStep({
  comps, onAdd, onPatch, onPersist, onDelete,
}: {
  comps: WizardCompetency[];
  onAdd: () => void;
  onPatch: (idx: number, patch: Partial<Pick<WizardCompetency, "title" | "definition">>) => void;
  onPersist: (idx: number) => void;
  onDelete: (idx: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: C.muted }}>
        Define the competencies raters will assess. You&apos;ll add the behavior statements and questions for each in the next step.
      </div>

      {comps.map((comp, ci) => (
        <div key={comp.id} style={{ ...cardBox, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={microLabel}>Competency Name</div>
            <input
              style={{ ...inputStyle, fontWeight: 700 }}
              value={comp.title}
              onChange={(e) => onPatch(ci, { title: e.target.value })}
              onBlur={() => onPersist(ci)}
              placeholder="e.g. Strategic Thinking"
            />
            <div style={{ ...microLabel, marginTop: 10 }}>Definition</div>
            <textarea
              style={{ ...inputStyle, minHeight: 46, resize: "vertical", lineHeight: 1.5 }}
              value={comp.definition}
              onChange={(e) => onPatch(ci, { definition: e.target.value })}
              onBlur={() => onPersist(ci)}
              placeholder="What this competency means in this program's context."
            />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
              {comp.behaviors.length} behavior{comp.behaviors.length === 1 ? "" : "s"} added
            </div>
          </div>
          <button
            style={{ ...btnSecondary, color: C.danger, borderColor: "rgba(239,68,68,0.25)", marginTop: 18 }}
            onClick={() => onDelete(ci)}
          >Remove</button>
        </div>
      ))}

      <button style={{ ...btnSecondary, alignSelf: "flex-start" }} onClick={onAdd}>+ Add competency</button>
    </div>
  );
}

// ── Step 3: behaviors & questions (accordion per competency) ──────
function BehaviorsStep({
  comps, onAddBehavior, onPatchBehavior, onPersistBehavior, onDeleteBehavior,
}: {
  comps: WizardCompetency[];
  onAddBehavior: (compIdx: number) => void;
  onPatchBehavior: (compIdx: number, bIdx: number, patch: Partial<WizardBehavior>) => void;
  onPersistBehavior: (compIdx: number, bIdx: number, override?: Partial<WizardBehavior>) => void;
  onDeleteBehavior: (compIdx: number, bIdx: number) => void;
}) {
  // Open the first competency by default.
  const [openIdx, setOpenIdx] = useState<number>(0);

  const named = comps.filter((c) => c.title.trim());
  if (named.length === 0) {
    return (
      <div style={{ ...cardBox, textAlign: "center", color: C.muted, fontSize: 13, padding: 32 }}>
        No competencies yet. Go back to the previous step and add at least one competency first.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: C.muted }}>
        For each competency, add the behavior statements raters will rate on a 1–5 scale. Each statement is
        rated as written. Toggle an item to Optional if an answer shouldn&apos;t be required.
      </div>

      {comps.map((comp, ci) => {
        if (!comp.title.trim()) return null;
        const open = openIdx === ci;
        return (
          <div key={comp.id} style={{ ...cardBox, padding: 0, overflow: "hidden" }}>
            {/* Accordion header */}
            <button
              onClick={() => setOpenIdx(open ? -1 : ci)}
              style={{
                ...ff, width: "100%", textAlign: "left", cursor: "pointer",
                background: open ? C.page : "#fff", border: "none", padding: "14px 18px",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{comp.title}</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {comp.behaviors.filter((b) => b.statement.trim()).length} statement{comp.behaviors.filter((b) => b.statement.trim()).length === 1 ? "" : "s"}
                </div>
              </div>
              <span style={{ fontSize: 12, color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
            </button>

            {open && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                {comp.behaviors.map((b, bi) => (
                  <BehaviorEditor
                    key={b.id}
                    behavior={b}
                    onPatch={(patch) => onPatchBehavior(ci, bi, patch)}
                    onPersist={(override) => onPersistBehavior(ci, bi, override)}
                    onDelete={() => onDeleteBehavior(ci, bi)}
                  />
                ))}
                <button style={{ ...btnSecondary, alignSelf: "flex-start" }} onClick={() => onAddBehavior(ci)}>
                  + Add behavior statement
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BehaviorEditor({
  behavior, onPatch, onPersist, onDelete,
}: {
  behavior: WizardBehavior;
  onPatch: (patch: Partial<WizardBehavior>) => void;
  onPersist: (override?: Partial<WizardBehavior>) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ background: C.page, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={microLabel}>Behavior Statement</div>
        <button
          onClick={onDelete}
          style={{ ...ff, background: "transparent", border: "none", color: C.muted, fontSize: 11, cursor: "pointer" }}
        >✕ remove</button>
      </div>
      <input
        style={inputStyle}
        value={behavior.statement}
        onChange={(e) => onPatch({ statement: e.target.value })}
        onBlur={() => onPersist()}
        placeholder="e.g. Communicates a clear and compelling vision to the team."
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <Toggle
          on={behavior.mandatory}
          onColor={C.navy}
          onChange={(v) => { onPatch({ mandatory: v }); onPersist({ mandatory: v }); }}
        />
        <span style={{ fontSize: 12, color: C.navy, fontWeight: 500 }}>
          {behavior.mandatory ? "Mandatory" : "Optional"}
        </span>
      </div>
    </div>
  );
}

// ── Step 4: open-ended questions (three fixed slots) ──────────────

// normalizeOpenQs coerces whatever the server returns into exactly three slots,
// preserving order and filling any gaps with empty mandatory prompts.
function normalizeOpenQs(qs?: OpenQuestion[]): OpenQuestion[] {
  const out: OpenQuestion[] = [];
  for (let i = 0; i < 3; i++) {
    const found = qs?.find((q) => q.sort_order === i) ?? qs?.[i];
    out.push({
      prompt: found?.prompt ?? "",
      mandatory: found ? found.mandatory : true,
      sort_order: i,
    });
  }
  return out;
}

function OpenQuestionsStep({
  openQs, setOpenQs,
}: {
  openQs: OpenQuestion[];
  setOpenQs: (q: OpenQuestion[]) => void;
}) {
  function patch(idx: number, p: Partial<OpenQuestion>) {
    setOpenQs(openQs.map((q, i) => (i === idx ? { ...q, ...p } : q)));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
        Three free-text questions asked once at the end of the form, after all competencies. Raters answer these in
        their own words. Reword any prompt to suit this cycle, and toggle a question to Optional if an answer
        shouldn&apos;t be required.
      </div>

      {openQs.map((q, i) => (
        <div key={i} style={cardBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ ...microLabel, marginBottom: 0 }}>{OPEN_Q_LABELS[i]}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Toggle on={q.mandatory} onChange={(v) => patch(i, { mandatory: v })} onColor={C.navy} />
              <span style={{ fontSize: 12, color: C.navy, fontWeight: 500 }}>
                {q.mandatory ? "Mandatory" : "Optional"}
              </span>
            </div>
          </div>
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: "vertical", lineHeight: 1.5 }}
            value={q.prompt}
            onChange={(e) => patch(i, { prompt: e.target.value })}
            placeholder="e.g. What should this person START doing to be more effective?"
          />
        </div>
      ))}
    </div>
  );
}

// ── Step 5: quorum ────────────────────────────────────────────────

// Only the numeric quorum fields — others_label is edited separately.
type QuorumCountKey = "skip_manager" | "manager" | "peer" | "direct_report" | "others";

function QuorumStep({ quorum, setQuorum }: { quorum: QuorumConfig; setQuorum: (q: QuorumConfig) => void }) {
  const fields: { key: QuorumCountKey; label: string; hint: string }[] = [
    { key: "skip_manager", label: "Skip-Level Manager", hint: "Manager's manager" },
    { key: "manager", label: "Manager", hint: "Direct manager" },
    { key: "peer", label: "Peer", hint: "Colleagues at a similar level" },
    { key: "direct_report", label: "Direct Report", hint: "People who report to them" },
    { key: "others", label: "Others", hint: "Stakeholders / cross-functional" },
  ];
  const needsOthersLabel = quorum.others >= 1;

  return (
    <div style={cardBox}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 4 }}>Minimum Responses (Quorum)</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
        The minimum completed responses required per relationship category for a valid 360°. Self is always required
        (fixed at 1) and isn&apos;t shown. Set a category to 0 to switch it off.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        {fields.map((f) => (
          <div key={f.key} style={{
            background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={microLabel}>
              {f.key === "others" && quorum.others_label.trim() ? quorum.others_label.trim() : f.label}
            </div>
            <div style={{ margin: "10px 0 8px" }}>
              <CircularCounter
                value={quorum[f.key]}
                min={0}
                max={20}
                ariaLabel={f.label}
                onChange={(v) => setQuorum({ ...quorum, [f.key]: v })}
              />
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>
              {quorum[f.key] === 0 ? "Not required" : f.hint}
            </div>
          </div>
        ))}
      </div>

      {/* Naming the Others category. Required once its minimum is >= 1 — an
          unnamed one would show participants a meaningless "Others" bucket. */}
      {needsOthersLabel && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={microLabel}>Name the &ldquo;Others&rdquo; category</div>
          <div style={{ fontSize: 11, color: C.muted, margin: "0 0 8px" }}>
            Participants will see this name when nominating reviewers into this category.
          </div>
          <input
            style={{ ...inputStyle, maxWidth: 340 }}
            value={quorum.others_label}
            onChange={(e) => setQuorum({ ...quorum, others_label: e.target.value })}
            placeholder="e.g. Customers, External Stakeholders"
          />
          {!quorum.others_label.trim() && (
            <div style={{ fontSize: 10, color: C.danger, marginTop: 6 }}>
              Required — you&apos;ve asked for {quorum.others} response{quorum.others === 1 ? "" : "s"} in this category.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 6: review & lock ─────────────────────────────────────────
function ReviewStep({
  comps, quorum, openQs,
}: {
  comps: WizardCompetency[];
  quorum: QuorumConfig;
  openQs: OpenQuestion[];
}) {
  const usable = comps.filter((c) => c.title.trim() && c.behaviors.some((b) => b.statement.trim()));
  const totalBehaviors = usable.reduce((n, c) => n + c.behaviors.filter((b) => b.statement.trim()).length, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={cardBox}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 10 }}>
          Framework · {usable.length} competencies · {totalBehaviors} statements
        </div>
        {usable.map((c) => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{c.title}</div>
            {c.behaviors.filter((b) => b.statement.trim()).map((b, i) => (
              <div key={i} style={{ fontSize: 12, color: C.muted, marginTop: 4, paddingLeft: 10, display: "flex", gap: 6 }}>
                <span>•</span>
                <span style={{ flex: 1 }}>{b.statement}</span>
                {!b.mandatory && <span style={{ fontSize: 10, color: C.amber, fontWeight: 700 }}>OPTIONAL</span>}
              </div>
            ))}
          </div>
        ))}
        {usable.length === 0 && <div style={{ fontSize: 12, color: C.danger }}>No competencies with behavior statements yet.</div>}
      </div>

      <div style={cardBox}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 10 }}>
          Open-Ended Questions · {openQs.filter((q) => q.prompt.trim()).length}
        </div>
        {openQs.filter((q) => q.prompt.trim()).map((q, i) => (
          <div key={i} style={{ fontSize: 12, color: C.muted, marginTop: 6, display: "flex", gap: 6 }}>
            <span style={{ fontWeight: 700, color: C.navy, flexShrink: 0 }}>{i + 1}.</span>
            <span style={{ flex: 1 }}>{q.prompt}</span>
            {!q.mandatory && <span style={{ fontSize: 10, color: C.amber, fontWeight: 700 }}>OPTIONAL</span>}
          </div>
        ))}
        {openQs.every((q) => !q.prompt.trim()) && (
          <div style={{ fontSize: 12, color: C.danger }}>No open-ended questions set.</div>
        )}
      </div>

      <div style={cardBox}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 10 }}>Quorum (min responses)</div>
        <div style={{ fontSize: 12, color: C.navy, display: "flex", flexWrap: "wrap", gap: 16 }}>
          <span>Self: <b>1</b></span>
          <span>Manager: <b>{quorum.manager}</b></span>
          <span>Skip-Level: <b>{quorum.skip_manager}</b></span>
          <span>Peer: <b>{quorum.peer}</b></span>
          <span>Direct Report: <b>{quorum.direct_report}</b></span>
          <span>{quorum.others_label.trim() || "Others"}: <b>{quorum.others}</b></span>
        </div>
      </div>

      <div style={{ ...cardBox, background: "rgba(239,78,36,0.05)", borderColor: "rgba(239,78,36,0.25)" }}>
        <div style={{ fontSize: 12, color: C.navy, lineHeight: 1.6 }}>
          <b>Locking snapshots this cycle&apos;s configuration.</b> The competencies, questions, and quorum above are
          copied onto this cycle, so later edits to your org&apos;s live framework won&apos;t change it. You&apos;ll then move to
          the Assign step to add participants. You can reopen this cycle later from the dashboard to edit and
          re-lock it.
        </div>
      </div>
    </div>
  );
}

const banner = {
  err: {
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444",
  } as React.CSSProperties,
};
