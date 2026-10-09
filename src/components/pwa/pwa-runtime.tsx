"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type NetworkMode = "auto" | "on" | "off";

type PwaContextValue = {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  networkMode: NetworkMode;
  lowDataMode: boolean;
  isOffline: boolean;
  requestInstall: () => Promise<"accepted" | "dismissed" | "manual">;
  setNetworkMode: (mode: NetworkMode) => void;
};

const PwaContext = createContext<PwaContextValue>({
  canInstall: false,
  isInstalled: false,
  isIos: false,
  networkMode: "auto",
  lowDataMode: false,
  isOffline: false,
  requestInstall: async () => "manual",
  setNetworkMode: () => undefined,
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

function getConnection() {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean; effectiveType?: string } }).connection;
}

function initialNetworkMode(): NetworkMode {
  if (typeof window === "undefined") return "auto";
  try {
    const storedMode = window.localStorage.getItem("betanor-network-mode");
    if (storedMode === "auto" || storedMode === "on" || storedMode === "off") return storedMode;
  } catch { /* use automatic detection if device storage is unavailable */ }
  return "auto";
}

export function PwaRuntime({ children }: { children: ReactNode }) {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const ios = typeof window !== "undefined" && isIosDevice();
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isInstalled());
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [networkMode, setNetworkModeState] = useState<NetworkMode>(initialNetworkMode);
  const [detectedLowData, setDetectedLowData] = useState(() => {
    const connection = getConnection();
    return Boolean(connection?.saveData || /^(slow-2g|2g)$/.test(connection?.effectiveType || ""));
  });
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const updateAcceptedRef = useRef(false);
  const lowDataMode = networkMode === "on" || (networkMode === "auto" && detectedLowData);

  function setNetworkMode(mode: NetworkMode) {
    setNetworkModeState(mode);
    try { window.localStorage.setItem("betanor-network-mode", mode); } catch { /* storage can be unavailable in private mode */ }
  }

  useEffect(() => {
    const connection = getConnection();
    const updateNetwork = () => {
      const isOffline = !navigator.onLine;
      setOffline(isOffline);
      if (!isOffline) setOfflineDismissed(false);
      setDetectedLowData(Boolean(connection?.saveData || /^(slow-2g|2g)$/.test(connection?.effectiveType || "")));
    };
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    connection?.addEventListener("change", updateNetwork);
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
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      connection?.removeEventListener("change", updateNetwork);
      document.removeEventListener("visibilitychange", onVisibility);
      displayMode.removeEventListener?.("change", onDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sendMode = (worker: ServiceWorker | null) => worker?.postMessage({ type: "SET_NETWORK_MODE", lowDataMode });
    sendMode(navigator.serviceWorker.controller);
    void navigator.serviceWorker.ready.then((registration) => sendMode(registration.active)).catch(() => undefined);
  }, [lowDataMode]);

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

  return <PwaContext.Provider value={{ canInstall: Boolean(installEvent), isInstalled: installed, isIos: ios, networkMode, lowDataMode, isOffline: offline, requestInstall, setNetworkMode }}>
    {(offline && !offlineDismissed) || lowDataMode || waitingWorker ? <div className="relative z-10 mx-auto w-full max-w-7xl space-y-2 px-3 pt-2 sm:px-5" aria-live="polite">
      {offline && !offlineDismissed ? <div role="status" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950 sm:px-4"><p className="min-w-0 flex-1">You appear to be offline. Betanor keeps this screen available; saving or sending needs a connection.</p><button type="button" onClick={() => setOfflineDismissed(true)} aria-label="Dismiss offline notice" className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-700"><span aria-hidden="true" className="text-sm leading-none">×</span><span>Dismiss</span></button></div> : null}
      {!offline && lowDataMode ? <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs leading-5 text-blue-950">Low-data mode is on. Background traffic is reduced; reconnect or retry if a page takes longer to load.</p> : null}
      {waitingWorker ? <div className="flex flex-col gap-3 rounded-2xl border border-[var(--betanor-border)] bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--betanor-nav-bg)] text-sm font-bold text-white" aria-hidden="true">B</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--betanor-navy)]">A new version of Betanor is available.</p><p className="mt-0.5 text-xs text-[var(--betanor-muted)]">Save unfinished changes before refreshing.</p></div>
        <div className="flex shrink-0 gap-2"><button type="button" onClick={applyUpdate} className="min-h-10 rounded-lg bg-[var(--betanor-button-bg)] px-3 text-xs font-semibold text-[var(--betanor-button-text)]">Update now</button><button type="button" onClick={() => setWaitingWorker(null)} aria-label="Dismiss update notice" className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-[var(--betanor-border)] text-lg text-[var(--betanor-muted)] hover:bg-slate-100">×</button></div>
      </div> : null}
    </div> : null}
    {children}
  </PwaContext.Provider>;
}
