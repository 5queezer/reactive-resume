# E2E Tests Design

## Context

Reactive Resume is a pnpm/Turborepo monorepo with two deployable apps:

- `apps/web`: TanStack Start / React / Vite user interface.
- `apps/server`: Hono / Node.js server that owns API, auth, MCP, static uploads, OpenAPI, and production web serving.

The product is a resume builder. The highest-value browser journeys are:

1. Create an account and authenticate.
2. Create a resume from the dashboard.
3. Open the builder and edit resume basics.
4. Persist builder edits through autosave.
5. Export and import structured resume JSON.
6. Enable public sharing and view the resume as an anonymous visitor.

The repository currently has broad Vitest coverage but no Playwright or Cypress harness. GitHub Actions currently runs autofix/lint behavior on PRs and Docker image publishing on pushes/tags, but no PR-gated E2E workflow.

Context7 was requested for current framework guidance, but the configured Context7 quota was exhausted in this environment. The implementation plan should re-check current Playwright docs when Context7 access is available.

## Goals

- Add a working Playwright E2E setup.
- Run E2E tests against the production build path, not only Vite dev mode.
- Use ephemeral accounts and data for each run.
- Cover deterministic core UX flows on every PR.
- Keep CI runtime and flake risk low enough for a default PR gate.
- Leave room to add PDF, DOCX, OAuth, passkey, 2FA, and AI flows later without bloating the initial gate.

## Non-goals

- Do not add PDF or DOCX download validation to the initial PR gate.
- Do not automate OAuth, passkeys, 2FA, or password reset in the first suite.
- Do not include AI Agent, AI import, or resume analysis flows in the first suite.
- Do not add a cross-browser matrix initially.
- Do not assert pixel-perfect PDF/canvas rendering.

## Recommended approach

Use a root-level Playwright harness that runs Chromium against a production build:

1. CI installs dependencies and Playwright Chromium.
2. CI starts PostgreSQL.
3. CI sets test environment variables.
4. CI builds the app with `pnpm build`.
5. Playwright starts the production server with `pnpm start`.
6. E2E specs exercise browser flows against `APP_URL`.

Use hybrid fixtures:

- The auth smoke test registers and logs in through the browser UI.
- Non-auth specs create ephemeral users and authenticated browser state through test helpers.
- Resume setup can use helper APIs or direct database helpers when the setup itself is not the behavior under test.
- Each test uses unique data and cleans up its own ephemeral user.

This keeps the suite close to user reality while avoiding repeated slow setup in every test.

## File layout

Add:

- `playwright.config.ts`
- `tests/e2e/README.md`
- `tests/e2e/fixtures/test.ts`
- `tests/e2e/fixtures/auth.ts`
- `tests/e2e/fixtures/db.ts`
- `tests/e2e/fixtures/resume.ts`
- `tests/e2e/specs/auth.spec.ts`
- `tests/e2e/specs/resume-lifecycle.spec.ts`
- `tests/e2e/specs/json-export-import.spec.ts`
- `tests/e2e/specs/public-sharing.spec.ts`
- `.github/workflows/e2e.yml`

Update:

- root `package.json` scripts
- `turbo.json` tasks, if root scripts are routed through Turbo
- lockfile after adding Playwright
- contributing docs if a short root README is not enough

## Playwright configuration

The initial config should:

- Use Chromium only.
- Read `baseURL` from `APP_URL`, defaulting to `http://localhost:3000`.
- Use traces, screenshots, and videos on failure.
- Use a local-friendly reporter plus a CI reporter/artifact format.
- Start `pnpm start` through `webServer`.
- Reuse an existing local server outside CI when possible.
- Prefer role, label, and accessible-name locators.
- Add targeted `data-testid` attributes only when accessibility locators are not stable enough.

Recommended root scripts:

- `test:e2e`: run Playwright.
- `test:e2e:ui`: run Playwright UI mode.
- `test:e2e:ci`: run Playwright with CI reporter settings.

## Environment and infrastructure

Minimum E2E environment:

