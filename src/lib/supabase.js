import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Week helpers ──────────────────────────────────────────
export const getWeekKey = (date = new Date()) => {
  const d = new Date(date)
  // usa dia local (não UTC) para evitar shift de fuso horário
  const day = d.getDay() // 0=dom, 1=seg...
  const diff = day === 0 ? -6 : 1 - day // ajusta para segunda-feira
  d.setDate(d.getDate() + diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export const getWeekLabel = (weekKey) => {
  const s = new Date(weekKey + 'T12:00:00')
  const e = new Date(s)
  e.setDate(s.getDate() + 4)
  const f = x => x.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return `${f(s)} – ${f(e)}`
}

export const getMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export const getWeeksInMonth = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number)
  const weeks = new Set()
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day)
    weeks.add(getWeekKey(d))
  }
  return [...weeks].sort()
}

export const getLast12Months = () => {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// ── DB operations ─────────────────────────────────────────

export const loadAllWeeks = async () => {
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const { data, error } = await supabase
    .from('weekly_entries')
    .select('*')
    .gte('week_key', oneYearAgo.toISOString().split('T')[0])
    .order('week_key', { ascending: false })
  if (error) throw error
  return data || []
}

export const saveDesignerWeek = async (weekKey, designerName, demands) => {
  const { error } = await supabase
    .from('weekly_entries')
    .upsert(
      { week_key: weekKey, designer_name: designerName, demands },
      { onConflict: 'week_key,designer_name' }
    )
  if (error) throw error
}

// ── FIX BUG #5: loadDesigners now returns full rows with group_id ──
export const loadDesigners = async () => {
  const { data, error } = await supabase
    .from('designers')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

// FIX: receives array of {name, sort_order, group_id} objects
export const saveDesigners = async (list) => {
  const rows = list.map((d, i) => ({
    name:       typeof d === 'string' ? d : d.name,
    sort_order: typeof d === 'string' ? i  : (d.sort_order ?? i),
    group_id:   typeof d === 'object' ? (d.group_id ?? 1) : 1,
    nucleo_id:  typeof d === 'object' ? (d.nucleo_id ?? null) : null,
  }))
  const { error } = await supabase
    .from('designers')
    .upsert(rows, { onConflict: 'name' })
  if (error) throw error
}

export const updateDesignerGroup = async (name, group_id) => {
  const { error } = await supabase
    .from('designers')
    .update({ group_id })
    .eq('name', name)
  if (error) throw error
}

export const deleteDesigner = async (name) => {
  const { error } = await supabase.from('designers').delete().eq('name', name)
  if (error) throw error
}

export const loadClients = async () => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data || []).map(r => ({ name: r.name, group_id: r.group_id ?? 0, nucleo_id: r.nucleo_id ?? null }))
}

export const saveClient = async (name, sortOrder, group_id = 0, nucleo_id = null) => {
  const { error } = await supabase
    .from('clients')
    .upsert({ name, sort_order: sortOrder, group_id, nucleo_id }, { onConflict: 'name' })
  if (error) throw error
}

export const updateClientGroup = async (name, group_id) => {
  const { error } = await supabase
    .from('clients')
    .update({ group_id })
    .eq('name', name)
  if (error) throw error
}

export const deleteClient = async (name) => {
  const { error } = await supabase.from('clients').delete().eq('name', name)
  if (error) throw error
}

// ── Ideias ────────────────────────────────────────────────
export const loadIdeias = async () => {
  const { data, error } = await supabase
    .from('ideias')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export const saveIdeia = async (ideia) => {
  const { error } = await supabase
    .from('ideias')
    .insert({ titulo: ideia.titulo, descricao: ideia.descricao, autor: ideia.autor })
  if (error) throw error
}

export const deleteIdeia = async (id) => {
  const { error } = await supabase.from('ideias').delete().eq('id', id)
  if (error) throw error
}

// ── Tetos de carga ────────────────────────────────────────
export const loadTetos = async () => {
  const { data, error } = await supabase
    .from('designer_tetos')
    .select('*')
  if (error) throw error
  const map = {}
  ;(data || []).forEach(r => { map[r.designer_name] = r.teto })
  return map
}

export const saveTeto = async (designer_name, teto) => {
  const { error } = await supabase
    .from('designer_tetos')
    .upsert({ designer_name, teto }, { onConflict: 'designer_name' })
  if (error) throw error
}

export const updateIdeiaStatus = async (id, status) => {
  const { error } = await supabase
    .from('ideias')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

// ── Núcleos ───────────────────────────────────────────────
export const loadNucleos = async () => {
  const { data, error } = await supabase
    .from('nucleos')
    .select('*')
    .order('ordem', { ascending: true })
  if (error) throw error
  return data || []
}

export const saveNucleo = async (nome, cor) => {
  const { error } = await supabase
    .from('nucleos')
    .insert({ nome, cor })
  if (error) throw error
}

export const deleteNucleo = async (id) => {
  const { error } = await supabase.from('nucleos').delete().eq('id', id)
  if (error) throw error
}

export const updateDesignerNucleo = async (name, nucleo_id) => {
  const { error } = await supabase
    .from('designers')
    .update({ nucleo_id })
    .eq('name', name)
  if (error) throw error
}

export const updateClientNucleo = async (name, nucleo_id) => {
  const { error } = await supabase
    .from('clients')
    .update({ nucleo_id })
    .eq('name', name)
  if (error) throw error
}
