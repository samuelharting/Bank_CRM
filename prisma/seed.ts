import { PrismaClient, AutomationAction, AutomationTrigger, ActivityType, LeadSource, LeadStatus, TicklerRecurrence, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const demoUsers = [
  { displayName: "Karen Holtz", email: "karen.holtz@deerwoodbank.com", role: UserRole.EXECUTIVE, branch: null, entraId: "demo-karen-exec" },
  { displayName: "Mike Sorensen", email: "mike.sorensen@deerwoodbank.com", role: UserRole.ADMIN, branch: null, entraId: "demo-mike-admin" },
  { displayName: "Lisa Brandt", email: "lisa.brandt@deerwoodbank.com", role: UserRole.BRANCH_MANAGER, branch: "Brainerd", entraId: "demo-lisa-bm" },
  { displayName: "Tom Erickson", email: "tom.erickson@deerwoodbank.com", role: UserRole.BRANCH_MANAGER, branch: "Baxter", entraId: "demo-tom-bm" },
  { displayName: "Jenny Larson", email: "jenny.larson@deerwoodbank.com", role: UserRole.BRANCH_MANAGER, branch: "Grand Rapids", entraId: "demo-jenny-bm" },
  { displayName: "Jake Peterson", email: "jake.peterson@deerwoodbank.com", role: UserRole.SALES_REP, branch: "Brainerd", entraId: "demo-jake-rep" },
  { displayName: "Sarah Mitchell", email: "sarah.mitchell@deerwoodbank.com", role: UserRole.SALES_REP, branch: "Brainerd", entraId: "demo-sarah-rep" },
  { displayName: "Ryan Cooper", email: "ryan.cooper@deerwoodbank.com", role: UserRole.SALES_REP, branch: "Baxter", entraId: "demo-ryan-rep" },
  { displayName: "Amanda Olson", email: "amanda.olson@deerwoodbank.com", role: UserRole.SALES_REP, branch: "Baxter", entraId: "demo-amanda-rep" },
  { displayName: "Derek Nguyen", email: "derek.nguyen@deerwoodbank.com", role: UserRole.SALES_REP, branch: "Grand Rapids", entraId: "demo-derek-rep" },
  { displayName: "Megan Fischer", email: "megan.fischer@deerwoodbank.com", role: UserRole.SALES_REP, branch: "Bemidji", entraId: "demo-megan-rep" },
  { displayName: "Patricia Wells", email: "patricia.wells@deerwoodbank.com", role: UserRole.COMPLIANCE_READONLY, branch: null, entraId: "demo-patricia-comp" },
];

const leadNames = [
  ["Aaron", "Halvorson"], ["Brianna", "Stangel"], ["Colin", "Moe"], ["Dana", "Rostad"], ["Ethan", "Lindberg"],
  ["Faith", "Mattson"], ["Gavin", "Dahl"], ["Hannah", "Roeder"], ["Ian", "Kleven"], ["Jenna", "Benson"],
  ["Kyle", "Anders"], ["Lauren", "Forde"], ["Mason", "Opheim"], ["Nora", "Bue"], ["Owen", "Vik"],
  ["Paige", "Nyberg"], ["Quinn", "Hanson"], ["Riley", "Andrews"], ["Sam", "Knutson"], ["Tessa", "Rude"],
  ["Uriah", "Fiske"], ["Vera", "Larson"], ["Wyatt", "Kendrick"], ["Xenia", "Paulson"], ["Yara", "Niemi"],
  ["Zane", "Britt"], ["Allie", "Uttke"], ["Brody", "Christen"], ["Cara", "Olmstead"], ["Devin", "Carlson"],
  ["Ellie", "Svenson"], ["Finn", "Sullivan"], ["Greta", "Miller"], ["Heath", "Borg"], ["Ingrid", "Briggs"],
  ["Jordan", "Marek"], ["Kira", "Lewis"], ["Logan", "Braun"], ["Mia", "Stevens"], ["Noah", "Riley"],
];

const companies = [
  "Northwoods Equipment Co", "Lakeside Dental Group", "Pine Ridge Trucking", "Arrowhead Manufacturing", "Iron Range Builders",
  "Brainerd Marine Works", "Bemidji Timber Supply", "Grand Rapids Auto Glass", "Nisswa Vacation Properties", "Walker Outdoor Outfitters",
  "Crosby Wellness Clinic", "Garrison Ag Services", "Pequot Lakes Home Care", "Isle Hardware & Supply", "Deerwood Family Pharmacy",
  "Hibbing Mechanical", "Pine River Feed & Seed", "Baxter Pediatric Therapy", "North Star Logistics", "Minnesota Dock & Lift",
  "Superior HVAC Solutions", "Loon Lake Resort Group", "Voyageur Construction", "Great North Cabinetry", "Riverbend Veterinary",
  "Arrow Financial Advisors", "Lakes Region Print Shop", "True North Landscaping", "Forest Edge Foods", "Granite State Excavating",
  "Headwaters Fabrication", "North County Glass", "Copper Trail Hospitality", "Harbor Point Insurance", "Boundary Waters Outfitters",
  "Maple Ridge Senior Living",
];

const industryCodes = [
  "522110", "621210", "484121", "332710", "236220", "441222", "113310", "811122", "721110", "451110",
  "621498", "115112", "621610", "444130", "446110", "238220", "112320", "621340", "488510", "423860",
  "238220", "721110", "236210", "337110", "541940", "523930", "323111", "561730", "311999", "238910",
  "332312", "423390", "721110", "524210", "713990", "623311",
];

const seedAddresses = [
  { addressLine1: "1201 Washington St", city: "Brainerd", state: "MN", postalCode: "56401", latitude: 46.3580, longitude: -94.2008 },
  { addressLine1: "7620 Fairview Rd", city: "Baxter", state: "MN", postalCode: "56425", latitude: 46.3426, longitude: -94.2863 },
  { addressLine1: "305 3rd St NW", city: "Grand Rapids", state: "MN", postalCode: "55744", latitude: 47.2372, longitude: -93.5302 },
  { addressLine1: "1520 Bemidji Ave N", city: "Bemidji", state: "MN", postalCode: "56601", latitude: 47.4735, longitude: -94.8803 },
  { addressLine1: "25085 County Rd 12", city: "Deerwood", state: "MN", postalCode: "56444", latitude: 46.4719, longitude: -93.8841 },
  { addressLine1: "31 Lake St S", city: "Garrison", state: "MN", postalCode: "56450", latitude: 46.2961, longitude: -93.8289 },
  { addressLine1: "25590 Main St", city: "Nisswa", state: "MN", postalCode: "56468", latitude: 46.5211, longitude: -94.2911 },
  { addressLine1: "610 Minnesota Ave W", city: "Walker", state: "MN", postalCode: "56484", latitude: 47.1014, longitude: -94.5905 },
  { addressLine1: "300 2nd Ave S", city: "Pine River", state: "MN", postalCode: "56474", latitude: 46.7228, longitude: -94.4042 },
  { addressLine1: "101 Main St", city: "Crosby", state: "MN", postalCode: "56441", latitude: 46.4836, longitude: -93.9577 },
  { addressLine1: "401 E Howard St", city: "Hibbing", state: "MN", postalCode: "55746", latitude: 47.4268, longitude: -92.9397 },
  { addressLine1: "31109 Government Dr", city: "Pequot Lakes", state: "MN", postalCode: "56472", latitude: 46.6031, longitude: -94.3092 },
  { addressLine1: "175 Main St E", city: "Isle", state: "MN", postalCode: "56342", latitude: 46.1422, longitude: -93.4672 },
];

const leadNotes = [
  "Looking for commercial line of credit to expand fleet. Has been with Wells Fargo for 10 years, unhappy with service.",
  "Met at MN Bankers Association conference. Looking for operating line and equipment financing.",
  "Existing personal banking customer. Wants to move business accounts over. Seasonal business.",
  "Lost to Bremer Bank - they offered 25bps lower rate.",
  "Pulled credit report - 745 FICO. Strong financials.",
  "Interested in treasury management bundle and remote deposit capture.",
  "Board requested revised covenant package before final approval.",
  "Owner wants one local banking partner for payroll and lending.",
  "Competitor offered temporary teaser rate; client still values local decision-making.",
  "Requested SBA option comparison and monthly payment scenarios.",
];

const activitySubjects: Record<ActivityType, string[]> = {
  CALL: ["Initial discovery call", "Discussed loan terms", "Rate quote follow-up", "Checked in on application status", "Introduced treasury management services"],
  EMAIL: ["Sent rate comparison sheet", "Forwarded loan application packet", "Sent treasury management overview", "Follow-up on our meeting Tuesday", "Requested updated financial statements"],
  MEETING: ["Branch meeting - reviewed financials", "On-site visit to business", "Lunch meeting to discuss expansion plans", "Joint meeting with commercial lending team", "Follow-up meeting with ownership group"],
  NOTE: ["Pulled credit report - 745 FICO", "Reviewed 3 years tax returns", "Competitor offering 5.75% fixed", "Board approved loan committee submission", "Strong collateral position"],
  FOLLOW_UP: ["Send updated term sheet", "Call to schedule site visit", "Follow up on missing documents", "Check on appraisal status", "Confirm insurance requirements"],
};

const branchAllocation = [
  ...Array(10).fill("Brainerd"),
  ...Array(8).fill("Baxter"),
  ...Array(5).fill("Grand Rapids"),
  ...Array(4).fill("Bemidji"),
  ...Array(2).fill("Deerwood"),
  ...Array(2).fill("Garrison"),
  ...Array(2).fill("Nisswa"),
  ...Array(2).fill("Walker"),
  "Pine River",
  "Crosby",
  "Hibbing",
  "Pequot Lakes",
  "Isle",
];

const statusAllocation: LeadStatus[] = [
  ...Array(7).fill(LeadStatus.PROSPECT), // 7 to reach total 40 with the requested status mix.
  ...Array(8).fill(LeadStatus.CONTACTED),
  ...Array(8).fill(LeadStatus.QUALIFIED),
  ...Array(6).fill(LeadStatus.PROPOSAL),
  ...Array(5).fill(LeadStatus.WON),
  ...Array(3).fill(LeadStatus.LOST),
  ...Array(3).fill(LeadStatus.DORMANT),
];

const sourceAllocation: LeadSource[] = [
  LeadSource.REFERRAL, LeadSource.WALK_IN, LeadSource.PHONE, LeadSource.WEBSITE, LeadSource.EVENT, LeadSource.EXISTING_CLIENT, LeadSource.OTHER,
];

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function randomDateBetween(start: Date, end: Date): Date {
  const min = start.getTime();
  const max = end.getTime();
  return new Date(min + Math.random() * (max - min));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function statusActivityRange(status: LeadStatus): [number, number] {
  if (status === LeadStatus.PROSPECT) return [1, 2];
  if (status === LeadStatus.CONTACTED) return [2, 4];
  if (status === LeadStatus.QUALIFIED) return [4, 6];
  if (status === LeadStatus.PROPOSAL) return [5, 8];
  if (status === LeadStatus.WON) return [6, 10];
  if (status === LeadStatus.LOST) return [3, 5];
  return [2, 3];
}

async function main(): Promise<void> {
  console.log("🌱 Seeding Deerwood Bank CRM demo data...");

  await prisma.automationLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.emailSyncStatus.deleteMany();
  await prisma.tickler.deleteMany();
  await prisma.leadDocument.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.automation.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: demoUsers.map((u) => ({
      displayName: u.displayName,
      email: u.email,
      role: u.role,
      branch: u.branch,
      entraId: u.entraId,
      isActive: true,
    })),
  });

  const users = await prisma.user.findMany({ where: { isActive: true } });
  const usersByEmail = new Map(users.map((u) => [u.email, u]));
  const reps = users.filter((u) => u.role === UserRole.SALES_REP);
  const repsByBranch = new Map<string, typeof reps>([
    ["Brainerd", reps.filter((u) => u.branch === "Brainerd")],
    ["Baxter", reps.filter((u) => u.branch === "Baxter")],
    ["Grand Rapids", reps.filter((u) => u.branch === "Grand Rapids")],
    ["Bemidji", reps.filter((u) => u.branch === "Bemidji")],
  ]);
  const fallbackRepByBranch = new Map<string, string>([
    ["Deerwood", "Brainerd"],
    ["Garrison", "Brainerd"],
    ["Nisswa", "Baxter"],
    ["Walker", "Bemidji"],
    ["Pine River", "Brainerd"],
    ["Crosby", "Brainerd"],
    ["Hibbing", "Grand Rapids"],
    ["Pequot Lakes", "Baxter"],
    ["Isle", "Brainerd"],
  ]);

  const leadRows = Array.from({ length: 40 }).map((_, idx) => {
    const id = `lead-${String(idx + 1).padStart(3, "0")}`;
    const [firstName, lastName] = leadNames[idx];
    const branch = branchAllocation[idx];
    const company = idx % 8 === 0 ? null : companies[idx % companies.length];
    const status = statusAllocation[idx];
    const source = sourceAllocation[idx % sourceAllocation.length];
    const createdAt = daysFromNow(-1 * (5 + idx));
    const nextFollowUp =
      status === LeadStatus.DORMANT
        ? null
        : idx % 9 === 0
          ? daysFromNow(-2 - (idx % 3)) // overdue
          : idx % 7 === 0
            ? daysFromNow(0) // today
            : daysFromNow(2 + (idx % 14)); // future
    const branchReps = repsByBranch.get(branch) ?? [];
    const fallbackBranch = fallbackRepByBranch.get(branch);
    const assignedPool = branchReps.length ? branchReps : fallbackBranch ? repsByBranch.get(fallbackBranch) ?? reps : reps;
    const assignedTo = pickRandom(assignedPool);
    const pipelineValue = 25000 + (idx % 10) * 125000 + (idx % 3) * 50000;

    const addr = seedAddresses[idx % seedAddresses.length];
    return {
      id,
      firstName,
      lastName,
      company,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company ? company.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com" : "gmail.com"}`,
      phone: `218-555-${String(1000 + idx)}`,
      industryCode: company ? industryCodes[idx % industryCodes.length] : null,
      addressLine1: addr.addressLine1,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      latitude: addr.latitude,
      longitude: addr.longitude,
      source,
      status,
      pipelineValue: Math.min(pipelineValue, 2000000),
      notes: leadNotes[idx % leadNotes.length],
      nextFollowUp,
      branch,
      assignedToId: assignedTo.id,
      createdAt,
      updatedAt: daysFromNow(-1 * (idx % 4)),
    };
  });

  await prisma.lead.createMany({ data: leadRows });
  const leads = await prisma.lead.findMany();

  const contactRows: Array<{
    id: string;
    leadId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    title: string | null;
    isPrimary: boolean;
    notes: string | null;
  }> = [];
  let contactCounter = 1;
  for (const lead of leads) {
    if (!lead.company) continue;
    contactRows.push({
      id: `contact-${String(contactCounter++).padStart(3, "0")}`,
      leadId: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      title: "Owner",
      isPrimary: true,
      notes: "Primary contact and decision maker.",
    });
    const extraContacts = lead.pipelineValue && Number(lead.pipelineValue) >= 300000 ? 2 : 1;
    for (let i = 0; i < extraContacts; i += 1) {
      const partnerFirst = pickRandom(["Alex", "Casey", "Drew", "Morgan", "Taylor", "Jordan", "Reese"]);
      const partnerLast = pickRandom(["Nelson", "Johnson", "Schmidt", "Anderson", "Waller", "Byrne"]);
      contactRows.push({
        id: `contact-${String(contactCounter++).padStart(3, "0")}`,
        leadId: lead.id,
        firstName: partnerFirst,
        lastName: partnerLast,
        email: `${partnerFirst.toLowerCase()}.${partnerLast.toLowerCase()}@${lead.company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
        phone: `218-555-${String(2000 + contactCounter)}`,
        title: i === 0 ? "Controller" : "Operations Manager",
        isPrimary: false,
        notes: i === 0 ? "Handles financing documents and approvals." : "Coordinates implementation and vendor payments.",
      });
    }
  }
  await prisma.contact.createMany({ data: contactRows });

  const activityRows: Array<{
    id: string;
    leadId: string;
    userId: string;
    type: ActivityType;
    subject: string;
    description: string | null;
    scheduledAt: Date | null;
    completedAt: Date | null;
    autoLogged: boolean;
    createdAt: Date;
  }> = [];
  let activityCounter = 1;
  for (const lead of leads) {
    const [min, max] = statusActivityRange(lead.status);
    const count = Math.floor(Math.random() * (max - min + 1)) + min;
    const startWindow =
      lead.status === LeadStatus.PROSPECT ? daysFromNow(-14) :
      lead.status === LeadStatus.CONTACTED ? daysFromNow(-28) :
      lead.status === LeadStatus.QUALIFIED ? daysFromNow(-42) :
      lead.status === LeadStatus.PROPOSAL ? daysFromNow(-56) :
      lead.status === LeadStatus.WON ? daysFromNow(-84) :
      lead.status === LeadStatus.LOST ? daysFromNow(-56) :
      daysFromNow(-60);
    const endWindow = lead.status === LeadStatus.DORMANT ? daysFromNow(-30) : daysFromNow(0);

    for (let i = 0; i < count; i += 1) {
      const type = pickRandom([ActivityType.CALL, ActivityType.EMAIL, ActivityType.MEETING, ActivityType.NOTE, ActivityType.FOLLOW_UP]);
      const createdAt = randomDateBetween(startWindow, endWindow);
      const isFutureFollowUp = type === ActivityType.FOLLOW_UP && Math.random() < 0.35 && lead.status !== LeadStatus.DORMANT;
      const scheduledAt = isFutureFollowUp ? randomDateBetween(daysFromNow(-2), daysFromNow(10)) : null;
      const completedAt = isFutureFollowUp ? null : createdAt;
      activityRows.push({
        id: `activity-${String(activityCounter++).padStart(4, "0")}`,
        leadId: lead.id,
        userId: lead.assignedToId,
        type,
        subject: pickRandom(activitySubjects[type]),
        description: pickRandom(leadNotes),
        scheduledAt,
        completedAt,
        autoLogged: type === ActivityType.EMAIL && Math.random() < 0.35,
        createdAt,
      });
    }
  }
  await prisma.activity.createMany({ data: activityRows });

  const admin = usersByEmail.get("mike.sorensen@deerwoodbank.com");
  if (!admin) throw new Error("Admin user missing during seed.");

  const automationDefaults = [
    {
      id: "stale-lead-alert",
      name: "Stale Lead Alert",
      description: "Notify assigned rep when a contacted/qualified lead has no activity for 7 days.",
      trigger: AutomationTrigger.NO_ACTIVITY_DAYS,
      conditions: { days: 7, statuses: [LeadStatus.CONTACTED, LeadStatus.QUALIFIED] },
      action: AutomationAction.SEND_NOTIFICATION,
      actionConfig: { targetRole: "ASSIGNED_REP", titleTemplate: "Stale lead: {{leadName}}", messageTemplate: "{{leadName}} at {{company}} has not been contacted recently." },
    },
    {
      id: "overdue-follow-up-alert",
      name: "Overdue Follow-Up Alert",
      description: "Notify assigned rep when follow-up is overdue by 24 hours.",
      trigger: AutomationTrigger.FOLLOW_UP_OVERDUE,
      conditions: { gracePeriodHours: 24 },
      action: AutomationAction.SEND_NOTIFICATION,
      actionConfig: { targetRole: "ASSIGNED_REP", titleTemplate: "Overdue follow-up: {{leadName}}", messageTemplate: "Follow-up is overdue for {{leadName}} in {{branch}}." },
    },
    {
      id: "high-value-referral-alert",
      name: "High-Value Referral Alert",
      description: "Notify branch managers for referral leads over $100k.",
      trigger: AutomationTrigger.LEAD_CREATED,
      conditions: { sources: [LeadSource.REFERRAL], minimumValue: 100000 },
      action: AutomationAction.SEND_NOTIFICATION,
      actionConfig: { targetRole: UserRole.BRANCH_MANAGER, titleTemplate: "High-value referral: {{leadName}}", messageTemplate: "{{leadName}} from {{company}} entered pipeline as a high-value referral." },
    },
    {
      id: "auto-dormant",
      name: "Auto-Dormant",
      description: "Mark inactive leads as dormant after 90 days.",
      trigger: AutomationTrigger.NO_ACTIVITY_DAYS,
      conditions: { days: 90, statuses: [LeadStatus.PROSPECT, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPOSAL] },
      action: AutomationAction.CHANGE_STATUS,
      actionConfig: { newStatus: LeadStatus.DORMANT },
    },
    {
      id: "new-assignment-task",
      name: "New Assignment Task",
      description: "Create immediate initial contact task when lead is assigned.",
      trigger: AutomationTrigger.LEAD_ASSIGNED,
      conditions: {},
      action: AutomationAction.CREATE_TASK,
      actionConfig: { daysFromNow: 0, subject: "Initial contact call" },
    },
    {
      id: "proposal-notification",
      name: "Proposal Notification",
      description: "Notify branch manager when lead moves to proposal.",
      trigger: AutomationTrigger.LEAD_STATUS_CHANGE,
      conditions: { toStatus: LeadStatus.PROPOSAL },
      action: AutomationAction.SEND_NOTIFICATION,
      actionConfig: { targetRole: UserRole.BRANCH_MANAGER, titleTemplate: "Lead moved to PROPOSAL: {{leadName}}", messageTemplate: "{{leadName}} at {{company}} was advanced to PROPOSAL." },
    },
  ];

  await prisma.automation.createMany({
    data: automationDefaults.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      trigger: a.trigger,
      conditions: a.conditions,
      action: a.action,
      actionConfig: a.actionConfig,
      createdById: admin.id,
      isActive: true,
    })),
  });

  const notificationEligibleRoles = new Set<UserRole>([UserRole.SALES_REP, UserRole.BRANCH_MANAGER, UserRole.ADMIN, UserRole.EXECUTIVE]);
  const repsAndManagers = users.filter((u) => notificationEligibleRoles.has(u.role));
  const notificationRows = Array.from({ length: 28 }).map((_, idx) => {
    const lead = leads[idx % leads.length];
    const recipient =
      idx % 4 === 0 ? users.find((u) => u.id === lead.assignedToId) ?? pickRandom(repsAndManagers) :
      idx % 5 === 0 ? pickRandom(users.filter((u) => u.role === UserRole.BRANCH_MANAGER)) :
      pickRandom(repsAndManagers);
    const templates = [
      { title: "Stale lead alert", message: `${lead.firstName} ${lead.lastName} has no recent activity.` },
      { title: "Overdue follow-up", message: `Follow-up overdue for ${lead.firstName} ${lead.lastName}.` },
      { title: "High-value referral", message: `${lead.company ?? `${lead.firstName} ${lead.lastName}`} entered as a high-value referral.` },
      { title: "Status change", message: `${lead.firstName} ${lead.lastName} moved to ${lead.status}.` },
    ];
    const selected = templates[idx % templates.length];
    const createdAt = randomDateBetween(daysFromNow(-14), daysFromNow(0));
    return {
      id: `notif-${String(idx + 1).padStart(3, "0")}`,
      userId: recipient.id,
      title: selected.title,
      message: selected.message,
      link: `/leads?leadId=${lead.id}`,
      isRead: createdAt < daysFromNow(-4),
      createdAt,
    };
  });
  await prisma.notification.createMany({ data: notificationRows });

  await prisma.emailSyncStatus.createMany({
    data: users
      .filter((u) => u.role !== UserRole.COMPLIANCE_READONLY)
      .map((u, idx) => ({
        userId: u.id,
        lastSyncAt: daysFromNow(-(idx % 3)),
        emailsMatched: 5 + idx,
        emailsSkipped: idx % 4,
      })),
  });

  const ticklerTitles = [
    "Follow up on rate quote", "Check application status", "Send financial review", "Schedule site visit",
    "Call to discuss expansion", "Confirm insurance docs", "Review term sheet", "Touch base on decision",
  ];
  const ticklerRows = Array.from({ length: 16 }).map((_, idx) => {
    const lead = leads[idx % leads.length];
    const rep = users.find((u) => u.id === lead.assignedToId) ?? pickRandom(reps);
    const isOverdue = idx % 4 === 0;
    const isCompleted = idx % 6 === 0;
    const recurrence = idx % 5 === 0 ? TicklerRecurrence.WEEKLY : idx % 7 === 0 ? TicklerRecurrence.MONTHLY : TicklerRecurrence.NONE;
    return {
      leadId: lead.id,
      ownerId: rep.id,
      title: ticklerTitles[idx % ticklerTitles.length],
      notes: idx % 3 === 0 ? "Bring rate comparison sheet" : null,
      dueAt: isOverdue ? daysFromNow(-3 - (idx % 5)) : daysFromNow(1 + idx),
      recurrence,
      completedAt: isCompleted ? daysFromNow(-1) : null,
    };
  });
  await prisma.tickler.createMany({ data: ticklerRows });

  const [userCount, leadCount, contactCount, activityCount, automationCount, notificationCount] = await Promise.all([
    prisma.user.count(),
    prisma.lead.count(),
    prisma.contact.count(),
    prisma.activity.count(),
    prisma.automation.count(),
    prisma.notification.count(),
  ]);

  console.log("✅ Seed complete.");
  console.log(`Users: ${userCount}`);
  console.log(`Leads: ${leadCount}`);
  console.log(`Contacts: ${contactCount}`);
  console.log(`Activities: ${activityCount}`);
  console.log(`Automations: ${automationCount}`);
  const ticklerCount = await prisma.tickler.count();
  console.log(`Notifications: ${notificationCount}`);
  console.log(`Ticklers: ${ticklerCount}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
