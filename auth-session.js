// La identidad pertenece a esta pestaña. Nunca se recupera desde localStorage.
(() => {
    'use strict';
    const KEY = 'omni_session_v2';
    const MAX_AGE = 24 * 60 * 60 * 1000;
    const destinations = { estudiante: 'estudiante.html', admin: 'admin.html', superadmin: 'superadmin.html' };
    let principalId = null;

    function clearLegacy() {
        localStorage.removeItem('omni_user');
        localStorage.removeItem('omni_session_time');
    }

    function clear() {
        sessionStorage.removeItem(KEY);
        principalId = null;
        clearLegacy();
    }

    function validUser(user) {
        return !!(user && typeof user.id === 'string' && user.id &&
            Object.hasOwn(destinations, user.rol) && typeof user.email === 'string' &&
            (user.rol === 'superadmin' || user.estado_aprobacion === 'aprobado'));
    }

    function readRecord() {
        try {
            const record = JSON.parse(sessionStorage.getItem(KEY));
            const age = Date.now() - record?.startedAt;
            if (!validUser(record?.user) || !Number.isFinite(record.startedAt) || age < 0 || age >= MAX_AGE) {
                clear();
                return null;
            }
            if (principalId !== null && record.user.id !== principalId) {
                clear();
                return null;
            }
            principalId = record.user.id;
            return record;
        } catch {
            clear();
            return null;
        }
    }

    function start(user) {
        if (!validUser(user)) throw new Error('La cuenta no tiene una identidad o aprobación válida.');
        clear();
        const record = { user, startedAt: Date.now() };
        sessionStorage.setItem(KEY, JSON.stringify(record));
        principalId = user.id;
    }

    function verifyProfile(user) {
        const current = readRecord();
        if (!current || !validUser(user) || current.user.id !== user.id ||
            current.user.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
            clear();
            window.location.replace('index.html');
            throw new Error('La identidad de la sesión cambió. Inicia sesión nuevamente.');
        }
        return user;
    }

    function update(user) {
        verifyProfile(user);
        const record = readRecord();
        sessionStorage.setItem(KEY, JSON.stringify({ user, startedAt: record.startedAt }));
    }

    function requireRole(role) {
        const record = readRecord();
        if (!record || record.user.rol !== role) {
            window.location.replace('index.html');
            throw new Error('Se requiere una sesión válida para abrir este panel.');
        }
        return record.user;
    }

    // Las sesiones antiguas pueden proceder de una coincidencia facial equivocada.
    clearLegacy();
    window.OmniSession = { start, read: () => readRecord()?.user || null, update, clear, verifyProfile, requireRole,
        destination: role => Object.hasOwn(destinations, role) ? destinations[role] : null };
    window.addEventListener('pageshow', event => {
        if (event.persisted && principalId !== null && !readRecord()) window.location.replace('index.html');
    });
})();
