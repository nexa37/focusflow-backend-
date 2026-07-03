import { sendPushToAll } from "./push.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

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
             AND (date < ? OR (date = ? AND time <= ?))`
        )
        .all(todayStr, todayStr, timeStr);

      for (const reminder of due) {
        await sendPushToAll(db, {
          title: `Reminder: ${reminder.title}`,
          body: reminder.notes || `Priority: ${reminder.priority}`,
          tag: `reminder-${reminder.id}`,
          url: "/",
        });
        db.prepare("UPDATE reminders SET notified = 1 WHERE id = ?").run(reminder.id);
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    }
  }

  tick();
  const interval = setInterval(tick, 60 * 1000);
  return () => clearInterval(interval);
}
