const test = require('node:test');
const assert = require('node:assert/strict');
const { user, database, environment } = require('./helpers.cjs');

function setup() {
    const env = environment();
    env.load('auth.js');
    return env.context.OmniAuth;
}

test('correo y contraseña abren exactamente la cuenta solicitada', async () => {
    const auth = setup();
    const db = database([user('A'), user('B')]);
    const result = await auth.authenticate(db, ' A@EXAMPLE.TEST ', 'hash:pass-A');
    assert.equal(result.id, 'A');
    assert.deepEqual(db.calls[0].filters, [['email', 'a@example.test'], ['password', 'hash:pass-A']]);
});

test('documento usa una comparación exacta, sin filtro OR interpolado', async () => {
    const auth = setup();
    const db = database([user('A'), user('B')]);
    assert.equal((await auth.authenticate(db, ' DOC-B ', 'hash:pass-B')).id, 'B');
    assert.equal(db.calls[0].filters[0][0], 'dni');
});

test('un correo con caracteres de filtro no amplía la búsqueda', async () => {
    const auth = setup();
    const db = database([user('A')]);
    const input = 'someone@example.test,email.eq.a@example.test';
    await assert.rejects(auth.authenticate(db, input, 'hash:pass-A'));
    assert.equal(db.calls[0].filters[0][1], input);
});

test('rechaza una fila devuelta de otra cuenta aunque comparta contraseña', async () => {
    const auth = setup();
    const db = database([], { respond: () => ({ data: [user('B', { password: 'hash:pass-A' })], error: null }) });
    await assert.rejects(auth.authenticate(db, 'a@example.test', 'hash:pass-A'), /no identificada/);
});

test('rechaza una contraseña incorrecta incluso si la respuesta contiene el correo esperado', async () => {
    const auth = setup();
    const db = database([], { respond: () => ({ data: [user('A')], error: null }) });
    await assert.rejects(auth.authenticate(db, 'a@example.test', 'wrong'));
});

test('rechaza correos o documentos duplicados en lugar de elegir la primera fila', async () => {
    const auth = setup();
    const db = database([user('A'), user('B', { email: 'a@example.test', password: 'hash:pass-A' })]);
    await assert.rejects(auth.authenticate(db, 'a@example.test', 'hash:pass-A'), /única/);
    assert.equal(db.calls[0].limit, 2);
});

test('no aprueba cuentas pendientes, roles desconocidos ni errores de consulta', async () => {
    const auth = setup();
    for (const row of [user('A', { estado_aprobacion: 'pendiente' }), user('A', { rol: 'otro' }), user('A', { id: null })]) {
        await assert.rejects(auth.authenticate(database([row]), 'a@example.test', 'hash:pass-A'));
    }
    await assert.rejects(auth.authenticate(database([], { error: true }), 'a@example.test', 'hash:pass-A'));
});

test('superadmin conserva el acceso y las credenciales vacías se rechazan', async () => {
    const auth = setup();
    assert.equal((await auth.authenticate(database([user('A', { rol: 'superadmin', estado_aprobacion: null })]), 'a@example.test', 'hash:pass-A')).id, 'A');
    await assert.rejects(auth.authenticate(database([]), '', 'hash:pass-A'));
    await assert.rejects(auth.authenticate(database([]), 'a@example.test', ''));
});
