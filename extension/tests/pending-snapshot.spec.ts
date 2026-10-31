import { test, expect } from '@playwright/test';
import path from 'path';

const pendingPath = path.resolve(__dirname, '../keepassxc-browser/background/pending.js');

const installMockStorage = async function(page) {
    await page.evaluate(() => {
        const store = new Map();
        window.__sessionStore = store;
        window.browser = {
            storage: {
                session: {
                    async get(keys) {
                        if (keys === null || keys === undefined) {
                            return Object.fromEntries(store);
                        }

                        const list = Array.isArray(keys) ? keys : [ keys ];
                        const result = {};
                        for (const key of list) {
                            if (store.has(key)) {
                                result[key] = store.get(key);
                            }
                        }

                        return result;
                    },
                    async set(items) {
                        for (const [ key, value ] of Object.entries(items)) {
                            store.set(key, value);
                        }
                    },
                    async remove(keys) {
                        const list = Array.isArray(keys) ? keys : [ keys ];
                        for (const key of list) {
                            store.delete(key);
                        }
                    }
                }
            }
        };
    });
};

test.describe('Pending credential snapshot', () => {
    test('stores, returns and clears a snapshot without logging values', async ({ page }) => {
        const consoleMessages: string[] = [];
        page.on('console', (message) => consoleMessages.push(message.text()));

        await page.setContent('<!doctype html><html><body></body></html>');
        await installMockStorage(page);
        await page.addScriptTag({ path: pendingPath });

        const secret = 'correct horse battery staple';
        const result = await page.evaluate(async (password) => {
            await pending.set(7, {
                email: 'person@example.com',
                extraFields: { signup_url: 'https://example.com/signup' },
                formType: 'register',
                password,
                submitted: true,
                url: 'https://example.com/welcome',
                username: 'person'
            });

            const stored = await pending.get(7);
            const taken = await pending.take(7);
            const afterTake = await pending.get(7);

            await pending.set(8, {
                formType: 'reset-password',
                password,
                submitted: false,
                url: 'https://example.com/reset'
            });
            await pending.set(9, {
                formType: 'register',
                password,
                submitted: true,
                url: 'https://example.com/other'
            });
            await pending.clearAll();
            const afterClearAll = await pending.get(8);
            const otherAfterClearAll = await pending.get(9);

            return { stored, taken, afterTake, afterClearAll, otherAfterClearAll };
        }, secret);

        expect(result.stored.formType).toBe('register');
        expect(result.stored.username).toBe('person');
        expect(result.taken.password).toBe(secret);
        expect(result.afterTake).toBeNull();
        expect(result.afterClearAll).toBeNull();
        expect(result.otherAfterClearAll).toBeNull();
        expect(consoleMessages.join(' ')).not.toContain(secret);
    });

    test('expires snapshots after ten minutes and rejects invalid input', async ({ page }) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        await installMockStorage(page);
        await page.addScriptTag({ path: pendingPath });

        const result = await page.evaluate(async () => {
            const rejectedType = await pending.set(1, {
                formType: 'login',
                password: 'secret',
                url: 'https://example.com/login'
            });
            const rejectedUrl = await pending.set(1, {
                formType: 'register',
                password: 'secret',
                url: 'chrome-extension://not-allowed'
            });

            await pending.set(2, {
                formType: 'register',
                password: 'secret',
                url: 'https://example.com/signup'
            });

            const key = pending.key(2);
            window.__sessionStore.get(key).timestamp = Date.now() - (pending.TTL_MS + 1000);
            const expired = await pending.get(2);

            return { rejectedType, rejectedUrl, expired };
        });

        expect(result.rejectedType).toBe(false);
        expect(result.rejectedUrl).toBe(false);
        expect(result.expired).toBeNull();
    });

    test('merges multi-step data and keeps frames separate', async ({ page }) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        await installMockStorage(page);
        await page.addScriptTag({ path: pendingPath });

        const result = await page.evaluate(async () => {
            const rejectedEmpty = await pending.set(5, {
                formType: 'register',
                password: '',
                url: 'https://example.com/signup'
            });

            await pending.set(5, {
                awaitingPassword: true,
                email: 'step@example.com',
                formType: 'register',
                password: '',
                url: 'https://example.com/signup',
                username: 'stepuser'
            }, 0);

            await pending.set(5, {
                formType: 'register',
                password: 'step-password',
                url: 'https://example.com/password'
            }, 0);

            const merged = await pending.get(5, { frameId: 0 });

            await pending.set(5, {
                formType: 'register',
                password: 'iframe-password',
                submitted: true,
                topUrl: 'https://example.com/signup',
                url: 'https://iframe.example.net/signup'
            }, 3);

            const selected = await pending.get(5, { url: 'https://example.com/signup' });
            await pending.clear(5, 3);
            const frameCleared = await pending.get(5, { frameId: 3 });
            await pending.clear(5);
            const allCleared = await pending.get(5, { frameId: 0 });

            return { rejectedEmpty, merged, selected, frameCleared, allCleared };
        });

        expect(result.rejectedEmpty).toBe(false);
        expect(result.merged.awaitingPassword).toBe(false);
        expect(result.merged.username).toBe('stepuser');
        expect(result.merged.email).toBe('step@example.com');
        expect(result.merged.password).toBe('step-password');
        expect(result.selected.password).toBe('iframe-password');
        expect(result.frameCleared).toBeNull();
        expect(result.allCleared).toBeNull();
    });
});
