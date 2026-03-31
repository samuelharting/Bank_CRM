import { USER_ROLES } from "../../types";
import type { DemoStep } from "../types";

const IMPORT_ROLES = [USER_ROLES.ADMIN, USER_ROLES.BRANCH_MANAGER, USER_ROLES.EXECUTIVE];

export const importSteps: DemoStep[] = [
  {
    id: "import-intro",
    module: "import",
    title: "Import Leads",
    body: "The Import tool lets you bring leads into the CRM from CSV spreadsheets. Upload a file, map the columns, assign a rep, and import — all in one smooth flow.",
    requiredRoles: IMPORT_ROLES,
    beforeShow: [
      { type: "navigate", value: "/import/leads" },
      { type: "wait", value: "500" },
    ],
  },
  {
    id: "import-upload",
    module: "import",
    title: "Upload CSV",
    body: "Drag and drop a CSV file here, or click to browse. The system reads the file and shows you a preview of the first few rows before importing anything.",
    target: "import-upload",
    placement: "bottom",
    requiredRoles: IMPORT_ROLES,
  },
  {
    id: "import-mapping",
    module: "import",
    title: "Field Mapping",
    body: "After uploading, you map each CSV column to a CRM field. The system auto-guesses common headers like \"First Name\", \"Email\", \"Company\" — adjust any that don't match.",
    target: "import-mapping",
    placement: "top",
    requiredRoles: IMPORT_ROLES,
    skipIf: "[data-demo='import-mapping']",
  },
  {
    id: "import-assignee",
    module: "import",
    title: "Assign Imported Leads",
    body: "Choose which rep the imported leads should be assigned to. You can also set a default branch and source for the entire batch.",
    target: "import-assignee",
    placement: "bottom",
    requiredRoles: IMPORT_ROLES,
    skipIf: "[data-demo='import-assignee']",
  },
  {
    id: "import-execute",
    module: "import",
    title: "Execute Import",
    body: "After reviewing the preview, this button runs the import and reports successes and errors. In read-only demo mode, we spotlight the action without executing it.",
    target: "import-execute",
    placement: "top",
    requiredRoles: IMPORT_ROLES,
    skipIf: "[data-demo='import-execute']",
  },
  {
    id: "import-history",
    module: "import",
    title: "Import History",
    body: "Previous imports are listed here with job ID, timestamp, row counts, and success/error breakdown. Click any job to see the detailed results.",
    target: "import-history",
    placement: "top",
    requiredRoles: IMPORT_ROLES,
    skipIf: "[data-demo='import-history']",
  },
  {
    id: "import-done",
    module: "import",
    title: "Import Complete",
    body: "That's the Import flow! Next let's look at the Reports module.",
    requiredRoles: IMPORT_ROLES,
  },
];
