import webpush from "web-push";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL || "mailto:admin@example.com";

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(CONTACT_EMAIL, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
} else {
  console.warn(
    "[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push notifications are disabled until you generate and set them. See README."
  );
}

export function isPushConfigured() {
  return configured;
}

export async function sendPushToAll(db, payload) {
  if (!configured) return { sent: 0, skipped: true };
  const subs = db.prepare("SELECT * FROM push_subscriptions").all();
  let sent = 0;
  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
      } else {
        console.error("[push] send failed:", err.statusCode, err.message);
      }
    }
  }
  return { sent, skipped: false };
}
