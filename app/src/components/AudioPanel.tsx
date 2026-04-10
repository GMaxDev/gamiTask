import { useState, useEffect } from "react";
import {
  setSoundsEnabled,
  getSoundsEnabled,
  setMasterVolume,
  getMasterVolume,
  setAmbientEnabled,
  getAmbientEnabled,
  setAmbientType,
  getAmbientType,
  playCoin,
  playPomoDone,
  playPomoBreak,
  playChatSpatial,
  playMention,
} from "../engine/SoundEngine";

type AmbientType = "cafe" | "pluie" | "nuit";

interface AudioPanelProps {
  onClose: () => void;
}

export function AudioPanel({ onClose }: AudioPanelProps) {
  const [enabled, setEnabled] = useState(getSoundsEnabled());
  const [volume, setVolume] = useState(getMasterVolume());
  const [ambientEnabled, setAmbientEnabledState] = useState(getAmbientEnabled());
  const [ambientType, setAmbientTypeState] = useState<AmbientType>(getAmbientType());

  useEffect(() => {
    setSoundsEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    setMasterVolume(volume);
  }, [volume]);

  useEffect(() => {
    setAmbientEnabled(ambientEnabled);
  }, [ambientEnabled]);

  useEffect(() => {
    setAmbientType(ambientType);
  }, [ambientType]);

  const handleTestSound = () => {
    playCoin();
  };

  return (
    <div className="feedback-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="feedback-modal audio-panel">
        <button className="feedback-close" onClick={onClose} aria-label="Fermer">✕</button>

        <h2 className="feedback-title">Paramètres Audio</h2>

        <div className="audio-settings">
          <div className="audio-setting">
            <label className="audio-label">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Activer les sons
            </label>
          </div>

          <div className="audio-setting">
            <label className="audio-label">
              Volume général: {Math.round(volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              disabled={!enabled}
              className="audio-slider"
            />
          </div>

          <div className="audio-setting">
            <label className="audio-label">
              <input
                type="checkbox"
                checked={ambientEnabled}
                onChange={(e) => setAmbientEnabledState(e.target.checked)}
                disabled={!enabled}
              />
              Ambiance en boucle
            </label>
          </div>

          <div className="audio-setting">
            <span className="audio-label">Ambiance choisie :</span>
            <div className="audio-radio-group">
              {[
                { value: "cafe" as AmbientType, label: "Café" },
                { value: "pluie" as AmbientType, label: "Pluie légère" },
                { value: "nuit" as AmbientType, label: "Nuit calme" },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`audio-radio-label${ambientType === option.value ? " active" : ""}`}
                >
                  <input
                    type="radio"
                    name="ambientType"
                    value={option.value}
                    checked={ambientType === option.value}
                    onChange={() => setAmbientTypeState(option.value)}
                    disabled={!enabled || !ambientEnabled}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div className="audio-setting audio-preview-group">
            <button
              className="feedback-btn-primary"
              onClick={handleTestSound}
              disabled={!enabled}
            >
              Tester le son
            </button>
          </div>

          <div className="audio-preview-buttons">
            <button
              type="button"
              className="audio-preview-btn"
              onClick={() => playPomoDone()}
              disabled={!enabled}
            >
              Son Pomodoro
            </button>
            <button
              type="button"
              className="audio-preview-btn"
              onClick={() => playPomoBreak()}
              disabled={!enabled}
            >
              Son Pause
            </button>
            <button
              type="button"
              className="audio-preview-btn"
              onClick={() => playChatSpatial(0)}
              disabled={!enabled}
            >
              Son Chat
            </button>
            <button
              type="button"
              className="audio-preview-btn"
              onClick={() => playMention()}
              disabled={!enabled}
            >
              Son Mention
            </button>
          </div>
        </div>

        <div className="audio-info">
          <p>🎵 Sons disponibles :</p>
          <ul>
            <li>• Notifications de tâches (pomodoro)</li>
            <li>• Sons de pièces gagnées</li>
            <li>• Messages de chat (spatial)</li>
            <li>• Mentions @nom</li>
            <li>• Ambiances en boucle (Café, Pluie, Nuit)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}