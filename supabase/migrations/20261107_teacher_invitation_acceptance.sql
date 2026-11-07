alter table public.profiles
    add column if not exists invitation_accepted boolean not null default false;

update public.profiles as profile
set invitation_accepted = true
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.role = 'teacher'
  and auth_user.invited_at is not null
  and auth_user.email_confirmed_at is not null;

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

revoke all on function public.accept_teacher_invitation() from public, anon, authenticated;
grant execute on function public.accept_teacher_invitation() to authenticated;

revoke update on public.profiles from authenticated;
grant update (active) on public.profiles to authenticated;
