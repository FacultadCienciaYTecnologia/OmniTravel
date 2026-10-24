// ====== SEGURIDAD Y CONFIGURACIÓN PROTEGIDA OMNITRAVEL ======
(function() {
    const _s = 'OMNI_TRAVEL_SECURITY_2026';
    function _d(b64, salt) {
        try {
            const bin = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
            let out = '';
            for (let i = 0; i < bin.length; i++) {
                out += String.fromCharCode(bin.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
            }
            return out;
        } catch (e) {
            console.error('Error decodificando configuración segura:', e);
            return '';
        }
    }

    const defaultUrl = _d('Jzk6OSxufW49Mj86KjYiOyQtLS8rVF9UWCc3OWcsISIgNCQ/On0mLA==', _s);
    const defaultKey = _d('KjQEIT0TMSgZLAYWBj8KZBwgHSoWXGIHVQwEeAA0JAoXFQ91cTY8CSUxehkwEFt6SFIXDyYQMhIoGwUMPxY9Dy8POwBiEDJGA1EEGXgtexkhNiwEcCgxASghZwg8NREvAXlbQSYuI3AsDgEIYAwhGSYncWE7BRcTL2toY18AJwt6EBA5cRsBCScePwYmGyQCbTxxeQR7JQg5Bxs/YQ8sADYSC3VtPxcYYRQKU1sEUykAAQYZABR2IzEVLjgKKgM5JmQubnhnWAYVAhslOxsGJg==', _s);

    const config = window.__OMNI_CONFIG__ || {};
    const supabaseUrl = config.supabaseUrl || defaultUrl;
    const supabaseKey = config.supabaseKey || defaultKey;

    // Inicializar cliente Supabase de forma segura
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        window.db = supabase.createClient(supabaseUrl, supabaseKey);
    } else {
        window.addEventListener('load', () => {
            if (typeof supabase !== 'undefined' && !window.db) {
                window.db = supabase.createClient(supabaseUrl, supabaseKey);
            }
        });
    }

    // Utilidades de Cifrado y Hash para seguridad de contraseñas y datos sensibles
    window.OmniSecurity = {
        hashPassword: function(plain) {
            if (typeof CryptoJS !== 'undefined') {
                return CryptoJS.SHA256(plain).toString();
            }
            return plain;
        },
        encryptData: function(text, key) {
            if (typeof CryptoJS !== 'undefined') {
                return CryptoJS.AES.encrypt(text, key || _s).toString();
            }
            return text;
        },
        decryptData: function(ciphertext, key) {
            if (typeof CryptoJS !== 'undefined') {
                try {
                    const bytes = CryptoJS.AES.decrypt(ciphertext, key || _s);
                    return bytes.toString(CryptoJS.enc.Utf8);
                } catch(e) {
                    return ciphertext;
                }
            }
            return ciphertext;
        }
    };
})();
