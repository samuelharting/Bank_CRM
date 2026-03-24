/**
 * Express entrypoint — reuses every Azure Functions handler via the adapter
 * so the API can run on Railway / any Node.js host without modifying handler logic.
 *
 * The Azure Functions entrypoint (index.ts) remains intact for Azure deployments.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import cron from "node-cron";

import { adaptHandler } from "./expressAdapter.js";

// --- handler imports (all already exported) ---
import { healthcheck } from "./functions/healthcheck.js";
import { leads, leadActivities } from "./functions/leads.js";
import { contacts } from "./functions/contacts.js";
import { activities } from "./functions/activities.js";
import { search } from "./functions/search.js";
import { users } from "./functions/users.js";
import { devUsers } from "./functions/auth-dev.js";
import {
  dashboardStats,
  dashboardPipeline,
  dashboardLeaderboard,
  dashboardFeed,
  dashboardStaleLeads,
  dashboardFollowUps,
} from "./functions/dashboard.js";
import { notifications } from "./functions/notifications.js";
import { automations } from "./functions/automations.js";
import { emailSyncStatus, emailManualSync } from "./functions/email-sync.js";
import { leadDocumentsCollection, leadDocumentById, leadDocumentDownload } from "./functions/lead-documents.js";
import { importPreview, importExecute, importJobsList } from "./functions/lead-import.js";
import { aiPrepBrief } from "./functions/ai-prep.js";
import { mapLeads, geocodeBatch } from "./functions/map.js";
import {
  reportPipelineByOfficer,
  reportConversion,
  reportActivityVolume,
  reportStaleLeads,
} from "./functions/reports.js";
import { ticklersHandler, ticklerComplete, ticklerSnooze } from "./functions/ticklers.js";

// optional timer services — wrapped in try/catch so the server still starts
// if these modules have side-effects or missing env vars
let runTimerAutomations: (() => Promise<void>) | null = null;
let syncEmailsForAllUsers: (() => Promise<void>) | null = null;
try {
  const automationMod = await import("./services/automation.js");
  runTimerAutomations = automationMod.runTimerAutomations;
} catch {
  /* automation service unavailable */
}
try {
  const emailMod = await import("./services/email-sync.js");
  syncEmailsForAllUsers = emailMod.syncEmailsForAllUsers;
} catch {
  /* email sync service unavailable */
}

const app = express();
const PORT = process.env.PORT || 7071;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// --------------- middleware ---------------
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Dev-User-Id"],
    credentials: true,
  }),
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// --------------- routes ---------------
const r = express.Router();

// Healthcheck
r.get("/health", adaptHandler(healthcheck, "healthcheck"));
r.options("/health", adaptHandler(healthcheck, "healthcheck"));

// Auth — dev users
r.get("/auth/dev-users", adaptHandler(devUsers, "devUsers"));
r.options("/auth/dev-users", adaptHandler(devUsers, "devUsers"));

// Users
r.get("/users", adaptHandler(users, "users"));
r.options("/users", adaptHandler(users, "users"));

// Dashboard
r.get("/dashboard/stats", adaptHandler(dashboardStats, "dashboardStats"));
r.options("/dashboard/stats", adaptHandler(dashboardStats, "dashboardStats"));
r.get("/dashboard/pipeline", adaptHandler(dashboardPipeline, "dashboardPipeline"));
r.options("/dashboard/pipeline", adaptHandler(dashboardPipeline, "dashboardPipeline"));
r.get("/dashboard/leaderboard", adaptHandler(dashboardLeaderboard, "dashboardLeaderboard"));
r.options("/dashboard/leaderboard", adaptHandler(dashboardLeaderboard, "dashboardLeaderboard"));
r.get("/dashboard/feed", adaptHandler(dashboardFeed, "dashboardFeed"));
r.options("/dashboard/feed", adaptHandler(dashboardFeed, "dashboardFeed"));
r.get("/dashboard/stale-leads", adaptHandler(dashboardStaleLeads, "dashboardStaleLeads"));
r.options("/dashboard/stale-leads", adaptHandler(dashboardStaleLeads, "dashboardStaleLeads"));
r.get("/dashboard/follow-ups", adaptHandler(dashboardFollowUps, "dashboardFollowUps"));
r.options("/dashboard/follow-ups", adaptHandler(dashboardFollowUps, "dashboardFollowUps"));

