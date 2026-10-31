'use strict';

/**
 * @object pending
 * Short-lived, in-memory pending credential snapshots for sign-up capture.
 *
 * Snapshots live in browser.storage.session (never written to disk, trusted
 * contexts only) with an in-memory fallback. Values are never logged.
 */
const pending = {};
pending.KEY_PREFIX = 'kpxcPending_';
pending.TTL_MS = 10 * 60 * 1000;
pending.STEP_TTL_MS = 5 * 60 * 1000;
pending.MAX_VALUE_LENGTH = 4096;
pending.MAX_EXTRA_FIELDS = 20;
pending.memory = new Map();

const pendingSessionArea = function() {
    return browser.storage.session ?? null;
};

pending.key = function(tabId, frameId = 0) {
    return `${pending.KEY_PREFIX}${tabId}_${frameId}`;
};

pending.isValidType = function(type) {
    return type === 'register' || type === 'change-password' || type === 'reset-password';
};

const pendingCleanString = function(value, maximumLength = pending.MAX_VALUE_LENGTH) {
    return typeof value === 'string' ? value.slice(0, maximumLength) : '';
};

const pendingSameSite = function(left, right) {
    try {
        const leftHost = new URL(left).hostname.replace(/^www\./i, '');
        const rightHost = new URL(right).hostname.replace(/^www\./i, '');
        return leftHost === rightHost
            || leftHost.endsWith(`.${rightHost}`)
            || rightHost.endsWith(`.${leftHost}`);
    } catch (_error) {
        return false;
    }
};

pending.sanitize = function(data) {
    if (!data || !pending.isValidType(data.formType)) {
        return null;
    }

    const url = pendingCleanString(data.url, 2048);
    const topUrl = pendingCleanString(data.topUrl, 2048);
    if (!/^https?:\/\//i.test(url)) {
        return null;
    }

    const password = pendingCleanString(data.password);
    const awaitingPassword = data.awaitingPassword === true;
    if (password === '' && !awaitingPassword) {
        return null;
    }

    const extraFields = {};
    if (data.extraFields && typeof data.extraFields === 'object' && !Array.isArray(data.extraFields)) {
        let count = 0;
        for (const [ name, value ] of Object.entries(data.extraFields)) {
            if (count >= pending.MAX_EXTRA_FIELDS) {
                break;
            }

            if (typeof name !== 'string' || name.length === 0 || name.length > 64) {
                continue;
            }

            if (typeof value !== 'string') {
                continue;
            }

            extraFields[name] = value.slice(0, 1024);
            ++count;
        }
    }

    return {
        awaitingPassword,
        email: pendingCleanString(data.email),
        extraFields,
        formType: data.formType,
        password,
        submitted: data.submitted === true,
        timestamp: Date.now(),
        topUrl,
        url,
        username: pendingCleanString(data.username)
    };
};

const pendingReadAll = async function() {
    const area = pendingSessionArea();
    if (area) {
        return await area.get(null);
    }

    return Object.fromEntries(pending.memory);
};

const pendingIsExpired = function(snapshot) {
    return !snapshot?.timestamp || Date.now() - snapshot.timestamp > pending.TTL_MS;
};

const pendingFrameOfKey = function(key) {
    const match = key.match(/^kpxcPending_\d+_(\d+)$/);
    return match ? Number(match[1]) : 0;
};

pending.list = async function(tabId) {
    if (!tabId) {
        return [];
    }

    const all = await pendingReadAll();
    const prefix = `${pending.KEY_PREFIX}${tabId}_`;
    const expired = [];
    const snapshots = [];

    for (const [ key, snapshot ] of Object.entries(all)) {
        if (!key.startsWith(prefix)) {
            continue;
        }

        if (pendingIsExpired(snapshot)) {
            expired.push(key);
            continue;
        }

        snapshots.push({ frameId: pendingFrameOfKey(key), key, snapshot });
    }

    if (expired.length > 0) {
        const area = pendingSessionArea();
        if (area) {
            await area.remove(expired);
        } else {
            for (const key of expired) {
                pending.memory.delete(key);
            }
        }
    }

    return snapshots;
};

