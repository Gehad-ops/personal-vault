import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const generatorPath = path.resolve(__dirname, '../keepassxc-browser/content/signup-generator.js');

const setup = async function(page, html: string) {
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
    await page.addScriptTag({ path: generatorPath });
};

test.describe('Rule-aware password generator', () => {
    test('satisfies passwordrules length and character classes', async ({ page }) => {
        await setup(page, `<form>Password rules
            <input id="p" type="password"
                passwordrules="minlength: 14; maxlength: 18; required: lower; required: upper; required: digit; required: special;">
        </form>`);

        const result = await page.evaluate(() => {
            const field = document.querySelector('#p');
            const rules = kpxcSignupGenerator.parse(field);
            const password = kpxcSignupGenerator.generate(rules);
            return { rules: { min: rules.minLength, max: rules.maxLength, has: rules.hasRules }, password };
        });

        expect(result.rules).toEqual({ min: 14, max: 18, has: true });
        expect(result.password.length).toBeGreaterThanOrEqual(14);
        expect(result.password.length).toBeLessThanOrEqual(18);
        expect(result.password).toMatch(/[a-z]/);
        expect(result.password).toMatch(/[A-Z]/);
        expect(result.password).toMatch(/[0-9]/);
        expect(result.password).toMatch(/[^A-Za-z0-9]/);
    });

    test('honours pattern and visible rule text', async ({ page }) => {
        await setup(page, `<form>Must contain uppercase, number and symbol. No spaces.
            <input id="p" type="password" minlength="10" pattern="[A-Za-z0-9!@#$%^&*]{10,}">
        </form>`);

        const result = await page.evaluate(() => {
            const field = document.querySelector('#p');
            const rules = kpxcSignupGenerator.parse(field);
            return {
                password: kpxcSignupGenerator.generate(rules),
                required: Array.from(rules.required),
                noSpaces: rules.noSpaces
            };
        });

        expect(result.password).toMatch(/^[A-Za-z0-9!@#$%^&*]{10,}$/);
        expect(result.password).toMatch(/[A-Z]/);
        expect(result.password).toMatch(/[0-9]/);
        expect(result.password).not.toMatch(/\s/);
        expect(result.required).toEqual(expect.arrayContaining([ 'upper', 'digit', 'special' ]));
        expect(result.noSpaces).toBe(true);
    });

    test('supports literal allowed characters and rejects impossible limits', async ({ page }) => {
        await setup(page, `
            <form><input id="literal" type="password" passwordrules="allowed: abc123;"></form>
            <form><input id="impossible" type="password" minlength="8" maxlength="4"></form>
        `);

        const result = await page.evaluate(() => {
            const literalRules = kpxcSignupGenerator.parse(document.querySelector('#literal'));
            const impossibleRules = kpxcSignupGenerator.parse(document.querySelector('#impossible'));
            return {
                literal: kpxcSignupGenerator.generate(literalRules),
                impossible: kpxcSignupGenerator.generate(impossibleRules)
            };
        });

        expect(result.literal).toMatch(/^[abc123]+$/);
        expect(result.impossible).toBeNull();
    });

    test('never uses Math.random', () => {
        const source = fs.readFileSync(generatorPath, 'utf8');
        expect(source).not.toMatch(/Math\.random\s*\(/);
    });
});
