import { useEffect, useMemo, useRef, useState } from 'react';
import {
    type Message,
    type Session,
    getMessages,
    sendMessage,
    pickDocuments,
    pickWorkdir,
    getSessionState,
    setSessionState,
    renderTemplate,
    sendSystemNotification,
} from '../lib/api';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { motion } from 'framer-motion';
import { isTauri, tauriNotReadyMessage } from '../lib/tauri';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import {
    Sparkles,
    BrainCircuit,
    Loader2,
    ChevronLeft,
    FilePlus2,
    FileText,
    CheckCircle2,
    AlertTriangle,
    Repeat,
    Bell,
    Play,
    StopCircle,
    Wand2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

interface ChatPanelProps {
    sessionId: string;
    sessionTitle: string;
    mode: 'doc-dev' | 'general';
    onModeBack: () => void;
    onCreateSession?: (title?: string, options?: { focus?: boolean }) => Promise<Session | undefined>;
    onMarkSessionRoot?: (sessionId: string, rootId: string) => void;
    sessionRoots?: Record<string, string>;
}

type DocFile = {
    path: string;
    name: string;
    size: number;
    content: string;
    relativePath: string;
    absPath?: string;
};

type AutomationConfig = {
    taskPrompt: string;
    completionSignal: string;
    nextStep: string;
    autoRestartSession: boolean;
    newSessionEachLoop: boolean;
    maxCycles: number;
    infiniteLoop: boolean;
    notifyText: string;
};

type PersistedDocFile = {
    path: string;
    name: string;
    size: number;
    relativePath: string;
    absPath?: string;
};

type SessionUiState = {
    docBasePath: string;
    docFiles: PersistedDocFile[];
    autoConfig: AutomationConfig;
    autoPromptLogs: string[];
    cycleLogs: Record<number, string[]>;
    lastCycleMs: number | null;
    sessionElapsedMs: number;
    rootElapsedMap: Record<string, number>;
    autoStatus: string;
    autoCycle: number;
    autoTargetSessionId: string | null;
    autoRunning: boolean;
    autoAbort: boolean;
    rootId: string;
    pendingPrefill?: string;
    model?: string;
    thinkingDepth?: string;
    mode?: 'doc-dev' | 'general';
    currentCycleStart?: number | null;
};

const defaultAutomationConfig = (): AutomationConfig => ({
    taskPrompt:
        '帮我检查 {documents} 中描述的功能是否已经完全按文档实现，如果完全符合，请输出精确的完成标记。',
    completionSignal: '已完全根据文档完成',
    nextStep:
        '继续根据文档完成',
    autoRestartSession: true,
    newSessionEachLoop: true,
    maxCycles: 3,
    infiniteLoop: true,
    notifyText: 'xxx任务已完成',
});

const MODELS = [
    { id: 'gpt-5.1-codex-max', name: 'Codex Max (GPT-5.1)' },
    { id: 'gpt-5.1-codex-mini', name: 'Codex Mini (GPT-5.1)' },
    { id: 'gpt-5.1', name: 'GPT-5.1' },
    { id: 'gpt-5-thinking', name: 'GPT-5 Thinking' },
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
];

const THINKING_LEVELS = [
    { id: 'minimal', name: 'Minimal Effort' },
    { id: 'low', name: 'Low Effort' },
    { id: 'medium', name: 'Medium Effort' },
    { id: 'high', name: 'High Effort' },
];

const createDefaultSessionState = (rootId: string, mode: 'doc-dev' | 'general'): SessionUiState => ({
    docBasePath: '',
    docFiles: [],
    autoConfig: defaultAutomationConfig(),
    autoPromptLogs: [],
    cycleLogs: {},
    lastCycleMs: null,
    sessionElapsedMs: 0,
    rootElapsedMap: {},
    autoStatus: '',
    autoCycle: 1,
    autoTargetSessionId: null,
    autoRunning: false,
    autoAbort: false,
    rootId,
    pendingPrefill: undefined,
    model: MODELS[0].id,
    thinkingDepth: 'xhigh',
    mode,
    currentCycleStart: null,
});

const formatBytes = (bytes: number) => {
    if (!bytes) return '0B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(value >= 10 ? 0 : 1)}${units[idx]}`;
};

const formatDuration = (ms: number) => {
    if (ms <= 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
};

const buildDocBlock = (docs: DocFile[], baseDir: string) => {
    if (!docs.length) return '';
    const dir = baseDir?.trim() || '.';
    return docs
        .map(
            (doc, index) =>
                `【文档${index + 1}: ${doc.name}】\n工作目录: ${dir}\n相对路径: ${doc.relativePath || doc.path}\n绝对路径: ${doc.absPath || doc.path}\n大小: ${formatBytes(doc.size)}`
        )
        .join('\n\n');
};

const buildWorkdirHint = (workdir: string) =>
    `工作目录: ${workdir}（若包含 ~ 请先展开为绝对路径）\n所有文件操作必须在该目录下，使用文档提供的相对路径。`;

const buildFixDirective = (completionSignal: string) => {
    const signal = completionSignal.trim() || '已完全根据文档完成';
    return [
        '若发现实现与文档不符，必须直接修改/创建文件完成修复，不要只给检查结论。',
        '请输出具体文件路径和补丁/代码段或需执行的命令，并在修复后简要总结变更。',
        '若因权限/信息不足无法修改，说明原因并不要输出完成标记。',
        `只有在确认无需修改或修复已完成且输出标记「${signal}」时才视为完成。`,
    ].join('\n');
};

const buildDocBlockFromState = (state: SessionUiState) =>
    buildDocBlock(
        state.docFiles.map((f) => ({
            path: f.path,
            name: f.name,
            size: f.size,
            relativePath: f.relativePath,
            absPath: f.absPath,
            content: '',
        })),
        state.docBasePath,
    );

const extractFirstJson = (text: string): string | null => {
    const idx = text.indexOf('{');
    if (idx < 0) return null;
    const slice = text.slice(idx);
    // 尝试逐步截取到末尾，找到首个可解析的 JSON 对象
    for (let end = slice.length; end > 0; end--) {
        const candidate = slice.slice(0, end);
        try {
            const parsed = JSON.parse(candidate);
            return JSON.stringify(parsed, null, 2);
        } catch {
            continue;
        }
    }
    return null;
};

const resolveNotifyText = (text: string | undefined, taskTitle: string) => {
    const name = taskTitle?.trim() || '当前任务';
    const template = text?.trim();
    if (!template) return `${name} 已完成`;
    if (template.includes('xxx')) return template.replace(/xxx/g, name);
    if (template.includes('{{task}}')) return template.replace(/{{task}}/g, name);
    if (template.includes('{task}')) return template.replace(/{task}/g, name);
    return template;
};

const notifyCompletion = (text: string | undefined, taskTitle: string) => {
    const payload = resolveNotifyText(text, taskTitle);
    if (!payload) return;

    const showBrowserNotification = () => {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission === 'granted') {
            new Notification(payload);
            return;
        }
        if (Notification.permission !== 'denied') {
            Notification.requestPermission().then((permission) => {
                if (permission === 'granted') {
                    new Notification(payload);
                }
            });
        }
    };

    if (isTauri()) {
        sendSystemNotification(payload, taskTitle).catch((err) => {
            console.error('系统通知发送失败，使用浏览器通知兜底', err);
            showBrowserNotification();
        });
        return;
    }
    showBrowserNotification();
};

export function ChatPanel({ sessionId, sessionTitle, mode, onModeBack, onCreateSession, onMarkSessionRoot, sessionRoots }: ChatPanelProps) {
    const sessionStateRef = useRef<Record<string, SessionUiState>>({});
    const [stateVersion, setStateVersion] = useState(0);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [, setIsMessagesLoading] = useState(true);
    const [streamingContent, setStreamingContent] = useState('');
    const [model, setModel] = useState(MODELS[0].id);
    const [thinkingDepth, setThinkingDepth] = useState('xhigh');
    const [error, setError] = useState<string | null>(null);

    const [docFiles, setDocFiles] = useState<DocFile[]>([]);
    const [docBasePath, setDocBasePath] = useState(() => {
        return localStorage.getItem('codex-doc-base') || '';
    });
    const [isPickingDocs, setIsPickingDocs] = useState(false);
    const docInputRef = useRef<HTMLInputElement>(null);
    const [autoConfig, setAutoConfig] = useState<AutomationConfig>(() => defaultAutomationConfig());
    const [autoRunning, setAutoRunning] = useState(false);
    const [autoCycle, setAutoCycle] = useState(1);
    const [autoStatus, setAutoStatus] = useState('');
    const [pendingPrefill, setPendingPrefill] = useState<string | undefined>(undefined);
    const [autoTargetSessionId, setAutoTargetSessionId] = useState<string | null>(null);
    const [autoAbort, setAutoAbort] = useState(false);
    const [autoPromptLogs, setAutoPromptLogs] = useState<string[]>([]);
    const [cycleLogs, setCycleLogs] = useState<Record<number, string[]>>({});
    const [lastCycleMs, setLastCycleMs] = useState<number | null>(null);
    const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
    const [rootElapsedMap, setRootElapsedMap] = useState<Record<string, number>>({});
    const [currentCycleStart, setCurrentCycleStart] = useState<number | null>(null);
    const [now, setNow] = useState(Date.now());
    const prevSessionIdRef = useRef<string | null>(null);
    const normalizedAutoStatus = useMemo(() => {
        if (!autoStatus) return '';
        const cycleLabel = `第 ${autoCycle} 轮`;
        if (autoStatus.includes(cycleLabel)) return autoStatus;
        const replaced = autoStatus.replace(/第\s*\d+\s*轮/, cycleLabel);
        if (replaced !== autoStatus) return replaced;
        if (autoRunning) return `${cycleLabel}：${autoStatus}`;
        return autoStatus;
    }, [autoStatus, autoCycle, autoRunning]);

    const resolveRootId = (id: string) => {
        if (!sessionRoots) return id;
        return sessionRoots[id] || id;
    };

    const ensureSessionState = (id: string): SessionUiState => {
        const existing = sessionStateRef.current[id];
        if (existing) return existing;
        const created = createDefaultSessionState(resolveRootId(id), mode);
        sessionStateRef.current[id] = created;
        return created;
    };

    const syncStateToHooks = (id: string) => {
        if (id !== sessionId) return;
        const state = ensureSessionState(id);
        setDocBasePath(state.docBasePath || '');
        setDocFiles(
            (state.docFiles || []).map((f) => ({
                ...f,
                content: '',
            }))
        );
        setAutoConfig(state.autoConfig || defaultAutomationConfig());
        setAutoPromptLogs(state.autoPromptLogs || []);
        setCycleLogs(state.cycleLogs || {});
        setLastCycleMs(state.lastCycleMs ?? null);
        setSessionElapsedMs(state.sessionElapsedMs || 0);
        setRootElapsedMap(state.rootElapsedMap || {});
        setAutoStatus(state.autoStatus || '');
        setAutoCycle(state.autoCycle || 1);
        setAutoTargetSessionId(state.autoTargetSessionId || null);
        setAutoRunning(state.autoRunning || false);
        setAutoAbort(state.autoAbort || false);
        setPendingPrefill(state.pendingPrefill);
        setModel(state.model || MODELS[0].id);
        setThinkingDepth(state.thinkingDepth || 'xhigh');
        setCurrentCycleStart(state.currentCycleStart || null);
    };

    const updateSessionStateEntry = (id: string, updater: (prev: SessionUiState) => SessionUiState) => {
        const prev = ensureSessionState(id);
        const next = updater(prev);
        sessionStateRef.current[id] = next;
        if (id === sessionId) {
            syncStateToHooks(id);
        }
        setStateVersion((v) => v + 1);
        void setSessionState(id, JSON.stringify(next)).catch((err) => console.error('保存会话状态失败', err));
        return next;
    };

    const persistSessionState = async (id: string | null) => {
        if (!id) return;
        const rootId = resolveRootId(id);
        const all = { ...sessionStateRef.current };
        all[id] = {
            docBasePath,
            docFiles: docFiles.map(({ path, name, size, relativePath, absPath }) => ({
                path,
                name,
                size,
                relativePath,
                absPath,
            })),
            autoConfig,
            autoPromptLogs,
            cycleLogs,
            lastCycleMs,
            sessionElapsedMs,
            rootElapsedMap,
            autoStatus,
            autoCycle,
            autoTargetSessionId,
            autoRunning,
            autoAbort,
            rootId,
            pendingPrefill,
            model,
            thinkingDepth,
            mode,
            currentCycleStart,
        };
        sessionStateRef.current = all;
        setStateVersion((v) => v + 1);
        try {
            await setSessionState(id, JSON.stringify(all[id]));
        } catch (err) {
            console.error('保存会话前端状态失败', err);
        }
    };

    const restoreSessionState = async (id: string) => {
        // 先看看内存缓存
        let state = sessionStateRef.current[id];
        if (!state) {
            const remote = await getSessionState(id);
            if (remote) {
                try {
                    state = JSON.parse(remote) as SessionUiState;
                    sessionStateRef.current[id] = state;
                    setStateVersion((v) => v + 1);
                } catch (err) {
                    console.error('解析会话状态失败', err);
                }
            }
        }

        if (!state) return false;

        const rootId = resolveRootId(id);
        if (!state.rootId) {
            state = { ...state, rootId };
            sessionStateRef.current[id] = state;
            void setSessionState(id, JSON.stringify(state));
            setStateVersion((v) => v + 1);
        }

        syncStateToHooks(id);
        setIsLoading(false);
        setIsMessagesLoading(false);
        setStreamingContent('');
        return true;
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            // 保存上一个会话的前端状态
            await persistSessionState(prevSessionIdRef.current);

            // 切换会话时禁用自动运行并清理运行时状态
            setStreamingContent('');
            setError(null);
            setIsLoading(false);
            setIsMessagesLoading(true);
            const restored = await restoreSessionState(sessionId);
            if (!restored) {
                if (cancelled) return;
                setDocBasePath('');
                setDocFiles([]);
                setAutoConfig(defaultAutomationConfig());
                setAutoPromptLogs([]);
                setCycleLogs({});
                setLastCycleMs(null);
                setSessionElapsedMs(0);
                setRootElapsedMap({});
                setAutoStatus('');
                setAutoCycle(1);
                setAutoTargetSessionId(null);
                setAutoRunning(false);
                setAutoAbort(false);
                setPendingPrefill(undefined);
            }

            if (!cancelled) {
                await warmRootStates();
                await loadMessages();
                prevSessionIdRef.current = sessionId;
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    useEffect(() => {
        localStorage.setItem('codex-doc-base', docBasePath);
    }, [docBasePath]);

    useEffect(() => {
        updateSessionStateEntry(sessionId, (prev) => ({
            ...prev,
            model,
            thinkingDepth,
            mode,
        }));
    }, [sessionId, model, thinkingDepth, mode]);

    useEffect(() => {
        void persistSessionState(sessionId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        sessionId,
        docBasePath,
        docFiles,
        autoConfig,
        autoPromptLogs,
        cycleLogs,
        lastCycleMs,
        sessionElapsedMs,
        rootElapsedMap,
        autoStatus,
        autoCycle,
        autoTargetSessionId,
        autoRunning,
        autoAbort,
        pendingPrefill,
    ]);

    useEffect(() => {
        return () => {
            void persistSessionState(sessionId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!autoRunning || !currentCycleStart) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [autoRunning, currentCycleStart]);

    const aggregatedPromptLogs = useMemo(() => {
        const st = sessionStateRef.current[sessionId];
        if (!st?.autoPromptLogs) return [];
        return st.autoPromptLogs.map((text) => ({ sessionId, text }));
    }, [sessionId, stateVersion]);

    const aggregatedCycleLogs = useMemo(() => {
        const st = sessionStateRef.current[sessionId];
        if (!st?.cycleLogs) return [];
        const result: { sessionId: string; cycleId: string; logs: string[] }[] = [];
        Object.entries(st.cycleLogs).forEach(([cycleId, logs]) => {
            result.push({ sessionId, cycleId, logs });
        });
        return result.sort((a, b) => Number(b.cycleId) - Number(a.cycleId));
    }, [sessionId, stateVersion]);

    const warmRootStates = async () => {
        // 预留钩子：可在此填充根会话用时等缓存，当前为空实现避免阻塞
        return;
    };

    const loadMessages = async (): Promise<Message[]> => {
        setIsMessagesLoading(true);
        try {
            const msgs = await getMessages(sessionId);
            setMessages(msgs);
            return msgs;
        } catch (err) {
            console.error('加载消息失败:', err);
            setError(err instanceof Error ? err.message : String(err));
            return [];
        } finally {
            setIsMessagesLoading(false);
        }
    };

    const messageHasCompletion = (message: Message | null, signal: string) => {
        const mark = signal.trim();
        if (!mark || !message?.content) return false;

        // 若正文仍提到未完成/待办/告警，拒绝判定完成
        const warningTokens = ['⚠', '🔴', '未完成', '待完成', '待办', 'TODO', 'todo', '未落地', '缺失', '需补'];
        if (warningTokens.some((t) => message.content.includes(t))) return false;

        const lines = message.content
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);

        return lines.some((line) => {
            const normalized = line
                .replace(/^`+|`+$/g, '')
                .replace(/^\*+|\*+$/g, '')
                .trim();
            return normalized === mark;
        });
    };

    const sendContent = async (
        ownerId: string,
        targetOverride: string | undefined,
        content: string,
        skipUiInjection = false,
    ): Promise<Message | null> => {
        const state = ensureSessionState(ownerId);
        const targetSession = targetOverride || ownerId;
        const isActive = targetSession === sessionId;
        const userMessage: Message = {
            id: Date.now(),
            session_id: targetSession,
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
        };
        if (!skipUiInjection && isActive) {
            setMessages((prev) => [...prev, userMessage]);
        }
        if (isActive) {
            setIsLoading(true);
            setStreamingContent('');
            setError(null);
            setIsMessagesLoading(true);
        }

        try {
            const finalContent =
                state.mode === 'doc-dev'
                    ? `【文档开发模式】请针对文档/开发相关需求输出结构化、可执行的步骤与示例。\n${content}`
                    : content;

            await sendMessage(
                targetSession,
                finalContent,
                state.model || model,
                state.thinkingDepth || thinkingDepth,
                (chunk) => {
                    if (!skipUiInjection && isActive) {
                        setStreamingContent((prev) => prev + chunk);
                    }
                },
                state.mode === 'doc-dev' ? state.docBasePath : undefined,
            );

            const updated = await getMessages(targetSession);
            if (!skipUiInjection && isActive) {
                setMessages(updated);
                setStreamingContent('');
            }
            const lastAssistant = [...updated].reverse().find((m) => m.role === 'assistant') ?? null;
            return lastAssistant;
        } catch (err) {
            console.error('发送消息失败:', err);
            if (isActive) {
                setError(err instanceof Error ? err.message : String(err));
            }
            return null;
        } finally {
            if (isActive) {
                setIsLoading(false);
                setIsMessagesLoading(false);
            }
        }
    };

    const appendLog = (ownerId: string, text: string, cycleId?: number) => {
        const entry = text.trim();
        if (!entry) return;
        updateSessionStateEntry(ownerId, (prev) => {
            const cid = cycleId ?? prev.autoCycle;
            const current = prev.cycleLogs[cid] || [];
            const nextLogs = [entry, ...current].slice(0, 200);
            return { ...prev, cycleLogs: { ...prev.cycleLogs, [cid]: nextLogs } };
        });
    };

    const recordElapsed = (ownerId: string, elapsed: number) => {
        updateSessionStateEntry(ownerId, (prev) => {
            const root = resolveRootId(prev.autoTargetSessionId || ownerId);
            const nextRootElapsed = { ...prev.rootElapsedMap, [root]: (prev.rootElapsedMap[root] || 0) + elapsed };
            return {
                ...prev,
                lastCycleMs: elapsed,
                sessionElapsedMs: (prev.sessionElapsedMs || 0) + elapsed,
                rootElapsedMap: nextRootElapsed,
                currentCycleStart: null,
            };
        });
    };

    const appendPromptLog = (ownerId: string, text: string, cycleId?: number) => {
        const entry = text.trim();
        if (!entry) return;
        updateSessionStateEntry(ownerId, (prev) => {
            const cid = cycleId ?? prev.autoCycle;
            const next = [`【第 ${cid} 轮提示】${entry}`, ...prev.autoPromptLogs].slice(0, 200);
            return { ...prev, autoPromptLogs: next };
        });
    };

    const handleSend = async (content: string) => {
        await sendContent(sessionId, sessionId, content);
    };

    // 浏览器 file input 仅作兜底；无法拿到绝对路径，只保留文件名和相对路径
    const handleDocFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setIsPickingDocs(true);
        const loaded: DocFile[] = Array.from(files).map((file) => ({
            path: file.name,
            name: file.name,
            size: file.size,
            content: '',
            relativePath: file.webkitRelativePath || file.name,
            absPath: file.webkitRelativePath || file.name,
        }));
        setDocFiles((prev) => {
            const merged = [...prev];
            loaded.forEach((doc) => {
                const idx = merged.findIndex((item) => item.path === doc.path);
                if (idx >= 0) {
                    merged[idx] = doc;
                } else {
                    merged.push(doc);
                }
            });
            return merged;
        });
        setIsPickingDocs(false);
    };

    const handlePickDocsNative = async () => {
        setIsPickingDocs(true);
        try {
            const base = (docBasePath || '').trim() || undefined;
            const picked = await pickDocuments(true, base);
            if (!picked.length) return;

            setDocFiles((prev) => {
                const merged = [...prev];
                picked.forEach((doc) => {
                    const key = doc.path || doc.relative_path || doc.name;
                    const existingIdx = merged.findIndex((item) => item.absPath === doc.path || item.path === key);
                    const next: DocFile = {
                        path: doc.path,
                        relativePath: doc.relative_path || key,
                        name: doc.name,
                        size: doc.size,
                        content: '',
                        absPath: doc.path,
                    };
                    if (existingIdx >= 0) {
                        merged[existingIdx] = next;
                    } else {
                        merged.push(next);
                    }
                });
                return merged;
            });
        } catch (err) {
            console.error('选择文档失败', err);
        } finally {
            setIsPickingDocs(false);
        }
    };

    const handlePickDocs = () => {
        handlePickDocsNative();
    };

    const renderPromptFromTemplate = async (
        name: string,
        variables: Record<string, string>,
        fallback: string,
    ): Promise<string> => {
        try {
            return await renderTemplate(name, variables);
        } catch (err) {
            console.error(`渲染模板失败: ${name}`, err);
            return fallback;
        }
    };

    const buildCheckPrompt = async (
        ownerId: string,
        state: SessionUiState,
        config: AutomationConfig,
        cycleId?: number,
    ) => {
        const docBlock = buildDocBlockFromState(state);
        const primaryDoc =
            state.docFiles[0]?.absPath ||
            state.docFiles[0]?.path ||
            state.docFiles[0]?.relativePath ||
            '';
        const workdir = state.docBasePath?.trim() || './';
        const workdirHint = buildWorkdirHint(workdir);
        const fallback = `${workdirHint}\n${config.taskPrompt}${docBlock ? `\n\n${docBlock}` : ''}`;
        const body = await renderPromptFromTemplate(
            'check',
            {
                WORKING_DIR: workdir,
                DOCS: docBlock || '（未选择文档，请先选择）',
                DOC_ABSOLUTE_PATH: primaryDoc || docBlock || '（未选择文档，请先选择）',
                COMPLETION_SIGNAL: config.completionSignal || '已完全根据文档完成',
            },
            fallback,
        );
        const prompt = `${workdirHint}\n${body}`;
        appendPromptLog(ownerId, prompt, cycleId);
        return prompt;
    };

    const buildDoPrompt = async (
        ownerId: string,
        state: SessionUiState,
        config: AutomationConfig,
        checkResult: string,
        cycleId?: number,
    ) => {
        const docBlock = buildDocBlockFromState(state);
        const primaryDoc =
            state.docFiles[0]?.absPath ||
            state.docFiles[0]?.path ||
            state.docFiles[0]?.relativePath ||
            '';
        const workdir = state.docBasePath?.trim() || './';
        const workdirHint = buildWorkdirHint(workdir);
        const fixDirective = buildFixDirective(config.completionSignal);
        const fallback = `${workdirHint}\n${fixDirective}\n\n${config.nextStep || config.taskPrompt}${docBlock ? `\n\n${docBlock}` : ''}\n\n检查结果:\n${checkResult || '（无）'}`;
        const body = await renderPromptFromTemplate(
            'do',
            {
                WORKING_DIR: workdir,
                DOCS: docBlock || '（未选择文档，请先选择）',
                DOC_ABSOLUTE_PATH: primaryDoc || docBlock || '（未选择文档，请先选择）',
                CHECK_JSON: checkResult || '',
                COMPLETION_SIGNAL: config.completionSignal || '已完全根据文档完成',
            },
            fallback,
        );
        const prompt = `${workdirHint}\n${fixDirective}\n\n${body}`;
        appendPromptLog(ownerId, prompt, cycleId);
        return prompt;
    };

    const startAutomation = async (cycle = 1, ownerId: string = sessionId) => {
        updateSessionStateEntry(ownerId, (prev) => ({
            ...prev,
            autoPromptLogs: [],
            cycleLogs: {},
            autoStatus: '准备启动…',
            autoCycle: 1,
            lastCycleMs: null,
            currentCycleStart: null,
            autoTargetSessionId: null,
            autoRunning: false,
            autoAbort: false,
        }));
        if (!isTauri()) {
            setError(tauriNotReadyMessage);
            updateSessionStateEntry(ownerId, (prev) => ({
                ...prev,
                autoStatus: '自动执行失败：未检测到桌面客户端，请用 start_dev.sh 或安装最新版桌面端',
                autoRunning: false,
            }));
            appendLog(ownerId, '自动执行失败：缺少桌面内核，无法调用本地指令');
            return;
        }
        const state = ensureSessionState(ownerId);
        if (state.autoRunning) {
            appendLog(ownerId, '检测到已有自动循环在运行，本次请求忽略。');
            return;
        }
        const config = state.autoConfig;
        updateSessionStateEntry(ownerId, (prev) => ({
            ...prev,
            autoAbort: false,
            model,
            thinkingDepth,
            mode,
            autoCycle: cycle,
        }));
        try {
            // 若要求每轮新会话，或是重试轮次（cycle > 1 且 autoRestartSession 开启），则创建新会话
            const shouldCreateNewSession = config.newSessionEachLoop || (config.autoRestartSession && cycle > 1);
            if (shouldCreateNewSession) {
                if (onCreateSession) {
                    updateSessionStateEntry(ownerId, (prev) => ({
                        ...prev,
                        autoStatus: `创建新会话用于第 ${cycle} 轮…`,
                    }));
                    const newSession = await onCreateSession(`文档自动循环 ${cycle}`, { focus: false });
                    if (newSession) {
                        if (onMarkSessionRoot) {
                            const root = resolveRootId(sessionId);
                            onMarkSessionRoot(newSession.id, root);
                        }
                        updateSessionStateEntry(ownerId, (prev) => ({
                            ...prev,
                            autoTargetSessionId: newSession.id,
                        }));
                        await runAutomationCycle(ownerId, cycle, config);
                        return;
                    }
                }
            }

            // 否则直接在当前会话执行
            updateSessionStateEntry(ownerId, (prev) => ({
                ...prev,
                autoTargetSessionId: sessionId,
            }));
            await runAutomationCycle(ownerId, cycle, config);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            updateSessionStateEntry(ownerId, (prev) => ({
                ...prev,
                autoStatus: `自动执行失败：${msg}`,
                autoRunning: false,
            }));
            appendLog(ownerId, `自动执行失败：${msg}`);
        }
    };

    const handleStopAutomation = (ownerId: string = sessionId) => {
        updateSessionStateEntry(ownerId, (prev) => ({
            ...prev,
            autoAbort: true,
            autoRunning: false,
            autoTargetSessionId: null,
            autoStatus: '已手动停止，后续不再发送请求',
        }));
        if (ownerId === sessionId) {
            setIsLoading(false);
            setIsMessagesLoading(false);
            setStreamingContent('');
        }
        appendLog(ownerId, '任务已手动停止，后续不再发送请求。');
        updateSessionStateEntry(ownerId, (prev) => ({ ...prev, lastCycleMs: null }));
    };

    const handleAutomationSuccess = (ownerId: string, config: AutomationConfig, cycle: number) => {
        updateSessionStateEntry(ownerId, (prev) => ({
            ...prev,
            autoStatus: `检测到完成标记「${config.completionSignal}」，在第 ${cycle} 轮完成。`,
            autoRunning: false,
            autoTargetSessionId: null,
        }));
        notifyCompletion(config.notifyText, sessionTitle);
        appendLog(ownerId, `第 ${cycle} 轮：已完成，输出包含标记「${config.completionSignal}」`, cycle);
    };

    const handleAutomationFailure = async (ownerId: string, config: AutomationConfig, cycle: number) => {
        const shouldContinue = config.autoRestartSession && (config.infiniteLoop || config.maxCycles > cycle);
        if (shouldContinue && onCreateSession) {
            const next = cycle + 1;
            const label = config.infiniteLoop ? `第 ${next} 轮` : `(${next}/${config.maxCycles})`;
            updateSessionStateEntry(ownerId, (prev) => ({
                ...prev,
                autoStatus: `第 ${cycle} 轮未完成，准备新建会话继续 ${label}`,
            }));
            const newSession = await onCreateSession(`文档自动循环 ${next}`, { focus: false });
            if (newSession) {
                if (onMarkSessionRoot) {
                    const root = resolveRootId(ownerId);
                    onMarkSessionRoot(newSession.id, root);
                }
                updateSessionStateEntry(ownerId, (prev) => ({
                    ...prev,
                    autoTargetSessionId: newSession.id,
                    autoRunning: false,
                }));
                await runAutomationCycle(ownerId, next, config);
                return;
            }
        }
        updateSessionStateEntry(ownerId, (prev) => ({
            ...prev,
            autoStatus: '未检测到完成标记，自动循环已停止',
            autoRunning: false,
            autoTargetSessionId: null,
        }));
        appendLog(ownerId, `第 ${cycle} 轮：未完成，循环结束`, cycle);
    };

    const runAutomationCycle = async (ownerId: string, cycle = 1, configOverride?: AutomationConfig) => {
        const state = ensureSessionState(ownerId);
        const config = configOverride || state.autoConfig;
        if (state.autoAbort) {
            updateSessionStateEntry(ownerId, (prev) => ({ ...prev, autoRunning: false, autoStatus: '已停止' }));
            return;
        }
        updateSessionStateEntry(ownerId, (prev) => ({
            ...prev,
            autoRunning: true,
            autoCycle: cycle,
            autoStatus: `第 ${cycle} 轮：发送主查询…`,
        }));
        appendLog(ownerId, `第 ${cycle} 轮：开始执行`, cycle);

        try {
            const target = state.autoTargetSessionId || ownerId;
            const startedAt = Date.now();
            updateSessionStateEntry(ownerId, (prev) => ({ ...prev, currentCycleStart: startedAt }));
            updateSessionStateEntry(ownerId, (prev) => ({
                ...prev,
                autoStatus: `第 ${cycle} 轮：发送检查 (check)…`,
            }));
            const checkPrompt = await buildCheckPrompt(ownerId, state, config, cycle);
            const checkReply = await sendContent(
                ownerId,
                target,
                checkPrompt,
                true,
            );
            if (checkReply?.content) {
                appendLog(ownerId, `第 ${cycle} 轮检查回复：${checkReply.content}`, cycle);
            }
            const parsedCheckJson =
                checkReply?.content ? extractFirstJson(checkReply.content) : null;
            if (parsedCheckJson) {
                appendLog(ownerId, `第 ${cycle} 轮检查结果(JSON)：\n${parsedCheckJson}`, cycle);
            } else {
                appendLog(ownerId, `第 ${cycle} 轮检查结果未解析到有效 JSON，原始内容已记录。`, cycle);
            }
            const checkStatusComplete =
                parsedCheckJson &&
                (() => {
                    try {
                        const obj = JSON.parse(parsedCheckJson);
                        return typeof obj?.status === 'string' && obj.status.trim().toLowerCase() === 'complete';
                    } catch {
                        return false;
                    }
                })();
            if (messageHasCompletion(checkReply, config.completionSignal) || checkStatusComplete) {
                recordElapsed(ownerId, Date.now() - startedAt);
                handleAutomationSuccess(ownerId, config, cycle);
                return;
            }
            const currentState = ensureSessionState(ownerId);
            if (currentState.autoAbort) {
                updateSessionStateEntry(ownerId, (prev) => ({ ...prev, autoRunning: false, autoStatus: '已停止' }));
                appendLog(ownerId, `第 ${cycle} 轮：手动停止，已终止后续请求。`, cycle);
                recordElapsed(ownerId, Date.now() - startedAt);
                return;
            }

            updateSessionStateEntry(ownerId, (prev) => ({
                ...prev,
                autoStatus: `第 ${cycle} 轮：发送落地执行 (do)…`,
            }));
            const doPrompt = await buildDoPrompt(
                ownerId,
                state,
                config,
                parsedCheckJson || checkReply?.content || '',
                cycle,
            );
            const doReply = await sendContent(ownerId, target, doPrompt, true);
            if (doReply?.content) {
                appendLog(ownerId, `第 ${cycle} 轮执行回复：${doReply.content}`, cycle);
            }

            const latestState = ensureSessionState(ownerId);
            if (latestState.autoAbort) {
                updateSessionStateEntry(ownerId, (prev) => ({ ...prev, autoRunning: false, autoStatus: '已停止' }));
                appendLog(ownerId, `第 ${cycle} 轮：手动停止，已终止后续请求。`, cycle);
                recordElapsed(ownerId, Date.now() - startedAt);
                return;
            }

            recordElapsed(ownerId, Date.now() - startedAt);
            await handleAutomationFailure(ownerId, config, cycle);
        } catch (err) {
            console.error('自动执行失败:', err);
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            updateSessionStateEntry(ownerId, (prev) => ({
                ...prev,
                autoStatus: `自动执行失败：${msg}`,
                autoRunning: false,
            }));
            appendLog(ownerId, `自动执行失败：${msg}`, cycle);
        }
    };

    const currentThinkingLevels = model === 'gpt-5.1-codex-max'
        ? [...THINKING_LEVELS, { id: 'xhigh', name: 'Extra High Effort' }]
        : THINKING_LEVELS;

    // 仅在主动发送/流式时显示顶部加载，不因历史加载闪烁
    const showTopLoader = isLoading || !!streamingContent;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-full relative overflow-y-auto"
        >
            <div className="w-full px-4 pt-3">
                <div className="flex flex-wrap gap-2 items-center">
                    <Select value={model} onValueChange={setModel}>
                        <SelectTrigger className="w-[220px] bg-background/80 backdrop-blur-sm shadow-sm border-border/50 rounded-full h-9 px-4 transition-all hover:bg-accent/50">
                            <div className="flex items-center gap-2 truncate">
                                <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                <SelectValue placeholder="选择模型" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            {MODELS.map((m) => (
                                <SelectItem key={m.id} value={m.id} className="cursor-pointer">
                                    {m.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={thinkingDepth} onValueChange={setThinkingDepth}>
                        <SelectTrigger className="w-[160px] bg-background/80 backdrop-blur-sm shadow-sm border-border/50 rounded-full h-9 px-4 transition-all hover:bg-accent/50">
                            <div className="flex items-center gap-2">
                                <BrainCircuit className="h-3.5 w-3.5 text-purple-500" />
                                <SelectValue placeholder="思考深度" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            {currentThinkingLevels.map((l) => (
                                <SelectItem key={l.id} value={l.id} className="cursor-pointer">
                                    {l.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {mode === 'doc-dev' && (
                <div className="w-full px-4 mt-2">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-5xl mx-auto rounded-3xl border bg-card/80 backdrop-blur-md shadow-lg shadow-primary/5 p-4 space-y-4 max-h-[72vh] overflow-y-auto pr-2"
                    >
                        <div className="flex flex-wrap gap-3 items-start justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <span className="text-lg font-semibold">文档开发自动化</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    选择文档→生成提示→自动调用模型，未输出完成标记则继续发送下一步并可在新会话循环重试。
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                                    文档 {docFiles.length} / 完成标记 {autoConfig.completionSignal || '未设置'}
                                </span>
                                {autoRunning ? (
                                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                                        <Loader2 className="h-3 w-3 inline-block mr-1 animate-spin" />
                                        自动循环进行中（第 {autoCycle} 轮）
                                    </span>
                                ) : (
                                    <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                                        待机
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="grid md:grid-cols-[2fr_1.15fr] gap-4">
                            <div className="space-y-3">
                                <div className="rounded-2xl border bg-muted/30 p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <FilePlus2 className="h-4 w-4" />
                                            选择参考文档（可多选，自动插入提示）
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handlePickDocs}
                                                disabled={isPickingDocs}
                                                className="rounded-full"
                                            >
                                                {isPickingDocs ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Sparkles className="h-4 w-4 mr-1" />
                                                        选择文档
                                                    </>
                                                )}
                                            </Button>
                                            {docFiles.length > 0 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="rounded-full"
                                                    onClick={() => setDocFiles([])}
                                                >
                                                    清空
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <input
                                        ref={docInputRef}
                                        type="file"
                                        multiple
                                        accept=".md,.txt,.json,.log,.markdown,.mdx"
                                        // @ts-ignore 允许选择目录
                                        webkitdirectory="true"
                                        className="hidden"
                                        onChange={(e) => {
                                            handleDocFiles(e.target.files);
                                            if (e.target) e.target.value = '';
                                        }}
                                    />
                                    <div className="flex gap-2 items-center">
                                        <Input
                                            value={docBasePath}
                                            onChange={(e) => setDocBasePath(e.target.value)}
                                            placeholder="工作目录（如 ./ 或 docs/ ）"
                                            className="flex-1"
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="rounded-full whitespace-nowrap"
                                            onClick={async () => {
                                                const picked = await pickWorkdir();
                                                if (picked) setDocBasePath(picked);
                                            }}
                                        >
                                            选择目录
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setDocBasePath('')}>
                                            清空目录
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">发送时会附上工作目录与文件相对路径，便于模型按正确路径引用。</p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {docFiles.length === 0 && (
                                            <span className="text-xs text-muted-foreground">尚未选择文档</span>
                                        )}
                                        {docFiles.map((doc) => (
                                            <div
                                                key={doc.path}
                                                className="group flex items-center gap-2 px-3 py-2 rounded-xl border bg-background/80 shadow-sm"
                                            >
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-xs font-medium truncate max-w-[180px]">
                                                        {doc.name}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                                                        {doc.relativePath || doc.path}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground">{formatBytes(doc.size)}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                                    onClick={() => setDocFiles((prev) => prev.filter((item) => item.path !== doc.path))}
                                                >
                                                    <StopCircle className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-2xl border bg-muted/30 p-4 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <Wand2 className="h-4 w-4" />
                                            自动使用内置 check/do 模板
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                className="rounded-full"
                                                onClick={() => startAutomation(1)}
                                                disabled={autoRunning || isLoading}
                                            >
                                                <Play className="h-4 w-4 mr-1" />
                                                自动执行
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground space-y-1">
                                        <p>系统会自动注入 check / do 模板及文档列表、检查结果，无需手动填写任务提示。</p>
                                        <p>如需调整提示词，请前往模板编辑器修改 check / do 内容。</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium">完成标记</label>
                                            <div className="rounded-xl border bg-background/70 px-3 py-2 text-sm">
                                                {autoConfig.completionSignal || '已完全根据文档完成'}（模板内置）
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium">未完成补充指令</label>
                                            <div className="rounded-xl border bg-background/70 px-3 py-2 text-sm text-muted-foreground whitespace-pre-line">
                                                {autoConfig.nextStep || '继续根据文档完成'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">最大循环次数</label>
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={autoConfig.maxCycles}
                                                    disabled={autoConfig.infiniteLoop}
                                                    className="flex-1 min-w-[110px]"
                                                    onChange={(e) =>
                                                        setAutoConfig((prev) => ({
                                                            ...prev,
                                                            maxCycles: Math.max(1, Number(e.target.value) || 1),
                                                        }))
                                                    }
                                                />
                                                <Button
                                                    type="button"
                                                    variant={autoConfig.infiniteLoop ? 'default' : 'outline'}
                                                    size="sm"
                                                    className="rounded-full whitespace-nowrap"
                                                    onClick={() =>
                                                        setAutoConfig((prev) => ({
                                                            ...prev,
                                                            infiniteLoop: !prev.infiniteLoop,
                                                        }))
                                                    }
                                                >
                                                    {autoConfig.infiniteLoop ? '∞ 无限循环' : '开启无限循环'}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                        <label className="text-sm font-medium">完成提醒文案</label>
                                        <Input
                                            value={autoConfig.notifyText}
                                            onChange={(e) =>
                                                setAutoConfig((prev) => ({ ...prev, notifyText: e.target.value }))
                                                }
                                                placeholder="完成后系统通知内容（支持 xxx 或 {task} 占位任务名）"
                                            />
                                        </div>
                                    </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Repeat className="h-4 w-4" />
                                            {autoConfig.autoRestartSession
                                                ? '每轮都会新建会话并在未完成时继续循环'
                                                : '未完成时停止自动循环'}
                                            </div>
                                            <Button
                                            variant="outline"
                                            size="sm"
                                            className={cn('rounded-full border', autoConfig.autoRestartSession && 'border-primary text-primary')}
                                            onClick={() =>
                                                setAutoConfig((prev) => ({
                                                    ...prev,
                                                    autoRestartSession: !prev.autoRestartSession,
                                                    newSessionEachLoop: true,
                                                }))
                                            }
                                        >
                                            {autoConfig.autoRestartSession ? '关闭自动新会话' : '开启自动新会话'}
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="rounded-full"
                                            onClick={() => handleStopAutomation()}
                                            disabled={!autoRunning}
                                        >
                                            立即停止
                                        </Button>
                                    </div>
                                    <div className="rounded-xl bg-background/70 border px-3 py-2 text-sm flex items-center gap-2">
                                        {autoStatus ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
                                        <span className="text-muted-foreground">{normalizedAutoStatus || autoStatus || '尚未开始自动循环，调整配置后点击自动执行。'}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                                        <Bell className="h-3.5 w-3.5" />
                                        检测到完成标记后会发送系统通知并停止循环。
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {showTopLoader && (
                <div className="max-w-4xl mx-auto w-full px-4 mt-6 mb-2">
                    <div className="flex items-center gap-3 bg-muted/40 border border-border/60 rounded-xl px-4 py-3 shadow-sm animate-pulse">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <div className="leading-tight">
                            <p className="text-sm font-medium text-foreground">正在生成回复…</p>
                            <p className="text-xs text-muted-foreground">稍等片刻，浮浮酱马上回应主人喵</p>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'doc-dev' && (
                <div className="max-w-5xl mx-auto w-full px-4 mb-4">
                    <div className="rounded-2xl border bg-muted/30 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                自动执行结果记录
                            </div>
                            <div className="flex gap-2 text-xs text-muted-foreground items-center">
                                {lastCycleMs !== null && !autoRunning && (
                                    <span>本轮 {formatDuration(lastCycleMs)}</span>
                                )}
                                {autoRunning && currentCycleStart && (
                                    <span>本轮 {formatDuration(now - currentCycleStart)}</span>
                                )}
                                <span>会话累计 {formatDuration(sessionElapsedMs + (autoRunning && currentCycleStart ? now - currentCycleStart : 0))}</span>
                                <span>
                                    任务累计 {formatDuration((rootElapsedMap[resolveRootId(autoTargetSessionId || sessionId)] || sessionElapsedMs) + (autoRunning && currentCycleStart ? now - currentCycleStart : 0))}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 rounded-full"
                                    onClick={() => {
                                        setAutoPromptLogs([]);
                                        setLastCycleMs(null);
                                        setSessionElapsedMs(0);
                                        setRootElapsedMap({});
                                        setCycleLogs({});
                                    }}
                                >
                                    清空
                                </Button>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-muted-foreground">前端构造提示</div>
                                {aggregatedPromptLogs.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">暂无提示记录</p>
                                ) : (
                                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                                        {aggregatedPromptLogs.map((log, idx) => (
                                            <div key={idx} className="text-xs text-foreground bg-background/80 border rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap">
                                                [{log.sessionId.slice(0, 8)}] {log.text}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-muted-foreground">Codex 返回</div>
                                {aggregatedCycleLogs.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">还没有执行记录，点击“自动执行”后会在此累计展示每一轮的返回内容。</p>
                                ) : (
                                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                                        {aggregatedCycleLogs.map((entry, idx) => (
                                            <div key={`${entry.sessionId}-${entry.cycleId}-${idx}`} className="border rounded-xl bg-background/80">
                                                <div className="px-3 py-1 text-[11px] text-muted-foreground border-b">
                                                    [{entry.sessionId.slice(0, 8)}] 第 {entry.cycleId} 轮
                                                </div>
                                                <div className="space-y-1 px-3 py-2">
                                                    {entry.logs.map((log, i) => (
                                                        <div key={i} className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                                                            {log}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <MessageList
                messages={messages}
                streamingContent={streamingContent}
                isLoading={isLoading}
            />
            {error && (
                <div className="px-6 pb-2 text-sm text-red-500">
                    发送失败：{error}
                </div>
            )}
            {mode !== 'doc-dev' && (
                <InputBox
                    onSend={handleSend}
                    disabled={isLoading}
                    sessionId={sessionId}
                    prefill={pendingPrefill}
                    onPrefillConsumed={() => setPendingPrefill(undefined)}
                />
            )}

            <div className="fixed left-4 bottom-4 z-20">
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10 rounded-full shadow-lg"
                    onClick={onModeBack}
                    title="返回模式选择"
                >
                    <ChevronLeft className="h-5 w-5" />
                </Button>
            </div>
        </motion.div>
    );
}
