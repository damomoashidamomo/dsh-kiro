/**
 * App — the Ink root component. Lays out the Transcript, Splash, StatusBar,
 * Prompt, and the optional ProgressOverlay / SlashMenu.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */
import { type AutocompleteItem } from './Autocomplete';
import type { SessionController } from '../runtime/session-controller';
export interface AppProps {
    /**
     * Workspace `@`-mention lookup (platform fileReferences service):
     * resolves a query fragment to file/directory candidates.
     */
    readonly fileSearch?: (query: string) => Promise<readonly AutocompleteItem[]> | undefined;
    controller: SessionController;
    seedTask?: string | undefined;
    activeAgentName?: string | undefined;
    onSubmit: (text: string) => void;
}
/** Render the TUI. */
export declare function App({ controller, seedTask, activeAgentName, onSubmit, fileSearch }: AppProps): JSX.Element;
