const MARGEN_RUTA_METROS = 50;

const ZONA_HORARIA = 'America/El_Salvador';

function aDatetimeLocal(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor).slice(0, 16);
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: ZONA_HORARIA,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(d);
    const tomar = (tipo) => {
        const pieza = partes.find((p) => p.type === tipo);
        return pieza ? pieza.value : '';
    };
    let hora = tomar('hour');
    if (hora === '24') hora = '00';
    return tomar('year') + '-' + tomar('month') + '-' + tomar('day') + 'T' + hora + ':' + tomar('minute');
}

function desdeDatetimeLocal(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return texto;
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(texto)) return texto;
    return (texto.length === 16 ? texto + ':00' : texto) + '-06:00';
}

function textoFechaHora(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor);
    return d.toLocaleString('es-SV', {
        timeZone: ZONA_HORARIA,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function plazasPorTipo(tipo) {
    if (tipo === 'bus_50') return 50;
    if (tipo === 'microbus_16' || tipo === 'microbus_15') return 18;
    return 2;
}

function nombreTipoTransporte(tipo) {
    if (tipo === 'bus_50') return 'Autobús (50 plazas)';
    if (tipo === 'microbus_16' || tipo === 'microbus_15') return 'Microbús (18 plazas)';
    return 'Motocicleta (2 plazas)';
}

function escaparHtml(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function pedirUbicacionPrecisa() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('sin gps'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    });
}

async function validarCercaDePunto(punto, metros, titulo, detalle) {
    const lat = Number(punto && (punto.lat != null ? punto.lat : punto[0]));
    const lng = Number(punto && (punto.lng != null ? punto.lng : punto[1]));
    if (!isFinite(lat) || !isFinite(lng)) {
        if (window.Swal) await Swal.fire('Punto', 'Ese punto del recorrido no tiene coordenadas.', 'warning');
        return false;
    }
    let pos;
    try {
        pos = await pedirUbicacionPrecisa();
    } catch (e) {
        if (window.Swal) await Swal.fire('Ubicación', 'Active el GPS del dispositivo. Sin su ubicación no se puede continuar.', 'warning');
        return false;
    }
    const dist = distanciaMetros(pos.coords.latitude, pos.coords.longitude, lat, lng);
    if (dist > metros) {
        const base = detalle || ('Debe estar a ' + metros + ' metros o menos.');
        if (window.Swal) await Swal.fire(titulo || 'Muy lejos', base + ' Ahora está a unos ' + Math.round(dist) + ' m.', 'warning');
        return false;
    }
    return true;
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

function coordsDeParada(c) {
    if (!c || Array.isArray(c) || typeof c !== 'object') return null;
    const lat = Number(c.lat != null ? c.lat : c.latitud);
    const lng = Number(c.lng != null ? c.lng : c.longitud);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return {
        lat: lat,
        lng: lng,
        nombre: c.nombre ? String(c.nombre) : '',
        origen: c.origen || ''
    };
}

function anotarParadaEnCache(id, datos) {
    if (!id || !datos) return;
    if (!window.cacheParadasMap) window.cacheParadasMap = {};
    const coords = coordsDeParada(datos) || datos;
    window.cacheParadasMap[String(id)] = coords;
}

function leerParada(paradaId, ruta) {
    if (paradaId == null || paradaId === '') return null;
    if (typeof paradaId === 'object') {
        const directo = coordsDeParada(paradaId);
        if (directo) return directo;
    }
    const texto = String(paradaId).trim();
    try {
        const coords = coordsDeParada(JSON.parse(texto));
        if (coords) return coords;
    } catch (e) { /* índice antiguo o UUID */ }

    if (/^[0-9a-fA-F-]{36}$/.test(texto)) {
        if (window.cacheParadasMap && window.cacheParadasMap[texto]) {
            const cacheada = coordsDeParada(window.cacheParadasMap[texto]);
            if (cacheada) return cacheada;
        }
        if (Array.isArray(window.bibliotecaParadas)) {
            const b = window.bibliotecaParadas.find(x => x.id === texto);
            if (b) return { lat: Number(b.latitud || b.lat), lng: Number(b.longitud || b.lng), nombre: b.nombre || '', origen: 'ruta' };
        }
        try {
            const u = JSON.parse(localStorage.getItem('omni_user') || '{}');
            if (u && String(u.parada_id) === texto && u.parada_detalle) {
                const propia = coordsDeParada(u.parada_detalle);
                if (propia) return propia;
            }
        } catch (err) {}
        if (Array.isArray(ruta)) {
            const puntoRuta = ruta.find(p => p && p.id === texto);
            const deRuta = coordsDeParada(puntoRuta);
            if (deRuta) return deRuta;
        }
    }

    if (/^\d+$/.test(texto)) {
        const idx = parseInt(texto, 10);
        if (!isNaN(idx) && ruta && ruta[idx]) {
            const porIndice = coordsDeParada(ruta[idx]);
            if (porIndice) return porIndice;
        }
    }
    return null;
}

function describirParada(paradaId, ruta) {
    const parada = leerParada(paradaId, ruta);
    if (!parada || !isFinite(Number(parada.lat)) || !isFinite(Number(parada.lng))) return null;
    const nombre = parada.nombre && String(parada.nombre).trim() ? String(parada.nombre).trim() : 'Parada reservada';
    return { lat: Number(parada.lat), lng: Number(parada.lng), nombre: nombre, origen: parada.origen || '' };
}

async function precargarParadasViaje(viajeId) {
    if (!viajeId || !window.db) return;
    if (!window.cacheParadasMap) window.cacheParadasMap = {};
    try {
        const { data: paradasBd } = await window.db.from('paradas').select('id, nombre, latitud, longitud, detalle').eq('viaje_id', viajeId);
        (paradasBd || []).forEach((pb) => {
            const det = detalleDeParada(pb.detalle);
            const base = coordsDeParada(det) || {
                lat: Number(pb.latitud),
                lng: Number(pb.longitud),
                nombre: pb.nombre || '',
                origen: 'ruta'
            };
            if (!base.nombre && pb.nombre) base.nombre = pb.nombre;
            anotarParadaEnCache(pb.id, base);
        });
    } catch (e) {
        console.warn('No se pudieron precargar las paradas del viaje', e);
    }
}

async function guardarParadaUsuario(usuarioId, viajeId, datos) {
    const limpio = coordsDeParada(datos);
    if (!limpio) throw new Error('Parada sin coordenadas');
    const payload = {
        lat: limpio.lat,
        lng: limpio.lng,
        nombre: (datos && datos.nombre) || limpio.nombre || 'Parada',
        origen: (datos && datos.origen) || limpio.origen || 'ruta'
    };
    const guardadoJson = JSON.stringify(payload);
    let paradaIdFinal = guardadoJson;
    const { error: errDirecto } = await window.db.from('usuarios').update({ parada_id: guardadoJson }).eq('id', usuarioId);
    if (errDirecto) {
        let paradaId = null;
        const { data: paradasViaje } = await window.db.from('paradas').select('id, nombre, latitud, longitud').eq('viaje_id', viajeId);
        if (paradasViaje && paradasViaje.length) {
            const encontrada = paradasViaje.find((p) => {
                const matchNombre = nombresParadaIguales(p.nombre, payload.nombre);
                const latP = Number(p.latitud);
                const lngP = Number(p.longitud);
                const matchCoord = isFinite(latP) && isFinite(lngP) && distanciaMetros(latP, lngP, payload.lat, payload.lng) <= 80;
                return matchNombre || matchCoord;
            });
            if (encontrada) paradaId = encontrada.id;
        }
        if (!paradaId) {
            const { data: nuevaParada, error: errInsert } = await window.db.from('paradas').insert([{
                viaje_id: viajeId,
                nombre: payload.nombre,
                latitud: payload.lat,
                longitud: payload.lng,
                detalle: JSON.stringify(payload)
            }]).select('id').single();
            if (errInsert || !nuevaParada) throw errDirecto;
            paradaId = nuevaParada.id;
        }
        const { error: errUuid } = await window.db.from('usuarios').update({ parada_id: paradaId }).eq('id', usuarioId);
        if (errUuid) throw errUuid;
        paradaIdFinal = paradaId;
    }
    anotarParadaEnCache(paradaIdFinal, payload);
    return { paradaId: paradaIdFinal, datos: payload };
}

async function opcionesParadaViaje(viajeId, ruta) {
    const lista = puntosDeRuta(ruta).map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lng),
        nombre: r.nombre || 'Parada',
        origen: r.origen || 'ruta'
    }));
    if (!viajeId || !window.db) return lista;
    try {
        const solRes = await window.db.from('paradas_intermitentes').select('lat, lng, estado').eq('viaje_id', viajeId);
        const extRes = await window.db.from('paradas').select('nombre, latitud, longitud').eq('viaje_id', viajeId);
        const solicitudes = solRes.error ? [] : (solRes.data || []);
        (extRes.error ? [] : (extRes.data || [])).forEach((p) => {
            const lat = Number(p.latitud);
            const lng = Number(p.longitud);
            if (!isFinite(lat) || !isFinite(lng)) return;
            const aprobada = solicitudes.some((s) => String(s.estado || '') === 'aprobada' && isFinite(Number(s.lat)) && isFinite(Number(s.lng)) && distanciaMetros(Number(s.lat), Number(s.lng), lat, lng) <= 80);
            if (!aprobada) return;
            const ya = lista.some((r) => nombresParadaIguales(r.nombre, p.nombre) || distanciaMetros(Number(r.lat), Number(r.lng), lat, lng) < 40);
            if (!ya) lista.push({ lat: lat, lng: lng, nombre: p.nombre || 'Parada aprobada', origen: 'solicitud' });
        });
    } catch (e) { /* la ruta oficial sigue disponible */ }
    return lista;
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

