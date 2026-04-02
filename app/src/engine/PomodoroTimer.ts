export type PomodoroPhase = "focus" | "short-break" | "long-break";
export type PomodoroStatus = "idle" | "running" | "paused";

export interface PomodoroConfig {
  focus: number; // minutes
  shortBreak: number; // minutes
  longBreak: number; // minutes
}

export const DEFAULT_CONFIG: PomodoroConfig = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
};

export interface PomodoroState {
  phase: PomodoroPhase;
  status: PomodoroStatus;
  remaining: number; // seconds
  session: number; // how many focus sessions completed
}

export type PomodoroEvent =
  | { type: "tick"; remaining: number }
  | { type: "status-change"; status: PomodoroStatus }
  | { type: "phase-change"; phase: PomodoroPhase; remaining: number };

const DEFAULT_DURATIONS: Record<PomodoroPhase, number> = {
  focus: DEFAULT_CONFIG.focus * 60,
  "short-break": DEFAULT_CONFIG.shortBreak * 60,
  "long-break": DEFAULT_CONFIG.longBreak * 60,
};

type Listener = (event: PomodoroEvent) => void;

export class PomodoroTimer {
  private durations: Record<PomodoroPhase, number> = { ...DEFAULT_DURATIONS };

  private state: PomodoroState = {
    phase: "focus",
    status: "idle",
    remaining: DEFAULT_DURATIONS["focus"],
    session: 0,
  };

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private endTime: number | null = null; // absolute timestamp when current phase ends
  private listeners: Listener[] = [];

  constructor(config?: PomodoroConfig) {
    if (config) {
      this.applyConfig(config);
      this.state = { ...this.state, remaining: this.durations["focus"] };
    }
  }

  setDurations(config: PomodoroConfig): void {
    this.applyConfig(config);
  }

  private applyConfig(config: PomodoroConfig): void {
    this.durations["focus"] = Math.max(1, config.focus) * 60;
    this.durations["short-break"] = Math.max(1, config.shortBreak) * 60;
    this.durations["long-break"] = Math.max(1, config.longBreak) * 60;
  }

  getState(): Readonly<PomodoroState> {
    return this.state;
  }

  on(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: PomodoroEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  toggle(): void {
    if (this.state.status === "running") {
      this.pause();
    } else {
      this.start();
    }
  }

  start(): void {
    if (this.state.status === "running") return;
    // Use absolute end time so background throttling doesn't affect accuracy
    this.endTime = Date.now() + this.state.remaining * 1000;
    this.state = { ...this.state, status: "running" };
    this.emit({ type: "status-change", status: "running" });

    this.intervalId = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((this.endTime! - Date.now()) / 1000));
      if (remaining <= 0) {
        this.advance();
      } else {
        this.state = { ...this.state, remaining };
        this.emit({ type: "tick", remaining });
      }
    }, 500);
  }

  pause(): void {
    if (this.state.status !== "running") return;
    // Compute accurate remaining before pausing
    const remaining = this.endTime
      ? Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000))
      : this.state.remaining;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.endTime = null;
    this.state = { ...this.state, status: "paused", remaining };
    this.emit({ type: "status-change", status: "paused" });
  }

  reset(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.endTime = null;
    this.state = {
      phase: "focus",
      status: "idle",
      remaining: this.durations["focus"],
      session: 0,
    };
    this.emit({
      type: "phase-change",
      phase: "focus",
      remaining: this.state.remaining,
    });
    this.emit({ type: "status-change", status: "idle" });
  }

  private advance(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.endTime = null;

    let nextPhase: PomodoroPhase;
    let nextSession = this.state.session;

    if (this.state.phase === "focus") {
      nextSession += 1;
      nextPhase = nextSession % 4 === 0 ? "long-break" : "short-break";
    } else {
      nextPhase = "focus";
    }

    this.state = {
      phase: nextPhase,
      status: "idle",
      remaining: this.durations[nextPhase],
      session: nextSession,
    };

    this.emit({
      type: "phase-change",
      phase: nextPhase,
      remaining: this.state.remaining,
    });
    this.emit({ type: "status-change", status: "idle" });
  }

  destroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.endTime = null;
  }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
