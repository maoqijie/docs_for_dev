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
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="text-6xl mb-4">💬</div>
                <h2 className="text-2xl font-semibold text-muted-foreground">
                  开始新的对话
                </h2>
                <Button onClick={handleNewSession} size="lg">
                  <Plus className="mr-2 h-5 w-5" />
                  创建对话
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
