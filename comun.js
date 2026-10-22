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
    return 'sin_gps';
}

function conModoGps(puntos) {
    return puntosDeRuta(puntos);
}

function etiquetaTransporte(transporte, listaTransportes) {
    if (!transporte) return 'Sin asignar';
    const lista = listaTransportes || [];
    const todosMismoTipo = lista.filter(t => t.tipo === transporte.tipo);
    const indexTipo = todosMismoTipo.findIndex(t => t.id === transporte.id);
    const num = indexTipo >= 0 ? indexTipo + 1 : 1;
    
    if (transporte.tipo === 'bus_50') {
        return `Bus ${num}`;
    }
    if (transporte.tipo === 'microbus_16' || transporte.tipo === 'microbus_15') {
        return todosMismoTipo.length > 1 ? `Microbús ${num}` : 'Microbús';
    }
    if (transporte.tipo === 'moto' || transporte.tipo === 'moto_2') {
        return todosMismoTipo.length > 1 ? `Motocicleta ${num}` : 'Motocicletas';
    }
    return nombreTipoTransporte(transporte.tipo);
}

function clasificarSolicitud(row) {
    const e = String((row && row.estado) || '');
    if (e.indexOf('abordaje:') === 0) return { tipo: 'abordaje', nombre: e.slice(9), estado: 'pendiente' };
    if (e.indexOf('rechazo:') === 0) return { tipo: 'abordaje', nombre: e.slice(8), estado: 'rechazada' };
    if (e.indexOf('en_ruta:') === 0) return { tipo: 'en_ruta', nombre: e.slice(8) || 'Punto sobre la ruta', estado: 'pendiente' };
    return { tipo: 'en_ruta', nombre: 'Punto sobre la ruta', estado: e || 'pendiente' };
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
    const frente = `<div class="bus-h-col bus-h-front"><span class="bus-h-frente">Frente</span><div class="puesto-chofer"><div class="steering-wheel-v"></div><span>Chofer</span></div>`;
    if (plazas === 2) {
        return `<div class="croquis-scroll"><div class="bus-h bus-h-corto">${frente}</div><div class="bus-h-col">${celda(1)}${celda(2)}</div></div></div>`;
    }
    if (plazas === 16) {
        return `<div class="croquis-scroll"><div class="bus-h">${frente}${celda(1)}${celda(2)}${celda(3)}</div>
            <div class="bus-h-col bus-h-lado">${celda(4)}${celda(5)}${celda(6)}</div>
            <div class="bus-h-col">${celda(7)}<div class="bus-h-aisle"></div>${celda(8)}${celda(9)}</div>
            <div class="bus-h-col">${celda(10)}<div class="bus-h-aisle"></div>${celda(11)}${celda(12)}</div>
            <div class="bus-h-col">${celda(13)}${celda(14)}${celda(15)}${celda(16)}</div>
        </div></div>`;
    }
    let cols = '';
    for (let i = 1; i <= plazas; i += 4) {
        const derecha = i === 49 ? '<div class="bus-bano">Baño</div>' : `${celda(i + 2)}${celda(i + 3)}`;
        cols += `<div class="bus-h-col">${celda(i)}${celda(i + 1)}<div class="bus-h-aisle"></div>${derecha}</div>`;
    }
    return `<div class="croquis-scroll"><div class="bus-h">${frente}</div>${cols}</div></div>`;
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

// ====== GESTIÓN Y PERSISTENCIA DE PARADAS EN RUTA ======
function insertarPuntoEnRuta(puntos, nuevoPunto) {
    if (!Array.isArray(puntos)) puntos = [];
    const lista = puntosDeRuta(puntos);
    const nLat = Number(nuevoPunto.lat);
    const nLng = Number(nuevoPunto.lng);
    if (!isFinite(nLat) || !isFinite(nLng)) return lista;

    // Evitar duplicados si ya existe un punto a menos de 20 metros o idéntico
    const yaExiste = lista.some((p) => distanciaMetros(p.lat, p.lng, nLat, nLng) < 20);
    if (yaExiste) return lista;

    const item = {
        lat: nLat,
        lng: nLng,
        nombre: nuevoPunto.nombre || 'Parada',
        tiempo: nuevoPunto.tiempo || ''
    };

    if (lista.length < 2) {
        lista.push(item);
        return lista;
    }

    let mejorDist = Infinity;
    let mejorIdx = 0;
    for (let i = 0; i < lista.length - 1; i++) {
        const proy = proyectarEnSegmento(nLat, nLng, lista[i], lista[i + 1]);
        if (proy.dist < mejorDist) {
            mejorDist = proy.dist;
            mejorIdx = i;
        }
    }

    lista.splice(mejorIdx + 1, 0, item);
    return lista;
}

async function agregarParadaAprobadaAViaje(viajeId, paradaAprobada) {
    if (!viajeId || !paradaAprobada || !window.db) return false;
    try {
        const { data: viaje, error } = await window.db.from('viajes').select('id, ruta').eq('id', viajeId).single();
        if (error || !viaje) return false;
        const rutaActual = puntosDeRuta(viaje.ruta);
        const nuevaLista = insertarPuntoEnRuta(rutaActual, {
            lat: Number(paradaAprobada.lat),
            lng: Number(paradaAprobada.lng),
            nombre: paradaAprobada.nombre || 'Parada aprobada'
        });
        if (nuevaLista.length !== rutaActual.length) {
            const rutaFinal = conModoGps(nuevaLista, modoGpsDe(viaje));
            await window.db.from('viajes').update({ ruta: rutaFinal }).eq('id', viajeId);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error agregando parada al viaje:', e);
        return false;
    }
}

// ====== TIEMPO REAL: ASIGNACIÓN Y RESERVACIÓN DE ASIENTOS ======
let canalAsientosGlobal = null;
const listenersAsientos = new Set();

function iniciarCanalAsientos() {
    if (canalAsientosGlobal || !window.db) return canalAsientosGlobal;
    try {
        canalAsientosGlobal = window.db.channel('omni-asientos-live')
            .on('broadcast', { event: 'asiento_cambiado' }, (payload) => {
                listenersAsientos.forEach((fn) => {
                    try { fn(payload.payload || {}); } catch (e) { console.error(e); }
                });
            })
            .subscribe();
    } catch (e) {
        console.error('Error inicializando canal asientos:', e);
    }
    return canalAsientosGlobal;
}

function suscribirAsientosEnVivo(callback) {
    if (typeof callback === 'function') {
        listenersAsientos.add(callback);
    }
    iniciarCanalAsientos();
    return () => listenersAsientos.delete(callback);
}

function notificarCambioAsiento(viajeId, transporteId) {
    try {
        const canal = iniciarCanalAsientos();
        if (canal) {
            canal.send({
                type: 'broadcast',
                event: 'asiento_cambiado',
                payload: { viajeId, transporteId, ts: Date.now() }
            });
        }
    } catch (e) {
        console.error('Error notificando cambio de asiento:', e);
    }
}

// ====== SERVICIO DE ENRUTAMIENTO POR CALLES (OSRM / OPENSTREETMAP GPS) ======
const RUTA_CACHE = new Map();

async function obtenerRutaCalles(puntos) {
    if (!Array.isArray(puntos) || puntos.length < 2) return null;
    const pts = puntosDeRuta(puntos);
    if (pts.length < 2) return null;

    const cacheKey = pts.map(p => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`).join(';');
    if (RUTA_CACHE.has(cacheKey)) {
        return RUTA_CACHE.get(cacheKey);
    }

    const coordsStr = pts.map(p => `${p.lng},${p.lat}`).join(';');
    const servers = [
        `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`,
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`
    ];

    for (const url of servers) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6500);
            const resp = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!resp.ok) continue;
            const data = await resp.json();
            if (data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
                const route = data.routes[0];
                const rawCoords = route.geometry && route.geometry.coordinates;
                if (Array.isArray(rawCoords) && rawCoords.length > 0) {
                    const latlngs = rawCoords.map(c => [c[1], c[0]]);
                    const res = {
                        coordenadas: latlngs,
                        distanciaMetros: route.distance,
                        duracionSegundos: route.duration,
                        distanciaKm: (route.distance / 1000).toFixed(1),
                        duracionMin: Math.max(1, Math.round(route.duration / 60))
                    };
                    RUTA_CACHE.set(cacheKey, res);
                    return res;
                }
            }
        } catch (e) {
            // Continuar con el siguiente servidor de respaldo
        }
    }
    return null;
}

