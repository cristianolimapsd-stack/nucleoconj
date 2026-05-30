# Núcleo2 🎨

Ferramenta de weekly para times de design com metodologia ágil.

---

## Stack
- **React + Vite** — frontend
- **Supabase** — banco de dados (PostgreSQL)
- **Vercel** — deploy

---

## Deploy passo a passo

### 1. Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Vá em **SQL Editor** e cole todo o conteúdo de `supabase-schema.sql` → clique em **Run**
3. Vá em **Project Settings → API** e copie:
   - `Project URL` → será `VITE_SUPABASE_URL`
   - `anon public` key → será `VITE_SUPABASE_ANON_KEY`

### 2. GitHub

```bash
# Clone ou crie o repositório
git init
git add .
git commit -m "feat: weekly design app"
git branch -M main
git remote add origin https://github.com/SEU_USER/weekly-design-app.git
git push -u origin main
```

### 3. Vercel

1. Acesse [vercel.com](https://vercel.com) → **New Project**
2. Importe o repositório do GitHub
3. Em **Environment Variables**, adicione:
   ```
   VITE_SUPABASE_URL      = https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbG...
   ```
4. Clique em **Deploy** ✅

---

## Desenvolvimento local

```bash
# Instalar dependências
npm install

# Copiar e preencher variáveis de ambiente
cp .env.example .env
# Edite o .env com suas chaves do Supabase

# Rodar localmente
npm run dev
```

---

## Funcionalidades

- **Dashboard** — visão geral do time com Top Cliente, pontos por categoria, barra de progresso
- **Lançar Demandas** — por designer, com suporte a múltiplas dificuldades na mesma demanda
- **Perfil individual** — tela para a reunião, com edição inline
- **Relatório** — exportação para texto/clipboard
- **Histórico** — filtro por mês e semana, últimos 12 meses
- **⚙ Configurações** — adicionar/remover designers e clientes pela UI

---

## Estrutura de dados

```
weekly_entries
├── week_key       (date)   — ex: "2025-01-06"
├── designer_name  (text)
└── demands        (jsonb)  — array de demandas
    ├── id, name, client, task
    └── splits[]
        ├── id, qty, difficulty, pts
```
