import { useState, useEffect, useRef } from 'react'
import {
  getWeekKey, getWeekLabel, getMonthLabel,
  getLast12Months, getWeeksInMonth,
  loadAllWeeks, saveDesignerWeek,
  loadDesigners, saveDesigners, deleteDesigner as dbDeleteDesigner,
  updateDesignerGroup,
  loadClients, saveClient, deleteClient as dbDeleteClient, updateClientGroup,
  loadIdeias, saveIdeia, deleteIdeia as dbDeleteIdeia, updateIdeiaStatus,
  loadTetos, saveTeto as dbSaveTeto,
  loadNucleos, saveNucleo as dbSaveNucleo, deleteNucleo as dbDeleteNucleo,
  updateDesignerNucleo, updateClientNucleo,
} from './lib/supabase.js'
import {
  avatarStyle, calcTotal, calcDemandPts, getTaskMeta,
  CAT_COLOR, TASK_TABLE, topClient,
} from './lib/tasks.js'
import { makeStyles, DARK, LIGHT } from './lib/styles.js'
import EntryPanel from './components/EntryPanel.jsx'
import ProfileView from './components/ProfileView.jsx'
import DemandList from './components/DemandList.jsx'

const initials = name => name.split(' ').map(n => n[0]).join('').slice(0, 2)

const DEFAULT_NUCLEOS = [
  { id: 'nucleo-a', nome: 'Núcleo A', cor: '#2f80ed' },
  { id: 'nucleo-b', nome: 'Núcleo B', cor: '#8b2fe8' },
]

function useDebounce(fn, delay) {
  const timer = useRef(null)
  return (...args) => { clearTimeout(timer.current); timer.current = setTimeout(() => fn(...args), delay) }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return isMobile
}

