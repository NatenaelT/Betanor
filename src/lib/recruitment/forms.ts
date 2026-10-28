export type ApplicationFieldType =
  | "short_answer"
  | "long_answer"
  | "dropdown"
  | "radio"
  | "checkboxes"
  | "yes_no"
  | "linear_scale"
  | "number"
  | "date"
  | "time"
  | "email"
  | "phone"
  | "url"
  | "file_upload";

export type ApplicationFormField = {
  key: string;
  label: string;
  type: ApplicationFieldType;
  /** Custom application questions remain optional; only email and CV/resume are required. */
  required: false;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  numberMin?: number;
  numberMax?: number;
  showWhen?: { fieldKey: string; equals: string };
};

export type ApplicationAnswer = string | string[];

export const APPLICATION_FIELD_TYPES: Array<[ApplicationFieldType, string]> = [
  ["short_answer", "Short answer"],
  ["long_answer", "Long answer"],
  ["dropdown", "Dropdown"],
  ["radio", "Radio buttons"],
  ["checkboxes", "Checkboxes (multiple answers)"],
  ["yes_no", "Yes / No"],
  ["linear_scale", "Linear scale"],
  ["number", "Number"],
  ["date", "Date"],
  ["time", "Time"],
  ["email", "Email address"],
  ["phone", "Phone number"],
  ["url", "Website / URL"],
  ["file_upload", "File upload (PDF, DOC, DOCX)"],
];

const allowedFieldTypes = new Set<ApplicationFieldType>(APPLICATION_FIELD_TYPES.map(([type]) => type));
const choiceTypes = new Set<ApplicationFieldType>(["dropdown", "radio", "checkboxes"]);
const reservedKeys = new Set(["email", "first_name", "last_name", "resume", "cover_letter"]);

function boundedNumber(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000_000) throw new Error(`${fieldName} must be a valid number.`);
  return number;
}

function scaleValues(field: ApplicationFormField) {
  const min = field.scaleMin ?? 1;
  const max = field.scaleMax ?? 5;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 10 || max <= min || max - min > 10) {
    throw new Error(`Set a valid scale range for “${field.label}” (between 0 and 10).`);
  }
  return Array.from({ length: max - min + 1 }, (_, index) => String(min + index));
}

export function applicationFieldConditionValues(field: ApplicationFormField): string[] | null {
  if (choiceTypes.has(field.type)) return field.options ?? [];
  if (field.type === "yes_no") return ["yes", "no"];
  if (field.type === "linear_scale") return scaleValues(field);
  return null;
}

export function parseApplicationFormSchema(value: unknown): ApplicationFormField[] {
  let source: unknown = value;
  if (typeof value === "string") {
    try { source = JSON.parse(value); } catch { throw new Error("Application fields could not be read."); }
  }
  if (source === null || source === undefined) source = [];
  if (!Array.isArray(source) || source.length > 25) throw new Error("Add no more than 25 application fields.");

  const keys = new Set<string>();
  const fields = source.map((raw): ApplicationFormField => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("One of the application fields is invalid.");
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 100) : "";
    const key = typeof item.key === "string" ? item.key.trim().toLowerCase() : "";
    const rawType = typeof item.type === "string" ? item.type : "short_answer";
    const type = (rawType === "select" ? "dropdown" : rawType) as ApplicationFieldType;
    if (!label || !/^[a-z][a-z0-9_]{0,39}$/.test(key) || reservedKeys.has(key) || keys.has(key)) {
      throw new Error("Every field needs a unique label and a valid field key.");
    }
    if (!allowedFieldTypes.has(type)) throw new Error("Choose a supported application field type.");
    keys.add(key);

    const options = choiceTypes.has(type) && Array.isArray(item.options)
      ? [...new Set(item.options.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).map((entry) => entry.slice(0, 120)))].slice(0, 40)
      : undefined;
    if (choiceTypes.has(type) && (!options || options.length < 2)) throw new Error(`Add at least two options for “${label}”.`);

    const field: ApplicationFormField = {
      key,
      label,
      type,
      required: false,
      ...(options ? { options } : {}),
    };
    if (type === "linear_scale") {
      field.scaleMin = boundedNumber(item.scaleMin, "Scale minimum") ?? 1;
      field.scaleMax = boundedNumber(item.scaleMax, "Scale maximum") ?? 5;
      field.scaleMinLabel = typeof item.scaleMinLabel === "string" ? item.scaleMinLabel.trim().slice(0, 40) : "";
      field.scaleMaxLabel = typeof item.scaleMaxLabel === "string" ? item.scaleMaxLabel.trim().slice(0, 40) : "";
      scaleValues(field);
    }
    if (type === "number") {
      field.numberMin = boundedNumber(item.numberMin, "Minimum value");
      field.numberMax = boundedNumber(item.numberMax, "Maximum value");
      if (field.numberMin !== undefined && field.numberMax !== undefined && field.numberMax < field.numberMin) {
        throw new Error(`The maximum for “${label}” must be greater than or equal to the minimum.`);
      }
    }

    if (item.showWhen && typeof item.showWhen === "object" && !Array.isArray(item.showWhen)) {
      const condition = item.showWhen as Record<string, unknown>;
      const fieldKey = typeof condition.fieldKey === "string" ? condition.fieldKey : "";
      const equals = typeof condition.equals === "string" ? condition.equals.trim().slice(0, 120) : "";
      if (fieldKey && !equals) throw new Error(`Choose the answer that reveals “${label}”.`);
      if (fieldKey && equals) field.showWhen = { fieldKey, equals };
    }
    return field;
  });

  const earlier = new Map<string, ApplicationFormField>();
  for (const field of fields) {
    if (field.showWhen) {
      const dependency = earlier.get(field.showWhen.fieldKey);
      if (!dependency) throw new Error(`The condition for “${field.label}” must use an earlier field.`);
      const validValues = applicationFieldConditionValues(dependency);
      if (validValues && !validValues.includes(field.showWhen.equals)) {
        throw new Error(`Choose a valid condition value for “${field.label}”.`);
      }
    }
    earlier.set(field.key, field);
  }

  return fields;
}

export function fieldKeyFromLabel(label: string) {
  let key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!key) key = "new_field";
  if (!/^[a-z]/.test(key)) key = `q_${key}`.slice(0, 40);
  if (key.length === 1) key = `${key}_1`;
  return key;
}
