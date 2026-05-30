import { getTaskMeta, calcDemandPts, calcSplitPts, CAT_COLOR } from '../lib/tasks.js'
import { DARK } from '../lib/styles.js'

const DIFF_COLOR = { Simples: '#22c55e', Médio: '#f59e0b', Avançado: '#ef4444', Único: '#a78bfa' }

export default function DemandList({ demands, theme }) {
  const C = theme || DARK
  if (!demands?.length)
    return <div style={{ fontSize: 13, color: C.textMuted, padding: '20px 0', textAlign: 'center' }}>Sem demandas lançadas.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {demands.map(d => {
        const meta     = getTaskMeta(d.task)
        const dp       = calcDemandPts(d)
        const totalQty = (d.splits || []).reduce((s, sp) => s + (parseFloat(sp.qty) || 0), 0)
        const catColor = CAT_COLOR[meta.category] || C.purpleLt

        return (
          <div key={d.id} style={{ background: C.bgCardDp, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: catColor + '22', color: catColor, flexShrink: 0 }}>
                {d.task}
              </span>
              {d.name
                ? <span style={{ fontSize: 13, fontWeight: 600, color: C.textMain, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{d.name}"</span>
                : <span style={{ flex: 1 }} />
              }
              <span style={{ fontSize: 11, color: C.textSub, flexShrink: 0 }}>{d.client}</span>
              <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{totalQty} iten{totalQty !== 1 ? 's' : ''}</span>
              {meta.isAlt
                ? <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, padding: '2px 8px', background: C.bgCard, borderRadius: 5, flexShrink: 0 }}>ALT.</span>
                : <span style={{ fontSize: 15, fontWeight: 800, color: C.pink, flexShrink: 0 }}>{dp.toFixed(1)} PT</span>
              }
            </div>
            {(d.splits || []).length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 14px' }}>
                {(d.splits || []).map(sp => {
                  const spt = calcSplitPts(d.task, sp)
                  const dc  = DIFF_COLOR[sp.difficulty] || C.textSub
                  return (
                    <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.bgCard, borderRadius: 7, padding: '4px 10px' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.textMain }}>{sp.qty}×</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: dc }}>{sp.difficulty}</span>
                      {!meta.isAlt && <span style={{ fontSize: 11, color: C.textSub }}>= {spt.toFixed(1)} PT</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
