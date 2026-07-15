"use client";

import { Question, QuestionType } from "@/lib/content-api";
import { inputStyle, uid, NAVY, MUTED, INDIGO, BORDER, BG } from "./shared";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple Choice",
  true_false: "True / False",
  matching: "Matching",
  open: "Open-Ended",
  scale: "Agree/Disagree Scale",
};

export const ALLOWED_TYPES_BY_ASSET: Record<string, QuestionType[]> = {
  quiz: ["mcq", "true_false", "matching", "open"],
  // Assessments are graded knowledge checks — same question shapes (and the
  // same correct_index/correct_text scoring semantics) as quiz. Design
  // Studio already collapses both the "Quiz" and "Assessment" element chips
  // to the same backend activities.type ("assessment"), so this keeps the
  // content-authoring side consistent with that.
  assessment: ["mcq", "true_false", "matching", "open"],
  // Surveys gauge opinion/sentiment (agree/disagree, satisfaction) rather
  // than right/wrong or knowledge-check answers — mcq, true_false, and
  // matching are all assessment-style formats and don't belong here.
  // "scale" is the Likert agree/disagree question (see blankQuestion below —
  // defaults to Strongly Disagree..Strongly Agree, 1-5).
  survey: ["scale", "open"],
  l1_reaction: ["scale", "mcq", "open"],
  l2_learning: ["scale", "mcq", "open"],
  l3_behaviour: ["scale", "mcq", "open"],
  l4_impact: ["scale", "mcq", "open"],
};

export const ASSET_TYPE_LABELS: Record<string, string> = {
  quiz: "Quiz",
  assessment: "Assessment",
  survey: "Survey",
  l1_reaction: "L1 · Reaction",
  l2_learning: "L2 · Learning",
  l3_behaviour: "L3 · Behaviour",
  l4_impact: "L4 · Impact",
};

