import { test, expect } from '@playwright/test';
import path from 'path';

const classifierPath = path.resolve(__dirname, '../keepassxc-browser/content/form-classifier.js');
const usernamePath = path.resolve(__dirname, '../keepassxc-browser/content/signup-username.js');

const setup = async function(page) {
    await page.setContent(`<form>
        <input id="username" type="text" name="username">
        <input id="email" type="email" name="email" value="person@example.com">
        <input type="password" name="password" autocomplete="new-password">
        <input type="password" name="confirm_password">
        <button type="submit">Create account</button>
    </form>`);
    await page.evaluate(() => {
        window.browser = { i18n: { getMessage: () => '' } };
        window.kpxc = { settings: { aliasDomain: '', offerUsernameSuggestions: true } };
    });
    await page.addScriptTag({ path: classifierPath });
    await page.addScriptTag({ path: usernamePath });
};

test.describe('Username and email suggestions', () => {
    test('sanitizes base names and produces a random numeric suffix', async ({ page }) => {
        await setup(page);
        const result = await page.evaluate(() => ({
            sanitized: kpxcUsernameSuggestion.sanitizeBase(' John  Doe!! '),
            suffix: Number(kpxcUsernameSuggestion.randomSuffix())
        }));

        expect(result.sanitized).toBe('john.doe');
        expect(result.suffix).toBeGreaterThanOrEqual(100);
        expect(result.suffix).toBeLessThanOrEqual(999);
    });

    test('opens the panel and fills username and email', async ({ page }) => {
        await setup(page);

        await page.evaluate(() => {
            const field = document.querySelector('#email');
            kpxcUsernameSuggestion.offer(field);
        });

        const button = page.locator('button[aria-label="Generate username & email"]');
        await expect(button).toHaveCount(1);
        await button.click();

        await expect(page.locator('text=Generate username & email').last()).toBeVisible();
        const preview = await page.locator('div[data-username]').evaluate((panel) => ({
            username: panel.dataset.username,
            email: panel.dataset.email
        }));

        expect(preview.username).toMatch(/^person[0-9]{3}$/);
        expect(preview.email).toBe(`${preview.username}@example.com`);

        await page.getByRole('button', { name: 'Use this' }).click();
        await expect(page.locator('#username')).toHaveValue(preview.username);
        await expect(page.locator('#email')).toHaveValue(preview.email);
    });
});
