alter table public.assessment_attempts
    add column if not exists process_steps jsonb not null default '[]'::jsonb
    check (jsonb_typeof(process_steps) = 'array');
