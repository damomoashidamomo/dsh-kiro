import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * App — the Ink root component. Lays out the Transcript, Splash, StatusBar,
 * Prompt, and the optional ProgressOverlay / SlashMenu.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Transcript } from "./Transcript.js";
import { Prompt } from "./Prompt.js";
import { StatusBar } from "./StatusBar.js";
import { ProgressOverlay } from "./ProgressOverlay.js";
import { SlashMenu } from "./SlashMenu.js";
import { OptionMenu } from "./OptionMenu.js";
import { PickerOverlay } from "./PickerOverlay.js";
import { ApprovalOverlay } from "./ApprovalOverlay.js";
import { PlanReviewOverlay } from "./PlanReviewOverlay.js";
import { Autocomplete, slashCandidates } from "./Autocomplete.js";
import { palette } from "../theme/palette.js";
import { splashMark } from "../theme/banner.js";
import Fuse from 'fuse.js';
import { setMarkdownColumns } from "../markdown/render.js";
import { buildEditDiff, isEditableTool } from "./diff.js";
import { mapKey } from "../runtime/keybindings.js";
import { ALL_COMMANDS } from "../commands/registry.js";
/**
 * Diff rows for a pending approval: match the most recent tool-call record
 * of the named tool and build red/green rows from its recorded arguments.
 */
