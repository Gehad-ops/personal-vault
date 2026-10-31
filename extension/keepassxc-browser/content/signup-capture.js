'use strict';

/**
 * @Object kpxcSignupCapture
 * Captures register, change-password and reset-password forms into a short-lived
 * background snapshot, waits for a success/failure signal, and only then offers
 * to save. Passwords are never logged or written to the DOM.
 */
const kpxcSignupCapture = {};
kpxcSignupCapture.CAPTURE_DELAY_MS = 200;
kpxcSignupCapture.OUTCOME_POLL_MS = 200;
kpxcSignupCapture.OUTCOME_TIMEOUT_MS = 2000;
kpxcSignupCapture.STEP_MAX_AGE_MS = 5 * 60 * 1000;
kpxcSignupCapture.initialized = false;
kpxcSignupCapture.captureTimer = null;
kpxcSignupCapture.lastFingerprint = '';
kpxcSignupCapture.submittedAt = 0;
kpxcSignupCapture.lastSnapshot = null;
kpxcSignupCapture.inherited = null;
kpxcSignupCapture.watchToken = 0;
kpxcSignupCapture.autofilledFields = new WeakSet();

const SIGNUP_ERROR_PATTERN = /(?:already\s+(?:exists|registered|in\s+use|taken)|is\s+not\s+valid|invalid\s+(?:email|password|username|code)|incorrect\s+(?:email|password|username|code)|try\s+again|something\s+went\s+wrong|password\s+is\s+too\s+(?:short|weak)|passwords?\s+do(?:es)?\s+not\s+match|passwords?\s+don['’]?t\s+match|unable\s+to\s+create)/i;
const SIGNUP_ALERT_SELECTOR = '[role=alert], [aria-live], .error, .errors, .invalid, .invalid-feedback, .form-error, .field-error, [aria-invalid=true]';

const signupSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

kpxcSignupCapture.isTopFrame = function() {
    try {
        return window.top === window;
    } catch (_error) {
        return false;
    }
};

kpxcSignupCapture.topUrl = function() {
    try {
        return trimURL(window.top.location.href);
    } catch (_error) {
        try {
            const ancestor = window.location.ancestorOrigins?.[0];
            if (ancestor) {
                return trimURL(ancestor);
            }
        } catch (_nestedError) {
            // ancestorOrigins is Chromium-only
        }

        return trimURL(document.referrer || document.location.href);
    }
};

kpxcSignupCapture.currentUrl = function() {
    return trimURL(document.location.href);
};

kpxcSignupCapture.sameSite = function(left, right) {
    try {
        const leftHost = new URL(left).hostname.replace(/^www\./i, '');
        const rightHost = new URL(right).hostname.replace(/^www\./i, '');
        return leftHost === rightHost
            || leftHost.endsWith(`.${rightHost}`)
            || rightHost.endsWith(`.${leftHost}`);
    } catch (_error) {
        return false;
    }
};

kpxcSignupCapture.fieldText = function(element) {
    const labels = element.labels ? Array.from(element.labels).map((label) => label.textContent ?? '').join(' ') : '';
    return [
        element.getAttribute?.('name') ?? '',
        element.getAttribute?.('id') ?? '',
        element.getAttribute?.('placeholder') ?? '',
        element.getAttribute?.('aria-label') ?? '',
        element.getAttribute?.('autocomplete') ?? '',
        labels
    ].join(' ').toLowerCase();
};

kpxcSignupCapture.isVisible = function(element) {
    return !!element && typeof element.getClientRects === 'function' && element.getClientRects().length > 0;
};

kpxcSignupCapture.isCapturableField = function(element) {
    if (!element || (element.nodeName !== 'INPUT' && element.nodeName !== 'TEXTAREA')) {
        return false;
    }

    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (![ 'text', 'email', 'tel', 'password', 'url', 'number', '' ].includes(type)) {
        return false;
    }

    return !element.disabled && kpxcSignupCapture.isVisible(element);
};

kpxcSignupCapture.findRoot = function(element) {
    return element.form
        ?? element.closest?.('form, [role=form]')
        ?? element.closest?.('div, section, main, article')
        ?? document.body;
};

kpxcSignupCapture.init = function() {
    if (kpxcSignupCapture.initialized) {
        return;
    }

    kpxcSignupCapture.initialized = true;
    document.addEventListener('input', kpxcSignupCapture.onFieldEvent, true);
    document.addEventListener('change', kpxcSignupCapture.onFieldEvent, true);
    document.addEventListener('blur', kpxcSignupCapture.onFieldEvent, true);
    document.addEventListener('submit', kpxcSignupCapture.onSubmit, true);
    document.addEventListener('focusin', kpxcSignupCapture.onFocusIn, true);
    window.addEventListener('popstate', kpxcSignupCapture.refreshInherited);
    window.addEventListener('hashchange', kpxcSignupCapture.refreshInherited);
};

kpxcSignupCapture.onFocusIn = function(event) {
    const field = event.target;
    if (!field || (field.getAttribute?.('type') ?? '').toLowerCase() !== 'email') {
        return;
    }

    const classification = kpxcFormClassifier.classify(
        kpxcSignupCapture.findRoot(field),
        { url: kpxcSignupCapture.currentUrl() },
    );

    if (classification.type === kpxcFormClassifier.FormType.REGISTER
        && classification.confidence >= kpxcFormClassifier.MIN_REGISTER_CONFIDENCE
        && typeof kpxcSignupAlias !== 'undefined') {
        kpxcSignupAlias.offer(classification.fields.email ?? field);
        if (typeof kpxcUsernameSuggestion !== 'undefined') {
            kpxcUsernameSuggestion.offer(classification.fields.email ?? field);
        }
    }
};

kpxcSignupCapture.refreshInherited = async function() {
    if (kpxc.settings.detectNewAccountSignups === false) {
        return;
    }

    const snapshot = await sendMessage('page_pending_get', [ kpxcSignupCapture.topUrl() ]);
    if (!snapshot?.awaitingPassword
        || Date.now() - snapshot.timestamp > kpxcSignupCapture.STEP_MAX_AGE_MS
        || !kpxcSignupCapture.sameSite(snapshot.url, kpxcSignupCapture.currentUrl())) {
        kpxcSignupCapture.inherited = null;
        return;
    }

    kpxcSignupCapture.inherited = snapshot;
};

kpxcSignupCapture.onFieldEvent = function(event) {
    if (!kpxcSignupCapture.isCapturableField(event.target)) {
        return;
    }

    if (kpxcSignupCapture.captureTimer) {
        clearTimeout(kpxcSignupCapture.captureTimer);
    }

    kpxcSignupCapture.captureTimer = setTimeout(() => {
        kpxcSignupCapture.captureTimer = null;
        kpxcSignupCapture.capture(event.target, false);
    }, kpxcSignupCapture.CAPTURE_DELAY_MS);
};

kpxcSignupCapture.onSubmit = function(event) {
    if (kpxcSignupCapture.captureTimer) {
        clearTimeout(kpxcSignupCapture.captureTimer);
        kpxcSignupCapture.captureTimer = null;
    }

    kpxcSignupCapture.submittedAt = Date.now();
    const root = event.target;
    const input = root?.querySelector?.('input[type=password], input, textarea')
        ?? (kpxcSignupCapture.isCapturableField(root) ? root : null);

    if (input) {
        kpxcSignupCapture.capture(input, true);
    }
};

kpxcSignupCapture.selectPasswordField = function(passwordFields) {
    if (!Array.isArray(passwordFields) || passwordFields.length === 0) {
        return null;
    }

    const isCurrent = (element) => (element.getAttribute?.('autocomplete') ?? '').toLowerCase() === 'current-password'
        || /(?:current|old|existing|previous)/i.test(kpxcSignupCapture.fieldText(element));
    const isConfirm = (element) => /(?:confirm|repeat|retype|re-type|verify|re-?enter|again|confirmation)/i
        .test(kpxcSignupCapture.fieldText(element));

    const newFields = passwordFields.filter((element) => !isCurrent(element) && !isConfirm(element));
    if (newFields.length > 0) {
        return newFields[0];
    }

    return passwordFields.find((element) => !isCurrent(element)) ?? passwordFields[0];
};

kpxcSignupCapture.collectExtraFields = function(root, skipped) {
    const extraFields = {};
    if (!root?.querySelectorAll) {
        return extraFields;
    }

    let count = 0;
    for (const element of root.querySelectorAll('input, textarea, select')) {
        if (count >= 20) {
            break;
        }

        if (skipped.has(element) || element.disabled || !kpxcSignupCapture.isVisible(element)) {
            continue;
        }

        const type = (element.getAttribute('type') ?? 'text').toLowerCase();
        if ([ 'hidden', 'password', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio', 'image' ].includes(type)) {
            continue;
        }

        const name = (element.getAttribute('name') ?? element.getAttribute('id') ?? '').slice(0, 64);
        if (name === '' || typeof element.value !== 'string' || element.value === '') {
            continue;
        }

        extraFields[name] = element.value.slice(0, 1024);
        ++count;
    }

    return extraFields;
};

kpxcSignupCapture.capture = function(element, submitted) {
    if (kpxc.settings.detectNewAccountSignups === false) {
        return;
    }

    // Never downgrade an already submitted snapshot back to an in-progress one
    if (!submitted && Date.now() - kpxcSignupCapture.submittedAt < 5000) {
        return;
    }

    const root = kpxcSignupCapture.findRoot(element);
    if (!root) {
        return;
    }

    const classification = kpxcFormClassifier.classify(root, { url: kpxcSignupCapture.currentUrl() });
    let formType = classification.type;
    const usernameField = classification.fields.username;
    const emailField = classification.fields.email;
    let inherited = null;

    if (kpxcSignupCapture.inherited
        && (formType === kpxcFormClassifier.FormType.LOGIN || formType === kpxcFormClassifier.FormType.UNKNOWN)
        && classification.fields.passwords.length > 0) {
        inherited = kpxcSignupCapture.inherited;
        formType = inherited.formType;
    }

    if (!kpxcFormClassifier.shouldPromptSave(formType, kpxc.settings)
        || (!inherited && classification.confidence < kpxcFormClassifier.MIN_REGISTER_CONFIDENCE)) {
        return;
    }

    const passwordField = kpxcSignupCapture.selectPasswordField(classification.fields.passwords);
    const password = passwordField?.value ?? '';

    let username = usernameField?.value ?? inherited?.username ?? '';
    const email = emailField?.value ?? inherited?.email ?? '';
    if (username === '') {
        username = email;
    }

    const skipped = new Set(classification.fields.passwords);
    if (usernameField) {
        skipped.add(usernameField);
    }

    if (emailField) {
        skipped.add(emailField);
    }

    const snapshot = {
        awaitingPassword: password === '',
        email,
        extraFields: kpxcSignupCapture.collectExtraFields(root, skipped),
        formType,
        password,
        submitted: submitted && password !== '' && kpxcSignupCapture.isTopFrame(),
        topUrl: kpxcSignupCapture.topUrl(),
        url: kpxcSignupCapture.currentUrl(),
        username
    };

    const fingerprint = [
        snapshot.formType,
        snapshot.url,
        snapshot.username,
        snapshot.email,
        snapshot.password,
        snapshot.submitted,
        snapshot.awaitingPassword
    ].join('\u0000');

    if (fingerprint === kpxcSignupCapture.lastFingerprint) {
        return;
    }

    if (formType === kpxcFormClassifier.FormType.REGISTER
        && emailField
        && typeof kpxcSignupAlias !== 'undefined') {
        kpxcSignupAlias.offer(emailField);
        if (typeof kpxcUsernameSuggestion !== 'undefined') {
            kpxcUsernameSuggestion.offer(emailField);
        }
    }

    kpxcSignupCapture.lastFingerprint = fingerprint;
    kpxcSignupCapture.lastSnapshot = snapshot;
    sendMessage('page_pending_set', snapshot).catch(() => {});
};

kpxcSignupCapture.visibleAlertText = function(root) {
    const scope = root?.isConnected ? root : document;
    const nodes = scope.querySelectorAll?.(SIGNUP_ALERT_SELECTOR) ?? [];
    return Array.from(nodes)
        .filter((node) => kpxcSignupCapture.isVisible(node))
        .map((node) => node.innerText || node.textContent || '')
        .join(' ')
        .slice(0, 4000);
};

kpxcSignupCapture.hasError = function(root) {
    const scope = root?.isConnected ? root : document;
    if (scope.querySelector?.('[aria-invalid=true]')) {
        return true;
    }

    const alertText = kpxcSignupCapture.visibleAlertText(root);
    if (SIGNUP_ERROR_PATTERN.test(alertText)) {
        return true;
    }

    const pageText = (document.body?.innerText ?? '').slice(0, 20000);
    return SIGNUP_ERROR_PATTERN.test(pageText);
};

kpxcSignupCapture.verdict = function(entries, baseUrl) {
    const relevant = (entries ?? [])
        .filter((entry) => entry.origin && kpxcSignupCapture.sameSite(entry.origin, baseUrl));

    // Cancelled requests (status 0) are common during navigation and are ignored.
    if (relevant.some((entry) => entry.status >= 400 && entry.status < 600)) {
        return 'failure';
    }

    if (relevant.some((entry) => entry.status >= 200 && entry.status < 400)) {
        return 'success';
    }

    return 'unknown';
};

kpxcSignupCapture.evaluateOutcome = async function(snapshot, root) {
    if (kpxcSignupCapture.hasError(root)) {
        return 'failure';
    }

    const since = Math.max(0, (snapshot?.timestamp ?? Date.now()) - 1000);
    const entries = await sendMessage('page_get_network_result', [ since ]);
    const verdict = kpxcSignupCapture.verdict(entries, snapshot?.url ?? kpxcSignupCapture.currentUrl());
    if (verdict !== 'unknown') {
        return verdict;
    }

    if (snapshot?.url && kpxcSignupCapture.currentUrl() !== snapshot.url) {
        return 'success';
    }

    return 'pending';
};

kpxcSignupCapture.beginOutcomeWatch = async function(root) {
    const token = ++kpxcSignupCapture.watchToken;
    const since = Math.max(0, (kpxcSignupCapture.submittedAt || Date.now()) - 1000);
    const startedAt = Date.now();

    await signupSleep(300);

    while (Date.now() - startedAt < kpxcSignupCapture.OUTCOME_TIMEOUT_MS) {
        if (token !== kpxcSignupCapture.watchToken) {
            return;
        }

        if (kpxcSignupCapture.hasError(root)) {
            await kpxcSignupCapture.failOutcome();
            return;
        }

        const entries = await sendMessage('page_get_network_result', [ since ]);
        const verdict = kpxcSignupCapture.verdict(entries, kpxcSignupCapture.currentUrl());
        if (verdict === 'failure') {
            await kpxcSignupCapture.failOutcome();
            return;
        }

        if (verdict === 'success' || (root && !root.isConnected)) {
            await kpxcSignupCapture.succeedOutcome();
            return;
        }

        await signupSleep(kpxcSignupCapture.OUTCOME_POLL_MS);
    }
};

kpxcSignupCapture.succeedOutcome = async function() {
    if (kpxcSignupCapture.isTopFrame()) {
        await kpxcSignupCapture.handlePendingSave();
        return;
    }

    // Subframes commit the snapshot; the background wakes the top frame.
    if (kpxcSignupCapture.lastSnapshot) {
        await sendMessage('page_pending_set', {
            ...kpxcSignupCapture.lastSnapshot,
            awaitingPassword: false,
            submitted: true
        });
    }
};

kpxcSignupCapture.failOutcome = async function() {
    await sendMessage('page_pending_clear');
    await sendMessage('page_clear_submitted');
};

kpxcSignupCapture.isCurrentPasswordField = function(field) {
    return (field.getAttribute?.('autocomplete') ?? '').toLowerCase() === 'current-password'
        || /(?:current|old|existing|previous)/i.test(kpxcSignupCapture.fieldText(field));
};

// Fill the old password on change-password forms from the matching entry.
kpxcSignupCapture.maybeAutofillCurrentPassword = async function() {
    if (kpxc.settings.detectNewAccountSignups === false
        || kpxc.databaseState !== DatabaseState.UNLOCKED
        || kpxc.credentials.length === 0) {
        return;
    }

    for (const form of document.querySelectorAll('form')) {
        const classification = kpxcFormClassifier.classify(form, { url: kpxcSignupCapture.currentUrl() });
        if (classification.type !== kpxcFormClassifier.FormType.CHANGE_PASSWORD
            || classification.confidence < kpxcFormClassifier.MIN_REGISTER_CONFIDENCE) {
            continue;
        }

        const current = classification.fields.passwords.find(kpxcSignupCapture.isCurrentPasswordField)
            ?? classification.fields.passwords[0];
        if (!current || current.value !== '' || kpxcSignupCapture.autofilledFields.has(current)) {
            continue;
        }

        const usernameField = classification.fields.username;
        const username = (usernameField?.value ?? '').trim().toLowerCase();
        const credential = username
            ? kpxc.credentials.find((entry) => (entry.login ?? '').trim().toLowerCase() === username)
            : (kpxc.credentials.length === 1 ? kpxc.credentials[0] : null);
        if (!credential) {
            continue;
        }

        kpxcSignupCapture.autofilledFields.add(current);
        await kpxcFill.setValueWithChange(current, credential.password);
        await kpxc.setPasswordFilled(true);
    }
};

// Right-click a site-generated username and save it into the pending sign-up.
kpxcSignupCapture.saveSelectedUsername = async function() {
    const selected = (window.getSelection()?.toString() ?? '').trim().slice(0, 320);
    if (selected === '') {
        return;
    }

    const snapshot = kpxcSignupCapture.lastSnapshot
        ?? await sendMessage('page_pending_get', [ kpxcSignupCapture.topUrl() ]);

    if (!snapshot?.password) {
        kpxcUI.createNotification('error', tr('selectedUsernameNoPending'));
        return;
    }

    await sendMessage('page_pending_set', {
        ...snapshot,
        awaitingPassword: false,
        submitted: true,
        username: selected
    });

    await kpxcSignupCapture.handlePendingSave();
};

/**
 * Shows the save banner from a submitted snapshot. Returns true when the
 * snapshot was consumed, so the caller can skip the legacy submitted path.
 */
kpxcSignupCapture.handlePendingSave = async function() {
    if (!kpxcSignupCapture.isTopFrame()
        || kpxc.settings.detectNewAccountSignups === false
        || kpxc.databaseState !== DatabaseState.UNLOCKED) {
        return false;
    }

    const topUrl = kpxcSignupCapture.topUrl();
    const snapshot = await sendMessage('page_pending_get', [ topUrl ]);
    if (!snapshot?.submitted || !snapshot.password || snapshot.awaitingPassword
        || !kpxcFormClassifier.shouldPromptSave(snapshot.formType, kpxc.settings)
        || !(kpxcSignupCapture.sameSite(snapshot.url, topUrl)
            || (snapshot.topUrl && kpxcSignupCapture.sameSite(snapshot.topUrl, topUrl)))) {
        return false;
    }

    const outcome = await kpxcSignupCapture.evaluateOutcome(snapshot);
    if (outcome === 'failure') {
        await sendMessage('page_pending_take', [ topUrl ]);
        await sendMessage('page_clear_submitted');
        return false;
    }

    if (outcome === 'pending') {
        return false;
    }

    const consumed = await sendMessage('page_pending_take', [ topUrl ]);
    if (!consumed) {
        return false;
    }

    await sendMessage('page_clear_submitted');

    if (kpxc.settings.autoSaveNewAccounts && consumed.formType === 'register') {
        const username = consumed.username || consumed.email;
        kpxcBanner.credentials = {
            list: [],
            password: consumed.password,
            url: consumed.url,
            username
        };
        const result = await sendMessage('add_credentials', [ username, consumed.password, consumed.url ]);
        kpxcBanner.verifyResult(result);
        return true;
    }

    await kpxc.rememberCredentials(consumed.username, consumed.password, consumed.url, undefined, true, {
        email: consumed.email,
        formType: consumed.formType
    });
    return true;
};
