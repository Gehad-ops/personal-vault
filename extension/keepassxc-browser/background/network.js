'use strict';

/**
 * @Object network
 * Records recent XHR/fetch outcomes per tab for sign-up success detection.
 *
 * Only status codes, request origins and timestamps are retained. Bodies,
 * headers and full URLs are never stored or logged.
 */
const network = {};
network.MAX_AGE_MS = 30 * 1000;
network.MAX_ENTRIES = 200;
network.entries = new Map();

const networkOrigin = function(url) {
    try {
        const parsed = new URL(url);
        return /^https?:$/.test(parsed.protocol) ? parsed.origin : null;
    } catch (_error) {
        return null;
    }
};

network.record = function(tabId, origin, status) {
    if (!tabId || !origin) {
        return;
    }

    const now = Date.now();
    const list = (network.entries.get(tabId) ?? [])
        .filter((entry) => now - entry.timestamp <= network.MAX_AGE_MS);
    list.push({ origin, status, timestamp: now });

    while (list.length > network.MAX_ENTRIES) {
        list.shift();
    }

    network.entries.set(tabId, list);
};

network.getRecent = function(tabId, since = 0) {
    if (!tabId) {
        return [];
    }

    const now = Date.now();
    return (network.entries.get(tabId) ?? [])
        .filter((entry) => entry.timestamp >= since && now - entry.timestamp <= network.MAX_AGE_MS)
        .map((entry) => ({ origin: entry.origin, status: entry.status, timestamp: entry.timestamp }));
};

network.clear = function(tabId) {
    if (tabId) {
        network.entries.delete(tabId);
    }
};

network.onCompleted = function(details) {
    network.record(details.tabId, networkOrigin(details.url), details.statusCode);
};

// Registered synchronously so the service worker wakes for these events.
if (browser.webRequest?.onCompleted) {
    browser.webRequest.onCompleted.addListener(network.onCompleted, {
        types: [ 'xmlhttprequest' ],
        urls: [ '<all_urls>' ]
    });
}