function ordenarTransportes(lista) {
    return (lista || []).slice().sort((a, b) => {
        const fa = Date.parse(a && a.creado_en) || 0;
        const fb = Date.parse(b && b.creado_en) || 0;
        if (fa !== fb) return fb - fa;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });
}

function ordenarTransportesVisible(lista) {
    const peso = (tipo) => {
        if (tipo === 'bus_50') return 0;
        if (tipo === 'microbus_16' || tipo === 'microbus_15') return 1;
        return 2;
    };
    return ordenarTransportes(lista).sort((a, b) => peso(a.tipo) - peso(b.tipo));
}

function etiquetaTransporte(transporte, listaTransportes) {
    if (!transporte) return 'Sin asignar';
    const lista = ordenarTransportes(listaTransportes);
    const todosMismoTipo = lista.filter(t => t.tipo === transporte.tipo);
    const indexTipo = todosMismoTipo.findIndex(t => t.id === transporte.id);
    const num = indexTipo >= 0 ? indexTipo + 1 : 1;

    if (transporte.tipo === 'bus_50') return 'Bus ' + num;
    if (transporte.tipo === 'microbus_16' || transporte.tipo === 'microbus_15') {
        return todosMismoTipo.length > 1 ? 'Microbús ' + num : 'Microbús';
    }
    if (transporte.tipo === 'moto' || transporte.tipo === 'moto_2') {
        return todosMismoTipo.length > 1 ? 'Moto ' + num : 'Moto';
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
    const ta = Date.parse((a && (a.actualizado_en || a.creado_en || a.created_at)) || '') || 0;
    const tb = Date.parse((b && (b.actualizado_en || b.creado_en || b.created_at)) || '') || 0;
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

function parejaDeAsiento(numero, tipo) {
    const n = parseInt(numero, 10);
    if (!n) return null;
    if (tipo === 'bus_50') {
        if (n === 3) return 48;
        if (n === 48) return 3;
        if (n === 1) return 2;
        if (n === 2) return 1;
        if (n >= 4 && n <= 45) return n % 2 === 0 ? n + 1 : n - 1;
        return null;
    }
    if (tipo === 'microbus_16' || tipo === 'microbus_15') {
        const pares = { 1: 2, 2: 1, 3: 4, 4: 3, 6: 7, 7: 6, 8: 9, 9: 8, 10: 11, 11: 10, 12: 13, 13: 12, 14: 15, 15: 14, 16: 17, 17: 16 };
        return pares[n] || null;
    }
    return null;
}

function asientosSinRespaldo() {
    return [8, 12];
}

function esAsientoSinRespaldo(numero) {
    return asientosSinRespaldo().indexOf(parseInt(numero, 10)) !== -1;
}

function textoAsientosSinRespaldo() {
    const a = asientosSinRespaldo();
    return a[0] + ' y ' + a[1];
}

function textoParejaAsiento(numero, tipo, ocupantes) {
    const n = parseInt(numero, 10);
    const pareja = parejaDeAsiento(n, tipo);
    if (tipo === 'bus_50' && (n === 46 || n === 47 || n === 49 || n === 50)) {
        return 'Este puesto es de las autoridades. Con quién trabaja ese día se define en el lugar.';
    }
    if (!pareja) return 'La persona sentada a su lado será su pareja de trabajo.';
    const ocupante = ocupantes && ocupantes[String(pareja)];
    const quien = ocupante && ocupante.nombre_completo ? ocupante.nombre_completo : 'todavía libre';
    if (n === 3 || n === 48) {
        return 'Su pareja de trabajo es el asiento ' + pareja + ' (' + quien + '). El asiento 3 va con el 48.';
    }
    return 'Su pareja de trabajo es quien ocupe el asiento ' + pareja + ' (' + quien + ').';
}

function croquisFormaLista(croquisDiv, plazas) {
    if (!croquisDiv) return false;
    if (plazas === 50) return !!croquisDiv.querySelector('.bus-v');
    if (plazas === 18) return !!croquisDiv.querySelector('.micro-v-fila-pasillo');
    return true;
}

async function puedeTomarAsiento(usuarioId, transporteId, numero) {
    const { data: ocupante } = await window.db.from('usuarios').select('id, nombre_completo').eq('transporte_id', transporteId).eq('asiento', String(numero)).neq('id', usuarioId).limit(1);
    if (ocupante && ocupante.length) {
        return { ok: false, motivo: 'Ese asiento ya lo tiene ' + (ocupante[0].nombre_completo || 'otra persona') + '.' };
    }
    const { data: yo } = await window.db.from('usuarios').select('asiento, transporte_id').eq('id', usuarioId).maybeSingle();
    if (yo && yo.asiento && yo.transporte_id && yo.transporte_id !== transporteId) {
        return { ok: false, motivo: 'Ya tiene el asiento ' + yo.asiento + ' en otra unidad. Libérelo antes de tomar uno aquí. Cada persona tiene un solo asiento.' };
    }
    return { ok: true };
}

function htmlAsientos(plazas, celda) {
    const frente = `<div class="bus-h-col bus-h-front"><span class="bus-h-frente">Frente</span><div class="puesto-chofer"><div class="steering-wheel-v"></div><span>Chofer</span></div>`;
    if (plazas === 2) {
        return `<div class="croquis-scroll"><div class="bus-h bus-h-corto">${frente}</div><div class="bus-h-col">${celda(1)}${celda(2)}</div></div></div>`;
    }
    if (plazas === 18) {
        const banco = (n) => `<div class="micro-v-banco"><span>Sin respaldar</span>${celda(n)}</div>`;
        const fondo = [14, 15, 16, 17, 18].map((n) => celda(n)).join('');
        return `<div class="croquis-scroll"><div class="micro-v">
            <span class="micro-v-frente">Frente</span>
            <div class="micro-v-fila">
                <div class="puesto-chofer"><div class="steering-wheel-v"></div><span>Conductor</span></div>
                ${celda(1)}${celda(2)}
            </div>
            <div class="micro-v-fila micro-v-fila-pasillo">${celda(3)}${celda(4)}<span class="micro-v-puerta">Pasillo</span>${celda(5)}</div>
            <div class="micro-v-fila">${celda(6)}${celda(7)}${banco(8)}${celda(9)}</div>
            <div class="micro-v-fila">${celda(10)}${celda(11)}${banco(12)}${celda(13)}</div>
            <div class="micro-v-fondo">${fondo}</div>
        </div><p class="aviso aviso-info" style="margin-top:8px;">Los asientos ${textoAsientosSinRespaldo()} van en el pasillo. No tienen respaldar: solo son para sentarse. Quedan reservados para las dos personas designadas.</p></div>`;
    }
    if (plazas === 50) {
        const fila = (izq, der) => `<div class="bus-v-row"><div class="bus-v-group">${izq}</div><div class="bus-v-aisle"></div><div class="bus-v-group">${der}</div></div>`;
        let filas = fila(celda(1) + celda(2), celda(3));
        for (let n = 4; n <= 40; n += 4) {
            filas += fila(celda(n) + celda(n + 1), celda(n + 2) + celda(n + 3));
        }
        filas += fila(celda(44) + celda(45), '');
        const fondo = [46, 47, 48, 49, 50].map((n) => celda(n)).join('');
        return `<div class="croquis-scroll"><div class="bus-v">
            <div class="bus-v-frente"><div class="puesto-chofer"><div class="steering-wheel-v"></div><span>Conductor</span></div><span class="bus-v-puerta">Puerta</span></div>
            ${filas}
            <div class="bus-v-fondo">${fondo}</div>
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
        if (btn) {
            btn.innerHTML = 'Menú';
            btn.style.left = '12px';
        }
    }
    function alternar() {
        const abierto = sidebar.classList.toggle('abierto');
        if (overlay) overlay.classList.toggle('abierto', abierto);
        if (btn) {
            btn.innerHTML = abierto ? '✕' : 'Menú';
            btn.style.left = abierto ? 'min(240px, 78vw)' : '12px';
        }
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
        tiempo: nuevoPunto.tiempo || '',
        origen: nuevoPunto.origen || ''
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

function nombresParadaIguales(a, b) {
    const na = String(a || '').trim().toLowerCase();
    const nb = String(b || '').trim().toLowerCase();
    return !!(na && nb && na === nb);
}

function detalleDeParada(detalle) {
    if (!detalle) return null;
    if (typeof detalle === 'object') return detalle;
    try { return JSON.parse(detalle); } catch (e) { return null; }
}

async function retirarParadaSolicitada(viajeId, solicitud) {
    if (!viajeId || !solicitud || !window.db) return;
    const info = clasificarSolicitud(solicitud);
    const lat = Number(solicitud.lat);
    const lng = Number(solicitud.lng);
    let nombre = info.nombre && info.nombre !== 'Punto sobre la ruta' ? info.nombre : '';

    const { data: viaje } = await window.db.from('viajes').select('id, ruta').eq('id', viajeId).maybeSingle();
    const ruta = Array.isArray(viaje && viaje.ruta) ? viaje.ruta : [];
    if (!nombre && isFinite(lat) && isFinite(lng)) {
        let mejor = null;
        let mejorDist = 81;
        ruta.forEach((pt) => {
            const plat = Number(pt && pt.lat);
            const plng = Number(pt && pt.lng);
            if (!isFinite(plat) || !isFinite(plng)) return;
            const dist = distanciaMetros(plat, plng, lat, lng);
            if (dist < mejorDist) {
                mejorDist = dist;
                mejor = pt;
            }
        });
        if (mejor && mejor.nombre) nombre = mejor.nombre;
    }

    const coincide = (plat, plng, pnombre) => {
        const porNombre = nombresParadaIguales(pnombre, nombre);
        const dist = isFinite(Number(plat)) && isFinite(Number(plng)) && isFinite(lat) && isFinite(lng)
            ? distanciaMetros(Number(plat), Number(plng), lat, lng)
            : Infinity;
        if (porNombre && dist <= 80) return true;
        if (!nombre && dist <= 20) return true;
        return false;
    };

    if (viaje) {
        const rutaLimpia = ruta.filter((pt) => !coincide(pt && pt.lat, pt && pt.lng, pt && pt.nombre));
        if (rutaLimpia.length !== ruta.length) {
            await window.db.from('viajes').update({ ruta: rutaLimpia }).eq('id', viajeId);
        }
    }

    const { data: filas } = await window.db.from('paradas').select('id, nombre, latitud, longitud').eq('viaje_id', viajeId);
    const ids = (filas || []).filter((f) => coincide(f.latitud, f.longitud, f.nombre)).map((f) => f.id);
    if (ids.length) await window.db.from('paradas').delete().in('id', ids);

    const { data: gente } = await window.db.from('usuarios').select('id, parada_id').eq('viaje_id', viajeId).not('parada_id', 'is', null);
    for (const persona of gente || []) {
        const pid = String(persona.parada_id || '');
        let quitar = ids.indexOf(pid) !== -1;
        if (!quitar) {
            try {
                const datos = JSON.parse(pid);
                quitar = coincide(datos.lat, datos.lng, datos.nombre);
            } catch (e) { quitar = false; }
        }
        if (quitar) await window.db.from('usuarios').update({ parada_id: null }).eq('id', persona.id);
    }
}

async function agregarParadaAprobadaAViaje(viajeId, paradaAprobada) {
    if (!viajeId || !paradaAprobada || !window.db) return false;
    try {
        // Asegurar que exista en public.paradas si la tabla existe
        try {
            const { data: existente } = await window.db.from('paradas')
                .select('id, nombre')
                .eq('viaje_id', viajeId);
            const yaEsta = existente && existente.some((x) => {
                return x.nombre && paradaAprobada.nombre && x.nombre.trim().toLowerCase() === paradaAprobada.nombre.trim().toLowerCase();
            });
            if (!yaEsta) {
                await window.db.from('paradas').insert([{
                    viaje_id: viajeId,
                    nombre: paradaAprobada.nombre || 'Parada aprobada',
                    latitud: Number(paradaAprobada.lat),
                    longitud: Number(paradaAprobada.lng),
                    detalle: JSON.stringify({
                        lat: Number(paradaAprobada.lat),
                        lng: Number(paradaAprobada.lng),
                        nombre: paradaAprobada.nombre || 'Parada aprobada',
                        origen: 'solicitud'
                    })
                }]);
            }
        } catch (errParadas) {
            console.warn('Nota: sincronización con tabla paradas:', errParadas);
        }

        const { data: viaje, error } = await window.db.from('viajes').select('id, ruta').eq('id', viajeId).single();
        if (error || !viaje) return false;
        const rutaActual = puntosDeRuta(viaje.ruta);
        const nuevaLista = insertarPuntoEnRuta(rutaActual, {
            lat: Number(paradaAprobada.lat),
            lng: Number(paradaAprobada.lng),
            nombre: paradaAprobada.nombre || 'Parada aprobada',
            origen: 'solicitud'
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

const firmasCroquis = {};

function pintarCroquisVivo(croquisDiv, plazas, clave, occupiedStr, htmlNuevo, aplicarCelda) {
    if (!croquisDiv) return;
    const asientos = croquisDiv.querySelectorAll('.seat-v');
    const formaLista = croquisFormaLista(croquisDiv, plazas);
    if (formaLista && firmasCroquis[clave] === occupiedStr && asientos.length === plazas) return;
    firmasCroquis[clave] = occupiedStr;
    if (formaLista && asientos.length === plazas) {
        asientos.forEach((el) => {
            const span = el.querySelector('span');
            const n = span ? parseInt(span.innerText, 10) : 0;
            if (n) aplicarCelda(el, n);
        });
        return;
    }
    croquisDiv.innerHTML = htmlNuevo;
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

const MARCA_MANTENIMIENTO = '__mantenimiento__';

async function mantenimientoActivo() {
    const { data, error } = await window.db.from('usuarios').select('id').eq('departamento', MARCA_MANTENIMIENTO).limit(1);
    if (error) return false;
    return !!(data && data.length);
}

function mostrarPantallaMantenimiento() {
    if (document.getElementById('pantalla-mantenimiento')) return;
    const capa = document.createElement('div');
    capa.id = 'pantalla-mantenimiento';
    capa.setAttribute('role', 'alert');
    capa.style.cssText = 'position:fixed;inset:0;z-index:200000;background:#0c2340;color:#fff;display:flex;align-items:center;justify-content:center;padding:28px;text-align:center;font-family:"Source Sans 3",sans-serif;';
    capa.innerHTML = '<div style="max-width:440px;"><p style="letter-spacing:.08em;text-transform:uppercase;color:#d4c4a8;font-weight:700;margin:0 0 12px;">OmniTravel</p><h1 style="font-size:1.8rem;margin:0 0 12px;">Página en mantenimiento</h1><p style="margin:0;line-height:1.5;color:#d5dde6;">El sistema está cerrado temporalmente. Vuelva a intentar más tarde.</p></div>';
    document.body.appendChild(capa);
}

function vigilarMantenimiento() {
    const revisar = async () => {
        try {
            const activo = await mantenimientoActivo();
            if (activo) mostrarPantallaMantenimiento();
            else if (document.getElementById('pantalla-mantenimiento')) window.location.reload();
        } catch (e) {}
    };
    revisar();
    setInterval(revisar, 60000);
}

async function fijarMantenimiento(activo) {
    const sesion = JSON.parse(localStorage.getItem('omni_user') || '{}');
    if (!sesion.id) return { ok: false };
    if (activo) {
        const { data: actual } = await window.db.from('usuarios').select('departamento').eq('id', sesion.id).maybeSingle();
        if (actual && actual.departamento !== MARCA_MANTENIMIENTO) {
            localStorage.setItem('omni_depto_previo', actual.departamento || '');
        }
        const { error } = await window.db.from('usuarios').update({ departamento: MARCA_MANTENIMIENTO }).eq('id', sesion.id);
        return { ok: !error };
    }
    const previo = localStorage.getItem('omni_depto_previo') || null;
    const { data: marcados } = await window.db.from('usuarios').select('id').eq('departamento', MARCA_MANTENIMIENTO);
    for (const fila of marcados || []) {
        const valor = fila.id === sesion.id ? previo : null;
        const { error } = await window.db.from('usuarios').update({ departamento: valor }).eq('id', fila.id);
        if (error) return { ok: false };
    }
    localStorage.removeItem('omni_depto_previo');
    return { ok: true };
}

function cerrarSesionNoAprobada() {
    localStorage.removeItem('omni_user');
    localStorage.removeItem('omni_session_time');
    window.location.replace('index.html');
}

window.mantenimientoActivo = mantenimientoActivo;
window.mostrarPantallaMantenimiento = mostrarPantallaMantenimiento;
window.vigilarMantenimiento = vigilarMantenimiento;
window.fijarMantenimiento = fijarMantenimiento;
window.cerrarSesionNoAprobada = cerrarSesionNoAprobada;
window.aDatetimeLocal = aDatetimeLocal;
window.desdeDatetimeLocal = desdeDatetimeLocal;
window.textoFechaHora = textoFechaHora;
window.MARGEN_RUTA_METROS = MARGEN_RUTA_METROS;
window.parejaDeAsiento = parejaDeAsiento;
window.esAsientoSinRespaldo = esAsientoSinRespaldo;
window.textoAsientosSinRespaldo = textoAsientosSinRespaldo;
window.textoParejaAsiento = textoParejaAsiento;
window.croquisFormaLista = croquisFormaLista;
window.puedeTomarAsiento = puedeTomarAsiento;
window.plazasPorTipo = plazasPorTipo;
window.nombreTipoTransporte = nombreTipoTransporte;
window.escaparHtml = escaparHtml;
window.distanciaMetros = distanciaMetros;
window.validarCercaDePunto = validarCercaDePunto;
window.pintarCroquisVivo = pintarCroquisVivo;
window.leerParada = leerParada;
window.puntoSobreRuta = puntoSobreRuta;
window.puntosDeRuta = puntosDeRuta;
window.modoGpsDe = modoGpsDe;
window.conModoGps = conModoGps;
window.etiquetaTransporte = etiquetaTransporte;
window.ordenarTransportes = ordenarTransportes;
window.ordenarTransportesVisible = ordenarTransportesVisible;
window.clasificarSolicitud = clasificarSolicitud;
window.esLecturaMasNueva = esLecturaMasNueva;
window.normalizarPuntos = normalizarPuntos;
window.htmlAsientos = htmlAsientos;
window.iniciarMenuLateral = iniciarMenuLateral;
window.insertarPuntoEnRuta = insertarPuntoEnRuta;
window.agregarParadaAprobadaAViaje = agregarParadaAprobadaAViaje;
window.retirarParadaSolicitada = retirarParadaSolicitada;
window.nombresParadaIguales = nombresParadaIguales;
window.detalleDeParada = detalleDeParada;
window.iniciarCanalAsientos = iniciarCanalAsientos;
window.suscribirAsientosEnVivo = suscribirAsientosEnVivo;
window.notificarCambioAsiento = notificarCambioAsiento;
window.obtenerRutaCalles = obtenerRutaCalles;
window.trazarRutaConCalles = trazarRutaConCalles;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarMenuLateral);
else iniciarMenuLateral();

window.addEventListener('resize', () => {
    try {
        if (typeof map !== 'undefined' && map && map.invalidateSize) map.invalidateSize();
        if (typeof globalMap !== 'undefined' && globalMap && globalMap.invalidateSize) globalMap.invalidateSize();
        if (typeof routingMap !== 'undefined' && routingMap && routingMap.invalidateSize) routingMap.invalidateSize();
        if (typeof opMap !== 'undefined' && opMap && opMap.invalidateSize) opMap.invalidateSize();
        if (typeof paradasMap !== 'undefined' && paradasMap && paradasMap.invalidateSize) paradasMap.invalidateSize();
        if (typeof mapaParadasAdmin !== 'undefined' && mapaParadasAdmin && mapaParadasAdmin.invalidateSize) mapaParadasAdmin.invalidateSize();
    } catch (e) {}
});