pending.findEntry = async function(tabId, options = {}) {
    if (!tabId) {
        return null;
    }

    const { frameId = null, url = null, includeSteps = true } = options;
    let snapshots = await pending.list(tabId);
    if (frameId !== null) {
        snapshots = snapshots.filter((entry) => entry.frameId === frameId);
    }

    if (!includeSteps) {
        snapshots = snapshots.filter((entry) => !entry.snapshot.awaitingPassword);
    }

    const matching = snapshots.filter((entry) => {
        if (!url) {
            return true;
        }

        return pendingSameSite(url, entry.snapshot.url)
            || (entry.snapshot.topUrl && pendingSameSite(url, entry.snapshot.topUrl));
    });

    const candidates = matching.length > 0 ? matching : snapshots;
    candidates.sort((left, right) => {
        if (left.snapshot.submitted !== right.snapshot.submitted) {
            return left.snapshot.submitted ? -1 : 1;
        }

        return right.snapshot.timestamp - left.snapshot.timestamp;
    });

    return candidates[0] ?? null;
};

pending.get = async function(tabId, options = {}) {
    const entry = await pending.findEntry(tabId, options);
    return entry?.snapshot ?? null;
};

pending.set = async function(tabId, data, frameId = 0) {
    if (!tabId) {
        return false;
    }

    const incoming = pending.sanitize(data);
    if (!incoming) {
        return false;
    }

    const key = pending.key(tabId, frameId);
    const area = pendingSessionArea();
    const existing = area
        ? (await area.get(key))[key]
        : pending.memory.get(key);
    let snapshot = incoming;

    if (existing && !pendingIsExpired(existing)) {
        if (existing.password !== '' && incoming.password === '') {
            // Late input events must not downgrade a completed snapshot.
            snapshot = {
                ...existing,
                email: incoming.email || existing.email,
                extraFields: { ...existing.extraFields, ...incoming.extraFields },
                timestamp: Date.now(),
                topUrl: incoming.topUrl || existing.topUrl,
                username: incoming.username || existing.username
            };
        } else {
            // Merge a password step into a previously captured email/username step.
            snapshot = {
                ...existing,
                ...incoming,
                awaitingPassword: incoming.password === '',
                email: incoming.email || existing.email,
                extraFields: { ...existing.extraFields, ...incoming.extraFields },
                formType: incoming.password === '' ? existing.formType : incoming.formType,
                submitted: existing.submitted || incoming.submitted,
                timestamp: Date.now(),
                topUrl: incoming.topUrl || existing.topUrl,
                username: incoming.username || existing.username
            };
        }
    }

    if (area) {
        await area.set({ [key]: snapshot });
    } else {
        pending.memory.set(key, snapshot);
    }

    return true;
};

pending.take = async function(tabId, options = {}) {
    const entry = await pending.findEntry(tabId, options);
    if (!entry) {
        return null;
    }

    await pending.clear(tabId, entry.frameId);
    return entry.snapshot;
};

pending.clear = async function(tabId, frameId = null) {
    if (!tabId) {
        return;
    }

    const area = pendingSessionArea();
    if (frameId !== null) {
        const key = pending.key(tabId, frameId);
        if (area) {
            await area.remove(key);
        } else {
            pending.memory.delete(key);
        }

        return;
    }

    const all = await pendingReadAll();
    const prefix = `${pending.KEY_PREFIX}${tabId}_`;
    const keys = Object.keys(all).filter((key) => key.startsWith(prefix));
    if (keys.length === 0) {
        return;
    }

    if (area) {
        await area.remove(keys);
    } else {
        for (const key of keys) {
            pending.memory.delete(key);
        }
    }
};

pending.clearAll = async function() {
    const all = await pendingReadAll();
    const keys = Object.keys(all).filter((key) => key.startsWith(pending.KEY_PREFIX));

    if (keys.length === 0) {
        pending.memory.clear();
        return;
    }

    const area = pendingSessionArea();
    if (area) {
        await area.remove(keys);
    } else {
        for (const key of keys) {
            pending.memory.delete(key);
        }
    }
};

pending.sweep = async function() {
    const all = await pendingReadAll();
    const expired = Object.entries(all)
        .filter(([ key, snapshot ]) => key.startsWith(pending.KEY_PREFIX) && pendingIsExpired(snapshot))
        .map(([ key ]) => key);

    if (expired.length === 0) {
        return;
    }

    const area = pendingSessionArea();
    if (area) {
        await area.remove(expired);
    } else {
        for (const key of expired) {
            pending.memory.delete(key);
        }
    }
};

// Periodic cleanup keeps expired snapshots from lingering after long sessions.
setInterval(() => {
    pending.sweep().catch(() => {});
}, 60 * 1000);
