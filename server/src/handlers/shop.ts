import type { Look } from "../types.js";
import { sanitizeLook } from "../look.js";
import { MAX_GRID } from "../config.js";
import { sql, hatItem, furnitureItem, getFurniturePosPayload, type UserRow } from "../db.js";
import { socketToUserId, getRoom, getPlayer, userLook, broadcastToOwnRoom } from "../rooms.js";
import { allow } from "../rewards.js";
import type { AppSocket } from "../context.js";

export function registerShop(socket: AppSocket): void {
  // ── Acheter un meuble (Feng Shui) ────────────────────────────────────────────────────
  socket.on("furniture:buy", ({ itemId }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const item = furnitureItem(itemId);
    if (!item) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (owned.includes(itemId)) return;
    if (user.coins < item.price) return;
    sql.addCoins.run(-item.price, userId);
    const newOwned = [...owned, itemId].join(",");
    sql.setOwnedFurniture.run(newOwned, userId);
    const newPlacedOnBuy = (user.placedFurniture ?? "").split(",").filter(Boolean);
    const newPlacedList = [...newPlacedOnBuy, itemId];
    sql.setPlacedFurniture.run(newPlacedList.join(","), userId);
    const newCoins = (sql.getCoins.get(userId) as UserRow).coins;
    socket.emit("coins:update", { coins: newCoins });
    socket.emit("furniture:bought", { itemId, coins: newCoins });
    const buyPositionsPayload = getFurniturePosPayload(
      user.furniturePositions ?? "{}",
    );
    socket.emit("furniture:state", {
      owned: [...owned, itemId],
      placed: newPlacedList,
      positions: buyPositionsPayload,
    });
    const p = getPlayer(socket.id);
    if (p) p.coins = newCoins;
  });
  // ── Déplacer un meuble (Feng Shui) ─────────────────────────────────────────────
  socket.on("furniture:move", ({ itemId, col, row }) => {
    if (!allow(socket.id, "furniture:move", 20, 5000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const r = getRoom(socket.id);
    if (!r?.isPrivate || r.ownerId !== userId) return; // Placement uniquement dans sa propre room privée
    const item = furnitureItem(itemId);
    if (!item) return;
    if (col < 0 || col >= MAX_GRID || row < 0 || row >= MAX_GRID) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const positions = JSON.parse(
      (user.furniturePositions as string | null) ?? "{}",
    ) as Record<string, { col: number; row: number }>;
    positions[itemId] = { col, row };
    sql.setFurniturePositions.run(JSON.stringify(positions), userId);
    const movedPlaced = (user.placedFurniture ?? "").split(",").filter(Boolean);
    const movedPositionsPayload = getFurniturePosPayload(
      JSON.stringify(positions),
    );
    socket.emit("furniture:state", {
      owned,
      placed: movedPlaced,
      positions: movedPositionsPayload,
    });
  });
  // ── Ranger / Sortir un meuble de la chambre (toggle-place) ───────────────────
  socket.on("furniture:toggle-place", ({ itemId }) => {
    if (!allow(socket.id, "furniture:toggle-place", 20, 5000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const r = getRoom(socket.id);
    if (!r?.isPrivate || r.ownerId !== userId) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const placed = (user.placedFurniture ?? "").split(",").filter(Boolean);
    const newPlaced = placed.includes(itemId)
      ? placed.filter((id) => id !== itemId)
      : [...placed, itemId];
    sql.setPlacedFurniture.run(newPlaced.join(","), userId);
    const togglePositionsPayload = getFurniturePosPayload(
      user.furniturePositions ?? "{}",
    );
    socket.emit("furniture:state", {
      owned,
      placed: newPlaced,
      positions: togglePositionsPayload,
    });
  });
  // ── Confirmer le placement fantôme d'un meuble ─────────────────────────────
  socket.on("furniture:place", ({ itemId, col, row }) => {
    if (!allow(socket.id, "furniture:place", 20, 5000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const r = getRoom(socket.id);
    if (!r?.isPrivate || r.ownerId !== userId) return;
    const item = furnitureItem(itemId);
    if (!item) return;
    if (col < 0 || col >= MAX_GRID || row < 0 || row >= MAX_GRID) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const placedIds = (user.placedFurniture ?? "").split(",").filter(Boolean);
    const effectivePos = getFurniturePosPayload(
      user.furniturePositions ?? "{}",
    );
    for (const otherId of placedIds) {
      if (otherId !== itemId) {
        const pos = effectivePos[otherId];
        if (pos && pos.col === col && pos.row === row) return;
      }
    }
    const positions = JSON.parse(
      (user.furniturePositions as string | null) ?? "{}",
    ) as Record<string, { col: number; row: number }>;
    positions[itemId] = { col, row };
    sql.setFurniturePositions.run(JSON.stringify(positions), userId);
    const newPlacedAfter = placedIds.includes(itemId)
      ? placedIds
      : [...placedIds, itemId];
    sql.setPlacedFurniture.run(newPlacedAfter.join(","), userId);
    const placePositionsPayload = getFurniturePosPayload(
      JSON.stringify(positions),
    );
    socket.emit("furniture:state", {
      owned,
      placed: newPlacedAfter,
      positions: placePositionsPayload,
    });
  });
  // ── Acheter un item dans le shop ─────────────────────────────────────────────
  socket.on("shop:buy", ({ itemId }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const item = hatItem(itemId);
    if (!item) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedItems ?? "").split(",").filter(Boolean);
    if (owned.includes(itemId)) return;
    if (user.coins < item.price) return;
    sql.addCoins.run(-item.price, userId);
    const newOwned = [...owned, itemId].join(",");
    sql.setOwnedItems.run(newOwned, userId);
    const newCoins = (sql.getCoins.get(userId) as UserRow).coins;
    socket.emit("coins:update", { coins: newCoins });
    socket.emit("shop:bought", { itemId, coins: newCoins });
    socket.emit("cosmetics:state", {
      owned: [...owned, itemId],
      equippedHat: user.equippedHat ?? null,
      look: user.look ? userLook(user) : undefined,
    });
    const p = getPlayer(socket.id);
    if (p) p.coins = newCoins;
  });

  // ── Équiper / déséquiper un cosmétique ───────────────────────────────────────────
  socket.on("cosmetic:equip", ({ hatId }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (hatId !== null) {
      const user = sql.getUser.get(userId) as UserRow;
      const owned = (user.ownedItems ?? "").split(",").filter(Boolean);
      if (!owned.includes(hatId)) return;
    }
    sql.setEquippedHat.run(hatId, userId);
    const p = getPlayer(socket.id);
    if (p) p.hat = hatId;
    broadcastToOwnRoom(socket,"player-hat", { id: socket.id, hat: hatId });
    // Le look embarque aussi le chapeau : le rediffuser pour rester cohérent.
    if (p?.look) {
      const look: Look = { ...p.look, hat: hatId };
      p.look = look;
      broadcastToOwnRoom(socket,"player-look", { id: socket.id, look });
    }
  });

  // ── Mettre à jour son apparence ──────────────────────────────────────────────
  socket.on("look:update", ({ look: rawLook }) => {
    if (!allow(socket.id, "look:update", 5, 5000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const user = sql.getUser.get(userId) as UserRow | undefined;
    if (!user) return;
    const look = sanitizeLook(rawLook, user.equippedHat ?? null, user.avatarColor);
    sql.setLook.run(JSON.stringify(look), userId);
    // La couleur du t-shirt reste la couleur d'identité côté serveur.
    sql.setAvatarInfo.run(user.displayName, look.shirt, userId);
    const p = getPlayer(socket.id);
    if (p) {
      p.look = look;
      p.color = look.shirt;
    }
    broadcastToOwnRoom(socket,"player-look", { id: socket.id, look });
    socket.emit("cosmetics:state", {
      owned: (user.ownedItems ?? "").split(",").filter(Boolean),
      equippedHat: user.equippedHat ?? null,
      look,
    });
  });
}
