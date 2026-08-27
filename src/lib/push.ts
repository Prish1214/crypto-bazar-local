import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const DEAL_REQUESTS_CHANNEL = "deal_requests";
export const CHAT_MESSAGES_CHANNEL = "chat_messages";

let initialized = false;
let lastToken: string | null = null;

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function loadPlugin() {
  const mod = await import("@capacitor/push-notifications");
  return mod.PushNotifications;
}

async function saveToken(userId: string, token: string) {
  lastToken = token;
  await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform: Capacitor.getPlatform?.() ?? "android",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
}

/** Register the device for push and persist the FCM token. Native only. */
export async function initPushNotifications(userId: string) {
  if (!isNative() || !userId) return;

  try {
    const PushNotifications = await loadPlugin();

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    if (!initialized) {
      initialized = true;

      await PushNotifications.createChannel({
        id: DEAL_REQUESTS_CHANNEL,
        name: "Deal requests",
        description: "New deal requests and escrow updates",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
        lights: true,
      });

      await PushNotifications.createChannel({
        id: CHAT_MESSAGES_CHANNEL,
        name: "Chat messages",
        description: "New messages from your counterparties",
        importance: 3,
        visibility: 1,
        vibration: false,
      });

      PushNotifications.addListener("registration", (t) => {
        void saveToken(userId, t.value).catch((e) =>
          console.warn("[push] token save failed", e),
        );
      });

      PushNotifications.addListener("registrationError", (e) => {
        console.warn("[push] registration error", e);
      });
    }

    await PushNotifications.register();
  } catch (e) {
    console.warn("[push] init failed", e);
  }
}

/** Remove this device's token on sign-out. */
export async function clearPushToken(userId?: string | null) {
  if (!isNative()) return;
  try {
    const PushNotifications = await loadPlugin();
    await PushNotifications.removeAllListeners();
    initialized = false;

    if (lastToken) {
      await supabase.from("push_tokens").delete().eq("token", lastToken);
    } else if (userId) {
      await supabase.from("push_tokens").delete().eq("user_id", userId);
    }
    lastToken = null;
  } catch (e) {
    console.warn("[push] clear failed", e);
  }
}
