import { TASK_TABLE, getTaskMeta, getDiffs, getPts, calcDemandPts, calcSplitPts, calcTotal, avatarStyle, newSplit, emptyDemand } from '../lib/tasks.js'
import { DARK, makeStyles } from '../lib/styles.js'

const DIFF_COLOR = { Simples: '#22c55e', Médio: '#f59e0b', Avançado: '#ef4444', Único: '#a78bfa' }

const CLIENT_PALETTE = [
  '#8b2fe8', '#e8196a', '#60a5fa', '#4ade80', '#fbbf24',
  '#f472b6', '#34d399', '#fb923c', '#a78bfa', '#38bdf8',
  '#e879f9', '#86efac', '#fcd34d', '#6ee7b7', '#93c5fd',
]
const getClientColor = (clients, clientName) => {
  const idx = clients.indexOf(clientName)
  return CLIENT_PALETTE[idx >= 0 ? idx % CLIENT_PALETTE.length : 0]
}

export default function EntryPanel({ designer, dIdx, demands, clients, onChange, theme, prevDemands, isMobile, demandContext }) {
  const C  = theme || DARK
  const ST = makeStyles(C)
  const hasClients = clients.length > 0
  const applyContext = demand => ({ ...demand, ...(demandContext || {}) })
  const normalizeDemand = demand => applyContext({
    ...demand,
    client: clients.includes(demand.client) ? demand.client : clients[0],
  })

  const addDemand    = () => {
    if (!hasClients) return
    onChange([...demands, normalizeDemand(emptyDemand(clients[0]))])
  }
  const removeDemand = id => onChange(demands.filter(d => d.id !== id))
  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })()

  const duplicateDemand = id => {
    const src = demands.find(d => d.id === id)
    if (!src) return
    const freshId = () => Math.random().toString(36).slice(2, 9)
    const copy = normalizeDemand({ ...src, id: freshId(), date: today, splits: (src.splits || []).map(s => ({ ...s, id: freshId() })) })
    const idx = demands.findIndex(d => d.id === id)
    const next = [...demands]
    next.splice(idx + 1, 0, copy)
    onChange(next)
  }

  const copyFromPrev = () => {
    if (!prevDemands?.length || !hasClients) return
    const freshId = () => Math.random().toString(36).slice(2, 9)
    const copied = prevDemands.map(d => normalizeDemand({
      ...d, id: freshId(), date: today,
      splits: (d.splits || []).map(s => ({ ...s, id: freshId() }))
    }))
    onChange([...demands, ...copied])
  }

  const updateDemand = (id, field, value) => {
    onChange(demands.map(d => {
      if (d.id !== id) return d
      const next = { ...d, [field]: value }
      if (field === 'task') next.splits = [newSplit(value)]
      return next
    }))
  }

  const addSplit = demandId => {
    onChange(demands.map(d => d.id !== demandId ? d : { ...d, splits: [...(d.splits || []), newSplit(d.task)] }))
  }
  const removeSplit = (demandId, splitId) => {
    onChange(demands.map(d => {
      if (d.id !== demandId) return d
      const splits = (d.splits || []).filter(s => s.id !== splitId)
      return { ...d, splits: splits.length ? splits : [newSplit(d.task)] }
    }))
  }
  const updateSplit = (demandId, splitId, field, value) => {
    onChange(demands.map(d => {
      if (d.id !== demandId) return d
      const splits = (d.splits || []).map(s => {
        if (s.id !== splitId) return s
        const next = { ...s, [field]: value }
        if (field === 'difficulty') next.pts = getPts(d.task, value)
        return next
      })
      return { ...d, splits }
    }))
  }

  const total    = calcTotal(demands)
  const totalQty = demands.reduce((s, d) => (d.splits || []).reduce((a, sp) => a + (parseFloat(sp.qty) || 0), s), 0)

  return (
    <div>
      {/* Header */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 13, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ ...avatarStyle(dIdx), width: 42, height: 42, borderRadius: 11 }}>
          {designer.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.textMain }}>{designer}</div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{demands.length} demanda(s) · {totalQty} itens</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {prevDemands?.length > 0 && demands.length === 0 && (
            <button onClick={copyFromPrev}
              style={{ fontSize: 11, fontWeight: 700, color: C.purpleVbr, background: C.purpleNav, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              ↩ Copiar semana anterior ({prevDemands.length})
            </button>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.pink, lineHeight: 1 }}>{total.toFixed(1)}</div>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1 }}>PONTOS</div>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {demands.map((d, di) => {
          const meta    = getTaskMeta(d.task)
          const isAlt   = meta.isAlt
          const isFixed = meta.fixed
          const dp      = calcDemandPts(d)
          const diffs   = getDiffs(d.task)
          const clientColor = getClientColor(clients, d.client)

          return (
            <div key={d.id} className="card-in" style={{
              background: C.bgCard,
              border: `1px solid ${clientColor}55`,
              borderLeft: `3px solid ${clientColor}`,
              borderRadius: 12,
              overflow: 'hidden',
              animationDelay: `${di * 0.04}s`,
            }}>
              {/* Linha principal — 1 linha no desktop, empilhado no mobile */}
              {isMobile ? (
                <div style={{ padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Linha 1: nome + fechar */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={d.name} placeholder="Nome da demanda..."
                      onChange={e => updateDemand(d.id, 'name', e.target.value)}
                      style={{ ...ST.inp, fontSize: 15, fontWeight: 600, flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {isAlt
                        ? <span style={{ fontSize: 9, color: C.textMuted, fontWeight: 700 }}>ALT.</span>
                        : <><div style={{ fontSize: 18, fontWeight: 900, color: C.pink, lineHeight: 1 }}>{dp.toFixed(1)}</div><div style={{ fontSize: 9, color: C.textMuted }}>PT</div></>
                      }
                      <button onClick={() => removeDemand(d.id)}
                        style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>
                    </div>
                  </div>
                  {/* Linha 2: tipo + cliente */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={d.task} onChange={e => updateDemand(d.id, 'task', e.target.value)}
                      style={{ ...ST.sel, flex: 2, fontSize: 14 }}>
                      {TASK_TABLE.map(cat => (
                        <optgroup key={cat.category} label={cat.category}>
                          {cat.tasks.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <select value={d.client} onChange={e => updateDemand(d.id, 'client', e.target.value)}
                      style={{ ...ST.sel, flex: 1, fontSize: 14, color: clientColor, borderColor: clientColor + '55', fontWeight: 700 }}>
                      {clients.map(c => <option key={c} style={{ color: C.textMain }}>{c}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, padding: '11px 14px', alignItems: 'center' }}>
                {/* Nome */}
                <input value={d.name} placeholder="Nome da demanda..."
                  onChange={e => updateDemand(d.id, 'name', e.target.value)}
                  style={{ ...ST.inp, fontSize: 13, fontWeight: 600 }} />

                {/* Tipo */}
                <select value={d.task} onChange={e => updateDemand(d.id, 'task', e.target.value)}
                  style={{ ...ST.sel, fontSize: 12, minWidth: 120, maxWidth: 160 }}>
                  {TASK_TABLE.map(cat => (
                    <optgroup key={cat.category} label={cat.category}>
                      {cat.tasks.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                    </optgroup>
                  ))}
                </select>

                {/* Cliente */}
                <select value={d.client} onChange={e => updateDemand(d.id, 'client', e.target.value)}
                  style={{ ...ST.sel, fontSize: 12, color: clientColor, borderColor: clientColor + '55', minWidth: 80, maxWidth: 110, fontWeight: 700 }}>
                  {clients.map(c => <option key={c} style={{ color: C.textMain }}>{c}</option>)}
                </select>

                {/* PT + fechar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ textAlign: 'right', minWidth: 48 }}>
                    {isAlt
                      ? <span style={{ fontSize: 9, color: C.textMuted, fontWeight: 700 }}>ALT.</span>
                      : <><div style={{ fontSize: 16, fontWeight: 900, color: C.pink, lineHeight: 1 }}>{dp.toFixed(1)}</div><div style={{ fontSize: 9, color: C.textMuted }}>PT</div></>
                    }
                  </div>
                  <button onClick={() => removeDemand(d.id)}
                    style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>✕</button>
                </div>
              </div>
              )}

              {/* Splits */}
              <div style={{ borderTop: `1px solid ${C.border}44`, padding: '7px 14px 10px', background: C.bgCardDp + '66' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(d.splits || []).map(sp => {
                    const spt = calcSplitPts(d.task, sp)
                    const dc  = DIFF_COLOR[sp.difficulty] || C.textSub
                    return (
                      <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
                          <button onClick={() => updateSplit(d.id, sp.id, 'qty', Math.max(1, (parseInt(sp.qty)||1) - 1))}
                            style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: isMobile ? 18 : 14, padding: isMobile ? '8px 12px' : '4px 8px', lineHeight: 1 }}>−</button>
                          <input type="number" min="1" value={sp.qty}
                            onChange={e => updateSplit(d.id, sp.id, 'qty', e.target.value)}
                            style={{ width: isMobile ? 36 : 28, textAlign: 'center', background: 'transparent', border: 'none', color: C.purpleVbr, fontWeight: 800, fontSize: isMobile ? 16 : 13, fontFamily: 'inherit', outline: 'none', padding: isMobile ? '8px 0' : '4px 0' }} />
                          <button onClick={() => updateSplit(d.id, sp.id, 'qty', (parseInt(sp.qty)||1) + 1)}
                            style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: isMobile ? 18 : 14, padding: isMobile ? '8px 12px' : '4px 8px', lineHeight: 1 }}>+</button>
                        </div>
                        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>×</span>
                        <select value={sp.difficulty}
                          onChange={e => updateSplit(d.id, sp.id, 'difficulty', e.target.value)}
                          disabled={diffs.length === 1 || isFixed}
                          style={{ ...ST.sel, color: isFixed ? C.blue : dc, borderColor: (isFixed ? C.blue : dc) + '55', flex: 1, fontSize: isMobile ? 14 : 12 }}>
                          {diffs.map(df => <option key={df} style={{ color: C.textMain }}>{df}</option>)}
                        </select>
                        {!isAlt && (
                          <div style={{ textAlign: 'right', minWidth: 72, flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: C.textMuted }}>{sp.qty}×{sp.pts} = </span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: C.pink }}>{spt.toFixed(1)}</span>
                            <span style={{ fontSize: 9, color: C.textMuted }}> PT</span>
                          </div>
                        )}
                        {(d.splits || []).length > 1 && (
                          <button onClick={() => removeSplit(d.id, sp.id)}
                            style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: isMobile ? 16 : 12, flexShrink: 0, padding: isMobile ? '6px' : 0 }}>✕</button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  {!isFixed
                    ? <button onClick={() => addSplit(d.id)}
                        style={{ background: 'transparent', border: 'none', padding: '3px 0', fontFamily: 'inherit', fontSize: 11, color: C.textMuted, cursor: 'pointer' }}>
                        + dificuldade diferente
                      </button>
                    : <span />
                  }
                  <button onClick={() => duplicateDemand(d.id)} title="Duplicar demanda"
                    style={{ background: 'transparent', border: 'none', padding: '3px 0', fontFamily: 'inherit', fontSize: 11, color: C.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    ⎘ duplicar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button onClick={addDemand} disabled={!hasClients}
          style={{ ...ST.btnAdd, opacity: hasClients ? 1 : 0.45, cursor: hasClients ? 'pointer' : 'not-allowed' }}>
          + Adicionar demanda
        </button>
        {!hasClients && (
          <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>
            Cadastre um cliente para este núcleo/squad antes de lançar.
          </span>
        )}
        {demands.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: C.textSub }}>Total:</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: C.pink }}>{total.toFixed(1)} PT</span>
          </div>
        )}
      </div>

      {demands.length === 0 && (
        <div style={{ textAlign: 'center', padding: '52px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 14, color: C.textSub, fontWeight: 600 }}>Nenhuma demanda lançada</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
            {hasClients ? 'Clique em "+ Adicionar demanda" para começar' : 'Nenhum cliente disponível para o contexto atual'}
          </div>
        </div>
      )}
    </div>
  )
}
