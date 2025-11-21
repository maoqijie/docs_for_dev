import { useEffect, useMemo, useRef, useState } from 'react';
import { type Message, type Session, getMessages, sendMessage, pickDocuments, pickWorkdir, getSessionState, setSessionState } from '../lib/api';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { motion } from 'framer-motion';
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
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

interface ChatPanelProps {
    sessionId: string;
    mode: 'doc-dev' | 'general';
    onModeBack: () => void;
    onCreateSession?: (title?: string) => Promise<Session | undefined>;
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

type AutomationQueue = {
    targetSessionId: string;
    cycle: number;
    config: AutomationConfig;
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
    pendingPrefill?: string;
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
    infiniteLoop: false,
    notifyText: '文档任务已完成',
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

const notifyCompletion = (text: string) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
        new Notification(text);
        return;
    }
    if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                new Notification(text);
            }
        });
    }
};

export function ChatPanel({ sessionId, mode, onModeBack, onCreateSession, onMarkSessionRoot, sessionRoots }: ChatPanelProps) {
    const sessionStateRef = useRef<Record<string, SessionUiState>>({});
    const [stateVersion, setStateVersion] = useState(0);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isMessagesLoading, setIsMessagesLoading] = useState(true);
    const [streamingContent, setStreamingContent] = useState('');
    const [model, setModel] = useState(MODELS[0].id);
    const [thinkingDepth, setThinkingDepth] = useState('low');
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
    const [automationQueue, setAutomationQueue] = useState<AutomationQueue | null>(null);
    const [pendingPrefill, setPendingPrefill] = useState<string | undefined>(undefined);
    const [autoTargetSessionId, setAutoTargetSessionId] = useState<string | null>(null);
    const [autoAbort, setAutoAbort] = useState(false);
    const [autoPromptLogs, setAutoPromptLogs] = useState<string[]>([]);
    const [cycleLogs, setCycleLogs] = useState<Record<number, string[]>>({});
    const [lastCycleMs, setLastCycleMs] = useState<number | null>(null);
    const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
    const [rootElapsedMap, setRootElapsedMap] = useState<Record<string, number>>({});
    const prevSessionIdRef = useRef<string | null>(null);

    const resolveRootId = (id: string) => {
        if (!sessionRoots) return id;
        return sessionRoots[id] || id;
    };

    const persistSessionState = async (id: string | null) => {
        if (!id) return;
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
            pendingPrefill,
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
        return true;
    };

    const warmRootStates = async () => {
        if (!sessionRoots) return;
        const rootId = resolveRootId(sessionId);
        const relatedIds = Object.keys(sessionRoots).filter((sid) => resolveRootId(sid) === rootId);
        if (!relatedIds.includes(sessionId)) relatedIds.push(sessionId);

        for (const sid of relatedIds) {
            if (sessionStateRef.current[sid]) continue;
            const remote = await getSessionState(sid);
            if (remote) {
                try {
                    const parsed = JSON.parse(remote) as SessionUiState;
                    sessionStateRef.current[sid] = parsed;
                    setStateVersion((v) => v + 1);
                } catch (err) {
                    console.error('解析会话状态失败', err);
                }
            }
        }
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
            setAutomationQueue(null);

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
        stateVersion,
    ]);

    useEffect(() => {
        return () => {
            void persistSessionState(sessionId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const aggregatedPromptLogs = useMemo(() => {
        const root = resolveRootId(sessionId);
        const ids = Object.keys(sessionRoots || {}).filter((sid) => resolveRootId(sid) === root);
        if (!ids.includes(sessionId)) ids.push(sessionId);
        const logs: { sessionId: string; text: string }[] = [];
        ids.forEach((sid) => {
            const st = sessionStateRef.current[sid];
            if (st?.autoPromptLogs?.length) {
                st.autoPromptLogs.forEach((text) => logs.push({ sessionId: sid, text }));
            }
        });
        return logs;
    }, [sessionId, sessionRoots, stateVersion]);

    const aggregatedCycleLogs = useMemo(() => {
        const root = resolveRootId(sessionId);
        const ids = Object.keys(sessionRoots || {}).filter((sid) => resolveRootId(sid) === root);
        if (!ids.includes(sessionId)) ids.push(sessionId);
        const result: { sessionId: string; cycleId: string; logs: string[] }[] = [];
        ids.forEach((sid) => {
            const st = sessionStateRef.current[sid];
            if (st?.cycleLogs) {
                Object.entries(st.cycleLogs).forEach(([cycleId, logs]) => {
                    result.push({ sessionId: sid, cycleId, logs });
                });
            }
        });
        // 最新的 cycleId 优先，其次按 sessionId
        return result.sort((a, b) => Number(b.cycleId) - Number(a.cycleId) || a.sessionId.localeCompare(b.sessionId));
    }, [sessionId, sessionRoots, stateVersion]);

    useEffect(() => {
        if (automationQueue) {
            runAutomationCycle(automationQueue.cycle, automationQueue.config);
            setAutomationQueue(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [automationQueue]);

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
        content: string,
        targetOverride?: string,
        skipUiInjection = false,
    ): Promise<Message | null> => {
        const targetSession = targetOverride || sessionId;
        const userMessage: Message = {
            id: Date.now(),
            session_id: targetSession,
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
        };
        if (!skipUiInjection && targetSession === sessionId) {
            setMessages((prev) => [...prev, userMessage]);
        }
        setIsLoading(true);
        setStreamingContent('');
        setError(null);
        setIsMessagesLoading(true);

        try {
            const finalContent =
                mode === 'doc-dev'
                    ? `【文档开发模式】请针对文档/开发相关需求输出结构化、可执行的步骤与示例。\n${content}`
                    : content;

            await sendMessage(targetSession, finalContent, model, thinkingDepth, (chunk) => {
                if (!skipUiInjection && targetSession === sessionId) {
                    setStreamingContent((prev) => prev + chunk);
                }
            }, mode === 'doc-dev' ? docBasePath : undefined);

            const updated = await getMessages(targetSession);
            if (!skipUiInjection && targetSession === sessionId) {
                setMessages(updated);
                setStreamingContent('');
            }
            const lastAssistant = [...updated].reverse().find((m) => m.role === 'assistant') ?? null;
            return lastAssistant;
        } catch (err) {
            console.error('发送消息失败:', err);
            setError(err instanceof Error ? err.message : String(err));
            return null;
        } finally {
            setIsLoading(false);
            setIsMessagesLoading(false);
        }
    };

    const appendLog = (text: string, cycleId: number = autoCycle) => {
        const entry = text.trim();
        if (!entry) return;
        setCycleLogs((prev) => {
            const current = prev[cycleId] || [];
            const next = [entry, ...current].slice(0, 200);
            return { ...prev, [cycleId]: next };
        });
    };

    const recordElapsed = (elapsed: number) => {
        setLastCycleMs(elapsed);
        setSessionElapsedMs((prev) => prev + elapsed);
        const root = resolveRootId(autoTargetSessionId || sessionId);
        setRootElapsedMap((prev) => {
            const nextTotal = (prev[root] || 0) + elapsed;
            return { ...prev, [root]: nextTotal };
        });
    };

    const appendPromptLog = (text: string, cycleId: number = autoCycle) => {
        const entry = text.trim();
        if (!entry) return;
        setAutoPromptLogs((prev) => {
            const next = [`【提示】${entry}`, ...prev].slice(0, 200);
            return next;
        });
    };

    const handleSend = async (content: string) => {
        await sendContent(content);
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

    const inferCommonDir = (paths: string[]): string => {
        if (paths.length === 0) return '';
        const splitPaths = paths.map((p) => p.split(/[\\/]+/).filter(Boolean));
        const minLen = Math.min(...splitPaths.map((arr) => arr.length));
        const common: string[] = [];
        for (let i = 0; i < minLen; i++) {
            const segment = splitPaths[0][i];
            if (splitPaths.every((arr) => arr[i] === segment)) {
                common.push(segment);
            } else {
                break;
            }
        }
        return common.length ? common.join('/') : '';
    };

    const handlePickDocsNative = async () => {
        setIsPickingDocs(true);
        try {
            const picked = await pickDocuments(true);
            if (!picked.length) return;

            const absPaths = picked.map((p) => p.path);

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

    const buildPromptWithDocs = (
        template: string,
        includeCompletionHint = true,
        customConfig: AutomationConfig = autoConfig,
    ) => {
        const docBlock = buildDocBlock(docFiles, docBasePath);
        const workdir = docBasePath?.trim() || './';
        const workdirHint = `工作目录: ${workdir}（若包含 ~ 请先展开为绝对路径）\n所有文件操作必须在该目录下，使用文档提供的相对路径。`;
        const fixDirective = [
            '若发现实现与文档不符，必须直接修改/创建文件完成修复，不要只给检查结论。',
            '请输出具体文件路径和补丁/代码段或需执行的命令，并在修复后简要总结变更。',
            '若因权限/信息不足无法修改，说明原因并不要输出完成标记。',
            `只有在确认无需修改或修复已完成且输出标记「${customConfig.completionSignal.trim() || '已完全根据文档完成'}」时才视为完成。`,
        ].join('\\n');

        let promptBody = template.includes('{documents}')
            ? template.replace('{documents}', docBlock || '（未选择文档，请先选择）')
            : `${template}${docBlock ? `\n\n${docBlock}` : ''}`;

        if (includeCompletionHint && customConfig.completionSignal.trim()) {
            promptBody = `${promptBody}\n\n完成后请输出精确标记：${customConfig.completionSignal.trim()}，否则视为未完成。`;
        }

        const prompt = `${workdirHint}\n${fixDirective}\n\n${promptBody}`;
        appendPromptLog(prompt, autoCycle);
        return prompt;
    };

    const handlePrefillToInput = () => {
        setPendingPrefill(buildPromptWithDocs(autoConfig.taskPrompt));
    };

    const startAutomation = async (cycle = 1) => {
        const config = autoConfig;
        setAutoAbort(false);
        // 若要求每轮新会话，先创建后切换再排队执行
        if (config.newSessionEachLoop || config.autoRestartSession) {
            if (onCreateSession) {
                setAutoStatus(`创建新会话用于第 ${cycle} 轮…`);
                const newSession = await onCreateSession(`文档自动循环 ${cycle}`);
                if (newSession) {
                    if (onMarkSessionRoot) {
                        const root = resolveRootId(sessionId);
                        onMarkSessionRoot(newSession.id, root);
                    }
                    setAutoTargetSessionId(newSession.id);
                    setAutomationQueue({ targetSessionId: newSession.id, cycle, config });
                    return;
                }
            }
        }

        // 否则直接在当前会话执行
        setAutoTargetSessionId(sessionId);
        setAutomationQueue({ targetSessionId: sessionId, cycle, config });
    };

    const handleStopAutomation = () => {
        setAutoAbort(true);
        setAutomationQueue(null);
        setAutoRunning(false);
        setAutoTargetSessionId(null);
        setAutoStatus('已手动停止，后续不再发送请求');
        setIsLoading(false);
        setIsMessagesLoading(false);
        setStreamingContent('');
        appendLog('任务已手动停止，后续不再发送请求。');
        setLastCycleMs(null);
    };

    const handleAutomationSuccess = (config: AutomationConfig, cycle: number) => {
        setAutoStatus(`检测到完成标记「${config.completionSignal}」，在第 ${cycle} 轮完成。`);
        setAutoRunning(false);
        notifyCompletion(config.notifyText || '文档开发任务已完成');
        appendLog(`第 ${cycle} 轮：已完成，输出包含标记「${config.completionSignal}」`, cycle);
        setAutoTargetSessionId(null);
    };

    const handleAutomationFailure = async (config: AutomationConfig, cycle: number) => {
        const shouldContinue = config.autoRestartSession && (config.infiniteLoop || config.maxCycles > cycle);
        if (shouldContinue && onCreateSession) {
            const next = cycle + 1;
            const label = config.infiniteLoop ? `第 ${next} 轮` : `(${next}/${config.maxCycles})`;
            setAutoStatus(`第 ${cycle} 轮未完成，准备新建会话继续 ${label}`);
            const newSession = await onCreateSession(`文档自动循环 ${next}`);
            if (newSession) {
                if (onMarkSessionRoot) {
                    const root = resolveRootId(sessionId);
                    onMarkSessionRoot(newSession.id, root);
                }
                setAutoTargetSessionId(newSession.id);
                setAutomationQueue({ targetSessionId: newSession.id, cycle: next, config });
                setAutoRunning(false);
                return;
            }
        }
        setAutoStatus('未检测到完成标记，自动循环已停止');
        setAutoRunning(false);
        appendLog(`第 ${cycle} 轮：未完成，循环结束`, cycle);
    };

    const runAutomationCycle = async (cycle = 1, configOverride?: AutomationConfig) => {
        if (!sessionId || isLoading) return;
        const config = configOverride || autoConfig;
        if (autoAbort) {
            setAutoRunning(false);
            setAutoStatus('已停止');
            return;
        }
        setAutoRunning(true);
        setAutoCycle(cycle);
        setAutoStatus(`第 ${cycle} 轮：发送主查询…`);
        appendLog(`第 ${cycle} 轮：开始执行`);

        try {
            const target = autoTargetSessionId || sessionId;
            const startedAt = Date.now();
            const firstReply = await sendContent(buildPromptWithDocs(config.taskPrompt, true, config), target, true);
            if (firstReply?.content) {
                appendLog(`第 ${cycle} 轮主查询回复：${firstReply.content}`, cycle);
            }
            if (autoAbort) {
                setAutoRunning(false);
                setAutoStatus('已停止');
                appendLog(`第 ${cycle} 轮：手动停止，已终止后续请求。`);
                recordElapsed(Date.now() - startedAt);
                return;
            }
            if (messageHasCompletion(firstReply, config.completionSignal)) {
                recordElapsed(Date.now() - startedAt);
                handleAutomationSuccess(config, cycle);
                return;
            }

            if (config.nextStep.trim()) {
                setAutoStatus('未检测到标记，发送下一步指令…');
                const followReply = await sendContent(buildPromptWithDocs(config.nextStep, true, config), target, true);
                if (followReply?.content) {
                    appendLog(`第 ${cycle} 轮补充查询回复：${followReply.content}`, cycle);
                }
                if (autoAbort) {
                    setAutoRunning(false);
                    setAutoStatus('已停止');
                    appendLog(`第 ${cycle} 轮：手动停止，已终止后续请求。`);
                    recordElapsed(Date.now() - startedAt);
                    return;
                }
                // 修复阶段输出的完成标记不采纳，需下一轮检查阶段确认
            }

            recordElapsed(Date.now() - startedAt);
            await handleAutomationFailure(config, cycle);
        } catch (err) {
            console.error('自动执行失败:', err);
            setError(err instanceof Error ? err.message : String(err));
            setAutoStatus('自动执行失败，请重试');
            setAutoRunning(false);
        }
    };

    const currentThinkingLevels = model === 'gpt-5.1-codex-max'
        ? [...THINKING_LEVELS, { id: 'xhigh', name: 'Extra High Effort' }]
        : THINKING_LEVELS;

    const showTopLoader = isMessagesLoading || isLoading || !!streamingContent;

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
                                    选择文档→生成提示→自动调用 Codex，未输出完成标记则继续发送下一步并可在新会话循环重试。
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
                                            任务提示词模板（支持 {`{documents}`} 自动替换）
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                onClick={handlePrefillToInput}
                                            >
                                                插入到输入框
                                            </Button>
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
                                    <Textarea
                                        rows={6}
                                        value={autoConfig.taskPrompt}
                                        onChange={(e) =>
                                            setAutoConfig((prev) => ({ ...prev, taskPrompt: e.target.value }))
                                        }
                                        className="bg-background/80"
                                        placeholder="例如：帮我检查 {documents} 是否已完全实现，完成后输出 `完成`。"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">完成后输出标记</label>
                                        <Input
                                            value={autoConfig.completionSignal}
                                            onChange={(e) =>
                                                setAutoConfig((prev) => ({ ...prev, completionSignal: e.target.value }))
                                            }
                                            placeholder="如：完成 或 已完全根据文档完成"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">未完成时的下一步内容</label>
                                        <Textarea
                                            rows={4}
                                            value={autoConfig.nextStep}
                                            onChange={(e) =>
                                                setAutoConfig((prev) => ({ ...prev, nextStep: e.target.value }))
                                            }
                                            className="bg-background/80"
                                            placeholder="未给出完成标记时追加的指令，将自动附上文档路径（Codex会用Read工具读取）"
                                        />
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
                                                placeholder="完成后系统通知内容"
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
                                            onClick={handleStopAutomation}
                                            disabled={!autoRunning && !automationQueue}
                                        >
                                            立即停止
                                        </Button>
                                    </div>
                                    <div className="rounded-xl bg-background/70 border px-3 py-2 text-sm flex items-center gap-2">
                                        {autoStatus ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
                                        <span className="text-muted-foreground">{autoStatus || '尚未开始自动循环，调整配置后点击自动执行。'}</span>
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
                                {lastCycleMs !== null && (
                                    <span>本轮 {formatDuration(lastCycleMs)}</span>
                                )}
                                <span>会话累计 {formatDuration(sessionElapsedMs)}</span>
                                <span>
                                    任务累计 {formatDuration(rootElapsedMap[resolveRootId(autoTargetSessionId || sessionId)] || sessionElapsedMs)}
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
                isLoading={isMessagesLoading || isLoading}
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
