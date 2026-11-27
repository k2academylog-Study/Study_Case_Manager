# Deployment and operations

## Supabase

- Apply migrations in timestamp order using a linked Supabase CLI project and `supabase db push`. Use a separate project for staging. Seed development data only in a development project.
- In Auth, set the HTTPS web origin as the Site URL, allow `/auth/confirm`, disable public and anonymous registration, and configure institutional SMTP. Use [the checked-in email templates](../supabase/templates) for invite and recovery links.
- Create the verified initial administrator in Auth, then run [the administrator bootstrap](../supabase/bootstrap-admin.sql). For staff access, open Staff → Invite staff account, select the staff record and choose Grant staff access. New users receive a setup email. An existing verified sign-in can be connected if it has no institutional membership. Each sign-in belongs to one profile. Deactivating the staff record blocks application and RLS access.
- Preserve private `academic-reports` and `academic-files` storage buckets. Downloads use signed URLs with a 60-second lifetime. Keep `scm_agent` out of the API’s exposed schemas. The notifications table joins the Supabase Realtime publication.
- Use [the AI service role script](../supabase/ai-role.sql) in the SQL editor. Set a strong password through a protected channel. Use a TLS-verified direct or session-pooler `DATABASE_URL` for that role.

[Supabase server-side authentication](https://supabase.com/docs/guides/auth/server-side)

## Vercel

Import the repository as one project. Set the Vercel Root Directory to the repository root. The root [vercel.json](../vercel.json) defines the Next.js web service and the FastAPI AI service. Vercel discovers the FastAPI application in `apps/ai-service/app/main.py`.

The public domain serves Next.js, including the authenticated `/api/ai/*` proxy. Only the exact WhatsApp and email callback paths listed below route directly to FastAPI. All other FastAPI routes, including `/health` and `/api/v1/internal/delivery-tick`, are accessible through the internal service network. Webhook providers must be able to reach their registered callbacks through any deployment protection configured on the domain.

Vercel injects `AI_SERVICE_URL` into the web service at request time. Leave this variable out of the dashboard and environment files. For standalone Next.js and Uvicorn development, `AI_BACKEND_URL` supplies the local backend URL. Run `vercel dev --local` from the repository root to test both services with a generated binding.

Configure the public HTTPS origin in `NEXT_PUBLIC_APP_URL` and the Supabase Auth redirect settings. Provide the Supabase URL and publishable key, the service-role key for web account administration, and a shared `INTERNAL_API_SECRET` for the web proxy and FastAPI. Configure the database, Redis, OpenAI and messaging credentials used by FastAPI and the worker for the same deployment environment. Initialize the LangGraph checkpoint tables once before enabling communication. Use separate staging credentials for previews.

[Vercel Services](https://vercel.com/docs/services) · [Service bindings](https://vercel.com/docs/services/bindings)

## External Celery worker and scheduler

Use the Python dependencies or Docker image in `apps/ai-service` on a long-running worker host. From that directory run `celery -A app.worker:celery worker --loglevel=INFO` and exactly one scheduler running `celery -A app.worker:celery beat --loglevel=INFO`. Point both processes and FastAPI at the same persistent Redis broker and database. Beat enqueues delivery ticks directly. This Vercel configuration uses Beat for scheduling and keeps the optional Supabase Cron HTTP endpoint private.

[LangGraph human approval](https://docs.langchain.com/oss/python/langgraph/interrupts)

## Messaging

**WhatsApp**. Configure a Meta business account and approved messaging phone number. Set the supported Graph API version, business account ID, phone number ID, access token, App Secret, and verification token. Subscribe the FastAPI webhook at `/api/v1/webhooks/whatsapp` to message status events. Register the exact body of each approved Meta template in the Communication workspace. The application checks the template against Meta and supports positional body variables.

**Email**. Verify the institutional sender domain at Resend. Configure the API key and sender address. Set `/api/v1/webhooks/email` for sent, delivered, bounced and failed events, then store the signing secret as `EMAIL_WEBHOOK_SECRET`.

**Controlled test**. Use a staging institution with one approved institutional test recipient per channel. Enter that recipient’s confirmed address and consent, generate a preview, approve the exact preview, and queue it. Confirm that a provider ID appears and that the resulting webhook updates delivery. Verify cancellation before a scheduled run. A WhatsApp timeout can leave an uncertain result. Reconcile it with provider records before approving any replacement. Email retries reuse the same Resend idempotency key within its provider window.

[Meta webhook signing](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/) · [Meta templates](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-hsm) · [Resend idempotency](https://resend.com/changelog/idempotency-keys)

## Data handling and recovery

- Use a separate Supabase project and recipient list for staging. Restrict service credentials to deployment operators. Treat reporting exports as confidential.
- Match institution retention policy to the database and Storage backup plan. Set the retention period in the application and arrange institution-specific removal or anonymization through database operations. Confirm legal holds and record dependencies before deletion. LangGraph checkpoints and external delivery history require their own retention configuration.
- Use Supabase database backups or point-in-time recovery where the institution’s plan provides them. Back up private Storage objects separately and verify their link to report metadata after restoring to a staging project. Run the academic smoke checks and verify roles after a restore.
- Monitor failed and uncertain messages, worker lag, out-of-scope access errors, and AI usage. The application records normalized score and attendance evidence. Staff observations and AI recommendations require human academic review.

[Supabase database backups](https://supabase.com/docs/guides/platform/backups)

