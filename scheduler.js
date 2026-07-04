import { sendPushToAll } from "./push.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

const MAX_REPEATS = 5;
const REPEAT_GAP_MS = 2 * 60 * 1000;

export function startReminderScheduler(db) {
  async function tick() {
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const due = db
        .prepare(
          `SELECT * FROM reminders
           WHERE notified = 0
             AND notify_count < ?
             AND (date < ? OR (date = ? AND time <= ?))`
        )
        .all(MAX_REPEATS, todayStr, todayStr, timeStr);

      for (const reminder of due) {
        if (reminder.last_notified_at) {
          const lastSent = new Date(reminder.last_notified_at).getTime();
          if (now.getTime() - lastSent < REPEAT_GAP_MS) continue;
        }

        const attemptNumber = reminder.notify_count + 1;
        const isLastAttempt = attemptNumber >= MAX_REPEATS;

        await sendPushToAll(db, {
          title: `Reminder: ${reminder.title}`,
          body: reminder.notes || `Priority: ${reminder.priority}`,
          tag: `reminder-${reminder.id}`,
          url: "/",
        });

        db.prepare(
          "UPDATE reminders SET notify_count = ?, last_notified_at = ?, notified = ? WHERE id = ?"
        ).run(attemptNumber, now.toISOString(), isLastAttempt ? 1 : 0, reminder.id);
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    }
  }

  tick();
  const interval = setInterval(
