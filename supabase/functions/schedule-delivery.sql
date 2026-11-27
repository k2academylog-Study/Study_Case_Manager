-- Optional hosted Supabase Cron alternative to Celery Beat.
-- Enable pg_cron and pg_net, then create Vault secrets scm_ai_url and scm_internal_secret.
-- scm_ai_url is the HTTPS FastAPI origin. Run this script as a privileged database operator.
select cron.schedule('scm-delivery-tick','* * * * *',$cron$
  select net.http_post(
    url:=(select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='scm_ai_url')||'/api/v1/internal/delivery-tick',
    headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',
      (select decrypted_secret from vault.decrypted_secrets where name='scm_internal_secret')),
    body:='{}'::jsonb,
    timeout_milliseconds:=10000
  );
$cron$);
