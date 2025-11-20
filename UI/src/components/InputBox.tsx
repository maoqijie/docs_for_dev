import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

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
        <div className="border-t bg-background p-4">
            <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSubmit}
                className="max-w-4xl mx-auto"
            >
                <div className="relative flex items-end gap-2">
                    <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
                        disabled={disabled}
                        className="min-h-[60px] max-h-[200px] resize-none pr-12"
                        rows={1}
                    />
                    <Button
                        type="submit"
                        disabled={disabled || !input.trim()}
                        size="icon"
                        className="absolute right-2 bottom-2 h-10 w-10 rounded-full"
                    >
                        {disabled ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Send className="h-5 w-5" />
                        )}
                    </Button>
                </div>
            </motion.form>
        </div>
    );
}
