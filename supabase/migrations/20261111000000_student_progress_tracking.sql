create table if not exists public.student_assessment_progress (
    session_id uuid primary key,
    student_name text not null check (char_length(btrim(student_name)) between 1 and 120),
    grade text not null check (grade in (
        'الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي',
        'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي',
        'الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'
    )),
    stage text not null check (stage in ('diagnostic', 'intervention', 'reassessment', 'interventionOutcome', 'final')),
    stage_label text not null check (char_length(btrim(stage_label)) between 1 and 120),
    progress_percent smallint not null check (progress_percent between 0 and 100),
    current_question smallint not null check (current_question >= 0),
    total_questions smallint not null check (total_questions >= 0),
    trained_seconds integer not null check (trained_seconds between 0 and 28800),
    process_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(process_steps) = 'array'),
    started_at timestamptz not null,
    updated_at timestamptz not null default now(),
    check (current_question <= total_questions or total_questions = 0)
);

alter table public.assessment_attempts
    add column if not exists duration_seconds integer not null default 0
    check (duration_seconds between 0 and 28800);

alter table public.student_assessment_progress enable row level security;
revoke all on public.student_assessment_progress from anon, authenticated;
grant select on public.student_assessment_progress to authenticated;

drop policy if exists "Teachers read progress for assigned grades" on public.student_assessment_progress;
create policy "Teachers read progress for assigned grades"
    on public.student_assessment_progress for select to authenticated
    using (
        public.has_teacher_permission('reports')
        and public.has_assigned_grade(grade)
    );

create or replace function public.save_student_assessment_progress(
    p_session_id uuid,
    p_student_name text,
    p_grade text,
    p_stage text,
    p_stage_label text,
    p_progress_percent integer,
    p_current_question integer,
    p_total_questions integer,
    p_trained_seconds integer,
    p_process_steps jsonb,
    p_started_at timestamptz,
    p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if p_session_id is null
       or char_length(btrim(p_student_name)) not between 1 and 120
       or p_grade not in (
            'الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي',
            'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي',
            'الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'
       )
       or p_stage not in ('diagnostic', 'intervention', 'reassessment', 'interventionOutcome', 'final')
       or char_length(btrim(p_stage_label)) not between 1 and 120
       or p_progress_percent not between 0 and 100
       or p_current_question < 0
       or p_total_questions < 0
       or (p_current_question > p_total_questions and p_total_questions > 0)
       or p_trained_seconds not between 0 and 28800
       or jsonb_typeof(p_process_steps) <> 'array'
       or pg_column_size(p_process_steps) > 65536
       or p_started_at is null
       or p_started_at > now() + interval '5 minutes' then
        raise exception 'بيانات تقدم الطالب غير صالحة.';
    end if;

    if p_completed then
        delete from public.student_assessment_progress
        where session_id = p_session_id;
        return;
    end if;

    insert into public.student_assessment_progress (
        session_id, student_name, grade, stage, stage_label, progress_percent,
        current_question, total_questions, trained_seconds, process_steps, started_at, updated_at
    )
    values (
        p_session_id, btrim(p_student_name), p_grade, p_stage, btrim(p_stage_label),
        p_progress_percent, p_current_question, p_total_questions, p_trained_seconds,
        p_process_steps, p_started_at, now()
    )
    on conflict (session_id) do update set
        student_name = excluded.student_name,
        grade = excluded.grade,
        stage = excluded.stage,
        stage_label = excluded.stage_label,
        progress_percent = excluded.progress_percent,
        current_question = excluded.current_question,
        total_questions = excluded.total_questions,
        trained_seconds = excluded.trained_seconds,
        process_steps = excluded.process_steps,
        updated_at = now();
end;
$$;

revoke all on function public.save_student_assessment_progress(
    uuid, text, text, text, text, integer, integer, integer, integer, jsonb, timestamptz, boolean
) from public;
grant execute on function public.save_student_assessment_progress(
    uuid, text, text, text, text, integer, integer, integer, integer, jsonb, timestamptz, boolean
) to anon, authenticated;
