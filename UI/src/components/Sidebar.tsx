import type { Session } from '../lib/api';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { cn, formatDate } from '../lib/utils';
import { Plus, MessageSquare, Trash2, Moon, Sun, Sparkles, Pencil, Check, X, Settings } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Input } from './ui/input';

interface SidebarProps {
    sessions: Session[];
    currentSessionId: string | null;
    onSessionSelect: (id: string) => void;
    onNewSession: (title?: string, options?: { focus?: boolean }) => Promise<Session | undefined> | void;
    onDeleteSession: (id: string) => void;
    onRenameSession: (id: string, title: string) => void;
    mode: 'doc-dev' | 'general';
    currentView: 'chat' | 'templates';
    onViewChange: (view: 'chat' | 'templates') => void;
}

export function Sidebar({
    sessions,
    currentSessionId,
    onSessionSelect,
    onNewSession,
    onDeleteSession,
    onRenameSession,
    mode,
    currentView,
    onViewChange,
}: SidebarProps) {
    const { theme, setTheme } = useTheme();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [savingId, setSavingId] = useState<string | null>(null);

    const startEdit = (session: Session) => {
        setEditingId(session.id);
        setEditingValue(session.title);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingValue('');
        setSavingId(null);
    };

    const saveEdit = async (sessionId: string) => {
        const title = editingValue.trim();
        setSavingId(sessionId);
        await onRenameSession(sessionId, title);
        setSavingId(null);
        setEditingId(null);
    };

    return (
        <div className="w-72 border-r bg-muted/10 backdrop-blur-xl flex flex-col h-full transition-all duration-300 ease-in-out">
            {/* 头部 */}
            <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-xl">
                            <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                            Codex AI
                        </h1>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-muted/50 transition-colors"
                            onClick={() => onViewChange(currentView === 'chat' ? 'templates' : 'chat')}
                            title={currentView === 'chat' ? '模板设置' : '返回聊天'}
                        >
                            <Settings className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-muted/50 transition-colors"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        >
                            {theme === 'dark' ? (
                                <Sun className="h-5 w-5 text-yellow-500" />
                            ) : (
                                <Moon className="h-5 w-5 text-slate-700" />
                            )}
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-2 py-2 rounded-xl border bg-background/70">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                        {mode === 'doc-dev' ? '文档开发模式 (默认)' : '通用模式'}
                    </span>
                </div>

                <Button
                    onClick={() => onNewSession()}
                    className="w-full rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 bg-gradient-to-r from-primary to-purple-600 hover:scale-[1.02]"
                    size="lg"
                >
                    <Plus className="mr-2 h-5 w-5" />
                    {mode === 'doc-dev' ? '新建任务' : '新建对话'}
                </Button>
            </div>

            <Separator className="opacity-50" />

            {/* 会话列表 */}
            <ScrollArea className="flex-1 px-3 py-4">
                <div className="space-y-1">
                    {sessions.map((session) => (
                        <motion.div
                            layout
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={session.id}
                            className={cn(
                                'group relative rounded-xl p-3 cursor-pointer transition-all duration-200 hover:bg-accent/50 border border-transparent',
                                currentSessionId === session.id && 'bg-accent border-border/50 shadow-sm'
                            )}
                            onClick={() => onSessionSelect(session.id)}
                        >
                            <div className="flex items-center gap-3">
                                <MessageSquare className={cn(
                                    "h-4 w-4 transition-colors",
                                    currentSessionId === session.id ? "text-primary" : "text-muted-foreground"
                                )} />
                                <div className="flex-1 min-w-0">
                                    {editingId === session.id ? (
                                        <div className="space-y-1">
                                            <Input
                                                value={editingValue}
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => setEditingValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        saveEdit(session.id);
                                                    }
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        cancelEdit();
                                                    }
                                                }}
                                                className="h-9 text-sm"
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    className="h-8 px-2"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        saveEdit(session.id);
                                                    }}
                                                    disabled={savingId === session.id}
                                                >
                                                    <Check className="h-3.5 w-3.5 mr-1" /> 保存
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 px-2"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        cancelEdit();
                                                    }}
                                                >
                                                    <X className="h-3.5 w-3.5 mr-1" /> 取消
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className={cn(
                                                "font-medium truncate text-sm transition-colors",
                                                currentSessionId === session.id ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                                            )}>
                                                {session.title}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                                                {formatDate(session.updated_at)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    {editingId !== session.id && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="opacity-0 group-hover:opacity-100 transition-all h-7 w-7 rounded-lg"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startEdit(session);
                                            }}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="opacity-0 group-hover:opacity-100 transition-all h-7 w-7 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteSession(session.id);
                                        }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