// Leads
r.get("/leads", adaptHandler(leads, "leadsCollection"));
r.post("/leads", adaptHandler(leads, "leadsCollection"));
r.options("/leads", adaptHandler(leads, "leadsCollection"));
r.get("/leads/:id", adaptHandler(leads, "leadById"));
r.put("/leads/:id", adaptHandler(leads, "leadById"));
r.delete("/leads/:id", adaptHandler(leads, "leadById"));
r.options("/leads/:id", adaptHandler(leads, "leadById"));

// Lead activities
r.post("/leads/:id/activities", adaptHandler(leadActivities, "leadActivities"));
r.options("/leads/:id/activities", adaptHandler(leadActivities, "leadActivities"));

// Lead documents (multipart on POST)
r.get("/leads/:leadId/documents", adaptHandler(leadDocumentsCollection, "leadDocumentsCollection"));
r.post(
  "/leads/:leadId/documents",
  upload.single("file"),
  adaptHandler(leadDocumentsCollection, "leadDocumentsCollection"),
);
r.options("/leads/:leadId/documents", adaptHandler(leadDocumentsCollection, "leadDocumentsCollection"));
r.delete("/leads/:leadId/documents/:documentId", adaptHandler(leadDocumentById, "leadDocumentById"));
r.options("/leads/:leadId/documents/:documentId", adaptHandler(leadDocumentById, "leadDocumentById"));
r.get("/leads/:leadId/documents/:documentId/download", adaptHandler(leadDocumentDownload, "leadDocumentDownload"));
r.options("/leads/:leadId/documents/:documentId/download", adaptHandler(leadDocumentDownload, "leadDocumentDownload"));

// AI prep brief
r.post("/leads/:leadId/ai-brief", adaptHandler(aiPrepBrief, "aiPrepBrief"));
r.options("/leads/:leadId/ai-brief", adaptHandler(aiPrepBrief, "aiPrepBrief"));

// Contacts
r.get("/contacts", adaptHandler(contacts, "contactsCollection"));
r.post("/contacts", adaptHandler(contacts, "contactsCollection"));
r.options("/contacts", adaptHandler(contacts, "contactsCollection"));
r.get("/contacts/:id", adaptHandler(contacts, "contactById"));
r.put("/contacts/:id", adaptHandler(contacts, "contactById"));
r.delete("/contacts/:id", adaptHandler(contacts, "contactById"));
r.options("/contacts/:id", adaptHandler(contacts, "contactById"));

// Activities
r.get("/activities/calendar", adaptHandler(activities, "activitiesCalendar"));
r.options("/activities/calendar", adaptHandler(activities, "activitiesCalendar"));
r.get("/activities", adaptHandler(activities, "activitiesCollection"));
r.post("/activities", adaptHandler(activities, "activitiesCollection"));
r.options("/activities", adaptHandler(activities, "activitiesCollection"));
r.get("/activities/:id", adaptHandler(activities, "activityById"));
r.put("/activities/:id", adaptHandler(activities, "activityById"));
r.delete("/activities/:id", adaptHandler(activities, "activityById"));
r.options("/activities/:id", adaptHandler(activities, "activityById"));

// Ticklers
r.get("/ticklers", adaptHandler(ticklersHandler, "ticklersCollection"));
r.post("/ticklers", adaptHandler(ticklersHandler, "ticklersCollection"));
r.options("/ticklers", adaptHandler(ticklersHandler, "ticklersCollection"));
r.get("/ticklers/:id", adaptHandler(ticklersHandler, "ticklerById"));
r.put("/ticklers/:id", adaptHandler(ticklersHandler, "ticklerById"));
r.delete("/ticklers/:id", adaptHandler(ticklersHandler, "ticklerById"));
r.options("/ticklers/:id", adaptHandler(ticklersHandler, "ticklerById"));
r.post("/ticklers/:id/complete", adaptHandler(ticklerComplete, "ticklerComplete"));
r.options("/ticklers/:id/complete", adaptHandler(ticklerComplete, "ticklerComplete"));
r.post("/ticklers/:id/snooze", adaptHandler(ticklerSnooze, "ticklerSnooze"));
r.options("/ticklers/:id/snooze", adaptHandler(ticklerSnooze, "ticklerSnooze"));

