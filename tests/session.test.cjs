const test = require('node:test');
const assert = require('node:assert/strict');
const { user, environment } = require('./helpers.cjs');

function setup(options) {
    const env = environment(options);
    env.load('auth-session.js');
    return { ...env, session: env.context.OmniSession };
}

test('elimina sesiones antiguas sin abrir la cuenta guardada', () => {
    const local = new Map([['omni_user', JSON.stringify(user('A'))], ['omni_session_time', '100000']]);
    const env = setup({ local });
    assert.equal(env.session.read(), null);
    assert.equal(local.size, 0);
});

test('dos pestañas del mismo navegador conservan identidades independientes', () => {
    const local = new Map();
    const a = setup({ local });
    const b = setup({ local });
    a.session.start(user('A'));
    b.session.start(user('B'));
    a.session.update(user('A', { asiento: '12' }));
    assert.equal(a.session.read().id, 'A');
    assert.equal(b.session.read().id, 'B');
    b.session.clear();
    assert.equal(a.session.read().id, 'A');
});

test('una pestaña antigua que escriba localStorage no cambia la identidad nueva', () => {
    const local = new Map();
    const env = setup({ local });
    env.session.start(user('B'));
    local.set('omni_user', JSON.stringify(user('A')));
    assert.equal(env.session.read().id, 'B');
});

test('un callback antiguo no puede sustituir la sesión de otro usuario', () => {
    const env = setup();
    env.session.start(user('B'));
    assert.throws(() => env.session.update(user('A')), /identidad/);
    assert.equal(env.session.read(), null);
    assert.equal(env.navigation.at(-1), 'index.html');
});

test('perfil de otra identidad se rechaza antes de copiarlo al panel', () => {
    const env = setup();
    env.session.start(user('A'));
    assert.throws(() => env.session.verifyProfile(user('B')), /identidad/);
    assert.equal(env.session.read(), null);
});

test('actualizar datos conserva el inicio de la sesión y expira a las 24 horas', () => {
    const env = setup();
    env.session.start(user('A'));
    env.advance(23 * 60 * 60 * 1000);
    env.session.update(user('A', { asiento: '7' }));
    assert.equal(env.session.read().asiento, '7');
    env.advance(60 * 60 * 1000);
    assert.equal(env.session.read(), null);
});

test('la recarga conserva la cuenta de la misma pestaña', () => {
    const storage = new Map();
    const first = setup({ session: storage });
    first.session.start(user('A'));
    const second = setup({ session: storage });
    assert.equal(second.session.requireRole('estudiante').id, 'A');
});

test('rechaza almacenamiento roto, fechas futuras y roles de otro panel', () => {
    const env = setup();
    env.context.sessionStorage.setItem('omni_session_v2', '{broken');
    assert.equal(env.session.read(), null);
    env.context.sessionStorage.setItem('omni_session_v2', JSON.stringify({ user: user('A'), startedAt: 99999999 }));
    assert.equal(env.session.read(), null);
    env.session.start(user('A'));
    assert.throws(() => env.session.requireRole('admin'), /sesión válida/);
});

test('no acepta una sesión no aprobada y verifica el correo al refrescar', () => {
    const env = setup();
    assert.throws(() => env.session.start(user('A', { estado_aprobacion: 'pendiente' })));
    env.session.start(user('A'));
    assert.throws(() => env.session.verifyProfile(user('A', { email: 'b@example.test' })));
});

test('volver con el historial a una página de una cuenta anterior exige nuevo acceso', () => {
    const env = setup();
    env.session.start(user('A'));
    env.context.sessionStorage.setItem('omni_session_v2', JSON.stringify({ user: user('B'), startedAt: 100000 }));
    env.events.pageshow({ persisted: true });
    assert.equal(env.navigation.at(-1), 'index.html');
    assert.equal(env.session.read(), null);
});
