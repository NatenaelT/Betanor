"use client";

import { useEffect, useState } from "react";

type Hint = { label: string; description: string; x: number; y: number; placement: "top" | "bottom" };
type Field = HTMLElement;
const fieldSelector = "input:not([type='hidden']):not([type='submit']):not([type='reset']):not([type='button']):not([type='image']), select, textarea, [contenteditable='true']";

const descriptions: Array<[RegExp, string]> = [
  [/e-?mail/i, "Enter an email address you can access; the system may use it for account or record updates."],
  [/phone|mobile|telephone/i, "Enter a reachable phone number, including the country code when possible."],
  [/password/i, "Enter the password for this account. Never share it or include it in notes."],
  [/amount|salary|budget|price|cost|value|total/i, "Enter the amount in the displayed currency and verify the decimal value."],
  [/date|deadline|expiry|start|end|due/i, "Choose the correct date for this record. Check the displayed timezone and business context."],
  [/reference|number|code|id/i, "Use the related business reference. Leave it blank when the system generates it automatically."],
  [/customer|organization|company/i, "Select the correct customer or organization so access, history and reporting stay linked."],
  [/department|position|manager/i, "Choose the current organizational assignment. It can affect visibility, approvals and reporting."],
  [/status|stage|priority/i, "Choose the value that best reflects the record's current approved state."],
  [/file|attachment|document|upload|image|video/i, "Attach only files relevant to this record and avoid including unrelated personal or confidential data."],
  [/description|details|notes|comment|message|body|content/i, "Enter concise, factual information that helps the next person understand this record."],
  [/address|location|place/i, "Enter the location details needed for delivery, service, or correspondence."],
  [/title|subject|name/i, "Use a clear, recognizable title so other authorized users can find this record."],
  [/quantity|hours|days|rate|percent|tax/i, "Enter a numeric value using the unit shown beside this field."],
];

function controlFor(label: HTMLLabelElement): Field | null {
  const target = label.control ?? (label.htmlFor ? document.getElementById(label.htmlFor) : null);
  if (!(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLInputElement && ["hidden", "submit", "reset", "button", "image"].includes(target.type)) return null;
  return target;
}

function fieldLabel(field: Field, labelElement?: HTMLLabelElement | null) {
  const idLabel = field.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(field.id)}"]`) : null;
  const label = (labelElement?.textContent || idLabel?.textContent || field.getAttribute("aria-label") || field.getAttribute("placeholder") || field.getAttribute("name") || "").replace(/\s+/g, " ").trim();
  return label.replace(/\s*\*\s*$/, "").trim() || "This field";
}

function fieldDescription(field: Field, label: string) {
  const custom = field.getAttribute("data-tooltip");
  if (custom?.trim()) return custom.trim();
  const subject = `${label} ${field.getAttribute("name") || ""} ${field.getAttribute("type") || ""}`;
  return descriptions.find(([pattern]) => pattern.test(subject))?.[1] ?? `Enter the ${label.toLocaleLowerCase()} for this record. Leave it blank if it is optional.`;
}

function tooltipPosition(anchor: HTMLElement): Pick<Hint, "x" | "y" | "placement"> {
  const rect = anchor.getBoundingClientRect();
  const edge = Math.min(170, Math.max(8, window.innerWidth / 2 - 8));
  const x = Math.min(Math.max(rect.left + rect.width / 2, edge), window.innerWidth - edge);
  const placement = rect.bottom + 96 <= window.innerHeight ? "bottom" : "top";
  const y = placement === "bottom" ? rect.bottom + 7 : Math.max(8, rect.top - 7);
  return { x, y, placement };
}

function makeInfoButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.fieldInfoTrigger = "true";
  button.setAttribute("aria-label", "Show field information");
  button.setAttribute("aria-expanded", "false");
  button.className = "ml-1 mt-0.5 inline-grid size-[18px] shrink-0 place-items-center rounded-full border border-[var(--betanor-muted)]/40 text-[10px] font-bold leading-none text-[var(--betanor-muted)] align-middle transition-colors hover:border-[var(--betanor-blue)] hover:text-[var(--betanor-blue)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--betanor-blue)]";
  button.textContent = "i";
  return button;
}

