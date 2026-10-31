import { test, expect } from '@playwright/test';
import path from 'path';

const networkPath = path.resolve(__dirname, '../keepassxc-browser/background/network.js');

test.describe('Network observer', () => {
    test('records status codes and origins per tab without URLs', async ({ page }) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.evaluate(() => {
            window.__webRequestListeners = [];
            window.browser = {
                webRequest: {
                    onCompleted: {
                        addListener(handler) {
                            window.__webRequestListeners.push(handler);
                        }
                    }
                }
            };
        });
        await page.addScriptTag({ path: networkPath });

        const result = await page.evaluate(() => {
            const handler = window.__webRequestListeners[0];
            handler({ tabId: 1, url: 'https://example.com/api/signup', statusCode: 201 });
            handler({ tabId: 1, url: 'https://cdn.other.test/pixel', statusCode: 204 });
            handler({ tabId: 2, url: 'https://example.com/api/other', statusCode: 500 });

            const tab1 = network.getRecent(1, 0);
            const tab2 = network.getRecent(2, 0);
            network.clear(1);
            const cleared = network.getRecent(1, 0);

            return { tab1, tab2, cleared };
        });

        expect(result.tab1).toHaveLength(2);
        expect(result.tab1.map((entry: any) => entry.origin)).toEqual([
            'https://example.com',
            'https://cdn.other.test'
        ]);
        expect(result.tab1.every((entry: any) => !('url' in entry))).toBe(true);
        expect(result.tab2[0].status).toBe(500);
        expect(result.cleared).toHaveLength(0);
    });

    test('prunes entries older than the retention window', async ({ page }) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.evaluate(() => {
            window.__webRequestListeners = [];
            window.browser = {
                webRequest: {
                    onCompleted: {
                        addListener(handler) {
                            window.__webRequestListeners.push(handler);
                        }
                    }
                }
            };
        });
        await page.addScriptTag({ path: networkPath });

        const result = await page.evaluate(() => {
            network.record(9, 'https://example.com', 200);
            network.entries.get(9)[0].timestamp = Date.now() - (network.MAX_AGE_MS + 1000);
            return {
                recent: network.getRecent(9, 0),
                capacity: network.MAX_ENTRIES
            };
        });

        expect(result.recent).toHaveLength(0);
        expect(result.capacity).toBe(200);
    });
});
