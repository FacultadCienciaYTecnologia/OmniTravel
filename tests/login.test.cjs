const test = require('node:test');
const assert = require('node:assert/strict');
const { user, database, deferred, flush, environment } = require('./helpers.cjs');

function setup(options = {}) {
    const env = environment();
    const elements = new Map();
    for (const id of ['login-email', 'email', 'password', 'btn-login-email']) {
        const listeners = {};
        elements.set(id, { value: '', disabled: false, addEventListener: (event, callback) => { listeners[event] = callback; },
            emit: event => listeners[event]?.({ preventDefault() {} }) });
    }
    const alerts = [];
    env.context.document = { getElementById: id => elements.get(id) };
    env.context.CryptoJS = { SHA256: password => ({ toString: () => `hash:${password}` }) };
    env.context.Swal = { fire: (...args) => { alerts.push(args); return options.modal || Promise.resolve(); } };
    env.context.db = options.db || database([user('A'), user('B')]);
    env.load('auth-session.js');
    env.load('auth.js');
    env.load('login.js');
    return { ...env, elements, alerts, async submit(id) {
        elements.get('email').value = `${id.toLowerCase()}@example.test`;
        elements.get('password').value = `pass-${id}`;
        return elements.get('login-email').emit('submit');
    } };
}

test('guarda y abre únicamente la cuenta validada', async () => {
    const env = setup();
    await env.submit('B');
    assert.equal(env.context.OmniSession.read().id, 'B');
    assert.equal(env.navigation.at(-1), 'estudiante.html');
});

test('abrir el formulario no ejecuta un inicio automático', () => {
    const env = setup();
    assert.equal(env.navigation.length, 0);
    assert.equal(env.context.OmniSession.read(), null);
});

test('una respuesta lenta de A no sustituye el acceso posterior de B', async () => {
    const old = deferred();
    const db = database([], { respond: call => {
        if (call.filters.some(([field]) => field === 'departamento')) return { data: [], error: null };
        if (call.filters[0][1] === 'a@example.test') return old.promise;
        return { data: [user('B')], error: null };
    } });
    const env = setup({ db });
    const first = env.submit('A');
    await env.submit('B');
    old.resolve({ data: [user('A')], error: null });
    await first;
    assert.equal(env.context.OmniSession.read().id, 'B');
    assert.equal(env.navigation.length, 1);
});

test('editar las credenciales mientras se verifica cancela el intento anterior', async () => {
    const pending = deferred();
    const env = setup({ db: database([], { respond: () => pending.promise }) });
    const login = env.submit('A');
    env.elements.get('email').emit('input');
    pending.resolve({ data: [user('A')], error: null });
    await login;
    assert.equal(env.context.OmniSession.read(), null);
    assert.equal(env.navigation.length, 0);
});

test('un intento cancelado durante el mensaje de bienvenida no abre una cuenta antigua', async () => {
    const modal = deferred();
    const env = setup({ modal: modal.promise });
    const login = env.submit('A');
    await flush();
    env.elements.get('password').emit('input');
    modal.resolve();
    await login;
    assert.equal(env.context.OmniSession.read(), null);
    assert.equal(env.navigation.length, 0);
});

test('abandonar el formulario cancela una respuesta que llega después de navegar', async () => {
    const pending = deferred();
    const env = setup({ db: database([], { respond: () => pending.promise }) });
    const login = env.submit('A');
    env.events.pagehide();
    pending.resolve({ data: [user('A')], error: null });
    await login;
    assert.equal(env.context.OmniSession.read(), null);
    assert.equal(env.navigation.length, 0);
});

test('un cambio silencioso de autocompletado no abre las credenciales anteriores', async () => {
    const modal = deferred();
    const env = setup({ modal: modal.promise });
    const login = env.submit('A');
    await flush();
    env.elements.get('email').value = 'b@example.test';
    modal.resolve();
    await login;
    assert.equal(env.context.OmniSession.read(), null);
    assert.equal(env.navigation.length, 0);
});

test('error o mantenimiento dejan el navegador sin sesión', async () => {
    for (const fail of ['db', 'maintenance']) {
        const db = fail === 'db' ? database([], { error: true }) : database([user('A'), user('M', { departamento: '__mantenimiento__' })]);
        const env = setup({ db });
        await env.submit('A');
        assert.equal(env.context.OmniSession.read(), null);
        assert.equal(env.navigation.length, 0);
        assert.equal(env.elements.get('btn-login-email').disabled, false);
    }
});
