'use strict';

/**
 * @Object kpxcSignupAlias
 * Plus-addressing email alias helper for registration forms.
 *
 * No third-party provider is contacted and no API key is stored. The alias is
 * written into the page's email field like any user input.
 */
const kpxcSignupAlias = {};
kpxcSignupAlias.offeredFields = new WeakSet();

kpxcSignupAlias.slug = function(hostname) {
    return (hostname ?? '')
        .replace(/^www\./i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32);
};

kpxcSignupAlias.plusAlias = function(email, hostname) {
    const value = (email ?? '').trim();
    const separator = value.lastIndexOf('@');
    if (separator <= 0 || separator === value.length - 1) {
        return null;
    }

    const localPart = value.slice(0, separator).split('+')[0];
    const domain = value.slice(separator + 1);
    if (localPart === '' || !domain.includes('.')) {
        return null;
    }

    return `${localPart}+${kpxcSignupAlias.slug(hostname) || 'alias'}@${domain}`;
};

kpxcSignupAlias.generate = function(email, hostname, settings = {}) {
    if (settings.aliasProvider === 'catchall') {
        const domain = (settings.aliasDomain ?? '').trim().replace(/^@/, '');
        const slug = kpxcSignupAlias.slug(hostname);
        if (domain.includes('.') && slug !== '') {
            return `${slug}@${domain}`;
        }
    }

    return kpxcSignupAlias.plusAlias(email, hostname);
};

kpxcSignupAlias.offer = function(field) {
    if (!field
        || kpxc.settings.offerEmailAliases === false
        || kpxcSignupAlias.offeredFields.has(field)
        || (field.getAttribute?.('type') ?? '').toLowerCase() !== 'email') {
        return;
    }

    kpxcSignupAlias.offeredFields.add(field);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tr('aliasGenerateButton');
    button.title = tr('aliasGenerateTitle');
    button.setAttribute('aria-label', tr('aliasGenerateTitle'));
    button.style.cssText = [
        'margin-left:4px',
        'padding:0 6px',
        'font:inherit',
        'font-size:11px',
        'line-height:1.6',
        'cursor:pointer',
        'border:1px solid currentColor',
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
        const alias = kpxcSignupAlias.generate(field.value, document.location.hostname, kpxc.settings);
        if (!alias) {
            kpxcUI.createNotification('error', tr('aliasNeedsEmail'));
            return;
        }

        field.value = alias;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.focus();
    });

    button.addEventListener('mousedown', (event) => event.stopPropagation());
    field.insertAdjacentElement('afterend', button);
};
