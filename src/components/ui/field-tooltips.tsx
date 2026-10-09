"use client";

import { useEffect, useState } from "react";

type Hint = { label: string; description: string; x: number; y: number; placement: "top" | "bottom" };
type Field = HTMLElement;
const fieldSelector = "input:not([type='hidden']):not([type='submit']):not([type='reset']):not([type='button']):not([type='image']), select, textarea, [contenteditable='true']";
const actionSelector = "button:not([data-field-info-trigger]), input[type='submit'], input[type='button'], input[type='reset'], [role='button']:not([data-field-info-trigger])";

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

function makeInfoButton(isAction = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.fieldInfoTrigger = "true";
  button.setAttribute("aria-label", "Show field information");
  button.setAttribute("aria-expanded", "false");
  button.className = `inline-grid size-3 shrink-0 place-items-center rounded-full border border-[var(--betanor-border)] bg-white text-[8px] font-bold leading-none text-[var(--betanor-muted)] align-middle transition-colors hover:border-[var(--betanor-gold)] hover:bg-amber-50 hover:text-[var(--betanor-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--betanor-blue)] ${isAction ? "self-center" : "mt-0.5 self-start"}`;
  button.textContent = "i";
  return button;
}

function makeActionInfoBadge() {
  const badge = document.createElement("span");
  badge.dataset.fieldInfoTrigger = "true";
  badge.dataset.fieldInfoKind = "action";
  badge.setAttribute("aria-hidden", "true");
  badge.className = "ml-1 inline-grid size-3 shrink-0 cursor-help place-items-center rounded-full border border-current bg-transparent text-[8px] font-bold leading-none opacity-80 transition-opacity hover:opacity-100";
  badge.textContent = "i";
  return badge;
}

function actionDescription(label: string, action: HTMLElement) {
  const custom = action.getAttribute("data-tooltip") || action.getAttribute("title");
  if (custom?.trim()) return custom.trim();

  const name = label.toLocaleLowerCase();
  if (/delete|remove|revoke|disconnect|discard|reject/.test(name)) return "This action removes or deletes the selected item, subject to your permissions and the record's retention rules. Check the selected record before continuing.";
  if (/archive/.test(name)) return "Moves this item out of the active view while retaining its record and history.";
  if (/save|update|edit|create|add|new|publish|submit|approve|send|reply|assign/.test(name)) return `Use this action to ${name} the current record. Review the displayed details before continuing.`;
  if (/download|export|print/.test(name)) return `Use this action to ${name} the current item or its available file.`;
  if (/search|filter|apply|clear|reset/.test(name)) return `Use this action to ${name} the current view or form criteria.`;
  if (/open|view|show|close|cancel|back|restore|sign out|log out|menu/.test(name)) return `Use this control to ${name} or navigate this area.`;
  return `Use this control for: ${label}.`;
}

function actionLabel(action: HTMLElement) {
  const explicit = action.getAttribute("aria-label") || action.getAttribute("title") || action.getAttribute("data-tooltip");
  if (explicit?.trim()) return explicit.trim().replace(/\s+/g, " ");
  if (action instanceof HTMLInputElement && action.value.trim()) return action.value.trim();
  const text = (action.textContent || "").replace(/\s+/g, " ").trim();
  return text || "Action";
}

function addActionInfoButton(action: HTMLElement) {
  if (action.hasAttribute("data-tooltip-ignore") || action.getAttribute("aria-hidden") === "true") return;
  const existingBadge = action.querySelector<HTMLElement>("[data-field-info-trigger][data-field-info-kind='action']");
  if (action.hasAttribute("data-field-info-enhanced") && existingBadge) return;
  if (!existingBadge) action.removeAttribute("data-field-info-enhanced");
  const label = actionLabel(action);
  if (label === "Action" && !action.hasAttribute("aria-label") && !action.hasAttribute("title") && !action.hasAttribute("data-tooltip")) return;

  const description = actionDescription(label, action);
  action.setAttribute("aria-description", description);
  if (action instanceof HTMLInputElement) {
    const info = makeInfoButton(true);
    info.dataset.fieldInfoKind = "action";
    info.dataset.fieldInfoLabel = label;
    info.dataset.fieldInfoDescription = description;
    info.setAttribute("aria-label", `Show information for ${label}`);
    action.after(info);
  } else {
    const badge = makeActionInfoBadge();
    badge.dataset.fieldInfoLabel = label;
    badge.dataset.fieldInfoDescription = description;
    action.append(badge);
  }
  action.setAttribute("data-field-info-enhanced", "true");
}

