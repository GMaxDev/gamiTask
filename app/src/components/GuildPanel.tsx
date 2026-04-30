import { useState } from "react";
import type { GuildData } from "../net/types";

interface GuildPanelProps {
  guild: GuildData | null;           // null = pas dans une guilde
  onClose: () => void;
  onCreateGuild: (name: string) => void;
  onJoinGuild: (guildId: string) => void;
  onLeaveGuild: () => void;
  localUserId: string;
}

const BOSS_NAMES: Record<number, string> = {
  1: "L'Ombre Distraite",
  2: "Le Tyran des Deadlines",
  3: "Le Chaos Absolu",
  4: "La Procrastination Éternelle",
  5: "Le Néant Productif",
};

function bossName(level: number): string {
  return BOSS_NAMES[Math.min(level, 5)] ?? `Boss Lv.${level}`;
}

export function GuildPanel({
  guild,
  onClose,
  onCreateGuild,
  onJoinGuild,
  onLeaveGuild,
  localUserId,
}: GuildPanelProps) {
  const [createName, setCreateName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [tab, setTab] = useState<"info" | "join">("info");

  const hpPct = guild ? Math.max(0, (guild.bossHp / guild.bossMaxHp) * 100) : 0;
  const hpColor = hpPct > 60 ? "#5ecf6a" : hpPct > 30 ? "#e0ae32" : "#cc4444";

  return (
    <div id="guild-overlay">
      <div id="guild-panel">
        <button id="guild-close-btn" onClick={onClose} aria-label="Fermer">✕</button>

        {guild && guild.id ? (
          /* ── Vue guilde actuelle ── */
          <>
            <div id="guild-header">
              <span id="guild-icon">⚔️</span>
              <div>
                <div id="guild-name">{guild.name}</div>
                <div id="guild-level">QG niveau {guild.level} · {guild.members.length} membres</div>
              </div>
            </div>

            {/* ── Boss ── */}
            <div className="guild-section">
              <div className="guild-section-title">🐉 Boss collectif</div>
              <div id="guild-boss-name">{bossName(guild.bossLevel)} <span className="guild-boss-lv">Lv.{guild.bossLevel}</span></div>
              <div id="guild-boss-bar-wrap">
                <div
                  id="guild-boss-bar"
                  style={{ width: `${hpPct}%`, background: hpColor }}
                />
              </div>
              <div id="guild-boss-hp">
                {guild.bossHp} / {guild.bossMaxHp} HP
              </div>
              <div id="guild-boss-hint">
                🍅 Chaque pomo inflige 10 dégâts · 👥 Pomo collectif : 15 dégâts
                <br />⚠️ Daily ratée : le boss récupère 5 HP · 🏆 Défaite : +{50 * guild.bossLevel}🪙 par membre
              </div>
              {guild.bossDefeated > 0 && (
                <div id="guild-boss-defeated">🏆 Boss vaincu {guild.bossDefeated} fois</div>
              )}
            </div>

            {/* ── Membres ── */}
            <div className="guild-section">
              <div className="guild-section-title">👥 Membres</div>
              <div id="guild-members">
                {guild.members.map((m) => (
                  <div key={m.userId} className="guild-member">
                    <span
                      className="guild-member-dot"
                      style={{ background: m.isOnline ? "#7a8e4a" : "#a89880" }}
                      title={m.isOnline ? "En ligne" : "Hors ligne"}
                    />
                    <span
                      className="guild-member-name"
                      style={{ color: `#${m.color.toString(16).padStart(6, "0")}` }}
                    >
                      {m.name}
                    </span>
                    {m.isOwner && <span className="guild-owner-badge">👑</span>}
                    {m.userId === localUserId && <span className="guild-self-badge">toi</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* ── ID de guilde (pour inviter) ── */}
            <div className="guild-section">
              <div className="guild-section-title">🔗 Inviter</div>
              <div id="guild-id-wrap">
                <code id="guild-id">{guild.id}</code>
                <button
                  id="guild-copy-btn"
                  onClick={() => navigator.clipboard.writeText(guild.id)}
                  title="Copier l'ID"
                >
                  📋
                </button>
              </div>
              <div id="guild-id-hint">Partage cet ID pour que d'autres joueurs rejoignent ta guilde.</div>
            </div>

            <button id="guild-leave-btn" onClick={onLeaveGuild}>
              Quitter la guilde
            </button>
          </>
        ) : (
          /* ── Vue sans guilde ── */
          <>
            <div id="guild-header">
              <span id="guild-icon">⚔️</span>
              <div>
                <div id="guild-name">Guildes</div>
                <div id="guild-level">Rejoins ou crée ta guilde pour combattre le Boss collectif</div>
              </div>
            </div>

            <div id="guild-tabs">
              <button
                className={`guild-tab${tab === "info" ? " active" : ""}`}
                onClick={() => setTab("info")}
              >
                ✨ Créer
              </button>
              <button
                className={`guild-tab${tab === "join" ? " active" : ""}`}
                onClick={() => setTab("join")}
              >
                🚪 Rejoindre
              </button>
            </div>

            {tab === "info" ? (
              <div className="guild-form">
                <label className="guild-form-label">Nom de la guilde</label>
                <input
                  className="guild-input"
                  type="text"
                  maxLength={30}
                  placeholder="Ex: Les Pomodoros Fous"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && createName.trim()) {
                      onCreateGuild(createName.trim());
                      setCreateName("");
                    }
                  }}
                />
                <button
                  className="guild-action-btn"
                  disabled={!createName.trim()}
                  onClick={() => {
                    if (createName.trim()) {
                      onCreateGuild(createName.trim());
                      setCreateName("");
                    }
                  }}
                >
                  ⚔️ Créer la guilde
                </button>
              </div>
            ) : (
              <div className="guild-form">
                <label className="guild-form-label">ID de la guilde</label>
                <input
                  className="guild-input"
                  type="text"
                  placeholder="Colle l'ID partagé par un ami"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && joinId.trim()) {
                      onJoinGuild(joinId.trim());
                      setJoinId("");
                    }
                  }}
                />
                <button
                  className="guild-action-btn"
                  disabled={!joinId.trim()}
                  onClick={() => {
                    if (joinId.trim()) {
                      onJoinGuild(joinId.trim());
                      setJoinId("");
                    }
                  }}
                >
                  🚪 Rejoindre
                </button>
              </div>
            )}

            <div id="guild-no-guild-hint">
              🐉 Chaque pomo que tu fais inflige des dégâts au Boss de ta guilde.
              <br />
              🏆 Vaincre le boss récompense tous les membres en pièces.
              <br />
              ⚠️ Rater tes dailies fait récupérer le boss.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
