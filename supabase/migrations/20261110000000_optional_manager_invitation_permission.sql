alter table public.profiles
    drop constraint if exists profiles_manager_permission_check;

alter table public.profiles
    add constraint profiles_manager_permission_check
    check (
        role = 'owner'
        or role = 'school_manager'
        or (role = 'teacher' and not ('manage_teachers' = any(permissions)))
    );
