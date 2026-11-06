drop policy if exists "Owners delete assessment results" on public.assessment_attempts;
drop policy if exists "Authorized teachers delete assessment results" on public.assessment_attempts;

create policy "Authorized teachers delete assessment results"
    on public.assessment_attempts for delete to authenticated
    using (public.has_teacher_permission('reports'));
