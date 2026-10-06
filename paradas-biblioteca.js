window.PARADAS_CODIGO = [
    { id: 'ugb-san-miguel', nombre: 'UGB San Miguel', lat: null, lng: null },
    { id: 'metrocentro-san-miguel', nombre: 'Metrocentro San Miguel', lat: null, lng: null }
];

function leerBiblioteca() {
    let extras = [];
    let ocultas = [];
    try {
        extras = JSON.parse(localStorage.getItem('omni_paradas_biblioteca') || '[]');
        ocultas = JSON.parse(localStorage.getItem('omni_paradas_ocultas') || '[]');
    } catch (e) { /* lista vacía */ }
    const mapa = {};
    (window.PARADAS_CODIGO || []).forEach((p) => { mapa[p.id] = Object.assign({}, p); });
    (extras || []).forEach((p) => { if (p && p.id) mapa[p.id] = p; });
    (ocultas || []).forEach((id) => { delete mapa[id]; });
    return Object.keys(mapa).map((id) => mapa[id]).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

function guardarParadaLocal(parada) {
    let extras = [];
    try { extras = JSON.parse(localStorage.getItem('omni_paradas_biblioteca') || '[]'); } catch (e) { extras = []; }
    const i = extras.findIndex((p) => p.id === parada.id);
    if (i >= 0) extras[i] = parada;
    else extras.push(parada);
    localStorage.setItem('omni_paradas_biblioteca', JSON.stringify(extras));
}

function ocultarParadaLocal(id) {
    let ocultas = [];
    let extras = [];
    try {
        ocultas = JSON.parse(localStorage.getItem('omni_paradas_ocultas') || '[]');
        extras = JSON.parse(localStorage.getItem('omni_paradas_biblioteca') || '[]');
    } catch (e) { /* sigue */ }
    if (ocultas.indexOf(id) === -1) ocultas.push(id);
    localStorage.setItem('omni_paradas_ocultas', JSON.stringify(ocultas));
    localStorage.setItem('omni_paradas_biblioteca', JSON.stringify(extras.filter((p) => p.id !== id)));
}

window.leerBiblioteca = leerBiblioteca;
window.guardarParadaLocal = guardarParadaLocal;
window.ocultarParadaLocal = ocultarParadaLocal;