/** The shell command of the pending bash request, for scope trust. */
function approvalCommandOf(state, toolName) {
    if (toolName !== 'bash')
        return undefined;
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
        const message = state.messages[i];
        if (message?.kind === 'tool-call' && message.tool?.name === toolName) {
            try {
                const args = JSON.parse(message.tool.argsRaw ?? '{}');
                return typeof args.command === 'string' ? args.command : undefined;
            }
            catch {
                return undefined;
            }
        }
    }
    return undefined;
}
function approvalDiff(state, toolName) {
    if (!isEditableTool(toolName))
        return undefined;
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
        const message = state.messages[i];
        if (message?.kind === 'tool-call' && message.tool?.name === toolName) {
            return buildEditDiff(toolName, message.tool.argsRaw);
        }
    }
    return undefined;
}
/** Fuzzy-filter command candidates with the same Fuse config the popup uses. */
function fuseSearch(items, query) {
    const q = query.toLowerCase();
    const scored = items
        .map((item) => ({ item, score: item.label.toLowerCase().includes(q) ? 0 : (item.hint ?? '').toLowerCase().includes(q) ? 1 : 2 }))
        .filter((row) => row.score < 2);
    scored.sort((a, b) => a.score - b.score);
    return scored.map((row) => row.item);
}
/** Render the TUI. */
export function App({ controller, seedTask, activeAgentName, onSubmit, fileSearch }) {
    const { exit } = useApp();
    const [state, setState] = useState(() => controller.getState());
    const [prefix, setPrefix] = useState(undefined);
    const [seeded, setSeeded] = useState(seedTask === undefined);
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [optionMenu, setOptionMenu] = useState(undefined);
    const [prefixQuery, setPrefixQuery] = useState('');
    const [autocompleteSelected, setAutocompleteSelected] = useState(0);
    /** Submitted drafts, ↑/↓ recall (oldest first). */
    const [submitHistory, setSubmitHistory] = useState([]);
    const [atItems, setAtItems] = useState([]);
    const [atInsert, setAtInsert] = useState(undefined);
    const insertSeq = useRef(0);
    // @-mention candidates: debounced workspace lookup while the @ popup is up.
    useEffect(() => {
        if (prefix !== '@' || fileSearch === undefined) {
            setAtItems([]);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            Promise.resolve(fileSearch(prefixQuery))
                .then((items) => { if (!cancelled)
                setAtItems(items ?? []); })
                .catch(() => { if (!cancelled)
                setAtItems([]); });
        }, 120);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [prefix, prefixQuery, fileSearch]);
    /** Abort the in-flight LLM request (Ctrl+C first press). */
    const cancelTurn = () => {
        controller.cancelActiveTurn();
    };
    // kiro-style two-stage Ctrl+C: first press cancels the running turn, a
    // second press while still cancelling exits the TUI back to the shell.
    const interruptArmed = useRef(false);
    useEffect(() => controller.subscribe(setState), [controller]);
    // Returning to idle disarms the two-stage exit (the cancel completed).
    useEffect(() => {
        if (state.agent.status === 'idle') {
            interruptArmed.current = false;
        }
    }, [state.agent.status]);
    useEffect(() => {
        if (seeded)
            return;
        if (seedTask !== undefined && seedTask !== '') {
            onSubmit(seedTask);
        }
        setSeeded(true);
    }, [seeded, seedTask, onSubmit]);
    // Top-level keybindings dispatch on top of the Prompt's own useInput. Ink
    // routes key events to all `useInput` subscribers in registration order.
    useInput((input, key) => {
        if (slashMenuOpen)
            return;
        if (state.picker !== undefined)
            return;
        if (state.overlay.kind !== 'none')
            return;
        const action = mapKey({ input, key });
        if (action === 'quit') {
            exit();
        }
        else if (action === 'interrupt') {
            const status = state.agent.status;
            if (status === 'running' || status === 'cancelling') {
                if (interruptArmed.current) {
                    // Second Ctrl+C while the turn is still being cancelled → exit.
                    exit();
                }
                else {
                    interruptArmed.current = true;
                    controller.patchAgent({ status: 'cancelling' });
                    // Actually abort the in-flight request via the platform.
                    cancelTurn();
                }
            }
            else {
                // Idle: kiro exits on a single Ctrl+C (kiro.dev issue #6442).
                exit();
            }
        }
        else if (state.approval !== undefined || state.question !== undefined) {
            // While the approval or plan-review panel waits, only quit/interrupt
            // stay live (the interrupt cancels the turn, which aborts the request).
            return;
        }
        else if (action === 'clear-screen') {
            process.stdout.write('\x1b[2J\x1b[H');
        }
        else if (action === 'open-slash-menu') {
            setSlashMenuOpen(true);
        }
    }, { isActive: true });
    const { stdout } = useStdout();
    // Tell the markdown renderer how wide the pane is: tables cap to it and
    // code blocks truncate — wide content stops exploding the transcript.
    useEffect(() => {
        setMarkdownColumns(stdout?.columns !== undefined ? stdout.columns - 2 : undefined);
    }, [stdout?.columns]);
    // Ink's <Static> container is absolutely positioned and hugs its content,
    // so flex centering inside it never spans the terminal width. Center the
    // splash by padding each line with spaces for the real column count.
    // Boot blink (B-10, decorative): the tagline dot pulses a few times in
    // the LIVE region, then the splash freezes into <Static> as the header —
    // animating a Static item would violate its print-once contract.
    const [splashBlink, setSplashBlink] = useState(false);
    const [splashSettled, setSplashSettled] = useState(false);
    useEffect(() => {
        let ticks = 0;
        const timer = setInterval(() => {
            ticks += 1;
            setSplashBlink((blink) => !blink);
            if (ticks >= 4) {
                clearInterval(timer);
                setSplashSettled(true);
            }
        }, 350);
        return () => clearInterval(timer);
    }, []);
    const splash = useMemo(() => {
        const raw = splashMark(stdout?.columns);
        const columns = stdout?.columns ?? 100;
        const lines = raw.split('\n');
        const maxWidth = Math.max(0, ...lines.map((line) => line.replace(/\x1b\[[0-9;]*m/gu, '').length));
        const pad = Math.max(0, Math.floor((columns - maxWidth) / 2));
        if (pad === 0)
            return raw;
        return lines.map((line) => ' '.repeat(pad) + line).join('\n');
    }, [stdout?.columns]);
    // While blinking, the live splash swaps the tagline separator each frame.
    const liveSplash = useMemo(() => {
        if (splashSettled || !splashBlink)
            return undefined;
        return splash.replace('Kiro CLI · DeepSeek Harness', 'Kiro CLI ◉ DeepSeek Harness');
    }, [splash, splashBlink, splashSettled]);
    const activeToolName = useMemo(() => {
        for (let i = state.messages.length - 1; i >= 0; i -= 1) {
            const msg = state.messages[i];
            if (msg?.kind === 'tool-call' && msg.streaming && msg.tool !== undefined) {
                return msg.tool.name;
            }
        }
        return undefined;
    }, [state.messages]);
    // The '/' popup filters on the COMMAND NAME only — text after the first
    // space is arguments (`/chat resume`) and must not empty the match list.
    const slashQuery = (prefixQuery.split(/\s+/u)[0] ?? '').trim();
    // Build the option picker for a bare enumerated command.
    const optionMenuFor = (name) => {
        switch (name) {
            case 'engine':
                return {
                    title: '选择引擎组合（loop + 工具引擎）',
                    options: [
                        { value: 'kiro', label: 'kiro', hint: '自研循环 + Rust 工具引擎（Landlock）· 状态栏 [kiro/rust]' },
                        { value: 'kiro -p', label: 'kiro -p', hint: '自研循环 + 平台工具管线' },
                        { value: 'dsh', label: 'dsh', hint: 'DSH 平台全套（默认）' },
                    ],
                    apply: (value) => { setOptionMenu(undefined); onSubmit(`/engine ${value}`); },
                };
            case 'loop':
                return {
                    title: '选择回合驱动器（谁来驱动回合）',
                    options: [
                        { value: 'dsh', label: 'dsh', hint: 'DSH 平台 agent loop（完整工具链）' },
                        { value: 'kiro', label: 'kiro', hint: 'dsh-kiro 自研驱动（完整工具循环）' },
                    ],
                    apply: (value) => { setOptionMenu(undefined); onSubmit(`/loop ${value}`); },
                };
            case 'tools':
                return {
                    title: '选择工具引擎（仅 /loop kiro 生效）',
                    options: [
                        { value: 'dsh', label: 'dsh', hint: '平台工具管线（平台沙箱 + 审批）' },
                        { value: 'rust', label: 'rust', hint: 'Rust 引擎（Landlock 内核级沙箱，每调用新进程）' },
                    ],
                    apply: (value) => { setOptionMenu(undefined); onSubmit(`/tools ${value}`); },
                };
            case 'spec':
                return {
                    title: 'Spec 流程（先确认后开发）',
                    options: [
                        { value: 'start', label: 'start', hint: '开始新 spec（起草 requirements.md）' },
                        { value: 'approve', label: 'approve', hint: '确认当前阶段，进入下一阶段' },
                        { value: 'show', label: 'show', hint: '查看当前阶段与文件' },
                        { value: 'revise', label: 'revise', hint: '打回当前阶段并附修改意见' },
                        { value: 'abort', label: 'abort', hint: '放弃当前 spec' },
                    ],
                    apply: (value) => {
                        setOptionMenu(undefined);
                        onSubmit(value === 'start' ? '/spec start 新功能' : `/spec ${value}`);
                    },
                };
            default:
                return undefined;
        }
    };
    const contextApprox = state.agent.contextApprox === true;
    const contextPct = (() => {
        const limit = state.agent.contextLimitTokens;
        if (limit === undefined || limit <= 0)
            return undefined;
        const pct = (state.agent.contextUsedTokens / limit) * 100;
        // Under 10% show one decimal so the number is visibly alive on 1M-window
        // models; above that integers are enough resolution.
        return pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
    })();
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [splashSettled ? null : (_jsx(Box, { flexDirection: "column", children: _jsx(Text, { children: liveSplash ?? splash }) })), _jsx(Transcript, { messages: state.messages, header: splashSettled ? { kind: 'splash', key: 'splash', content: splash } : undefined }), _jsx(ProgressOverlay, { toolName: activeToolName, busy: state.agent.status === 'running', subtext: state.hasActiveTool ? 'executing…' : undefined }), _jsx(StatusBar, { agent: state.agent, prefix: prefix, activeAgentName: activeAgentName }), optionMenu !== undefined ? (_jsx(OptionMenu, { title: optionMenu.title, options: optionMenu.options, onPick: (value) => { optionMenu.apply(value); }, onCancel: () => { setOptionMenu(undefined); } })) : null, state.question !== undefined ? (_jsx(PlanReviewOverlay, { request: state.question, onResolve: (choice) => controller.resolveQuestion(choice) })) : state.approval !== undefined ? (_jsx(ApprovalOverlay, { request: state.approval, diff: approvalDiff(state, state.approval.toolName), approvalCommand: approvalCommandOf(state, state.approval.toolName), onResolve: (choice) => controller.resolveApproval(choice) })) : state.picker !== undefined ? (_jsx(PickerOverlay, { picker: state.picker, onMoveTo: (index) => controller.setPickerSelection(index), onSelect: () => controller.selectPickerItem(), onClose: () => controller.closePicker() })) : slashMenuOpen ? (_jsx(SlashMenu, { initialQuery: prefix === '/' ? prefixQuery : '', active: slashMenuOpen, onClose: () => setSlashMenuOpen(false), onSelect: (text) => onSubmit(text) })) : (_jsx(Prompt, { busy: state.agent.status === 'running', contextPct: contextPct, contextApprox: contextApprox, history: submitHistory, onSubmit: (text) => {
                    // Option picker: a BARE enumerated command opens the picker
                    // instead of running bare (which only printed usage text).
                    const bare = text.trim().replace(/^\//u, '').toLowerCase();
                    if (optionMenu === undefined && bare !== '' && !bare.includes(' ')) {
                        const picker = optionMenuFor(bare);
                        if (picker !== undefined) {
                            setOptionMenu(picker);
                            return;
                        }
                    }
                    if (text.trim() !== '') {
                        setSubmitHistory((prev) => (prev[prev.length - 1] === text ? prev : [...prev, text]));
                    }
                    onSubmit(text);
                    setPrefix(undefined);
                    setPrefixQuery('');
                    setAutocompleteSelected(0);
                }, onPrefix: (p, query) => {
                    setPrefix(p);
                    setPrefixQuery(query ?? '');
                    setAutocompleteSelected(0);
                }, onAutocompleteMove: (delta) => {
                    setAutocompleteSelected((idx) => Math.max(0, idx + delta));
                }, onAutocompleteCommit: () => {
                    if (prefix === '@') {
                        // Insert the picked mention into the draft instead of
                        // submitting; the user keeps composing the message. Mirror
                        // the popover's Fuse ordering so the highlighted row is what
                        // gets inserted.
                        const fuse = new Fuse([...atItems], {
                            keys: ['label', 'hint', 'keywords'],
                            threshold: 0.35,
                            ignoreLocation: true,
                            minMatchCharLength: 1,
                        });
                        const ranked = prefixQuery === '' ? [...atItems] : fuse.search(prefixQuery).map((r) => r.item);
                        const picked = ranked.slice(autocompleteSelected, autocompleteSelected + 1)[0];
                        if (picked !== undefined) {
                            insertSeq.current += 1;
                            setAtInsert({ token: `@${prefixQuery}`, insert: picked.insert, seq: insertSeq.current });
                        }
                        setAutocompleteSelected(0);
                        return;
                    }
                    // Args already typed (`/chat resume`) — commit submits the full
                    // draft; committing only the highlighted name would drop them.
                    if (prefix === '/' && prefixQuery.includes(' ')) {
                        onSubmit(`/${prefixQuery.trim()}`);
                    }
                    else {
                        // '/' picker: submit the HIGHLIGHTED command (arrow keys move
                        // autocompleteSelected via onAutocompleteMove).
                        const items = slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description })));
                        const filtered = prefixQuery === ''
                            ? items
                            : fuseSearch(items, prefixQuery);
                        const pick = filtered[autocompleteSelected] ?? filtered[0];
                        if (pick !== undefined) {
                            // insert is the BARE name; commands submit with the '/' prefix.
                            onSubmit(`/${pick.insert}`);
                            // The popup owned the Enter key (not the prompt's submit path),
                            // so clear the draft through the insert channel.
                            insertSeq.current += 1;
                            setAtInsert({ token: '', insert: '', seq: insertSeq.current, clearAll: true });
                        }
                    }
                    setPrefix(undefined);
                    setPrefixQuery('');
                }, pendingInsert: atInsert, autocompleteActive: !slashMenuOpen
                    && ((prefix === '/')
                        || (prefix === '@' && !prefixQuery.includes(' ') && atItems.length > 0)), popupOpen: prefix !== undefined && !slashMenuOpen })), prefix === '/' && !slashMenuOpen ? (_jsx(Autocomplete, { trigger: "/", query: slashQuery, candidates: slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description }))), selected: autocompleteSelected })) : prefix === '@' && !slashMenuOpen && !prefixQuery.includes(' ') ? (_jsx(Autocomplete, { trigger: "@", query: prefixQuery, candidates: atItems, selected: 0 })) : null, state.overlay.kind !== 'none' ? (_jsx(Box, { borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, paddingX: 1, marginTop: 1, children: _jsx(Text, { children: palette.accent(`overlay: ${state.overlay.kind}`) }) })) : null] }));
}
//# sourceMappingURL=App.js.map