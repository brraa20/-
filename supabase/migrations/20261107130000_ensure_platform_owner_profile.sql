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

revoke all on function public.ensure_platform_owner_profile() from public, anon, authenticated;
grant execute on function public.ensure_platform_owner_profile() to authenticated;
