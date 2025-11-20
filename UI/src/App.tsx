import { useState, useEffect } from 'react';
import { type Session, getSessions, createSession, deleteSession } from './lib/api';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { ThemeProvider } from './components/ThemeProvider';
import { Plus } from 'lucide-react';
import { Button } from './components/ui/button';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

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
      await loadSessions();
      if (currentSessionId === sessionId) {
        setCurrentSessionId(sessions[0]?.id || null);
      }
    } catch (error) {
      console.error('删除会话失败:', error);
    }
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
        />

        {/* 主内容区 */}
        <div className="flex-1 flex flex-col">
          {currentSessionId ? (
            <ChatPanel key={currentSessionId} sessionId={currentSessionId} />
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
