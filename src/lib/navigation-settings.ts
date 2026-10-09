export type NavigationItem = {
  id: string;
  href: string;
  label: string;
  description?: string;
  permission?: string | string[];
  superAdminOnly?: boolean;
  staffOnly?: boolean;
};

export type NavigationSection = { id: string; label: string; items: NavigationItem[] };

export const STAFF_NAVIGATION_SECTIONS: NavigationSection[] = [
  { id: "start", label: "Start here", items: [{ id: "modules", href: "/workspace", label: "Modules", description: "Role-assigned work areas" }, { id: "overview", href: "/workspace/overview", label: "Overview", description: "Personal dashboard" }] },
  { id: "people", label: "People", items: [{ id: "employees", href: "/workspace/employees", label: "Employees", permission: ["hr.read", "hr.manage", "users.manage"] }, { id: "leave", href: "/workspace/leave", label: "Leave", permission: ["leave.request", "leave.approve"] }, { id: "recruitment", href: "/workspace/recruitment", label: "Recruitment", permission: "recruitment.manage" }, { id: "payroll", href: "/workspace/payslips", label: "Payroll & payslips", permission: ["payroll.read_self", "payroll.manage"] }, { id: "kpis", href: "/workspace/kpis", label: "KPIs", permission: ["kpi.read_self", "kpi.read_team", "kpi.configure", "kpi.review"] }] },
  { id: "work", label: "Work", items: [{ id: "projects", href: "/workspace/projects", label: "Projects", permission: "project.manage" }, { id: "tasks", href: "/workspace/tasks", label: "Tasks", permission: ["task.create", "task.assign", "task.edit"] }, { id: "my-work", href: "/workspace/my-work", label: "My work", staffOnly: true }] },
  { id: "noren", label: "Noren", items: [{ id: "inbox", href: "/workspace/noren/inbox", label: "Inbox", description: "Your notifications & assignments", staffOnly: true }, { id: "conversations", href: "/workspace/chats", label: "Conversations", permission: ["chat.manage", "chat.internal.read"] }, { id: "support-chats", href: "/workspace/support", label: "Support chats", permission: ["support.read", "support.view_all"] }] },
  { id: "support", label: "Support", items: [{ id: "it-support", href: "/workspace/support", label: "IT Support / Managed Support", description: "RTSL service desk", permission: ["support.read", "support.create", "support.view_all", "support.manage_contracts"] }] },
  { id: "finance", label: "Finance", items: [{ id: "finance-overview", href: "/workspace/finance", label: "Finance overview", description: "Cash, budgets & receivables", permission: ["finance.read", "finance.create", "finance.approve"] }, { id: "expenses", href: "/workspace/expenses", label: "Expenses", description: "Requests & approvals", permission: ["expense.request", "finance.read", "finance.create", "finance.approve"] }, { id: "budgets", href: "/workspace/budgets", label: "Budgets", description: "Plan by year and project", permission: ["finance.read", "finance.create", "finance.approve"] }, { id: "invoices", href: "/workspace/invoices", label: "Invoices & payments", description: "ETB billing ledger", permission: ["finance.read", "finance.create", "finance.approve"] }] },
  { id: "documents", label: "Documents", items: [{ id: "documents", href: "/workspace/documents", label: "Files & documents", permission: "files.manage" }, { id: "letters", href: "/workspace/letters", label: "Letters", description: "Official correspondence", permission: ["letters.read", "letters.create", "letters.view_department", "letters.view_all"] }] },
  { id: "sales", label: "Sales & clients", items: [{ id: "crm", href: "/workspace/crm", label: "CRM", permission: ["crm.read", "crm.write"] }, { id: "rfqs", href: "/workspace/rfqs", label: "RFQs", permission: ["rfq.read", "rfq.write"] }, { id: "quotations", href: "/workspace/quotations", label: "Quotations", permission: ["quotation.create", "quotation.edit", "quotation.approve", "quotation.send"] }, { id: "contracts", href: "/workspace/contracts", label: "Contracts", permission: ["contract.create", "contract.approve"] }, { id: "mailbox", href: "/workspace/mailbox", label: "Mailbox", description: "Inbox, signatures & correspondence", permission: ["email.read", "email.read_all", "email.send", "email.manage"] }] },
  { id: "tenders", label: "Tenders", items: [{ id: "tender-management", href: "/workspace/tenders", label: "Tender management", description: "Proposals, guarantees & submissions", permission: ["tender.read", "tender.create", "tender.view_all"] }] },
  { id: "system", label: "System", items: [{ id: "content", href: "/workspace/cms", label: "Content management", permission: ["cms.read", "cms.write", "cms.publish"] }, { id: "products", href: "/workspace/products", label: "Product catalogue", permission: ["cms.read", "cms.write", "cms.publish"] }, { id: "system-configuration", href: "/workspace/admin/settings", label: "System configuration", permission: "settings.manage" }, { id: "brand-style", href: "/workspace/style-guide", label: "Brand style", permission: "style.manage", superAdminOnly: true }] },
  { id: "administration", label: "Administration", items: [{ id: "users", href: "/workspace/admin/users", label: "Users & access", description: "Roles and customer portal links", permission: "users.manage" }, { id: "departments", href: "/workspace/admin/departments", label: "Departments & positions", description: "Conditional organization structure", permission: ["hr.manage", "users.manage"] }] },
  { id: "help", label: "Help", items: [{ id: "help-manual", href: "/workspace/help", label: "Help & user manual", description: "Guidance for your assigned role" }, { id: "programmer-guide", href: "/workspace/admin/guides", label: "Programmer guide", description: "Download the technical guide", permission: ["users.manage", "settings.manage"] }] },
];

