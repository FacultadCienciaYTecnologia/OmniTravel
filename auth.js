// El usuario que se abre debe corresponder exactamente a las credenciales enviadas.
(() => {
    'use strict';
    function matchesIdentifier(user, identifier) {
        const value = identifier.trim();
        return value.includes('@')
            ? typeof user?.email === 'string' && user.email.trim().toLowerCase() === value.toLowerCase()
            : typeof user?.dni === 'string' && user.dni === value;
    }

    async function authenticate(db, identifier, passwordHash) {
        const value = identifier.trim();
        if (!value || !passwordHash) throw new Error('Ingresa tu correo o documento y tu contraseña.');
        const field = value.includes('@') ? 'email' : 'dni';
        const lookup = field === 'email' ? value.toLowerCase() : value;
        // eq recibe el valor como dato, sin interpolarlo dentro de un filtro OR.
        const { data, error } = await db.from('usuarios').select('*')
            .eq(field, lookup).eq('password', passwordHash).limit(2);
        if (error) throw new Error('No se pudo verificar la cuenta. Intenta nuevamente.');
        if (!Array.isArray(data) || data.length !== 1 || !matchesIdentifier(data[0], value) || data[0].password !== passwordHash) {
            throw new Error('Credenciales incorrectas o cuenta no identificada de forma única.');
        }
        const user = data[0];
        if (typeof user.id !== 'string' || !user.id || !['estudiante', 'admin', 'superadmin'].includes(user.rol)) {
            throw new Error('La cuenta no tiene una identidad válida. Contacta con la administración.');
        }
        if (user.rol !== 'superadmin' && user.estado_aprobacion !== 'aprobado') {
            throw new Error('Su cuenta aún no ha sido aprobada por la administración.');
        }
        return user;
    }

    window.OmniAuth = { authenticate, matchesIdentifier };
})();
