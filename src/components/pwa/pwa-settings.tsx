"use client";

import { useState } from "react";

import { usePwaInstall } from "@/components/pwa/pwa-runtime";

const CACHE_PREFIX = "betanor-platform";

export function PwaSettings() {
  const { canInstall, isInstalled, isIos, requestInstall, networkMode, lowDataMode, setNetworkMode } = usePwaInstall();
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function install() {
    if (isIos || !canInstall) {
      setShowIosHelp((current) => !current);
      return;
    }
    const outcome = await requestInstall();
    if (outcome === "accepted") setFeedback("Betanor was added to this device.");
    else if (outcome === "dismissed") setFeedback("Installation was dismissed. You can try again here later.");
    else setShowIosHelp(true);
  }

  async function clearAppCache() {
    setBusy(true);
    setFeedback("");
    try {
      let clearedByWorker = false;
      const worker = "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
      if (worker) {
        const channel = new MessageChannel();
        try {
          clearedByWorker = await new Promise<boolean>((resolve) => {
            const timeout = window.setTimeout(() => { channel.port1.close(); resolve(false); }, 4000);
            channel.port1.onmessage = (event: MessageEvent<{ ok?: boolean }>) => {
              window.clearTimeout(timeout);
              resolve(event.data?.ok === true);
              channel.port1.close();
            };
            worker.postMessage({ type: "CLEAR_CACHE" }, [channel.port2]);
          });
        } catch {
          channel.port1.close();
        }
      }
      if (!clearedByWorker && "caches" in window) {
        const names = await window.caches.keys();
        await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => window.caches.delete(name)));
      }
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update().catch(() => undefined);
      }
      setFeedback("App cache cleared. Refreshing Betanor…");
      window.setTimeout(() => window.location.reload(), 500);
    } catch {
      setFeedback("The app cache could not be cleared. Please refresh the page and try again.");
      setBusy(false);
    }
  }

  return <div className="grid gap-4">
    <section aria-labelledby="network-mode-heading" className="rounded-2xl border border-[var(--betanor-border)] bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl"><h2 id="network-mode-heading" className="text-base font-semibold text-[var(--betanor-navy)]">Network mode</h2><p className="mt-1 text-sm leading-5 text-[var(--betanor-muted)]">Reduce background network use on limited or unreliable connections. Betanor never caches private records or claims that offline changes have been saved.</p><p className="mt-2 text-xs font-medium text-[var(--betanor-blue)]">Current: {lowDataMode ? "Low-data mode" : "Standard mode"}</p></div>
        <label className="grid min-w-48 gap-1.5 text-xs font-semibold text-[var(--betanor-navy)]">Choose a mode<select value={networkMode} onChange={(event) => setNetworkMode(event.target.value as "auto" | "on" | "off")} className="min-h-10 rounded-lg border border-[var(--betanor-field-border)] bg-white px-3 text-sm font-normal"><option value="auto">Automatic (recommended)</option><option value="on">Low-data mode on</option><option value="off">Low-data mode off</option></select></label>
      </div>
    </section>

    <section aria-labelledby="install-app-heading" className="rounded-2xl border border-[var(--betanor-border)] bg-gradient-to-br from-sky-50 via-white to-amber-50 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--betanor-navy)] text-white" aria-hidden="true"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M10 17h4"/></svg></span>
          <div className="min-w-0"><h2 id="install-app-heading" className="text-base font-semibold text-[var(--betanor-navy)]">Install Betanor</h2><p className="mt-1 text-sm leading-5 text-[var(--betanor-muted)]">Keep the platform a tap away, with a full-screen app experience. This option stays here in Settings and does not cover your screen.</p></div>
        </div>
        {isInstalled ? <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">Installed on this device</span> : <button type="button" onClick={() => void install()} className="min-h-10 shrink-0 rounded-lg bg-[var(--betanor-button-bg)] px-4 text-sm font-semibold text-[var(--betanor-button-text)] hover:opacity-90">{isIos || !canInstall ? "How to install" : "Install app"}</button>}
      </div>
      {showIosHelp ? <div className="mt-4 rounded-xl border border-white/80 bg-white/80 p-4 text-sm leading-6 text-[var(--betanor-text)]">
        {isIos ? <><p className="font-semibold text-[var(--betanor-navy)]">Install on iPhone or iPad</p><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Open <span className="font-medium">betanor.et</span> in Safari.</li><li>Tap <span className="font-medium">Share</span>, then <span className="font-medium">Add to Home Screen</span>.</li><li>Turn on <span className="font-medium">Open as Web App</span>, then tap <span className="font-medium">Add</span>.</li></ol><p className="mt-2 text-xs text-[var(--betanor-muted)]">If “Add to Home Screen” is not shown, use Edit Actions in the Share menu to enable it.</p><a className="mt-2 inline-flex text-xs font-semibold text-[var(--betanor-blue)] underline" href="https://support.apple.com/en-in/guide/iphone/iphea86e5236/ios" target="_blank" rel="noreferrer">Apple’s installation guide</a></> : <><p className="font-semibold text-[var(--betanor-navy)]">Install from your browser</p><p className="mt-1">Open the browser menu and choose <span className="font-medium">Install app</span> or <span className="font-medium">Add to Home screen</span>. On supported browsers, the install button appears here automatically.</p></>}
      </div> : null}
    </section>

    <section aria-labelledby="clear-cache-heading" className="rounded-2xl border border-[var(--betanor-border)] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 id="clear-cache-heading" className="text-base font-semibold text-[var(--betanor-navy)]">Refresh app files</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--betanor-muted)]">Clear saved Betanor app assets and load the latest version. Your login, profile, emails, and other saved data are not removed.</p></div><button type="button" onClick={() => void clearAppCache()} disabled={busy} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-4 text-sm font-semibold text-[var(--betanor-navy)] transition hover:border-[var(--betanor-blue)] hover:text-[var(--betanor-blue)] disabled:opacity-60">{busy ? "Refreshing…" : "Clear app cache"}</button></div>
      {feedback ? <p role="status" aria-live="polite" className="mt-3 text-xs text-[var(--betanor-muted)]">{feedback}</p> : null}
    </section>
  </div>;
}
