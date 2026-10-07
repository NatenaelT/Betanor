"use client";

import { useEffect, useRef, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "betanor-pwa-install-dismissed-until";
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

function isIosDevice() {
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export function PwaRuntime() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const updateAcceptedRef = useRef(false);

  useEffect(() => {
    const initialStateTimer = window.setTimeout(() => {
      setInstalled(isInstalled());
      setIos(isIosDevice());
      try {
        const dismissedUntil = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
        setDismissed(dismissedUntil > Date.now());
      } catch {
        setDismissed(false);
      }
    }, 0);

    if ("serviceWorker" in navigator && window.isSecureContext && process.env.NODE_ENV === "production") {
      let registration: ServiceWorkerRegistration | undefined;
      const checkWaitingWorker = () => {
        if (registration?.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }
      };
      const onControllerChange = () => {
        if (updateAcceptedRef.current) window.location.reload();
      };
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((value) => {
        registration = value;
        checkWaitingWorker();
        registration.addEventListener("updatefound", () => {
          const installing = registration?.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") checkWaitingWorker();
          });
        });
      }).catch(() => undefined);
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

      const onVisibility = () => {
        if (document.visibilityState === "visible") void registration?.update().catch(() => undefined);
      };
      document.addEventListener("visibilitychange", onVisibility);

      const onInstallPrompt = (event: Event) => {
        event.preventDefault();
        setInstallEvent(event as InstallPromptEvent);
      };
      const onInstalled = () => {
        setInstalled(true);
        setInstallEvent(null);
        setDismissed(true);
      };
      window.addEventListener("beforeinstallprompt", onInstallPrompt);
      window.addEventListener("appinstalled", onInstalled);

      return () => {
        window.clearTimeout(initialStateTimer);
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("beforeinstallprompt", onInstallPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(initialStateTimer);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismissInstall() {
    setDismissed(true);
    setIosHelpOpen(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_FOR_MS));
    } catch {
      // The install prompt remains dismissible for the current session.
    }
  }

  async function install() {
    if (!installEvent) {
      setIosHelpOpen((open) => !open);
      return;
    }
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === "accepted") setInstalled(true);
      else dismissInstall();
    } catch {
      setInstallEvent(null);
    }
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    updateAcceptedRef.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  const showInstall = !installed && !dismissed && Boolean(installEvent || ios);

  return <>
    {waitingWorker ? <div className="pwa-safe-notice z-[70]" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-[var(--betanor-border)] bg-white p-3 shadow-xl sm:p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--betanor-nav-bg)] text-sm font-bold text-white" aria-hidden="true">B</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--betanor-navy)]">A new version of Betanor is available.</p><p className="mt-0.5 text-xs text-[var(--betanor-muted)]">Save unfinished changes before refreshing.</p></div>
        <button type="button" onClick={applyUpdate} className="min-h-11 shrink-0 rounded-lg bg-[var(--betanor-button-bg)] px-3 text-xs font-semibold text-[var(--betanor-button-text)]">Update now</button>
        <button type="button" onClick={() => setWaitingWorker(null)} aria-label="Dismiss update notice" className="grid size-11 shrink-0 place-items-center rounded-lg text-lg text-[var(--betanor-muted)] hover:bg-slate-100">×</button>
      </div>
    </div> : null}
    {showInstall ? <div className="pwa-safe-notice z-[55]" role="region" aria-label="Install Betanor">
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-[var(--betanor-border)] bg-white p-3 shadow-xl sm:p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--betanor-nav-bg)] text-sm font-bold text-white" aria-hidden="true">B</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Install Betanor</p><p className="mt-0.5 text-xs leading-5 text-[var(--betanor-muted)]">Open your secure workspace as an app on this device.</p>
          {iosHelpOpen ? <p className="mt-2 rounded-lg bg-[var(--betanor-surface)] px-3 py-2 text-xs leading-5 text-[var(--betanor-text)]">In Safari, tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.</p> : null}
        </div>
        <button type="button" onClick={() => void install()} className="min-h-11 shrink-0 rounded-lg bg-[var(--betanor-button-bg)] px-3 text-xs font-semibold text-[var(--betanor-button-text)]">{ios ? "How to install" : "Install"}</button>
        <button type="button" onClick={dismissInstall} aria-label="Dismiss install suggestion" className="grid size-11 shrink-0 place-items-center rounded-lg text-lg text-[var(--betanor-muted)] hover:bg-slate-100">×</button>
      </div>
    </div> : null}
  </>;
}