function trazarRutaConCalles(mapa, puntos, opciones = {}) {
    if (!mapa || !Array.isArray(puntos) || puntos.length < 2) return null;
    const pts = puntosDeRuta(puntos);
    if (pts.length < 2) return null;

    const color = opciones.color || '#0e4c81';
    const weight = opciones.weight || 5;
    const opacity = opciones.opacity != null ? opciones.opacity : 0.85;

    // Trazado base inicial inmediato
    const latlngsDirectos = pts.map(p => [p.lat, p.lng]);
    const polyline = L.polyline(latlngsDirectos, {
        color: color,
        weight: weight,
        opacity: opacity,
        dashArray: opciones.provisionalDash ? '6, 8' : undefined
    }).addTo(mapa);

    if (opciones.ajustarVista !== false) {
        mapa.fitBounds(polyline.getBounds(), { padding: opciones.padding || [28, 28] });
    }

    // Consulta asíncrona a OSRM para seguir las calles reales
    obtenerRutaCalles(pts).then((rutaInfo) => {
        if (rutaInfo && Array.isArray(rutaInfo.coordenadas) && rutaInfo.coordenadas.length > 0) {
            polyline.setLatLngs(rutaInfo.coordenadas);
            if (polyline.setStyle) {
                polyline.setStyle({ dashArray: null, color: color, weight: weight, opacity: opacity });
            }
            if (opciones.ajustarVista !== false) {
                mapa.fitBounds(polyline.getBounds(), { padding: opciones.padding || [28, 28] });
            }
            if (typeof opciones.onRutaCalculada === 'function') {
                opciones.onRutaCalculada(rutaInfo);
            }
        }
    }).catch((err) => {
        console.warn('Servicio de ruta OSRM no disponible en este momento, conservando trazo directo:', err);
    });

    return polyline;
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
window.etiquetaTransporte = etiquetaTransporte;
window.clasificarSolicitud = clasificarSolicitud;
window.esLecturaMasNueva = esLecturaMasNueva;
window.normalizarPuntos = normalizarPuntos;
window.htmlAsientos = htmlAsientos;
window.iniciarMenuLateral = iniciarMenuLateral;
window.insertarPuntoEnRuta = insertarPuntoEnRuta;
window.agregarParadaAprobadaAViaje = agregarParadaAprobadaAViaje;
window.iniciarCanalAsientos = iniciarCanalAsientos;
window.suscribirAsientosEnVivo = suscribirAsientosEnVivo;
window.notificarCambioAsiento = notificarCambioAsiento;
window.obtenerRutaCalles = obtenerRutaCalles;
window.trazarRutaConCalles = trazarRutaConCalles;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarMenuLateral);
else iniciarMenuLateral();

