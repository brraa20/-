create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null default '',
    display_name text not null default '',
    role text not null default 'teacher' check (role in ('owner', 'teacher', 'school_manager')),
    active boolean not null default false,
    invitation_accepted boolean not null default false,
    permissions text[] not null default '{}',
    school_name text not null default '',
    assigned_grades text[] not null default '{}',
    assigned_subjects text[] not null default '{}',
    created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists invitation_accepted boolean not null default false;
alter table public.profiles add column if not exists school_name text not null default '';
alter table public.profiles add column if not exists assigned_grades text[] not null default '{}';
alter table public.profiles add column if not exists assigned_subjects text[] not null default '{}';

create or replace function public.create_teacher_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    insert into public.profiles (id, email, display_name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.create_teacher_profile();
revoke all on function public.create_teacher_profile() from public;

create or replace function public.is_active_teacher()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and active
          and (role = 'owner' or invitation_accepted)
    );
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and active
          and role = 'owner'
    );
$$;

create or replace function public.has_teacher_permission(required_permission text)
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
          and required_permission = any(permissions)
    );
$$;

create or replace function public.ensure_platform_owner_profile()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    owner_user auth.users%rowtype;
begin
    select *
    into owner_user
    from auth.users
    where id = (select auth.uid())
      and lower(email) = 'brraa.20@gmail.com';

    if owner_user.id is null then
        raise exception 'This account is not authorized to initialize the platform owner profile.';
    end if;

    insert into public.profiles (
        id, email, display_name, role, active, invitation_accepted, permissions
    )
    values (
        owner_user.id,
        coalesce(owner_user.email, 'brraa.20@gmail.com'),
        'مالك المنصة',
        'owner',
        true,
        true,
        array['reports', 'analytics', 'questions', 'interventions', 'support']
    )
    on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        role = excluded.role,
        active = excluded.active,
        invitation_accepted = excluded.invitation_accepted,
        permissions = excluded.permissions;
end;
$$;

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
      and role = 'teacher'
      and not invitation_accepted;

    if not found then
        raise exception 'الدعوة غير صالحة أو سبق قبولها.';
    end if;
end;
$$;

create table if not exists public.app_content (
    content_key text primary key check (content_key in ('questions', 'interventions', 'settings')),
    content jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.assessment_attempts (
    id uuid primary key default gen_random_uuid(),
    student_name text not null check (char_length(btrim(student_name)) between 1 and 120),
    grade text not null check (grade in (
        'الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي',
        'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي',
        'الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'
    )),
    diagnostic_results jsonb not null,
    final_results jsonb not null,
    percent smallint not null check (percent between 0 and 100),
    diagnostic_percent smallint not null check (diagnostic_percent between 0 and 100),
    progress text not null check (progress in ('متقدم', 'قيد التحسن', 'يحتاج إلى دعم')),
    weak_skills text[] not null default '{}',
    process_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(process_steps) = 'array'),
    created_at timestamptz not null default now(),
    check (jsonb_typeof(diagnostic_results) = 'array'),
    check (jsonb_typeof(final_results) = 'array')
);

alter table public.assessment_attempts
    add column if not exists process_steps jsonb not null default '[]'::jsonb
    check (jsonb_typeof(process_steps) = 'array');

create index if not exists assessment_attempts_created_at_idx
    on public.assessment_attempts (created_at desc);
create index if not exists assessment_attempts_name_grade_idx
    on public.assessment_attempts (student_name, grade, created_at desc);

create table if not exists public.support_tickets (
    ticket_code uuid primary key default gen_random_uuid(),
    request_type text not null check (request_type in ('مشكلة', 'مقترح', 'استفسار')),
    full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
    subject text not null check (char_length(btrim(subject)) between 1 and 200),
    details text not null check (char_length(btrim(details)) between 1 and 5000),
    status text not null default 'بانتظار الرد'
        check (status in ('بانتظار الرد', 'قيد المعالجة', 'تم الرد')),
    reply text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.app_content enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.support_tickets enable row level security;

revoke all on public.profiles, public.app_content, public.assessment_attempts, public.support_tickets from anon, authenticated;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (active) on public.profiles to authenticated;
grant select, insert, update, delete on public.app_content to authenticated;
grant select on public.app_content to anon;
grant insert on public.assessment_attempts to anon;
grant select, delete on public.assessment_attempts to authenticated;
grant select, update, delete on public.support_tickets to authenticated;
revoke all on function public.is_active_teacher() from public;
revoke all on function public.is_platform_owner() from public;
revoke all on function public.has_teacher_permission(text) from public;
revoke all on function public.ensure_platform_owner_profile() from public, anon, authenticated;
revoke all on function public.accept_teacher_invitation() from public, anon, authenticated;
grant execute on function public.is_active_teacher() to anon, authenticated;
grant execute on function public.is_platform_owner() to anon, authenticated;
grant execute on function public.has_teacher_permission(text) to anon, authenticated;
grant execute on function public.ensure_platform_owner_profile() to authenticated;
grant execute on function public.accept_teacher_invitation() to authenticated;

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

drop policy if exists "Users read their own profile and owners read all" on public.profiles;
create policy "Users read their own profile and owners read all"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()) or public.is_platform_owner());

