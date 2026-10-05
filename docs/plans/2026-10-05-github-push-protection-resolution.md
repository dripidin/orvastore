# GitHub Push Protection Resolution & Clean Vercel Deployment Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve GitHub Push Protection error GH013 by completely removing the hardcoded Vercel personal access token from git history and code, moving it to environment variables, and pushing cleanly to `https://github.com/dripidin/orvastore.git` to enable automatic Vercel production deployment.

**Architecture:**
- **Security Root Cause:** Commits `d966055` and `e7de82e` contained a raw Vercel token (`vcp_REDACTED_SECRET_TOKEN`) in `lib/vercelAnalytics.js` and in the commit log message. GitHub Push Protection blocked the remote push.
- **Safe History Remediation:** Perform a non-destructive soft reset to `5247a8a` (preserving 100% of working files and unstaged/staged code), sanitize `lib/vercelAnalytics.js` to read from `process.env.VERCEL_TOKEN`, and re-commit cleanly without any secrets.
- **Environment Separation:** Store `VERCEL_TOKEN` strictly in `.env.local` (ignored by git) and in Vercel Project Settings for production runtime.

**Tech Stack:**
- **Git & GitHub:** Git 2.x, GitHub Push Protection, GitHub CLI/Web
- **Deployment:** Vercel Hosting (`prj_ksaHHrLK9XTUAHNe37wPcgEqaJ1L`), Vercel Environment Variables
- **Codebase:** Node.js Serverless Functions, Vanilla JS frontend

---

### Task 1: Sanitize `lib/vercelAnalytics.js` Code

**Files:**
- Modify: `d:/Websites On Line/yamahasac/lib/vercelAnalytics.js:7`

**Step 1: Check `lib/vercelAnalytics.js:7`**

Current code:
```javascript
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || 'vcp_REDACTED_SECRET_TOKEN';
```

**Step 2: Replace hardcoded fallback with safe empty string**

Change to:
```javascript
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '';
```

**Step 3: Add token to `.env.local` for local execution**

Add to `d:/Websites On Line/yamahasac/.env.local`:
```env
VERCEL_TOKEN=vcp_REDACTED_SECRET_TOKEN
```
*(Verify `.env.local` is present in `.gitignore` to guarantee it is never tracked).*

---

### Task 2: Purge Secret from Local Git History (Soft Reset & Re-commit)

**Files:**
- Git repository history (`d:/Websites On Line/yamahasac/.git`)

**Step 1: Soft reset back to `5247a8a`**

Run:
```bash
git reset --soft 5247a8a
```
*Note: `--soft` leaves all files, changes, pack pages, and optimizations completely untouched in the staging area.*

**Step 2: Verify git status**

Run:
```bash
git status -s
```
Expected: All files intact, ready to be committed without secrets.

**Step 3: Create Clean Commit 1 — Vercel Analytics Engine**

```bash
git add lib/vercelAnalytics.js admin.js admin.html admin.css
git commit -m "feat(analytics): integrate Vercel Web Analytics telemetry engine using environment variables"
```

**Step 4: Create Clean Commit 2 — Pack 1 and Pack 2 Landing Pages & Backend Integration**

```bash
git add api/send-order.js vercel.json pack1.html pack2.html packs-client.js packs-config.js packs-styles.css "pack 1 4950" "pack2 12950" "images products" docs scripts/test-order-pack.js data/excel
git commit -m "feat(packs): add and integrate Pack 1 and Pack 2 landing pages with 58 wilayas, live order dispatch, and Google Sheets sync"
```

**Step 5: Verify no secrets remain in Git History**

Run:
```bash
git log --grep="vcp_" -n 5
git log -p -S "vcp_REDACTED" -n 5
```
Expected: Zero matches found.

---

### Task 3: Push to GitHub & Verify Vercel Deployment

**Files:**
- Remote: `https://github.com/dripidin/orvastore.git`

**Step 1: Execute Git Push to GitHub**

Run:
```bash
git push -u origin main
```
Expected:
```
Writing objects: 100% ...
To https://github.com/dripidin/orvastore.git
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```

**Step 2: Verify live deployment**
- Check GitHub repository page: `https://github.com/dripidin/orvastore`
- Check Vercel build status at: `https://vercel.com/`
- Test live URLs:
  - `https://yamahasac.vercel.app/pack1`
  - `https://yamahasac.vercel.app/pack2`
  - `https://yamahasac.vercel.app`
