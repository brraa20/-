do $$
declare
    owner_user_id uuid;
    owner_email text;
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
end;
$$;

select id, email, role, active, invitation_accepted, permissions
from public.profiles
where id = (
    select id
    from auth.users
    where lower(email) = lower('brraa.20@gmail.com')
);
