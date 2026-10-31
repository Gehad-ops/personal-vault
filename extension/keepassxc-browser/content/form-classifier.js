'use strict';

/**
 * @Object kpxcFormClassifier
 * Pure, deterministic form classification used by sign-up capture.
 *
 * The classifier only reads DOM structure and attributes. It never reads or returns
 * field values, never mutates the page and never logs.
 */
const kpxcFormClassifier = {};

kpxcFormClassifier.FormType = Object.freeze({
    LOGIN: 'login',
    REGISTER: 'register',
    CHANGE_PASSWORD: 'change-password',
    RESET_PASSWORD: 'reset-password',
    OTP: 'otp',
    UNKNOWN: 'unknown'
});

kpxcFormClassifier.MIN_REGISTER_CONFIDENCE = 0.6;
kpxcFormClassifier.MAX_PAGE_TEXT = 4000;

const FORM_CLASSIFIER_PATTERNS = {
    confirm: /(?:confirm|repeat|retype|re-type|verify|re-?enter|again|confirmation|wiederhol|best(?:ä|ae)tig|confirmer|confirmation|repetir|confirmar|تأكيد|إعادة)/i,
    current: /(?:current|old|existing|previous|aktuell|bisherig|actuel|ancien|actual|anterior|الحالي|القديم)/i,
    newPassword: /(?:new|neues|nouveau|nouvelle|nueva|nuova|جديد)/i,
    register: /(?:sign\s?-?up|signup|create\s+(?:an\s+)?account|create\s+profile|register|registration|join|get\s+started|start\s+(?:for\s+)?free|try\s+(?:it\s+)?free|enregistrer|s'?inscrire|inscription|registrarse|crear\s+cuenta|registrieren|konto\s+erstellen|حساب\s+جديد|إنشاء\s+حساب|تسجيل\s+حساب)/i,
    login: /(?:sign\s?-?in|signin|log\s?-?in|login|anmelden|einloggen|connexion|se\s+connecter|iniciar\s+sesi(?:ó|o)n|acceder|تسجيل\s+الدخول|دخول)/i,
    reset: /(?:reset|forgot|recover|recovery|set\s+new\s+password|send\s+reset)/i,
    registerUrl: /(?:^|[\/?&#._-])(?:sign-?up|signup|register|registration|join|create-?account|createaccount|get-?started|onboard)(?:[\/?&#._-]|$)/i,
    resetUrl: /(?:^|[\/?&#._-])(?:reset|forgot|recover|recovery|set-password|new-password)(?:[\/?&#._-]|$)/i,
    changeUrl: /(?:change-?password|change_password|update-?password|update_password|password\/change|account\/password|settings\/password|security\/password)/i,
    newPasswordAttr: /new-password/,
    currentPasswordAttr: /current-password/,
    otp: /(?:otp|totp|one.?time|verification.?code|auth(?:entication)?.?code|2fa|mfa|security.?code)/i,
    extraField: /\b(?:first|last|given|family|full)[\s_-]?name\b|\b(?:phone|mobile|birth|dob|age|address|city|zip|postal|country|company|organization)\b|\b(?:terms|agree|tos|consent)\b/i,
    loginPageText: /(?:already\s+have\s+an\s+account|sign\s?-?in\s+instead|log\s?-?in\s+instead|existing\s+account|returning\s+user|welcome\s+back)/i,
    registerPageText: /(?:create\s+(?:an\s+)?account|sign\s?-?up|register\s+(?:now|today|free)|join\s+(?:now|free|us)|start\s+your\s+free|get\s+started)/i
};

const FORM_CLASSIFIER_INPUT_TYPES = [
    'text',
    'email',
    'password',
    'tel',
    'number',
    'url',
    'search',
    '',
    null
];

const FORM_CLASSIFIER_SKIP_TYPES = [
    'hidden',
    'submit',
    'button',
    'reset',
    'image',
    'file',
    'checkbox',
    'radio',
    'range',
    'color',
    'date',
    'datetime-local',
    'month',
    'time',
    'week'
];

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const attribute = (element, name) => (element?.getAttribute?.(name) ?? '').toString().toLowerCase();

const labelText = function(element) {
    if (!element) {
        return '';
    }

    if (element.labels && element.labels.length > 0) {
        return Array.from(element.labels).map((label) => label.textContent ?? '').join(' ');
    }

    return element.closest?.('label')?.textContent ?? '';
};

const fieldDescriptor = function(element) {
    return [
        attribute(element, 'name'),
        attribute(element, 'id'),
        attribute(element, 'placeholder'),
        attribute(element, 'aria-label'),
        attribute(element, 'autocomplete'),
        labelText(element)
    ].join(' ').toLowerCase();
};

const isInputElement = (element) => element
    && typeof element === 'object'
    && (element.nodeName === 'INPUT' || element.nodeName === 'TEXTAREA');

const isVisible = function(element) {
    if (!element) {
        return false;
    }

    if (typeof element.getClientRects !== 'function') {
        return true;
    }

    return element.getClientRects().length > 0;
};

const inputType = (element) => (attribute(element, 'type') || 'text');

const isSupportedInput = function(element) {
    if (!isInputElement(element)) {
        return false;
    }

    const type = inputType(element);
    return !FORM_CLASSIFIER_SKIP_TYPES.includes(type)
        && FORM_CLASSIFIER_INPUT_TYPES.includes(type);
};

const collectInputs = function(root) {
    if (!root) {
        return [];
    }

    if (Array.isArray(root)) {
        return root.filter(isSupportedInput);
    }

    if (root.elements && typeof root.elements.length === 'number' && root.querySelectorAll) {
        return Array.from(root.elements).filter(isSupportedInput);
    }

    if (root.querySelectorAll) {
        return Array.from(root.querySelectorAll('input, textarea')).filter(isSupportedInput);
    }

    return [];
};

const collectButtons = function(root) {
    if (!root?.querySelectorAll) {
        return [];
    }

    return Array.from(root.querySelectorAll('button, input[type=submit], input[type=button], [role=button]'))
        .map((button) => {
            const type = attribute(button, 'type');
            if (type === 'password' || attribute(button, 'name').includes('password')) {
                return '';
            }

            return [
                button.textContent ?? '',
                attribute(button, 'value'),
                attribute(button, 'aria-label'),
                attribute(button, 'id'),
                attribute(button, 'name')
            ].join(' ');
        })
        .join(' ')
        .toLowerCase();
};

const collectCheckboxes = function(root) {
    if (!root?.querySelectorAll) {
        return [];
    }

    return Array.from(root.querySelectorAll('input[type=checkbox]'))
        .filter(isVisible)
        .map((element) => fieldDescriptor(element));
};

const collectPageText = function(root, options) {
    if (typeof options?.pageText === 'string') {
        return options.pageText.slice(0, kpxcFormClassifier.MAX_PAGE_TEXT);
    }

    return (root?.ownerDocument?.body?.innerText ?? '').slice(0, kpxcFormClassifier.MAX_PAGE_TEXT);
};

/**
 * Classify a form, a container with loose inputs, or an array of inputs.
 *
 * @param {Element|Element[]} root Form, container or input list
 * @param {object} options { url, pageText, requireVisible }
 * @returns {{type: string, confidence: number, scores: object, signals: object[], fields: object}}
 */
kpxcFormClassifier.classify = function(root, options = {}) {
    const requireVisible = options.requireVisible !== false;
    const allInputs = collectInputs(root);
    const visibleInputs = requireVisible ? allInputs.filter(isVisible) : allInputs;
    const fields = visibleInputs.map((element) => ({
        element,
        type: inputType(element),
        autocomplete: attribute(element, 'autocomplete'),
        description: fieldDescriptor(element)
    }));

    const passwordFields = fields.filter((field) => field.type === 'password');
    const otpFields = fields.filter((field) => field.autocomplete === 'one-time-code'
        || (!field.description.includes('password') && FORM_CLASSIFIER_PATTERNS.otp.test(field.description)));
    const usernameField = fields.find((field) => field.type === 'email'
        || field.autocomplete === 'username'
        || field.autocomplete === 'email'
        || (!field.description.includes('password')
            && /(?:user|login|email|e-mail|account)/i.test(field.description)));
    const emailField = fields.find((field) => field.type === 'email'
        || field.autocomplete === 'email'
        || /e-?mail/i.test(field.description));

    const url = (options.url ?? (typeof location !== 'undefined' ? location.href : '') ?? '').toString();
    const pageText = collectPageText(root, options);
    const buttonText = collectButtons(root);
    const hasRegisterUrl = FORM_CLASSIFIER_PATTERNS.registerUrl.test(url);
    const hasResetUrl = FORM_CLASSIFIER_PATTERNS.resetUrl.test(url);
    const hasChangeUrl = FORM_CLASSIFIER_PATTERNS.changeUrl.test(url);
    const registerButton = FORM_CLASSIFIER_PATTERNS.register.test(buttonText);
    const loginButton = FORM_CLASSIFIER_PATTERNS.login.test(buttonText);
    const resetButton = FORM_CLASSIFIER_PATTERNS.reset.test(buttonText);
    const registerText = FORM_CLASSIFIER_PATTERNS.registerPageText.test(pageText);
    const loginText = FORM_CLASSIFIER_PATTERNS.loginPageText.test(pageText);
    const extraFields = fields.filter((field) => field.type !== 'password'
        && field !== usernameField
        && field !== emailField
        && field !== otpFields[0]
        && FORM_CLASSIFIER_PATTERNS.extraField.test(field.description));
    const termsField = collectCheckboxes(root)
        .find((description) => /(?:terms|agree|tos|consent)/i.test(description));

    const scores = {
        'login': 0,
        'register': 0,
        'change-password': 0,
        'reset-password': 0,
        'otp': 0
    };
    const signals = [];
    const add = function(type, weight, reason) {
        if (weight <= 0) {
            return;
        }

        scores[type] += weight;
        signals.push({ type, weight, reason });
    };

    if (passwordFields.length === 0 && otpFields.length > 0) {
        add('otp', 4, 'otp-fields-only');
    }

    if (passwordFields.length === 0 && otpFields.length === 0) {
        if (hasResetUrl) {
            add('reset-password', 2.5, 'reset-url');
        } else if (hasRegisterUrl || registerButton) {
            add('register', 2, 'register-hint');
        } else if (usernameField?.autocomplete === 'username'
            || usernameField?.autocomplete === 'email'
            || loginButton) {
            add('login', 2, 'username-only-login');
        }
    }

    if (passwordFields.length > 0) {
        const firstPassword = passwordFields[0];
        const hasConfirmField = passwordFields.slice(1).some(
            (field) => FORM_CLASSIFIER_PATTERNS.confirm.test(field.description),
        );
        const hasCurrentField = passwordFields.some(
            (field) => field.autocomplete === 'current-password'
                || FORM_CLASSIFIER_PATTERNS.current.test(field.description),
        );
        const hasNewField = passwordFields.some(
            (field) => field.autocomplete === 'new-password'
                || FORM_CLASSIFIER_PATTERNS.newPassword.test(field.description),
        );

        if (passwordFields.length >= 3) {
            add('change-password', 2.6, 'three-password-fields');
            add('register', 0.7, 'three-password-fields');

            if (hasCurrentField) {
                add('change-password', 1.5, 'current-password-field');
            }
        } else if (passwordFields.length === 2) {
            if (hasCurrentField) {
                add('change-password', 3, 'current-and-new-password');
            } else if (hasConfirmField) {
                add('register', 2.6, 'confirm-password-field');
            } else {
                add('register', 1.8, 'two-password-fields');
                add('change-password', 0.6, 'two-password-fields');
            }
        } else {
            if (firstPassword.autocomplete === 'new-password') {
                add('register', 3, 'new-password-autocomplete');
            } else if (firstPassword.autocomplete === 'current-password') {
                add('login', 3, 'current-password-autocomplete');
            } else {
                add('login', 0.5, 'single-password-default');
            }
        }

        if (hasNewField) {
            add('register', 1.5, 'new-password-field');
        }

        if (hasRegisterUrl) {
            add('register', 2, 'register-url');
        }

        if (hasChangeUrl) {
            add('change-password', 2, 'change-password-url');
        }

        if (hasResetUrl) {
            add('reset-password', 3, 'reset-url');
        }

        if (hasNewField && hasResetUrl) {
            add('reset-password', 2, 'new-password-on-reset-page');
        }
    }

    if (registerButton) {
        add('register', 1.5, 'register-button');
    }

    if (loginButton) {
        add('login', 1.5, 'login-button');
    }

    if (resetButton) {
        add('reset-password', 1.5, 'reset-button');
    }

    if (extraFields.length >= 2) {
        add('register', 1.2, 'registration-extra-fields');
    }

    if (termsField) {
        add('register', 1.2, 'terms-checkbox');
    }

    if (registerText) {
        add('register', 1, 'register-page-text');
    }

    if (loginText) {
        add('login', 1.2, 'login-page-text');
    }

    const ranking = Object.entries(scores)
        .sort((left, right) => right[1] - left[1]);
    const [ bestType, bestScore ] = ranking[0];
    const secondScore = ranking[1]?.[1] ?? 0;

    if (bestScore <= 0) {
        return {
            type: kpxcFormClassifier.FormType.UNKNOWN,
            confidence: 0,
            scores,
            signals,
            fields: {
                username: usernameField?.element ?? null,
                email: emailField?.element ?? null,
                passwords: passwordFields.map((field) => field.element),
                confirm: passwordFields[1]?.element ?? null,
                otp: otpFields.map((field) => field.element)
            }
        };
    }

    const confidence = clamp(
        0.5 + (bestScore - secondScore) * 0.1 + Math.min(bestScore, 8) * 0.045,
        0.5,
        0.99,
    );

    return {
        type: bestType,
        confidence: Math.round(confidence * 100) / 100,
        scores,
        signals,
        fields: {
            username: usernameField?.element ?? null,
            email: emailField?.element ?? null,
            passwords: passwordFields.map((field) => field.element),
            confirm: passwordFields[1]?.element ?? null,
            otp: otpFields.map((field) => field.element)
        }
    };
};

/**
 * Whether a classified form should offer to save new credentials.
 * The setting is enabled by default; a false value disables the feature.
 */
kpxcFormClassifier.shouldPromptSave = function(type, settings = {}) {
    if (settings?.detectNewAccountSignups === false) {
        return false;
    }

    return type === kpxcFormClassifier.FormType.REGISTER
        || type === kpxcFormClassifier.FormType.CHANGE_PASSWORD
        || type === kpxcFormClassifier.FormType.RESET_PASSWORD;
};

// Exports for tests
if (typeof module === 'object') {
    module.exports = kpxcFormClassifier;
}
