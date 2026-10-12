export type ApplicationFieldType = "select" | "yes_no";

export type ApplicationFormField = {
  key: string;
  label: string;
  type: ApplicationFieldType;
  required: boolean;
  options?: string[];
  showWhen?: { fieldKey: string; equals: string };
};

const allowedFieldTypes = new Set<ApplicationFieldType>(["select", "yes_no"]);

export function parseApplicationFormSchema(value: unknown): ApplicationFormField[] {
  let source: unknown = value;
  if (typeof value === "string") {
    try { source = JSON.parse(value); } catch { throw new Error("Application fields could not be read."); }
  }
  if (!Array.isArray(source) || source.length > 25) throw new Error("Add no more than 25 application fields.");

  const keys = new Set<string>();
  const fields = source.map((raw): ApplicationFormField => {
    if (!raw || typeof raw !== "object") throw new Error("One of the application fields is invalid.");
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 100) : "";
    const key = typeof item.key === "string" ? item.key.trim().toLowerCase() : "";
    const type = typeof item.type === "string" ? item.type as ApplicationFieldType : "select";
    if (!label || !/^[a-z][a-z0-9_]{0,39}$/.test(key) || ["email", "first_name", "last_name", "resume", "cover_letter"].includes(key) || keys.has(key)) {
      throw new Error("Every field needs a unique label and a valid field key.");
    }
    if (!allowedFieldTypes.has(type)) throw new Error("Choose a supported application field type.");
    keys.add(key);
    const options = type === "select" && Array.isArray(item.options)
      ? [...new Set(item.options.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).map((entry) => entry.slice(0, 120)))].slice(0, 40)
      : undefined;
    if (type === "select" && (!options || options.length < 2)) throw new Error(`Add at least two options for “${label}”.`);
    let showWhen: ApplicationFormField["showWhen"];
    if (item.showWhen && typeof item.showWhen === "object") {
      const condition = item.showWhen as Record<string, unknown>;
      const fieldKey = typeof condition.fieldKey === "string" ? condition.fieldKey : "";
      const equals = typeof condition.equals === "string" ? condition.equals.trim().slice(0, 120) : "";
      if (fieldKey && !equals) throw new Error(`Choose the answer that reveals “${label}”.`);
      if (fieldKey && equals) showWhen = { fieldKey, equals };
    }
    return { key, label, type, required: false, ...(options ? { options } : {}), ...(showWhen ? { showWhen } : {}) };
  });

  const earlier = new Map<string, ApplicationFormField>();
  for (const field of fields) {
    if (field.showWhen) {
      const dependency = earlier.get(field.showWhen.fieldKey);
      if (!dependency) throw new Error(`The condition for “${field.label}” must use an earlier field.`);
      const validValues = dependency.type === "select" ? dependency.options ?? [] : dependency.type === "yes_no" ? ["yes", "no"] : null;
      if (validValues && !validValues.includes(field.showWhen.equals)) throw new Error(`Choose a valid condition value for “${field.label}”.`);
    }
    earlier.set(field.key, field);
  }

  return fields;
}

export function fieldKeyFromLabel(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "new_field";
}
