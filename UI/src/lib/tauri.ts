const TAURI_NOT_READY_MSG = '未检测到桌面内核（Tauri）桥接，请使用桌面客户端或重启后重试';

type InvokeFn = typeof import('@tauri-apps/api/core').invoke;

let cachedInvoke: InvokeFn | null = null;

const hasTauriBridge = () => {
  if (typeof window === 'undefined') return false;
  // 兼容不同版本的全局注入字段
  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
};

/**
 * 安全获取 invoke，避免在未注入 Tauri 桥时抛出 undefined.invoke
 */
export async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasTauriBridge()) {
    throw new Error(TAURI_NOT_READY_MSG);
  }

  if (!cachedInvoke) {
    const mod = await import('@tauri-apps/api/core');
    cachedInvoke = mod.invoke;
  }

  return cachedInvoke<T>(command, args);
}

/**
 * 检查当前是否处于 Tauri 桌面环境
 */
export const isTauri = hasTauriBridge;

export const tauriNotReadyMessage = TAURI_NOT_READY_MSG;
