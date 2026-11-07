do $$
declare
    owner_profile_id uuid;
begin
    select id
    into owner_profile_id
    from public.profiles
    where lower(email) = lower('brraa.20@gmail.com');

    if owner_profile_id is null then
        raise exception 'Create the Supabase Auth user for brraa.20@gmail.com first, then run this script again.';
    end if;

    update public.profiles
    set role = 'owner',
        active = true,
        invitation_accepted = true,
        display_name = 'مالك المنصة',
        permissions = array['reports', 'analytics', 'questions', 'interventions', 'support']
    where id = owner_profile_id;
end;
$$;

select id, email, role, active, permissions
from public.profiles
where lower(email) = lower('brraa.20@gmail.com');
