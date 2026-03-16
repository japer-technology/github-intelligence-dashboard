# github-intelligence-dashboard

Providing an account-wide GitHub Pages dashboard for active repositories that contain `.github-*-intelligence` or `.github-*-intelligences` folders.

## What this repository now does

- Generates `docs/data/status.json` on a cron schedule or manual workflow run.
- Publishes a static GitHub Pages status site from `docs/`.
- Lists public repositories owned by the configured account that still have active intelligence folders.

## Workflow

The workflow at `.github/workflows/update-dashboard.yml`:

1. Runs every hour and on manual dispatch.
2. Checks the last 10 completed runs; if all 10 failed the workflow disables itself to prevent wasted Actions minutes. Re-enable it manually via `gh workflow enable update-dashboard.yml` after fixing the underlying issue.
3. Calls `scripts/generate-dashboard-data.sh`.
4. Commits refreshed dashboard data when it changes.
5. Deploys the `docs/` folder to GitHub Pages.

## Authentication

The data generator supports:

- `INTELLIGENCE_DASHBOARD_TOKEN`
- `INTELLIGENCE_EMERGENCY_TOKEN`
- the repository `GITHUB_TOKEN`

Only **public repositories** are written into the published dashboard data so the GitHub Pages site does not leak private repository names.

## Local refresh

From the repository root:

```bash
OWNER=japer-technology OUTPUT_PATH=docs/data/status.json bash scripts/generate-dashboard-data.sh
```

Then serve `docs/` with a local static file server to preview the site.
