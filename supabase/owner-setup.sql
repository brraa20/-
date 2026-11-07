do $$
declare
    owner_user_id uuid;
    owner_email text;
    owner_profile public.profiles%rowtype;
begin
    select id
    into owner_user_id
    from auth.users
    where lower(email) = lower('brraa.20@gmail.com');

    if owner_user_id is null then
        raise exception 'Create the Supabase Auth user for brraa.20@gmail.com first, then run this script again.';
    end if;

    select email
    into owner_email
    from auth.users
    where id = owner_user_id;

    insert into public.profiles (
        id, email, display_name, role, active, invitation_accepted, permissions
    )
    values (
        owner_user_id,
        coalesce(owner_email, 'brraa.20@gmail.com'),
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

    select *
    into owner_profile
    from public.profiles
    where id = owner_user_id;

    if not found
       or owner_profile.role <> 'owner'
       or not owner_profile.active
       or not owner_profile.invitation_accepted
       or not (
           owner_profile.permissions @> array[
               'reports', 'analytics', 'questions', 'interventions', 'support'
           ]::text[]
       ) then
        raise exception 'Owner profile verification failed for brraa.20@gmail.com.';
    end if;
end;
$$;

select
    users.id,
    users.email as auth_email,
    users.email_confirmed_at is not null as auth_email_confirmed,
    profiles.email as profile_email,
    profiles.role,
    profiles.active,
    profiles.invitation_accepted,
    profiles.permissions,
    case
        when profiles.id is null then 'missing'
        when profiles.role = 'owner'
            and profiles.active
            and profiles.invitation_accepted
            and profiles.permissions @> array[
                'reports', 'analytics', 'questions', 'interventions', 'support'
            ]::text[]
            then 'verified'
        else 'needs_attention'
    end as profile_status
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
where lower(users.email) = lower('brraa.20@gmail.com');
