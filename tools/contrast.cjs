#!/usr/bin/env node
/* Contrast auditor: WCAG 2.1 relative luminance + contrast ratio.
   Usage: node tools/contrast.cjs — prints ratios for the combos we audit. */
function lin(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function lum([r, g, b]) {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function ratio(fg, bg) {
  const l1 = lum(fg), l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function hex(h) {
  h = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function over(fg, alpha, bg) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}
const fmt = (x) => x.toFixed(2).padStart(5);
const mark = (x) => (x >= 7 ? 'AAA ' : x >= 4.5 ? 'AA  ' : x >= 3 ? 'AA-lg': 'FAIL');

// ── Light tokens ─────────────────────────────────────────────
const L = {
  canvas: hex('#F6F7FB'), surface: hex('#FFFFFF'), elevated: hex('#FFFFFF'),
  inset: hex('#EEF0F6'), diagnostic: hex('#EDF0F8'),
  text1: hex('#0B1020'), text2: hex('#5E6878'), text3: hex('#626C7E'),
  diag1: hex('#0B1020'), diag2: hex('#5E6878'), diag3: hex('#646D7B'),
  accent: hex('#3B5BFF'), accent2: hex('#7C5CFF'),
  success: hex('#10B981'), warning: hex('#F59E0B'), danger: hex('#EF4444'), caution: hex('#EA580C'),
  successInk: hex('#047857'), warningInk: hex('#92400E'), dangerInk: hex('#B91C1C'),
  cautionInk: hex('#9A3412'), accent2Ink: hex('#6D28D9'),
  accentInkBlue700: hex('#1D4ED8'), accentInkAlt: hex('#2947CC'),
  emerald600: hex('#059669'), emerald700: hex('#047857'), emerald800: hex('#065F46'),
  white: [255, 255, 255],
};
// ── Dark tokens ──────────────────────────────────────────────
const D = {
  canvas: hex('#000000'), surface: hex('#0A0A0C'), elevated: hex('#101117'),
  inset: hex('#060608'), diagnostic: hex('#090B16'),
  text1: hex('#F4F5F8'), text2: hex('#A6ADBC'), text3: hex('#7C8292'),
  diag1: hex('#EAEDF5'), diag2: hex('#A6ADBC'), diag3: hex('#767C8C'),
  accent: hex('#657FFF'), accent2: hex('#9B7FFF'),
  success: hex('#34D399'), warning: hex('#FBBF24'), danger: hex('#F87171'), caution: hex('#FB923C'),
  dangerSolid: hex('#DC2626'), dangerSolidHover: hex('#B91C1C'),
  emerald700: hex('#047857'), emerald800: hex('#065F46'),
  white: [255, 255, 255],
};

const checks = [];
const add = (label, fg, bg) => checks.push([label, ratio(fg, bg)]);

console.log('══ LIGHT ══');
// Issue A candidates: white text on solid success fills
add('A: white on success-500 (current td-btn-emerald)', L.white, L.success);
add('A: white on emerald-600', L.white, L.emerald600);
add('A: white on emerald-700', L.white, L.emerald700);
add('A: white on emerald-800', L.white, L.emerald800);
// Issue B: accent text on pale surfaces
for (const surf of ['surface', 'canvas', 'inset', 'diagnostic']) {
  add(`B: accent on ${surf}`, L.accent, L[surf]);
}
for (const cand of ['accentInkBlue700', 'accentInkAlt']) {
  for (const surf of ['surface', 'canvas', 'inset', 'diagnostic']) {
    add(`B: ${cand} on ${surf}`, L[cand], L[surf]);
  }
}
// accent tints with accent fg (Lab stepper)
add('B: accent on accent/6 over white', L.accent, over(L.accent, 0.06, L.surface));
add('B: accent on accent/8 over white', L.accent, over(L.accent, 0.08, L.surface));
// RequestConsole pills on diagnostic
add('C: successInk on success/15 over diagnostic (live pill)', L.successInk, over(L.success, 0.15, L.diagnostic));
add('C: successInk on success/10 over diagnostic', L.successInk, over(L.success, 0.1, L.diagnostic));
add('C: successInk on success/6 over diagnostic', L.successInk, over(L.success, 0.06, L.diagnostic));
add('C: successInk on diagnostic (no tint)', L.successInk, L.diagnostic);
add('C: emerald800 on success/10 over diagnostic', L.emerald800, over(L.success, 0.1, L.diagnostic));
add('C: diag3 on diagnostic (sim pill text)', L.diag3, L.diagnostic);
add('C: diag2 on diagnostic', L.diag2, L.diagnostic);
add('C: diag1 on diagnostic', L.diag1, L.diagnostic);
// statusTone chips on white cards (border+tint+ink)
for (const [name, base, ink] of [['success', L.success, L.successInk], ['warning', L.warning, L.warningInk], ['danger', L.danger, L.dangerInk], ['caution', L.caution, L.cautionInk], ['accent2', L.accent2, L.accent2Ink]]) {
  add(`chip: ${name}Ink on ${name}/8 over white`, ink, over(base, 0.08, L.surface));
  add(`chip: ${name}Ink on ${name}/8 over inset`, ink, over(base, 0.08, L.inset));
  add(`chip: ${name}Ink on ${name}/8 over diagnostic`, ink, over(base, 0.08, L.diagnostic));
}
add('chip: accent on accent/8 over white (404 now)', L.accent, over(L.accent, 0.08, L.surface));
// text tokens on surfaces
for (const t of ['text1', 'text2', 'text3']) {
  for (const s of ['surface', 'canvas', 'inset', 'diagnostic']) {
    add(`text: ${t} on ${s}`, L[t], L[s]);
  }
}
// toast chips on elevated
add('toast: warningInk on warning/10 over elevated', L.warningInk, over(L.warning, 0.1, L.elevated));
add('toast: dangerInk on danger/10 over elevated', L.dangerInk, over(L.danger, 0.1, L.elevated));
add('toast: successInk on success/10 over elevated', L.successInk, over(L.success, 0.1, L.elevated));
add('toast: accent on accent/10 over elevated', L.accent, over(L.accent, 0.1, L.elevated));

console.log('══ DARK ══');
add('A(dark): white on emerald-700', D.white, D.emerald700);
add('A(dark): white on success-500 (#34D399)', D.white, D.success);
add('B(dark): accent on diagnostic', D.accent, D.diagnostic);
add('B(dark): accent on surface', D.accent, D.surface);
add('C(dark): success on success/15 over diagnostic', D.success, over(D.success, 0.15, D.diagnostic));
add('C(dark): diag3 on diagnostic', D.diag3, D.diagnostic);
add('C(dark): diag2 on diagnostic', D.diag2, D.diagnostic);
add('chip(dark): success on success/8 over surface', D.success, over(D.success, 0.08, D.surface));
add('chip(dark): warning on warning/8 over surface', D.warning, over(D.warning, 0.08, D.surface));
add('chip(dark): danger on danger/8 over surface', D.danger, over(D.danger, 0.08, D.surface));
add('chip(dark): caution on caution/8 over surface', D.caution, over(D.caution, 0.08, D.surface));
add('chip(dark): accent2 on accent2/8 over surface', D.accent2, over(D.accent2, 0.08, D.surface));
for (const t of ['text1', 'text2', 'text3']) {
  for (const s of ['surface', 'canvas', 'elevated', 'inset', 'diagnostic']) {
    add(`text(dark): ${t} on ${s}`, D[t], D[s]);
  }
}
add('danger-solid(dark): white on #DC2626', D.white, D.dangerSolid);


console.log('══ POST-FIX VERIFICATION ══');
add('F: white on success-solid #047857 (btn)', L.white, L.emerald700);
add('F: white on success-solid-hover #065F46', L.white, L.emerald800);
for (const surf of ['surface','canvas','inset','diagnostic']) {
  add(`F: accent-ink #1D4ED8 on ${surf}`, L.accentInkBlue700, L[surf]);
}
add('F: accent-ink on accent/8 over white (404 chip)', L.accentInkBlue700, over(L.accent,0.08,L.surface));
add('F: accent-ink on accent/8 over inset', L.accentInkBlue700, over(L.accent,0.08,L.inset));
add('F: accent-ink on accent/8 over canvas (MobileTabs)', L.accentInkBlue700, over(L.accent,0.08,L.canvas));
add('F: accent-ink on accent/10 over elevated (toast)', L.accentInkBlue700, over(L.accent,0.1,L.elevated));
add('F: successInk on success/6 over diagnostic (live pill)', L.successInk, over(L.success,0.06,L.diagnostic));
add('F: diag3 new on diagnostic (sim pill/meta)', L.diag3, L.diagnostic);
add('F: text3 new on surface', L.text3, L.surface);
add('F: text3 new on canvas', L.text3, L.canvas);
add('F: text3 new on inset', L.text3, L.inset);
add('F: text3 new on diagnostic', L.text3, L.diagnostic);
add('F: text3 new on inset/50 over white (RV headers)', L.text3, over(L.inset,0.5,L.surface));
add('F: text3 new on inset/60 over white (thead)', L.text3, over(L.inset,0.6,L.surface));
add('F: warningInk800 on warning/8 over inset', L.warningInk, over(L.warning,0.08,L.inset));
add('F: warningInk800 on warning/8 over white', L.warningInk, over(L.warning,0.08,L.surface));
add('F: cautionInk800 on caution/8 over inset', L.cautionInk, over(L.caution,0.08,L.inset));
add('F: cautionInk800 on caution/8 over white', L.cautionInk, over(L.caution,0.08,L.surface));
add('F: successInk on success/8 over inset', L.successInk, over(L.success,0.08,L.inset));
add('F: dangerInk on danger/8 over inset', L.dangerInk, over(L.danger,0.08,L.inset));
add('F: accent2Ink on accent2/8 over inset', L.accent2Ink, over(L.accent2,0.08,L.inset));
add('F(dark): text3 #7C8292 on elevated', D.text3, D.elevated);
add('F(dark): text3 on surface', D.text3, D.surface);
add('F(dark): accent on diagnostic (POST dark)', D.accent, D.diagnostic);
add('F(dark): success on success/6 over diagnostic', D.success, over(D.success,0.06,D.diagnostic));
add('F(dark): white on emerald-700 (btn dark)', D.white, D.emerald700);

for (const [label, r] of checks) {
  console.log(`${mark(r)} ${fmt(r)}  ${label}`);
}
