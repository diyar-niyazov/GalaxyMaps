import { useStore } from "../state/store";
import { restoreView, type ViewSnapshot } from "../state/navigation";
import { focusObject } from "../state/actions";

export interface ImmersivePresentation {
  start(): Promise<void>;
  dispose(): void;
}

/** Owns even a session acquired before a lazy import or renderer initialization fails. */
export class ImmersiveEntry {
  private session: XRSession | null = null;
  private presentation: ImmersivePresentation | null = null;
  private finished = false;
  private ending = false;

  constructor(private onEnd: () => void) {}

  async start(acquisition: Promise<XRSession>, create: (session: XRSession) => Promise<ImmersivePresentation>): Promise<boolean> {
    try {
      const session = await acquisition;
      if (this.finished) { await session.end().catch(() => {}); return false; }
      this.session = session;
      session.addEventListener("end", this.finish);
      const presentation = await create(session);
      if (this.finished) { presentation.dispose(); return false; }
      this.presentation = presentation;
      await presentation.start();
      return !this.finished;
    } catch (error) {
      await this.end();
      throw error;
    }
  }

  async end(): Promise<void> {
    if (this.finished || this.ending) return;
    this.ending = true;
    try { await this.session?.end(); } catch { /* Still release local resources if the runtime already ended. */ }
    finally { this.finish(); }
  }

  private finish = () => {
    if (this.finished) return;
    this.finished = true;
    this.session?.removeEventListener("end", this.finish);
    const presentation = this.presentation;
    this.presentation = null;
    // Three.js has its own session-end listener. Restore the flat renderer after that
    // listener has finished, including startup failures before it saved a pixel ratio.
    queueMicrotask(() => {
      try { presentation?.dispose(); } finally { this.onEnd(); }
    });
  };
}

/** Keep the catalog epoch and flat scene still while the runtime owns the viewer pose. */
export function pauseForXr() {
  const app = useStore.getState();
  app.pauseTime();
  app.setPlaying(false);
  app.setOrbitCamera(false);
}

/** A new, intentional spatial selection survives exit; otherwise restore the exact preceding view. */
export function returnFromXr(view: ViewSnapshot, selectedId: string | null) {
  restoreView(view);
  if (selectedId && selectedId !== view.selectedId && useStore.getState().data?.byId.has(selectedId)) {
    focusObject(selectedId);
    useStore.getState().setPanel("place");
  }
}
