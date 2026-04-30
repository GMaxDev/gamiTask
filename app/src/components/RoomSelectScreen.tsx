import { useState } from "react";
import type { RoomId, RoomSummary } from "../net/types";

interface Props {
  rooms: RoomSummary[];
  onSelect: (roomId: RoomId) => void;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  initialRoomId?: RoomId;
  /** User's own userId — used to gate the "create private room" button & show the owner's delete button. */
  userId?: string;
  /** Whether this user can create a private room (Google-authenticated only). */
  canCreatePrivate?: boolean;
  /** Called when the user confirms creation of a private room. */
  onCreatePrivate?: (name: string) => void;
  /** Called when the owner deletes their private room. */
  onDeletePrivate?: () => void;
}

function hexToCss(hex: number): string {
  return "#" + hex.toString(16).padStart(6, "0");
}

function RoomCard({
  room,
  selected,
  onSelect,
  disabled,
  badge,
}: {
  room: RoomSummary;
  selected: boolean;
  onSelect: (id: RoomId) => void;
  disabled: boolean;
  badge?: string;
}) {
  const accentCss = hexToCss(room.accent);
  const bgCss = hexToCss(room.background);
  const floorCss = hexToCss(room.floorTint);
  return (
    <button
      type="button"
      className={`room-card${selected ? " selected" : ""}${
        disabled ? " disabled" : ""
      }${room.isPrivate ? " private" : ""}`}
      style={{
        background: `linear-gradient(160deg, ${bgCss} 0%, ${floorCss} 100%)`,
        borderColor: accentCss,
      }}
      onClick={() => !disabled && onSelect(room.id)}
      disabled={disabled}
    >
      {badge ? <div className="room-card-badge">{badge}</div> : null}
      <div className="room-card-emoji">{room.emoji}</div>
      <div className="room-card-name" style={{ color: accentCss }}>
        {room.name}
      </div>
      <div className="room-card-desc">{room.description}</div>
      <div className="room-card-count">
        👥 {room.count} / {room.capacity}
      </div>
      <div
        className="room-card-cta"
        style={{ background: disabled ? "#a89880" : accentCss }}
      >
        {disabled ? "Pleine" : "Entrer →"}
      </div>
    </button>
  );
}

export function RoomSelectScreen({
  rooms,
  onSelect,
  onBack,
  title = "Choisis ta room",
  subtitle = "Chaque room a sa propre ambiance. Tu pourras en changer à tout moment.",
  initialRoomId,
  userId,
  canCreatePrivate,
  onCreatePrivate,
  onDeletePrivate,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");

  const publicRooms = rooms.filter((r) => !r.isPrivate);
  const privateRooms = rooms.filter((r) => r.isPrivate);
  const myRoom = userId
    ? privateRooms.find((r) => r.ownerId === userId)
    : undefined;
  const otherPrivateRooms = userId
    ? privateRooms.filter((r) => r.ownerId !== userId)
    : privateRooms;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim().slice(0, 30);
    if (!trimmed || !onCreatePrivate) return;
    onCreatePrivate(trimmed);
    setDraftName("");
    setCreating(false);
  };

  return (
    <div id="room-select-overlay">
      <div id="room-select-dialog">
        <h1 id="room-select-title">{title}</h1>
        <p id="room-select-subtitle">{subtitle}</p>

        <div className="room-select-section-title">Rooms publiques</div>
        <div id="room-select-grid">
          {publicRooms.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              selected={initialRoomId === r.id}
              onSelect={onSelect}
              disabled={r.count >= r.capacity && initialRoomId !== r.id}
            />
          ))}
        </div>

        <div className="room-select-section-title">Rooms privées</div>
        {!canCreatePrivate && privateRooms.length === 0 ? (
          <div className="room-select-locked">
            🔒 Connecte-toi avec un compte Google pour créer ta propre room
            privée (10 personnes max, déco persistante).
          </div>
        ) : (
          <div id="room-select-grid">
            {myRoom ? (
              <RoomCard
                key={myRoom.id}
                room={myRoom}
                selected={initialRoomId === myRoom.id}
                onSelect={onSelect}
                disabled={false}
                badge="🔑 La tienne"
              />
            ) : null}
            {otherPrivateRooms.map((r) => (
              <RoomCard
                key={r.id}
                room={r}
                selected={initialRoomId === r.id}
                onSelect={onSelect}
                disabled={r.count >= r.capacity && initialRoomId !== r.id}
              />
            ))}
            {canCreatePrivate && !myRoom && !creating && (
              <button
                type="button"
                className="room-card room-card-create"
                onClick={() => setCreating(true)}
              >
                <div className="room-card-emoji">➕</div>
                <div className="room-card-name">Créer ma room</div>
                <div className="room-card-desc">
                  10 personnes max. Tu décores comme tu veux, style Habbo.
                </div>
                <div className="room-card-cta">Créer →</div>
              </button>
            )}
            {!canCreatePrivate && privateRooms.length > 0 && (
              <div className="room-select-locked" style={{ gridColumn: "1 / -1" }}>
                🔒 Connecte-toi avec un compte Google pour créer ta propre room privée.
              </div>
            )}
            {creating && (
                <form
                  className="room-card room-card-create-form"
                  onSubmit={handleCreate}
                >
                  <div className="room-card-emoji">🏠</div>
                  <label className="room-create-label">
                    Nom de ta room
                  </label>
                  <input
                    type="text"
                    autoFocus
                    maxLength={30}
                    placeholder="Ex: Chill zone"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="room-create-input"
                  />
                  <div className="room-create-actions">
                    <button
                      type="button"
                      className="room-create-cancel"
                      onClick={() => {
                        setCreating(false);
                        setDraftName("");
                      }}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="room-create-submit"
                      disabled={!draftName.trim()}
                    >
                      Créer
                    </button>
                  </div>
                </form>
              )}
          </div>
        )}

        {myRoom && onDeletePrivate && (
          <button
            type="button"
            id="room-delete-btn"
            onClick={() => {
              if (confirm(`Supprimer ta room "${myRoom.name}" ?`)) {
                onDeletePrivate();
              }
            }}
          >
            🗑️ Supprimer ma room
          </button>
        )}

        {onBack ? (
          <button type="button" id="room-select-back" onClick={onBack}>
            ← Retour
          </button>
        ) : null}
      </div>
    </div>
  );
}
