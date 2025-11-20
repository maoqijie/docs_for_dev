import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合并 Tailwind CSS 类名
 *
 * @example
 * ```typescript
 * cn("px-2 py-1", "bg-blue-500", {"text-white": true})
 * // => "px-2 py-1 bg-blue-500 text-white"
 * ```
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * 格式化日期为相对时间
 *
 * @param dateString ISO 8601 日期字符串
 * @returns 相对时间描述
 *
 * @example
 * ```typescript
 * formatDate("2024-01-15T10:00:00Z")
 * // => "今天" / "昨天" / "3 天前" / "2024-01-15"
 * ```
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days} 天前`;

    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
}

/**
 * 防抖函数
 *
 * @param fn 要防抖的函数
 * @param delay 延迟时间（毫秒）
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string) => {
 *   console.log("搜索:", query);
 * }, 300);
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;

    return function (...args: Parameters<T>) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}
