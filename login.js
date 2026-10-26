(() => {
    'use strict';
    const form = document.getElementById('login-email');
    const button = document.getElementById('btn-login-email');
    const identifier = document.getElementById('email');
    const password = document.getElementById('password');
    let attempt = 0;

    // Abrir el formulario siempre permite elegir la cuenta; no redirige a la persona anterior.
    OmniSession.clear();
    window.addEventListener('pagehide', () => { attempt++; });

    function restoreButton() {
        button.disabled = false;
        button.innerText = 'Ingresar al Sistema';
    }

    [identifier, password].forEach(input => input.addEventListener('input', () => {
        attempt++;
        restoreButton();
    }));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const token = ++attempt;
        const requestedIdentifier = identifier.value.trim();
        const requestedPassword = password.value;
        OmniSession.clear();
        button.disabled = true;
        button.innerText = 'Verificando...';
        try {
            const hash = CryptoJS.SHA256(requestedPassword).toString();
            const user = await OmniAuth.authenticate(window.db, requestedIdentifier, hash);
            if (token !== attempt) return;
            if (user.rol !== 'superadmin') {
                const { data, error } = await window.db.from('usuarios').select('id')
                    .eq('departamento', '__mantenimiento__').limit(1);
                if (token !== attempt) return;
                if (error || !Array.isArray(data)) throw new Error('No se pudo comprobar la disponibilidad del sistema. Intenta nuevamente.');
                if (data?.length) throw new Error('El sistema está en mantenimiento. Vuelva a intentar más tarde.');
            }
            await Swal.fire({ icon: 'success', title: '¡Bienvenido!', text: `Hola, ${user.nombre_completo}`, timer: 1200, showConfirmButton: false });
            if (token !== attempt) return;
            if (identifier.value.trim() !== requestedIdentifier || password.value !== requestedPassword) return;
            OmniSession.start(user);
            window.location.assign(OmniSession.destination(user.rol));
        } catch (error) {
            if (token !== attempt) return;
            OmniSession.clear();
            await Swal.fire('No se pudo ingresar', error.message || 'Intenta nuevamente.', 'error');
        } finally {
            if (token === attempt) restoreButton();
        }
    });
})();
