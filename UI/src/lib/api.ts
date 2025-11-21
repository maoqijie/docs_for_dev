import { invoke } from '@tauri-apps/api/core';

// ==================== 类型定义 ====================

export interface Session {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

export interface Message {
    id: number;
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
}

// ==================== 会话管理 ====================

/**
 * 创建新会话
 * @param title 会话标题
 * @returns 新创建的会话对象
 */
export async function createSession(title: string): Promise<Session> {
    return await invoke('create_session', { title });
}

/**
 * 获取所有会话（按更新时间倒序）
 * @returns 会话列表
 */
export async function getSessions(): Promise<Session[]> {
    return await invoke('get_sessions');
}

/**
 * 删除会话
 * @param sessionId 会话 ID
 */
export async function deleteSession(sessionId: string): Promise<void> {
    return await invoke('delete_session', { sessionId, session_id: sessionId });
}

/**
 * 更新会话标题
 * @param sessionId 会话 ID
 * @param title 新标题
 */
export async function updateSessionTitle(
    sessionId: string,
    title: string
): Promise<void> {
    return await invoke('update_session_title', { session_id: sessionId, title });
}

// ==================== 消息管理 ====================

/**
 * 获取会话的所有消息
 * @param sessionId 会话 ID
 * @returns 消息列表
 */
export async function getMessages(sessionId: string): Promise<Message[]> {
    return await invoke('get_messages', { sessionId, session_id: sessionId });
}

/**
 * 发送消息（流式响应）
 *
 * @param sessionId 会话 ID
 * @param content 消息内容
 * @param model 模型名称 (例如: "gpt-5", "gpt-5.1-codex-max")
 * @param thinkingDepth 思考深度 (例如: "low", "medium", "high", "xhigh")
 * @param onChunk 接收流式 chunk 的回调函数
 *
 * @example
 * ```typescript
 * await sendMessage(sessionId, "你好", "gpt-5", "high", (chunk) => {
 *   console.log("收到:", chunk);
 * });
 * ```
 */
export async function sendMessage(
    sessionId: string,
    content: string,
    model: string,
    thinkingDepth: string,
    onChunk: (chunk: string) => void,
    workingDir?: string
): Promise<void> {
    try {
        // 调用后端命令
        // 兼容 Tauri 参数命名（部分环境要求 camelCase）
        await invoke('send_message', {
            sessionId,
            session_id: sessionId,
            content,
            model,
            thinking_depth: thinkingDepth,
            working_dir: workingDir,
        });

        // 若需要流式展示，可在此扩展（当前后端已写入 DB，前端后续 reload）
        if (onChunk) {
            onChunk('');
        }
    } catch (error) {
        console.error('send_message 调用失败', error);
        throw error;
    }
}