// ── Gráfico de barras por categoria ──────────────────────
function CatBarChart({ catBreak, C }) {
  const entries = Object.entries(catBreak).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(e => e[1]), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([cat, pts]) => (
        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 110, fontSize: 11, fontWeight: 600, color: CAT_COLOR[cat] || C.textSub, textAlign: 'right', flexShrink: 0 }}>{cat}</div>
          <div style={{ flex: 1, height: 22, background: C.bgCardDp, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(pts / max) * 100}%`,
              background: `linear-gradient(90deg, ${CAT_COLOR[cat] || C.purple}cc, ${CAT_COLOR[cat] || C.purple})`,
              borderRadius: 6, transition: 'width 0.8s ease',
              display: 'flex', alignItems: 'center', paddingLeft: 8,
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>{pts.toFixed(0)} PT</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Badge de comparativo vs semana anterior ───────────────
function DeltaBadge({ current, prev, C }) {
  if (!prev) return null
  const delta = current - prev
  if (Math.abs(delta) < 0.1) return <span style={{ fontSize: 10, color: C.textMuted, background: C.bgCardDp, padding: '2px 7px', borderRadius: 20, fontWeight: 600 }}>= sem mudança</span>
  const up = delta > 0
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: up ? '#4ade80' : '#f87171', background: (up ? '#4ade8022' : '#f8717122'), padding: '2px 8px', borderRadius: 20 }}>
      {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} PT vs semana anterior
    </span>
  )
}

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('n2-theme') !== 'light')
  const isMobile = useIsMobile()
  const C  = isDark ? DARK : LIGHT
  const ST = makeStyles(C)

  useEffect(() => {
    document.body.className = isDark ? 'dark' : 'light'
    document.body.style.background = C.bgRoot
    document.body.style.color = C.textMain
    localStorage.setItem('n2-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const [page,             setPageRaw]        = useState(() => localStorage.getItem('n2-page') || 'dashboard')
  const [activeD,          setActiveDRaw]     = useState(() => localStorage.getItem('n2-activeD') || null)
  const [profileD,         setProfileD]       = useState(null)

  const setPage = (p) => { setPageRaw(p); localStorage.setItem('n2-page', p) }
  const setActiveD = (d) => { setActiveDRaw(d); if (d) localStorage.setItem('n2-activeD', d) }
  const [designers,        setDesigners]      = useState([])
  const [nucleos,          setNucleos]        = useState(DEFAULT_NUCLEOS)
  const [activeNucleo,     setActiveNucleo]   = useState(() => localStorage.getItem('n2-nucleo') || 'all')
  const [clients,          setClients]        = useState([])
  const [allWeeks,         setAllWeeks]       = useState({})
  const [presentMode,      setPresentMode]    = useState(false)
  const [presentDesigner,  setPresentDesigner] = useState(null)
  const [presentCompare,   setPresentCompare]  = useState(false)

  const currentWeekKey   = getWeekKey()
  const currentWeekLabel = getWeekLabel(currentWeekKey)

  // Semana anterior
  const prevWeekDate = new Date(currentWeekKey + 'T12:00:00')
  prevWeekDate.setDate(prevWeekDate.getDate() - 7)
  const prevWeekKey = getWeekKey(prevWeekDate)

  const [histMonth, setHistMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [histWeek, setHistWeek] = useState(currentWeekKey)
  const [histView, setHistView] = useState('semana')
  const [reportView, setReportView] = useState('semana')
  const [onboardSlide, setOnboardSlide] = useState(0)

  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [savedOk,      setSavedOk]      = useState(false)
  const [toast,        setToast]        = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [newDesigner,  setNewDesigner]  = useState('')
  const [newClient,    setNewClient]    = useState('')
  const [newClientGroup, setNewClientGroup] = useState(0)
  const [ideias,       setIdeias]       = useState([])
  const [newIdeia,     setNewIdeia]     = useState({ titulo: '', descricao: '', autor: '' })
  const [tetos,        setTetos]        = useState({})

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') {
        setPresentMode(false)
        setPresentDesigner(null)
        if (page === 'onboarding') setPage('dashboard')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { bootstrap() }, [])

  const bootstrap = async () => {
    setLoading(true)
    try {
      const [des, cli, weeks, ideiasList, tetosMap, nucleosList] = await Promise.all([
        loadDesigners(), loadClients(), loadAllWeeks(), loadIdeias(), loadTetos(), loadNucleos()
      ])
      const nucleosRows = nucleosList.length ? nucleosList : DEFAULT_NUCLEOS
      const defaultNucleoId = nucleosRows.find(n => n.nome === 'Núcleo B')?.id || nucleosRows[0]?.id || null
      const desRows = des.map(d => ({
        name: d.name,
        sort_order: d.sort_order,
        group_id: d.group_id ?? 1,
        nucleo_id: d.nucleo_id ?? defaultNucleoId,
      }))
      setDesigners(desRows)
      setClients((cli.length ? cli : [
        { name: 'Wosi', group_id: 1 }, { name: 'Interno', group_id: 0 }, { name: 'Outros', group_id: 0 }
      ]).map(c => ({
        ...c,
        nucleo_id: c.nucleo_id ?? defaultNucleoId,
      })))
      setNucleos(nucleosRows)
      const savedNucleo = localStorage.getItem('n2-nucleo') || 'all'
      if (savedNucleo !== 'all' && !nucleosRows.some(n => n.id === savedNucleo)) {
        setActiveNucleo('all')
        localStorage.setItem('n2-nucleo', 'all')
      }
      if (desRows.length) {
        const saved = localStorage.getItem('n2-activeD')
        const valid = saved && desRows.find(d => d.name === saved)
        setActiveD(valid ? saved : desRows[0].name)
      }
      const map = {}
      weeks.forEach(row => {
        if (!map[row.week_key]) map[row.week_key] = {}
        map[row.week_key][row.designer_name] = {
          demands: row.demands || [],
          updated_at: row.updated_at || null,
        }
      })
      setAllWeeks(map)
      setIdeias(ideiasList)
      setTetos(tetosMap)
    } catch (e) { showToast('⚠ Erro ao carregar: ' + e.message) }
    setLoading(false)
  }

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const getCurrentDemands = name => allWeeks?.[currentWeekKey]?.[name]?.demands || []
  const getPrevDemands    = name => allWeeks?.[prevWeekKey]?.[name]?.demands || []
  const getHistDemands    = (name, wk = histWeek) => allWeeks?.[wk]?.[name]?.demands || []

  const debouncedSave = useDebounce(async (name, demands, weekKey) => {
    setSaving(true)
    try {
      await saveDesignerWeek(weekKey, name, demands)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e) { showToast('⚠ ' + e.message) }
    setSaving(false)
  }, 800)

  const withDemandContext = (name, demands) => {
    const des = designers.find(d => d.name === name)
    return demands.map(d => ({
      ...d,
      designer_name: name,
      nucleo_id: des?.nucleo_id ?? null,
      group_id: des?.group_id ?? 0,
    }))
  }

  const setCurrentDemands = (name, demands) => {
    const demandsWithContext = withDemandContext(name, demands)
    setAllWeeks(prev => ({ ...prev, [currentWeekKey]: { ...(prev[currentWeekKey] || {}), [name]: { demands: demandsWithContext, updated_at: new Date().toISOString() } } }))
    debouncedSave(name, demandsWithContext, currentWeekKey)
  }

  // Filtra pelo núcleo ativo
  const filteredDesigners = activeNucleo === 'all'
    ? designers
    : designers.filter(d => d.nucleo_id === activeNucleo)
  const filteredClients = activeNucleo === 'all'
    ? clients
    : clients.filter(c => c.nucleo_id === activeNucleo)

  const desNames  = filteredDesigners.map(d => d.name)
  const group1    = filteredDesigners.filter(d => d.group_id === 1 || d.group_id === 0)
  const group2    = filteredDesigners.filter(d => d.group_id === 2 || d.group_id === 0)

  useEffect(() => {
    if (!filteredDesigners.length) return
    if (!activeD || !filteredDesigners.some(d => d.name === activeD)) {
      setActiveD(filteredDesigners[0].name)
    }
  }, [activeNucleo, designers.length])

  // Dashboard rows — ordenados por PT (ranking)
  const dashRowsRaw = filteredDesigners.map((d, i) => ({
    ...d, i,
    demands:  getCurrentDemands(d.name),
    total:    calcTotal(getCurrentDemands(d.name)),
    prevTotal: calcTotal(getPrevDemands(d.name)),
  }))
  const dashRows    = [...dashRowsRaw].sort((a, b) => b.total - a.total)
  const totalPts    = dashRows.reduce((s, r) => s + r.total, 0)
  const prevTotalPts = dashRowsRaw.reduce((s, r) => s + r.prevTotal, 0)
  const filledCount = dashRows.filter(r => r.demands.length > 0).length
  const totalItems  = dashRows.reduce((s, r) => s + r.demands.reduce((a, d) => a + (d.splits || []).reduce((x, sp) => x + (parseFloat(sp.qty) || 0), 0), 0), 0)
  const allCurr     = dashRows.flatMap(r => r.demands)
  const teamTopClient = topClient(allCurr)
  const catBreak    = {}
  allCurr.forEach(d => { const m = getTaskMeta(d.task); if (true) catBreak[m.category] = (catBreak[m.category] || 0) + calcDemandPts(d) })
  const notFilled   = dashRowsRaw.filter(r => r.demands.length === 0).map(r => r.name)
  const fillPct     = filteredDesigners.length > 0 ? Math.round((filledCount / filteredDesigners.length) * 100) : 0

  const last12months = getLast12Months()
  const weeksInMonth = getWeeksInMonth(histMonth)
  const histRows     = filteredDesigners.map((d, i) => ({ ...d, i, demands: getHistDemands(d.name), total: calcTotal(getHistDemands(d.name)) }))
  const histTotalPts = histRows.reduce((s, r) => s + r.total, 0)
  const monthlyTotal = weeksInMonth.reduce((s, wk) => s + desNames.reduce((ss, n) => ss + calcTotal(getHistDemands(n, wk)), 0), 0)

  // Dados mensais para o relatório — agrega todas as demandas do mês por designer
  const monthRows = filteredDesigners.map((d, i) => {
    const allDemands = weeksInMonth.flatMap(wk => allWeeks[wk]?.[d.name]?.demands || [])
    return { ...d, i, demands: allDemands, total: calcTotal(allDemands) }
  })
  const monthTotalPts = monthRows.reduce((s, r) => s + r.total, 0)

  const exportReport = (rows, weekLabel) => {
    let txt = `📊 NÚCLEO2 — ${weekLabel}\n${'─'.repeat(46)}\n\n`
    ;[...rows].sort((a, b) => b.total - a.total).forEach(r => {
      if (!r.demands.length) return
      txt += `👤 ${r.name} — ${r.total.toFixed(1)} PT\n`
      r.demands.forEach(d => {
        txt += `  • ${d.task}${d.name ? ` "${d.name}"` : ''} | ${d.client}\n`
        ;(d.splits || []).forEach(sp => {
          const meta = getTaskMeta(d.task)
          const spt  = sp.difficulty === 'Alteração' ? 0 : (parseFloat(sp.qty) || 0) * (parseFloat(sp.pts) || 0)
          txt += `      ${sp.qty}× ${sp.difficulty}${sp.difficulty === 'Alteração' ? '' : ` = ${spt.toFixed(1)} PT`}\n`
        })
      })
      txt += `  Total: ${r.total.toFixed(1)} PT\n\n`
    })
    txt += `${'─'.repeat(46)}\nTOTAL: ${rows.reduce((s, r) => s + r.total, 0).toFixed(1)} PT\n`
    navigator.clipboard.writeText(txt)
    showToast('📋 Relatório copiado!')
  }

  const exportPDF = (modo = 'semana', rows = dashRows, weekLabel = currentWeekLabel) => {
    const sortedRows = [...rows].sort((a, b) => b.total - a.total).filter(r => r.demands.length > 0)
    const totalPT    = sortedRows.reduce((s, r) => s + r.total, 0)
    const totalItems = sortedRows.reduce((s, r) =>
      s + r.demands.reduce((a, d) => a + (d.splits||[]).reduce((x, sp) => x + (parseInt(sp.qty)||0), 0), 0), 0)
    const totalDem   = sortedRows.reduce((s, r) => s + r.demands.length, 0)
    const media      = sortedRows.length > 0 ? totalPT / sortedRows.length : 0

    const groupLabel = g => g === 2 ? 'Davila' : g === 0 ? 'Ambos' : 'Leticia'
    const groupColor = g => g === 2 ? '#e8196a' : g === 0 ? '#fbbf24' : '#c084fc'
    const groupBg    = g => g === 2 ? '#e8196a22' : g === 0 ? '#fbbf2422' : '#8b2fe822'

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Núcleo2 — Relatório ${weekLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0a; color: #fff; font-family: 'DM Sans', sans-serif; padding: 40px; }
  .page { max-width: 900px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #2a2a2a; }
  .logo { font-size: 32px; font-weight: 900; color: #fff; }
  .logo span { color: #e8196a; }
  .week { font-size: 15px; color: #e8196a; font-weight: 700; margin-top: 4px; }
  .date { font-size: 12px; color: #555; margin-top: 3px; }
  .stat-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
  .stat { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; padding: 14px 18px; }
  .stat-label { font-size: 9px; font-weight: 700; color: #555; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
  .stat-val { font-size: 28px; font-weight: 900; color: #fff; line-height: 1; }
  .stat-unit { font-size: 11px; color: #666; margin-top: 3px; }
  .section { background: #141414; border: 1px solid #2a2a2a; border-radius: 14px; padding: 20px 24px; margin-bottom: 20px; }
  .section-title { font-size: 10px; font-weight: 700; color: #555; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 9px; font-weight: 700; color: #555; letter-spacing: 1.5px; text-transform: uppercase; padding: 0 12px 10px; text-align: left; }
  th.right { text-align: right; }
  td { padding: 10px 12px; border-top: 1px solid #1a1a1a; vertical-align: middle; }
  tr:hover td { background: #111; }
  .demand-row td { padding: 7px 12px; font-size: 12px; color: #999; }
  .demand-row td:first-child { padding-left: 24px; color: #666; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1a1a1a; display: flex; justify-content: space-between; color: #444; font-size: 11px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 20px; }
    .no-print { display: none; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo">Núcleo<span>2</span></div>
      <div class="week">${weekLabel}</div>
      <div class="date">Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
    </div>
    <button class="no-print" onclick="window.print()" style="background:linear-gradient(135deg,#8b2fe8,#e8196a);color:#fff;border:none;border-radius:10px;padding:12px 24px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;">
      🖨 Imprimir / Salvar PDF
    </button>
  </div>

  <!-- Stats gerais -->
  <div class="stat-grid">
    <div class="stat">
      <div class="stat-label">Total do Time</div>
      <div class="stat-val">${totalPT.toFixed(1)}</div>
      <div class="stat-unit">pontos</div>
    </div>
    <div class="stat">
      <div class="stat-label">Média por Designer</div>
      <div class="stat-val">${media.toFixed(1)}</div>
      <div class="stat-unit">pts/pessoa</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total de Demandas</div>
      <div class="stat-val">${totalDem}</div>
      <div class="stat-unit">demandas</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total de Itens</div>
      <div class="stat-val">${totalItems}</div>
      <div class="stat-unit">itens (qty)</div>
    </div>
  </div>

  <!-- Tabela resumo por designer -->
  <div class="section">
    <div class="section-title">Resumo por Designer</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Designer</th>
          <th>Grupo</th>
          <th class="right">Demandas</th>
          <th class="right">Itens</th>
          <th class="right">Pontos</th>
          <th style="width:140px;">Participação</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows.map((r, i) => {
          const itens = r.demands.reduce((s, d) =>
            s + (d.splits||[]).reduce((a, sp) => a + (parseInt(sp.qty)||0), 0), 0)
          const pct = totalPT > 0 ? Math.round((r.total / totalPT) * 100) : 0
          const grpColor = groupColor(r.group_id)
          const grpBg    = groupBg(r.group_id)
          return `<tr>
            <td style="color:#555;font-size:13px;font-weight:700;">${i + 1}</td>
            <td style="font-size:14px;font-weight:700;color:#fff;">${r.name}</td>
            <td><span style="font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;background:${grpBg};color:${grpColor};">${groupLabel(r.group_id)}</span></td>
            <td style="text-align:right;font-size:14px;font-weight:600;color:#ccc;">${r.demands.length}</td>
            <td style="text-align:right;font-size:14px;font-weight:600;color:#ccc;">${itens}</td>
            <td style="text-align:right;font-size:20px;font-weight:900;color:#e8196a;">${r.total.toFixed(1)}<span style="font-size:10px;color:#555;"> PT</span></td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;height:6px;background:#1a1a1a;border-radius:99px;overflow:hidden;">
                  <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#8b2fe8,#e8196a);border-radius:99px;"></div>
                </div>
                <span style="font-size:11px;color:#555;width:28px;text-align:right;">${pct}%</span>
              </div>
            </td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- Detalhamento por designer -->
  <div class="section-title" style="margin-bottom:14px;">Detalhamento por Designer</div>
  ${sortedRows.map(r => {
    const itens = r.demands.reduce((s, d) =>
      s + (d.splits||[]).reduce((a, sp) => a + (parseInt(sp.qty)||0), 0), 0)
    return `
    <div class="section" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div>
          <span style="font-size:16px;font-weight:800;color:#fff;">${r.name}</span>
          <span style="margin-left:10px;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;background:${groupBg(r.group_id)};color:${groupColor(r.group_id)};">${groupLabel(r.group_id)}</span>
        </div>
        <div style="display:flex;gap:20px;align-items:center;">
          <span style="font-size:12px;color:#666;">${r.demands.length} dem. · ${itens} itens</span>
          <span style="font-size:24px;font-weight:900;color:#e8196a;">${r.total.toFixed(1)} PT</span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Tarefa</th>
            <th>Nome</th>
            <th>Cliente</th>
            <th class="right">Qtd × Dif</th>
            <th class="right">PT</th>
          </tr>
        </thead>
        <tbody>
          ${r.demands.map(d => {
            const meta = getTaskMeta(d.task)
            const pts  = calcDemandPts(d)
            const qtdStr = (d.splits||[]).map(sp => `${sp.qty}× ${sp.difficulty}`).join(', ')
            return `<tr class="demand-row">
              <td style="color:#c084fc;font-weight:600;">${d.task}</td>
              <td style="color:#ccc;">${d.name || '—'}</td>
              <td style="color:#60a5fa;font-weight:600;">${d.client}</td>
              <td style="text-align:right;color:#888;">${qtdStr}</td>
              <td style="text-align:right;font-weight:800;color:${pts === 0 ? '#555' : '#e8196a'};">${pts === 0 ? 'Alt.' : pts.toFixed(1)}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`
  }).join('')}

  <!-- Footer -->
  <div class="footer">
    <span>Núcleo2 · nucleo2-ten.vercel.app</span>
    <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
  </div>

</div>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
  }

  const addDesigner = async () => {
    const name = newDesigner.trim()
    if (!name || desNames.includes(name)) return
    const groupId = 1
    const defaultNucleoId = activeNucleo === 'all'
      ? (nucleos.find(n => n.nome === 'Núcleo B')?.id || nucleos[0]?.id || null)
      : activeNucleo
    const newRow = {
      name,
      sort_order: designers.length,
      group_id: groupId,
      nucleo_id: defaultNucleoId,
    }
    const list = [...designers, newRow]
    setDesigners(list); setNewDesigner('')
    try { await saveDesigners(list) } catch (e) { showToast('⚠ ' + e.message) }
  }
  const removeDesigner = async name => {
    if (!confirm(`Remover ${name}?`)) return
    setDesigners(designers.filter(d => d.name !== name))
    try { await dbDeleteDesigner(name) } catch (e) { showToast('⚠ ' + e.message) }
  }
  const toggleGroup = async (name) => {
    const cur = designers.find(d => d.name === name)
    if (!cur) return
    // ciclo: 1 (Leticia) → 2 (Davila) → 0 (Ambos) → 1
    const newGroup = cur.group_id === 1 ? 2 : cur.group_id === 2 ? 0 : 1
    setDesigners(prev => prev.map(d => d.name === name ? { ...d, group_id: newGroup } : d))
    try { await updateDesignerGroup(name, newGroup) } catch (e) { showToast('⚠ ' + e.message) }
  }
  const addClientFn = async () => {
    const name = newClient.trim()
    if (!name || clients.find(c => c.name === name)) return
    const defaultNucleoId = activeNucleo === 'all'
      ? (nucleos.find(n => n.nome === 'Núcleo B')?.id || nucleos[0]?.id || null)
      : activeNucleo
    const newObj = {
      name,
      group_id: newClientGroup,
      nucleo_id: defaultNucleoId,
    }
    const list = [...clients, newObj]; setClients(list); setNewClient('')
    try { await saveClient(name, list.length, newClientGroup, defaultNucleoId) } catch (e) { showToast('⚠ ' + e.message) }
  }
  const removeClientFn = async name => {
    setClients(clients.filter(c => c.name !== name))
    try { await dbDeleteClient(name) } catch (e) { showToast('⚠ ' + e.message) }
  }
  const toggleClientGroup = async (name) => {
    const cur = clients.find(c => c.name === name)
    if (!cur) return
    // ciclo: 0 (compartilhado) → 1 → 2 → 0
    const next = cur.group_id === 0 ? 1 : cur.group_id === 1 ? 2 : 0
    setClients(prev => prev.map(c => c.name === name ? { ...c, group_id: next } : c))
    try { await updateClientGroup(name, next) } catch (e) { showToast('⚠ ' + e.message) }
  }

  const openProfile = name => { setProfileD(name); setPage('profile') }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bgRoot, flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: C.textMain }}>Núcleo<span style={{ color: C.pink }}>2</span></div>
      <div style={{ fontSize: 13, color: C.textSub }}>Carregando dados...</div>
    </div>
  )


  // ══════════════════════════════════════════════════
  // APRESENTAÇÃO — por designer
  // ══════════════════════════════════════════════════
  if (presentMode && presentDesigner) {
    const row = dashRows.find(r => r.name === presentDesigner)
    if (!row) return null
    const dIdx = designers.findIndex(d => d.name === presentDesigner)
    const clientCount = {}
    const clientDemandCount = {}
    let totalAlteracoes = 0
    row.demands.forEach(d => {
      const isAlt = (d.splits || []).every(sp => sp.difficulty === 'Alteração')
      if (isAlt) { totalAlteracoes += (d.splits || []).reduce((s, sp) => s + (parseInt(sp.qty)||0), 0); return }
      clientCount[d.client] = (clientCount[d.client] || 0) + calcDemandPts(d)
      clientDemandCount[d.client] = (clientDemandCount[d.client] || 0) + 1
    })
    const clientsSorted = Object.entries(clientCount).sort((a, b) => b[1] - a[1])
    const catPts = {}
    row.demands.forEach(d => { const m = getTaskMeta(d.task); if (true) catPts[m.category] = (catPts[m.category] || 0) + calcDemandPts(d) })
    const prevIdx = (dIdx - 1 + designers.length) % designers.length
    const nextIdx = (dIdx + 1) % designers.length
    const delta   = row.total - row.prevTotal
    const GOAL    = 500
    const hitGoal = row.total >= GOAL
    const goalPct = Math.min((row.total / GOAL) * 100, 100)
    // Apresentação sempre no tema escuro independente do toggle
    const PC = C

    return (
      <div style={{ position: 'fixed', inset: 0, background: PC.bgRoot, display: 'flex', flexDirection: 'column', zIndex: 999, padding: '28px 48px', overflow: 'hidden' }}>
        {/* Nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexShrink: 0 }}>
          <button onClick={() => setPresentDesigner(null)} style={{ background: PC.bgCardDp, border: `1px solid ${PC.border}`, color: PC.textMuted, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Visão Geral</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPresentDesigner(designers[prevIdx].name)} style={{ background: PC.bgCard, border: `1px solid ${PC.border}`, color: PC.textMuted, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>‹ {designers[prevIdx].name.split(' ')[0]}</button>
            <button onClick={() => setPresentDesigner(designers[nextIdx].name)} style={{ background: PC.bgCard, border: `1px solid ${PC.border}`, color: PC.textMuted, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>{designers[nextIdx].name.split(' ')[0]} ›</button>
            <button onClick={() => { setPresentMode(false); setPresentDesigner(null) }} style={{ background: PC.bgCardDp, border: `1px solid ${PC.border}`, color: PC.textMuted, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>ESC · Sair</button>
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{ display: 'flex', gap: 36, flex: 1, minHeight: 0 }}>

          {/* Coluna esquerda — scrollável */}
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingRight: 4 }}>
            {/* Avatar + nome */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              <div style={{ ...avatarStyle(dIdx), width: 56, height: 56, borderRadius: 14, fontSize: 20, border: '3px solid', flexShrink: 0 }}>{initials(row.name)}</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: PC.textMain, lineHeight: 1 }}>{row.name.split(' ')[0]}</div>
                <div style={{ fontSize: 12, color: PC.textMuted, marginTop: 3 }}>{row.name.split(' ').slice(1).join(' ')}</div>
              </div>
            </div>

            {/* Card de PT */}
            <div style={{
              background: hitGoal ? '#0a1f0a' : PC.bgCard,
              border: `1px solid ${hitGoal ? '#4ade8055' : PC.pink + '33'}`,
              borderRadius: 14, padding: '16px 20px', textAlign: 'center',
              boxShadow: hitGoal ? '0 0 30px #4ade8022' : 'none', flexShrink: 0,
            }}>
              {hitGoal && <div style={{ fontSize: 10, fontWeight: 800, color: '#4ade80', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>🔥 Meta superada!</div>}
              <div style={{ fontSize: 64, fontWeight: 900, color: hitGoal ? '#4ade80' : PC.pink, lineHeight: 1 }}>{row.total.toFixed(1)}</div>
              <div style={{ fontSize: 12, color: PC.textMuted, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>Pontos</div>
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 4, background: PC.bgCardDp, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${goalPct}%`, borderRadius: 99, background: hitGoal ? 'linear-gradient(90deg,#f59e0b,#4ade80)' : `linear-gradient(90deg,${PC.purple},${PC.pink})`, transition: 'width 1s ease' }} />
                </div>
                <div style={{ fontSize: 9, color: PC.textMuted, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: hitGoal ? '#4ade80' : PC.textMuted, fontWeight: hitGoal ? 700 : 400 }}>
                    {hitGoal ? `+${(row.total - GOAL).toFixed(1)} acima` : `faltam ${(GOAL - row.total).toFixed(1)} PT`}
                  </span>
                  <span>meta {GOAL} PT</span>
                </div>
              </div>
              {row.prevTotal > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: delta >= 0 ? '#4ade80' : '#f87171' }}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} PT vs semana anterior
                </div>
              )}
            </div>

            {/* Clientes */}
            {clientsSorted.length > 0 && (
              <div style={{ background: PC.bgCard, border: `1px solid ${PC.borderSub}`, borderRadius: 14, padding: '14px 18px', flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: PC.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Clientes Atendidos</div>
                {clientsSorted.map(([client, pts]) => (
                  <div key={client} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: PC.textMain }}>{client}</div>
                      <div style={{ fontSize: 10, color: PC.textMuted }}>{clientDemandCount[client]} demanda{clientDemandCount[client] !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: PC.purpleVbr }}>{pts.toFixed(1)} PT</div>
                  </div>
                ))}
              </div>
            )}

            {/* Alterações */}
            {totalAlteracoes > 0 && (
              <div style={{ background: PC.bgCard, border: `1px solid #4b556355`, borderRadius: 14, padding: '14px 18px', flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: PC.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Alterações</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#6b7280', lineHeight: 1 }}>{totalAlteracoes}</div>
                  <div style={{ fontSize: 11, color: PC.textMuted }}>iten{totalAlteracoes !== 1 ? 's' : ''}<br/>alterados</div>
                </div>
              </div>
            )}

            {/* Categorias */}
            {Object.keys(catPts).length > 0 && (
              <div style={{ background: PC.bgCard, border: `1px solid ${PC.borderSub}`, borderRadius: 14, padding: '14px 18px', flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: PC.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Por Categoria</div>
                {Object.entries(catPts).sort((a, b) => b[1] - a[1]).map(([cat, pts]) => (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: CAT_COLOR[cat] || PC.purpleVbr }}>{cat}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: PC.textSub }}>{pts.toFixed(1)} PT</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coluna direita — demandas ordenadas por cliente */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: PC.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4, flexShrink: 0, display: 'flex', gap: 16, alignItems: 'center' }}>
              <span>{row.demands.length} demanda{row.demands.length !== 1 ? 's' : ''} · {currentWeekLabel}</span>
              {totalAlteracoes > 0 && <span style={{ color: '#6b7280' }}>{totalAlteracoes} alteraç{totalAlteracoes !== 1 ? 'ões' : 'ão'}</span>}
            </div>
            {row.demands.length === 0
              ? <div style={{ color: PC.textMuted, fontSize: 18, fontWeight: 600, marginTop: 40 }}>Sem lançamentos esta semana.</div>
              : (() => {
                // Agrupa por cliente mantendo ordem de pts decrescente por grupo
                const grouped = {}
                ;[...row.demands].sort((a, b) => calcDemandPts(b) - calcDemandPts(a)).forEach(d => {
                  if (!grouped[d.client]) grouped[d.client] = []
                  grouped[d.client].push(d)
                })
                // Ordena clientes por total de pts desc
                const clientOrder = Object.entries(grouped)
                  .sort((a, b) => b[1].reduce((s,d) => s + calcDemandPts(d), 0) - a[1].reduce((s,d) => s + calcDemandPts(d), 0))

                return clientOrder.map(([client, cDemands]) => {
                  const clientTotal = cDemands.reduce((s, d) => s + calcDemandPts(d), 0)
                  const altCount = cDemands.reduce((s, d) => {
                    const isAlt = (d.splits||[]).every(sp => sp.difficulty === 'Alteração')
                    return s + (isAlt ? (d.splits||[]).reduce((a,sp) => a+(parseInt(sp.qty)||0),0) : 0)
                  }, 0)
                  return (
                    <div key={client} style={{ flexShrink: 0 }}>
                      {/* Header do cliente */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, padding: '4px 0' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: PC.blue, background: PC.blue + '18', padding: '3px 12px', borderRadius: 20 }}>{client}</span>
                        <div style={{ flex: 1, height: 1, background: PC.borderSub }} />
                        {altCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#6b728018', padding: '2px 8px', borderRadius: 20 }}>{altCount} alt.</span>}
                        {clientTotal > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: PC.textMuted }}>{clientTotal.toFixed(1)} PT</span>}
                      </div>
                      {/* Demandas do cliente */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {cDemands.map(d => {
                          const meta  = getTaskMeta(d.task)
                          const pts   = calcDemandPts(d)
                          const isAlt = (d.splits||[]).every(sp => sp.difficulty === 'Alteração')
                          const qty   = (d.splits||[]).reduce((s,sp) => s+(parseInt(sp.qty)||0),0)
                          return (
                            <div key={d.id} style={{ background: isAlt ? PC.bgCardDp : PC.bgCard, border: `1px solid ${isAlt ? '#4b556333' : (CAT_COLOR[meta.category] || PC.border) + '33'}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, opacity: isAlt ? 0.75 : 1 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: isAlt ? PC.textMuted : PC.textMain, marginBottom: 4 }}>
                                  {d.task}{d.name ? <span style={{ color: PC.textMuted, fontWeight: 400 }}> · {d.name}</span> : ''}
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 10, color: isAlt ? '#6b7280' : (CAT_COLOR[meta.category] || PC.purpleVbr), fontWeight: 600 }}>{isAlt ? 'Alteração' : meta.category}</span>
                                  {d.splits.map(sp => <span key={sp.id} style={{ fontSize: 10, color: PC.textMuted }}>{sp.qty}× {sp.difficulty}</span>)}
                                </div>
                              </div>
                              {isAlt
                                ? <div style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>{qty} alt.</div>
                                : pts > 0 && <div style={{ fontSize: 20, fontWeight: 900, color: PC.pink, flexShrink: 0 }}>{pts.toFixed(1)}<span style={{ fontSize: 10, color: PC.textMuted, fontWeight: 600 }}> PT</span></div>
                              }
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              })()
            }
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════
  // APRESENTAÇÃO — slide de comparativo
  // ══════════════════════════════════════════════════
  if (presentMode && presentCompare) {
    const rows    = [...dashRows].sort((a, b) => (b.total - b.prevTotal) - (a.total - a.prevTotal))
    const maxPt   = Math.max(...rows.map(r => Math.max(r.total, r.prevTotal)), 1)
    const teamDelta = totalPts - prevTotalPts
    const teamUp    = teamDelta >= 0
    const PC = C

    // top ganhador e top queda
    const withBoth   = rows.filter(r => r.total > 0 && r.prevTotal > 0)
    const topGain    = withBoth.length ? withBoth.reduce((a, b) => (b.total - b.prevTotal) > (a.total - a.prevTotal) ? b : a) : null
    const topDrop    = withBoth.length ? withBoth.reduce((a, b) => (b.total - b.prevTotal) < (a.total - a.prevTotal) ? b : a) : null

    return (
      <div style={{ position: 'fixed', inset: 0, background: PC.bgRoot, display: 'flex', flexDirection: 'column', zIndex: 999, padding: '36px 52px', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: PC.textMain, letterSpacing: '-0.5px', lineHeight: 1 }}>
              Núcleo<span style={{ color: C.pink }}>2</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: PC.textMuted, marginLeft: 14, letterSpacing: 1 }}>COMPARATIVO SEMANAL</span>
            </div>
            <div style={{ fontSize: 12, color: PC.textMuted, marginTop: 5, fontWeight: 600 }}>
              Semana anterior <span style={{ color: PC.textMuted, margin: '0 8px' }}>→</span> <span style={{ color: C.purpleVbr }}>{currentWeekLabel}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPresentCompare(false)}
              style={{ background: PC.bgCardDp, border: `1px solid ${PC.border}`, color: PC.textMuted, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Visão Geral</button>
            <button onClick={() => { setPresentMode(false); setPresentCompare(false) }}
              style={{ background: PC.bgCardDp, border: `1px solid ${PC.border}`, color: PC.textMuted, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>ESC · Sair</button>
          </div>
        </div>

        {/* Faixa de resumo do time */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
          {/* Anterior */}
          <div style={{ background: PC.bgSidebar, border: `1px solid ${PC.borderSub}`, borderRadius: 14, padding: '14px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: PC.textMuted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Time · Semana anterior</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: PC.textMuted, lineHeight: 1 }}>{prevTotalPts.toFixed(0)}<span style={{ fontSize: 14, color: PC.textMuted, fontWeight: 600 }}> PT</span></div>
          </div>
          {/* Delta grande */}
          <div style={{ background: teamUp ? '#071a07' : '#1a0707', border: `1px solid ${teamUp ? '#4ade8033' : '#f8717133'}`, borderRadius: 14, padding: '14px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: teamUp ? '#4ade80' : '#f87171', lineHeight: 1 }}>{teamUp ? '+' : ''}{teamDelta.toFixed(0)}</div>
            <div style={{ fontSize: 10, color: teamUp ? '#4ade8066' : '#f8717166', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 4 }}>PT do time</div>
          </div>
          {/* Atual */}
          <div style={{ background: PC.bgSidebar, border: `1px solid ${C.pink}33`, borderRadius: 14, padding: '14px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: PC.textMuted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Time · Semana atual</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: C.pink, lineHeight: 1 }}>{totalPts.toFixed(0)}<span style={{ fontSize: 14, color: C.pink + '66', fontWeight: 600 }}> PT</span></div>
          </div>
          {/* Destaques */}
          {topGain && (topGain.total - topGain.prevTotal) > 0 && (
            <div style={{ background: '#0a1f0a', border: '1px solid #4ade8033', borderRadius: 14, padding: '14px 22px', textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 10, color: '#4ade8077', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>🚀 Maior Evolução</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#4ade80' }}>{topGain.name.split(' ')[0]}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#4ade80', marginTop: 2 }}>+{(topGain.total - topGain.prevTotal).toFixed(0)} PT</div>
            </div>
          )}
          {topDrop && (topDrop.total - topDrop.prevTotal) < 0 && (
            <div style={{ background: '#1f0a0a', border: '1px solid #f8717133', borderRadius: 14, padding: '14px 22px', textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 10, color: '#f8717177', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>📉 Maior Queda</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#f87171' }}>{topDrop.name.split(' ')[0]}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f87171', marginTop: 2 }}>{(topDrop.total - topDrop.prevTotal).toFixed(0)} PT</div>
            </div>
          )}
        </div>

        {/* Grid de designers */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, alignContent: 'start' }}>
          {rows.map(row => {
            const delta    = row.total - row.prevTotal
            const up       = delta >= 0
            const same     = Math.abs(delta) < 0.1
            const hasPrev  = row.prevTotal > 0
            const hasCurr  = row.total > 0
            const dIdx     = designers.findIndex(d => d.name === row.name)
            const barPrev  = (row.prevTotal / maxPt) * 100
            const barCurr  = (row.total     / maxPt) * 100
            const dc       = same ? '#555' : up ? '#4ade80' : '#f87171'
            const isTopG   = topGain?.name === row.name && delta > 0
            const isTopD   = topDrop?.name === row.name && delta < 0
            return (
              <div key={row.name} onClick={() => { setPresentCompare(false); setPresentDesigner(row.name) }}
                style={{
                  background: PC.bgCard,
                  border: `1px solid ${isTopG ? '#4ade8055' : isTopD ? '#f8717155' : PC.border}`,
                  borderRadius: 14, padding: '16px 20px', cursor: 'pointer',
                  boxShadow: isTopG ? '0 0 20px #4ade8018' : isTopD ? '0 0 20px #f8717118' : 'none',
                }}>
                {/* Nome + delta badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ ...avatarStyle(dIdx), width: 30, height: 30, borderRadius: 8, fontSize: 11, border: '2px solid' }}>{initials(row.name)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: PC.textMain, flex: 1 }}>{row.name.split(' ')[0]}</div>
                  {!same && (hasCurr || hasPrev) && (
                    <div style={{ fontSize: 13, fontWeight: 900, color: dc }}>
                      {up ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}
                    </div>
                  )}
                </div>

                {/* Barras */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 9, color: PC.textMuted, fontWeight: 700, width: 48, textAlign: 'right', flexShrink: 0, letterSpacing: 0.5 }}>ANTERIOR</div>
                    <div style={{ flex: 1, height: 20, background: PC.bgCardDp, borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPrev}%`, background: PC.border, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 7, minWidth: hasPrev ? 4 : 0, transition: 'width .8s ease' }}>
                        {hasPrev && <span style={{ fontSize: 11, fontWeight: 800, color: PC.textSub, whiteSpace: 'nowrap' }}>{row.prevTotal.toFixed(0)}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 9, color: PC.purpleVbr, fontWeight: 700, width: 48, textAlign: 'right', flexShrink: 0, letterSpacing: 0.5 }}>ATUAL</div>
                    <div style={{ flex: 1, height: 20, background: PC.bgCardDp, borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barCurr}%`, background: hasCurr ? `linear-gradient(90deg, ${PC.purple}, ${PC.pink})` : PC.bgCardDp, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 7, minWidth: hasCurr ? 4 : 0, transition: 'width .8s ease' }}>
                        {hasCurr && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>{row.total.toFixed(0)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════
  // APRESENTAÇÃO — visão geral
  // ══════════════════════════════════════════════════
  if (presentMode) {
    const PC = C
    const renderGroup = (groupRows, groupLabel, groupColor) => (
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: groupColor, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4 }}>{groupLabel}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...groupRows].sort((a, b) => b.total - a.total).map((row, ri) => {
            const has  = row.demands.length > 0
            const catC = {}
            row.demands.forEach(d => { const m = getTaskMeta(d.task); catC[m.category] = (catC[m.category] || 0) + 1 })
            const delta = row.total - row.prevTotal
            return (
              <div key={row.name} onClick={() => setPresentDesigner(row.name)}
                style={{
                  background: has ? PC.bgCard : PC.bgCardDp,
                  border: `1px solid ${has ? groupColor + '55' : PC.borderSub}`,
                  borderRadius: 14, padding: '16px 20px', cursor: 'pointer',
                  opacity: has ? 1 : 0.5, position: 'relative',
                }}>
                {ri === 0 && has && <span style={{ position: 'absolute', top: -8, right: 12, fontSize: 18 }}>👑</span>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ ...avatarStyle(row.i), width: 34, height: 34, borderRadius: 9, fontSize: 12, border: '2px solid' }}>{initials(row.name)}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: PC.textMain }}>{row.name}</div>
                      <div style={{ fontSize: 10, color: PC.textMuted }}>{row.demands.length} demanda{row.demands.length !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: has ? PC.pink : PC.textMuted, lineHeight: 1 }}>{row.total.toFixed(1)}</div>
                    {has && row.prevTotal > 0 && (
                      <div style={{ fontSize: 10, color: delta >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
                {has && totalPts > 0 && (
                  <div style={{ height: 3, background: PC.bgCardDp, borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(row.total / totalPts) * 100}%`, background: `linear-gradient(90deg,${PC.purple},${PC.pink})`, borderRadius: 99 }} />
                  </div>
                )}
                {has && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                    {Object.entries(catC).map(([cat, n]) => (
                      <span key={cat} style={{ fontSize: 10, fontWeight: 700, color: CAT_COLOR[cat] || PC.purpleVbr, background: (CAT_COLOR[cat] || PC.purple) + '18', padding: '2px 7px', borderRadius: 20 }}>{n} {cat}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )

    const g1rows = dashRows.filter(r => r.group_id === 1 || r.group_id === 0)
    const g2rows = dashRows.filter(r => r.group_id === 2 || r.group_id === 0)

    return (
      <div style={{ position: 'fixed', inset: 0, background: PC.bgRoot, display: 'flex', flexDirection: 'column', zIndex: 999, padding: '40px 56px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 900, color: PC.textMain, letterSpacing: '-1px', lineHeight: 1 }}>Núcleo<span style={{ color: PC.pink }}>2</span></div>
            <div style={{ fontSize: 12, color: PC.textMuted, marginTop: 3, fontWeight: 600, letterSpacing: 1 }}>{currentWeekLabel}</div>
          </div>
          <div style={{ display: 'flex', gap: 36, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: PC.pink, lineHeight: 1 }}>{totalPts.toFixed(1)}</div>
              <div style={{ fontSize: 11, color: PC.textMuted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3 }}>Total PT</div>
              {prevTotalPts > 0 && (
                <div style={{ fontSize: 10, color: totalPts >= prevTotalPts ? '#4ade80' : '#f87171', fontWeight: 700, marginTop: 2 }}>
                  {totalPts >= prevTotalPts ? '▲' : '▼'} {Math.abs(totalPts - prevTotalPts).toFixed(1)} vs anterior
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: PC.purpleVbr, lineHeight: 1 }}>{filledCount}<span style={{ fontSize: 22, color: PC.textMuted }}>/{designers.length}</span></div>
              <div style={{ fontSize: 11, color: PC.textMuted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3 }}>Preencheram</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => setPresentCompare(true)}
                style={{ background: PC.bgCardDp, border: `1px solid ${PC.purple}55`, color: PC.purpleVbr, borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                📊 Comparativo
              </button>
              <button onClick={() => setPresentMode(false)} style={{ background: PC.bgCardDp, border: `1px solid ${PC.border}`, color: PC.textMuted, borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>ESC · Sair</button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flex: 1, overflow: 'hidden' }}>
          {g1rows.length > 0 && renderGroup(g1rows, 'Leticia', PC.purpleVbr)}
          {g1rows.length > 0 && g2rows.length > 0 && <div style={{ width: 1, background: PC.bgCardDp, flexShrink: 0 }} />}
          {g2rows.length > 0 && renderGroup(g2rows, 'Davila', PC.pink)}
          {g1rows.length === 0 && g2rows.length === 0 && renderGroup(dashRows, 'Time', PC.purpleVbr)}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════
  // APP NORMAL
  // ══════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bgRoot }}>

      {toast && <div style={ST.toast}>{toast}</div>}
      {saving && <div style={{ ...ST.toast, top: 60, background: C.isDark ? '#140820' : '#faf5ff', borderColor: C.purple + '44', color: C.purpleVbr }}>💾 Salvando...</div>}
      {savedOk && !saving && <div style={{ ...ST.toast, top: 60, background: C.isDark ? '#0f2d1a' : '#f0fdf4', borderColor: C.isDark ? '#4ade8044' : '#16a34a44', color: C.isDark ? '#4ade80' : '#16a34a' }}>✅ Salvo!</div>}

      {/* ──────── SIDEBAR (desktop only) ──────── */}
      {!isMobile && (
        <aside style={ST.sidebar}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div style={ST.logo}>Núcleo<span style={{ color: C.pink }}>2</span></div>
            <button onClick={() => setIsDark(p => !p)} title={isDark ? 'Tema claro' : 'Tema escuro'}
              style={{ width: 36, height: 20, borderRadius: 20, border: `1.5px solid ${C.border}`, background: isDark ? C.purpleNav : '#ddd6fe', cursor: 'pointer', flexShrink: 0, transition: 'all .25s', display: 'flex', alignItems: 'center', padding: '2px 3px' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: isDark ? C.purpleVbr : C.purple, transform: isDark ? 'translateX(16px)' : 'translateX(0)', transition: 'transform .25s, background .25s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, lineHeight: 1 }}>
                {isDark ? '🌙' : '☀️'}
              </div>
            </button>
          </div>

          {/* Seletor de Núcleo */}
          {nucleos.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Núcleo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button onClick={() => { setActiveNucleo('all'); localStorage.setItem('n2-nucleo', 'all') }}
                  style={{ textAlign: 'left', background: activeNucleo === 'all' ? C.purpleNav : 'transparent', border: `1px solid ${activeNucleo === 'all' ? C.purple : C.border}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: activeNucleo === 'all' ? C.purpleVbr : C.textMuted, fontFamily: 'inherit', transition: 'all .15s' }}>
                  Todos
                </button>
                {nucleos.map(n => (
                  <button key={n.id} onClick={() => { setActiveNucleo(n.id); localStorage.setItem('n2-nucleo', n.id) }}
                    style={{ textAlign: 'left', background: activeNucleo === n.id ? n.cor + '22' : 'transparent', border: `1px solid ${activeNucleo === n.id ? n.cor : C.border}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: activeNucleo === n.id ? n.cor : C.textMuted, fontFamily: 'inherit', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.cor, flexShrink: 0 }} />
                    {n.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={ST.weekPill}>{currentWeekLabel}</div>

          <nav style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { id: 'dashboard', label: 'Dashboard', svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
              { id: 'entry',     label: 'Lançar Demandas', svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
              { id: 'report',    label: 'Relatório', svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
              { id: 'history',   label: 'Histórico', svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
              { id: 'carga',     label: 'Carga', svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
              { id: 'ideias',    label: 'Ideias', svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><path d="M12 18a6 6 0 100-12 6 6 0 000 12z"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> },
              { id: 'tabela',    label: 'Tabela de Pontos', svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
              { id: 'onboarding', label: 'Como usar', svg: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
            ].map(item => (
              <button key={item.id} className="nav-item"
                style={ST.navBtn(page === item.id && page !== 'profile')}
                onClick={() => { setPage(item.id); setProfileD(null) }}>
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{item.svg}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Time</div>
              <button onClick={() => setShowSettings(true)} title="Configurações" style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              </button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ height: 4, background: C.bgCardDp, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${fillPct}%`, background: fillPct === 100 ? '#4ade80' : `linear-gradient(90deg,${C.purple},${C.pink})`, borderRadius: 99, transition: 'width .5s ease' }} />
              </div>
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3, textAlign: 'right' }}>{filledCount}/{designers.length} preencheram</div>
            </div>

            {group1.length > 0 && (
              <>
                <div style={{ fontSize: 8, color: C.purpleVbr, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Leticia</div>
                {group1.map(d => {
                  const i     = designers.findIndex(x => x.name === d.name)
                  const total = calcTotal(getCurrentDemands(d.name))
                  const act   = activeD === d.name && page === 'entry'
                  return (
                    <button key={d.name} className="nav-item" style={ST.sideD(act)}
                      onClick={() => { setActiveD(d.name); openProfile(d.name) }}>
                      <div style={{ ...avatarStyle(i), width: 22, height: 22, borderRadius: 6, fontSize: 9, border: '1.5px solid' }}>{initials(d.name)}</div>
                      <span style={{ fontSize: 12, fontWeight: act ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: act ? C.textMain : C.textSub, flex: 1 }}>{d.name.split(' ')[0]}</span>
                      {total > 0 && <span onClick={e => { e.stopPropagation(); setActiveD(d.name); setPage('entry'); setProfileD(null) }} style={{ fontSize: 10, fontWeight: 800, color: C.purpleVbr, flexShrink: 0, background: C.purpleNav, padding: '1px 6px', borderRadius: 20, cursor: 'pointer' }} title="Lançar demandas">{total.toFixed(0)}</span>}
                    </button>
                  )
                })}
              </>
            )}

            {group2.length > 0 && (
              <>
                <div style={{ fontSize: 8, color: C.pink, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4, marginTop: 10 }}>Davila</div>
                {group2.map(d => {
                  const i     = designers.findIndex(x => x.name === d.name)
                  const total = calcTotal(getCurrentDemands(d.name))
                  const act   = activeD === d.name && page === 'entry'
                  return (
                    <button key={d.name} className="nav-item" style={ST.sideD(act)}
                      onClick={() => { setActiveD(d.name); openProfile(d.name) }}>
                      <div style={{ ...avatarStyle(i), width: 22, height: 22, borderRadius: 6, fontSize: 9, border: '1.5px solid' }}>{initials(d.name)}</div>
                      <span style={{ fontSize: 12, fontWeight: act ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: act ? C.textMain : C.textSub, flex: 1 }}>{d.name.split(' ')[0]}</span>
                      {total > 0 && <span onClick={e => { e.stopPropagation(); setActiveD(d.name); setPage('entry'); setProfileD(null) }} style={{ fontSize: 10, fontWeight: 800, color: C.pink, flexShrink: 0, background: C.pink + '22', padding: '1px 6px', borderRadius: 20, cursor: 'pointer' }} title="Lançar demandas">{total.toFixed(0)}</span>}
                    </button>
                  )
                })}
              </>
            )}

            {group1.length === 0 && group2.length === 0 && designers.map((d, i) => {
              const total = calcTotal(getCurrentDemands(d.name))
              const act   = activeD === d.name && page === 'entry'
              return (
                <button key={d.name} className="nav-item" style={ST.sideD(act)}
                  onClick={() => { setActiveD(d.name); openProfile(d.name) }}>
                  <div style={{ ...avatarStyle(i), width: 22, height: 22, borderRadius: 6, fontSize: 9, border: '1.5px solid' }}>{initials(d.name)}</div>
                  <span style={{ fontSize: 12, fontWeight: act ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: act ? C.textMain : C.textSub, flex: 1 }}>{d.name.split(' ')[0]}</span>
                  {total > 0 && <span onClick={e => { e.stopPropagation(); setActiveD(d.name); setPage('entry'); setProfileD(null) }} style={{ fontSize: 10, fontWeight: 800, color: C.purpleVbr, flexShrink: 0, background: C.purpleNav, padding: '1px 6px', borderRadius: 20, cursor: 'pointer' }} title="Lançar demandas">{total.toFixed(0)}</span>}
                </button>
              )
            })}
          </div>
        </aside>
      )}

      {/* ──────── BOTTOM NAV (mobile only) ──────── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: C.bgSidebar, borderTop: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'stretch',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {[
            { id: 'dashboard', icon: '▦', label: 'Início' },
            { id: 'entry',     icon: '✏', label: 'Lançar' },
            { id: 'carga',     icon: '📅', label: 'Carga' },
            { id: 'ideias',    icon: '💡', label: 'Ideias' },
            { id: 'settings',  icon: '⚙', label: 'Config' },
          ].map(item => {
            const isAct = item.id === 'settings' ? showSettings : (page === item.id && page !== 'profile')
            return (
              <button key={item.id}
                onClick={() => {
                  if (item.id === 'settings') { setShowSettings(true); return }
                  setPage(item.id); setProfileD(null)
                }}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 3, padding: '10px 4px', border: 'none', background: 'transparent',
                  color: isAct ? C.purpleVbr : C.textMuted, fontFamily: 'inherit', cursor: 'pointer',
                  borderTop: isAct ? `2px solid ${C.purpleVbr}` : '2px solid transparent',
                  transition: 'all .15s',
                }}>
                <span style={{ fontSize: 17 }}>{item.icon}</span>
                <span style={{ fontSize: 9, fontWeight: isAct ? 700 : 500 }}>{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}

      {/* ──────── MAIN ──────── */}
      <main style={{
        ...ST.main,
        marginLeft: isMobile ? 0 : 220,
        padding: isMobile ? '16px 14px 90px' : '30px 36px',
      }}>

        {/* ════ DASHBOARD ════ */}
        {page === 'dashboard' && (
          <div className="fade-in">
            {/* Header — mobile tem toggle de tema embutido */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h1 style={ST.ptitle}>Dashboard</h1>
                  {isMobile && (
                    <button onClick={() => setIsDark(p => !p)}
                      style={{ width: 32, height: 18, borderRadius: 20, border: `1.5px solid ${C.border}`, background: isDark ? C.purpleNav : '#ddd6fe', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '2px 3px' }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: isDark ? C.purpleVbr : C.purple, transform: isDark ? 'translateX(14px)' : 'translateX(0)', transition: 'transform .25s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>
                        {isDark ? '🌙' : '☀️'}
                      </div>
                    </button>
                  )}
                </div>
                <p style={ST.psub}>{filledCount}/{filteredDesigners.length} designers · {currentWeekLabel}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!isMobile && <button style={ST.btnGold} onClick={() => setPresentMode(true)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    Apresentar
                  </span>
                </button>}
                <button style={ST.btnGhost} onClick={() => exportReport(dashRows, currentWeekLabel)}>Exportar</button>
              </div>
            </div>

            {/* Banner quem não preencheu */}
            {notFilled.length > 0 && (
              <div style={{ background: C.isDark ? '#1a0f0a' : '#fff7ed', border: `1px solid ${C.amber}44`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>Ainda não preencheram:</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {notFilled.map(name => (
                    <button key={name} onClick={() => { setActiveD(name); setPage('entry') }}
                      style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amber + '18', border: `1px solid ${C.amber}44`, borderRadius: 20, padding: '3px 10px', cursor: 'pointer' }}>
                      {name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4 stat cards — 2 colunas no mobile, 4 no desktop */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 8 : 12, marginBottom: 12 }}>
              {[
                { label: 'Total do Time',  val: totalPts.toFixed(1),   unit: 'pontos' },
                { label: 'Média/Designer', val: filledCount > 0 ? (totalPts / filledCount).toFixed(1) : '0', unit: 'pts/pessoa' },
                { label: 'Itens Lançados', val: totalItems,             unit: 'demandas' },
                { label: 'Top Cliente',    val: teamTopClient || '—',   unit: 'mais demandas' },
              ].map(s => (
                <div key={s.label} style={{ ...ST.statCard, padding: isMobile ? '12px 14px' : '15px 18px' }}>
                  <div style={ST.statLbl}>{s.label}</div>
                  <div style={{ ...ST.statVal, fontSize: isMobile ? (typeof s.val === 'string' && s.val.length > 5 ? 18 : 26) : (typeof s.val === 'string' && s.val.length > 8 ? 18 : 34) }}>{s.val}</div>
                  <div style={ST.statUnit}>{s.unit}</div>
                </div>
              ))}
            </div>

            {/* Strip G1 vs G2 com meta por designer */}
            {(() => {
              const GOAL_PER = 500
              const g1rows  = dashRowsRaw.filter(r => r.group_id === 1)
              const g2rows  = dashRowsRaw.filter(r => r.group_id === 2)
              if (g1rows.length === 0 || g2rows.length === 0) return null
              const g1total = g1rows.reduce((s, r) => s + r.total, 0)
              const g2total = g2rows.reduce((s, r) => s + r.total, 0)
              const g1goal  = g1rows.length * GOAL_PER
              const g2goal  = g2rows.length * GOAL_PER
              const g1pct   = Math.min((g1total / g1goal) * 100, 100)
              const g2pct   = Math.min((g2total / g2goal) * 100, 100)
              const g1over  = g1total >= g1goal
              const g2over  = g2total >= g2goal

              const Strip = ({ label, total, goal, pct, over, color, colorB }) => (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: over ? '#4ade80' : color, letterSpacing: 1.5, textTransform: 'uppercase', flexShrink: 0 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: over ? '#4ade80' : color, lineHeight: 1, flexShrink: 0, transition: 'color .3s' }}>{total.toFixed(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 5, background: C.bgCardDp, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, transition: 'width .8s ease, background .3s',
                        background: over ? 'linear-gradient(90deg,#f59e0b,#4ade80)' : `linear-gradient(90deg,${color},${colorB})`,
                        boxShadow: over ? '0 0 6px #4ade8066' : 'none'
                      }} />
                    </div>
                    <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: over ? '#4ade80' : C.textMuted, fontWeight: over ? 700 : 400 }}>
                        {over ? `🔥 +${(total - goal).toFixed(0)} PT` : `faltam ${(goal - total).toFixed(0)} PT`}
                      </span>
                      <span>meta {goal} PT</span>
                    </div>
                  </div>
                </div>
              )

              return (
                <div style={{ background: C.bgCard, border: `1px solid ${g1over && g2over ? '#4ade8044' : C.border}`, borderRadius: 12, padding: '14px 20px', marginBottom: 12, display: 'flex', gap: 20, alignItems: 'center', transition: 'border-color .3s' }}>
                  <Strip label="Leticia" total={g1total} goal={g1goal} pct={g1pct} over={g1over} color={C.purpleVbr} colorB={C.purple} />
                  <div style={{ width: 1, height: 36, background: C.border, flexShrink: 0 }} />
                  <Strip label="Davila" total={g2total} goal={g2goal} pct={g2pct} over={g2over} color={C.pink} colorB={C.pinkLt} />
                </div>
              )
            })()}

            {/* Comparativo time vs semana anterior */}
            {prevTotalPts > 0 && (
              <div style={{ ...ST.section, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>vs semana anterior</span>
                <DeltaBadge current={totalPts} prev={prevTotalPts} C={C} />
                <span style={{ fontSize: 12, color: C.textMuted }}>Anterior: {prevTotalPts.toFixed(1)} PT · Atual: {totalPts.toFixed(1)} PT</span>
              </div>
            )}

            {/* Gráfico por categoria */}
            {Object.keys(catBreak).length > 0 && (
              <div style={{ ...ST.section, marginBottom: 16 }}>
                <div style={ST.secTitle}>Distribuição por Categoria</div>
                <CatBarChart catBreak={catBreak} C={C} />
              </div>
            )}

            {/* Ranking da Semana — unificado com badge G1/G2 */}
            <div style={ST.section}>
              <div style={ST.secTitle}>Ranking da Semana</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dashRows.map((row, rank) => {
                  const GOAL_PER = 500
                  const has  = row.demands.length > 0
                  const catC = {}
                  row.demands.forEach(d => { const m = getTaskMeta(d.task); catC[m.category] = (catC[m.category] || 0) + 1 })
                  const tc = topClient(row.demands)
                  const grpColor = row.group_id === 2 ? C.pink : C.purpleVbr
                  const isFirst  = rank === 0 && has
                  const hitGoal  = row.total >= GOAL_PER
                  return (
                    <div key={row.name} className="rank-card"
                      style={{ ...ST.rankCard, borderLeft: `3px solid ${grpColor}44`,
                        ...(isFirst ? { borderColor: grpColor + '88', boxShadow: `0 0 16px ${grpColor}18` } : {}),
                        ...(hitGoal ? { borderColor: '#4ade8066' } : {}),
                      }}
                      onClick={() => openProfile(row.name)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 24, textAlign: 'center', flexShrink: 0 }}>
                          {isFirst ? <span style={{ fontSize: 16 }}>👑</span> : <span style={{ fontSize: 12, fontWeight: 800, color: C.textMuted }}>#{rank + 1}</span>}
                        </div>
                        <div style={avatarStyle(row.i)}>{initials(row.name)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.textMain }}>{row.name}</div>
                            <span style={{ fontSize: 9, fontWeight: 700, color: grpColor, background: grpColor + '18', padding: '1px 6px', borderRadius: 10 }}>{row.group_id === 1 ? 'Leticia' : row.group_id === 2 ? 'Davila' : ''}</span>
                            {hitGoal && <span style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', background: '#4ade8018', padding: '1px 6px', borderRadius: 10 }}>🔥 meta</span>}
                          </div>
                          <div style={{ fontSize: 12, color: C.textSub, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            {has ? Object.entries(catC).map(([c, n]) => <span key={c} style={{ color: CAT_COLOR[c] || C.textSub, fontWeight: 600 }}>{n} {c}</span>)
                              : <span style={{ color: C.textMuted }}>Sem lançamentos</span>}
                            {tc && <span style={{ color: C.blue, fontWeight: 600, fontSize: 11 }}>· {tc}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: hitGoal ? '#4ade80' : has ? C.pink : C.textMuted, lineHeight: 1, transition: 'color .3s' }}>{row.total.toFixed(1)}</div>
                            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1 }}>PT</div>
                          </div>
                          {has && row.prevTotal > 0 && (
                            <div style={{ fontSize: 10, fontWeight: 700, color: row.total >= row.prevTotal ? '#4ade80' : '#f87171' }}>
                              {row.total >= row.prevTotal ? '▲' : '▼'} {Math.abs(row.total - row.prevTotal).toFixed(1)}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 18, color: C.textMuted }}>›</span>
                      </div>
                      {has && totalPts > 0 && (
                        <div style={{ height: 3, background: C.bgCardDp, borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(row.total / totalPts) * 100}%`,
                            background: hitGoal ? 'linear-gradient(90deg,#f59e0b,#4ade80)' : `linear-gradient(90deg,${C.purple},${C.pink})`,
                            borderRadius: 99, transition: 'width 1s ease, background .3s' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════ ENTRY ════ */}
        {page === 'entry' && activeD && (
          <div className="fade-in">
            <div style={ST.phdr}>
              <div>
                <h1 style={ST.ptitle}>Lançar Demandas</h1>
                <p style={ST.psub}>Semana atual: <strong style={{ color: C.purpleVbr }}>{currentWeekLabel}</strong></p>
              </div>
            </div>

            {/* Seletor de designer — scroll horizontal no mobile, pills no desktop */}
            {isMobile ? (
              <div style={{ marginBottom: 16 }}>
                <select value={activeD} onChange={e => setActiveD(e.target.value)}
                  style={{ ...ST.sel, width: '100%', fontSize: 15, padding: '12px 14px', borderRadius: 10, fontWeight: 600, color: C.purpleVbr, borderColor: C.purple + '55' }}>
                  {designers.map(d => {
                    const total = calcTotal(getCurrentDemands(d.name))
                    return <option key={d.name} value={d.name}>{d.name}{total > 0 ? ` · ${total.toFixed(0)} PT` : ''}</option>
                  })}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
                {designers.map(d => {
                  const i     = designers.findIndex(x => x.name === d.name)
                  const total = calcTotal(getCurrentDemands(d.name))
                  const act   = activeD === d.name
                  return (
                    <button key={d.name} style={ST.dTab(act)} onClick={() => setActiveD(d.name)}>
                      <div style={{ ...avatarStyle(i), width: 22, height: 22, borderRadius: 6, fontSize: 9, border: '1.5px solid' }}>{initials(d.name)}</div>
                      {d.name.split(' ')[0]}
                      {total > 0 && <span style={{ marginLeft: 3, background: act ? C.purple + '33' : C.bgCardDp, color: act ? C.purpleVbr : C.textSub, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 20 }}>{total.toFixed(1)}</span>}
                    </button>
                  )
                })}
              </div>
            )}

            <EntryPanel
              key={activeD}
              designer={activeD}
              dIdx={designers.findIndex(d => d.name === activeD)}
              demands={getCurrentDemands(activeD)}
              prevDemands={getPrevDemands(activeD)}
              clients={(() => {
                const des = filteredDesigners.find(d => d.name === activeD)
                const grp = des?.group_id ?? 0
                // designer "Ambos" (grp=0) vê todos os clientes
                if (grp === 0) return filteredClients.map(c => c.name)
                return filteredClients
                  .filter(c => c.group_id === 0 || c.group_id === grp)
                  .map(c => c.name)
              })()}
              demandContext={(() => {
                const des = filteredDesigners.find(d => d.name === activeD) || designers.find(d => d.name === activeD)
                return {
                  designer_name: activeD,
                  nucleo_id: des?.nucleo_id ?? null,
                  group_id: des?.group_id ?? 0,
                }
              })()}
              theme={C}
              ST={ST}
              isMobile={isMobile}
              onChange={d => setCurrentDemands(activeD, d)}
            />
          </div>
        )}

        {page === 'profile' && profileD && (
          <ProfileView designer={profileD} dIdx={designers.findIndex(d => d.name === profileD)} demands={getCurrentDemands(profileD)}
            allWeeks={allWeeks}
            clients={filteredClients.map(c => c.name)}
            weekLabel={currentWeekLabel} designers={desNames} allDIdx={name => designers.findIndex(d => d.name === name)} onSwitch={name => setProfileD(name)} onBack={() => setPage('dashboard')} onChange={d => setCurrentDemands(profileD, d)} theme={C} ST={ST} />
        )}

        {/* ════ REPORT ════ */}
        {page === 'report' && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 style={ST.ptitle}>Relatório</h1>
                <p style={ST.psub}>{reportView === 'mes' ? getMonthLabel(histMonth) : getWeekLabel(histWeek)}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Toggle semana/mês */}
                <div style={{ display: 'flex', background: C.bgCardDp, borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
                  {[{ id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mês' }].map(v => (
                    <button key={v.id} onClick={() => setReportView(v.id)}
                      style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, transition: 'all .15s',
                        background: reportView === v.id ? C.purple : 'transparent',
                        color: reportView === v.id ? '#fff' : C.textMuted }}>
                      {v.label}
                    </button>
                  ))}
                </div>
                {/* Seletores */}
                <select value={histMonth} onChange={e => { setHistMonth(e.target.value); setHistWeek(getWeeksInMonth(e.target.value)[0] || currentWeekKey) }} style={{ ...ST.sel, fontSize: 12 }}>
                  {last12months.map(m => <option key={m} value={m}>{getMonthLabel(m)}</option>)}
                </select>
                {reportView === 'semana' && (
                  <select value={histWeek} onChange={e => setHistWeek(e.target.value)} style={{ ...ST.sel, fontSize: 12 }}>
                    {weeksInMonth.map(wk => <option key={wk} value={wk}>{getWeekLabel(wk)}</option>)}
                  </select>
                )}
                <button style={ST.btnGold} onClick={() => exportPDF('relatorio',
                  reportView === 'mes' ? monthRows : histRows,
                  reportView === 'mes' ? getMonthLabel(histMonth) : getWeekLabel(histWeek)
                )}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
                    Exportar PDF
                  </span>
                </button>
              </div>
            </div>

            {/* Vista mensal — resumo por semana + total */}
            {reportView === 'mes' && (
              <div>
                {/* Sumário do mês */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total do Mês', val: monthTotalPts.toFixed(1), unit: 'pontos' },
                    { label: 'Semanas', val: weeksInMonth.length, unit: 'no mês' },
                    { label: 'Designers ativos', val: monthRows.filter(r => r.total > 0).length, unit: `de ${designers.length}` },
                    { label: 'Média/Designer', val: monthRows.filter(r => r.total > 0).length > 0 ? (monthTotalPts / monthRows.filter(r => r.total > 0).length).toFixed(1) : '0', unit: 'pts/pessoa' },
                  ].map(s => (
                    <div key={s.label} style={{ ...ST.statCard, padding: '12px 16px' }}>
                      <div style={ST.statLbl}>{s.label}</div>
                      <div style={{ ...ST.statVal, fontSize: 28 }}>{s.val}</div>
                      <div style={ST.statUnit}>{s.unit}</div>
                    </div>
                  ))}
                </div>

                {/* Ranking mensal */}
                <div style={{ ...ST.section, marginBottom: 16 }}>
                  <div style={ST.secTitle}>Ranking do mês — {getMonthLabel(histMonth)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...monthRows].sort((a, b) => b.total - a.total).filter(r => r.total > 0).map((r, i) => {
                      const itens = r.demands.reduce((s, d) => s + (d.splits||[]).reduce((a, sp) => a + (parseInt(sp.qty)||0), 0), 0)
                      return (
                        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.bgCardDp, borderRadius: 10, padding: '12px 16px' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, width: 22, textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                          <div style={avatarStyle(r.i)}>{initials(r.name)}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.textMain }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: C.textMuted }}>{r.demands.length} demandas · {itens} itens</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: C.pink, lineHeight: 1 }}>{r.total.toFixed(1)}</div>
                            <div style={{ fontSize: 9, color: C.textMuted }}>PT</div>
                          </div>
                        </div>
                      )
                    })}
                    {monthRows.every(r => r.total === 0) && <EmptyWeek C={C} />}
                  </div>
                </div>

                {/* Resumo por semana do mês */}
                <div style={ST.section}>
                  <div style={ST.secTitle}>Semanas de {getMonthLabel(histMonth)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {weeksInMonth.map(wk => {
                      const wkTotal = designers.reduce((s, d) => s + calcTotal(allWeeks[wk]?.[d.name]?.demands || []), 0)
                      const wkDesigners = designers.filter(d => (allWeeks[wk]?.[d.name]?.demands || []).length > 0).length
                      return (
                        <div key={wk} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bgCardDp, borderRadius: 8, padding: '10px 16px', cursor: 'pointer' }}
                          onClick={() => { setReportView('semana'); setHistWeek(wk) }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.textMain }}>{getWeekLabel(wk)}</div>
                            <div style={{ fontSize: 11, color: C.textMuted }}>{wkDesigners}/{designers.length} designers</div>
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: wkTotal > 0 ? C.pink : C.textMuted }}>{wkTotal.toFixed(1)} PT</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Vista semanal — igual a antes */}
            {reportView === 'semana' && (<>
              {[...histRows].sort((a, b) => b.total - a.total).filter(r => r.demands.length > 0).map(row => (
                <div key={row.name} style={{ ...ST.section, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={avatarStyle(row.i)}>{initials(row.name)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.textMain }}>{row.name}</div>
                      <div style={{ fontSize: 12, color: C.textSub }}>{row.demands.length} demanda(s)</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: C.pink }}>{row.total.toFixed(1)} PT</div>
                      <button onClick={() => openProfile(row.name)} style={{ ...ST.btnGold, fontSize: 11, padding: '6px 12px' }}>Ver Perfil</button>
                    </div>
                  </div>
                  <DemandList demands={row.demands} theme={C} />
                </div>
              ))}
              {histRows.every(r => r.demands.length === 0) && <EmptyWeek C={C} />}
              {histRows.some(r => r.demands.length > 0) && (
                <div style={{ ...ST.section, display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 13, color: C.textSub }}>Total da semana</span>
                  <span style={{ fontSize: 28, fontWeight: 800, color: C.pink }}>{histTotalPts.toFixed(1)} PT</span>
                </div>
              )}
            </>)}
          </div>
        )}

        {/* ════ HISTORY ════ */}
        {page === 'history' && (
          <div className="fade-in">
            <div style={ST.phdr}>
              <div><h1 style={ST.ptitle}>Histórico</h1><p style={ST.psub}>Últimos 12 meses</p></div>
            </div>

            {/* Tabs: Por Semana | G1 vs G2 | Demandas por Time | Heatmap */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { id: 'semana',   label: 'Por Semana' },
                { id: 'grupos',   label: 'Leticia vs Davila' },
                { id: 'demandas', label: 'Demandas por Time' },
                { id: 'clientes', label: 'Top Clientes' },
                { id: 'heatmap',  label: 'Heatmap' },
              ].map(t => (
                <button key={t.id} style={ST.dTab(histView === t.id)} onClick={() => setHistView(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── ABA: G1 vs G2 ── */}
            {histView === 'grupos' && (() => {
              // Coleta todas as semanas com dados nos últimos 12 meses
              const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
              const wkCutoff = getWeekKey(oneYearAgo)
              const allWks = Object.keys(allWeeks).filter(wk => wk >= wkCutoff).sort()

              const g1designers = designers.filter(d => d.group_id === 1 || d.group_id === 0)
              const g2designers = designers.filter(d => d.group_id === 2 || d.group_id === 0)

              const rows = allWks.map(wk => {
                const g1 = g1designers.reduce((s, d) => s + calcTotal(allWeeks[wk]?.[d.name]?.demands || []), 0)
                const g2 = g2designers.reduce((s, d) => s + calcTotal(allWeeks[wk]?.[d.name]?.demands || []), 0)
                return { wk, g1, g2, label: (() => { const d = new Date(wk + 'T12:00:00'); return `${d.getDate()}/${d.getMonth()+1}` })() }
              }).filter(r => r.g1 > 0 || r.g2 > 0)

              if (rows.length === 0) return <div style={{ ...ST.section, textAlign: 'center', padding: '52px 0', color: C.textMuted }}>Sem dados ainda</div>

              const maxVal = Math.max(...rows.map(r => Math.max(r.g1, r.g2)), 1)
              const totalG1 = rows.reduce((s, r) => s + r.g1, 0)
              const totalG2 = rows.reduce((s, r) => s + r.g2, 0)

              // SVG line chart
              const W = 800, H = 280, PAD = { top: 30, right: 20, bottom: 50, left: 56 }
              const chartW = W - PAD.left - PAD.right
              const chartH = H - PAD.top - PAD.bottom
              const xStep  = rows.length > 1 ? chartW / (rows.length - 1) : chartW
              const yScale = v => chartH - (v / maxVal) * chartH

              const pointsG1 = rows.map((r, i) => [PAD.left + i * xStep, PAD.top + yScale(r.g1)])
              const pointsG2 = rows.map((r, i) => [PAD.left + i * xStep, PAD.top + yScale(r.g2)])

              const toPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
              const toArea = (pts, baseline) => `${toPath(pts)} L${pts[pts.length-1][0].toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${pts[0][0].toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`

              // Grid lines (y axis)
              const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => ({
                y: PAD.top + yScale(maxVal * t),
                label: Math.round(maxVal * t)
              }))

              return (
                <div style={ST.section}>
                  {/* Legenda + totais */}
                  <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke={C.purpleVbr} strokeWidth="3" strokeLinecap="round"/></svg>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.textSub }}>Leticia</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: C.purpleVbr }}>{totalG1.toFixed(0)} PT</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke={C.pink} strokeWidth="3" strokeLinecap="round"/></svg>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.textSub }}>Davila</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: C.pink }}>{totalG2.toFixed(0)} PT</span>
                    </div>
                  </div>

                  {/* SVG Chart */}
                  <div style={{ overflowX: 'auto' }}>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 400, display: 'block' }}>
                      <defs>
                        <linearGradient id="gradG1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.purpleVbr} stopOpacity="0.25"/>
                          <stop offset="100%" stopColor={C.purpleVbr} stopOpacity="0.02"/>
                        </linearGradient>
                        <linearGradient id="gradG2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.pink} stopOpacity="0.2"/>
                          <stop offset="100%" stopColor={C.pink} stopOpacity="0.02"/>
                        </linearGradient>
                      </defs>

                      {/* Grid lines */}
                      {gridLines.map((gl, i) => (
                        <g key={i}>
                          <line x1={PAD.left} y1={gl.y} x2={W - PAD.right} y2={gl.y}
                            stroke={C.isDark ? '#ffffff11' : '#00000011'} strokeWidth="1"/>
                          <text x={PAD.left - 8} y={gl.y + 4} textAnchor="end"
                            fill={C.textMuted} fontSize="11" fontFamily="DM Sans, sans-serif">
                            {gl.label}
                          </text>
                        </g>
                      ))}

                      {/* Área preenchida G1 */}
                      {rows.length > 1 && (
                        <path d={toArea(pointsG1)} fill="url(#gradG1)" />
                      )}
                      {/* Área preenchida G2 */}
                      {rows.length > 1 && (
                        <path d={toArea(pointsG2)} fill="url(#gradG2)" />
                      )}

                      {/* Linha G1 */}
                      {rows.length > 1 && (
                        <path d={toPath(pointsG1)} fill="none" stroke={C.purpleVbr} strokeWidth="3"
                          strokeLinecap="round" strokeLinejoin="round"/>
                      )}
                      {/* Linha G2 */}
                      {rows.length > 1 && (
                        <path d={toPath(pointsG2)} fill="none" stroke={C.pink} strokeWidth="3"
                          strokeLinecap="round" strokeLinejoin="round"/>
                      )}

                      {/* Pontos e labels G1 */}
                      {pointsG1.map(([x, y], i) => (
                        <g key={`g1-${i}`}>
                          <circle cx={x} cy={y} r="6" fill={C.purpleVbr} stroke={C.bgCard} strokeWidth="2"/>
                          <text x={x} y={y - 12} textAnchor="middle"
                            fill={C.purpleVbr} fontSize="11" fontWeight="700" fontFamily="DM Sans, sans-serif">
                            {rows[i].g1 > 0 ? rows[i].g1.toFixed(0) : ''}
                          </text>
                        </g>
                      ))}

                      {/* Pontos e labels G2 */}
                      {pointsG2.map(([x, y], i) => (
                        <g key={`g2-${i}`}>
                          <circle cx={x} cy={y} r="6" fill={C.pink} stroke={C.bgCard} strokeWidth="2"/>
                          <text x={x} y={y + 20} textAnchor="middle"
                            fill={C.pink} fontSize="11" fontWeight="700" fontFamily="DM Sans, sans-serif">
                            {rows[i].g2 > 0 ? rows[i].g2.toFixed(0) : ''}
                          </text>
                        </g>
                      ))}

                      {/* Labels eixo X (semanas) */}
                      {rows.map((r, i) => (
                        <text key={`x-${i}`}
                          x={PAD.left + i * xStep} y={H - 10}
                          textAnchor="middle" fill={C.textMuted}
                          fontSize="11" fontWeight="600" fontFamily="DM Sans, sans-serif">
                          {r.label}
                        </text>
                      ))}
                    </svg>
                  </div>
                </div>
              )
            })()}

            {/* ── ABA: Por Semana ── */}
            {/* ── ABA: Demandas por Time ── */}
            {histView === 'demandas' && (() => {
              const g1des = designers.filter(d => d.group_id === 1 || d.group_id === 0)
              const g2des = designers.filter(d => d.group_id === 2 || d.group_id === 0)

              // Filtro: semana atual ou mês selecionado
              const [demView, setDemView] = [histMonth, setHistMonth]
              const weeksForDem = getWeeksInMonth(histMonth)

              const teamData = (desGroup) => desGroup.map(d => {
                const demands = weeksForDem.flatMap(wk => allWeeks[wk]?.[d.name]?.demands || [])
                  .filter(dem => getTaskMeta(dem.task).category !== 'Especiais') // exclui Especiais (reuniões, urgências, etc)
                const qty = demands.reduce((s, dem) => s + (dem.splits||[]).reduce((a, sp) => a + (parseInt(sp.qty)||0), 0), 0)
                return { name: d.name, i: designers.findIndex(x => x.name === d.name), qty, count: demands.length }
              })

              const g1data  = teamData(g1des)
              const g2data  = teamData(g2des)
              const g1qty   = g1data.reduce((s, d) => s + d.qty, 0)
              const g2qty   = g2data.reduce((s, d) => s + d.qty, 0)
              const maxQty  = Math.max(...[...g1data,...g2data].map(d => d.qty), 1)

              const renderTeam = (label, color, data, totalQty) => (
                <div style={{ flex: 1, minWidth: isMobile ? '100%' : 280 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '14px 18px', background: color + '18', border: `1px solid ${color}44`, borderRadius: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: 32, fontWeight: 900, color, marginTop: 4, lineHeight: 1 }}>{totalQty}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>telas para clientes</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: color + '88' }}>{data.filter(d => d.qty > 0).length}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>de {data.length} ativos</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[...data].sort((a, b) => b.qty - a.qty).map(d => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ ...avatarStyle(d.i), width: 34, height: 34, borderRadius: 9, fontSize: 12 }}>{initials(d.name)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.textMain }}>{d.name.split(' ')[0]}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{d.count} demandas</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 48 }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: d.qty > 0 ? color : C.textMuted, lineHeight: 1 }}>{d.qty}</div>
                          <div style={{ fontSize: 9, color: C.textMuted }}>telas</div>
                        </div>
                        <div style={{ width: 70, flexShrink: 0 }}>
                          <div style={{ height: 4, background: C.bgCardDp, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((d.qty / maxQty) * 100)}%`, background: color, borderRadius: 99, transition: 'width .5s' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )

              return (
                <div>
                  {/* Filtro de mês */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                    {last12months.map(m => (
                      <button key={m} onClick={() => setHistMonth(m)}
                        style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: `1px solid ${m === histMonth ? C.purple : C.border}`, cursor: 'pointer', background: m === histMonth ? C.purpleNav : 'transparent', color: m === histMonth ? C.purpleVbr : C.textSub, transition: 'all .15s' }}>
                        {getMonthLabel(m)}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {renderTeam('Leticia', C.purpleVbr, g1data, g1qty)}
                    {renderTeam('Davila', C.pink, g2data, g2qty)}
                  </div>
                </div>
              )
            })()}

            {/* ── ABA: Top Clientes ── */}
            {histView === 'clientes' && (() => {
              const weeksForCli = getWeeksInMonth(histMonth)

              // Agrega demandas de todos os designers, excluindo Scrum e Especiais
              const allDemands = designers.flatMap(d =>
                weeksForCli.flatMap(wk => allWeeks[wk]?.[d.name]?.demands || [])
                  .filter(dem => dem.client !== 'Scrum' && getTaskMeta(dem.task).category !== 'Especiais')
                  .map(dem => ({ ...dem, designer: d.name, group_id: d.group_id }))
              )

              // Rank geral por cliente
              const clientMap = {}
              allDemands.forEach(d => {
                if (!clientMap[d.client]) clientMap[d.client] = { client: d.client, count: 0, g1: 0, g2: 0 }
                clientMap[d.client].count++
                if (d.group_id === 1 || d.group_id === 0) clientMap[d.client].g1++
                if (d.group_id === 2 || d.group_id === 0) clientMap[d.client].g2++
              })
              const ranked = Object.values(clientMap).sort((a, b) => b.count - a.count)
              const maxCount = ranked[0]?.count || 1

              // Por squad — filtra pelo group_id do cliente
              const squadDemands = (gid) => designers
                .filter(d => d.group_id === gid || d.group_id === 0)
                .flatMap(d =>
                  weeksForCli.flatMap(wk => allWeeks[wk]?.[d.name]?.demands || [])
                    .filter(dem => {
                      const cli = clients.find(c => c.name === dem.client)
                      const cliGroup = cli?.group_id ?? 0
                      return dem.client !== 'Scrum'
                        && getTaskMeta(dem.task).category !== 'Especiais'
                        && (cliGroup === 0 || cliGroup === gid)
                    })
                )
              const squadRank = (gid) => {
                const map = {}
                squadDemands(gid).forEach(d => { map[d.client] = (map[d.client] || 0) + 1 })
                return Object.entries(map).sort((a, b) => b[1] - a[1])
              }
              const g1rank = squadRank(1)
              const g2rank = squadRank(2)
              const maxG1 = g1rank[0]?.[1] || 1
              const maxG2 = g2rank[0]?.[1] || 1

              const CLIENT_PALETTE = ['#8b2fe8','#e8196a','#60a5fa','#4ade80','#fbbf24','#f472b6','#34d399','#fb923c','#a78bfa','#38bdf8','#e879f9']
              const clientColor = (name) => {
                const idx = clients.findIndex(c => c.name === name)
                return CLIENT_PALETTE[idx >= 0 ? idx % CLIENT_PALETTE.length : 0]
              }

              return (
                <div>
                  {/* Filtro mês */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                    {last12months.map(m => (
                      <button key={m} onClick={() => setHistMonth(m)}
                        style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: `1px solid ${m === histMonth ? C.purple : C.border}`, cursor: 'pointer', background: m === histMonth ? C.purpleNav : 'transparent', color: m === histMonth ? C.purpleVbr : C.textSub, transition: 'all .15s' }}>
                        {getMonthLabel(m)}
                      </button>
                    ))}
                  </div>

                  {ranked.length === 0 ? (
                    <div style={{ ...ST.section, textAlign: 'center', padding: '52px 0', color: C.textMuted }}>Sem dados neste mês</div>
                  ) : (<>

                    {/* ── Ranking Geral ── */}
                    <div style={{ ...ST.section, marginBottom: 20 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
                        Ranking Geral — {getMonthLabel(histMonth)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {ranked.map((r, i) => {
                          const color = clientColor(r.client)
                          const pct = Math.round((r.count / maxCount) * 100)
                          return (
                            <div key={r.client} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, width: 22, textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.textMain }}>{r.client}</div>
                              <div style={{ width: 160, flexShrink: 0 }}>
                                <div style={{ height: 6, background: C.bgCardDp, borderRadius: 99, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .5s' }} />
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
                                <span style={{ fontSize: 18, fontWeight: 900, color }}>{r.count}</span>
                                <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 3 }}>dem.</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* ── Por Squad ── */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Leticia', color: C.purpleVbr, rank: g1rank, max: maxG1 },
                        { label: 'Davila',  color: C.pink,      rank: g2rank, max: maxG2 },
                      ].map(sq => (
                        <div key={sq.label} style={{ flex: 1, minWidth: isMobile ? '100%' : 260 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: sq.color, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, padding: '8px 14px', background: sq.color + '18', border: `1px solid ${sq.color}44`, borderRadius: 10 }}>
                            {sq.label}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {sq.rank.map(([client, count], i) => {
                              const color = clientColor(client)
                              return (
                                <div key={client} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, width: 18, flexShrink: 0 }}>{i + 1}</div>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.textMain }}>{client}</div>
                                  <div style={{ width: 80, flexShrink: 0 }}>
                                    <div style={{ height: 4, background: C.bgCardDp, borderRadius: 99, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.round((count / sq.max) * 100)}%`, background: sq.color, borderRadius: 99, transition: 'width .5s' }} />
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 48 }}>
                                    <span style={{ fontSize: 16, fontWeight: 900, color: sq.color }}>{count}</span>
                                    <span style={{ fontSize: 9, color: C.textMuted, marginLeft: 2 }}>dem.</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>)}
                </div>
              )
            })()}

            {/* ── ABA: Heatmap Anual ── */}
            {histView === 'heatmap' && (() => {
              // Apenas semanas do mês atual em diante — começa do mês atual
              const now = new Date()
              const startMonth = `${now.getFullYear()}-${String(now.getMonth() - 11).padStart(2,'0')}` // 12 meses atrás
              const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
              const wkCutoff = getWeekKey(oneYearAgo)

              const allWkKeys = []
              const cursor = new Date(wkCutoff + 'T12:00:00')
              while (cursor <= now) {
                allWkKeys.push(getWeekKey(new Date(cursor)))
                cursor.setDate(cursor.getDate() + 7)
              }

              const wkPT = wk => designers.reduce((s, d) => s + calcTotal(allWeeks[wk]?.[d.name]?.demands || []), 0)
              const maxPT = Math.max(...allWkKeys.map(wkPT), 1)

              const getColor = (val) => {
                if (val === 0) return C.bgCardDp
                const pct = val / maxPT
                if (pct < 0.25) return C.isDark ? '#3b1060' : '#e9d5ff'
                if (pct < 0.5)  return C.isDark ? '#6b21a8' : '#c084fc'
                if (pct < 0.75) return '#8b2fe8'
                return C.purpleVbr
              }

              // Agrupa semanas por mês
              const byMonth = {}
              allWkKeys.forEach(wk => {
                const m = wk.slice(0, 7)
                if (!byMonth[m]) byMonth[m] = []
                byMonth[m].push(wk)
              })

              const totalPTano = allWkKeys.reduce((s, wk) => s + wkPT(wk), 0)
              const semanasAtivas = allWkKeys.filter(wk => designers.some(d => (allWeeks[wk]?.[d.name]?.demands||[]).length > 0)).length
              const bestWk = allWkKeys.reduce((b, wk) => { const v = wkPT(wk); return v > b.v ? {v, wk} : b }, {v:0, wk:''})

              return (
                <div>
                  {/* Resumo anual */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Total do período', val: totalPTano.toFixed(0) + ' PT', color: C.purpleVbr },
                      { label: 'Semanas ativas', val: semanasAtivas + ' sem.', color: C.pink },
                      { label: 'Melhor semana', val: bestWk.v > 0 ? bestWk.v.toFixed(0) + ' PT' : '—', color: C.green },
                    ].map(s => (
                      <div key={s.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 22px', textAlign: 'center', flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
                        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 5, fontWeight: 600 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Legenda */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                    <span style={{ fontSize: 10, color: C.textMuted }}>Menos PT</span>
                    {[C.bgCardDp, C.isDark ? '#3b1060' : '#e9d5ff', C.isDark ? '#6b21a8' : '#c084fc', '#8b2fe8', C.purpleVbr].map((bg, i) => (
                      <div key={i} style={{ width: 16, height: 16, borderRadius: 4, background: bg, border: `1px solid ${C.border}` }} />
                    ))}
                    <span style={{ fontSize: 10, color: C.textMuted }}>Mais PT</span>
                  </div>

                  {/* Grid por mês — cada mês em linha separada */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(byMonth).map(([month, wks]) => {
                      const monthLabel = new Date(month + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                      const monthTotal = wks.reduce((s, wk) => s + wkPT(wk), 0)
                      return (
                        <div key={month} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {/* Label mês */}
                          <div style={{ width: isMobile ? 60 : 110, fontSize: 11, fontWeight: 600, color: C.textSub, textAlign: 'right', flexShrink: 0, textTransform: 'capitalize' }}>
                            {isMobile ? new Date(month+'-15').toLocaleDateString('pt-BR',{month:'short'}) : monthLabel}
                          </div>
                          {/* Quadradinhos */}
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                            {wks.map(wk => {
                              const val = wkPT(wk)
                              const isCurrent = wk === getWeekKey()
                              const d = new Date(wk + 'T12:00:00')
                              return (
                                <div key={wk}
                                  title={`${d.getDate()}/${d.getMonth()+1} · ${val.toFixed(0)} PT`}
                                  onClick={() => { setHistView('semana'); setHistMonth(wk.slice(0,7)); setHistWeek(wk) }}
                                  onMouseEnter={e => e.target.style.transform='scale(1.3)'}
                                  onMouseLeave={e => e.target.style.transform='scale(1)'}
                                  style={{
                                    width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, borderRadius: 5,
                                    background: getColor(val),
                                    border: isCurrent ? `2px solid ${C.purpleVbr}` : `1px solid ${C.border}33`,
                                    cursor: 'pointer', transition: 'transform .1s', flexShrink: 0,
                                  }} />
                              )
                            })}
                          </div>
                          {/* Total do mês */}
                          <div style={{ fontSize: 11, fontWeight: 700, color: monthTotal > 0 ? C.textSub : C.textMuted, flexShrink: 0 }}>
                            {monthTotal > 0 ? monthTotal.toFixed(0) + ' PT' : '—'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {histView !== 'grupos' && histView !== 'demandas' && histView !== 'heatmap' && histView !== 'clientes' && (<>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {last12months.map(m => (
                <button key={m} onClick={() => { setHistMonth(m); setHistWeek(getWeeksInMonth(m)[0] || currentWeekKey) }}
                  style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: `1px solid ${m === histMonth ? C.purple : C.border}`, cursor: 'pointer', background: m === histMonth ? C.purpleNav : 'transparent', color: m === histMonth ? C.purpleVbr : C.textSub, transition: 'all .15s' }}>
                  {getMonthLabel(m)}
                </button>
              ))}
            </div>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.textSub }}>{getMonthLabel(histMonth)}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.pink }}>{monthlyTotal.toFixed(1)} PT</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>{weeksInMonth.length} semana{weeksInMonth.length > 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              {weeksInMonth.map(wk => {
                const wTotal = designers.reduce((s, d) => s + calcTotal(getHistDemands(d.name, wk)), 0)
                const isSel  = wk === histWeek
                return (
                  <button key={wk} onClick={() => setHistWeek(wk)}
                    style={{ background: isSel ? C.bgCard : C.bgCardDp, border: `1px solid ${isSel ? C.purple : C.border}`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer', textAlign: 'left', minWidth: 150, transition: 'all .15s' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isSel ? C.purpleVbr : C.textSub, marginBottom: 4 }}>{getWeekLabel(wk)}{wk === currentWeekKey ? ' · atual' : ''}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: wTotal > 0 ? C.pink : C.textMuted }}>{wTotal.toFixed(1)} PT</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{designers.filter(d => getHistDemands(d.name, wk).length > 0).length}/{designers.length} designers</div>
                  </button>
                )
              })}
            </div>
            <div style={ST.section}>
              <div style={{ ...ST.secTitle, display: 'flex', justifyContent: 'space-between' }}>
                <span>{getWeekLabel(histWeek)}</span>
                <span style={{ color: C.pink, fontSize: 13, fontWeight: 800 }}>{designers.reduce((s, d) => s + calcTotal(getHistDemands(d.name)), 0).toFixed(1)} PT</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {designers.map((d, i) => {
                  const dem = getHistDemands(d.name)
                  if (!dem.length) return null
                  return (
                    <div key={d.name} style={{ background: C.bgCardDp, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={avatarStyle(i)}>{initials(d.name)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.textMain }}>{d.name}</div>
                          <div style={{ fontSize: 12, color: C.textSub }}>{dem.length} demanda(s)</div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: C.pink }}>{calcTotal(dem).toFixed(1)} PT</div>
                      </div>
                      <DemandList demands={dem} theme={C} />
                    </div>
                  )
                })}
                {designers.every(d => !getHistDemands(d.name).length) && <EmptyWeek C={C} />}
              </div>
            </div>
            </>)}
          </div>
        )}

        {/* ════ TABELA ════ */}
        {page === 'tabela' && (
          <div className="fade-in">
            <div style={ST.phdr}>
              <div><h1 style={ST.ptitle}>Tabela de Pontos</h1><p style={ST.psub}>Referência por tarefa e dificuldade</p></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
              {TASK_TABLE.map(cat => (
                <div key={cat.category} style={{ ...ST.section, borderColor: cat.color + '44' }}>
                  <div style={{ ...ST.secTitle, color: cat.color, marginBottom: 14 }}>{cat.category}</div>
                  {cat.tasks.map(task => (
                    <div key={task.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.border}44` }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: task.isUrgent ? C.amber : C.textSub }}>
                        {task.isUrgent ? '⚡ ' : ''}{task.label}
                      </span>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {Object.entries(task.points).map(([diff, pts]) => {
                          const dc = diff === 'Simples' ? '#22c55e' : diff === 'Médio' ? '#f59e0b' : diff === 'Avançado' ? '#ef4444' : C.purpleVbr
                          return (
                            <span key={diff} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: dc + '22', color: task.isUrgent ? C.amber : dc }}>
                              {pts === 0 ? 'Alt.' : `${pts} PT`}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ CARGA ════ */}
        {page === 'carga' && (() => {
          const cargaDesigner = activeD || desNames[0]
          const setCargaDesigner = name => { setActiveD(name); localStorage.setItem('n2-activeD', name) }
          const teto = tetos[cargaDesigner] ?? 20
          const setTetoVal = async (val) => {
            const v = Math.max(1, parseInt(val) || 1)
            setTetos(prev => ({ ...prev, [cargaDesigner]: v }))
            try { await dbSaveTeto(cargaDesigner, v) } catch (e) { showToast('⚠ ' + e.message) }
          }

          const allMonths = [...new Set(
            Object.keys(allWeeks)
              .filter(wk => (allWeeks[wk]?.[cargaDesigner]?.demands || []).length > 0)
              .map(wk => wk.slice(0, 7))
          )].sort().reverse()

          const selectedMonth = (histMonth && allMonths.includes(histMonth)) ? histMonth : (allMonths[0] || '')

          const weeks = Object.keys(allWeeks)
            .filter(wk => {
              const hasData = (allWeeks[wk]?.[cargaDesigner]?.demands || []).length > 0
              const inMonth = selectedMonth ? wk.startsWith(selectedMonth) : true
              return hasData && inMonth
            })
            .sort()

          const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
          const demandQty = d => (d.splits || []).reduce((s, sp) => s + (parseInt(sp.qty) || 0), 0)
          const getWeekDays = (wk) => {
            const demands = allWeeks[wk]?.[cargaDesigner]?.demands || []
            const days = [0, 0, 0, 0, 0]
            demands.filter(d => d.date).forEach(d => {
              const dow = new Date(d.date + 'T12:00:00').getDay()
              days[dow >= 1 && dow <= 5 ? dow - 1 : 0] += demandQty(d)
            })
            demands.filter(d => !d.date).forEach((d, i) => { days[i % 5] += demandQty(d) })
            return days
          }
          const maxDemands = Math.max(...(weeks.length ? weeks.flatMap(wk => getWeekDays(wk)) : [0]), teto, 1)

          return (
            <div className="fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
                <div>
                  <h1 style={ST.ptitle}>Carga de Trabalho</h1>
                  <p style={ST.psub}>Telas por dia · {selectedMonth ? getMonthLabel(selectedMonth) : 'todos os meses'}</p>
                </div>
              </div>

              {/* Filtro designer */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {designers.map((d, i) => {
                  const act = cargaDesigner === d.name
                  return (
                    <button key={d.name} style={ST.dTab(act)} onClick={() => setCargaDesigner(d.name)}>
                      <div style={{ ...avatarStyle(i), width: 20, height: 20, borderRadius: 5, fontSize: 8, border: '1.5px solid' }}>{initials(d.name)}</div>
                      {d.name.split(' ')[0]}
                    </button>
                  )
                })}
              </div>

              {/* Filtro mês + teto */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                  {allMonths.map(m => (
                    <button key={m} style={{ ...ST.dTab(m === selectedMonth), borderRadius: 20, padding: '5px 14px', fontSize: 11 }}
                      onClick={() => setHistMonth(m)}>
                      {getMonthLabel(m)}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 14px', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textSub }}>Teto/dia:</span>
                  <div style={{ display: 'flex', alignItems: 'center', background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden' }}>
                    <button onClick={() => setTetoVal(teto - 1)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, padding: '3px 9px', lineHeight: 1 }}>−</button>
                    <span style={{ minWidth: 28, textAlign: 'center', color: C.purpleVbr, fontWeight: 800, fontSize: 14, padding: '3px 0' }}>{teto}</span>
                    <button onClick={() => setTetoVal(teto + 1)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, padding: '3px 9px', lineHeight: 1 }}>+</button>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMuted }}>telas</span>
                </div>
              </div>

              {weeks.length === 0 ? (
                <div style={{ ...ST.section, textAlign: 'center', padding: '52px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                  <div style={{ fontSize: 14, color: C.textSub, fontWeight: 600 }}>Nenhuma demanda neste mês</div>
                </div>
              ) : (
                <div style={{ ...ST.section, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: isMobile ? '4px' : '8px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 80, textAlign: 'left', fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: 1.5, paddingBottom: 8 }}>SEMANA</th>
                        {DAYS.map(d => (
                          <th key={d} style={{ textAlign: 'center', fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: 1.5, paddingBottom: 8 }}>{d}</th>
                        ))}
                        <th style={{ textAlign: 'center', fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: 1.5, paddingBottom: 8 }}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map(wk => {
                        const days = getWeekDays(wk)
                        const total = days.reduce((a, b) => a + b, 0)
                        const d = new Date(wk + 'T12:00:00')
                        const weekLabel = `${d.getDate()}/${d.getMonth() + 1}`
                        const weekOver = total > teto * 5
                        return (
                          <tr key={wk}>
                            <td style={{ fontSize: 11, fontWeight: 600, color: C.textSub, paddingRight: 4, whiteSpace: 'nowrap' }}>{weekLabel}</td>
                            {days.map((qty, di) => {
                              const over = qty > teto
                              const pct  = Math.min(qty / maxDemands, 1)
                              const size = Math.max(isMobile ? 24 : 32, Math.round((isMobile ? 24 : 32) + pct * (isMobile ? 20 : 28)))
                              const bg = over
                                ? 'radial-gradient(circle, #f87171, #dc2626)'
                                : qty > 0 ? `radial-gradient(circle, ${C.purpleVbr}, ${C.purple})` : 'transparent'
                              return (
                                <td key={di} style={{ textAlign: 'center', padding: '3px 2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: isMobile ? 42 : 56 }}>
                                    <div title={`${qty} tela${qty !== 1 ? 's' : ''}${over ? ' ⚠ acima do teto' : ''}`} style={{
                                      width: size, height: size, borderRadius: '50%', background: bg,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: qty > 0 ? Math.max(9, Math.round(size * 0.32)) : 0,
                                      fontWeight: 800, color: '#fff',
                                      boxShadow: over ? '0 0 12px #f8717155' : qty > 0 ? `0 0 8px ${C.purple}44` : 'none',
                                      border: over ? '2px solid #f8717166' : qty > 0 ? `2px solid ${C.purpleVbr}44` : `1px solid ${C.borderSub}`,
                                      opacity: qty === 0 ? 0.2 : 1, transition: 'all .2s',
                                    }}>
                                      {qty > 0 ? qty : ''}
                                    </div>
                                  </div>
                                </td>
                              )
                            })}
                            <td style={{ textAlign: 'center', padding: '3px 8px' }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: weekOver ? '#f87171' : C.textSub }}>{total}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 16, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: `linear-gradient(135deg, ${C.purpleVbr}, ${C.purple})` }} />
                      <span style={{ fontSize: 11, color: C.textMuted }}>Dentro do teto ({teto} telas/dia)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'linear-gradient(135deg, #f87171, #dc2626)' }} />
                      <span style={{ fontSize: 11, color: C.textMuted }}>Acima do teto</span>
                    </div>
                    <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>Teto semanal: {teto * 5} telas</span>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ════ IDEIAS ════ */}
        {page === 'ideias' && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <h1 style={ST.ptitle}>Ideias</h1>
                <p style={ST.psub}>Sugestões do time · {ideias.length} ideia{ideias.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Formulário nova ideia */}
            <div style={{ ...ST.section, marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 14 }}>Nova Ideia</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input value={newIdeia.titulo} placeholder="Título da ideia..."
                    onChange={e => setNewIdeia(p => ({ ...p, titulo: e.target.value }))}
                    style={{ ...ST.inp, flex: 2, minWidth: 200, fontSize: 14, fontWeight: 600 }} />
                  <select value={newIdeia.autor} onChange={e => setNewIdeia(p => ({ ...p, autor: e.target.value }))}
                    style={{ ...ST.sel, flex: 1, minWidth: 140, fontSize: 13 }}>
                    <option value="">Quem sou eu...</option>
                    {desNames.map(n => <option key={n} value={n}>{n.split(' ')[0]}</option>)}
                  </select>
                </div>
                <textarea value={newIdeia.descricao} placeholder="Descreva a ideia com mais detalhes..."
                  onChange={e => setNewIdeia(p => ({ ...p, descricao: e.target.value }))}
                  rows={2} style={{ ...ST.inp, resize: 'vertical', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={async () => {
                    if (!newIdeia.titulo.trim() || !newIdeia.autor) return
                    const nova = { titulo: newIdeia.titulo.trim(), descricao: newIdeia.descricao.trim(), autor: newIdeia.autor }
                    try {
                      await saveIdeia(nova)
                      const updated = await loadIdeias()
                      setIdeias(updated)
                      setNewIdeia({ titulo: '', descricao: '', autor: newIdeia.autor })
                    } catch (e) { showToast('⚠ ' + e.message) }
                  }} style={{ ...ST.btnGold, opacity: (!newIdeia.titulo.trim() || !newIdeia.autor) ? 0.4 : 1 }}>
                    Enviar ideia
                  </button>
                </div>
              </div>
            </div>

            {/* Kanban */}
            {(() => {
              const COLS = [
                { id: 'nova',       label: 'A fazer',    color: C.purpleVbr, bg: C.purpleNav },
                { id: 'em_analise', label: 'Em análise', color: C.amber,     bg: C.amber + '18' },
                { id: 'feita',      label: 'Feito',      color: '#4ade80',   bg: '#4ade8018' },
              ]

              const moveIdeia = async (id, status) => {
                setIdeias(prev => prev.map(i => i.id === id ? { ...i, status } : i))
                try { await updateIdeiaStatus(id, status) }
                catch (e) { showToast('⚠ ' + e.message) }
              }

              const IdeiaCard = ({ idea }) => {
                const dIdx = desNames.indexOf(idea.autor)
                const date = new Date(idea.created_at)
                const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                const status = idea.status || 'nova'
                const colIdx = COLS.findIndex(c => c.id === status)
                const col = COLS[colIdx] || COLS[0]

                return (
                  <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: col.color, borderRadius: '12px 0 0 12px' }} />
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ ...avatarStyle(dIdx >= 0 ? dIdx : 0), width: 32, height: 32, borderRadius: 8, fontSize: 11, flexShrink: 0 }}>
                        {initials(idea.autor)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.textMain, marginBottom: 3 }}>{idea.titulo}</div>
                        {idea.descricao && <p style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5, margin: '0 0 8px' }}>{idea.descricao}</p>}
                        <div style={{ fontSize: 10, color: C.textMuted }}>{idea.autor.split(' ')[0]} · {dateStr}</div>
                        {/* Botões mover */}
                        <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                          {COLS.map((c, ci) => (
                            <button key={c.id} onClick={() => moveIdeia(idea.id, c.id)}
                              style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: `1px solid ${c.id === status ? c.color : C.border}`, background: c.id === status ? c.bg : 'transparent', color: c.id === status ? c.color : C.textMuted, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button onClick={async () => {
                        try { await dbDeleteIdeia(idea.id); setIdeias(ideias.filter(i => i.id !== idea.id)) }
                        catch (e) { showToast('⚠ ' + e.message) }
                      }} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13, flexShrink: 0, opacity: 0.4, padding: '0 2px' }}>✕</button>
                    </div>
                  </div>
                )
              }

              if (ideias.length === 0) return (
                <div style={{ ...ST.section, textAlign: 'center', padding: '52px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>💡</div>
                  <div style={{ fontSize: 14, color: C.textSub, fontWeight: 600 }}>Nenhuma ideia ainda</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Seja o primeiro a sugerir algo!</div>
                </div>
              )

              return (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
                  {COLS.map(col => {
                    const colIdeias = ideias.filter(i => (i.status || 'nova') === col.id)
                    return (
                      <div key={col.id}>
                        {/* Header coluna */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', background: col.bg, border: `1px solid ${col.color}44`, borderRadius: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: col.color, flex: 1 }}>{col.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: col.color, background: col.color + '22', padding: '1px 8px', borderRadius: 20 }}>{colIdeias.length}</span>
                        </div>
                        {/* Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {colIdeias.map(idea => <IdeiaCard key={idea.id} idea={idea} />)}
                          {colIdeias.length === 0 && (
                            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: '24px 0', textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
                              Sem ideias aqui
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

      </main>

      {/* ════ ONBOARDING — Como usar ════ */}
      {page === 'onboarding' && (() => {
        const SLIDES = [
          {
            id: 'intro',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
            tag: 'Bem-vindo',
            title: 'O que é o Núcleo2?',
            subtitle: 'Seu app de gestão de demandas do time de design',
            body: 'O Núcleo2 é uma plataforma interna criada para o time de design registrar, acompanhar e visualizar suas demandas semanais. Com ele, cada designer lança o que produziu na semana, ganha pontos por tarefa, e o time tem uma visão clara de produtividade — sem planilhas, sem confusão.',
            highlights: [
              { icon: '📊', text: 'Métricas reais do time em tempo real' },
              { icon: '⚡', text: 'Lançamento rápido de demandas com pontuação automática' },
              { icon: '📅', text: 'Histórico completo semana a semana' },
              { icon: '🎯', text: 'Meta semanal de 500 PT por designer' },
            ],
          },
          {
            id: 'lancamento',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
            tag: 'Lançar Demandas',
            title: 'Como registrar suas demandas',
            subtitle: 'Simples, rápido e sem complicação',
            body: 'Toda semana, cada designer acessa "Lançar Demandas" e registra o que produziu. Basta preencher o nome da demanda, o tipo de tarefa, o cliente e a quantidade.',
            steps: [
              { n: '1', title: 'Escolha seu nome', desc: 'Selecione seu perfil na barra lateral ou no seletor mobile.' },
              { n: '2', title: 'Adicione uma demanda', desc: 'Clique em "+ Adicionar demanda" e preencha o nome, tipo e cliente.' },
              { n: '3', title: 'Defina a dificuldade', desc: 'Escolha Simples, Médio, Avançado ou Alteração. A pontuação é calculada automaticamente.' },
              { n: '4', title: 'Salve', desc: 'Os dados são salvos automaticamente na nuvem assim que você termina de digitar.' },
            ],
            important: {
              title: '⚠️ Importante — Demandas recorrentes (cliente: Scrum)',
              body: 'Algumas demandas fazem parte do fluxo padrão e devem ser registradas regularmente. Para esses casos, utilize o cliente "Scrum". Exemplos:',
              items: ['Reuniões e Workshops', 'Urgências não previstas (100 pts — aqui se encaixam as ALTERAÇÕES acumuladas da semana)', 'Criação de Sprint, Daily, Weekly, entre outros'],
            },
            tip: '💡 Dica: use "↩ Copiar semana anterior" para reutilizar demandas recorrentes e economizar tempo.',
          },
          {
            id: 'pontuacao',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
            tag: 'Pontuação',
            title: 'Como funciona a pontuação',
            subtitle: 'Cada tarefa tem um valor em PT baseado na complexidade',
            body: 'O sistema de pontos reflete o esforço real de cada entrega. Tarefas mais complexas valem mais pontos. A meta é 500 PT por semana.',
            table: [
              { cat: 'Social Mídia', color: '#8b5cf6', items: [
                { label: 'Telas', simples: '2.5', medio: '7.5', avancado: '10' },
                { label: 'LP', simples: '15', medio: '20', avancado: '25' },
                { label: 'Post Animado', simples: '20', medio: '25', avancado: '50' },
                { label: 'Reels / YouTube', simples: '20', medio: '40', avancado: '100' },
              ]},
              { cat: 'CRM & Performance', color: '#06b6d4', items: [
                { label: 'Email Marketing', simples: '15', medio: '20', avancado: '25' },
                { label: 'KV', simples: '40', medio: '80', avancado: '120' },
              ]},
              { cat: 'Especiais', color: '#a78bfa', items: [
                { label: 'Reunião 1:1 / Daily / Weekly', simples: '5 PT', medio: '—', avancado: '—' },
                { label: 'Workshop / Reuniões', simples: '5 PT', medio: '—', avancado: '—' },
                { label: 'Aprovação de Artes', simples: '5 PT', medio: '—', avancado: '—' },
                { label: 'Criação do Sprint', simples: '3 PT', medio: '—', avancado: '—' },
                { label: 'Urgência Não Prevista', simples: '100 PT', medio: '—', avancado: '—' },
              ]},
            ],
            tip: '💡 Alteração: pode ser adicionada como dificuldade em qualquer tarefa, valendo 0 PT. Já a Urgência Não Prevista (100 PT) funciona como o peso acumulado de todas as alterações da semana — use-a quando o volume de ajustes foi significativo.',
          },
          {
            id: 'dashboard',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
            tag: 'Dashboard',
            title: 'Visão geral da semana',
            subtitle: 'Tudo que o time produziu em um só lugar',
            body: 'O Dashboard é a página inicial do Núcleo2. Ele mostra em tempo real o desempenho do time na semana atual.',
            features: [
              { icon: '📈', title: 'Stat cards', desc: 'Total de PT do time, média por designer, itens lançados e top cliente da semana.' },
              { icon: '🏆', title: 'Ranking semanal', desc: 'Designers ordenados por pontuação, com comparativo vs semana anterior (▲▼).' },
              { icon: '👥', title: 'Leticia vs Davila', desc: 'Barra de progresso comparando os dois grupos em direção à meta coletiva.' },
              { icon: '⚠️', title: 'Quem não preencheu', desc: 'Banner mostrando quais designers ainda não lançaram demandas — clicável para ir direto ao lançamento deles.' },
              { icon: '📊', title: 'Por categoria', desc: 'Gráfico de barras mostrando a distribuição de PT entre Social Mídia, CRM e Especiais.' },
              { icon: '🌙', title: 'Modo claro e escuro', desc: 'O app tem dois temas. Alterne pelo botão de toggle no canto superior esquerdo da sidebar. Sua preferência é salva automaticamente.' },
            ],
          },
          {
            id: 'apresentacao',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad8" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
            tag: 'Modo Apresentação',
            title: 'Apresentação semanal para o time',
            subtitle: 'Visão em tela cheia para reuniões de weekly',
            body: 'O Modo Apresentação foi criado para ser exibido durante as reuniões de weekly. Ele mostra os resultados da semana de forma clara e visual para todo o time.',
            features: [
              { icon: '👥', title: 'Visão Geral', desc: 'Todos os designers lado a lado, separados por grupo (Leticia e Davila), ordenados por PT. O 1º de cada grupo recebe a 👑.' },
              { icon: '👤', title: 'Por Designer', desc: 'Clique em qualquer designer para ver um detalhamento completo: PT, progresso da meta, clientes atendidos e todas as demandas agrupadas por cliente.' },
              { icon: '📊', title: 'Comparativo', desc: 'Gráfico de barras comparando esta semana com a anterior, destacando quem mais evoluiu (🚀) e quem caiu (📉).' },
              { icon: '🔢', title: 'Alterações', desc: 'As alterações aparecem em destaque separado, com a contagem total de itens alterados por designer.' },
            ],
            tip: '💡 Use as setas ‹ › para navegar entre designers durante a apresentação. Pressione ESC para sair.',
          },
          {
            id: 'historico',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad5" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
            tag: 'Histórico & Relatório',
            title: 'Acesse qualquer semana passada',
            subtitle: 'Dados completos dos últimos 12 meses',
            body: 'O Histórico e o Relatório permitem navegar por qualquer semana ou mês dos últimos 12 meses, ver os dados por designer e exportar.',
            features: [
              { icon: '📅', title: 'Por Semana', desc: 'Navegue mês a mês e semana a semana para ver exatamente o que cada designer lançou.' },
              { icon: '📉', title: 'Leticia vs Davila', desc: 'Gráfico de linha mostrando a evolução de PT dos dois grupos ao longo das semanas.' },
              { icon: '👥', title: 'Demandas por Time', desc: 'Comparativo de itens produzidos por cada grupo, com filtro por mês.' },
              { icon: '🔥', title: 'Heatmap anual', desc: 'Grade visual estilo GitHub — cada quadrado é uma semana, colorido pela intensidade de PT. Clique para ir direto àquela semana.' },
              { icon: '📄', title: 'Exportar PDF', desc: 'Gere um relatório completo em PDF com ranking, tabela por designer e detalhamento de demandas.' },
            ],
          },
          {
            id: 'carga',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad6" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
            tag: 'Carga de Trabalho',
            title: 'Acompanhe sua carga dia a dia',
            subtitle: 'Veja quando você trabalhou mais e se ultrapassou seu teto',
            body: 'A página de Carga mostra um calendário com a distribuição de itens por dia da semana, ajudando a identificar semanas sobrecarregadas.',
            features: [
              { icon: '🟣', title: 'Bolha roxa', desc: 'Quantidade de itens dentro do teto configurado. Quanto maior a bolha, mais itens naquele dia.' },
              { icon: '🔴', title: 'Bolha vermelha', desc: 'Dia acima do teto — sinal de sobrecarga.' },
              { icon: '⚙️', title: 'Teto configurável', desc: 'Cada designer pode definir seu próprio limite de itens por dia. O teto fica salvo no sistema.' },
              { icon: '📅', title: 'Filtro por mês', desc: 'Navegue entre os meses para ver a evolução da carga ao longo do tempo.' },
            ],
            tip: '💡 A precisão melhora com o tempo: o sistema usa a data de criação de cada demanda para saber em qual dia ela foi lançada.',
          },
          {
            id: 'ideias',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad7" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><line x1="12" y1="2" x2="12" y2="6"/><path d="M12 18a6 6 0 100-12 6 6 0 000 12z"/><line x1="12" y1="18" x2="12" y2="22"/></svg>,
            tag: 'Ideias',
            title: 'Quadro de ideias do time',
            subtitle: 'Kanban colaborativo para sugestões e melhorias',
            body: 'Qualquer designer pode sugerir uma ideia para o time ou para o app. As ideias ficam visíveis para todos, evitando duplicações.',
            features: [
              { icon: '📝', title: 'A fazer', desc: 'Ideias novas que ainda não foram avaliadas.' },
              { icon: '🔍', title: 'Em análise', desc: 'Ideias sendo estudadas ou em andamento.' },
              { icon: '✅', title: 'Feito', desc: 'Ideias já implementadas ou concluídas.' },
            ],
            tip: '💡 Mova as ideias entre colunas clicando nos botões de status em cada card. Tudo fica salvo automaticamente.',
          },
          {
            id: 'perfil',
            icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="grad9" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b2fe8"/><stop offset="100%" stopColor="#e8196a"/></linearGradient></defs><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
            tag: 'Perfil do Designer',
            title: 'Seu histórico pessoal',
            subtitle: 'Clique no seu nome na barra lateral para acessar',
            body: 'Cada designer tem um perfil próprio com histórico completo, métricas pessoais e configurações.',
            features: [
              { icon: '👁', title: 'Ver demandas', desc: 'Veja todas as demandas lançadas na semana atual.' },
              { icon: '📈', title: 'Histórico', desc: 'Gráfico de barras com as últimas semanas, sua melhor semana e metas batidas.' },
              { icon: '📅', title: 'Carga pessoal', desc: 'Calendário de carga do dia a dia exclusivo do seu perfil.' },
              { icon: '✏️', title: 'Editar', desc: 'Ajuste as configurações do seu perfil.' },
            ],
            tip: '💡 Acesse seu perfil clicando no seu nome na barra lateral esquerda.',
          },
        ]

        const slide = SLIDES[onboardSlide]
        const isFirst = onboardSlide === 0
        const isLast  = onboardSlide === SLIDES.length - 1
        const progress = ((onboardSlide + 1) / SLIDES.length) * 100

        return (
          <div style={{ position: 'fixed', inset: 0, background: C.isDark ? '#07040f' : '#f8f4ff', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Progress bar */}
            <div style={{ height: 3, background: C.border, flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, #8b2fe8, #e8196a)`, transition: 'width .4s ease', borderRadius: '0 99px 99px 0' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.textMain }}>Núcleo<span style={{ color: C.pink }}>2</span></div>
              <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>{onboardSlide + 1} / {SLIDES.length}</div>
              <button onClick={() => { setPage('dashboard'); setOnboardSlide(0) }} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600 }}>
                ESC · Sair do guia
              </button>
            </div>

            {/* Slide content */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? '24px 20px' : '40px 60px' }}>
              <div style={{ width: '100%', maxWidth: 780 }} className="fade-in">

                {/* Tag + Icon */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                  {slide.icon}
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleVbr, background: C.purpleNav, padding: '4px 14px', borderRadius: 20, letterSpacing: 1.5, textTransform: 'uppercase' }}>{slide.tag}</span>
                </div>

                {/* Title */}
                <h1 style={{ fontSize: isMobile ? 26 : 36, fontWeight: 900, color: C.textMain, lineHeight: 1.15, marginBottom: 10 }}>{slide.title}</h1>
                <p style={{ fontSize: 16, color: C.purpleVbr, fontWeight: 600, marginBottom: 24 }}>{slide.subtitle}</p>
                <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.8, marginBottom: 32 }}>{slide.body}</p>

                {/* Highlights (intro) */}
                {slide.highlights && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: 12, marginBottom: 24 }}>
                    {slide.highlights.map((h, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
                        <span style={{ fontSize: 22, flexShrink: 0 }}>{h.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.textSub }}>{h.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Steps (lancamento) */}
                {slide.steps && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                    {slide.steps.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, #8b2fe8, #e8196a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff', flexShrink: 0 }}>{s.n}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.textMain, marginBottom: 4 }}>{s.title}</div>
                          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Features (dashboard, historico, carga, etc) */}
                {slide.features && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: 12, marginBottom: 24 }}>
                    {slide.features.map((f, i) => (
                      <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: 20 }}>{f.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.textMain }}>{f.title}</span>
                        </div>
                        <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pontuação table */}
                {slide.table && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
                    {slide.table.map((cat, ci) => (
                      <div key={ci} style={{ background: C.bgCard, border: `1px solid ${cat.color}33`, borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', background: cat.color + '18', fontSize: 11, fontWeight: 700, color: cat.color, letterSpacing: 1.5, textTransform: 'uppercase' }}>{cat.cat}</div>
                        <div style={{ padding: '4px 0' }}>
                          {cat.items.map((item, ii) => (
                            <div key={ii} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: ii < cat.items.length - 1 ? `1px solid ${C.border}44` : 'none' }}>
                              <span style={{ fontSize: 13, color: C.textSub, fontWeight: 500 }}>{item.label}</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {[{ label: 'Simples', val: item.simples, c: '#22c55e' }, { label: 'Médio', val: item.medio, c: '#f59e0b' }, { label: 'Avançado', val: item.avancado, c: '#ef4444' }].map(d => d.val !== '—' && (
                                  <span key={d.label} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: d.c + '22', color: d.c }}>{d.val} PT</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tip */}
                {slide.tip && (
                  <div style={{ background: C.purpleNav, border: `1px solid ${C.purpleVbr}44`, borderRadius: 10, padding: '12px 18px', fontSize: 13, color: C.purpleVbr, fontWeight: 600 }}>
                    {slide.tip}
                  </div>
                )}

                {/* Important block */}
                {slide.important && (
                  <div style={{ background: C.isDark ? '#1a0f0a' : '#fff7ed', border: `1px solid ${C.amber}55`, borderRadius: 12, padding: '16px 20px', marginTop: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.amber, marginBottom: 10 }}>{slide.important.title}</div>
                    <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, marginBottom: 10 }}>{slide.important.body}</div>
                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                      {slide.important.items.map((item, i) => (
                        <li key={i} style={{ fontSize: 13, color: C.textSub, lineHeight: 1.8 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', borderTop: `1px solid ${C.border}`, flexShrink: 0, background: C.bgCard }}>
              <button onClick={() => setOnboardSlide(p => Math.max(0, p - 1))} disabled={isFirst}
                style={{ padding: '10px 24px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: isFirst ? C.textMuted : C.textSub, cursor: isFirst ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: isFirst ? 0.3 : 1 }}>
                ← Anterior
              </button>

              {/* Dots */}
              <div style={{ display: 'flex', gap: 6 }}>
                {SLIDES.map((_, i) => (
                  <div key={i} onClick={() => setOnboardSlide(i)}
                    style={{ width: i === onboardSlide ? 20 : 7, height: 7, borderRadius: 99, background: i === onboardSlide ? C.purpleVbr : C.border, cursor: 'pointer', transition: 'all .3s' }} />
                ))}
              </div>

              {isLast ? (
                <button onClick={() => { setPage('dashboard'); setOnboardSlide(0) }}
                  style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, #8b2fe8, #e8196a)`, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                  Começar a usar →
                </button>
              ) : (
                <button onClick={() => setOnboardSlide(p => Math.min(SLIDES.length - 1, p + 1))}
                  style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, #8b2fe8, #e8196a)`, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                  Próximo →
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* ════ SETTINGS MODAL ════ */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 520, maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.textMain }}>⚙ Configurações</div>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            {/* ── Núcleos ── */}
            <SLabel C={C}>Núcleos</SLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {nucleos.map(n => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bgCardDp, borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: n.cor, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.textMain }}>{n.nome}</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{designers.filter(d => d.nucleo_id === n.id).length} designers</span>
                  <button onClick={async () => {
                    if (!confirm(`Remover ${n.nome}?`)) return
                    try {
                      await dbDeleteNucleo(n.id)
                      setNucleos(nucleos.filter(x => x.id !== n.id))
                    } catch (e) { showToast('⚠ ' + e.message) }
                  }} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <input id="nucleo-nome-input" placeholder="Nome do núcleo" style={{ ...ST.inp, flex: 1, fontSize: 13 }} />
              <input id="nucleo-cor-input" type="color" defaultValue="#8b2fe8" style={{ width: 40, height: 38, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', background: C.bgInput, padding: 2 }} />
              <button onClick={async () => {
                const nome = document.getElementById('nucleo-nome-input').value.trim()
                const cor  = document.getElementById('nucleo-cor-input').value
                if (!nome) return
                if (nucleos.some(n => n.nome.toLowerCase() === nome.toLowerCase())) return showToast('⚠ Núcleo já existe')
                try {
                  await dbSaveNucleo(nome, cor)
                  const updated = await loadNucleos()
                  setNucleos(updated)
                  document.getElementById('nucleo-nome-input').value = ''
                } catch (e) { showToast('⚠ ' + e.message) }
              }} style={{ ...ST.btnAdd, fontSize: 12, padding: '8px 14px' }}>+ Adicionar</button>
            </div>

            <div style={{ height: 1, background: C.border, margin: '20px 0' }} />
            <SLabel C={C}>Designers</SLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {designers.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bgCardDp, borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ ...avatarStyle(i), width: 28, height: 28, borderRadius: 7, fontSize: 10, border: '1.5px solid' }}>{initials(d.name)}</div>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.textMain }}>{d.name}</span>
                  {/* Seletor de núcleo */}
                  {nucleos.length > 0 && (
                    <select value={d.nucleo_id || ''} onChange={async e => {
                      const nucleo_id = e.target.value || null
                      try {
                        await updateDesignerNucleo(d.name, nucleo_id)
                        setDesigners(prev => prev.map(x => x.name === d.name ? { ...x, nucleo_id } : x))
                      } catch (err) { showToast('⚠ ' + err.message) }
                    }} style={{ ...ST.sel, fontSize: 11, maxWidth: 90 }}>
                      <option value="">—</option>
                      {nucleos.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}
                    </select>
                  )}
                  <button onClick={() => toggleGroup(d.name)}
                    title={`Clique para mudar grupo`}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      background: d.group_id === 2 ? C.pink + '22' : d.group_id === 0 ? C.amber + '22' : C.purpleNav,
                      color:      d.group_id === 2 ? C.pink      : d.group_id === 0 ? C.amber      : C.purpleVbr,
                    }}>
                    {d.group_id === 1 ? 'Leticia' : d.group_id === 2 ? 'Davila' : 'Ambos'}
                  </button>
                  <button onClick={() => removeDesigner(d.name)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
            </div>
            <ARow value={newDesigner} onChange={setNewDesigner} onAdd={addDesigner} placeholder="Nome do designer" C={C} ST={ST} />
            <div style={{ height: 1, background: C.border, margin: '20px 0' }} />
            <SLabel C={C}>Clientes</SLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {clients.map(c => {
                const gc = c.group_id === 1 ? C.purpleVbr : c.group_id === 2 ? C.pink : C.textMuted
                const gl = c.group_id === 1 ? 'Leticia' : c.group_id === 2 ? 'Davila' : 'Ambos'
                return (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bgCardDp, borderRadius: 8, padding: '8px 12px' }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.textMain }}>{c.name}</span>
                    {/* Seletor de núcleo do cliente */}
                    {nucleos.length > 0 && (
                      <select value={c.nucleo_id || ''} onChange={async e => {
                        const nucleo_id = e.target.value || null
                        try {
                          await updateClientNucleo(c.name, nucleo_id)
                          setClients(prev => prev.map(x => x.name === c.name ? { ...x, nucleo_id } : x))
                        } catch (err) { showToast('⚠ ' + err.message) }
                      }} style={{ ...ST.sel, fontSize: 11, maxWidth: 90 }}>
                        <option value="">—</option>
                        {nucleos.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}
                      </select>
                    )}
                    <button onClick={() => toggleClientGroup(c.name)}
                      style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', background: gc + '22', color: gc }}>
                      {gl}
                    </button>
                    <button onClick={() => removeClientFn(c.name)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 13 }}>✕</button>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={newClient} onChange={e => setNewClient(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addClientFn() }} placeholder="Nome do cliente"
                style={{ ...ST.addInput, flex: 1, padding: '8px 12px', fontSize: 13 }} />
              <select value={newClientGroup} onChange={e => setNewClientGroup(Number(e.target.value))}
                style={{ ...ST.sel, fontSize: 12, flexShrink: 0 }}>
                <option value={0}>Ambos</option>
                <option value={1}>Leticia</option>
                <option value={2}>Davila</option>
              </select>
              <button onClick={addClientFn} style={{ ...ST.btnGold, padding: '8px 16px', fontSize: 12 }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SLabel({ children, C }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>{children}</div>
}
function ARow({ value, onChange, onAdd, placeholder, C, ST }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAdd() }} placeholder={placeholder}
        style={{ ...ST.addInput, flex: 1, padding: '8px 12px', fontSize: 13 }} />
      <button onClick={onAdd} style={{ ...ST.btnGold, padding: '8px 16px', fontSize: 12 }}>Adicionar</button>
    </div>
  )
}
function EmptyWeek({ C }) {
  return (
    <div style={{ textAlign: 'center', color: C.textMuted, padding: '40px 0' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Nenhum lançamento nesta semana.</div>
    </div>
  )
}
