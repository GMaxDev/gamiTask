import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (opts: {
            client_id: string;
            callback: (res: { credential: string }) => void;
          }) => void;
          renderButton: (
            el: HTMLElement,
            opts: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

export interface AuthResult {
  userId: string;
  token: string;
  name: string;
  color: number;
  isAdmin: boolean;
  isGoogleUser: boolean;
}

interface Props {
  onAuth: (result: AuthResult) => void;
  onGuest: () => void;
}

const SERVER = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function AuthScreen({ onAuth, onGuest }: Props) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCredential = async (credential: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = (await res.json()) as AuthResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      localStorage.setItem("gamitask-jwt", data.token);
      onAuth(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const initGSI = () => {
    if (!window.google) {
      // Script may have loaded but google not ready yet — retry
      setTimeout(initGSI, 200);
      return;
    }
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
      callback: (response) => handleCredential(response.credential),
    });
    if (btnRef.current) {
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        locale: "fr",
        width: 280,
        shape: "pill",
      });
    }
  };

  useEffect(() => {
    // If GSI is already loaded (from a previous render), initialize immediately
    if (window.google) {
      initGSI();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGSI;
    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div id="auth-overlay">
      <div id="auth-dialog">
        <div id="auth-logo">🎮</div>
        <h1 id="auth-title">GamiTask</h1>
        <p id="auth-subtitle">Salle de coworking gamifiée</p>

        {loading && <div className="auth-status">Connexion en cours…</div>}
        {error && <div className="auth-error">{error}</div>}

        <div id="google-signin-btn" ref={btnRef} />

        <div className="auth-separator">
          <span>ou</span>
        </div>

        <button id="auth-guest-btn" onClick={onGuest}>
          Continuer en mode invité
        </button>

        <p id="auth-note">
          En mode invité, ta progression est liée à ce navigateur uniquement.
        </p>
      </div>
    </div>
  );
}
