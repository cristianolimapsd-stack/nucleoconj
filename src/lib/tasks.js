export const TASK_TABLE = [
  {
    category: 'Social Mídia',
    color: '#8b5cf6',
    tasks: [
      { label: 'Telas',          points: { Simples: 2.5, Médio: 7.5, Avançado: 10,  Alteração: 0 } },
      { label: 'LP',             points: { Simples: 15,  Médio: 20,  Avançado: 25,  Alteração: 0 } },
      { label: 'Post Animado',   points: { Simples: 20,  Médio: 25,  Avançado: 50,  Alteração: 0 } },
      { label: 'Reels',          points: { Simples: 20,  Médio: 40,  Avançado: 100, Alteração: 0 } },
      { label: 'YouTube',        points: { Simples: 20,  Médio: 40,  Avançado: 100, Alteração: 0 } },
    ],
  },
  {
    category: 'CRM & Performance',
    color: '#06b6d4',
    tasks: [
      { label: 'Email Marketing', points: { Simples: 15, Médio: 20, Avançado: 25,  Alteração: 0 } },
      { label: 'KV',              points: { Simples: 40, Médio: 80, Avançado: 120, Alteração: 0 } },
    ],
  },
  {
    category: 'Especiais',
    color: '#a78bfa',
    tasks: [
      { label: 'Reunião 1:1',           points: { Único: 5   }, fixed: true },
      { label: 'Reuniões',              points: { Único: 5   }, fixed: true },
      { label: 'Workshop',              points: { Único: 5   }, fixed: true },
      { label: 'Aprovação de Artes',    points: { Único: 5   }, fixed: true },
      { label: 'Reunião de Daily',      points: { Único: 5   }, fixed: true },
      { label: 'Weekly',                points: { Único: 5   }, fixed: true },
      { label: 'Criação do Sprint',     points: { Único: 3   }, fixed: true },
      { label: 'Urgência Não Prevista', points: { Único: 100 }, fixed: true, isUrgent: true },
    ],
  },
]

export const ALL_TASKS   = TASK_TABLE.flatMap(c => c.tasks.map(t => ({ ...t, category: c.category, catColor: c.color })))
export const getTaskMeta = label => ALL_TASKS.find(t => t.label === label) || ALL_TASKS[0]
export const getDiffs    = label => Object.keys(getTaskMeta(label).points)
export const getPts      = (label, diff) => getTaskMeta(label).points[diff] ?? 0
export const CAT_COLOR   = Object.fromEntries(TASK_TABLE.map(c => [c.category, c.color]))

export const DIFF_COLOR  = { Simples: '#4ade80', Médio: '#fbbf24', Avançado: '#f87171', Único: '#a78bfa', Alteração: '#4b5563' }
export const AVATAR_HUE  = [270, 240, 290, 310, 260, 220, 330, 280, 250, 300, 200]

export const uid = () => Math.random().toString(36).slice(2, 9)

export const newSplit = (taskLabel) => {
  const diff = getDiffs(taskLabel)[0]
  return { id: uid(), qty: '1', difficulty: diff, pts: getPts(taskLabel, diff) }
}

export const emptyDemand = (defaultClient = 'Wosi') => {
  const task = ALL_TASKS[0]
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  return { id: uid(), name: '', client: defaultClient, task: task.label, splits: [newSplit(task.label)], date }
}

export const calcSplitPts  = (taskLabel, split) => {
  if (split.difficulty === 'Alteração') return 0
  return (parseFloat(split.qty) || 0) * (parseFloat(split.pts) || 0)
}
export const calcDemandPts = demand => (demand.splits || []).reduce((s, sp) => s + calcSplitPts(demand.task, sp), 0)
export const calcTotal     = demands => (demands || []).reduce((s, d) => s + calcDemandPts(d), 0)

export const avatarStyle = i => ({
  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
  background: `hsl(${AVATAR_HUE[i % AVATAR_HUE.length]},60%,13%)`,
  border: `2px solid hsl(${AVATAR_HUE[i % AVATAR_HUE.length]},65%,50%)`,
  color: `hsl(${AVATAR_HUE[i % AVATAR_HUE.length]},70%,62%)`,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
})

// Top client from a list of demands
export const topClient = (demands) => {
  const count = {}
  ;(demands || []).forEach(d => { count[d.client] = (count[d.client] || 0) + 1 })
  if (!Object.keys(count).length) return null
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0]
}
