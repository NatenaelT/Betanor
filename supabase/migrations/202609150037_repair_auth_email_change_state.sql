-- Keep Supabase Auth's internal email-change fields in the values expected by GoTrue.
-- The demo-domain migration previously wrote NULL into these nullable columns;
-- GoTrue scans them as strings/integers while authenticating and fails on NULL.

update auth.users
set email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    email_change_confirm_status = coalesce(email_change_confirm_status, 0)
where email_change is null
   or email_change_token_new is null
   or email_change_token_current is null
   or email_change_confirm_status is null;
