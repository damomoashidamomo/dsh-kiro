/**
 * App — the Ink root component. Lays out the Transcript, Splash, StatusBar,
 * Prompt, and the optional ProgressOverlay / SlashMenu.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */
import type { SessionController } from '../runtime/session-controller';
export interface AppProps {
    controller: SessionController;
    seedTask?: string | undefined;
    activeAgentName?: string | undefined;
    onSubmit: (text: string) => void;
}
/** Render the TUI. */
export declare function App({ controller, seedTask, activeAgentName, onSubmit }: AppProps): JSX.Element;
