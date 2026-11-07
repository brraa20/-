alter table public.profiles
    add column if not exists school_name text not null default '',
    add column if not exists assigned_grades text[] not null default '{}',
    add column if not exists assigned_subjects text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
    add constraint profiles_role_check
    check (role in ('owner', 'teacher', 'school_manager'));
alter table public.profiles drop constraint if exists profiles_manager_permission_check;
alter table public.profiles
    add constraint profiles_manager_permission_check
    check (
        role = 'owner'
        or (role = 'school_manager' and 'manage_teachers' = any(permissions))
        or (role = 'teacher' and not ('manage_teachers' = any(permissions)))
    );

update public.profiles
set active = false
where role in ('teacher', 'school_manager')
  and not invitation_accepted;

alter table public.profiles drop constraint if exists profiles_active_requires_invitation_check;
alter table public.profiles
    add constraint profiles_active_requires_invitation_check
    check (role = 'owner' or not active or invitation_accepted);

create or replace function public.accept_teacher_invitation()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or not exists (
        select 1
        from auth.users
        where id = (select auth.uid())
          and invited_at is not null
          and email_confirmed_at is not null
    ) then
        raise exception 'يجب فتح رابط دعوة صالح من البريد الإلكتروني أولًا.';
    end if;

    update public.profiles
    set invitation_accepted = true,
        active = true
    where id = (select auth.uid())
      and role in ('teacher', 'school_manager')
      and not invitation_accepted;

    if not found then
        raise exception 'الدعوة غير صالحة أو سبق قبولها.';
    end if;
end;
$$;

revoke update on public.profiles from authenticated;
grant update (active, permissions, display_name, role, school_name, assigned_grades, assigned_subjects)
    on public.profiles to authenticated;

create or replace function public.has_assigned_grade(target_grade text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select public.is_platform_owner() or exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and active
          and invitation_accepted
          and target_grade = any(assigned_grades)
    );
$$;

create or replace function public.can_manage_teacher_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select public.is_platform_owner() or exists (
        select 1
        from public.profiles as manager
        join public.profiles as teacher
          on lower(btrim(teacher.school_name)) = lower(btrim(manager.school_name))
        where manager.id = (select auth.uid())
          and manager.role = 'school_manager'
          and manager.active
          and manager.invitation_accepted
          and 'manage_teachers' = any(manager.permissions)
          and btrim(manager.school_name) <> ''
          and teacher.id = target_profile_id
          and teacher.role = 'teacher'
          and teacher.assigned_grades <@ manager.assigned_grades
          and teacher.assigned_subjects <@ manager.assigned_subjects
          and teacher.permissions <@ array_remove(manager.permissions, 'manage_teachers')
    );
$$;

create or replace function public.can_assign_teacher_profile(
    target_role text,
    target_school_name text,
    target_grades text[],
    target_subjects text[],
    target_permissions text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select (
        public.is_platform_owner()
        and exists (
            select 1
            from public.profiles as owner
            where owner.id = (select auth.uid())
              and (
                  btrim(owner.school_name) = ''
                  or lower(btrim(target_school_name)) = lower(btrim(owner.school_name))
              )
        )
    ) or (
        target_role = 'teacher'
        and exists (
            select 1
            from public.profiles as manager
            where manager.id = (select auth.uid())
              and manager.role = 'school_manager'
              and manager.active
              and manager.invitation_accepted
              and 'manage_teachers' = any(manager.permissions)
              and btrim(manager.school_name) <> ''
              and lower(btrim(target_school_name)) = lower(btrim(manager.school_name))
              and target_grades <@ manager.assigned_grades
              and target_subjects <@ manager.assigned_subjects
              and target_permissions <@ array_remove(manager.permissions, 'manage_teachers')
        )
    );
$$;

revoke all on function public.has_assigned_grade(text) from public;
revoke all on function public.can_manage_teacher_profile(uuid) from public;
revoke all on function public.can_assign_teacher_profile(text, text, text[], text[], text[]) from public;
grant execute on function public.has_assigned_grade(text) to authenticated;
grant execute on function public.can_manage_teacher_profile(uuid) to authenticated;
grant execute on function public.can_assign_teacher_profile(text, text, text[], text[], text[]) to authenticated;

drop policy if exists "Users read their own profile and owners read all" on public.profiles;
create policy "Users read their own profile and authorized managers read staff"
    on public.profiles for select to authenticated
    using (
        id = (select auth.uid())
        or public.is_platform_owner()
        or public.can_manage_teacher_profile(id)
    );

drop policy if exists "Owners update teacher profiles" on public.profiles;
create policy "Owners update teacher profiles"
    on public.profiles for update to authenticated
    using (public.is_platform_owner())
    with check (
        public.can_assign_teacher_profile(
            role, school_name, assigned_grades, assigned_subjects, permissions
        )
    );

drop policy if exists "School managers update their teachers" on public.profiles;
create policy "School managers update their teachers"
    on public.profiles for update to authenticated
    using (public.can_manage_teacher_profile(id))
    with check (
        public.can_assign_teacher_profile(
            role, school_name, assigned_grades, assigned_subjects, permissions
        )
    );

drop policy if exists "Authorized teachers read assessment results" on public.assessment_attempts;
create policy "Teachers read results for assigned grades"
    on public.assessment_attempts for select to authenticated
    using (
        public.has_teacher_permission('reports')
        and public.has_assigned_grade(grade)
    );

drop policy if exists "Authorized teachers delete assessment results" on public.assessment_attempts;
create policy "Teachers delete results for assigned grades"
    on public.assessment_attempts for delete to authenticated
    using (
        public.has_teacher_permission('reports')
        and public.has_assigned_grade(grade)
    );

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
        where public.has_assigned_grade(grade)
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
