import { test, expect } from '@playwright/test';
import path from 'path';

const classifierPath = path.resolve(__dirname, '../keepassxc-browser/content/form-classifier.js');
const capturePath = path.resolve(__dirname, '../keepassxc-browser/content/signup-capture.js');

const loadCapture = async function(page) {
    await page.addScriptTag({ path: classifierPath });
    await page.addScriptTag({ path: capturePath });
};

test.describe('Sign-up capture wiring', () => {
    test('sends the new password and username for a register form', async ({ page }) => {
        await page.setContent(`<form>
            <input type="text" name="username">
            <input type="password" name="password" autocomplete="new-password">
            <input type="password" name="confirm_password">
            <button type="submit">Create account</button>
        </form>`);
        await loadCapture(page);

        const sent = await page.evaluate(() => {
            window.__sent = [];
            window.sendMessage = (action, args) => {
                window.__sent.push({ action, args });
                return Promise.resolve(true);
            };
            window.trimURL = (url) => url.split('?')[0];
            window.kpxc = { databaseState: 'unlocked', settings: { detectNewAccountSignups: true } };
            window.DatabaseState = { UNLOCKED: 'unlocked' };

            document.querySelector('input[name=username]').value = 'person';
            document.querySelector('input[name=password]').value = 'first-secret';
            document.querySelector('input[name=confirm_password]').value = 'first-secret';
            kpxcSignupCapture.lastFingerprint = '';
            kpxcSignupCapture.capture(document.querySelector('input[name=password]'), true);
            return window.__sent;
        });

        expect(sent).toHaveLength(1);
        expect(sent[0].action).toBe('page_pending_set');
        expect(sent[0].args).toMatchObject({
            email: '',
            formType: 'register',
            password: 'first-secret',
            submitted: true,
            username: 'person'
        });
    });

    test('selects the new password in change-password forms', async ({ page }) => {
        await page.setContent(`<form>
            <input type="password" name="current_password" autocomplete="current-password">
            <input type="password" name="new_password" autocomplete="new-password">
            <input type="password" name="confirm_password" autocomplete="new-password">
            <button type="submit">Update password</button>
        </form>`);
        await loadCapture(page);

        const sent = await page.evaluate(() => {
            window.__sent = [];
            window.sendMessage = (action, args) => {
                window.__sent.push({ action, args });
                return Promise.resolve(true);
            };
            window.trimURL = (url) => url.split('?')[0];
            window.kpxc = { databaseState: 'unlocked', settings: { detectNewAccountSignups: true } };
            window.DatabaseState = { UNLOCKED: 'unlocked' };

            document.querySelector('input[name=current_password]').value = 'old-secret';
            document.querySelector('input[name=new_password]').value = 'new-secret';
            document.querySelector('input[name=confirm_password]').value = 'new-secret';
            kpxcSignupCapture.lastFingerprint = '';
            kpxcSignupCapture.capture(document.querySelector('input[name=new_password]'), true);
            return window.__sent;
        });

        expect(sent).toHaveLength(1);
        expect(sent[0].args.formType).toBe('change-password');
        expect(sent[0].args.password).toBe('new-secret');
    });

    test('does not capture logins or anything when the setting is off', async ({ page }) => {
        await page.setContent(`<form>
            <input type="text" name="username" autocomplete="username">
            <input type="password" name="password" autocomplete="current-password">
            <button type="submit">Sign in</button>
        </form>`);
        await loadCapture(page);

        const sent = await page.evaluate(() => {
            window.__sent = [];
            window.sendMessage = (action, args) => {
                window.__sent.push({ action, args });
                return Promise.resolve(true);
            };
            window.trimURL = (url) => url.split('?')[0];
            window.kpxc = { databaseState: 'unlocked', settings: { detectNewAccountSignups: true } };
            window.DatabaseState = { UNLOCKED: 'unlocked' };

            document.querySelector('input[name=username]').value = 'person';
            document.querySelector('input[name=password]').value = 'secret';
            kpxcSignupCapture.lastFingerprint = '';
            kpxcSignupCapture.capture(document.querySelector('input[name=password]'), true);
            const afterLogin = window.__sent.length;

            kpxc.settings.detectNewAccountSignups = false;
            kpxcSignupCapture.lastFingerprint = '';
            kpxcSignupCapture.capture(document.querySelector('input[name=password]'), true);
            return { afterLogin, total: window.__sent.length };
        });

        expect(sent.afterLogin).toBe(0);
        expect(sent.total).toBe(0);
    });

    test('captures an email-only first step without marking it submitted', async ({ page }) => {
        await page.setContent(`<form>
            <input id="email" type="email" name="email">
            <button type="submit">Sign up</button>
        </form>`);
        await loadCapture(page);

        const sent = await page.evaluate(() => {
            window.__sent = [];
            window.sendMessage = (action, args) => {
                window.__sent.push({ action, args });
                return Promise.resolve(true);
            };
            window.trimURL = (url) => url.split('?')[0];
            window.kpxc = { databaseState: 'unlocked', settings: { detectNewAccountSignups: true } };
            window.DatabaseState = { UNLOCKED: 'unlocked' };

            document.querySelector('#email').value = 'step@example.com';
            kpxcSignupCapture.lastFingerprint = '';
            kpxcSignupCapture.capture(document.querySelector('#email'), true);
            return window.__sent;
        });

        expect(sent).toHaveLength(1);
        expect(sent[0].args).toMatchObject({
            awaitingPassword: true,
            email: 'step@example.com',
            formType: 'register',
            password: '',
            submitted: false,
            username: 'step@example.com'
        });
    });

    test('captures read-only site-generated usernames', async ({ page }) => {
        await page.setContent(`<form>
            <input id="username" type="text" name="username" readonly>
            <input id="email" type="email" name="email">
            <input id="password" type="password" name="password" autocomplete="new-password">
            <input type="password" name="confirm_password">
            <button type="submit">Create account</button>
        </form>`);
        await loadCapture(page);

        const sent = await page.evaluate(() => {
            window.__sent = [];
            window.sendMessage = (action, args) => {
                window.__sent.push({ action, args });
                return Promise.resolve(true);
            };
            window.trimURL = (url) => url.split('?')[0];
            window.kpxc = { databaseState: 'unlocked', settings: { detectNewAccountSignups: true } };
            window.DatabaseState = { UNLOCKED: 'unlocked' };

            document.querySelector('#username').value = 'site-generated-42';
            document.querySelector('#email').value = 'person@example.com';
            document.querySelector('#password').value = 'secret';
            document.querySelector('[name=confirm_password]').value = 'secret';
            kpxcSignupCapture.lastFingerprint = '';
            kpxcSignupCapture.capture(document.querySelector('#password'), true);
            return window.__sent;
        });

        expect(sent).toHaveLength(1);
        expect(sent[0].args.username).toBe('site-generated-42');
        expect(sent[0].args.email).toBe('person@example.com');
    });

    test('fills the old password on change forms but not the new fields', async ({ page }) => {
        await page.setContent(`<form>
            <input type="text" name="username" value="person">
            <input id="current" type="password" name="current_password" autocomplete="current-password">
            <input id="new" type="password" name="new_password" autocomplete="new-password">
            <input id="confirm" type="password" name="confirm_password" autocomplete="new-password">
            <button type="submit">Update password</button>
        </form>`);
        await loadCapture(page);

        const result = await page.evaluate(async () => {
            window.kpxc = {
                credentials: [ { login: 'person', password: 'old-secret' } ],
                databaseState: 'unlocked',
                prepared: true,
                settings: { detectNewAccountSignups: true },
                setPasswordFilled: async () => {}
            };
            window.DatabaseState = { UNLOCKED: 'unlocked' };
            window.trimURL = (url) => url.split('?')[0];
            window.kpxcFill = {
                setValueWithChange: async (field, value) => {
                    field.value = value;
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }
            };

            await kpxcSignupCapture.maybeAutofillCurrentPassword();
            return {
                current: document.querySelector('#current').value,
                fresh: document.querySelector('#new').value,
                confirm: document.querySelector('#confirm').value
            };
        });

        expect(result.current).toBe('old-secret');
        expect(result.fresh).toBe('');
        expect(result.confirm).toBe('');
    });

    test('saves selected text as the pending username', async ({ page }) => {
        await page.setContent('<p id="generated">generated-user-42</p>');
        await loadCapture(page);

        const sent = await page.evaluate(async () => {
            window.__sent = [];
            window.sendMessage = (action, args) => {
                window.__sent.push({ action, args });
                return Promise.resolve(action === 'page_pending_get' ? null : true);
            };
            window.trimURL = (url) => url.split('?')[0];
            window.tr = (key) => key;
            window.kpxcUI = { createNotification() {} };
            window.kpxc = { databaseState: 'unlocked', settings: { detectNewAccountSignups: true } };
            window.DatabaseState = { UNLOCKED: 'unlocked' };
            kpxcSignupCapture.lastSnapshot = {
                formType: 'register',
                password: 'pending-secret',
                submitted: true,
                url: 'https://example.com/signup',
                username: 'old-user'
            };

            const range = document.createRange();
            range.selectNodeContents(document.querySelector('#generated'));
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            await kpxcSignupCapture.saveSelectedUsername();
            return window.__sent;
        });

        const update = sent.find((entry) => entry.action === 'page_pending_set');
        expect(update).toBeTruthy();
        expect(update.args.username).toBe('generated-user-42');
        expect(update.args.password).toBe('pending-secret');
    });

    test('classifies network verdicts and visible errors', async ({ page }) => {
        await page.setContent('<!doctype html><html><body><form id="f"></form></body></html>');
        await loadCapture(page);

        const result = await page.evaluate(() => {
            const verdict = (entries, base) => kpxcSignupCapture.verdict(entries, base);
            const form = document.querySelector('#f');

            const success = verdict([{ origin: 'https://example.com', status: 201 }], 'https://example.com/signup');
            const failure = verdict([{ origin: 'https://example.com', status: 422 }], 'https://example.com/signup');
            const cancelled = verdict([{ origin: 'https://example.com', status: 0 }], 'https://example.com/signup');
            const foreign = verdict([{ origin: 'https://tracker.test', status: 500 }], 'https://example.com/signup');

            form.innerHTML = '<div role="alert">This email is already registered</div>';
            const alertError = kpxcSignupCapture.hasError(form);

            form.innerHTML = '<input aria-invalid="true">';
            const ariaError = kpxcSignupCapture.hasError(form);

            form.innerHTML = '<input type="email" name="email"><button>Create account</button>';
            const clean = kpxcSignupCapture.hasError(form);

            return { success, failure, cancelled, foreign, alertError, ariaError, clean };
        });

        expect(result.success).toBe('success');
        expect(result.failure).toBe('failure');
        expect(result.cancelled).toBe('unknown');
        expect(result.foreign).toBe('unknown');
        expect(result.alertError).toBe(true);
        expect(result.ariaError).toBe(true);
        expect(result.clean).toBe(false);
    });
});
