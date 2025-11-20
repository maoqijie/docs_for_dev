import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface InputBoxProps {
    onSend: (content: string) => void;
    disabled: boolean;
}

export function InputBox({ onSend, disabled }: InputBoxProps) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !disabled) {
            onSend(input);
            setInput('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Enter 发送，Shift+Enter 换行
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    // 自动调整文本框高度
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [input]);

    return (
        <div className="p-6 bg-gradient-to-t from-background via-background to-transparent">
            <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSubmit}
                className="max-w-4xl mx-auto relative"
            >
                <div className="relative flex items-end gap-2 p-2 bg-muted/30 backdrop-blur-sm border rounded-2xl shadow-lg focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all duration-300">
                    <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
                        disabled={disabled}
                        className="min-h-[50px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-3 text-base"
                        rows={1}
                    />
                    <Button
                        type="submit"
                        disabled={disabled || !input.trim()}
                        size="icon"
                        className={cn(
                            "mb-1 mr-1 h-9 w-9 rounded-xl transition-all duration-300",
                            input.trim() ? "bg-primary hover:bg-primary/90 shadow-md hover:scale-105" : "bg-muted-foreground/20"
                        )}
                    >
                        {disabled ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
                <div className="text-center mt-2">
                    <p className="text-xs text-muted-foreground/50">
                        Codex AI 可能生成不准确的信息，请核对重要事实。
                    </p>
                </div>
            </motion.form>
        </div>
    );
}
