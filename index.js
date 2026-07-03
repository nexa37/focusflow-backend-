import express from "express";
import cors from "cors";
import db from "./db.js";
import { crudRouter } from "./crud.js";
import { isPushConfigured, sendPushToAll } from "./push.js";
import { startReminderScheduler } from "./scheduler.js";
import { Router } from "express";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/tasks", crudRouter(db, "tasks", ["name", "due", "priority", "status", "notes"]));
app.use("/api/goals", crudRouter(db, "goals", ["name", "target", "progress", "notes"]));
app.use("/api/projects", crudRouter(db, "projects", ["name", "deadline", "status", "description", "notes"]));
app.use("/api/contacts", crudRouter(db, "contacts", ["name", "phone", "email", "follow_up", "notes"]));
app.use("/api/notes", crudRouter(db, "notes", ["title", "content", "date"]));

const remindersRouter = Router();
remindersRouter.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM reminders ORDER BY date ASC, time ASC").all());
});
remindersRouter.post("/", (req, res) => {
  const { title, date, time = "09:00", priority = "Medium", notes = "" } = req.body;
  if (!title || !date) return res.status(400).json({ error: "title and date are required" });
  const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    "INSERT INTO reminders (id, title, date, time, priority, notes, notified) VALUES (?, ?, ?, ?, ?, ?, 0)"
  ).run(id, title, date, time, priority, notes);
  res.status(201).json(db.prepare("SELECT * FROM reminders WHERE id = ?").get(id));
});
remindersRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM reminders WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const fields = ["title", "date", "time", "priority", "notes", "notified"];
  const updates = fields.filter((f) => req.body[f] !== undefined);
  if (updates.length) {
    const setClause = updates.map((f) => `${f} = ?`).join(", ");
    const values = updates.map((f) => req.body[f]);
    db.prepare(`UPDATE reminders SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
  }
  res.json(db.prepare("SELECT * FROM reminders WHERE id = ?").get(req.params.id));
});
remindersRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM reminders WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
app.use("/api/reminders", remindersRouter);

app.get("/api/push/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, configured: isPushConfigured() });
});

app.post("/api/push/subscribe", (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Invalid subscription object" });
  }
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    db.prepare(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
    ).run(id, endpoint, keys.p256dh, keys.auth);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

app.post("/api/push/unsubscribe", (req, res) => {
  const { endpoint } = req.body;
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  res.status(204).end();
});

app.post("/api/push/test", async (req, res) => {
  const result = await sendPushToAll(db, {
    title: "FocusFlow",
    body: "Push notifications are working",
    tag: "test",
    url: "/",
  });
  res.json(result);
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`FocusFlow server running on port ${PORT}`);
  startReminderScheduler(db);
});
