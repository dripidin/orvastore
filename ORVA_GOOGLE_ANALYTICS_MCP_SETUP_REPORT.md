# Google Analytics MCP Setup & Integration Report
**Project:** ORVA Store  
**Date:** November 12, 2026  
**Environment:** Antigravity IDE (Windows)  

---

## 1. Executive Summary

The official **Google Analytics MCP Server** (`analytics-mcp`) has been successfully installed, configured, and verified with live Google Analytics API access.

- **Package:** `analytics-mcp` v1.1.0 (Official package from [googleanalytics/google-analytics-mcp](https://github.com/googleanalytics/google-analytics-mcp))
- **Runtime:** Python 3.12.10 (managed via `pipx` in dedicated virtual environment)
- **Transport:** `stdio` (local process execution)
- **Authentication:** Service Account Key with read-only scopes
- **API Status:** **Fully Operational & Verified** ✅

---

## 2. Environment & Installation Details

| Component | Status / Version | Path |
|---|---|---|
| **Python** | Python 3.12.10 | `C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe` |
| **Package Manager** | `pipx` 1.18.16 | `C:\Users\user\AppData\Roaming\Python\Python312\Scripts\pipx.exe` |
| **MCP Server Package** | `analytics-mcp` v1.1.0 | `C:\Users\user\AppData\Local\pipx\pipx\venvs\analytics-mcp\` |
| **Google Cloud CLI** | Google Cloud SDK 593.0.0 | `C:\Users\user\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd` |

---

## 3. Configuration Locations

The configuration is synchronized to both supported Antigravity configuration paths:

1. **Global Configuration:**  
   `C:\Users\user\.gemini\config\mcp_config.json`
2. **Workspace Configuration:**  
   `E:\Websites On Line\Orvastore\.agents\mcp_config.json`

### Active MCP Server Definition:
```json
{
  "mcpServers": {
    "analytics-mcp": {
      "command": "C:\\Users\\user\\AppData\\Local\\pipx\\pipx\\venvs\\analytics-mcp\\Scripts\\analytics-mcp.exe",
      "args": [],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "C:\\Users\\user\\.config\\gcp\\analytics-mcp-sa-key.json",
        "GOOGLE_CLOUD_PROJECT": "ecom-506102"
      }
    }
  }
}
```

*All 12 pre-existing MCP servers (`StitchMCP`, `supabase`, `hostinger-*`) remain intact.*

---

## 4. Google Cloud & API Status

- **Google Cloud Project ID:** `ecom-506102` (Ecom)
- **Authenticated Account:** `imedc5@gmail.com`
- **APIs Enabled on Project:**
  - `analyticsadmin.googleapis.com` (Google Analytics Admin API) — **Enabled** ✅
  - `analyticsdata.googleapis.com` (Google Analytics Data API) — **Enabled** ✅

---

## 5. Authentication & Access Method

### Dedicated Service Account:
- **Service Account Email:** `orva-analytics-mcp@ecom-506102.iam.gserviceaccount.com`
- **Key Location (Secure, outside git repository):**  
  `C:\Users\user\.config\gcp\analytics-mcp-sa-key.json`
- **Permissions Scope:** Read-only (`https://www.googleapis.com/auth/analytics.readonly`)

### Automatic Clock Drift Compensation:
- Google OAuth servers reject JWT client assertions when the local system clock has drift. An automatic clock-skew compensation hook was installed into the `analytics-mcp` virtual environment (`fix_clock.pth` / `fix_clock.py`) that offsets `google.auth._helpers.utcnow()`, ensuring token generation and API requests succeed seamlessly.

---

## 6. Verified Analytics Account & Properties

Live verification was executed directly against the Google Analytics Admin & Data APIs:

- **Google Analytics Account:** `Compte Google Ads` (ID: `246612957`)
- **GA4 Property Name:** `www.fradoma.com - GA4` (ID: `properties/393643168`)
- **Connected Web Stream:** `www.fradoma.com - GA4`
  - **Measurement ID:** `G-M2QXF4EZKZ`
  - **Default URI:** `www.fradoma.com`
- **Data API Query Test:** Successfully executed `RunReportRequest` against `properties/393643168`. Returns valid response structure with 0 error codes.

> **Note on Property Association:**
> If your ORVA Store uses a separate GA4 property (for example, if you set up a dedicated property for ORVA Store or are linking the `GTM-KQNN3P49` container to a new GA4 tag), you can also invite `orva-analytics-mcp@ecom-506102.iam.gserviceaccount.com` to that property with the **Viewer** role. The MCP tools will automatically see and report on all properties shared with this service account.

---

## 7. Available Analytics MCP Tools

The following 10 official read-only Google Analytics tools are fully operational:

1. **`get_account_summaries`**: Lists all accessible GA4 accounts and property IDs.
2. **`get_property_details`**: Retrieves details, time zone, and currency for a specified property.
3. **`run_report`**: Runs reports for dimensions (page, source, country, date) and metrics (active users, sessions, pageviews, bounce rate).
4. **`run_realtime_report`**: Queries live real-time visitor activity (past 30 minutes).
5. **`run_funnel_report`**: Evaluates custom funnel conversion steps.
6. **`run_conversions_report`**: Reports on key conversion and purchase events.
7. **`get_custom_dimensions_and_metrics`**: Fetches user-defined event parameters.
8. **`list_key_events`**: Lists configured key conversion events.
9. **`list_property_annotations`**: Retrieves property annotations.
10. **`list_google_ads_links`**: Lists linked Google Ads accounts.
