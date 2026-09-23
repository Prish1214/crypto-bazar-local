import { Capacitor } from "@capacitor/core";

/**
 * Marks <html> with `native-app` when running inside the Capacitor Android/iOS
 * shell. The stylesheet uses this class to drop GPU-expensive effects
 * (backdrop-filter blurs, masked overlays, fixed gradient backgrounds) that
 * make the Android WebView stall — visible as a frozen page / dead text caret
 * while the soft keyboard is open.
 */
export function markNativePlatform(): boolean {
  if (typeof document === "undefined") return false;
  let native = false;
  try {
    native = Capacitor.isNativePlatform();
  } catch {
    native = false;
  }
  document.documentElement.classList.toggle("native-app", native);
  return native;
}
