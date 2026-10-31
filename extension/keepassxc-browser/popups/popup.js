'use strict';

let reloadCount = 0;

HTMLElement.prototype.show = function() {
    this.hidden = false;
};

HTMLElement.prototype.hide = function() {
    this.hidden = true;
};

function statusResponse(r) {
    if (!r) {
        return;
    }

    $('#initial-state').hide();
    $('#site-panel').hide();
    $('#error-encountered').hide();
    $('#need-reconfigure').hide();
    $('#not-configured').hide();
    $('#configured-and-associated').hide();
    $('#configured-not-associated').hide();
    $('#lock-database-button').hide();
    $('#getting-started-guide').hide();
    $('#database-not-opened').hide();

    if (!r.keePassXCAvailable) {
        $('#error-message').textContent = r.error;
        $('#error-encountered').show();

        if (r.showGettingStartedGuideAlert) {
            $('#getting-started-guide').show();
        }

        if (r.showTroubleshootingGuideAlert && reloadCount >= 2) {
            $('#troubleshooting-guide').show();
        } else {
            $('#troubleshooting-guide').hide();
        }
    } else if (r.keePassXCAvailable && r.databaseClosed) {
        $('#database-error-message').textContent = r.error;
        $('#database-not-opened').show();
    } else if (!r.configured) {
        $('#not-configured').show();
    } else if (r.encryptionKeyUnrecognized) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').textContent = r.error;
    } else if (!r.associated) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').textContent = r.error;
    } else if (r.error) {
        $('#error-encountered').show();
        $('#error-message').textContent = r.error;
    } else {
        $('#configured-and-associated').show();
        $('#associated-identifier').textContent = r.identifier;
        $('#lock-database-button').show();

        if (r.usernameFieldDetected) {
            $('#username-field-detected').show();
        }

        if (r.iframeDetected) {
            $('#iframe-detected').show();
        }

        reloadCount = 0;
    }
}

const sendMessageToTab = async function(message) {
    const tab = await getCurrentTab();
    if (!tab) {
        return false; // Only the background devtools or a popup are opened
    }

    await browser.tabs.sendMessage(tab.id, {
        action: message
    });

    return true;
};

const fillLogin = async function(tab, index, uuid) {
    if (!tab?.id) {
        return;
    }

    await browser.tabs.sendMessage(tab.id, {
        action: 'fill_user_pass_with_specific_login',
        id: index,
        uuid: uuid
    });

    close();
};

const renderCurrentSite = async function() {
    const tab = await getCurrentTab();
    if (!tab?.url) {
        return;
    }

    try {
        const parsed = new URL(tab.url);
        const host = parsed.hostname.replace(/^www\./i, '');
        $('#site-host').textContent = host || parsed.protocol.replace(':', '');
        $('#site-host').title = tab.url;
        $('#site-avatar').textContent = (host || 'K').charAt(0).toUpperCase();
        $('#current-site-card').show();
    } catch (_error) {
        $('#site-host').textContent = tab.url;
        $('#current-site-card').show();
    }
};

const applyEntryFilter = function() {
    const query = ($('#entry-search')?.value ?? '').trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll('#login-list .entry-row'));
    let visible = 0;

    for (const row of rows) {
        const match = query === '' || (row.dataset.search ?? '').includes(query);
        row.hidden = !match;
        if (match) {
            ++visible;
        }
    }

    $('#entry-count').textContent = String(visible);
};

const renderLogins = async function() {
    const tab = await getCurrentTab();
    const logins = await getLoginData();
    const list = document.getElementById('login-list');
    list.textContent = '';

    if (!tab || logins.length === 0 || $('#configured-and-associated').hidden) {
        $('#site-panel').hide();
        return;
    }

    for (const [ index, login ] of logins.entries()) {
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');

        const avatar = document.createElement('span');
        avatar.className = 'entry-avatar';
        avatar.textContent = (login.title || login.visibleLogin || '?').charAt(0).toUpperCase();

        const meta = document.createElement('div');
        meta.className = 'entry-meta';

        const title = document.createElement('div');
        title.className = 'entry-title';
        title.textContent = login.title || login.text || browser.i18n.getMessage('credentialsNoUsername') || '';

        const username = document.createElement('div');
        username.className = 'entry-login';
        username.textContent = login.visibleLogin || login.login || '';

        meta.append(title, username);

        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'fill-button';
        action.textContent = browser.i18n.getMessage('popupFillButton') || 'Fill';
        action.title = action.textContent;
        action.setAttribute('aria-label', action.title);

        const activate = (event) => {
            if (!event.isTrusted) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            fillLogin(tab, index, login.uuid);
        };

        row.dataset.search = `${login.title ?? ''} ${login.visibleLogin ?? ''} ${login.text ?? ''}`.toLowerCase();
        row.addEventListener('click', activate);
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                activate(event);
            }
        });
        action.addEventListener('click', activate);

        row.append(avatar, meta, action);
        list.appendChild(row);
    }

    $('#entry-count').textContent = String(logins.length);
    $('#site-panel').show();
    applyEntryFilter();
};

(async () => {
    await initColorTheme();

    $('#connect-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'associate'
        });

        // This does not work with Firefox because of https://bugzilla.mozilla.org/show_bug.cgi?id=1665380
        await sendMessageToTab('retrieve_credentials_forced');
        close();
    });

    $('#reconnect-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'associate'
        });
        close();
    });

    $('#reload-status-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'reconnect'
        }));

        // Shows the Troubleshooting Guide alert every third time Reload button is pressed when popup is open
        if (reloadCount > 2) {
            reloadCount = 0;
        }
        reloadCount++;
    });

    $('#reopen-database-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ] // Set forcePopup to true
        }));
        window.close();
    });

    $('#redetect-fields-button').addEventListener('click', async () => {
        const res = await sendMessageToTab('redetect_fields');
        if (!res) {
            return;
        }

        statusResponse(await browser.runtime.sendMessage({
            action: 'get_status'
        }));
    });

    $('#lock-database-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'lock_database'
        }));
    });

    $('#username-only-button').addEventListener('click', async () => {
        await sendMessageToTab('add_username_only_option');
        await sendMessageToTab('redetect_fields');
        $('#username-field-detected').hide();
    });

    $('#allow-iframe-button').addEventListener('click', async () => {
        await sendMessageToTab('add_allow_iframes_option');
        await sendMessageToTab('redetect_fields');
        $('#iframe-detected').hide();
    });

    $('#getting-started-alert-close-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'hide_getting_started_guide_alert'
        });
    });

    $('#troubleshooting-guide-alert-close-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'hide_troubleshooting_guide_alert'
        });
    });

    $('#entry-search').addEventListener('input', (event) => {
        if (event.isTrusted) {
            applyEntryFilter();
        }
    });

    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            $('#entry-search')?.focus();
            $('#entry-search')?.select();
        }
    });

    $('#generate-password-button').addEventListener('click', async () => {
        await sendMessageToTab('show_password_generator');
        close();
    });

    statusResponse(await browser.runtime.sendMessage({
        action: 'get_status'
    }).catch((err) => {
        logError('Could not get status: ' + err);
    }));

    await renderCurrentSite();
    await renderLogins();
})();
