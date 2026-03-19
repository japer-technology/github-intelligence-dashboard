# 🖥️ github-intelligence-dashboard

Providing an account-wide GitHub Pages dashboard for active repositories that contain `.github-*-intelligence` or `.github-*-intelligences` folders.

## What this repository does

- Generates `docs/data/status.json` on a cron schedule or manual workflow run.
- Publishes a static GitHub Pages status site from `docs/`.
- Lists public repositories owned by the configured account that still have active intelligence folders.
- Gives **special attention** to the [`github-intelligence-emergency`](https://github.com/japer-technology/github-intelligence-emergency) repository, reporting on fail-safe status, trigger files, version, dry-run logs, and workflows.
- Maintains a rolling scan log (`docs/data/scan-log.json`) with the last 50 scan results for historical reference.

## Dashboard features

| Section | Description |
|---|---|
| **Summary bar** | Owner, active intelligence repo count, total public repos scanned, last generation timestamp (with relative time). |
| **🧩 Intelligence types** | Tile grid showing how many repos use each intelligence framework type (minimum, maximum, agenticana, etc.). |
| **🆘 Emergency Control** | Dedicated panel showing the emergency system's fail-safe state, disable/kill trigger presence, version, dry-run log count, and workflow file inventory. |
| **Search & filter** | Text search and intelligence-type dropdown to quickly narrow down the repo grid. |
| **Active repositories** | Grid of repo cards with intelligence folder names, workflow files, activity freshness badge, latest workflow run status, and last push date. The emergency repo is highlighted with a special badge and border. |
| **📋 Scan log** | Table of the last 50 scan runs with timestamps, repo counts, emergency status, and fail-safe state history. |
| **Auto-refresh** | Dashboard re-fetches data every 5 minutes with a visible countdown timer. |

## Workflow

The workflow at `.github/workflows/update-dashboard.yml`:

1. Runs every hour and on manual dispatch.
2. Checks the last 10 completed runs; if all 10 failed the workflow disables itself to prevent wasted Actions minutes. Re-enable it manually via `gh workflow enable update-dashboard.yml` after fixing the underlying issue.
3. Calls `scripts/generate-dashboard-data.sh` which:
   - Scans all public repos for the owner.
   - Identifies repos with `.github-*-intelligence` or `.github-*-intelligences` folders.
   - Queries `github-intelligence-emergency` for detailed emergency system status.
   - Appends an entry to the scan log.
4. Commits refreshed dashboard data (both `status.json` and `scan-log.json`) when changes are detected.
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
OWNER=japer-technology OUTPUT_PATH=docs/data/status.json SCAN_LOG_PATH=docs/data/scan-log.json bash scripts/generate-dashboard-data.sh
```

Then serve `docs/` with a local static file server to preview the site.
