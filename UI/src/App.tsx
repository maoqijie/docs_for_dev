import { useState, useEffect, useMemo } from 'react';
import { type Session, getSessions, createSession, deleteSession, updateSessionTitle } from './lib/api';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { TemplateEditor } from './components/TemplateEditor';
import { ThemeProvider } from './components/ThemeProvider';
import { Plus } from 'lucide-react';
import { Button } from './components/ui/button';
import { motion } from 'framer-motion';
import { tauriNotReadyMessage } from './lib/tauri';

const debugEnabled = false;
const debugLog = (...args: unknown[]) => {
  if (!debugEnabled) return;
  console.log(...args);
};

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'chat' | 'templates'>('chat');
  const [sessionModes, setSessionModes] = useState<Record<string, 'doc-dev' | 'general'>>(() => {
    try {
      const raw = localStorage.getItem('codex-session-mode-map');
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error('读取会话模式映射失败', err);
      return {};
    }
  });
  const [sessionRoots, setSessionRoots] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('codex-session-root-map');
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error('读取会话根映射失败', err);
      return {};
    }
  });
  const [mode, setMode] = useState<'doc-dev' | 'general' | null>(() => {
    const stored = localStorage.getItem('codex-mode') as 'doc-dev' | 'general' | null;
    return stored || null;
  });
  const [showModePicker, setShowModePicker] = useState(() => mode === null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const handleBridgeError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(tauriNotReadyMessage)) {
      setBridgeError(`${tauriNotReadyMessage}，请重新启动或重新安装桌面客户端`);
    }
  };

  const persistSessionModes = (next: Record<string, 'doc-dev' | 'general'>) => {
    setSessionModes(next);
    try {
      localStorage.setItem('codex-session-mode-map', JSON.stringify(next));
    } catch (err) {
      console.error('保存会话模式映射失败', err);
    }
  };

  const persistSessionRoots = (next: Record<string, string>) => {
    setSessionRoots(next);
    try {
      localStorage.setItem('codex-session-root-map', JSON.stringify(next));
    } catch (err) {
      console.error('保存会话根映射失败', err);
    }
  };

  const pickFirstByMode = (
    list: Session[],
    map: Record<string, 'doc-dev' | 'general'>,
    currentMode: 'doc-dev' | 'general' | null,
  ) => {
    if (!currentMode) return list[0];
    if (currentMode === 'doc-dev') {
      // 优先选择明确标记为 doc-dev 的会话，其次选择未标记的旧会话
      return list.find((s) => map[s.id] === 'doc-dev') || list.find((s) => map[s.id] === undefined) || null;
    }
    // 通用模式：优先选择明确标记为 general 的会话，其次选择未标记的旧会话
    return list.find((s) => map[s.id] === 'general') || list.find((s) => map[s.id] === undefined) || null;
  };

  const filteredSessions = useMemo(() => {
    if (!mode) return sessions;

    // 第一层：按模式过滤
    const modeFiltered = sessions.filter((s) => {
      const m = sessionModes[s.id];
      if (mode === 'doc-dev') {
        return m === 'doc-dev' || m === undefined;
      }
      return m !== 'doc-dev';
    });

    debugLog('🔍 [DEBUG] 第一层过滤（模式）后:', modeFiltered.length, '个会话');

    // 第二层：只显示根会话（隐藏自动创建的子会话）
    const rootFiltered = modeFiltered.filter((s) => {
      const root = sessionRoots[s.id];
      // 如果没有 root 记录，说明是旧会话，当作根会话
      // 如果 root === s.id，说明是根会话
      const isRoot = !root || root === s.id;

      if (!isRoot) {
        debugLog('🔍 [DEBUG] 隐藏子会话:', s.title, '(id:', s.id, ', root:', root, ')');
      }

      return isRoot;
    });

    debugLog('🔍 [DEBUG] 第二层过滤（根会话）后:', rootFiltered.length, '个会话');
    debugLog('🔍 [DEBUG] 最终显示:', rootFiltered.map(s => ({ title: s.title, id: s.id.substring(0, 8) })));

    return rootFiltered;
  }, [sessions, sessionModes, sessionRoots, mode]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      debugLog('🔍 [DEBUG] 从数据库加载的会话数量:', data.length);
      debugLog('🔍 [DEBUG] 会话列表:', data.map(s => ({ id: s.id, title: s.title })));
      debugLog('🔍 [DEBUG] 当前模式:', mode);
      debugLog('🔍 [DEBUG] sessionModes 映射:', sessionModes);
      debugLog('🔍 [DEBUG] sessionRoots 映射:', sessionRoots);

      setSessions(data);
      // 为缺失 root 的会话补全自身为 root
      const patchedRoots: Record<string, string> = { ...sessionRoots };
      let rootsChanged = false;
      data.forEach((s) => {
        if (!patchedRoots[s.id]) {
          patchedRoots[s.id] = s.id;
          rootsChanged = true;
        }
      });
      if (rootsChanged) {
        debugLog('🔍 [DEBUG] 补全后的 sessionRoots:', patchedRoots);
        persistSessionRoots(patchedRoots);
      }
      if (data.length === 0) {
        setCurrentSessionId(null);
        return;
      }

      const first = pickFirstByMode(data, sessionModes, mode);
      const existsCurrent = data.some((d) => d.id === currentSessionId);
      // 检查当前会话是否匹配当前模式（包括未标记的旧会话）
      const currentModeMatch = currentSessionId
        ? (() => {
            const m = sessionModes[currentSessionId];
            if (!mode) return true; // 无模式时都匹配
            if (mode === 'doc-dev') {
              // doc-dev 模式：匹配 doc-dev 或未标记的会话
              return m === 'doc-dev' || m === undefined;
            }
            // 通用模式：匹配非 doc-dev 的会话
            return m !== 'doc-dev';
          })()
        : false;

      if (!existsCurrent || !currentModeMatch) {
        setCurrentSessionId(first?.id || null);
      }
    } catch (error) {
      console.error('加载会话列表失败:', error);
      handleBridgeError(error);
    }
  };

  const handleNewSession = async (title?: string, options?: { focus?: boolean }): Promise<Session | undefined> => {
    try {
      const defaultTitle = mode === 'doc-dev' ? '新任务' : '新对话';
      const session = await createSession(title || defaultTitle);
      setSessions((prev) => [session, ...prev]);
      const shouldFocus = options?.focus !== false;
      if (shouldFocus) {
        setCurrentSessionId(session.id);
      }
      if (mode) {
        const next = { ...sessionModes, [session.id]: mode };
        persistSessionModes(next);
      }
      const rootNext = { ...sessionRoots, [session.id]: session.id };
      persistSessionRoots(rootNext);
      return session;
    } catch (error) {
      console.error('创建会话失败:', error);
      handleBridgeError(error);
      return undefined;
    }
  };

  const handleSelectMode = (value: 'doc-dev' | 'general') => {
    setMode(value);
    localStorage.setItem('codex-mode', value);
    setShowModePicker(false);

    // 切换模式时，如果当前会话不属于该模式，则切到该模式第一条
    const first = pickFirstByMode(sessions, sessionModes, value);
    if (first) {
      setCurrentSessionId(first.id);
    } else {
      setCurrentSessionId(null);
    }
  };

  const handleBackToModePicker = () => {
    setShowModePicker(true);
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sessionId);
        if (currentSessionId === sessionId) {
          setCurrentSessionId(filtered[0]?.id || null);
        }
        return filtered;
      });
      if (sessionModes[sessionId]) {
        const next = { ...sessionModes };
        delete next[sessionId];
        persistSessionModes(next);
      }
      if (sessionRoots[sessionId]) {
        const nextRoot = { ...sessionRoots };
        delete nextRoot[sessionId];
        persistSessionRoots(nextRoot);
      }
      loadSessions();
    } catch (error) {
      console.error('删除会话失败:', error);
      handleBridgeError(error);
    }
  };

  const handleRenameSession = async (sessionId: string, title: string) => {
    const nextTitle = title.trim() || (mode === 'doc-dev' ? '未命名任务' : '未命名对话');
    try {
      await updateSessionTitle(sessionId, nextTitle);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: nextTitle } : s)));
    } catch (error) {
      console.error('重命名会话失败:', error);
    }
  };

  const handleMarkSessionRoot = (sessionId: string, rootId: string) => {
    const next = { ...sessionRoots, [sessionId]: rootId };
    persistSessionRoots(next);
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="codex-theme">
      <div className="flex h-screen bg-background relative">
        {bridgeError && (
          <div className="absolute left-4 right-4 top-4 z-50">
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm shadow-sm">
              {bridgeError}
            </div>
          </div>
        )}
        {showModePicker ? (
          // 仅显示模式选择页，隐藏侧边栏
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-background to-muted/20 px-6">
            <div className="max-w-4xl w-full space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold">选择模式</h2>
                <p className="text-muted-foreground">
                  文档开发模式将回答聚焦于文档/开发流程，通用模式则保持普通聊天。
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    id: 'doc-dev' as const,
                    title: '文档开发模式 (默认)',
                    desc: '聚焦文档撰写、开发步骤、结构化输出与可执行指导。',
                  },
                  {
                    id: 'general' as const,
                    title: '通用模式',
                    desc: '保持普通聊天，不强制文档语境。',
                  },
                ].map((m) => (
                  <motion.button
                    key={m.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => handleSelectMode(m.id)}
                    className="text-left rounded-2xl border bg-card/80 p-5 shadow-sm hover:border-primary transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">{m.title}</span>
                      {mode === m.id && (
                        <span className="text-xs text-primary font-medium">已选</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{m.desc}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <Sidebar
              sessions={filteredSessions}
              currentSessionId={currentSessionId}
              onSessionSelect={setCurrentSessionId}
              onNewSession={handleNewSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              mode={mode || 'doc-dev'}
              currentView={currentView}
              onViewChange={setCurrentView}
            />
            <div className="flex-1 flex flex-col relative overflow-hidden">
              {currentView === 'templates' ? (
                <TemplateEditor />
              ) : currentSessionId ? (
                <ChatPanel
                  sessionId={currentSessionId}
                  mode={mode || 'doc-dev'}
                  onModeBack={handleBackToModePicker}
                  onCreateSession={handleNewSession}
                  onMarkSessionRoot={handleMarkSessionRoot}
                  sessionRoots={sessionRoots}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
                  <div className="text-center space-y-8 max-w-lg px-4">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 blur-3xl opacity-20 rounded-full" />
                      <div className="relative bg-background p-6 rounded-2xl shadow-xl border inline-block">
                        <div className="text-6xl bg-gradient-to-br from-blue-500 to-purple-600 bg-clip-text text-transparent">
                          💬
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-3xl font-bold tracking-tight">欢迎使用 Codex AI</h2>
                      <p className="text-muted-foreground text-lg">
                        您的智能编程助手，随时准备为您解答问题、编写代码。
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-left">
                    <div
                      className="p-4 rounded-xl bg-muted/50 border hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => handleNewSession(mode === 'doc-dev' ? '新的文档任务' : undefined)}
                    >
                      <h3 className="font-semibold mb-1">{mode === 'doc-dev' ? '启动任务' : '编写代码'}</h3>
                      <p className="text-sm text-muted-foreground">
                        {mode === 'doc-dev' ? '基于文档生成新任务并自动执行' : '帮助我实现一个 React 组件...'}
                      </p>
                    </div>
                    <div
                      className="p-4 rounded-xl bg-muted/50 border hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => handleNewSession()}
                    >
                      <h3 className="font-semibold mb-1">{mode === 'doc-dev' ? '查看历史任务' : '解释概念'}</h3>
                      <p className="text-sm text-muted-foreground">{mode === 'doc-dev' ? '浏览任务历史与自动化结果' : '什么是 React Server Components?'}</p>
                    </div>
                  </div>
                  <Button
                      onClick={() => handleNewSession()}
                      size="lg"
                      className="rounded-full px-8 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-105"
                    >
                      <Plus className="mr-2 h-5 w-5" />
                      开始新的对话
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
