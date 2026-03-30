import { useState, useRef, useEffect } from "react";
import type { Task } from "../net/types";

const CATEGORIES = [
  { id: "work", label: "Boulot", color: "#4f8ef7" },
  { id: "perso", label: "Perso", color: "#5ecf6a" },
  { id: "urgent", label: "Urgent", color: "#f97316" },
  { id: "study", label: "Étude", color: "#a78bfa" },
] as const;

interface TaskPanelProps {
  tasks: Task[];
  coins: number;
  degradation: number;
  level: number;
  lastTaskCoinGain: number;
  onAdd: (text: string, category: string | null, type: "task" | "daily") => void;
  onUpdate: (taskId: string, text: string, category: string | null) => void;
  onToggle: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onCleanRoom: (levels: number) => void;
}

const DEGRADATION_LABELS = ["✨ Propre", "🌫 Légère poussière", "🕸 Poussiéreux", "🌧 Sale", "💀 Très dégradé", "☠ Abandon total"];
const DEGRADATION_COLORS = ["#5ecf6a", "#a3c45a", "#d4a444", "#e07832", "#cc4444", "#991111"];

export function TaskPanel({
  tasks,
  coins,
  degradation,
  level,
  lastTaskCoinGain,
  onAdd,
  onUpdate,
  onToggle,
  onDelete,
  onCleanRoom,
}: TaskPanelProps) {
  const [input, setInput] = useState("");
  const [addCategory, setAddCategory] = useState<string | null>(null);
  const [addType, setAddType] = useState<"task" | "daily">("task");
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string | "none" | "daily" | null>(null);
  const [completing, setCompleting] = useState<string[]>([]);
  const [collapsing, setCollapsing] = useState<string[]>([]);
  const [cleanLevels, setCleanLevels] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const text = input.trim();
    if (!text) return;
    onAdd(text, addCategory, addType);
    setInput("");
    setAddCategory(null);
    // Conserver le type sélectionné pour faciliter l'ajout de plusieurs dailies d'affilée
  };

  const handleToggle = (task: Task) => {
    if (completing.includes(task.id) || collapsing.includes(task.id)) return;

    if (task.type === "daily") {
      // Daily : toggle simple sans suppression, recheckable
      onToggle(task.id);
      return;
    }

    // Tâche régulière : animation de complétion puis suppression
    if (task.done) return; // ne peut pas décocher une tâche régulière
    onToggle(task.id);
    setCompleting((prev) => [...prev, task.id]);

    const t1 = setTimeout(() => {
      setCompleting((prev) => prev.filter((id) => id !== task.id));
      setCollapsing((prev) => [...prev, task.id]);

      const t2 = setTimeout(() => {
        onDelete(task.id);
        setCollapsing((prev) => prev.filter((id) => id !== task.id));
        timers.current.delete(task.id + ":collapse");
      }, 380);
      timers.current.set(task.id + ":collapse", t2);
      timers.current.delete(task.id);
    }, 2200);
    timers.current.set(task.id, t1);
  };

  const startEdit = (task: Task) => {
    if (task.done && task.type !== "daily") return;
    setEditingId(task.id);
    setEditText(task.text);
    setEditCategory(task.category);
  };

  const commitEdit = (taskId: string) => {
    const text = editText.trim();
    if (text) onUpdate(taskId, text, editCategory);
    setEditingId(null);
  };

  const handleEditKey = (e: React.KeyboardEvent<HTMLInputElement>, taskId: string) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(taskId); }
    if (e.key === "Escape") setEditingId(null);
  };

  const visibleTasks =
    filterCat === null
      ? tasks
      : filterCat === "daily"
        ? tasks.filter((t) => t.type === "daily")
        : filterCat === "none"
          ? tasks.filter((t) => t.category === null && t.type !== "daily")
          : tasks.filter((t) => t.category === filterCat);

  const regularTasks = tasks.filter((t) => t.type === "task");
  const dailyTasks = tasks.filter((t) => t.type === "daily");
  const doneDailies = dailyTasks.filter((t) => t.done).length;

  const visibleForCount = visibleTasks.filter(
    (t) => !completing.includes(t.id) && !collapsing.includes(t.id),
  );
  const total = visibleForCount.length;
  const done = visibleForCount.filter((t) => t.done).length;

  return (
    <div id="task-panel">
      <div id="task-panel-header">
        <span id="task-panel-title">📋 Mes tâches</span>
        <span id="coins-display">🪙 {coins}</span>
      </div>

      {/* ── Indicateur de dégradation ── */}
      {degradation > 0 && (
        <div id="degradation-bar" style={{ "--deg-color": DEGRADATION_COLORS[degradation] } as React.CSSProperties}>
          <span id="degradation-label">
            <span id="degradation-icon">☣</span>
            {DEGRADATION_LABELS[degradation]}
          </span>
          <div id="clean-controls">
            <button
              className="clean-step-btn"
              onClick={() => setCleanLevels((v) => Math.max(1, v - 1))}
              disabled={cleanLevels <= 1}
            >− 1 niv</button>
            <button
              id="clean-room-btn"
              onClick={() => { onCleanRoom(cleanLevels); setCleanLevels(1); }}
              disabled={coins < 50 * cleanLevels}
            >
              🧹 {cleanLevels} niv&nbsp;<span className="clean-cost">−{50 * cleanLevels}🪙</span>
            </button>
            <button
              className="clean-step-btn"
              onClick={() => setCleanLevels((v) => Math.min(degradation, v + 1))}
              disabled={cleanLevels >= degradation}
            >+ 1 niv</button>
          </div>
          <span id="clean-alt-hint">🍅 1 pomo = 1 niv nettoyé</span>
        </div>
      )}

      {/* ── Immunité débutant ── */}
      {dailyTasks.length > 0 && level < 5 && (
        <div id="immunity-badge">
          🛡 Immunité Lv {level}/5 — les dailies ratées ne dégradent pas encore
        </div>
      )}

      {/* ── Daily task progress ── */}
      {dailyTasks.length > 0 && (
        <div id="daily-progress-bar-wrap">
          <div id="daily-progress-label">
            🔄 {doneDailies}/{dailyTasks.length} quotidiennes
          </div>
          <div id="daily-progress-bar">
            <div
              id="daily-progress-fill"
              style={{ width: `${dailyTasks.length > 0 ? (doneDailies / dailyTasks.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div id="task-filter-bar">
        <button
          className={`task-filter-btn${filterCat === null ? " active" : ""}`}
          onClick={() => setFilterCat(null)}
        >
          Tout
        </button>
        <button
          className={`task-filter-btn${filterCat === "daily" ? " active daily-filter" : " daily-filter-off"}`}
          onClick={() => setFilterCat((f) => (f === "daily" ? null : "daily"))}
        >
          🔄 Daily {dailyTasks.length > 0 && `(${doneDailies}/${dailyTasks.length})`}
        </button>
        <button
          className={`task-filter-btn${filterCat === "none" ? " active" : ""}`}
          onClick={() => setFilterCat((f) => (f === "none" ? null : "none"))}
        >
          —
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`task-filter-btn${filterCat === c.id ? " active" : ""}`}
            style={filterCat === c.id ? { borderColor: c.color, color: c.color } : {}}
            onClick={() => setFilterCat((f) => (f === c.id ? null : c.id))}
          >
            <span className="task-cat-dot" style={{ background: c.color }} />
            {c.label}
          </button>
        ))}
      </div>

      {total > 0 && filterCat !== "daily" && regularTasks.length > 0 && (
        <div id="task-progress">
          <div
            id="task-progress-bar"
            style={{ width: `${(done / total) * 100}%` }}
          />
          <span id="task-progress-label">
            {done}/{total}
          </span>
        </div>
      )}

      <div id="task-list">
        {visibleTasks.filter(
          (t) => !completing.includes(t.id) && !collapsing.includes(t.id),
        ).length === 0 &&
          completing.length === 0 && (
            <p id="task-empty">
              {filterCat !== null
                ? "Aucune tâche dans ce filtre."
                : "Aucune tâche pour l'instant."}
            </p>
          )}
        {visibleTasks.map((task) => {
          const isCompleting = completing.includes(task.id);
          const isCollapsing = collapsing.includes(task.id);
          const isEditing = editingId === task.id;
          const isDaily = task.type === "daily";
          const catColor = CATEGORIES.find((c) => c.id === task.category)?.color;
          return (
            <div
              key={task.id}
              className={`task-item${task.done ? " done" : ""}${isCompleting ? " completing" : ""}${isCollapsing ? " collapsing" : ""}${isDaily ? " daily" : ""}`}
            >
              {isDaily && <span className="task-daily-icon" title="Tâche quotidienne">🔄</span>}
              <input
                type="checkbox"
                checked={task.done || isCompleting}
                onChange={() => handleToggle(task)}
                className="task-checkbox"
                readOnly={isCompleting || isCollapsing}
              />
              {catColor && !isEditing && (
                <span
                  className="task-cat-dot"
                  style={{ background: catColor }}
                  title={CATEGORIES.find((c) => c.id === task.category)?.label}
                />
              )}
              <span className="task-text">
                {isEditing ? (
                  <>
                    <input
                      ref={editInputRef}
                      className="task-edit-input"
                      value={editText}
                      maxLength={200}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => handleEditKey(e, task.id)}
                      onBlur={() => commitEdit(task.id)}
                    />
                    <div className="task-cat-picker">
                      <button
                        className={`task-cat-btn${editCategory === null ? " active" : ""}`}
                        style={{ background: "rgba(255,255,255,0.15)" }}
                        onMouseDown={(e) => { e.preventDefault(); setEditCategory(null); }}
                        title="Aucune"
                      />
                      {CATEGORIES.map((c) => (
                        <button
                          key={c.id}
                          className={`task-cat-btn${editCategory === c.id ? " active" : ""}`}
                          style={{ background: c.color }}
                          onMouseDown={(e) => { e.preventDefault(); setEditCategory(c.id); }}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <span
                    onDoubleClick={(e) => { e.preventDefault(); startEdit(task); }}
                    title={task.done && !isDaily ? "" : "Double-clic pour modifier"}
                    style={task.done && !isDaily ? undefined : { cursor: "text" }}
                  >
                    {task.text}
                  </span>
                )}
                {isCompleting && <span className="task-coin-pop">+{lastTaskCoinGain} 🪙</span>}
              </span>
              {!isCompleting && !isCollapsing && !isEditing && (
                <button
                  className="task-delete"
                  onClick={() => onDelete(task.id)}
                  aria-label="Supprimer"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div id="task-add-row">
        {/* Toggle task/daily */}
        <button
          id="task-type-toggle"
          className={addType === "daily" ? "daily-active" : ""}
          onClick={() => setAddType((t) => (t === "task" ? "daily" : "task"))}
          title={addType === "task" ? "Créer une tâche régulière (clic = daily)" : "Créer une tâche quotidienne (clic = régulière)"}
        >
          {addType === "task" ? "📋" : "🔄"}
        </button>
        <div className="task-cat-picker">
          <button
            className={`task-cat-btn${addCategory === null ? " active" : ""}`}
            style={{ background: "rgba(255,255,255,0.15)" }}
            onMouseDown={(e) => { e.preventDefault(); setAddCategory(null); }}
            title="Aucune"
          />
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`task-cat-btn${addCategory === c.id ? " active" : ""}`}
              style={{ background: c.color }}
              onMouseDown={(e) => { e.preventDefault(); setAddCategory(c.id); }}
              title={c.label}
            />
          ))}
        </div>
        <input
          id="task-input"
          type="text"
          placeholder={addType === "daily" ? "Nouvelle tâche quotidienne… (Entrée)" : "Nouvelle tâche… (Entrée)"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          maxLength={200}
        />
      </div>
    </div>
  );
}
