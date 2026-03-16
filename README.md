# github-intelligence-dashboard

Providing an account-wide GitHub Pages dashboard for active repositories that contain `.github-*-intelligence` or `.github-*-intelligences` folders.

## What this repository now does

- Generates `docs/data/status.json` on a cron schedule or manual workflow run.
- Publishes a static GitHub Pages status site from `docs/`.
- Lists public repositories owned by the configured account that still have active intelligence folders.

## Workflow

The workflow at `.github/workflows/update-dashboard.yml`:

1. Runs every 30 minutes and on manual dispatch.
2. Calls `scripts/generate-dashboard-data.sh`.
3. Commits refreshed dashboard data when it changes.
4. Deploys the `docs/` folder to GitHub Pages.

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
