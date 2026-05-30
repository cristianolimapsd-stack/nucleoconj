import { useState } from 'react'
import { avatarStyle, calcTotal, calcDemandPts, getTaskMeta, CAT_COLOR, topClient } from '../lib/tasks.js'
import { DARK, makeStyles } from '../lib/styles.js'
import DemandList from './DemandList.jsx'
import EntryPanel from './EntryPanel.jsx'

// ── Mini gráfico de barras para histórico ─────────────────
function HistoryChart({ designer, allWeeks, C }) {
  const ST = makeStyles(C)

  // pegar últimas 8 semanas com dados
  const weeks = Object.keys(allWeeks)
    .sort()
    .reverse()
    .slice(0, 12)
    .reverse()

  const bars = weeks.map(wk => {
    const demands = allWeeks[wk]?.[designer]?.demands || []
    const total   = demands.reduce((s, d) => {
      const meta = getTaskMeta(d.task)
      if (meta.isAlt) return s
      return s + (d.splits || []).reduce((a, sp) => {
        const pts = meta.fixed ? (sp.pts || 0) : ((parseFloat(sp.pts) || 0) * (parseFloat(sp.qty) || 1))
        return a + pts
      }, 0)
    }, 0)
    return { wk, total }
  }).filter(b => b.total > 0 || weeks.indexOf(b.wk) >= weeks.length - 4)

  if (bars.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 13 }}>
      Sem histórico ainda
    </div>
  )

  const maxVal = Math.max(...bars.map(b => b.total), 1)
  const GOAL   = 500

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 4px', marginBottom: 8 }}>
        {bars.map(({ wk, total }) => {
          const pct     = (total / maxVal) * 100
          const hitGoal = total >= GOAL
          const label   = (() => {
            const d = new Date(wk + 'T12:00:00')
            return `${d.getDate()}/${d.getMonth() + 1}`
          })()
          return (
            <div key={wk} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {total > 0 && (
                <div style={{ fontSize: 9, fontWeight: 800, color: hitGoal ? '#4ade80' : C.pink, letterSpacing: -0.3 }}>
                  {total.toFixed(0)}
                </div>
              )}
              <div style={{ width: '100%', height: 130, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{
                  width: '100%',
                  height: total > 0 ? `${pct}%` : 4,
                  borderRadius: '5px 5px 3px 3px',
                  background: hitGoal
                    ? 'linear-gradient(180deg,#4ade80,#16a34a)'
                    : total > 0
                      ? `linear-gradient(180deg,${C.purpleVbr},${C.purple})`
                      : C.bgCardDp,
                  transition: 'height .5s ease',
                  opacity: total > 0 ? 1 : 0.3,
                  boxShadow: hitGoal ? '0 0 8px #4ade8044' : 'none',
                }} />
              </div>
              <div style={{ fontSize: 8, color: C.textMuted, textAlign: 'center' }}>{label}</div>
            </div>
          )
        })}
      </div>

      {/* Linha de meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <div style={{ height: 1, flex: 1, borderTop: `1px dashed #4ade8033` }} />
        <span style={{ fontSize: 10, color: '#4ade8077', fontWeight: 700 }}>meta 500 PT</span>
        <div style={{ height: 1, flex: 1, borderTop: `1px dashed #4ade8033` }} />
      </div>

      {/* Resumo estatísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14 }}>
        {(() => {
          const totals  = bars.map(b => b.total).filter(t => t > 0)
          const avg     = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0
          const best    = Math.max(...totals, 0)
          const hits    = totals.filter(t => t >= GOAL).length
          return [
            { label: 'Melhor semana', val: best.toFixed(0) + ' PT', color: C.green },
            { label: 'Média',         val: avg.toFixed(0)  + ' PT', color: C.purpleLt },
            { label: 'Metas batidas', val: `${hits}×`,              color: '#4ade80' },
          ]
        })().map(s => (
          <div key={s.label} style={{ background: C.bgCardDp, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Calendário de Carga Semanal ───────────────────────────
function WorkloadCalendar({ designer, allWeeks, C }) {
  const ST = makeStyles(C)
  const [teto, setTeto] = useState(() => {
    const saved = localStorage.getItem(`n2-teto-${designer}`)
    return saved ? parseInt(saved) : 20
  })
  const saveTeto = (val) => {
    const v = Math.max(1, parseInt(val) || 1)
    setTeto(v)
    localStorage.setItem(`n2-teto-${designer}`, v)
  }

  const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']

  // Últimas 8 semanas com dados
  const weeks = Object.keys(allWeeks)
    .filter(wk => (allWeeks[wk]?.[designer]?.demands || []).length > 0)
    .sort().reverse().slice(0, 8).reverse()

  if (weeks.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 13 }}>
      Sem histórico para exibir
    </div>
  )

  // Para cada semana, distribui itens (qty) por dia usando o campo date de cada demanda
  const demandQty = d => (d.splits || []).reduce((s, sp) => s + (parseInt(sp.qty) || 0), 0)
  const getWeekDays = (wk) => {
    const demands = allWeeks[wk]?.[designer]?.demands || []
    const days = [0, 0, 0, 0, 0]

    const withDate = demands.filter(d => d.date)
    const noDate   = demands.filter(d => !d.date)

    withDate.forEach(d => {
      const dt  = new Date(d.date + 'T12:00:00')
      const dow = dt.getDay()
      const idx = dow >= 1 && dow <= 5 ? dow - 1 : 0
      days[idx] += demandQty(d)
    })

    noDate.forEach((d, i) => { days[i % 5] += demandQty(d) })
    return days
  }

  const maxVal = Math.max(teto * 1.5, 1)

  return (
    <div>
      {/* Controle de teto */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, background: C.bgCardDp, borderRadius: 10, padding: '10px 16px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textSub }}>Teto diário:</span>
        <div style={{ display: 'flex', alignItems: 'center', background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden' }}>
          <button onClick={() => saveTeto(teto - 1)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, padding: '4px 10px', lineHeight: 1 }}>−</button>
          <input type="number" min="1" value={teto} onChange={e => saveTeto(e.target.value)}
            style={{ width: 40, textAlign: 'center', background: 'transparent', border: 'none', color: C.purpleVbr, fontWeight: 800, fontSize: 14, fontFamily: 'inherit', outline: 'none', padding: '4px 0' }} />
          <button onClick={() => saveTeto(teto + 1)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, padding: '4px 10px', lineHeight: 1 }}>+</button>
        </div>
        <span style={{ fontSize: 11, color: C.textMuted }}>demandas/dia</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.purple, display: 'inline-block' }} /> Normal
          </span>
          <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f87171', display: 'inline-block' }} /> Acima do teto
          </span>
        </div>
      </div>

      {/* Grid semanas × dias */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px' }}>
          <thead>
            <tr>
              <th style={{ width: 90, textAlign: 'left', fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: 1.5, paddingBottom: 6 }}>SEMANA</th>
              {DAYS.map(d => (
                <th key={d} style={{ textAlign: 'center', fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: 1.5, paddingBottom: 6 }}>{d}</th>
              ))}
              <th style={{ textAlign: 'center', fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: 1.5, paddingBottom: 6 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(wk => {
              const days = getWeekDays(wk)
              const total = days.reduce((a, b) => a + b, 0)
              const d = new Date(wk + 'T12:00:00')
              const weekLabel = `${d.getDate()}/${d.getMonth() + 1}`
              return (
                <tr key={wk}>
                  <td style={{ fontSize: 11, fontWeight: 600, color: C.textSub, paddingRight: 8 }}>{weekLabel}</td>
                  {days.map((qty, di) => {
                    const over = qty > teto
                    const pct  = Math.min(qty / maxVal, 1)
                    const size = Math.max(28, Math.round(28 + pct * 28))
                    const bg   = over
                      ? `radial-gradient(circle, #f87171, #dc2626)`
                      : qty > 0
                        ? `radial-gradient(circle, ${C.purpleVbr}, ${C.purple})`
                        : C.bgCardDp
                    return (
                      <td key={di} style={{ textAlign: 'center', padding: '4px 2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52 }}>
                          <div title={`${qty} demanda${qty !== 1 ? 's' : ''} — ${over ? '⚠ acima do teto' : 'dentro do teto'}`} style={{
                            width: size, height: size, borderRadius: '50%',
                            background: bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: qty > 0 ? Math.max(9, size * 0.32) : 0,
                            fontWeight: 800, color: '#fff',
                            boxShadow: over ? '0 0 12px #f8717155' : qty > 0 ? `0 0 8px ${C.purple}44` : 'none',
                            transition: 'all .2s',
                            border: over ? '2px solid #f8717166' : qty > 0 ? `2px solid ${C.purpleVbr}44` : `1px solid ${C.borderSub}`,
                            opacity: qty === 0 ? 0.25 : 1,
                          }}>
                            {qty > 0 ? qty : ''}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: total > teto * 5 ? '#f87171' : C.textSub }}>{total}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda teto */}
      <div style={{ marginTop: 16, padding: '10px 14px', background: C.bgCardDp, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted }}>Teto semanal total:</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.purpleVbr }}>{teto * 5} demandas</span>
        <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 12 }}>({teto}/dia × 5 dias)</span>
      </div>
    </div>
  )
}

function ProfileTabs({ demands, clients, designer, dIdx, onChange, theme, allWeeks }) {
  const C  = theme || DARK
  const ST = makeStyles(C)
  const [tab, setTab] = useState('view')
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'view',     label: '👁 Ver Demandas' },
          { id: 'history',  label: '📈 Histórico'    },
          { id: 'workload', label: '📅 Carga'         },
          { id: 'edit',     label: '✏ Editar'        },
        ].map(t => (
          <button key={t.id} style={{ ...ST.dTab(tab === t.id), borderRadius: 8 }} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'view' && (
        <div style={{ ...makeStyles(C).section }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 12 }}>Demandas da Semana</div>
          <DemandList demands={demands} theme={C} />
        </div>
      )}
      {tab === 'history' && (
        <div style={{ ...makeStyles(C).section }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 16 }}>Evolução Semanal</div>
          <HistoryChart designer={designer} allWeeks={allWeeks || {}} C={C} />
          {(() => {
            const histWeeks = Object.keys(allWeeks || {})
              .filter(wk => (allWeeks[wk]?.[designer]?.demands || []).length > 0)
              .sort().reverse()
            if (histWeeks.length === 0) return null
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Por Semana</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {histWeeks.map(wk => {
                    const wkDemands = allWeeks[wk]?.[designer]?.demands || []
                    const pts = calcTotal(wkDemands)
                    const hit = pts >= 500
                    const d   = new Date(wk + 'T12:00:00')
                    const end = new Date(d); end.setDate(d.getDate() + 4)
                    const fmt = x => x.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                    const label = `${fmt(d)} – ${fmt(end)}`
                    return (
                      <div key={wk} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bgCardDp, borderRadius: 8, padding: '10px 14px' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.textSub }}>{label}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{wkDemands.length} demanda{wkDemands.length !== 1 ? 's' : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hit && <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.green + '18', padding: '2px 8px', borderRadius: 20 }}>🔥 meta</span>}
                          <div style={{ fontSize: 18, fontWeight: 800, color: hit ? C.green : C.pink }}>{pts.toFixed(0)}<span style={{ fontSize: 10, color: C.textMuted }}> PT</span></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}
      {tab === 'workload' && (
        <div style={{ ...makeStyles(C).section }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 16 }}>Carga de Trabalho Semanal</div>
          <WorkloadCalendar designer={designer} allWeeks={allWeeks || {}} C={C} />
        </div>
      )}
      {tab === 'edit' && (
        <EntryPanel designer={designer} dIdx={dIdx} demands={demands} clients={clients} onChange={onChange} theme={C} />
      )}
    </div>
  )
}

export default function ProfileView({ designer, dIdx, demands, clients, weekLabel, designers, allDIdx, onSwitch, onBack, onChange, theme, allWeeks }) {
  const C  = theme || DARK
  const ST = makeStyles(C)

  const total    = calcTotal(demands)
  const totalQty = demands.reduce((s, d) => (d.splits || []).reduce((a, sp) => a + (parseFloat(sp.qty) || 0), s), 0)
  const tc       = topClient(demands)

  const catBreak = {}
  demands.forEach(d => {
    const meta = getTaskMeta(d.task)
    if (!meta.isAlt) catBreak[meta.category] = (catBreak[meta.category] || 0) + calcDemandPts(d)
  })

  return (
    <div className="fade-in">
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={ST.btnGhost}>← Voltar</button>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {designers.map(d => (
            <button key={d} style={{ ...ST.dTab(d === designer), padding: '5px 10px', fontSize: 11 }} onClick={() => onSwitch(d)}>
              <div style={{ ...avatarStyle(allDIdx(d)), width: 20, height: 20, borderRadius: 5, fontSize: 8, border: '1.5px solid' }}>
                {d.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              {d.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '22px 26px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ ...avatarStyle(dIdx), width: 60, height: 60, borderRadius: 14, fontSize: 20 }}>
          {designer.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.textMain, letterSpacing: '-0.5px' }}>{designer}</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>{weekLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { val: total.toFixed(1), label: 'PONTOS',      color: C.purpleLt  },
            { val: demands.length,   label: 'DEMANDAS',    color: C.textSub   },
            { val: totalQty,         label: 'ITENS',       color: C.textSub   },
            ...(tc ? [{ val: tc,     label: 'TOP CLIENTE', color: C.blue      }] : []),
          ].map(({ val, label, color }, i) => (
            <div key={label} style={{ textAlign: 'center', ...(i > 0 ? { borderLeft: `1px solid ${C.border}`, paddingLeft: 20 } : {}) }}>
              <div style={{ fontSize: typeof val === 'string' && val.length > 6 ? 14 : 32, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4, letterSpacing: 1, fontWeight: 700 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      {Object.keys(catBreak).length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          {Object.entries(catBreak).sort((a, b) => b[1] - a[1]).map(([cat, pts]) => (
            <div key={cat} style={{ background: C.bgCard, border: `1px solid ${(CAT_COLOR[cat] || C.purpleLt) + '44'}`, borderRadius: 10, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: CAT_COLOR[cat] || C.pink }}>{pts.toFixed(0)}</div>
              <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, marginTop: 2 }}>{cat}</div>
            </div>
          ))}
        </div>
      )}

      <ProfileTabs demands={demands} clients={clients} designer={designer} dIdx={dIdx} onChange={onChange} theme={C} allWeeks={allWeeks} />
    </div>
  )
}
