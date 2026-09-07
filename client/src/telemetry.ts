const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/log`;
const session = Math.random().toString(36).slice(2, 10);

/** Fire-and-forget line to the server's client log: device facts, errors, and the mobile gate/fullscreen events. */
export function log(event: string, data: Record<string, unknown> = {}): void {
  const body = JSON.stringify({ session, event, ...data });
  if (navigator.sendBeacon?.(BASE, new Blob([body], { type: "application/json" }))) return;
  fetch(BASE, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch((err: unknown) => console.info("log send failed:", err));
}

export function deviceFacts(): Record<string, unknown> {
  return {
    ua: navigator.userAgent,
    platform: navigator.platform,
    touchPoints: navigator.maxTouchPoints,
    coarse: window.matchMedia("(pointer: coarse)").matches,
    screen: [screen.width, screen.height],
    inner: [window.innerWidth, window.innerHeight],
    dpr: window.devicePixelRatio,
    standalone: window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches,
    fullscreenApi: !!(document.documentElement.requestFullscreen || (document.documentElement as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen),
    lang: navigator.language,
  };
}

export function installErrorLogging(): void {
  window.addEventListener("error", (e) => log("error", { message: e.message, source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack?.slice(0, 1500) }));
  window.addEventListener("unhandledrejection", (e) => log("unhandledrejection", { reason: String(e.reason).slice(0, 1500), stack: (e.reason as { stack?: string })?.stack?.slice(0, 1500) }));
}
