import { Router } from "express";

export function crudRouter(db, table, fields) {
  const router = Router();

  router.get("/", (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all();
    res.json(rows);
  });

  router.post("/", (req, res) => {
    const id = `${table.slice(0, 1)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cols = ["id", ...fields];
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map((c) => (c === "id" ? id : req.body[c] ?? null));
    db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`).run(...values);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    res.status(201).json(row);
  });

  router.patch("/:id", (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updates = fields.filter((f) => req.body[f] !== undefined);
    if (updates.length === 0) return res.json(existing);
    const setClause = updates.map((f) => `${f} = ?`).join(", ");
    const values = updates.map((f) => req.body[f]);
    db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    res.json(row);
  });

  router.delete("/:id", (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    res.status(204).end();
  });

  return router;
}
