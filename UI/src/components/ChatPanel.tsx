import { useState, useEffect } from 'react';
import { type Message, getMessages, sendMessage } from '../lib/api';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { motion } from 'framer-motion';

interface ChatPanelProps {
    sessionId: string;
}

export function ChatPanel({ sessionId }: ChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');

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

        try {
            // 2. 发送消息并接收流式响应
            await sendMessage(sessionId, content, (chunk) => {
                setStreamingContent((prev) => prev + chunk);
            });

            // 3. 重新加载消息（包含 AI 回复）
            await loadMessages();
            setStreamingContent('');
        } catch (error) {
            console.error('发送消息失败:', error);
            // TODO: 显示错误提示
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-full"
        >
            <MessageList
                messages={messages}
                streamingContent={streamingContent}
                isLoading={isLoading}
            />
            <InputBox onSend={handleSend} disabled={isLoading} />
        </motion.div>
    );
}
