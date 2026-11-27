# Study Case Manager

Study Case Manager connects student and staff records, classroom operations, academic reporting, and three AI workflows for schools and tuition centres. The administrator and staff portals are served by Next.js. Supabase persists institutional records and enforces tenant and teaching-assignment access. A separate FastAPI service runs the GPT‑4o mini workflows and hands background work to Celery.

## Run the web app

Use Node.js 22.14 or later.

```sh
npm ci
npm run dev
```

Open [the local application](http://localhost:3000). **Explore the demo** opens a fictional institution. Demo edits stay in the current browser. Admin and staff sign-in routes require a configured Supabase project. Live AI and delivery integrations are available in a configured institutional workspace.

## Configure an institution

1. Copy `.env.example` to `apps/web/.env.local` and `apps/ai-service/.env`. Fill only the variables each service needs. Keep server credentials out of client bundles and source control.
2. Start Supabase CLI with Docker for local development, or apply `supabase/migrations/` to a hosted Supabase project. `supabase db reset` is suitable for an expendable local project only. The development seed has fictional contacts and no Auth users.
3. In Auth, disable signup and anonymous sign-in. Add the site URL and `/auth/confirm` redirect. Install the supplied password recovery and invite templates. Use verified addresses and an institutional SMTP sender.
4. Create the initial verified administrator in Supabase Auth. Run [the administrator bootstrap script](supabase/bootstrap-admin.sql) after replacing the example values. Use the Admin portal to create academic years, batches, staff, subjects, and teaching assignments.
5. From `apps/ai-service`, install `requirements.txt`, provision Redis and the database role, and initialize the LangGraph checkpointer.

```sh
python -m pip install -r requirements.txt
python -c "from app.workflows import initialize_checkpoints; initialize_checkpoints()"
uvicorn app.main:app --port 8000
```

Run one Celery worker and one Celery Beat instance in separate terminals. On Windows, use `--pool=solo` for the local worker.

```sh
celery -A app.worker:celery worker --loglevel=INFO
celery -A app.worker:celery beat --loglevel=INFO
```

6. Set the same random `INTERNAL_API_SECRET` on Next.js and FastAPI. Add the OpenAI key to FastAPI, enable AI under institutional settings, and configure the provider and webhook credentials when ready. Role and consent checks also apply when providers are configured.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
cd apps/ai-service
python -m pytest -q
```

Install the Playwright Chromium browser with `npx playwright install chromium` or set `PLAYWRIGHT_CHROMIUM_PATH` to an installed Chromium binary. Browser tests use local demonstration data. [Database checks](supabase/tests/academic.sql) exercise cross-institution access, staff authorization, enrollment, timetable conflicts, idempotent sessions, syllabus updates, and score limits. Run them as the database owner against a disposable Supabase-compatible database.

## Deployment

[Deployment and operations](docs/deployment.md) covers Supabase, Vercel, Railway or Render, Redis, Meta, Resend, and a controlled integration check for each provider.

