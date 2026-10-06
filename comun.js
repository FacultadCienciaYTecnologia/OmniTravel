const MARGEN_RUTA_METROS = 50;

function plazasPorTipo(tipo) {
    if (tipo === 'bus_50') return 50;
    if (tipo === 'microbus_16' || tipo === 'microbus_15') return 16;
    return 2;
}

function nombreTipoTransporte(tipo) {
    if (tipo === 'bus_50') return 'Autobús (50 plazas)';
    if (tipo === 'microbus_16' || tipo === 'microbus_15') return 'Microbús (16 plazas)';
    return 'Motocicleta (2 plazas)';
}

function escaparHtml(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function distanciaMetros(aLat, aLng, bLat, bLng) {
    const R = 6371000;
    const f1 = aLat * Math.PI / 180;
    const f2 = bLat * Math.PI / 180;
    const df = (bLat - aLat) * Math.PI / 180;
    const dl = (bLng - aLng) * Math.PI / 180;
    const a = Math.sin(df / 2) * Math.sin(df / 2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function leerParada(paradaId, ruta) {
    if (paradaId == null || paradaId === '') return null;
    try {
        const c = typeof paradaId === 'string' ? JSON.parse(paradaId) : paradaId;
        if (c && typeof c.lat === 'number' && typeof c.lng === 'number') return c;
    } catch (e) { /* índice antiguo */ }
    const idx = parseInt(paradaId, 10);
    if (!isNaN(idx) && ruta && ruta[idx]) return ruta[idx];
    return null;
}

function proyectarEnSegmento(lat, lng, a, b) {
    const cos = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) || 0.000001;
    const ax = a.lng * cos, ay = a.lat;
    const bx = b.lng * cos, by = b.lat;
    const px = lng * cos, py = lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qlng = (ax + t * dx) / cos;
    const qlat = ay + t * dy;
    return { lat: qlat, lng: qlng, dist: distanciaMetros(lat, lng, qlat, qlng) };
}

function puntoSobreRuta(lat, lng, puntos, margen) {
    if (!puntos || puntos.length < 2) return null;
    let mejor = null;
    for (let i = 0; i < puntos.length - 1; i++) {
        const proy = proyectarEnSegmento(lat, lng, puntos[i], puntos[i + 1]);
        if (!mejor || proy.dist < mejor.dist) mejor = proy;
    }
    const limite = margen == null ? MARGEN_RUTA_METROS : margen;
    if (!mejor || mejor.dist > limite) return null;
    return mejor;
}

function puntosDeRuta(ruta) {
    if (!Array.isArray(ruta)) return [];
    return ruta.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number');
}

function modoGpsDe(viaje) {
    const ruta = viaje && viaje.ruta;
    if (!Array.isArray(ruta)) return 'por_transporte';
    const meta = ruta.find((p) => p && p._meta === 'gps');
    return meta && meta.modo === 'caravana' ? 'caravana' : 'por_transporte';
}

function conModoGps(puntos, modo) {
    const limpios = puntosDeRuta(puntos);
    limpios.push({ _meta: 'gps', modo: modo === 'caravana' ? 'caravana' : 'por_transporte' });
    return limpios;
}

function clasificarSolicitud(row) {
    const e = String((row && row.estado) || '');
    if (e.indexOf('abordaje:') === 0) return { tipo: 'abordaje', nombre: e.slice(9), estado: 'pendiente' };
    if (e.indexOf('rechazo:') === 0) return { tipo: 'abordaje', nombre: e.slice(8), estado: 'rechazada' };
    return { tipo: 'en_ruta', nombre: 'Durante el viaje', estado: e || 'pendiente' };
}

function esLecturaMasNueva(a, b) {
    const ta = Date.parse((a && (a.creado_en || a.created_at)) || '') || 0;
    const tb = Date.parse((b && (b.creado_en || b.created_at)) || '') || 0;
    if (ta !== tb) return ta > tb;
    return String((a && a.id) || '') > String((b && b.id) || '');
}

function normalizarPuntos(lista) {
    if (!lista) return [];
    return lista.map((c) => ({
        lat: typeof c.lat === 'number' ? c.lat : c[0],
        lng: typeof c.lng === 'number' ? c.lng : c[1]
    })).filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number');
}

function htmlAsientos(plazas, celda) {
    if (plazas === 2) {
        return `
            <div class="bus-vertical-container bus-compacto">
                <div class="bus-v-front">
                    <div class="puesto-chofer"><div class="steering-wheel-v"></div><span>Chofer</span></div>
                </div>
                <div class="bus-v-row" style="justify-content:center;">
                    <div class="bus-v-group">${celda(1)}${celda(2)}</div>
                </div>
            </div>`;
    }
    if (plazas === 16) {
        return `<div class="bus-vertical-container">
            <div class="bus-v-front">
                <div class="puesto-chofer"><div class="steering-wheel-v"></div><span>Chofer</span></div>
                <div class="bus-v-group">${celda(1)}${celda(2)}${celda(3)}</div>
            </div>
            <div class="bus-v-row">
                <div class="bus-v-group" style="width:100%; justify-content:flex-end;">${celda(4)}${celda(5)}${celda(6)}</div>
            </div>
            <div class="bus-v-row">${celda(7)}<div class="bus-v-aisle"></div><div class="bus-v-group">${celda(8)}${celda(9)}</div></div>
            <div class="bus-v-row">${celda(10)}<div class="bus-v-aisle"></div><div class="bus-v-group">${celda(11)}${celda(12)}</div></div>
            <div class="bus-v-row" style="justify-content:space-between;">${celda(13)}${celda(14)}${celda(15)}${celda(16)}</div>
        </div>`;
    }
    let html = `<div class="bus-vertical-container">
        <div class="bus-v-front">
            <div class="puesto-chofer"><div class="steering-wheel-v"></div><span>Chofer</span></div>
        </div>`;
    for (let i = 1; i <= plazas; i += 4) {
        const topPair = `<div class="bus-v-group">${celda(i)}${celda(i + 1)}</div>`;
        const bottomPair = i === 49
            ? `<div class="bus-bano">Baño</div>`
            : `<div class="bus-v-group">${celda(i + 2)}${celda(i + 3)}</div>`;
        html += `<div class="bus-v-row">${topPair}<div class="bus-v-aisle"></div>${bottomPair}</div>`;
    }
    html += `</div>`;
    return html;
}

function iniciarMenuLateral() {
    const btn = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    function cerrar() {
        sidebar.classList.remove('abierto');
        if (overlay) overlay.classList.remove('abierto');
    }
    function alternar() {
        const abierto = sidebar.classList.toggle('abierto');
        if (overlay) overlay.classList.toggle('abierto', abierto);
    }
    if (btn) btn.addEventListener('click', alternar);
    if (overlay) overlay.addEventListener('click', cerrar);
    window.addEventListener('resize', () => { if (window.innerWidth > 860) cerrar(); });
    sidebar.querySelectorAll('.menu-item').forEach((item) => {
        item.addEventListener('click', () => {
            const destino = item.getAttribute('data-ir');
            if (destino) {
                const nodo = document.getElementById(destino);
                if (nodo) nodo.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (window.innerWidth <= 860) cerrar();
        });
    });
}

window.MARGEN_RUTA_METROS = MARGEN_RUTA_METROS;
window.plazasPorTipo = plazasPorTipo;
window.nombreTipoTransporte = nombreTipoTransporte;
window.escaparHtml = escaparHtml;
window.distanciaMetros = distanciaMetros;
window.leerParada = leerParada;
window.puntoSobreRuta = puntoSobreRuta;
window.puntosDeRuta = puntosDeRuta;
window.modoGpsDe = modoGpsDe;
window.conModoGps = conModoGps;
window.clasificarSolicitud = clasificarSolicitud;
window.esLecturaMasNueva = esLecturaMasNueva;
window.normalizarPuntos = normalizarPuntos;
window.htmlAsientos = htmlAsientos;
window.iniciarMenuLateral = iniciarMenuLateral;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarMenuLateral);
else iniciarMenuLateral();
