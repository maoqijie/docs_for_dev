import { useState, useEffect } from 'react';
import { type Message, getMessages, sendMessage } from '../lib/api';
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
import { Sparkles, BrainCircuit } from 'lucide-react';

interface ChatPanelProps {
    sessionId: string;
}

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

export function ChatPanel({ sessionId }: ChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [model, setModel] = useState(MODELS[0].id);
    const [thinkingDepth, setThinkingDepth] = useState('low');
    const [error, setError] = useState<string | null>(null);

    // 加载会话消息
    useEffect(() => {
        loadMessages();
    }, [sessionId]);

    const loadMessages = async () => {
        try {
            const msgs = await getMessages(sessionId);
            setMessages(msgs);
        } catch (error) {
            console.error('加载消息失败:', error);
        }
    };

    const handleSend = async (content: string) => {
        // 1. 乐观更新 UI（立即显示用户消息）
        const userMessage: Message = {
            id: Date.now(),
            session_id: sessionId,
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);
        setStreamingContent('');
        setError(null);

        try {
            // 2. 发送消息并接收流式响应（带模型与思考深度）
            await sendMessage(sessionId, content, model, thinkingDepth, (chunk) => {
                setStreamingContent((prev) => prev + chunk);
            });

            // 3. 重新加载消息（包含 AI 回复）
            await loadMessages();
            setStreamingContent('');
        } catch (error) {
            console.error('发送消息失败:', error);
            setError(error instanceof Error ? error.message : String(error));
        } finally {
            setIsLoading(false);
        }
    };

    // 获取当前模型支持的思考深度选项
    const currentThinkingLevels = model === 'gpt-5.1-codex-max'
        ? [...THINKING_LEVELS, { id: 'xhigh', name: 'Extra High Effort' }]
        : THINKING_LEVELS;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-full relative"
        >
            {/* 顶部控制栏 - 悬浮 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
                {/* 模型选择 */}
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

                {/* 思考深度选择 */}
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
            <InputBox onSend={handleSend} disabled={isLoading} />
        </motion.div>
    );
}
