// ─── Núcleo2 — Paleta da Empresa ──────────────────────────
// Preto profundo + roxo elétrico + rosa/magenta acento

export const DARK = {
  bgRoot:    '#0a0a0a',
  bgSidebar: '#0f0f0f',
  bgCard:    '#141414',
  bgCardDp:  '#0f0f0f',
  bgInput:   '#0a0a0a',
  border:    '#2a2a2a',
  borderSub: '#1f1f1f',
  purple:    '#8b2fe8',   // roxo elétrico primário
  purpleLt:  '#a855f7',   // roxo mais claro
  purpleVbr: '#c084fc',   // hover / destaque
  purpleNav: '#2d1060',   // fundo nav ativo
  pink:      '#e8196a',   // magenta acento
  pinkLt:    '#f0206e',   // hover pink
  textMain:  '#ffffff',
  textSub:   '#cccccc',
  textMuted: '#888888',
  green:     '#4ade80',
  amber:     '#fbbf24',
  red:       '#f87171',
  blue:      '#60a5fa',
  isDark:    true,
}

export const LIGHT = {
  bgRoot:    '#fafafa',
  bgSidebar: '#f0f0f0',
  bgCard:    '#ffffff',
  bgCardDp:  '#f5f5f5',
  bgInput:   '#f9f9f9',
  border:    '#e0e0e0',
  borderSub: '#ebebeb',
  purple:    '#7c22e8',
  purpleLt:  '#8b2fe8',
  purpleVbr: '#6d28d9',
  purpleNav: '#ede9fe',
  pink:      '#e8196a',
  pinkLt:    '#f0206e',
  textMain:  '#0a0a0a',
  textSub:   '#333333',
  textMuted: '#777777',
  green:     '#16a34a',
  amber:     '#d97706',
  red:       '#dc2626',
  blue:      '#2563eb',
  isDark:    false,
}

export const makeStyles = (C) => ({
  sidebar:  { width: 220, background: C.bgSidebar, borderRight: `1px solid ${C.border}`, padding: '24px 12px', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, height: '100vh', overflowY: 'auto', zIndex: 10 },
  logo:     { fontSize: 20, fontWeight: 800, color: C.textMain, letterSpacing: '-0.5px', marginBottom: 3 },
  weekPill: { fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: .3 },
  main:     { marginLeft: 220, padding: '30px 36px', flex: 1, minHeight: '100vh', background: C.bgRoot },
  phdr:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  ptitle:   { fontSize: 22, fontWeight: 800, color: C.textMain, letterSpacing: '-0.5px' },
  psub:     { fontSize: 12, color: C.textSub, marginTop: 3 },
  navBtn:   a => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: 'none', background: a ? C.purpleNav : 'transparent', color: a ? C.purpleVbr : C.textMuted, fontFamily: 'inherit', fontSize: 12.5, fontWeight: a ? 700 : 500, cursor: 'pointer', width: '100%', transition: 'all .13s' }),
  sideD:    a => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 7, border: 'none', background: a ? C.purpleNav : 'transparent', color: a ? C.purpleVbr : C.textMuted, fontFamily: 'inherit', cursor: 'pointer', width: '100%', transition: 'all .1s', fontSize: 12 }),
  addInput: { background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 7, color: C.textMain, fontSize: 12, padding: '6px 9px', fontFamily: 'inherit', outline: 'none', width: '100%' },
  statCard: { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '15px 18px' },
  statLbl:  { fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 7 },
  statVal:  { fontSize: 36, fontWeight: 800, color: C.textMain, lineHeight: 1 },
  statUnit: { fontSize: 11, color: C.textSub, marginTop: 3 },
  section:  { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' },
  secTitle: { fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 12 },
  rankCard: { background: C.bgCardDp, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 16px', cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s' },
  inp:      { background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 7, color: C.textMain, fontSize: 12.5, padding: '7px 8px', fontFamily: 'inherit', outline: 'none', transition: 'border-color .15s', width: '100%' },
  sel:      { background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 7, color: C.textMain, fontSize: 11.5, padding: '7px 6px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
  actBtn:   c => ({ width: 26, height: 26, background: 'transparent', border: 'none', color: c, cursor: 'pointer', fontSize: 12, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
  btnGold:  { background: `linear-gradient(135deg, ${C.purple}, ${C.pink})`, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnGhost: { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 16px', fontFamily: 'inherit', fontSize: 12, color: C.textSub, cursor: 'pointer' },
  btnAdd:   { background: C.bgCardDp, border: `1px dashed ${C.border}`, color: C.textSub, borderRadius: 9, padding: '9px 16px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  dTab:     a => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20, border: a ? `1px solid ${C.purple}44` : `1px solid ${C.border}`, background: a ? C.purpleNav : 'transparent', color: a ? C.purpleVbr : C.textMuted, fontFamily: 'inherit', fontSize: 12, fontWeight: a ? 700 : 400, cursor: 'pointer', transition: 'all .12s' }),
  toast:    { position: 'fixed', top: 20, right: 20, background: C.isDark ? '#0f2d1a' : '#f0fdf4', border: `1px solid ${C.isDark ? '#4ade8044' : '#16a34a44'}`, color: C.isDark ? '#4ade80' : '#16a34a', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 999, animation: 'toastIn .3s ease' },
  miniPill: { fontSize: 9, fontWeight: 600, color: C.textMuted, background: C.bgCardDp, padding: '2px 7px', borderRadius: 20 },
  badge:    (bg, color) => ({ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: bg, color }),
  dname:    { fontSize: 12, fontWeight: 500, color: C.textSub },
  dnameAct: { fontSize: 12, fontWeight: 700, color: C.textMain },
})

export const ST = makeStyles(DARK)
