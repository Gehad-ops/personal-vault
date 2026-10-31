import { test, expect } from '@playwright/test';
import path from 'path';

const aliasPath = path.resolve(__dirname, '../keepassxc-browser/content/signup-alias.js');

test.describe('Plus-addressing aliases', () => {
    test('builds a site-tagged alias and replaces an existing tag', async ({ page }) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ path: aliasPath });

        const result = await page.evaluate(() => ({
            plain: kpxcSignupAlias.plusAlias('person@example.com', 'www.github.com'),
            tagged: kpxcSignupAlias.plusAlias('person+old@example.com', 'github.com'),
            invalid: kpxcSignupAlias.plusAlias('not-an-email', 'github.com'),
            catchall: kpxcSignupAlias.generate('person@example.com', 'www.github.com', {
                aliasDomain: 'mydomain.com',
                aliasProvider: 'catchall'
            }),
            catchallFallback: kpxcSignupAlias.generate('person@example.com', 'github.com', {
                aliasDomain: '',
                aliasProvider: 'catchall'
            })
        }));

        expect(result.plain).toBe('person+github-com@example.com');
        expect(result.tagged).toBe('person+github-com@example.com');
        expect(result.invalid).toBeNull();
        expect(result.catchall).toBe('github-com@mydomain.com');
        expect(result.catchallFallback).toBe('person+github-com@example.com');
    });

    test('adds a working button to register email fields', async ({ page }) => {
        await page.setContent(`<form>
            <input id="email" type="email" name="email">
            <input type="password" name="password" autocomplete="new-password">
            <button>Create account</button>
        </form>`);
        await page.evaluate(() => {
            window.kpxc = { settings: { offerEmailAliases: true } };
            window.tr = (key) => key;
            window.kpxcUI = { createNotification() {} };
        });
        await page.addScriptTag({ path: aliasPath });

        await page.evaluate(() => {
            const field = document.querySelector('#email');
            field.value = 'person@example.com';
            kpxcSignupAlias.offer(field);
        });

        const button = page.locator('button[aria-label="aliasGenerateTitle"]');
        await expect(button).toHaveCount(1);
        await button.click();
        await expect(page.locator('#email')).toHaveValue('person+alias@example.com');
    });

    test('does nothing when the setting is off', async ({ page }) => {
        await page.setContent('<form><input id="email" type="email" name="email"></form>');
        await page.evaluate(() => {
            window.kpxc = { settings: { offerEmailAliases: false } };
            window.tr = (key) => key;
            window.kpxcUI = { createNotification() {} };
        });
        await page.addScriptTag({ path: aliasPath });

        await page.evaluate(() => kpxcSignupAlias.offer(document.querySelector('#email')));
        await expect(page.locator('button[aria-label="aliasGenerateTitle"]')).toHaveCount(0);
    });
});
