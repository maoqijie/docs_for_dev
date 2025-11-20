import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '../lib/api';
import { ScrollArea } from './ui/scroll-area';
import { Avatar } from './ui/avatar';
import { Card } from './ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Copy, Check } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface MessageListProps {
    messages: Message[];
    streamingContent: string;
    isLoading: boolean;
}

export function MessageList({
    messages,
    streamingContent,
    isLoading,
}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    // 自动滚动到底部
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    return (
        <ScrollArea className="flex-1 px-4 py-6">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* 已有消息 */}
                <AnimatePresence>
                    {messages.map((msg, index) => (
                        <MessageBubble key={msg.id} message={msg} index={index} />
                    ))}
                </AnimatePresence>

                {/* 流式响应中的消息 */}
                {isLoading && streamingContent && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <MessageBubble
                            message={{
                                id: -1,
                                session_id: '',
                                role: 'assistant',
                                content: streamingContent,
                                timestamp: new Date().toISOString(),
                            }}
                            index={messages.length}
                            isStreaming
                        />
                    </motion.div>
                )}

                <div ref={bottomRef} />
            </div>
        </ScrollArea>
    );
}

// ==================== 消息气泡组件 ====================

function MessageBubble({
    message,
    index,
    isStreaming = false,
}: {
    message: Message;
    index: number;
    isStreaming?: boolean;
}) {
    const isUser = message.role === 'user';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: index * 0.05, duration: 0.4, ease: "easeOut" }}
            className={cn(
                "flex gap-4 w-full",
                isUser ? "flex-row-reverse" : "flex-row"
            )}
        >
            {/* 头像 */}
            <Avatar className={cn(
                "h-9 w-9 flex-shrink-0 shadow-sm border border-border/50",
                isUser ? "mt-1" : "mt-1"
            )}>
                <div
                    className={cn(
                        "w-full h-full flex items-center justify-center",
                        isUser
                            ? "bg-gradient-to-br from-blue-600 to-violet-600"
                            : "bg-gradient-to-br from-emerald-500 to-teal-600"
                    )}
                >
                    {isUser ? (
                        <User className="h-5 w-5 text-white" />
                    ) : (
                        <Bot className="h-5 w-5 text-white" />
                    )}
                </div>
            </Avatar>

            {/* 消息内容 */}
            <div className={cn(
                "flex flex-col max-w-[85%]",
                isUser ? "items-end" : "items-start"
            )}>
                <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-xs font-medium text-muted-foreground">
                        {isUser ? 'You' : 'Codex AI'}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>

                <Card
                    className={cn(
                        "px-5 py-3.5 shadow-sm border-0",
                        isUser
                            ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
                            : "bg-muted/40 backdrop-blur-sm rounded-2xl rounded-tl-sm border border-border/40",
                        isStreaming && "animate-pulse-subtle"
                    )}
                >
                    <div className={cn(
                        "prose prose-sm max-w-none break-words",
                        isUser ? "prose-invert dark:prose-zinc dark:text-zinc-900" : "dark:prose-invert"
                    )}>
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                code({ node, className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    return match ? (
                                        <CodeBlock
                                            language={match[1]}
                                            code={String(children).replace(/\n$/, '')}
                                        />
                                    ) : (
                                        <code
                                            className={cn(
                                                "px-1.5 py-0.5 rounded text-sm font-mono",
                                                isUser ? "bg-primary-foreground/10" : "bg-muted-foreground/20"
                                            )}
                                            {...props}
                                        >
                                            {children}
                                        </code>
                                    );
                                },
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>
                    </div>
                </Card>
            </div>
        </motion.div>
    );
}

// ==================== 代码块组件 ====================

function CodeBlock({ language, code }: { language: string; code: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group my-4">
            {/* 代码块头部 */}
            <div className="flex items-center justify-between bg-zinc-800 px-4 py-2 rounded-t-lg">
                <span className="text-xs text-zinc-400">{language}</span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={handleCopy}
                >
                    {copied ? (
                        <>
                            <Check className="h-4 w-4 mr-1 text-green-500" />
                            <span className="text-xs">已复制</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-4 w-4 mr-1" />
                            <span className="text-xs">复制</span>
                        </>
                    )}
                </Button>
            </div>
            {/* 代码内容 */}
            <SyntaxHighlighter
                style={oneDark}
                language={language}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    borderBottomLeftRadius: '0.5rem',
                    borderBottomRightRadius: '0.5rem',
                }}
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
}
