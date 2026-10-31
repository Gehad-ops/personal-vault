'use strict';

/**
 * @Object kpxcSignupGenerator
 * Rule-aware password generation for sign-up forms.
 *
 * Only used when the page declares password rules. Otherwise the desktop app's
 * generator keeps handling the request. Uses crypto.getRandomValues with
 * rejection sampling; Math.random is never used.
 */
const kpxcSignupGenerator = {};

kpxcSignupGenerator.CHARACTER_SETS = {
    lower: 'abcdefghjkmnpqrstuvwxyz',
    upper: 'ABCDEFGHJKMNPQRSTUVWXYZ',
    digit: '23456789',
    special: '!@#$%^&*()-_=+[]{};:,.?'
};

kpxcSignupGenerator.DEFAULT_LENGTH = 20;
kpxcSignupGenerator.MIN_LENGTH = 8;
kpxcSignupGenerator.MAX_LENGTH = 128;

kpxcSignupGenerator.randomInt = function(maximum) {
    if (!Number.isFinite(maximum) || maximum <= 0) {
        return 0;
    }

    // Rejection sampling avoids modulo bias.
    const range = 2 ** 32;
    const limit = Math.floor(range / maximum) * maximum;
    const buffer = new Uint32Array(1);
    let value = 0;

    do {
        crypto.getRandomValues(buffer);
        value = buffer[0];
    } while (value >= limit);

    return value % maximum;
};

kpxcSignupGenerator.pick = function(characters) {
    if (!characters || characters.length === 0) {
        return '';
    }

    return characters[kpxcSignupGenerator.randomInt(characters.length)];
};

kpxcSignupGenerator.shuffle = function(characters) {
    for (let index = characters.length - 1; index > 0; --index) {
        const other = kpxcSignupGenerator.randomInt(index + 1);
        [ characters[index], characters[other] ] = [ characters[other], characters[index] ];
    }

    return characters;
};

const visibleRuleText = function(field) {
    const container = field.form ?? field.closest?.('form, div, section') ?? document.body;
    return (container?.innerText ?? '').slice(0, 4000);
};

const expandCharacterClass = function(classBody) {
    let characters = '';
    for (let index = 0; index < classBody.length; ++index) {
        const character = classBody[index];
        if (character === '\\' && index + 1 < classBody.length) {
            characters += classBody[++index];
            continue;
        }

        if (index + 2 < classBody.length && classBody[index + 1] === '-') {
            const start = character.charCodeAt(0);
            const end = classBody[index + 2].charCodeAt(0);
            if (end >= start && end - start <= 128) {
                for (let code = start; code <= end; ++code) {
                    characters += String.fromCharCode(code);
                }
                index += 2;
                continue;
            }
        }

        characters += character;
    }

    return characters;
};

const patternCharacters = function(pattern) {
    const match = pattern.match(/\[([^\]]+)\]/);
    return match ? expandCharacterClass(match[1]) : null;
};

kpxcSignupGenerator.parse = function(field) {
    const rules = {
        allowed: null,
        hasRules: false,
        maxLength: 0,
        minLength: 0,
        noSpaces: false,
        pattern: '',
        patternChars: null,
        required: new Set()
    };

    if (!field) {
        return rules;
    }

    const passwordRules = (field.getAttribute?.('passwordrules') ?? '').toLowerCase();
    if (passwordRules) {
        rules.hasRules = true;
        for (const token of passwordRules.split(';')) {
            const [ rawKey, rawValue ] = token.split(':').map((part) => part?.trim() ?? '');
            if (!rawKey || !rawValue) {
                continue;
            }

            if (rawKey === 'minlength') {
                rules.minLength = Math.max(rules.minLength, parseInt(rawValue, 10) || 0);
            } else if (rawKey === 'maxlength') {
                rules.maxLength = parseInt(rawValue, 10) || 0;
            } else if (rawKey === 'required') {
                rules.required.add(rawValue);
            } else if (rawKey === 'allowed') {
                rules.allowed = rules.allowed ?? new Set();
                rules.allowed.add(rawValue);
            }
        }
    }

    const minLength = parseInt(field.getAttribute?.('minlength') ?? '', 10);
    if (Number.isFinite(minLength) && minLength > 0) {
        rules.minLength = Math.max(rules.minLength, minLength);
        rules.hasRules = true;
    }

    const maxLength = parseInt(field.getAttribute?.('maxlength') ?? '', 10);
    if (Number.isFinite(maxLength) && maxLength > 0) {
        rules.maxLength = maxLength;
        rules.hasRules = true;
    }

    const pattern = field.getAttribute?.('pattern') ?? '';
    if (pattern) {
        rules.pattern = pattern;
        const extracted = patternCharacters(pattern);
        if (extracted) {
            rules.patternChars = new Set(extracted);
        }
        rules.hasRules = true;
    }

    const text = visibleRuleText(field);
    const minText = text.match(/(?:at\s+least|minimum|min\.?)\s*(\d{1,3})\s*(?:characters|chars)/i);
    if (minText) {
        rules.minLength = Math.max(rules.minLength, parseInt(minText[1], 10));
        rules.hasRules = true;
    }

    const requiredClauses = text.match(/(?:at\s+least\s+one|must\s+(?:contain|include)|needs?)[^.\n;]*/gi) ?? [];
    for (const clause of requiredClauses) {
        const value = clause.toLowerCase();
        if (value.includes('uppercase')) {
            rules.required.add('upper');
        }

        if (value.includes('lowercase')) {
            rules.required.add('lower');
        }

        if (value.includes('number') || value.includes('digit')) {
            rules.required.add('digit');
        }

        if (value.includes('symbol') || value.includes('special')) {
            rules.required.add('special');
        }

        rules.hasRules = true;
    }

    if (/(?:no|without)\s+spaces/i.test(text)) {
        rules.noSpaces = true;
        rules.hasRules = true;
    }

    return rules;
};

