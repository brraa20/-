# Supabase deployment package

This package contains the Supabase database migrations and the `create-teacher` Edge Function. It contains no project credentials or service-role key.

## Deploy with the Supabase CLI

1. Extract the package and open a terminal in the extracted folder.
2. Link it to your Supabase project:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Apply the database migrations:

   ```powershell
   supabase db push
   ```

4. Deploy the teacher invitation function:

   ```powershell
   supabase functions deploy create-teacher
   ```

5. In Supabase Authentication settings, enable email and add the deployed website URL to the allowed redirect URLs. Configure SMTP if invitations should arrive through your platform email provider.

The invitation function uses Supabase-provided environment values and the project service-role key only inside the Edge Function environment. Never add a service-role key to this package or website files.

The database migration adds invitation acceptance tracking and the `accept_teacher_invitation()` RPC. Teachers receive access only after accepting their Supabase email invitation and setting a password.

The `reports` and `analytics` permissions are independent. `reports` grants access to detailed student reports; `analytics` grants access only to aggregate school analytics.

To grant the platform owner account full access, first create `brraa.20@gmail.com` under Supabase Authentication, then run `owner-setup.sql` in the SQL Editor. The script creates or repairs the matching `profiles` row and reports the resulting role and permissions.

The `20261107130000_ensure_platform_owner_profile.sql` migration also enables the website to repair a missing owner profile after authentication. It only accepts a session whose Supabase Auth email exactly matches the configured platform owner email. Apply the migration before testing the updated website.
