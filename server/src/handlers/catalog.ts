import { canEdit } from "../auth.js";
import { sanitizeItem } from "../catalog.js";
import { sql, catalogItems, type UserRow } from "../db.js";
import { socketToUserId } from "../rooms.js";
import type { IoServer, AppSocket } from "../context.js";

export function registerCatalog(socket: AppSocket, io: IoServer): void {
  // ── Catalogue editor ─────────────────────────────────────────────────────
  function canEditCatalog(): boolean {
    const uid = socketToUserId.get(socket.id);
    const u = uid ? (sql.getUser.get(uid) as UserRow | undefined) : undefined;
    return !!u && canEdit(u.role);
  }
  socket.on("catalog:save", ({ item }) => {
    if (!canEditCatalog()) return;
    const clean = sanitizeItem(item);
    if (!clean) { socket.emit("catalog:error", { message: "Objet invalide." }); return; }
    sql.upsertItem.run(clean.id, JSON.stringify(clean), Date.now());
    io.emit("catalog:state", { items: catalogItems() });
  });
  socket.on("catalog:delete", ({ id }) => {
    if (!canEditCatalog()) return;
    sql.deleteItem.run(id);
    io.emit("catalog:state", { items: catalogItems() });
  });
}