export function FieldTooltips() {
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    let activeButton: HTMLButtonElement | null = null;
    let activeField: Field | null = null;
    let previousDescriptionIds: string | null = null;

    const clear = () => {
      if (activeButton) activeButton.setAttribute("aria-expanded", "false");
      if (activeField?.getAttribute("aria-describedby")?.split(/\s+/).includes("global-field-tooltip")) {
        if (previousDescriptionIds) activeField.setAttribute("aria-describedby", previousDescriptionIds);
        else activeField.removeAttribute("aria-describedby");
      }
      activeButton = null;
      activeField = null;
      previousDescriptionIds = null;
      setHint(null);
    };

    const show = (button: HTMLButtonElement) => {
      if (activeButton === button) { clear(); return; }
      clear();
      const previous = button.previousElementSibling;
      const labelElement = previous instanceof HTMLLabelElement
        ? previous
        : button.closest("div")?.querySelector<HTMLLabelElement>("label[for]") ?? null;
      const field = labelElement ? controlFor(labelElement) : previous instanceof HTMLElement && previous.matches(fieldSelector) ? previous : null;
      if (!field) return;
      activeButton = button;
      activeField = field;
      previousDescriptionIds = field.getAttribute("aria-describedby");
      button.setAttribute("aria-expanded", "true");
      const label = fieldLabel(field, labelElement);
      field.setAttribute("aria-describedby", [previousDescriptionIds, "global-field-tooltip"].filter(Boolean).join(" "));
      setHint({ label, description: fieldDescription(field, label), ...tooltipPosition(button) });
    };

    const enhanceField = (field: Field) => {
      const nativeTitle = field.getAttribute("title");
      if (nativeTitle && !field.hasAttribute("data-tooltip")) field.setAttribute("data-tooltip", nativeTitle);
      if (nativeTitle) field.removeAttribute("title");
      const labels = field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement ? Array.from(field.labels ?? []) : [];
      if (labels.length) {
        labels.forEach((label) => {
          const next = label.nextElementSibling;
          if (!(next instanceof HTMLButtonElement && next.hasAttribute("data-field-info-trigger"))) label.after(makeInfoButton());
        });
      } else if (field.getClientRects().length && !(field.nextElementSibling instanceof HTMLButtonElement && field.nextElementSibling.hasAttribute("data-field-info-trigger"))) {
        field.after(makeInfoButton());
      }
    };

    const enhanceNode = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(fieldSelector)) enhanceField(node as Field);
      node.querySelectorAll<Field>(fieldSelector).forEach(enhanceField);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>("button[data-field-info-trigger]");
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        show(button);
      } else if (activeButton && target && !target.closest("#global-field-tooltip")) {
        clear();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && activeButton) clear(); };
    const onPositionChange = () => {
      if (!activeButton?.isConnected) { clear(); return; }
      setHint((current) => current && activeButton ? { ...current, ...tooltipPosition(activeButton) } : current);
    };

    enhanceNode(document.body);
    const observer = new MutationObserver((records) => {
      if (activeButton && !activeButton.isConnected) clear();
      records.forEach((record) => record.addedNodes.forEach(enhanceNode));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onPositionChange, true);
    window.addEventListener("resize", onPositionChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onPositionChange, true);
      window.removeEventListener("resize", onPositionChange);
      clear();
    };
  }, []);

  return hint ? <div id="global-field-tooltip" role="tooltip" className={`pointer-events-none fixed z-[100] w-max max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-[var(--betanor-dark-navy)] px-3 py-2 text-xs leading-5 text-white shadow-xl ${hint.placement === "top" ? "-translate-y-full" : ""}`} style={{ left: hint.x, top: hint.y }}><span className="font-semibold">{hint.label}:</span> {hint.description}</div> : null;
}
