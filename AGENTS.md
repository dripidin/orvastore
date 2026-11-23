# ORVA Store — Workspace Rules

## Production Hosting & Deployment (Hostinger)

- **Hosting Provider**: ORVA Store (`next-shadcn-admin-dashboard-baseui-main/`) is hosted on **Hostinger**, **not** Vercel.
- **Ignore Legacy Vercel Artifacts**: Disregard any leftover `.vercel/` directories, `VERCEL_*` environment variables, or globally installed Vercel deployment skills when advising on or executing deployments, domains, DNS, or production environment configuration for this workspace.
- **Deployment Flow**: Publish updates by committing and pushing verified changes to GitHub `origin/main` (`https://github.com/dripidin/orvastore.git`), from which Hostinger pulls and deploys.
- **Production Configuration & Tools**: Refer to Hostinger's environment variables panel and available Hostinger MCP tools (`hostinger-hosting`, `hostinger-dns`, `hostinger-domains`, `hostinger-vps`) rather than Vercel CLI or Vercel Dashboard.
- **Clean Git Pushes**: When pushing deployment updates to GitHub, stage only intended project files (`package.json`, `package-lock.json`, `src/`, `tests/`, etc.) and never commit local secrets or IDE/MCP artifacts (`.env*`, `.mcp.json`, `.cursor/`, `.vscode/`, `dashboard-template/`).
