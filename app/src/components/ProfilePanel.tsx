import type { ProfileData } from "../net/types";
import { SHOP_ITEMS } from "../net/types";

const ACHIEVEMENTS_DEF: Array<{ key: string; label: string; desc: string; icon: string }> = [
  { key: "first-task",       label: "1ère tâche",       desc: "Première tâche complétée",        icon: "✅" },
  { key: "task-10",          label: "10 tâches",         desc: "10 tâches complétées",            icon: "🔟" },
  { key: "task-50",          label: "50 tâches",         desc: "50 tâches complétées",            icon: "🏆" },
  { key: "first-pomo",       label: "1er Pomodoro",      desc: "Premier pomodoro terminé",        icon: "🍅" },
  { key: "streak-5",         label: "Streak ×5",         desc: "5 pomodoros consécutifs",         icon: "🔥" },
  { key: "coins-100",        label: "100 pièces",        desc: "100 pièces accumulées",           icon: "💰" },
  { key: "coins-500",        label: "500 pièces",        desc: "500 pièces accumulées",           icon: "👑" },
  { key: "first-collective", label: "Pomo collectif",    desc: "Premier pomo collectif terminé",  icon: "🌐" },
];

const DEGRADATION_LABELS = ["✨ Impeccable", "🌿 Propre", "🟡 Légère poussière", "🟠 Négligé", "🔴 Dégradé", "💀 Abandonné"];

interface Props {
  data: ProfileData;
  isOwnProfile: boolean;
  onClose: () => void;
}

export function ProfilePanel({ data, isOwnProfile, onClose }: Props) {
  const colorHex = `#${data.color.toString(16).padStart(6, "0")}`;
  const xpPct = data.xpToNext > 0 ? Math.floor((data.xpProgress / data.xpToNext) * 100) : 100;
  const hatEmoji = data.hat ? (SHOP_ITEMS.find((s) => s.id === data.hat)?.emoji ?? null) : null;

  return (
    <div id="profile-overlay" onClick={onClose}>
      <div id="profile-panel" onClick={(e) => e.stopPropagation()}>
        <button id="profile-close-btn" onClick={onClose} aria-label="Fermer">✕</button>

        {/* En-tête avatar */}
        <div id="profile-header">
          <div id="profile-avatar-wrap">
            {hatEmoji && <span id="profile-hat">{hatEmoji}</span>}
            <div id="profile-avatar" style={{ background: colorHex }}>
              <span id="profile-avatar-initial">{data.name.charAt(0).toUpperCase()}</span>
            </div>
          </div>
          <div id="profile-info">
            <div id="profile-name">
              {data.name}
              {data.isAdmin && <span id="profile-admin-badge">👑 Admin</span>}
              {isOwnProfile && <span id="profile-self-badge">Moi</span>}
            </div>
            <div id="profile-level">Niveau {data.level}</div>
          </div>
        </div>

        {/* Barre XP */}
        <div className="profile-section">
          <div className="profile-xp-label">
            <span>XP</span>
            <span>{data.xpProgress} / {data.xpToNext}</span>
          </div>
          <div className="profile-xp-bar">
            <div className="profile-xp-fill" style={{ width: `${xpPct}%` }} />
          </div>
        </div>

        {/* Stats */}
        <div id="profile-stats">
          <div className="profile-stat">
            <span className="profile-stat-icon">🪙</span>
            <span className="profile-stat-value">{data.coins}</span>
            <span className="profile-stat-label">pièces</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-icon">🔥</span>
            <span className="profile-stat-value">{data.streak}</span>
            <span className="profile-stat-label">streak</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-icon">🏠</span>
            <span className="profile-stat-value">{data.degradation}</span>
            <span className="profile-stat-label">dégradation</span>
          </div>
        </div>

        {/* Dégradation label */}
        <div id="profile-degradation-label">
          {DEGRADATION_LABELS[Math.min(5, data.degradation)]}
        </div>

        {/* Succès */}
        <div className="profile-section">
          <div className="profile-section-title">Succès ({data.achievements.length}/{ACHIEVEMENTS_DEF.length})</div>
          <div id="profile-achievements">
            {ACHIEVEMENTS_DEF.map((ach) => {
              const unlocked = data.achievements.includes(ach.key);
              return (
                <div
                  key={ach.key}
                  className={`profile-achievement${unlocked ? " unlocked" : " locked"}`}
                  title={ach.desc}
                >
                  <span className="profile-ach-icon">{ach.icon}</span>
                  <span className="profile-ach-label">{ach.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
