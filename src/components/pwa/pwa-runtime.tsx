"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaContextValue = {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  requestInstall: () => Promise<"accepted" | "dismissed" | "manual">;
};

const PwaContext = createContext<PwaContextValue>({
  canInstall: false,
  isInstalled: false,
  isIos: false,
  requestInstall: async () => "manual",
});

export function usePwaInstall() {
  return useContext(PwaContext);
}

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

function isIosDevice() {
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export function PwaRuntime({ children }: { children: ReactNode }) {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const ios = typeof window !== "undefined" && isIosDevice();
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isInstalled());
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const updateAcceptedRef = useRef(false);

  useEffect(() => {
    let registration: ServiceWorkerRegistration | undefined;
    const checkWaitingWorker = () => {
      if (registration?.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);
    };
    const onControllerChange = () => {
      if (updateAcceptedRef.current) window.location.reload();
    };
    if ("serviceWorker" in navigator && window.isSecureContext && process.env.NODE_ENV === "production") {
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
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => undefined);
    };
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    const onDisplayModeChange = () => setInstalled(isInstalled());
    const displayMode = window.matchMedia("(display-mode: standalone)");
    document.addEventListener("visibilitychange", onVisibility);
    displayMode.addEventListener?.("change", onDisplayModeChange);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
      displayMode.removeEventListener?.("change", onDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function requestInstall(): Promise<"accepted" | "dismissed" | "manual"> {
    if (!installEvent) return "manual";
    const currentEvent = installEvent;
    setInstallEvent(null);
    try {
      await currentEvent.prompt();
      const choice = await currentEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      return choice.outcome;
    } catch {
      return "manual";
    }
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    updateAcceptedRef.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  return <PwaContext.Provider value={{ canInstall: Boolean(installEvent), isInstalled: installed, isIos: ios, requestInstall }}>
    {children}
    {waitingWorker ? <div className="pwa-safe-notice z-[70]" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-[var(--betanor-border)] bg-white p-3 shadow-xl sm:p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--betanor-nav-bg)] text-sm font-bold text-white" aria-hidden="true">B</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--betanor-navy)]">A new version of Betanor is available.</p><p className="mt-0.5 text-xs text-[var(--betanor-muted)]">Save unfinished changes before refreshing.</p></div>
        <button type="button" onClick={applyUpdate} className="min-h-11 shrink-0 rounded-lg bg-[var(--betanor-button-bg)] px-3 text-xs font-semibold text-[var(--betanor-button-text)]">Update now</button>
        <button type="button" onClick={() => setWaitingWorker(null)} aria-label="Dismiss update notice" className="grid size-11 shrink-0 place-items-center rounded-lg text-lg text-[var(--betanor-muted)] hover:bg-slate-100">×</button>
      </div>
    </div> : null}
  </PwaContext.Provider>;
}