type CustomerNavigationItem = {
  id: string;
  label: string;
  href: string;
  surface: "public" | "shared" | "portal";
  authenticatedOnly?: boolean;
};

export const CUSTOMER_NAVIGATION_ITEMS: CustomerNavigationItem[] = [
  { id: "home", label: "Home", href: "/", surface: "public" },
  { id: "company", label: "Company", href: "/about", surface: "shared" },
  { id: "services", label: "Services", href: "/services", surface: "shared" },
  { id: "contact", label: "Contact", href: "/contact", surface: "shared" },
  { id: "partner", label: "Partner with us", href: "/partner", surface: "public" },
  { id: "careers", label: "Careers", href: "/careers", surface: "public" },
  { id: "portal-home", label: "Dashboard", href: "/portal", surface: "portal" },
  { id: "it-support", label: "IT Support", href: "/portal/support", surface: "portal" },
  { id: "notifications", label: "Notifications", href: "/portal/notifications", surface: "portal", authenticatedOnly: true },
  { id: "help", label: "Help & support", href: "/portal/help", surface: "portal" },
];

export type StaffNavigationSettings = {
  sectionOrder: string[];
  hiddenSections: string[];
  itemOrder: Record<string, string[]>;
  hiddenItems: string[];
};

export type CustomerNavigationSettings = { order: string[]; hidden: string[] };
export type NavigationSettings = { staff: StaffNavigationSettings; customer: CustomerNavigationSettings };

function stringArray(value: unknown, allowed: string[]) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && allowed.includes(entry)))];
}

function completeOrder(input: unknown, allowed: string[]) {
  const selected = stringArray(input, allowed);
  return [...selected, ...allowed.filter((entry) => !selected.includes(entry))];
}

export function defaultNavigationSettings(): NavigationSettings {
  return {
    staff: {
      sectionOrder: STAFF_NAVIGATION_SECTIONS.map((section) => section.id),
      hiddenSections: [],
      itemOrder: Object.fromEntries(STAFF_NAVIGATION_SECTIONS.map((section) => [section.id, section.items.map((item) => item.id)])),
      hiddenItems: [],
    },
    customer: { order: CUSTOMER_NAVIGATION_ITEMS.map((item) => item.id), hidden: [] },
  };
}

export function normalizeNavigationSettings(value: unknown): NavigationSettings {
  const defaults = defaultNavigationSettings();
  if (!value || typeof value !== "object") return defaults;
  const source = value as Record<string, unknown>;
  const staffInput = source.staff && typeof source.staff === "object" ? source.staff as Record<string, unknown> : {};
  const customerInput = source.customer && typeof source.customer === "object" ? source.customer as Record<string, unknown> : {};
  const itemOrderInput = staffInput.itemOrder && typeof staffInput.itemOrder === "object" ? staffInput.itemOrder as Record<string, unknown> : {};
  const sectionIds = STAFF_NAVIGATION_SECTIONS.map((section) => section.id);
  const itemIds = STAFF_NAVIGATION_SECTIONS.flatMap((section) => section.items.map((item) => item.id));
  const customerIds = CUSTOMER_NAVIGATION_ITEMS.map((item) => item.id);
  const itemOrder = Object.fromEntries(STAFF_NAVIGATION_SECTIONS.map((section) => [section.id, completeOrder(itemOrderInput[section.id], section.items.map((item) => item.id))]));
  return {
    staff: {
      sectionOrder: completeOrder(staffInput.sectionOrder, sectionIds),
      hiddenSections: stringArray(staffInput.hiddenSections, sectionIds),
      itemOrder,
      hiddenItems: stringArray(staffInput.hiddenItems, itemIds),
    },
    customer: {
      order: completeOrder(customerInput.order, customerIds),
      hidden: stringArray(customerInput.hidden, customerIds),
    },
  };
}

export function sortStaffSections(settings: StaffNavigationSettings) {
  const byId = new Map(STAFF_NAVIGATION_SECTIONS.map((section) => [section.id, section]));
  return settings.sectionOrder.flatMap((sectionId) => {
    const section = byId.get(sectionId);
    if (!section || settings.hiddenSections.includes(section.id)) return [];
    const items = new Map(section.items.map((item) => [item.id, item]));
    return [{ ...section, items: (settings.itemOrder[section.id] ?? section.items.map((item) => item.id)).flatMap((id) => {
      const item = items.get(id);
      return item && !settings.hiddenItems.includes(id) ? [item] : [];
    }) }].filter((item) => item.items.length > 0);
  });
}

export function sortCustomerLinks(settings: CustomerNavigationSettings, surface: "public" | "portal", hasCustomerAccess = false) {
  const byId = new Map(CUSTOMER_NAVIGATION_ITEMS.map((item) => [item.id, item]));
  return settings.order.flatMap((id) => {
    const item = byId.get(id);
    if (!item || settings.hidden.includes(id) || item.surface !== surface && item.surface !== "shared") return [];
    if (item.authenticatedOnly && !hasCustomerAccess) return [];
    return [item];
  });
}