- `APP_URL=http://localhost:3000`
- `PORT=3000`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres`
- `AUTH_SECRET=<non-empty test secret>`
- `FLAG_DISABLE_SIGNUPS=false`
- `FLAG_DISABLE_EMAIL_AUTH=false`
- `FLAG_DISABLE_API_RATE_LIMIT=true`
- `LOCAL_STORAGE_PATH=<absolute temp path>`

S3, Redis, SMTP, and AI provider variables are not required for the initial deterministic suite.

PostgreSQL should be isolated for CI runs. The simplest PR workflow can use a GitHub Actions Postgres service container and a clean database per job. Local development can use `compose.dev.yml` to start Postgres.

## Ephemeral data strategy

Each worker/test should generate unique identities:

- Email: `e2e-<runId>-<worker>-<suffix>@example.test`
- Username: `e2e_<runId>_<worker>_<suffix>`
- Resume names/slugs prefixed with `e2e-`

Cleanup should delete the ephemeral user and rely on database cascade relationships for related resumes, sessions, accounts, API keys, and related records.

Use helper setup where it improves speed and stability:

- Create authenticated storage state for non-auth specs.
- Create seeded resumes for tests that are about builder/export/sharing behavior rather than resume creation.
- Keep one browser-driven auth spec to ensure registration/login still works end to end.

## Initial PR-gated specs

### Auth smoke

Flow:

1. Visit `/auth/register`.
2. Register a unique user through the UI.
3. Continue to `/dashboard`.
4. Log out.
5. Log in with the same credentials.
6. Assert the dashboard resumes page loads.

Purpose:

- Proves email/password auth, session cookies, redirects, and dashboard access work.

### Resume lifecycle

Flow:

1. Start authenticated as an ephemeral user.
2. Visit `/dashboard/resumes`.
3. Create a sample resume through the UI.
4. Open the resume in the builder.
5. Edit the basics name field.
6. Wait for autosave.
7. Reload the builder.
8. Assert the edited value persisted.

Purpose:

- Proves dashboard create, builder load, form editing, API update, and autosave persistence.

### JSON export and import

Flow:

1. Start authenticated with a sample resume.
2. Open the builder.
3. Export JSON.
4. Assert a JSON download is created and parseable.
5. Return to dashboard.
6. Import the downloaded JSON through the import dialog.
7. Assert the imported resume opens in the builder.

Purpose:

- Proves deterministic backup/restore without AI or binary rendering dependencies.

### Public sharing

Flow:

1. Start authenticated with a sample resume.
2. Open builder sharing settings.
3. Enable public access.
4. Read the generated public URL.
5. Open a fresh unauthenticated browser context.
6. Visit the public URL.
7. Assert the public resume viewer renders expected resume content.

Purpose:

- Proves sharing state updates, public routing, anonymous access, and public resume rendering.

## CI workflow

Add `.github/workflows/e2e.yml`:

- Trigger on `pull_request` and pushes to `main`.
- Use Node 24.
- Use pnpm via Corepack or `pnpm/action-setup`.
- Cache pnpm dependencies through `actions/setup-node`.
- Start PostgreSQL service.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Install Playwright Chromium.
- Run `pnpm build`.
- Run `pnpm test:e2e:ci`.
- Upload Playwright reports, traces, screenshots, and videos on failure.

The workflow should avoid secrets. All test credentials should be generated during the run.

## Selector strategy

Prefer stable user-facing locators:

- Roles: buttons, links, dialogs, textboxes, comboboxes.
- Labels: form inputs and switches.
- URLs: route assertions after navigation.

Add `data-testid` only where necessary:

- Builder canvas/PDF viewer surfaces that lack accessible names.
- Download/import controls if file input access is otherwise too implementation-dependent.
- Toast-independent save-state assertions if no visible stable status exists.

Keep test IDs narrow and product-neutral.

## Reliability considerations

- Autosave currently debounces changes by 500ms. Tests should wait for persisted state through reload or API-visible state, not arbitrary sleeps.
- Public resume viewer uses browser PDF/canvas behavior. Assert meaningful content or viewer presence, not pixels.
- JSON export/import is deterministic and should be the first export/import loop.
- Disable API rate limiting in test env to avoid worker-order flakes.
- Pin locale to the default English path or use role/label selectors robust to translations where practical.
- Keep the initial suite serial only where shared worker state forces it; otherwise allow Playwright worker isolation.

## Future expansion

After the initial suite is stable:

1. Add PDF download validation as a separate optional or nightly job.
2. Add DOCX download validation if the PDF job proves stable.
3. Add password-protected public sharing.
4. Add dashboard management flows: duplicate, lock, delete, tag filtering, list/grid view.
5. Add settings flows: profile update, API key creation/deletion.
6. Add AI flows only with mocked providers or a deterministic local provider.
7. Add browser matrix only after the Chromium gate has low flake rates.

## Success criteria

- `pnpm test:e2e` runs locally against a built app and Postgres.
- `pnpm test:e2e:ci` runs in GitHub Actions on every PR.
- Tests create no persistent shared seed data.
- Tests clean up ephemeral users and related data.
- The initial suite covers auth, dashboard creation, builder autosave, JSON export/import, and public sharing.
- CI uploads useful artifacts for diagnosing failures.
