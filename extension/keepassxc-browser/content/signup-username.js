'use strict';

/**
 * @Object kpxcUsernameSuggestion
 * Suggests a username and email for registration forms.
 *
 * The panel only writes values into the page like user input would. No
 * password, secret or third-party service is involved.
 */
const kpxcUsernameSuggestion = {};
kpxcUsernameSuggestion.offeredFields = new WeakSet();
kpxcUsernameSuggestion.panel = null;

const suggestionLabel = function(key, fallback) {
    return browser.i18n.getMessage(key) || fallback;
};

const suggestionStyle = function(element, styles) {
    Object.assign(element.style, styles);
    return element;
};

kpxcUsernameSuggestion.sanitizeBase = function(value) {
    return (value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '.')
        .replace(/\.{2,}/g, '.')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 24);
};

kpxcUsernameSuggestion.randomSuffix = function() {
    return String(crypto.getRandomValues(new Uint32Array(1))[0] % 900 + 100);
};

kpxcUsernameSuggestion.emailDomain = function(field) {
    const value = (field?.value ?? '').trim();
    const separator = value.lastIndexOf('@');
    return separator > 0 ? value.slice(separator + 1) : '';
};

kpxcUsernameSuggestion.closePanel = function() {
    if (kpxcUsernameSuggestion.panel) {
        kpxcUsernameSuggestion.panel.remove();
        kpxcUsernameSuggestion.panel = null;
    }
};