// Search
r.post("/search", adaptHandler(search, "search"));
r.options("/search", adaptHandler(search, "search"));

// Notifications
r.get("/notifications/count", adaptHandler(notifications, "notificationsCount"));
r.options("/notifications/count", adaptHandler(notifications, "notificationsCount"));
r.put("/notifications/read-all", adaptHandler(notifications, "notificationsReadAll"));
r.options("/notifications/read-all", adaptHandler(notifications, "notificationsReadAll"));
r.get("/notifications", adaptHandler(notifications, "notificationsList"));
r.options("/notifications", adaptHandler(notifications, "notificationsList"));
r.put("/notifications/:id/read", adaptHandler(notifications, "notificationsRead"));
r.options("/notifications/:id/read", adaptHandler(notifications, "notificationsRead"));

// Automations
r.get("/automations/:id/logs", adaptHandler(automations, "automationLogs"));
r.options("/automations/:id/logs", adaptHandler(automations, "automationLogs"));
r.get("/automations", adaptHandler(automations, "automationsList"));
r.post("/automations", adaptHandler(automations, "automationsList"));
r.options("/automations", adaptHandler(automations, "automationsList"));
r.put("/automations/:id", adaptHandler(automations, "automationById"));
r.delete("/automations/:id", adaptHandler(automations, "automationById"));
r.options("/automations/:id", adaptHandler(automations, "automationById"));

// Email sync
r.get("/emails/sync-status", adaptHandler(emailSyncStatus, "emailSyncStatus"));
r.options("/emails/sync-status", adaptHandler(emailSyncStatus, "emailSyncStatus"));
r.post("/emails/manual-sync", adaptHandler(emailManualSync, "emailManualSync"));
r.options("/emails/manual-sync", adaptHandler(emailManualSync, "emailManualSync"));

// Import leads (multipart on POST preview)
r.post("/imports/leads/preview", upload.single("file"), adaptHandler(importPreview, "importPreview"));
r.options("/imports/leads/preview", adaptHandler(importPreview, "importPreview"));
r.post("/imports/leads/execute", adaptHandler(importExecute, "importExecute"));
r.options("/imports/leads/execute", adaptHandler(importExecute, "importExecute"));
r.get("/imports/jobs", adaptHandler(importJobsList, "importJobsList"));
r.options("/imports/jobs", adaptHandler(importJobsList, "importJobsList"));

// Map
r.get("/map/leads", adaptHandler(mapLeads, "mapLeads"));
r.options("/map/leads", adaptHandler(mapLeads, "mapLeads"));
r.post("/map/geocode", adaptHandler(geocodeBatch, "geocodeBatch"));
r.options("/map/geocode", adaptHandler(geocodeBatch, "geocodeBatch"));

// Reports
r.get("/reports/pipeline-by-officer", adaptHandler(reportPipelineByOfficer, "reportPipelineByOfficer"));
r.options("/reports/pipeline-by-officer", adaptHandler(reportPipelineByOfficer, "reportPipelineByOfficer"));
r.get("/reports/conversion", adaptHandler(reportConversion, "reportConversion"));
r.options("/reports/conversion", adaptHandler(reportConversion, "reportConversion"));
r.get("/reports/activity-volume", adaptHandler(reportActivityVolume, "reportActivityVolume"));
r.options("/reports/activity-volume", adaptHandler(reportActivityVolume, "reportActivityVolume"));
r.get("/reports/stale-leads", adaptHandler(reportStaleLeads, "reportStaleLeads"));
r.options("/reports/stale-leads", adaptHandler(reportStaleLeads, "reportStaleLeads"));

// mount router at /api to match Azure Functions host.json routePrefix
app.use("/api", r);

// --------------- cron (optional timer replacements) ---------------
if (runTimerAutomations) {
  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running automation engine...");
    try {
      await runTimerAutomations!();
    } catch (e) {
      console.error("[CRON] Automation engine error:", e);
    }
  });
}

if (syncEmailsForAllUsers) {
  cron.schedule("*/15 * * * *", async () => {
    console.log("[CRON] Running email sync...");
    try {
      await syncEmailsForAllUsers!();
    } catch (e) {
      console.error("[CRON] Email sync error:", e);
    }
  });
}

// --------------- start ---------------
app.listen(PORT, () => {
  console.log(`Deerwood CRM API (Express) running on port ${PORT}`);
});