function addLabelInfoButton(label: HTMLLabelElement) {
  const labelText = (label.textContent || "").replace(/\s+/g, " ").trim();
  const hiddenLabel = label.classList.contains("sr-only") || label.classList.contains("visually-hidden") || label.classList.contains("screen-reader-only");
  if (!labelText || hiddenLabel || label.getAttribute("aria-hidden") === "true") return;

  const next = label.nextElementSibling;
  if (next instanceof HTMLButtonElement && next.hasAttribute("data-field-info-trigger")) return;
  if (label.querySelector("[data-field-info-trigger]")) return;

  const field = controlFor(label);
  if (field && label.contains(field)) {
    const info = makeInfoButton();
    let controlNode: Node = field;
    while (controlNode.parentNode && controlNode.parentNode !== label) controlNode = controlNode.parentNode;

    if (controlNode.parentNode === label) {
      const header = document.createElement("span");
      header.className = "inline-flex max-w-full min-w-0 items-start gap-1";
      const precedingNodes: Node[] = [];
      let node = label.firstChild;
      while (node && node !== controlNode) {
        precedingNodes.push(node);
        node = node.nextSibling;
      }
      const precedingText = precedingNodes.map((item) => item.textContent || "").join("").trim();
      const followingNodes: Node[] = [];
      let sibling = controlNode.nextSibling;
      while (sibling) {
        followingNodes.push(sibling);
        sibling = sibling.nextSibling;
      }
      const useFollowing = !precedingText && followingNodes.length > 0;
      const nodesToWrap = useFollowing ? followingNodes : precedingNodes;
      const insertBefore = useFollowing ? controlNode.nextSibling : controlNode;
      if (nodesToWrap.length) {
        label.insertBefore(header, insertBefore);
        nodesToWrap.forEach((item) => header.append(item));
        header.append(info);
      } else {
        label.insertBefore(info, controlNode);
      }
    } else {
      field.before(info);
    }
    return;
  }

  const parent = label.parentElement;
  if (!parent) return;

  const row = document.createElement("span");
  row.className = "inline-flex max-w-full min-w-0 items-start gap-1 align-top";
  row.dataset.fieldInfoLabelRow = "true";
  label.style.flex = "0 1 auto";
  label.style.display = "inline-block";
  label.style.width = "auto";
  label.style.minWidth = "0";
  label.style.maxWidth = "100%";
  label.style.marginBottom = "0";
  parent.insertBefore(row, label);
  row.append(label, makeInfoButton());
}

export function FieldTooltips() {
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    let activeButton: HTMLElement | null = null;
    let activeField: Field | null = null;
    let previousDescriptionIds: string | null = null;
    let actionId = 0;

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

    const show = (button: HTMLElement) => {
      if (activeButton === button) { clear(); return; }
      clear();
      const previous = button.previousElementSibling;
      if (button.dataset.fieldInfoKind === "action") {
        const action = button.closest<HTMLElement>("button, a, [role='button']") ?? (previous instanceof HTMLElement ? previous : null);
        if (!action) return;
        activeButton = button;
        activeField = action;
        previousDescriptionIds = action.getAttribute("aria-describedby");
        button.setAttribute("aria-expanded", "true");
        if (!action.id) action.id = `field-help-action-${++actionId}`;
        action.setAttribute("aria-describedby", [previousDescriptionIds, "global-field-tooltip"].filter(Boolean).join(" "));
        const label = button.dataset.fieldInfoLabel || actionLabel(action);
        setHint({ label, description: button.dataset.fieldInfoDescription || actionDescription(label, action), ...tooltipPosition(button) });
        return;
      }
      const labelElement = button.closest("label") ?? (previous instanceof HTMLLabelElement
        ? previous
        : button.closest("[data-field-info-label-row]")?.querySelector<HTMLLabelElement>("label[for]") ?? null);
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
        labels.forEach(addLabelInfoButton);
      }
    };

    const enhanceNode = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(fieldSelector)) enhanceField(node as Field);
      node.querySelectorAll<Field>(fieldSelector).forEach(enhanceField);
      if (node.matches(actionSelector)) addActionInfoButton(node as HTMLElement);
      node.querySelectorAll<HTMLElement>(actionSelector).forEach(addActionInfoButton);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLElement>("[data-field-info-trigger]");
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
      records.forEach((record) => {
        if (record.target instanceof Element && record.target.matches(actionSelector)) addActionInfoButton(record.target as HTMLElement);
        if (record.target instanceof HTMLLabelElement) addLabelInfoButton(record.target);
        record.addedNodes.forEach(enhanceNode);
      });
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