const setForRule = function(rule) {
    const normalized = rule.toLowerCase();
    if (normalized === 'lower' || normalized === 'lowercase') {
        return kpxcSignupGenerator.CHARACTER_SETS.lower;
    }

    if (normalized === 'upper' || normalized === 'uppercase') {
        return kpxcSignupGenerator.CHARACTER_SETS.upper;
    }

    if (normalized === 'digit' || normalized === 'number') {
        return kpxcSignupGenerator.CHARACTER_SETS.digit;
    }

    if (normalized === 'special' || normalized === 'symbol') {
        return kpxcSignupGenerator.CHARACTER_SETS.special;
    }

    if (normalized === 'ascii-printable') {
        return Object.values(kpxcSignupGenerator.CHARACTER_SETS).join('');
    }

    if (normalized === 'alphanumeric') {
        return kpxcSignupGenerator.CHARACTER_SETS.lower
            + kpxcSignupGenerator.CHARACTER_SETS.upper
            + kpxcSignupGenerator.CHARACTER_SETS.digit;
    }

    // Literal character list
    return /^[!-~]+$/.test(rule) ? rule : '';
};

kpxcSignupGenerator.pool = function(rules) {
    const sets = Object.values(kpxcSignupGenerator.CHARACTER_SETS);
    let pool = sets.join('');

    if (rules.allowed && rules.allowed.size > 0) {
        pool = Array.from(rules.allowed).map(setForRule).join('');
    }

    if (rules.noSpaces) {
        pool = pool.replace(/\s/g, '');
    }

    return pool;
};

kpxcSignupGenerator.generate = function(rules, length) {
    const intersectPattern = (characters) => rules.patternChars
        ? Array.from(characters).filter((character) => rules.patternChars.has(character)).join('')
        : characters;

    const requiredSets = Array.from(rules.required)
        .map((rule) => intersectPattern(setForRule(rule)))
        .filter((set) => set.length > 0);
    const pool = intersectPattern(kpxcSignupGenerator.pool(rules));
    if (pool === '') {
        return null;
    }

    if (requiredSets.length !== rules.required.size) {
        return null;
    }

    const minimum = Math.max(rules.minLength || 0, kpxcSignupGenerator.MIN_LENGTH, requiredSets.length);
    let target = Math.max(length || kpxcSignupGenerator.DEFAULT_LENGTH, minimum);
    target = Math.min(target, kpxcSignupGenerator.MAX_LENGTH);

    if (rules.maxLength > 0) {
        if (rules.maxLength < minimum) {
            return null;
        }

        target = Math.min(target, rules.maxLength);
    }

    let pattern = null;
    if (rules.pattern) {
        try {
            pattern = new RegExp(`^(?:${rules.pattern})$`);
        } catch (_error) {
            pattern = null;
        }
    }

    for (let attempt = 0; attempt < 40; ++attempt) {
        const characters = [];
        for (const set of requiredSets) {
            characters.push(kpxcSignupGenerator.pick(set));
        }

        while (characters.length < target) {
            characters.push(kpxcSignupGenerator.pick(pool));
        }

        const password = kpxcSignupGenerator.shuffle(characters).join('');
        if (password.length < minimum || password.length > (rules.maxLength || kpxcSignupGenerator.MAX_LENGTH)) {
            continue;
        }

        if (rules.noSpaces && /\s/.test(password)) {
            continue;
        }

        if (pattern && !pattern.test(password)) {
            continue;
        }

        return password;
    }

    return null;
};

kpxcSignupGenerator.rulesFor = function(field) {
    const rules = kpxcSignupGenerator.parse(field);
    rules.generated = rules.hasRules;
    return rules;
};

// Exports for tests
if (typeof module === 'object') {
    module.exports = kpxcSignupGenerator;
}
