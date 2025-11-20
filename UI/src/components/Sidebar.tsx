import type { Session } from '../lib/api';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { cn, formatDate } from '../lib/utils';
import { Plus, MessageSquare, Trash2, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

interface SidebarProps {
    sessions: Session[];
    currentSessionId: string | null;
    onSessionSelect: (id: string) => void;
    onNewSession: () => void;
    onDeleteSession: (id: string) => void;
}

export function Sidebar({
    sessions,
    currentSessionId,
    onSessionSelect,
    onNewSession,
    onDeleteSession,
}: SidebarProps) {
    const { theme, setTheme } = useTheme();

    return (
        <div className="w-64 border-r bg-muted/10 flex flex-col">
            {/* 头部 */}
            <div className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                        Codex AI
                    </h1>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    >
                        {theme === 'dark' ? (
                            <Sun className="h-5 w-5" />
                        ) : (
                            <Moon className="h-5 w-5" />
                        )}
                    </Button>
                </div>

                <Button onClick={onNewSession} className="w-full" size="lg">
                    <Plus className="mr-2 h-5 w-5" />
                    新建对话
                </Button>
            </div>

            <Separator />

            {/* 会话列表 */}
            <ScrollArea className="flex-1 px-2">
                <div className="space-y-1 p-2">
                    {sessions.map((session) => (
                        <div
                            key={session.id}
                            className={cn(
                                'group relative rounded-lg p-3 cursor-pointer transition-all hover:bg-accent',
                                currentSessionId === session.id && 'bg-accent'
                            )}
                            onClick={() => onSessionSelect(session.id)}
                        >
                            <div className="flex items-start gap-3">
                                <MessageSquare className="h-5 w-5 mt-0.5 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{session.title}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {formatDate(session.updated_at)}
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 flex-shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteSession(session.id);
                                    }}
                                >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