drop policy if exists "Owners update teacher profiles" on public.profiles;
create policy "Owners update teacher profiles"
    on public.profiles for update to authenticated
    using (public.is_platform_owner())
    with check (public.is_platform_owner());

drop policy if exists "Public read published questions and interventions" on public.app_content;
create policy "Public read published questions and interventions"
    on public.app_content for select to anon, authenticated
    using (content_key in ('questions', 'interventions'));

drop policy if exists "Authorized teachers read app content" on public.app_content;
create policy "Authorized teachers read app content"
    on public.app_content for select to authenticated
    using (
        (content_key = 'questions' and public.is_active_teacher())
        or (content_key = 'interventions' and public.has_teacher_permission('interventions'))
        or (content_key = 'settings' and public.is_platform_owner())
    );

drop policy if exists "Authorized users manage question bank" on public.app_content;
create policy "Authorized users manage question bank"
    on public.app_content for all to authenticated
    using (
        (content_key = 'questions' and public.has_teacher_permission('questions'))
        or (content_key = 'interventions' and public.has_teacher_permission('interventions'))
        or (content_key = 'settings' and public.is_platform_owner())
    )
    with check (
        (content_key = 'questions' and public.has_teacher_permission('questions'))
        or (content_key = 'interventions' and public.has_teacher_permission('interventions'))
        or (content_key = 'settings' and public.is_platform_owner())
    );

drop policy if exists "Public submit assessment results" on public.assessment_attempts;
create policy "Public submit assessment results"
    on public.assessment_attempts for insert to anon, authenticated
    with check (true);

drop policy if exists "Authorized teachers read assessment results" on public.assessment_attempts;
create policy "Authorized teachers read assessment results"
    on public.assessment_attempts for select to authenticated
    using (public.has_teacher_permission('reports'));

drop policy if exists "Owners delete assessment results" on public.assessment_attempts;
drop policy if exists "Authorized teachers delete assessment results" on public.assessment_attempts;
create policy "Authorized teachers delete assessment results"
    on public.assessment_attempts for delete to authenticated
    using (public.has_teacher_permission('reports'));

drop policy if exists "Authorized support staff read tickets" on public.support_tickets;
create policy "Authorized support staff read tickets"
    on public.support_tickets for select to authenticated
    using (public.has_teacher_permission('support'));

drop policy if exists "Authorized support staff update tickets" on public.support_tickets;
create policy "Authorized support staff update tickets"
    on public.support_tickets for update to authenticated
    using (public.has_teacher_permission('support'))
    with check (public.has_teacher_permission('support'));

drop policy if exists "Authorized support staff delete tickets" on public.support_tickets;
create policy "Authorized support staff delete tickets"
    on public.support_tickets for delete to authenticated
    using (public.has_teacher_permission('support'));

create or replace function public.submit_support_ticket(
    p_request_type text,
    p_full_name text,
    p_subject text,
    p_details text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    new_ticket_code uuid;
begin
    if p_request_type not in ('مشكلة', 'مقترح', 'استفسار')
       or char_length(btrim(p_full_name)) not between 1 and 120
       or char_length(btrim(p_subject)) not between 1 and 200
       or char_length(btrim(p_details)) not between 1 and 5000 then
        raise exception 'بيانات طلب الدعم غير صالحة.';
    end if;

    insert into public.support_tickets (request_type, full_name, subject, details)
    values (p_request_type, btrim(p_full_name), btrim(p_subject), btrim(p_details))
    returning ticket_code into new_ticket_code;
    return new_ticket_code;
end;
$$;

create or replace function public.track_support_ticket(p_ticket_code uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select jsonb_build_object(
        'number', ticket_code,
        'status', status,
        'reply', reply
    )
    from public.support_tickets
    where ticket_code = p_ticket_code;
$$;

create or replace function public.update_my_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or char_length(btrim(p_display_name)) not between 1 and 120 then
        raise exception 'الاسم غير صالح.';
    end if;

    update public.profiles
    set display_name = btrim(p_display_name)
    where id = auth.uid()
      and active;
end;
$$;

revoke all on function public.submit_support_ticket(text, text, text, text) from public;
revoke all on function public.track_support_ticket(uuid) from public;
revoke all on function public.update_my_display_name(text) from public;
grant execute on function public.submit_support_ticket(text, text, text, text) to anon, authenticated;
grant execute on function public.track_support_ticket(uuid) to anon, authenticated;
grant execute on function public.update_my_display_name(text) to authenticated;
