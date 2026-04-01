import { useState } from "react";

interface FeedbackModalProps {
  userName: string;
  onClose: () => void;
}

type FeedbackType = "bug" | "idea";
type Status = "idle" | "loading" | "success" | "error";

export function FeedbackModal({ userName, onClose }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title: title.trim(), description: description.trim(), userName }),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      const data = await res.json() as { number: number; url: string };
      setIssueUrl(data.url);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="feedback-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="feedback-modal">
        <button className="feedback-close" onClick={onClose} aria-label="Fermer">✕</button>

        {status === "success" ? (
          <div className="feedback-success">
            <div className="feedback-success-icon">✅</div>
            <h2>Merci !</h2>
            <p>Ton retour a bien été soumis sur GitHub.</p>
            {issueUrl && (
              <a href={issueUrl} target="_blank" rel="noreferrer" className="feedback-issue-link">
                Voir l'issue →
              </a>
            )}
            <button className="feedback-btn-primary" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="feedback-form">
            <h2 className="feedback-title">
              {type === "bug" ? "🐛 Signaler un bug" : "💡 Soumettre une idée"}
            </h2>

            <div className="feedback-type-toggle">
              <button
                type="button"
                className={`feedback-type-btn ${type === "bug" ? "active" : ""}`}
                onClick={() => setType("bug")}
              >
                🐛 Bug
              </button>
              <button
                type="button"
                className={`feedback-type-btn ${type === "idea" ? "active" : ""}`}
                onClick={() => setType("idea")}
              >
                💡 Idée
              </button>
            </div>

            <label className="feedback-label">
              Titre
              <input
                className="feedback-input"
                type="text"
                placeholder={type === "bug" ? "Ex : Le timer s'arrête tout seul" : "Ex : Ajouter un mode nuit"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
              />
            </label>

            <label className="feedback-label">
              Description
              <textarea
                className="feedback-textarea"
                placeholder={type === "bug"
                  ? "Décris ce qui se passe, comment reproduire le bug..."
                  : "Décris ton idée en détail..."}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={2000}
                required
              />
            </label>

            {status === "error" && (
              <p className="feedback-error">Une erreur est survenue. Réessaie dans un instant.</p>
            )}

            <button
              type="submit"
              className="feedback-btn-primary"
              disabled={status === "loading" || !title.trim() || !description.trim()}
            >
              {status === "loading" ? "Envoi…" : "Envoyer"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
