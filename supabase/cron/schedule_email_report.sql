create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'REPLACE_WITH_KAPOK_EMAIL_CRON_SECRET',
  'kapok_email_cron_secret',
  'Authorization token for the Kapok twice-daily email report'
);

select cron.schedule(
  'kapok-email-report-twice-daily',
  '0 0,12 * * *',
  $job$
    select net.http_post(
      url := 'https://arofxbakiefibzkzdgiq.supabase.co/functions/v1/kapok-email-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'kapok_email_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);