export function blankQuestion(type: QuestionType): Question {
  const base: Question = { id: uid(), type, text: "", sort_order: 0 };
  if (type === "mcq") return { ...base, options: ["", ""], correct_index: 0 };
  if (type === "true_false") return { ...base, correct_index: 0 };
  if (type === "matching") return { ...base, match_pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
  if (type === "scale") return { ...base, scale_min: 1, scale_max: 5, scale_labels: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"] };
  return base;
}

export function QuestionRow({ index, question, allowedTypes, onChangeType, onUpdate, onRemove }: {
  index: number;
  question: Question;
  allowedTypes: QuestionType[];
  onChangeType: (t: QuestionType) => void;
  onUpdate: (patch: Partial<Question>) => void;
  onRemove: () => void;
}) {
  const q = question;

  function setOption(i: number, value: string) {
    const options = [...(q.options ?? [])];
    options[i] = value;
    onUpdate({ options });
  }
  function addOption() {
    onUpdate({ options: [...(q.options ?? []), ""] });
  }
  function removeOption(i: number) {
    const options = (q.options ?? []).filter((_, oi) => oi !== i);
    const correct = q.correct_index != null && q.correct_index >= options.length ? 0 : q.correct_index;
    onUpdate({ options, correct_index: correct });
  }
  function setPair(i: number, side: "left" | "right", value: string) {
    const pairs = [...(q.match_pairs ?? [])];
    pairs[i] = { ...pairs[i], [side]: value };
    onUpdate({ match_pairs: pairs });
  }
  function addPair() {
    onUpdate({ match_pairs: [...(q.match_pairs ?? []), { left: "", right: "" }] });
  }
  function removePair(i: number) {
    onUpdate({ match_pairs: (q.match_pairs ?? []).filter((_, pi) => pi !== i) });
  }

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, background: BG }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: "#fff", color: NAVY, fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{index + 1}</div>
        <select value={q.type} onChange={(e) => onChangeType(e.target.value as QuestionType)} style={{ ...inputStyle, width: "auto", flex: "0 0 160px" }}>
          {allowedTypes.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={onRemove} style={{ fontSize: 11, color: "#ef4444", border: "none", background: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontWeight: 600 }}>Remove</button>
      </div>

      <input
        value={q.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        style={{ ...inputStyle, background: "#fff", marginBottom: 10 }}
        placeholder="Question text"
      />

      {q.type === "mcq" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(q.options ?? []).map((opt, oi) => (
            <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="radio" checked={q.correct_index === oi} onChange={() => onUpdate({ correct_index: oi })} title="Mark as correct" />
              <input value={opt} onChange={(e) => setOption(oi, e.target.value)} style={{ ...inputStyle, background: "#fff" }} placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
              {(q.options?.length ?? 0) > 2 && (
                <button onClick={() => removeOption(oi)} style={{ fontSize: 14, color: MUTED, border: "none", background: "none", cursor: "pointer" }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={addOption} style={{ fontSize: 11, color: INDIGO, border: "none", background: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontWeight: 600, textAlign: "left" }}>+ Add option</button>
        </div>
      )}

      {q.type === "true_false" && (
        <div style={{ display: "flex", gap: 10 }}>
          {["True", "False"].map((label, oi) => (
            <label key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: NAVY }}>
              <input type="radio" checked={q.correct_index === oi} onChange={() => onUpdate({ correct_index: oi })} /> {label}
            </label>
          ))}
        </div>
      )}

      {q.type === "matching" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(q.match_pairs ?? []).map((p, pi) => (
            <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input value={p.left} onChange={(e) => setPair(pi, "left", e.target.value)} style={{ ...inputStyle, background: "#fff" }} placeholder="Item" />
              <span style={{ color: MUTED, fontSize: 12 }}>→</span>
              <input value={p.right} onChange={(e) => setPair(pi, "right", e.target.value)} style={{ ...inputStyle, background: "#fff" }} placeholder="Match" />
              {(q.match_pairs?.length ?? 0) > 2 && (
                <button onClick={() => removePair(pi)} style={{ fontSize: 14, color: MUTED, border: "none", background: "none", cursor: "pointer" }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={addPair} style={{ fontSize: 11, color: INDIGO, border: "none", background: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontWeight: 600, textAlign: "left" }}>+ Add pair</button>
        </div>
      )}

      {q.type === "scale" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" value={q.scale_min ?? 1} onChange={(e) => onUpdate({ scale_min: parseInt(e.target.value) || 1 })} style={{ ...inputStyle, background: "#fff", width: 70 }} placeholder="Min" />
            <input type="number" value={q.scale_max ?? 5} onChange={(e) => onUpdate({ scale_max: parseInt(e.target.value) || 5 })} style={{ ...inputStyle, background: "#fff", width: 70 }} placeholder="Max" />
          </div>
          <input
            value={(q.scale_labels ?? []).join(", ")}
            onChange={(e) => onUpdate({ scale_labels: e.target.value.split(",").map((s) => s.trim()) })}
            style={{ ...inputStyle, background: "#fff" }}
            placeholder="Labels, comma-separated (e.g. Strongly Disagree, ..., Strongly Agree)"
          />
        </div>
      )}

      {q.type === "open" && (
        <input
          value={q.correct_text ?? ""}
          onChange={(e) => onUpdate({ correct_text: e.target.value })}
          style={{ ...inputStyle, background: "#fff" }}
          placeholder="Model answer (optional)"
        />
      )}
    </div>
  );
}

// Editable list wrapper — add/remove/update questions for a given asset type.
export function QuestionEditorList({ assetType, questions, onChange }: {
  assetType: string;
  questions: Question[];
  onChange: (questions: Question[]) => void;
}) {
  const allowedTypes = ALLOWED_TYPES_BY_ASSET[assetType] ?? ["mcq", "open"];

  function addQuestion() {
    onChange([...questions, blankQuestion(allowedTypes[0])]);
  }
  function updateQuestion(id: string, patch: Partial<Question>) {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function removeQuestion(id: string) {
    onChange(questions.filter((q) => q.id !== id));
  }
  function changeType(id: string, type: QuestionType) {
    onChange(questions.map((q) => (q.id === id ? { ...blankQuestion(type), id: q.id, text: q.text } : q)));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {questions.map((q, i) => (
        <QuestionRow
          key={q.id}
          index={i}
          question={q}
          allowedTypes={allowedTypes}
          onChangeType={(t) => changeType(q.id, t)}
          onUpdate={(patch) => updateQuestion(q.id, patch)}
          onRemove={() => removeQuestion(q.id)}
        />
      ))}
      <button onClick={addQuestion} style={{ padding: "8px 16px", border: `1px dashed ${BORDER}`, borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: NAVY, fontFamily: "Poppins, sans-serif", textAlign: "center" }}>
        + Add Question
      </button>
    </div>
  );
}
