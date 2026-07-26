-- ===================================================================
-- FeatureDesk CV Microservice — Supabase schema (ADDITIVE)
-- Run this in the Supabase SQL editor. It only CREATES new tables and
-- does not touch any existing table, so the current app is unaffected.
-- ===================================================================

-- Per-student enable/disable flag, toggled from the student login (local device).
create table if not exists public.cv_monitoring_settings (
    student_id   text primary key,
    enabled      boolean     not null default false,
    exam_id      text,
    updated_at   timestamptz not null default now()
);

-- Live monitoring results pushed by the local CV agent on the student's device.
create table if not exists public.cv_attention (
    id          uuid        primary key default gen_random_uuid(),
    student_id  text        not null,
    exam_id     text,
    status      text        not null,             -- Focused | Distracted | Sleeping | Absent
    attention   int         not null default 0,   -- 0..100
    phone       boolean     not null default false,
    faces       int         not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists cv_attention_student_idx on public.cv_attention (student_id, created_at desc);

-- Realtime so the teacher dashboard / student monitoring update live.
alter publication supabase_realtime add table public.cv_attention;
alter publication supabase_realtime add table public.cv_monitoring_settings;

-- RLS — mirror the app's existing access model. The app uses the anon key, so
-- allow anon read/write on just these two tables (tighten later if you add auth).
alter table public.cv_monitoring_settings enable row level security;
alter table public.cv_attention          enable row level security;

create policy cv_settings_all on public.cv_monitoring_settings
    for all using (true) with check (true);
create policy cv_attention_all on public.cv_attention
    for all using (true) with check (true);

-- Keep only recent rows tidy (optional): delete attention older than 1 day.
-- (Schedule via pg_cron if desired.)
