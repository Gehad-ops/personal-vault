'use strict';

const STORAGE_KEY = 'personalvault.v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

const state = {
    items: [],
    selectedId: null,
    filter: 'all',
    search: '',
    tag: null,
    key: null,
    salt: null,
    autoLockMinutes: 5,
    lockDeadline: 0,
    lockTimer: null,
    totpTimer: null,
    toastTimer: null,
    toastHide: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const nowIso = () => new Date().toISOString();

function b64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptVault(items, key, salt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(items)));
    return { v: 1, salt: b64(salt), iv: b64(iv), data: b64(data), updated: nowIso() };
}

async function decryptVault(record, password) {
    const salt = unb64(record.salt);
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(record.iv) },
        key,
        unb64(record.data)
    );
    return { items: JSON.parse(dec.decode(plain)), key, salt };
}

function loadRecord() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
        return null;
    }
}

async function save() {
    if (!state.key || !state.salt) return;
    const record = await encryptVault(state.items, state.key, state.salt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

/* ---------- lock screen ---------- */
let creating = false;

function showLock() {
    $('#app').classList.add('hidden');
    $('#lockScreen').classList.remove('hidden');
    creating = !loadRecord();
    $('#lockTitle').textContent = creating ? 'Create your vault' : 'Unlock your vault';
    $('#lockSub').textContent = creating
        ? 'Choose a master password. It encrypts your vault on this device.'
        : 'Your vault is encrypted on this device.';
    $('#confirmWrap').classList.toggle('hidden', !creating);
    $('#unlockBtn').textContent = creating ? 'Create vault' : 'Unlock';
    $('#resetVaultBtn').classList.toggle('hidden', creating);
    $('#masterPassword').value = '';
    $('#confirmPassword').value = '';
    $('#lockError').textContent = '';
    setTimeout(() => $('#masterPassword').focus(), 50);
}

async function unlock() {
    const password = $('#masterPassword').value;
    const error = $('#lockError');
    error.textContent = '';
    if (creating) {
        if (password.length < 8) {
            error.textContent = 'Use at least 8 characters.';
            return;
        }
        if (password !== $('#confirmPassword').value) {
            error.textContent = 'Passwords do not match.';
            return;
        }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveKey(password, salt);
        state.key = key;
        state.salt = salt;
        state.items = [];
        await save();
        openApp();
        return;
    }

    const record = loadRecord();
    if (!record) {
        showLock();
        return;
    }
    try {
        const { items, key, salt } = await decryptVault(record, password);
        state.key = key;
        state.salt = salt;
        state.items = Array.isArray(items) ? items : [];
        openApp();
    } catch {
        error.textContent = 'Wrong master password.';
    }
}

function lock() {
    state.key = null;
    state.salt = null;
    state.items = [];
    state.selectedId = null;
    stopTimers();
    showLock();
}

function openApp() {
    $('#lockScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    state.filter = 'all';
    state.search = '';
    state.tag = null;
    state.selectedId = state.items[0]?.id || null;
    $('#searchInput').value = '';
    render();
    startAutoLock();
}

/* ---------- auto lock ---------- */
function startAutoLock() {
    stopTimers();
    state.lockDeadline = Date.now() + state.autoLockMinutes * 60_000;
    state.lockTimer = setInterval(() => {
        const left = Math.max(0, state.lockDeadline - Date.now());
        const m = String(Math.floor(left / 60000)).padStart(2, '0');
        const s = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
        $('#autoLockLabel').textContent = `${m}:${s}`;
        if (left <= 0) lock();
    }, 1000);
}

function resetAutoLock() {
    if (!state.key) return;
    state.lockDeadline = Date.now() + state.autoLockMinutes * 60_000;
}

function stopTimers() {
    if (state.lockTimer) clearInterval(state.lockTimer);
    state.lockTimer = null;
    if (state.totpTimer) clearInterval(state.totpTimer);
    state.totpTimer = null;
}

/* ---------- data helpers ---------- */
function typeLabel(type) {
    return { password: 'Password', passkey: 'Passkey', totp: 'TOTP', card: 'Card' }[type] || 'Item';
}

const palette = [
    ['#3A2420', '#FFA38F'], ['#1B2F40', '#8FCBFF'], ['#3A2D1A', '#FFC983'],
    ['#262C45', '#B9C3FF'], ['#3A1A1A', '#FF8F8F'], ['#2A2447', '#C5B5FF'],
];
function avatarFor(title) {
    let h = 0;
    for (const ch of title || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
}
function updatedLabel(iso) {
    const d = new Date(iso || Date.now());
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function primaryUser(item) {
    if (item.type === 'card') return item.cardHolder || '';
    return item.username || item.rpId || item.issuer || '';
}
function isWeak(item) {
    const p = item.password || '';
    if (item.type !== 'password' || !p) return false;
    return p.length < 10 || !/[A-Z]/.test(p) || !/[0-9]/.test(p);
}
function cardExpiring(item) {
    if (item.type !== 'card' || !item.cardExpiry) return false;
    const [mm, yy] = item.cardExpiry.split('/').map(x => parseInt(x, 10));
    if (!mm || !yy) return false;
    const exp = new Date(2000 + yy, mm, 0).getTime();
    return exp - Date.now() < 60 * 86400_000;
}
function matches(item) {
    if (state.tag && !(item.tags || []).includes(state.tag)) return false;
    if (state.filter === 'favorite' && !item.favorite) return false;
    if (['password', 'passkey', 'totp', 'card'].includes(state.filter) && item.type !== state.filter) return false;
    const q = state.search.trim().toLowerCase();
    if (!q) return true;
    return [item.title, item.username, item.url, item.rpId, item.issuer, item.cardHolder, ...(item.tags || [])]
        .some(v => String(v || '').toLowerCase().includes(q));
}

/* ---------- render ---------- */
function render() {
    renderCounts();
    renderTags();
    renderList();
    renderDetails();
    renderHealth();
}

function renderCounts() {
    const by = t => state.items.filter(i => i.type === t).length;
    $('#countAll').textContent = state.items.length;
    $('#countFavorite').textContent = state.items.filter(i => i.favorite).length;
    $('#countPassword').textContent = by('password');
    $('#countPasskey').textContent = by('passkey');
    $('#countTotp').textContent = by('totp');
    $('#countCard').textContent = by('card');
    $$('.nav-item[data-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === state.filter && !state.tag);
    });
}

function renderTags() {
    const tags = [...new Set(state.items.flatMap(i => i.tags || []))].sort();
    const root = $('#tagList');
    root.innerHTML = '';
    if (!tags.length) {
        root.innerHTML = '<span class="muted">No tags</span>';
        return;
    }
    for (const tag of tags) {
        const b = document.createElement('button');
        b.className = 'tag' + (state.tag === tag ? ' active' : '');
        b.textContent = tag;
        b.onclick = () => {
            state.tag = state.tag === tag ? null : tag;
            state.filter = state.tag ? 'all' : state.filter;
            render();
        };
        root.appendChild(b);
    }
}

function renderList() {
    const list = $('#itemList');
    list.innerHTML = '';
    const items = state.items.filter(matches).sort((a, b) =>
        (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
        String(a.title || '').localeCompare(String(b.title || ''))
    );
    $('#emptyState').classList.toggle('hidden', items.length > 0);
    for (const item of items) {
        const [bg, fg] = avatarFor(item.title);
        const row = document.createElement('div');
        row.className = 'row' + (item.id === state.selectedId ? ' selected' : '');
        row.onclick = () => {
            state.selectedId = item.id;
            render();
        };

        const name = document.createElement('div');
        name.className = 'name-cell';
        name.innerHTML = `<span class="avatar" style="background:${bg};color:${fg}">${(item.title || '?').slice(0, 1).toUpperCase()}</span>`;
        const names = document.createElement('div');
        names.style.minWidth = '0';
        const title = document.createElement('div');
        title.className = 'row-title';
        title.textContent = (item.favorite ? '★ ' : '') + (item.title || 'Untitled');
        const sub = document.createElement('div');
        sub.className = 'row-sub';
        sub.textContent = typeLabel(item.type);
        names.append(title, sub);
        name.appendChild(names);

        const user = document.createElement('div');
        user.className = 'row-user';
        user.textContent = primaryUser(item);

        const right = document.createElement('div');
        if (cardExpiring(item)) {
            right.className = 'pill warn';
            right.textContent = 'Expiring';
        } else if (isWeak(item)) {
            right.className = 'pill bad';
            right.textContent = 'Weak';
        } else {
            right.className = 'row-date';
            right.textContent = updatedLabel(item.updated);
        }

        row.append(name, user, right);
        list.appendChild(row);
    }
}

function field(label, value, opts = {}) {
    const el = document.createElement('div');
    el.className = 'field';
    const top = document.createElement('div');
    top.className = 'field-label-row';
    top.textContent = label;
    const row = document.createElement('div');
    row.className = 'field-row';
    const val = document.createElement('div');
    val.className = 'field-value';
    val.textContent = value || '—';
    row.appendChild(val);
    if (opts.copy !== false && value) {
        const copy = document.createElement('button');
        copy.className = 'icon-btn';
        copy.title = 'Copy';
        copy.textContent = '⧉';
        copy.onclick = e => {
            e.stopPropagation();
            copyText(value, label);
        };
        row.appendChild(copy);
    }
    el.append(top, row);
    return el;
}

function renderDetails() {
    const root = $('#details');
    root.innerHTML = '';
    const item = state.items.find(i => i.id === state.selectedId);
    if (!item) {
        root.innerHTML = '<div class="details-empty">Select an item</div>';
        return;
    }

    const [bg, fg] = avatarFor(item.title);
    const head = document.createElement('div');
    head.className = 'detail-head';
    head.innerHTML = `
        <span class="avatar" style="background:${bg};color:${fg}">${(item.title || '?').slice(0, 1).toUpperCase()}</span>
        <div style="min-width:0">
            <div class="detail-title"><span id="detailTitle"></span>
                <button class="star" id="starBtn" title="Favorite">${item.favorite ? '★' : '☆'}</button>
            </div>
            <div class="detail-sub" id="detailSub"></div>
        </div>
        <span class="detail-type">${typeLabel(item.type)}</span>`;
    root.appendChild(head);
    $('#detailTitle', head).textContent = item.title || 'Untitled';
    $('#detailSub', head).textContent = item.type === 'card' ? (item.cardHolder || '') : (item.url || item.rpId || item.issuer || '');
    $('#starBtn', head).onclick = async () => {
        item.favorite = !item.favorite;
        item.updated = nowIso();
        await save();
        render();
    };

    if (item.username !== undefined || item.type !== 'card') {
        if (item.type !== 'card') root.appendChild(field('USERNAME', item.username));
    }

    if (item.type === 'password') {
        const pw = document.createElement('div');
        pw.className = 'field';
        pw.innerHTML = '<div class="field-label-row">PASSWORD</div>';
        const row = document.createElement('div');
        row.className = 'field-row';
        const val = document.createElement('div');
        val.className = 'field-value';
        let shown = false;
        val.textContent = '••••••••••••';
        const reveal = document.createElement('button');
        reveal.className = 'icon-btn';
        reveal.textContent = '👁';
        reveal.title = 'Show';
        reveal.onclick = () => {
            shown = !shown;
            val.textContent = shown ? (item.password || '—') : '••••••••••••';
        };
        const copy = document.createElement('button');
        copy.className = 'icon-btn';
        copy.textContent = '⧉';
        copy.title = 'Copy password';
        copy.onclick = () => copyText(item.password || '', 'Password');
        row.append(val, reveal, copy);
        pw.appendChild(row);
        const strength = document.createElement('div');
        strength.className = 'strength';
        const bar = document.createElement('div');
        bar.style.width = Math.min(100, ((item.password || '').length / 20) * 100) + '%';
        bar.style.background = isWeak(item) ? 'var(--danger)' : 'var(--accent)';
        strength.appendChild(bar);
        const label = document.createElement('div');
        label.className = 'strength-label';
        label.style.color = isWeak(item) ? 'var(--danger)' : 'var(--accent)';
        label.textContent = isWeak(item) ? 'WEAK' : 'STRONG';
        pw.append(strength, label);
        root.appendChild(pw);
    }

    if (item.type === 'totp') {
        const box = document.createElement('div');
        box.className = 'field';
        box.innerHTML = '<div class="field-label-row">TOTP</div>';
        const row = document.createElement('div');
        row.className = 'field-row';
        const code = document.createElement('div');
        code.className = 'field-value';
        code.id = 'totpCode';
        code.style.fontFamily = '"Cascadia Mono", monospace';
        code.style.fontSize = '24px';
        code.style.letterSpacing = '.08em';
        const ring = document.createElement('div');
        ring.id = 'totpRing';
        ring.style.cssText = 'width:42px;height:42px;border-radius:50%;background:conic-gradient(var(--accent) 0deg, var(--border) 0deg);display:grid;place-items:center;font-size:10px;color:var(--muted)';
        const copy = document.createElement('button');
        copy.className = 'icon-btn';
        copy.textContent = '⧉';
        copy.onclick = () => copyText(code.textContent.replace(/\s/g, ''), 'TOTP code');
        row.append(code, ring, copy);
        box.appendChild(row);
        root.appendChild(box);
        startTotp(item);
    }

    if (item.type === 'card') {
        root.appendChild(field('CARDHOLDER', item.cardHolder));
        const number = (item.cardNumber || '').replace(/\s+/g, '');
        const masked = number ? '•••• •••• •••• ' + number.slice(-4) : '—';
        const numField = document.createElement('div');
        numField.className = 'field';
        numField.innerHTML = '<div class="field-label-row">CARD NUMBER</div>';
        const row = document.createElement('div');
        row.className = 'field-row';
        const val = document.createElement('div');
        val.className = 'field-value';
        val.textContent = masked;
        let shown = false;
        const reveal = document.createElement('button');
        reveal.className = 'icon-btn';
        reveal.textContent = '👁';
        reveal.onclick = () => {
            shown = !shown;
            val.textContent = shown ? (item.cardNumber || '—') : masked;
        };
        const copy = document.createElement('button');
        copy.className = 'icon-btn';
        copy.textContent = '⧉';
        copy.onclick = () => copyText(item.cardNumber || '', 'Card number');
        row.append(val, reveal, copy);
        numField.appendChild(row);
        root.appendChild(numField);
        const grid = document.createElement('div');
        grid.className = 'grid2';
        grid.append(field('EXPIRY', item.cardExpiry, { copy: false }), field('CVV', '•••', { copy: false }));
        root.appendChild(grid);
    }

    if (item.type === 'passkey') {
        root.appendChild(field('RELYING PARTY', item.rpId));
        root.appendChild(field('CREDENTIAL ID', item.credentialId));
        if (item.privateKey) root.appendChild(field('PRIVATE KEY', item.privateKey));
    }

    if (item.type === 'totp' && item.secret) {
        root.appendChild(field('SECRET', item.secret));
    }

    if (item.notes) {
        const notes = document.createElement('div');
        notes.className = 'field';
        notes.innerHTML = '<div class="field-label-row">NOTES</div>';
        const val = document.createElement('div');
        val.className = 'field-value';
        val.textContent = item.notes;
        notes.appendChild(val);
        root.appendChild(notes);
    }

    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const main = document.createElement('button');
    main.className = 'btn primary';
    main.textContent = 'Copy ' + (
        item.type === 'card' ? 'card number' :
        item.type === 'passkey' ? 'credential ID' :
        item.type === 'totp' ? 'code' : 'password'
    );
    main.onclick = () => {
        if (item.type === 'card') copyText(item.cardNumber || '', 'Card number');
        else if (item.type === 'passkey') copyText(item.credentialId || '', 'Credential ID');
        else if (item.type === 'totp') copyText(($('#totpCode')?.textContent || '').replace(/\s/g, ''), 'TOTP code');
        else copyText(item.password || '', 'Password');
    };
    const edit = document.createElement('button');
    edit.className = 'btn ghost';
    edit.textContent = 'Edit item';
    edit.onclick = () => openEditor(item);
    actions.append(main, edit);
    root.appendChild(actions);
}

function renderHealth() {
    const weak = state.items.filter(isWeak).length;
    const expiring = state.items.filter(cardExpiring).length;
    $('#healthDetail').textContent = `${weak} weak · ${expiring} expiring`;
    const ring = document.querySelector('.health-ring');
    if (ring) ring.textContent = String(Math.max(0, 100 - weak * 7 - expiring * 5));
}

/* ---------- TOTP ---------- */
function base32Decode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    const clean = String(input || '').toUpperCase().replace(/[\s=-]/g, '');
    for (const ch of clean) {
        const v = alphabet.indexOf(ch);
        if (v < 0) continue;
        bits += v.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return new Uint8Array(bytes);
}

async function totpCode(secret, period = 30, digits = 6) {
    const keyBytes = base32Decode(secret);
    if (!keyBytes.length) return '';
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const counter = Math.floor(Date.now() / 1000 / period);
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(4, counter);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
    const offset = sig[sig.length - 1] & 0xf;
    const bin = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
    return String(bin % 10 ** digits).padStart(digits, '0');
}

function startTotp(item) {
    if (state.totpTimer) clearInterval(state.totpTimer);
    const tick = async () => {
        if (state.selectedId !== item.id || !$('#totpCode')) return;
        const code = await totpCode(item.secret);
        const el = $('#totpCode');
        if (el) el.textContent = code ? code.slice(0, 3) + ' ' + code.slice(3) : '—';
        const left = 30 - (Math.floor(Date.now() / 1000) % 30);
        const ring = $('#totpRing');
        if (ring) {
            ring.style.background = `conic-gradient(var(--accent) ${(left / 30) * 360}deg, var(--border) 0deg)`;
            ring.textContent = left + 's';
        }
    };
    tick();
    state.totpTimer = setInterval(tick, 1000);
}

/* ---------- clipboard / toast ---------- */
async function copyText(text, label = 'Item') {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
    showToast(label + ' copied');
    if (state.toastTimer) clearInterval(state.toastTimer);
    if (state.toastHide) clearTimeout(state.toastHide);
    let left = 10;
    const total = 10;
    $('#toastText').textContent = label + ' copied';
    $('#toastTimer').textContent = `clears in ${left}s`;
    $('#toastBar').style.width = '100%';
    $('#toast').classList.remove('hidden');
    state.toastTimer = setInterval(() => {
        left -= 1;
        $('#toastTimer').textContent = `clears in ${Math.max(0, left)}s`;
        $('#toastBar').style.width = Math.max(0, (left / total) * 100) + '%';
        if (left <= 0) {
            clearInterval(state.toastTimer);
            state.toastTimer = null;
            navigator.clipboard?.writeText('').catch(() => {});
            $('#toast').classList.add('hidden');
        }
    }, 1000);
}
function showToast(text) {
    $('#toastText').textContent = text;
}

/* ---------- editor ---------- */
function openEditor(item = null) {
    const isNew = !item;
    item = item ? { ...item } : { type: 'password', title: '', tags: [], favorite: false, updated: nowIso() };
    const modal = $('#modal');
    modal.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = isNew ? 'New item' : 'Edit item';
    modal.appendChild(h);

    const tabs = document.createElement('div');
    tabs.className = 'type-tabs';
    for (const t of ['password', 'passkey', 'totp', 'card']) {
        const b = document.createElement('button');
        b.className = 'type-tab' + (item.type === t ? ' active' : '');
        b.textContent = typeLabel(t);
        b.onclick = () => {
            item.type = t;
            $$('.type-tab', tabs).forEach(x => x.classList.toggle('active', x === b));
            renderFields();
        };
        tabs.appendChild(b);
    }
    modal.appendChild(tabs);

    const form = document.createElement('div');
    modal.appendChild(form);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn ghost';
    cancel.textContent = 'Cancel';
    cancel.onclick = closeModal;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn primary';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = async () => {
        item.title = (item.title || '').trim() || (typeLabel(item.type) + ' item');
        item.updated = nowIso();
        if (isNew) {
            item.id = uid();
            state.items.unshift(item);
            state.selectedId = item.id;
        } else {
            const idx = state.items.findIndex(x => x.id === item.id);
            if (idx >= 0) state.items[idx] = item;
        }
        await save();
        closeModal();
        render();
    };
    actions.append(cancel, saveBtn);
    modal.appendChild(actions);

    function input(label, key, type = 'text', placeholder = '') {
        const wrap = document.createElement('div');
        const l = document.createElement('label');
        l.className = 'field-label';
        l.textContent = label;
        const el = document.createElement('input');
        el.type = type;
        el.value = item[key] || '';
        el.placeholder = placeholder;
        el.oninput = () => { item[key] = el.value; };
        wrap.append(l, el);
        return wrap;
    }
    function textarea(label, key) {
        const wrap = document.createElement('div');
        const l = document.createElement('label');
        l.className = 'field-label';
        l.textContent = label;
        const el = document.createElement('textarea');
        el.value = item[key] || '';
        el.oninput = () => { item[key] = el.value; };
        wrap.append(l, el);
        return wrap;
    }
    function tagsInput() {
        const wrap = document.createElement('div');
        const l = document.createElement('label');
        l.className = 'field-label';
        l.textContent = 'TAGS (comma separated)';
        const el = document.createElement('input');
        el.value = (item.tags || []).join(', ');
        el.oninput = () => {
            item.tags = el.value.split(',').map(s => s.trim()).filter(Boolean);
        };
        wrap.append(l, el);
        return wrap;
    }

    function renderFields() {
        form.innerHTML = '';
        form.appendChild(input('TITLE', 'title', 'text', typeLabel(item.type) + ' name'));
        const grid = document.createElement('div');
        grid.className = 'grid2';
        if (item.type === 'card') {
            grid.append(input('CARDHOLDER', 'cardHolder'), input('EXPIRY (MM/YY)', 'cardExpiry', 'text', '12/29'));
            form.appendChild(grid);
            form.appendChild(input('CARD NUMBER', 'cardNumber', 'text', '•••• •••• •••• ••••'));
            form.appendChild(input('CVV', 'cardCvv', 'text', '123'));
        } else if (item.type === 'passkey') {
            grid.append(input('USERNAME', 'username'), input('RELYING PARTY', 'rpId', 'text', 'github.com'));
            form.appendChild(grid);
            form.appendChild(input('CREDENTIAL ID', 'credentialId'));
            form.appendChild(textarea('PRIVATE KEY / NOTES', 'privateKey'));
            const passkeyNote = document.createElement('div');
            passkeyNote.className = 'muted';
            passkeyNote.style.marginTop = '6px';
            passkeyNote.textContent = 'Passkeys are stored as secure records. This app does not perform WebAuthn sign-in.';
            form.appendChild(passkeyNote);
        } else if (item.type === 'totp') {
            grid.append(input('USERNAME', 'username'), input('ISSUER', 'issuer'));
            form.appendChild(grid);
            form.appendChild(input('TOTP SECRET (BASE32)', 'secret', 'text', 'JBSWY3DPEHPK3PXP'));
        } else {
            grid.append(input('USERNAME', 'username'), input('WEBSITE', 'url', 'text', 'https://'));
            form.appendChild(grid);
            form.appendChild(input('PASSWORD', 'password', 'password'));
        }
        form.appendChild(tagsInput());
        form.appendChild(textarea('NOTES', 'notes'));
    }
    renderFields();
    $('#modalBackdrop').classList.remove('hidden');
    setTimeout(() => $('input', modal)?.focus(), 30);
}

function closeModal() {
    $('#modalBackdrop').classList.add('hidden');
    $('#modal').innerHTML = '';
}

/* ---------- settings ---------- */
function openSettings() {
    const modal = $('#modal');
    modal.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = 'Settings';
    modal.appendChild(h);

    const lockWrap = document.createElement('div');
    const ll = document.createElement('label');
    ll.className = 'field-label';
    ll.textContent = 'AUTO-LOCK (MINUTES)';
    const lockInput = document.createElement('input');
    lockInput.type = 'number';
    lockInput.min = '1';
    lockInput.max = '60';
    lockInput.value = state.autoLockMinutes;
    lockInput.oninput = () => {
        state.autoLockMinutes = Math.max(1, Math.min(60, parseInt(lockInput.value, 10) || 5));
        resetAutoLock();
    };
    lockWrap.append(ll, lockInput);
    modal.appendChild(lockWrap);

    const pwLabel = document.createElement('label');
    pwLabel.className = 'field-label';
    pwLabel.textContent = 'CHANGE MASTER PASSWORD';
    const pw = document.createElement('input');
    pw.type = 'password';
    pw.placeholder = 'New master password';
    modal.append(pwLabel, pw);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn ghost wide';
    exportBtn.textContent = 'Export encrypted vault';
    exportBtn.onclick = () => {
        const record = localStorage.getItem(STORAGE_KEY);
        const blob = new Blob([record], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'personal-vault.json';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const eraseBtn = document.createElement('button');
    eraseBtn.className = 'btn danger wide';
    eraseBtn.textContent = 'Erase vault';
    eraseBtn.onclick = () => {
        if (confirm('Erase the vault permanently?')) {
            localStorage.removeItem(STORAGE_KEY);
            lock();
            showLock();
        }
    };

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn ghost';
    cancel.textContent = 'Close';
    cancel.onclick = closeModal;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn primary';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = async () => {
        if (pw.value) {
            if (pw.value.length < 8) {
                alert('Use at least 8 characters.');
                return;
            }
            const salt = crypto.getRandomValues(new Uint8Array(16));
            state.key = await deriveKey(pw.value, salt);
            state.salt = salt;
            await save();
        }
        closeModal();
        resetAutoLock();
    };
    actions.append(cancel, saveBtn);
    modal.append(exportBtn, eraseBtn, actions);
    $('#modalBackdrop').classList.remove('hidden');
}

/* ---------- events ---------- */
function bind() {
    $('#unlockBtn').onclick = unlock;
    $('#masterPassword').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
    $('#confirmPassword').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
    $('#resetVaultBtn').onclick = () => {
        if (confirm('Erase the vault permanently?')) {
            localStorage.removeItem(STORAGE_KEY);
            showLock();
        }
    };
    $('#lockBtn').onclick = lock;
    $('#settingsBtn').onclick = openSettings;
    $('#newItemBtn').onclick = () => openEditor(null);
    $('#searchInput').addEventListener('input', e => {
        state.search = e.target.value;
        renderList();
    });
    $$('.nav-item[data-filter]').forEach(btn => {
        btn.onclick = () => {
            state.filter = btn.dataset.filter;
            state.tag = null;
            state.search = '';
            $('#searchInput').value = '';
            render();
        };
    });
    $('#modalBackdrop').addEventListener('click', e => {
        if (e.target === $('#modalBackdrop')) closeModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && state.key) {
            e.preventDefault();
            $('#searchInput').focus();
        }
    });
    ['mousemove', 'keydown', 'click'].forEach(ev =>
        document.addEventListener(ev, () => resetAutoLock(), { passive: true })
    );
    window.addEventListener('beforeunload', () => {
        if (state.toastTimer) clearInterval(state.toastTimer);
    });
}

bind();
showLock();
