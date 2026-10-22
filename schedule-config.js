/* ============================================================
   LIVE SYNC for the Project Schedule page.
   "auto" = use this site's own /api/schedule (Vercel + Upstash Redis).
   If the database is not connected yet, the site silently uses
   project-schedule.js instead, so nothing breaks.
   See SETUP-LIVE-SYNC.md for the 5-minute setup.
   ============================================================ */
window.PROJECT_SCHEDULE_API = "auto";
