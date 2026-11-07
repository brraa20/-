create or replace function public.get_teacher_analytics_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    summary jsonb;
begin
    if not public.has_teacher_permission('analytics') then
        raise exception 'لا تملك صلاحية تحليلات المدرسة.';
    end if;

    with ranked_attempts as (
        select
            student_name,
            grade,
            percent,
            diagnostic_percent,
            weak_skills,
            count(*) over (partition by student_name, grade) as attempt_count,
            row_number() over (
                partition by student_name, grade
                order by created_at desc, id desc
            ) as attempt_rank
        from public.assessment_attempts
    ),
    latest_attempts as (
        select *
        from ranked_attempts
        where attempt_rank = 1
    ),
    weak_skill_counts as (
        select skill, count(*) as student_count
        from latest_attempts
        cross join lateral unnest(weak_skills) as skills(skill)
        group by skill
    )
    select jsonb_build_object(
        'student_count', count(*)::integer,
        'average_percent', coalesce(round(avg(percent)), 0)::integer,
        'diagnostic_average', coalesce(round(avg(diagnostic_percent)), 0)::integer,
        'highest_percent', coalesce(max(percent), 0)::integer,
        'total_attempts', coalesce(sum(attempt_count), 0)::integer,
        'weak_skills', coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object('skill', skill, 'count', student_count)
                    order by student_count desc, skill
                )
                from weak_skill_counts
            ),
            '[]'::jsonb
        )
    )
    into summary
    from latest_attempts;

    return summary;
end;
$$;

revoke all on function public.get_teacher_analytics_summary() from public, anon, authenticated;
grant execute on function public.get_teacher_analytics_summary() to authenticated;
