import { useState, useEffect } from 'react';
import { type Session, getSessions, createSession, deleteSession } from './lib/api';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { ThemeProvider } from './components/ThemeProvider';
import { Plus } from 'lucide-react';
import { Button } from './components/ui/button';
import { motion } from 'framer-motion';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'doc-dev' | 'general' | null>(() => {
    const stored = localStorage.getItem('codex-mode') as 'doc-dev' | 'general' | null;
    return stored || null;
  });
  const [showModePicker, setShowModePicker] = useState(() => mode === null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
      if (data.length > 0 && !currentSessionId) {
        setCurrentSessionId(data[0].id);
      }
    } catch (error) {
      console.error('加载会话列表失败:', error);
    }
  };

  const handleNewSession = async () => {
    try {
      const session = await createSession('新对话');
      setSessions([session, ...sessions]);
      setCurrentSessionId(session.id);
    } catch (error) {
      console.error('创建会话失败:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      // 先更新本地列表，避免等待两次请求
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      if (currentSessionId === sessionId) {
        // 删除当前会话时，切到剩余最新的一个
        const next = sessions.find((s) => s.id !== sessionId);
        setCurrentSessionId(next?.id || null);
      }

      // 再异步刷新一次，确保状态同步
      loadSessions();
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  };

  const handleSelectMode = (value: 'doc-dev' | 'general') => {
    setMode(value);
    localStorage.setItem('codex-mode', value);
    setShowModePicker(false);
  };

  const handleBackToModePicker = () => {
    setShowModePicker(true);
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="codex-theme">
      <div className="flex h-screen bg-background">
        {/* 侧边栏 */}
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSessionSelect={setCurrentSessionId}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          mode={mode || 'doc-dev'}
        />

        {/* 主内容区 */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {showModePicker ? (
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
          ) : currentSessionId ? (
            <ChatPanel
              key={currentSessionId}
              sessionId={currentSessionId}
              mode={mode || 'doc-dev'}
              onModeBack={handleBackToModePicker}
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
                  <h2 className="text-3xl font-bold tracking-tight">
                    欢迎使用 Codex AI
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    您的智能编程助手，随时准备为您解答问题、编写代码。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-left">
                  <div className="p-4 rounded-xl bg-muted/50 border hover:bg-muted transition-colors cursor-pointer" onClick={handleNewSession}>
                    <h3 className="font-semibold mb-1">编写代码</h3>
                    <p className="text-sm text-muted-foreground">帮助我实现一个 React 组件...</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50 border hover:bg-muted transition-colors cursor-pointer" onClick={handleNewSession}>
                    <h3 className="font-semibold mb-1">解释概念</h3>
                    <p className="text-sm text-muted-foreground">什么是 React Server Components?</p>
                  </div>
                </div>

                <Button onClick={handleNewSession} size="lg" className="rounded-full px-8 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-105">
                  <Plus className="mr-2 h-5 w-5" />
                  开始新的对话
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
