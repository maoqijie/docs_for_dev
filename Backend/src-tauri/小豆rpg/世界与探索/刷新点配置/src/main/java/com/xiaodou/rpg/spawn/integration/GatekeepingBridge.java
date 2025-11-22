package com.xiaodou.rpg.spawn.integration;

import cn.nukkit.plugin.Plugin;
import cn.nukkit.plugin.PluginBase;
import cn.nukkit.plugin.PluginManager;
import cn.nukkit.plugin.service.ProviderRegistration;
import cn.nukkit.plugin.service.ServiceManager;
import java.lang.reflect.Method;
import java.util.Objects;
import java.util.UUID;
import java.util.logging.Level;

/**
 * 反射桥接 tower-gatekeeping，供守护者掉落补发层钥匙。
 */
public final class GatekeepingBridge {
    private static final String API_CLASS = "com.tower.gatekeeping.api.GatekeepingApi";

    private final PluginBase owner;
    private volatile Object gatekeepingService;
    private volatile Method rewardMethod;
    private volatile Method addKeysMethod;
    private volatile boolean missingLogged;

    public GatekeepingBridge(PluginBase owner) {
        this.owner = Objects.requireNonNull(owner, "owner");
    }

    public void rewardGateKeys(UUID playerId, int layer, int amount, String source) {
        if (playerId == null || amount <= 0) {
            return;
        }
        Object service = ensureService();
        if (service == null) {
            return;
        }
        try {
            if (rewardMethod != null) {
                rewardMethod.invoke(service, playerId, layer, amount, source);
                return;
            }
            if (addKeysMethod != null) {
                addKeysMethod.invoke(service, playerId, amount);
            }
        } catch (ReflectiveOperationException exception) {
            owner.getLogger().log(Level.WARNING, "[spawn] 调用 gatekeeping 发放层钥匙失败", exception);
            gatekeepingService = null;
            rewardMethod = null;
            addKeysMethod = null;
        }
    }

    private Object ensureService() {
        Object current = gatekeepingService;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (gatekeepingService != null) {
                return gatekeepingService;
            }
            try {
                Plugin plugin = locatePlugin();
                ClassLoader loader = plugin != null ? plugin.getClass().getClassLoader() : owner.getClass().getClassLoader();
                Class<?> apiClass = Class.forName(API_CLASS, true, loader);
                Object service = locateService(apiClass, plugin);
                if (service == null) {
                    if (!missingLogged) {
                        owner.getLogger().warning("[spawn] 未找到 tower-gatekeeping 服务，层钥匙无法补发");
                        missingLogged = true;
                    }
                    return null;
                }
                Method reward = findRewardMethod(apiClass);
                Method addKeys = apiClass.getMethod("addKeys", UUID.class, int.class);
                gatekeepingService = service;
                rewardMethod = reward;
                addKeysMethod = addKeys;
                owner.getLogger().info("[spawn] 已连接 tower-gatekeeping");
                return service;
            } catch (ClassNotFoundException exception) {
                if (!missingLogged) {
                    owner.getLogger().warning("[spawn] gatekeeping API 未就绪: " + exception.getMessage());
                    missingLogged = true;
                }
                return null;
            } catch (ReflectiveOperationException exception) {
                owner.getLogger().log(Level.WARNING, "[spawn] 连接 tower-gatekeeping 失败", exception);
                return null;
            }
        }
    }

    private Plugin locatePlugin() {
        PluginManager manager = owner.getServer().getPluginManager();
        Plugin plugin = manager.getPlugin("tower-gatekeeping");
        if (plugin == null) {
            plugin = manager.getPlugin("TowerGatekeeping");
        }
        return plugin;
    }

    private Object locateService(Class<?> apiClass, Plugin gatekeepingPlugin) throws ReflectiveOperationException {
        ServiceManager services = owner.getServer().getServiceManager();
        ProviderRegistration<?> registration = services.getRegistration((Class) apiClass);
        if (registration != null && registration.getProvider() != null) {
            return registration.getProvider();
        }
        if (gatekeepingPlugin == null) {
            return null;
        }
        try {
            Method accessor = gatekeepingPlugin.getClass().getMethod("getGatekeepingApi");
            return accessor.invoke(gatekeepingPlugin);
        } catch (NoSuchMethodException ignored) {
            return null;
        }
    }

    private Method findRewardMethod(Class<?> apiClass) {
        try {
            return apiClass.getMethod("rewardGateKeys", UUID.class, int.class, int.class, String.class);
        } catch (NoSuchMethodException ignored) {
            return null;
        }
    }
}
