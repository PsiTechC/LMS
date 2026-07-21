import { ProgramDetailDTO } from "@/lib/programs-api";
import { elMeta, isActivityPhase, isModulePhase } from "./DesignStudioModals";
import { elementTypeOf, type LocalPhase } from "./PMDesignStudio";

// Builds a self-contained, branded HTML document for a program - a shareable
// "program brochure" suitable for participants/stakeholders, not just an
// internal design-studio dump. The caller opens it in a new tab and triggers
// window.print(), where "Save as PDF" produces the final PDF - no server-side
// rendering dependency required.

function fmtLong(d: string): string {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch { return d; }
}
function fmtShort(d: string): string {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch { return d; }
}
function weeks(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / (86400000 * 7)));
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildProgramBrochureHTML(program: ProgramDetailDTO, phases: LocalPhase[], progStart: string, progEnd: string): string {
  const progColor = program.color || "#C8A860";
  const totalModules = phases.reduce((n, p) => n + p.modules.length, 0);
  const totalElements = phases.reduce((n, p) => n + p.modules.reduce((nm, m) => nm + m.pre.length + m.post.length, 0) + p.activities.length, 0);
  const durationWeeks = weeks(progStart, progEnd);
  const initial = (program.title?.[0] || "P").toUpperCase();

  const phaseBlocks = phases.map(phase => {
    const modCount = phase.modules.length + phase.activities.length;
    const headerHTML = `
      <div class="phase-hdr" style="background:${phase.color}">
        <span class="phase-icon">${esc(phase.icon)}</span>
        <div class="phase-hdr-text">
          <div class="phase-title">${esc(phase.label)}</div>
          <div class="phase-dates">${fmtShort(phase.startDate)} - ${fmtShort(phase.endDate)}${phase.deliveryMode ? ` &middot; ${phase.deliveryMode === "virtual" ? "🌐 Virtual" : "🏛 In-Person"}` : ""}</div>
        </div>
        <div class="phase-count">${modCount} item${modCount === 1 ? "" : "s"}</div>
      </div>`;

    let bodyHTML = "";
    if (isModulePhase(phase.type)) {
      bodyHTML = phase.modules.map(mod => {
        const renderSlot = (label: string, items: typeof mod.pre, accent: string) => {
          if (!items.length) return "";
          const chips = items.map(el => {
            const meta = elMeta(elementTypeOf(el));
            return `<span class="chip" style="background:${meta.color}14;color:${meta.color};border:1px solid ${meta.color}33">${esc(meta.icon)} ${esc(el.title)}</span>`;
          }).join("");
          return `<div class="slot"><div class="slot-label" style="color:${accent}">${label}</div><div class="chip-row">${chips}</div></div>`;
        };
        return `
          <div class="module-block">
            <div class="module-title">${mod.type === "virtual" ? "🌐" : "🏛"} ${esc(mod.title)}${mod.date ? ` <span class="module-date">- ${fmtShort(mod.date)}</span>` : ""}</div>
            <div class="slot-grid">
              ${renderSlot("PRE-WORK", mod.pre, "#4A5573")}
              ${renderSlot("POST-WORK", mod.post, "#C8A860")}
            </div>
          </div>`;
      }).join("");
      if (!bodyHTML) bodyHTML = `<div class="empty">No modules added yet.</div>`;
    } else if (isActivityPhase(phase.type)) {
      bodyHTML = phase.activities.length
        ? `<div class="activity-list">${phase.activities.map(a => `<div class="activity-row"><span class="dot" style="background:${progColor}"></span>${esc(a.title)}${a.date ? `<span class="activity-date">${fmtShort(a.date)}</span>` : ""}</div>`).join("")}</div>`
        : `<div class="empty">No activities added yet.</div>`;
    } else {
      bodyHTML = phase.modules.length
        ? phase.modules.map(mod => `<div class="module-block"><div class="module-title">${mod.type === "virtual" ? "🌐" : "🏛"} ${esc(mod.title)}${mod.date ? ` <span class="module-date">- ${fmtShort(mod.date)}</span>` : ""}</div></div>`).join("")
        : `<div class="empty">No modules added yet.</div>`;
    }

    return `<section class="phase">${headerHTML}<div class="phase-body">${bodyHTML}</div></section>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(program.title)} - Program Outline</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Poppins', sans-serif; color: #182848; background: #fff; }

  /* Cover - a banner strip, not a full page, so phase content flows right below it */
  .cover { padding: 32px 48px 28px; background: linear-gradient(135deg, #182848, #2d3a7c); color: #fff; }
  .cover-badge { width: 44px; height: 44px; border-radius: 12px; background: ${progColor}; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 800; margin-bottom: 16px; }
  .cover-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
  .cover-title { font-size: 24px; font-weight: 800; line-height: 1.25; margin-bottom: 10px; max-width: 600px; }
  .cover-desc { font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.6; max-width: 560px; margin-bottom: 20px; }
  .cover-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; max-width: 640px; }
  .cover-stat { background: rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px; }
  .cover-stat-value { font-size: 20px; font-weight: 800; line-height: 1; }
  .cover-stat-label { font-size: 9px; color: rgba(255,255,255,0.55); margin-top: 5px; }
  .cover-dates { margin-top: 18px; font-size: 11px; color: rgba(255,255,255,0.6); }

  /* Body */
  .content { padding: 28px 48px 40px; }
  .section-label { font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #4A5573; margin-bottom: 20px; }
  .phase { border: 1px solid #E6DED0; border-radius: 12px; overflow: hidden; margin-bottom: 18px; page-break-inside: avoid; box-shadow: 0 1px 3px rgba(24, 40, 72,0.05); }
  .phase-hdr { display: flex; align-items: center; gap: 12px; padding: 14px 18px; color: #fff; }
  .phase-icon { width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,0.22); display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
  .phase-hdr-text { flex: 1; }
  .phase-title { font-size: 14px; font-weight: 700; }
  .phase-dates { font-size: 11px; opacity: 0.85; margin-top: 2px; }
  .phase-count { font-size: 11px; opacity: 0.8; flex-shrink: 0; }
  .phase-body { padding: 16px 18px; background: #FAFBFC; display: flex; flex-direction: column; gap: 12px; }
  .module-block { background: #fff; border: 1px solid #E6DED0; border-radius: 8px; padding: 12px 14px; }
  .module-title { font-size: 12.5px; font-weight: 700; color: #182848; margin-bottom: 8px; }
  .module-date { font-size: 11px; font-weight: 500; color: #4A5573; }
  .slot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .slot-label { font-size: 9px; font-weight: 800; letter-spacing: 0.8px; margin-bottom: 6px; }
  .chip-row { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip { font-size: 10.5px; font-weight: 600; border-radius: 20px; padding: 3px 10px; display: inline-block; }
  .activity-list { display: flex; flex-direction: column; gap: 8px; }
  .activity-row { display: flex; align-items: center; gap: 9px; font-size: 12.5px; font-weight: 600; color: #182848; }
  .activity-row .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .activity-date { margin-left: auto; font-size: 11px; color: #4A5573; font-weight: 500; }
  .empty { font-size: 11.5px; color: #C9BFA8; font-style: italic; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E6DED0; font-size: 9.5px; color: #4A5573; text-align: center; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; size: A4 portrait; }
    .cover { margin: 0; }
    .content { padding: 32px 40px; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-badge">${esc(initial)}</div>
    <div class="cover-label">PROGRAM OUTLINE</div>
    <div class="cover-title">${esc(program.title)}</div>
    ${program.description ? `<div class="cover-desc">${esc(program.description)}</div>` : ""}
    <div class="cover-stats">
      <div class="cover-stat"><div class="cover-stat-value">${phases.length}</div><div class="cover-stat-label">PHASES</div></div>
      <div class="cover-stat"><div class="cover-stat-value">${totalModules}</div><div class="cover-stat-label">MODULES</div></div>
      <div class="cover-stat"><div class="cover-stat-value">${totalElements}</div><div class="cover-stat-label">ACTIVITIES</div></div>
      <div class="cover-stat"><div class="cover-stat-value">${durationWeeks}</div><div class="cover-stat-label">WEEKS</div></div>
    </div>
    <div class="cover-dates">${fmtLong(progStart)} &nbsp;→&nbsp; ${fmtLong(progEnd)}</div>
  </div>
  <div class="content">
    <div class="section-label">PHASE-BY-PHASE OUTLINE</div>
    ${phaseBlocks}
    <div class="footer">Generated by XA-LMS &middot; ${fmtLong(new Date().toISOString().slice(0, 10))}</div>
  </div>
</body>
</html>`;
}
