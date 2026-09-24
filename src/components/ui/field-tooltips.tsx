"use client";

import { useEffect, useState } from "react";

type Hint = { label: string; description: string; x: number; y: number; placement: "top" | "bottom" };
type Field = HTMLElement;

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

function controlFrom(target: EventTarget | null): Field | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest("input, select, textarea, [contenteditable='true']");
  if (!(field instanceof HTMLElement)) return null;
  if (field instanceof HTMLInputElement && ["hidden", "submit", "reset", "button", "image"].includes(field.type)) return null;
  return field;
}

function fieldLabel(field: Field) {
  const idLabel = field.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(field.id)}"]`) : null;
  const nested = field.closest("label");
  const label = (idLabel?.textContent || nested?.textContent || field.getAttribute("aria-label") || field.getAttribute("placeholder") || field.getAttribute("name") || "").replace(/\s+/g, " ").trim();
  return label.replace(/\s*\*\s*$/, "") || "This field";
}

function fieldDescription(field: Field, label: string) {
  const custom = field.getAttribute("data-tooltip") || field.getAttribute("title");
  if (custom?.trim()) return custom.trim();
  const subject = `${label} ${field.getAttribute("name") || ""} ${field.getAttribute("type") || ""}`;
  return descriptions.find(([pattern]) => pattern.test(subject))?.[1] ?? `Enter the ${label.toLocaleLowerCase()} for this record. Leave it blank if it is optional.`;
}

export function FieldTooltips() {
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: Field | null = null;
    let previousDescriptionIds: string | null = null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      if (active?.getAttribute("aria-describedby") === "global-field-tooltip") {
        if (previousDescriptionIds) active.setAttribute("aria-describedby", previousDescriptionIds);
        else active.removeAttribute("aria-describedby");
      }
      active = null;
      previousDescriptionIds = null;
      setHint(null);
    };
    const show = (event: Event, immediate: boolean) => {
      const field = controlFrom(event.target);
      if (!field || (event.type === "pointerover" && field === active)) return;
      clear();
      active = field;
      previousDescriptionIds = field.getAttribute("aria-describedby");
      const label = fieldLabel(field);
      const display = () => {
        if (!active || !active.isConnected) return clear();
        active.setAttribute("aria-describedby", "global-field-tooltip");
        const currentRect = active.getBoundingClientRect();
        const placement = currentRect.bottom + 96 <= window.innerHeight ? "bottom" : "top";
        const y = placement === "bottom" ? currentRect.bottom + 8 : Math.max(8, currentRect.top - 8);
        setHint({ label, description: fieldDescription(active, label), x: Math.min(Math.max(currentRect.left + currentRect.width / 2, 170), window.innerWidth - 170), y, placement });
      };
      if (immediate) display();
      else timer = setTimeout(display, 450);
    };
    const onPointerOver = (event: Event) => show(event, false);
    const onPointerOut = (event: Event) => {
      const field = controlFrom(event.target);
      const next = controlFrom((event as PointerEvent).relatedTarget);
      if (field && field === active && next !== field) clear();
    };
    const onFocusIn = (event: Event) => show(event, true);
    const onFocusOut = (event: Event) => {
      const field = controlFrom(event.target);
      const next = controlFrom((event as FocusEvent).relatedTarget);
      if (field && field === active && next !== field) clear();
    };
    const onScrollOrResize = () => { if (active) { const label = fieldLabel(active); const rect = active.getBoundingClientRect(); const placement = rect.bottom + 96 <= window.innerHeight ? "bottom" : "top"; const y = placement === "bottom" ? rect.bottom + 8 : Math.max(8, rect.top - 8); setHint({ label, description: fieldDescription(active, label), x: Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170), y, placement }); } };
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      clear();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  return hint ? <div id="global-field-tooltip" role="tooltip" className={`pointer-events-none fixed z-[100] w-max max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-[var(--betanor-dark-navy)] px-3 py-2 text-xs leading-5 text-white shadow-xl ${hint.placement === "top" ? "-translate-y-full" : ""}`} style={{ left: hint.x, top: hint.y }}><span className="font-semibold">{hint.label}:</span> {hint.description}</div> : null;
}
