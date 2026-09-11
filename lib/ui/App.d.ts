/**
 * App — the Ink root component. Lays out the Transcript, optional Splash,
 * StatusBar, and Prompt, and dispatches key actions to the runtime.
 *
 * The component is dumb on purpose: all state lives on the
 * SessionController, and React only re-renders when the controller publishes.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */
import type { SessionController } from '../runtime/session-controller';
export interface AppProps {
    controller: SessionController;
    /** Seed text passed via the CLI positional — submitted as the first turn. */
    seedTask?: string | undefined;
    /** Active agent name (e.g. from `--agent`). */
    activeAgentName?: string | undefined;
    /** Submit handler wired by the runtime. */
    onSubmit: (text: string) => void;
}
/** Render the TUI. */
export declare function App({ controller, seedTask, activeAgentName, onSubmit }: AppProps): JSX.Element;