kpxcUsernameSuggestion.openPanel = function(field) {
    kpxcUsernameSuggestion.closePanel();

    const root = field.form ?? field.closest?.('form, [role=form]') ?? document.body;
    const classification = kpxcFormClassifier.classify(root, { url: document.location.href });
    const usernameField = classification.fields.username;
    const emailField = classification.fields.email ?? field;

    const initialBase = kpxcUsernameSuggestion.sanitizeBase(
        usernameField?.value
        || (emailField.value.includes('@') ? emailField.value.split('@')[0] : emailField.value)
        || '',
    );
    const initialDomain = (kpxc.settings.aliasDomain || '').trim()
        || kpxcUsernameSuggestion.emailDomain(emailField)
        || document.location.hostname;

    const panel = document.createElement('div');
    suggestionStyle(panel, {
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '12px',
        boxShadow: '0 16px 40px rgba(1, 4, 9, .6)',
        color: '#e6edf3',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '12px',
        gap: '8px',
        maxWidth: '320px',
        padding: '12px',
        position: 'fixed',
        width: '320px',
        zIndex: '2147483645'
    });

    const rect = field.getBoundingClientRect();
    panel.style.top = `${Math.min(window.innerHeight - 260, rect.bottom + 6)}px`;
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 332, rect.left))}px`;

    const title = document.createElement('div');
    title.textContent = suggestionLabel('suggestionTitle', 'Generate username & email');
    title.style.cssText = 'font-weight:600;font-size:13px;';

    const modes = document.createElement('div');
    modes.style.cssText = 'display:flex;gap:4px;';
    const modeButtons = {};
    for (const [ mode, labelKey, fallback ] of [
        [ 'username', 'suggestionUsername', 'Username' ],
        [ 'email', 'suggestionEmail', 'Email' ],
        [ 'both', 'suggestionBoth', 'Both' ]
    ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = suggestionLabel(labelKey, fallback);
        button.style.cssText = 'flex:1;padding:5px 6px;border-radius:6px;border:1px solid #30363d;background:transparent;color:#c9d1d9;cursor:pointer;font:inherit;';
        button.dataset.mode = mode;
        modes.appendChild(button);
        modeButtons[mode] = button;
    }
    let selectedMode = 'both';
    const selectMode = (mode) => {
        selectedMode = mode;
        for (const [ key, button ] of Object.entries(modeButtons)) {
            button.style.background = key === mode ? '#238636' : 'transparent';
            button.style.color = key === mode ? '#ffffff' : '#c9d1d9';
        }
    };
    for (const button of Object.values(modeButtons)) {
        button.addEventListener('click', () => selectMode(button.dataset.mode));
    }
    selectMode('both');

    const createInputRow = (labelKey, fallback, value) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const label = document.createElement('span');
        label.textContent = suggestionLabel(labelKey, fallback);
        label.style.cssText = 'flex:0 0 58px;color:#8b949e;';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.style.cssText = 'flex:1;min-width:0;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:6px 8px;font:inherit;';
        row.append(label, input);
        panel.appendChild(row);
        return input;
    };

    panel.append(title, modes);
    const baseInput = createInputRow('suggestionBase', 'Base name', initialBase || 'user');
    const domainInput = createInputRow('suggestionDomain', 'Domain', initialDomain);

    const preview = document.createElement('div');
    preview.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:8px;line-height:1.5;';
    const previewUsername = document.createElement('div');
    const previewEmail = document.createElement('div');
    previewEmail.style.color = '#8b949e';
    preview.append(previewUsername, previewEmail);
    panel.appendChild(preview);

    const updatePreview = () => {
        const base = kpxcUsernameSuggestion.sanitizeBase(baseInput.value) || 'user';
        const username = `${base}${kpxcUsernameSuggestion.randomSuffix()}`;
        const domain = domainInput.value.trim().replace(/^@/, '') || document.location.hostname;
        previewUsername.textContent = username;
        previewEmail.textContent = `${username}@${domain}`;
        panel.dataset.username = username;
        panel.dataset.email = `${username}@${domain}`;
    };
    baseInput.addEventListener('input', updatePreview);
    domainInput.addEventListener('input', updatePreview);
    updatePreview();

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = suggestionLabel('suggestionCancel', 'Cancel');
    cancel.style.cssText = 'padding:6px 12px;border-radius:6px;border:1px solid #30363d;background:transparent;color:#c9d1d9;cursor:pointer;font:inherit;';
    cancel.addEventListener('click', () => kpxcUsernameSuggestion.closePanel());

    const use = document.createElement('button');
    use.type = 'button';
    use.textContent = suggestionLabel('suggestionUse', 'Use this');
    use.style.cssText = 'padding:6px 12px;border-radius:6px;border:1px solid #2ea043;background:#238636;color:#fff;cursor:pointer;font:inherit;';
    use.addEventListener('click', (event) => {
        if (!event.isTrusted) {
            return;
        }

        const username = panel.dataset.username;
        const email = panel.dataset.email;
        const fill = (element, value) => {
            if (!element) {
                return;
            }

            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        };

        if (selectedMode === 'username' || selectedMode === 'both') {
            fill(classification.fields.username ?? usernameField, username);
        }

        if (selectedMode === 'email' || selectedMode === 'both') {
            fill(emailField, email);
        }

        kpxcUsernameSuggestion.closePanel();
    });

    actions.append(cancel, use);
    panel.appendChild(actions);
    document.body.appendChild(panel);
    kpxcUsernameSuggestion.panel = panel;

    const outside = (event) => {
        if (!panel.contains(event.target) && event.target !== field) {
            kpxcUsernameSuggestion.closePanel();
            document.removeEventListener('mousedown', outside, true);
        }
    };
    document.addEventListener('mousedown', outside, true);
};

kpxcUsernameSuggestion.offer = function(field) {
    if (!field
        || kpxc.settings.offerUsernameSuggestions === false
        || kpxcUsernameSuggestion.offeredFields.has(field)
        || (field.getAttribute?.('type') ?? '').toLowerCase() !== 'email') {
        return;
    }

    kpxcUsernameSuggestion.offeredFields.add(field);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = suggestionLabel('suggestionButton', 'Generate');
    button.title = suggestionLabel('suggestionTitle', 'Generate username & email');
    button.setAttribute('aria-label', button.title);
    button.style.cssText = [
        'margin-left:4px',
        'padding:0 6px',
        'font:inherit',
        'font-size:11px',
        'line-height:1.6',
        'cursor:pointer',
        'border:1px solid #30363d',
        'border-radius:3px',
        'background:transparent',
        'color:inherit',
        'vertical-align:middle'
    ].join(';');

    button.addEventListener('click', (event) => {
        if (!event.isTrusted) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        kpxcUsernameSuggestion.openPanel(field);
    });

    field.insertAdjacentElement('afterend', button);
};
