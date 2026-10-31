import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixtures = require('./fixtures/forms.js');
const classifierPath = path.resolve(__dirname, '../keepassxc-browser/content/form-classifier.js');
const SAVE_TYPES = [ 'register', 'change-password', 'reset-password' ];

test.describe('Form classifier', () => {
    test('classifies fixtures and gates the save prompt', async ({ page }) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ path: classifierPath });

        const results: any[] = [];
        for (const fixture of fixtures) {
            const result = await page.evaluate((data: any) => {
                document.body.innerHTML = data.html;
                const root = document.querySelector('form') ?? document.body;
                const classification = kpxcFormClassifier.classify(root, {
                    url: data.url,
                    pageText: data.pageText
                });

                return {
                    type: classification.type,
                    confidence: classification.confidence,
                    promptsWhenEnabled: kpxcFormClassifier.shouldPromptSave(classification.type, {
                        detectNewAccountSignups: true
                    }),
                    promptsWhenDisabled: kpxcFormClassifier.shouldPromptSave(classification.type, {
                        detectNewAccountSignups: false
                    })
                };
            }, fixture);

            results.push({ name: fixture.name, expected: fixture.expected, ...result });
        }

        const mismatches = results.filter((result) => result.type !== result.expected);
        if (mismatches.length > 0) {
            console.log('Misclassified fixtures:', JSON.stringify(mismatches, null, 2));
        }

        const correct = results.filter((result) => result.type === result.expected).length;
        expect(correct / results.length).toBeGreaterThanOrEqual(0.9);

        for (const result of results) {
            const shouldSave = SAVE_TYPES.includes(result.expected);
            expect(result.promptsWhenEnabled, `${result.name}: save prompt gating`).toBe(shouldSave);
            expect(result.promptsWhenDisabled, `${result.name}: disabled setting`).toBe(false);
        }

        for (const result of results.filter((result) => result.expected === 'register')) {
            expect(result.confidence, `${result.name}: register confidence`).toBeGreaterThanOrEqual(0.6);
        }
    });

    test('classifies forms inside open shadow roots', async ({ page }) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ path: classifierPath });

        const result = await page.evaluate(() => {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `<form>
                <input type="email" name="email">
                <input type="password" name="password" autocomplete="new-password">
                <input type="password" name="confirm_password">
                <button type="submit">Create account</button>
            </form>`;

            const classification = kpxcFormClassifier.classify(
                shadow.querySelector('form'),
                { url: 'https://example.com/signup' },
            );

            return { type: classification.type, confidence: classification.confidence };
        });

        expect(result.type).toBe('register');
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    test('does not read or return field values', () => {
        const source = fs.readFileSync(classifierPath, 'utf8');
        expect(source).not.toMatch(/\.value\b/);
        expect(source).not.toMatch(/console\.(log|debug|info|warn|error)/);
    });
});
