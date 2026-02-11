import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Send, Loader2, Image as ImageIcon, Paperclip, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface InputBoxProps {
    onSend: (content: string) => void;
    disabled: boolean;
    /** 绑定当前会话，切换时重置输入与附件 */
    sessionId: string;
    /** 程序化填充内容，便于将模板/文档注入输入框 */
    prefill?: string;
    onPrefillConsumed?: () => void;
}

type Attachment = {
    id: string;
    name: string;
    size: number;
    type: string;
    dataUrl: string; // base64 data URL
    isImage: boolean;
};

export function InputBox({ onSend, disabled, sessionId, prefill, onPrefillConsumed }: InputBoxProps) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isReading, setIsReading] = useState(false);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(1)}${sizes[i]}`;
    };

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setIsReading(true);
        const tasks = Array.from(files).map(
            (file) =>
                new Promise<Attachment | null>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const dataUrl = reader.result as string;
                        resolve({
                            id: `${file.name}-${file.size}-${Date.now()}`,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            dataUrl,
                            isImage: file.type.startsWith('image/'),
                        });
                    };
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                })
        );
        const result = (await Promise.all(tasks)).filter(Boolean) as Attachment[];
        setAttachments((prev) => [...prev, ...result]);
        setIsReading(false);
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        // 直接读取剪贴板中的文件（图片/其他二进制）
        if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
            e.preventDefault();
            await handleFiles(e.clipboardData.files);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((!input.trim() && attachments.length === 0) || disabled || isReading) {
            return;
        }
        let finalContent = input.trim();
        if (attachments.length > 0) {
            const attachmentText = attachments
                .map((att) =>
                    att.isImage
                        ? `![${att.name}](${att.dataUrl})`
                        : `**文件**: ${att.name} (${formatBytes(att.size)})\n${att.dataUrl}`
                )
                .join('\n\n');
            finalContent = finalContent
                ? `${finalContent}\n\n${attachmentText}`
                : attachmentText;
        }

        onSend(finalContent);
        setInput('');
        setAttachments([]);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
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

    // 程序化填充
    useEffect(() => {
        if (prefill !== undefined) {
            setInput(prefill);
            onPrefillConsumed?.();
        }
    }, [prefill, onPrefillConsumed]);

    // 会话切换时重置输入状态
    useEffect(() => {
        setInput('');
        setAttachments([]);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }, [sessionId]);

    return (
        <div className="p-4 md:p-6 bg-gradient-to-t from-background via-background/95 to-transparent border-t border-border/60">
            <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSubmit}
                className="max-w-4xl mx-auto relative"
            >
                <div className="relative flex items-end gap-2 p-2 bg-card/70 backdrop-blur-sm border border-border/70 rounded-2xl shadow-lg focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all duration-200">
                    <div className="flex flex-col gap-2 px-2 py-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-xl hover:bg-accent/70 cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={disabled}
                            title="上传图片/文件"
                        >
                            <Paperclip className="h-4 w-4" />
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => handleFiles(e.target.files)}
                        />
                    </div>
                    <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
                        disabled={disabled}
                        className="min-h-[50px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-3 text-base leading-relaxed placeholder:leading-relaxed"
                        rows={1}
                    />
                    <Button
                        type="submit"
                        disabled={disabled || (!input.trim() && attachments.length === 0) || isReading}
                        size="icon"
                        className={cn(
                            "mb-1 mr-1 h-9 w-9 rounded-xl transition-all duration-200",
                            (input.trim() || attachments.length > 0)
                                ? "bg-primary hover:bg-primary/90 shadow-md hover:-translate-y-0.5"
                                : "bg-muted-foreground/20"
                        )}
                    >
                        {disabled || isReading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
                {attachments.length > 0 && (
                    <div className="max-w-4xl mx-auto mt-2 grid grid-cols-2 gap-2">
                        {attachments.map((att) => (
                            <div
                                key={att.id}
                                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border/70 bg-card/65 backdrop-blur-sm"
                            >
                                <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                                    {att.isImage ? (
                                        <img
                                            src={att.dataUrl}
                                            alt={att.name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium leading-6 truncate">{att.name}</div>
                                    <div className="text-xs leading-5 text-muted-foreground">
                                        {formatBytes(att.size)}
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-accent/80 cursor-pointer"
                                    onClick={() =>
                                        setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                                    }
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="text-center mt-2">
                    <p className="text-xs leading-5 text-muted-foreground/65 max-w-prose mx-auto">
                        支持粘贴或上传图片/文件，Docs_For_Dev 可能生成不准确信息，请核对重要事实。
                    </p>
                </div>
            </motion.form>
        </div>
    );
}
