// ====== VERIFICAR SESIÓN ======
const session = JSON.parse(localStorage.getItem('omni_user'));
if (!session || session.rol !== 'estudiante') {
    window.location.href = 'index.html';
}
vigilarMantenimiento();
document.getElementById('user-name-display').innerText = `Hola, ${session.nombre_completo}`;
const profilePic = document.getElementById('nav-profile-pic');
if(profilePic) {
    profilePic.src = session.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.nombre_completo)}&background=random`;
}

function logout() {
    localStorage.removeItem('omni_user');
    window.location.href = 'index.html';
}

// ====== MAPA ESTUDIANTE ======
const map = L.map('student-map').setView([13.6929, -89.2182], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
let polylineRuta = null;
let busMarker = null;

// ====== CARGA DE DATOS ======
async function loadEstudianteDashboard(skipFetch = false) {
    window.croquisRendered = false;
    try {
        if(!skipFetch) {
            // Refrescar datos del usuario desde la BD
            const { data: user, error } = await window.db.from('usuarios').select('*').eq('id', session.id).single();
            if (error || !user) {
                // El usuario fue eliminado
                localStorage.removeItem('omni_user');
                window.location.href = 'index.html';
                return;
            }
            if(user) {
                if (user.rol !== 'superadmin' && user.estado_aprobacion !== 'aprobado') {
                    cerrarSesionNoAprobada();
                    return;
                }
                if(user.rol !== 'estudiante') {
                    Object.assign(session, user);
                    localStorage.setItem('omni_user', JSON.stringify(session));
                    window.location.href = 'index.html';
                    return;
                }
                Object.assign(session, user);
                localStorage.setItem('omni_user', JSON.stringify(session));
            }
        }

        let estado = session.estado_viaje || 'ninguno';

        if (estado === 'ninguno' || !session.viaje_id) {
            // == VISTA DE LOBBY (Lista de Viajes) ==
            document.getElementById('panel-lobby').style.display = 'block';
            document.getElementById('panel-viaje-activo').style.display = 'none';

            const { data: viajes } = await window.db.from('viajes').select('*').eq('inscripcion_abierta', true);
            const container = document.getElementById('lista-viajes-lobby');
            container.innerHTML = '';

            if (!viajes || viajes.length === 0) {
                container.innerHTML = `<div class="card" style="grid-column: 1 / -1;"><h3 style="color:var(--text-muted);">No hay viajes abiertos en este momento.</h3></div>`;
            } else {
                viajes.forEach(v => {
                    container.innerHTML += `
                        <div class="card text-center" style="border-top: 4px solid var(--accent);">
                            <h3 style="word-break: break-word;">${v.titulo}</h3>
                            <p class="text-muted" style="margin-bottom:15px;">Salida: ${textoFechaHora(v.fecha_salida)}</p>
                            <button class="btn btn-success w-100" onclick="anotarseViaje('${v.id}')">Anotarme a este viaje</button>
                        </div>
                    `;
                });
            }

        } else {
            // == VISTA DE VIAJE ACTIVO ==
            document.getElementById('panel-lobby').style.display = 'none';
            document.getElementById('panel-viaje-activo').style.display = 'block';
            setTimeout(() => { if(map) map.invalidateSize(); }, 300); // Fix para mapa dañado/gris al cambiar display

            // Obtener datos del viaje específico al que se anotó
            const { data: viaje } = await window.db.from('viajes').select('*').eq('id', session.viaje_id).single();
            if (!viaje) return; // Viaje fue eliminado

            window.currentViajeId = viaje.id;
            window.currentViajeData = viaje; // Guardar datos para validaciones GPS

            // Precargar paradas registradas en la base de datos para este viaje
            if (!window.cacheParadasMap) window.cacheParadasMap = {};
            try {
                const { data: paradasBd } = await window.db.from('paradas').select('*').eq('viaje_id', viaje.id);
                if (paradasBd && Array.isArray(paradasBd)) {
                    paradasBd.forEach((pb) => {
                        let det = null;
                        if (pb.detalle) {
                            try { det = typeof pb.detalle === 'string' ? JSON.parse(pb.detalle) : pb.detalle; } catch(e){}
                        }
                        window.cacheParadasMap[pb.id] = det || {
                            lat: Number(pb.latitud),
                            lng: Number(pb.longitud),
                            nombre: pb.nombre,
                            origen: 'ruta'
                        };
                    });
                }
            } catch (errP) {
                console.warn('Nota: precarga de paradas en caché:', errP);
            }

            document.getElementById('v-titulo').innerText = viaje.titulo;
            document.getElementById('v-fecha').innerText = `Fecha de Salida: ${textoFechaHora(viaje.fecha_salida)}`;
            cargarEvidencia();
            
            // Asistencia UI
            const panelAsistencia = document.getElementById('panel-asistencia');
            const btnAsis = document.getElementById('btn-asistencia');
            const btnCancAsis = document.getElementById('btn-cancelar-asistencia');
            const asisBadge = document.getElementById('asistencia-badge');

            if (session.transporte_id && (estado === 'asiento_elegido' || estado === 'asignado' || estado === 'sin_respaldo')) {
                if (panelAsistencia) panelAsistencia.style.display = 'block';
                if (session.abordo) {
                    if (btnAsis) btnAsis.style.display = 'none';
                    if (btnCancAsis) btnCancAsis.style.display = 'inline-block';
                    if (asisBadge) {
                        asisBadge.innerText = "🟢 Estás a bordo";
                        asisBadge.style.background = "var(--success)";
                        asisBadge.style.color = "white";
                    }
                    document.getElementById('badge-estado').innerText = "🟢 A bordo";
                    document.getElementById('badge-estado').style.background = "var(--success)";
                } else {
                    if (btnAsis) btnAsis.style.display = 'inline-block';
                    if (btnCancAsis) btnCancAsis.style.display = 'none';
                    if (asisBadge) {
                        asisBadge.innerText = "🔴 Aún no estás dentro";
                        asisBadge.style.background = "var(--error)";
                        asisBadge.style.color = "white";
                    }
                    document.getElementById('badge-estado').innerText = "🔴 Aún no dentro";
                    document.getElementById('badge-estado').style.background = "var(--error)";
                }
            } else {
                if (panelAsistencia) panelAsistencia.style.display = 'none';
            }

            // Datos del Transporte Asignado
            if (session.transporte_id) {
                const { data: transp } = await window.db.from('transportes').select('tipo, imagen_url').eq('id', session.transporte_id).single();
                if(transp) {
                    document.getElementById('v-transporte').innerText = 'Transporte: ' + nombreTipoTransporte(transp.tipo);
                    if(transp.imagen_url) {
                        document.getElementById('v-transporte-img').src = transp.imagen_url;
                        document.getElementById('v-transporte-img').style.display = 'block';
                    }
                }
            }

            // === CUENTA REGRESIVA ===
            if (window.countdownInterval) clearInterval(window.countdownInterval);
            const cdEl = document.getElementById('v-countdown');
            const departureTime = new Date(viaje.fecha_salida).getTime();
            
            window.countdownInterval = setInterval(() => {
                const now = new Date().getTime();
                const diff = departureTime - now;
                if (diff <= 0) {
                    if(cdEl) cdEl.innerText = "¡EL VIAJE HA COMENZADO!";
                    clearInterval(window.countdownInterval);
                } else {
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const secs = Math.floor((diff % (1000 * 60)) / 1000);
                    if(cdEl) cdEl.innerText = `Tiempo para salir: ${days}d ${hours}h ${mins}m ${secs}s`;
                }
            }, 1000);

            document.getElementById('panel-croquis').style.display = 'none';

            const guia = document.getElementById('guia-estudiante');
            const panelParada = document.getElementById('panel-parada');
            if (panelParada) panelParada.style.display = estado === 'asiento_elegido' ? 'block' : 'none';

            if (session.transporte_id && estado === 'anotado') {
                estado = 'asignado';
                session.estado_viaje = 'asignado';
                localStorage.setItem('omni_user', JSON.stringify(session));
                window.db.from('usuarios').update({ estado_viaje: 'asignado' }).eq('id', session.id);
            }

            if (estado === 'anotado') {
                document.getElementById('v-transporte').innerText = 'Transporte: pendiente de asignación';
                document.getElementById('v-transporte').style.color = '#f3e6c8';
                if (guia) guia.innerHTML = '<strong>Paso actual: espera de transporte</strong><p>Ya está anotado. El superadministrador indicará la unidad. Cuando eso ocurra podrá reservar asiento y, después, la parada de subida.</p>';
                cargarMiembrosGenerales(viaje.id);
            }
            const cardCroquis = document.getElementById('card-croquis-asientos');

            if (estado === 'asignado' || estado === 'asiento_elegido' || estado === 'sin_respaldo') {
                if (cardCroquis) cardCroquis.style.display = 'block';
                document.getElementById('panel-croquis').style.display = 'block';
                document.getElementById('v-transporte').style.color = 'var(--text)';
                
                cargarMiembros(session.transporte_id);
                cargarMiembrosGenerales(viaje.id);

                const inicio = new Date(viaje.inicio_asientos).getTime();
                const cierre = new Date(viaje.cierre_asientos).getTime();
                const timerDiv = document.getElementById('seat-timer-container');
                const croquisDiv = document.getElementById('croquis');
                
                if(window.seatTimerInterval) clearInterval(window.seatTimerInterval);
                
                function updateSeatTimer() {
                    const now = new Date().getTime();
                    
                    if (now < inicio) {
                        window.seleccionAsientosAbierta = false;
                        const diff = inicio - now;
                        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const s = Math.floor((diff % (1000 * 60)) / 1000);
                        timerDiv.style.display = 'block';
                        timerDiv.className = 'aviso aviso-info';
                        timerDiv.innerHTML = `La selección de asientos abre en ${d} d, ${h} h, ${m} min, ${s} s.`;
                        croquisDiv.innerHTML = `<div class="text-center text-muted" style="margin:20px;">El croquis se habilita al abrir la selección.</div>`;
                        if (guia && (estado === 'asignado' || estado === 'sin_respaldo')) guia.innerHTML = estado === 'sin_respaldo'
                            ? '<strong>Paso actual: asiento sin respaldar</strong><p>Le corresponden solo los asientos ' + textoAsientosSinRespaldo() + '. No tienen respaldar: son para sentarse.</p>'
                            : '<strong>Paso actual: espera de asientos</strong><p>Ya tiene transporte. Podrá elegir asiento cuando abra el horario indicado arriba.</p>';
                    }
                    else if (now >= inicio && now <= cierre) {
                        const diff = cierre - now;
                        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const s = Math.floor((diff % (1000 * 60)) / 1000);
                        
                        window.seleccionAsientosAbierta = true;
                        timerDiv.style.display = 'block';
                        timerDiv.className = 'aviso aviso-ok';
                        timerDiv.innerHTML = `Selección abierta. Cierra en ${d > 0 ? d + ' d, ' : ''}${h} h, ${m} min, ${s} s.`;
                        if (guia && (estado === 'asignado' || estado === 'sin_respaldo')) guia.innerHTML = estado === 'sin_respaldo'
                            ? '<strong>Paso actual: asiento sin respaldar</strong><p>Elija el ' + textoAsientosSinRespaldo().replace(' y ', ' o el ') + '. No tienen respaldar. La parada de subida se habilita después.</p>'
                            : '<strong>Paso actual: reserva de asiento</strong><p>Elija un asiento libre en el croquis. La parada de subida se habilita después.</p>';
                        
                        if(!window.croquisRendered) {
                            renderCroquisEstudiante(viaje.id, session.transporte_id);
                            window.croquisRendered = true;
                        }
                    } 
                    else {
                        window.seleccionAsientosAbierta = false;
                        timerDiv.style.display = 'block';
                        timerDiv.className = 'aviso aviso-cerrado';
                        timerDiv.innerHTML = 'El periodo de selección ha finalizado.';
                        
                        if(estado !== 'asiento_elegido') {
                            croquisDiv.innerHTML = `<p class="text-center" style="margin:20px;">Ya no puedes seleccionar asiento.</p>`;
                        } else {
                            // Ya eligió, mostrar croquis de solo lectura
                            if(!window.croquisRendered) {
                                renderCroquisEstudiante(viaje.id, session.transporte_id);
                                window.croquisRendered = true;
                            }
                        }
                    }
                }
                
                if (estado === 'asiento_elegido' && guia) {
                    const parada = leerParada(session.parada_id, puntosDeRuta(viaje.ruta));
                    const textoLugar = `Asiento ${session.asiento}`;
                    guia.innerHTML = parada
                        ? `<strong>Registro del viaje completo</strong><p>${escaparHtml(textoLugar)} y parada ${escaparHtml(parada.nombre || 'confirmada')}. El día de la salida confirme la asistencia en ese punto.</p>`
                        : `<strong>Paso actual: parada de subida</strong><p>El ${escaparHtml(textoLugar)} ya está reservado. Indique dónde va a subir. Si elige otro punto, queda pendiente de aprobación.</p>`;
                }
                updateSeatTimer();
                window.seatTimerInterval = setInterval(updateSeatTimer, 1000);
            }

        // Cargar Ruta en el Mapa siguiendo calles reales (OSRM / GPS)
        const puntosRuta = puntosDeRuta(viaje.ruta);
        if (puntosRuta.length > 0) {
            if(polylineRuta) {
                if(polylineRuta.getWaypoints) map.removeControl(polylineRuta);
                else map.removeLayer(polylineRuta);
                polylineRuta = null;
            }
            if(window.marcadoresEstudiante) {
                window.marcadoresEstudiante.forEach(m => map.removeLayer(m));
            }
            window.marcadoresEstudiante = [];

            // Inicializar geometría preliminar
            window.rutaGeometria = normalizarPuntos(puntosRuta);

            polylineRuta = trazarRutaConCalles(map, puntosRuta, {
                color: '#0e4c81',
                weight: 5,
                opacity: 0.9,
                onRutaCalculada: (info) => {
                    if (info && Array.isArray(info.coordenadas) && info.coordenadas.length > 0) {
                        window.rutaGeometria = normalizarPuntos(info.coordenadas);
                    }
                }
            });

            // Marcadores para paradas
            puntosRuta.forEach((p, idx) => {
                const esExtremo = idx === 0 || idx === puntosRuta.length - 1;
                const esOrigen = idx === 0;
                const m = L.circleMarker([p.lat, p.lng], {
                    radius: esExtremo ? 8.5 : 6,
                    color: '#0f172a',
                    fillColor: esOrigen ? '#10b981' : (idx === puntosRuta.length - 1 ? '#ef4444' : '#38bdf8'),
                    fillOpacity: 1,
                    weight: 2
                }).addTo(map).bindPopup(`<b>${escaparHtml(p.nombre || (esOrigen ? 'Origen' : 'Parada ' + (idx + 1)))}</b>`);
                window.marcadoresEstudiante.push(m);
            });

            llenarSelectorParadas(puntosRuta);
            map.off('click');
            map.on('click', function(e) { marcarPuntoSobreRuta(e.latlng); });
        } else {
            window.rutaGeometria = [];
        }

        if(session.transporte_id) {
            const { data: transporte } = await window.db.from('transportes').select('*').eq('id', session.transporte_id).single();
            if(transporte) {
                document.getElementById('v-transporte').innerText = 'Transporte: ' + nombreTipoTransporte(transporte.tipo);
                document.getElementById('v-transporte').style.color = '#fff';
            }
        }

        consultarSolicitudParada();

        } // Fin else (estado !== ninguno)

        // ====== SUSCRIPCIONES REALTIME ======
        if (!window.estudianteChannel) {
            window.estudianteChannel = window.db.channel('estudiante-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, (payload) => {
                    // Si el usuario fue eliminado
                    if (payload.eventType === 'DELETE' && payload.old && payload.old.id === session.id) {
                        localStorage.removeItem('omni_user');
                        Swal.fire('Cuenta Eliminada', 'Tu cuenta ya no está disponible. Serás redirigido.', 'error').then(() => {
                            window.location.href = 'index.html';
                        });
                        return;
                    }
                    
                    // Si mi propio usuario fue modificado por el admin/superadmin (ej. asignación de vehículo o cambio de rol)
                    if (payload.new && payload.new.id === session.id) {
                        if (payload.new.rol !== 'superadmin' && payload.new.estado_aprobacion !== 'aprobado') {
                            cerrarSesionNoAprobada();
                            return;
                        }
                        if(payload.new.rol !== 'estudiante') {
                            Object.assign(session, payload.new);
                            localStorage.setItem('omni_user', JSON.stringify(session));
                            Swal.fire('Rol Modificado', 'Tu rol ha sido cambiado. Serás redirigido.', 'info').then(() => {
                                window.location.href = 'index.html';
                            });
                            return;
                        }
                        Object.assign(session, payload.new);
                        localStorage.setItem('omni_user', JSON.stringify(session));
                        window.croquisRendered = false;
                        lastOccupiedStr = "";
                        loadEstudianteDashboard(true);
                    }  
                    // Si alguien más tomó asiento o el admin asignó a alguien
                    else if(window.currentViajeId && session.transporte_id) {
                        window.croquisRendered = false;
                        lastOccupiedStr = "";
                        renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
                    }
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes' }, () => {
                    loadEstudianteDashboard();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'paradas_intermitentes' }, (payload) => {
                    const fila = payload.new || payload.old;
                    if (fila && fila.usuario_id === session.id) consultarSolicitudParada();
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_logs' }, (payload) => {
                    const g = payload.new;
                    if (g && session.transporte_id && g.transporte_id === session.transporte_id) {
                        const lat = Number(g.latitud);
                        const lng = Number(g.longitud);
                        if (isFinite(lat) && isFinite(lng)) {
                            if (!busMarker) {
                                const busIcon = L.divIcon({
                                    className: 'custom-bus-icon',
                                    html: `<div style="background:#2563eb; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(37,99,235,0.7); border:2px solid #fff; font-size:16px;">🚌</div>`,
                                    iconSize: [30, 30],
                                    iconAnchor: [15, 15]
                                });
                                busMarker = L.marker([lat, lng], { icon: busIcon }).addTo(map).bindPopup('<b>Tu Transporte en Vivo</b>');
                            } else {
                                busMarker.setLatLng([lat, lng]);
                            }
                        }
                    }
                })
                .subscribe();

            if (!window.subAsientosRegistradaEstudiante) {
                window.subAsientosRegistradaEstudiante = true;
                suscribirAsientosEnVivo(() => {
                    if (window.currentViajeId && session.transporte_id) {
                        debouncedCroquisEstudiante(window.currentViajeId, session.transporte_id, false);
                    }
                });

                if (window.croquisInterval) clearInterval(window.croquisInterval);
                window.croquisInterval = setInterval(() => {
                    if (window.currentViajeId && session.transporte_id && document.getElementById('panel-croquis') && document.getElementById('panel-croquis').style.display !== 'none') {
                        debouncedCroquisEstudiante(window.currentViajeId, session.transporte_id, false);
                    }
                }, 3500);
            }
        }

    } catch (e) {
        console.error("Error", e);
    }
}

async function anotarseViaje(viajeId) {
    Swal.fire({
        title: '¿Anotarse a este viaje?',
        text: "Quedará anotado. El superadministrador asignará el transporte. Hasta entonces no podrá reservar asiento.",
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Sí, entrar'
    }).then(async (res) => {
        if(res.isConfirmed) {
            try {
                await window.db.from('usuarios').update({
                    viaje_id: viajeId,
                    estado_viaje: 'anotado',
                    transporte_id: null,
                    asiento: null
                }).eq('id', session.id);
                
                session.viaje_id = viajeId;
                session.estado_viaje = 'anotado';
                session.transporte_id = null;
                session.asiento = null;
                localStorage.setItem('omni_user', JSON.stringify(session));
                
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Anotado exitosamente', showConfirmButton: false, timer: 1500 });
                loadEstudianteDashboard();
            } catch(e) { Swal.fire('Error', 'Hubo un problema.', 'error'); }
        }
    });
}

async function cargarMiembros(transporteId) {
    const contenedor = document.getElementById('lista-miembros');
    contenedor.innerHTML = '';
    const { data: usuarios } = await window.db.from('usuarios').select('nombre_completo').eq('transporte_id', transporteId);
    
    if(usuarios && usuarios.length) {
        usuarios.forEach(u => {
            contenedor.innerHTML += `<span class="integrante-nombre">${escaparHtml(u.nombre_completo)}</span>`;
        });
    } else {
        contenedor.innerHTML = '<span class="text-muted">Nadie más está asignado a esta unidad.</span>';
    }
}

let firmaListaGeneral = '';
async function cargarMiembrosGenerales(viajeId) {
    const contenedor = document.getElementById('lista-general');
    if(!contenedor) return;
    const { data: usuarios } = await window.db.from('usuarios')
        .select('nombre_completo, rol')
        .eq('viaje_id', viajeId)
        .in('estado_viaje', ['anotado', 'asignado', 'asiento_elegido', 'sin_respaldo']);
    
    const firma = (usuarios || []).map((u) => u.nombre_completo + '|' + (u.rol || '')).sort().join(';');
    if (firma === firmaListaGeneral && contenedor.childElementCount) return;
    firmaListaGeneral = firma;
    contenedor.innerHTML = '';
    if(usuarios && usuarios.length > 0) {
        usuarios.forEach(u => {
            const personal = u.rol === 'admin' || u.rol === 'superadmin' ? ' integrante-personal' : '';
            contenedor.innerHTML += `<span class="integrante-nombre${personal}">${escaparHtml(u.nombre_completo)}</span>`;
        });
    } else {
        contenedor.innerHTML = '<span class="text-muted">Aún no hay nadie anotado.</span>';
    }
}

let croquisInterval = null;
let lastOccupiedStr = "";

let debouncedCroquisTimer = null;
function debouncedCroquisEstudiante(viajeId, transporteId, forzar = false) {
    if (debouncedCroquisTimer) clearTimeout(debouncedCroquisTimer);
    debouncedCroquisTimer = setTimeout(() => {
        if (forzar) lastOccupiedStr = "";
        renderCroquisEstudiante(viajeId, transporteId);
    }, 250);
}

async function renderCroquisEstudiante(viajeId, transporteId) {
    const croquisDiv = document.getElementById('croquis');
    if (!croquisDiv) return;
    
    const { data: t } = await window.db.from('transportes').select('tipo').eq('id', transporteId).single();
    if(!t) return;
    
    const { data: usuarios } = await window.db.from('usuarios').select('asiento, nombre_completo, rol').eq('transporte_id', transporteId).not('asiento', 'is', null);
    const asientosOcupadosInfo = {};
    const asientosOcupados = asientosOcupadosInfo;
    
    const occupiedIds = usuarios ? usuarios.map(u => u.asiento + '-' + u.nombre_completo).sort() : [];
    occupiedIds.push('MINE:' + (session.asiento || 'none'));
    const occupiedStr = JSON.stringify(occupiedIds);

    window.tipoTransporteEstudiante = t.tipo;
    const totalPlazasPrevias = plazasPorTipo(t.tipo);
    const formaLista = croquisFormaLista(croquisDiv, totalPlazasPrevias);
    if (formaLista && croquisDiv.innerHTML !== '' && lastOccupiedStr === occupiedStr) return; // Evitar parpadeos si no hay cambios
    lastOccupiedStr = occupiedStr;

    if(usuarios) {
        usuarios.forEach(u => { asientosOcupadosInfo[u.asiento] = u; }); window.asientosOcupadosEstudiante = asientosOcupadosInfo;
    }

    const miAsiento = session.asiento && String(session.asiento).startsWith('Parado') ? null : session.asiento;
    const standingBanner = '';

    const totalPlazas = plazasPorTipo(t.tipo);
    const seatEls = croquisDiv.querySelectorAll('.seat-v');

    // Actualización ultra rápida en-sitio (in-place) sin parpadeo si los asientos ya están en pantalla
    if (formaLista && seatEls.length === totalPlazas) {
        seatEls.forEach((el) => {
            const span = el.querySelector('span');
            const n = span ? parseInt(span.innerText) : null;
            if (!n) return;
            const esMio = (miAsiento == n.toString());
            const ocupante = asientosOcupados[n.toString()];
            el.className = 'seat-v' + (totalPlazas === 18 && esAsientoSinRespaldo(n) ? ' seat-banco' : '');
            if (esMio) {
                el.classList.add('selected');
                el.setAttribute('onclick', `selectSeat(this, ${n}, '')`);
                el.title = 'Tu asiento seleccionado';
            } else if (ocupante) {
                el.classList.add(ocupante.rol === 'admin' || ocupante.rol === 'superadmin' ? 'occupied-red' : 'occupied-blue');
                el.setAttribute('onclick', `selectSeat(this, ${n}, '${escaparHtml(ocupante.nombre_completo)}')`);
                el.title = `Ocupado por ${ocupante.nombre_completo}`;
            } else {
                el.setAttribute('onclick', `selectSeat(this, ${n}, '')`);
                el.title = `Asiento ${n} libre`;
            }
        });
        const banEl = croquisDiv.querySelector('.aviso');
        if (!banEl && standingBanner) {
            croquisDiv.insertAdjacentHTML('afterbegin', standingBanner);
        }
    } else {
        croquisDiv.innerHTML = standingBanner + htmlAsientos(totalPlazas, (n) => genSeat(n, asientosOcupados, miAsiento));
    }
}

function genSeat(numero, ocupadosInfo, miAsiento) {
    if(numero > 50 || numero <= 0 || !numero) return '';
    const esMio = (miAsiento == numero.toString());
    const ocupante = ocupadosInfo[numero.toString()];
    
    let clase = 'seat-v' + ((window.tipoTransporteEstudiante === 'microbus_16' || window.tipoTransporteEstudiante === 'microbus_15') && esAsientoSinRespaldo(numero) ? ' seat-banco' : '');
    let ocupanteNombre = '';
    
    if(esMio) {
        clase += ' selected';
    }
    else if(ocupante) {
        ocupanteNombre = ocupante.nombre_completo;
        if(ocupante.rol === 'admin' || ocupante.rol === 'superadmin') {
            clase += ' occupied-red';
        } else {
            clase += ' occupied-blue';
        }
    }

    return `<div class="${clase}" onclick="selectSeat(this, ${numero}, '${ocupanteNombre}')"><span>${numero}</span></div>`;
}

function esAsientoBanco(numero) {
    return esAsientoSinRespaldo(numero);
}

function designadoSinRespaldo() {
    return session.estado_viaje === 'sin_respaldo' || esAsientoSinRespaldo(session.asiento);
}

function selectSeat(seatElement, numero, ocupanteNombre) {
    const tipo = window.tipoTransporteEstudiante || '';
    const micro = tipo === 'microbus_16' || tipo === 'microbus_15';
    if (micro && designadoSinRespaldo() && !esAsientoBanco(numero)) {
        return Swal.fire('Asiento sin respaldar', 'Le corresponden solo los asientos ' + textoAsientosSinRespaldo() + '. No tienen respaldar: son para sentarse.', 'info');
    }
    if (micro && !designadoSinRespaldo() && esAsientoBanco(numero)) {
        return Swal.fire('No disponible', 'Los asientos ' + textoAsientosSinRespaldo() + ' no tienen respaldar y están reservados para las dos personas designadas. Elija otro asiento.', 'info');
    }
    if (!window.seleccionAsientosAbierta) {
        return Swal.fire('Fuera de horario', 'La selección de asientos no está abierta.', 'info');
    }
    if (seatElement.classList.contains('occupied-blue') || seatElement.classList.contains('occupied-red')) {
        return Swal.fire('Ocupado', `Este asiento ya fue tomado por: <b>${ocupanteNombre}</b>`, 'warning');
    }
    
    if (seatElement.classList.contains('selected')) {
        Swal.fire({
            title: `¿Liberar el Asiento ${numero}?`,
            text: "Te quedarás sin asiento asignado.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, liberar'
        }).then(async (res) => {
            if(res.isConfirmed) {
                try {
                    const vuelveBanco = esAsientoSinRespaldo(session.asiento);
                    const estadoLibre = vuelveBanco ? 'sin_respaldo' : 'asignado';
                    const { error } = await window.db.from('usuarios').update({ asiento: null, estado_viaje: estadoLibre, fecha_reserva: null }).eq('id', session.id);
                    if (error) throw error;
                    session.asiento = null;
                    session.estado_viaje = estadoLibre;
                    localStorage.setItem('omni_user', JSON.stringify(session));
                    Swal.fire('Asiento liberado', 'Puede elegir otro dentro del horario.', 'success');
                    notificarCambioAsiento(window.currentViajeId, session.transporte_id);
                    loadEstudianteDashboard(true);
                } catch(e) {}
            }
        });
        return;
    }

    const textoPareja = textoParejaAsiento(numero, tipo, window.asientosOcupadosEstudiante);
    const avisoBanco = micro && esAsientoBanco(numero) ? '<p><b>Este asiento no tiene respaldar.</b> Solo es para sentarse.</p>' : '';
    const estadoParejaHtml = `<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin-top:10px; font-size:0.88rem; color:#334155;">${escaparHtml(textoPareja)}</div>`;

    if (session.asiento) {
        Swal.fire({
            title: `¿Cambiar al Asiento ${numero}?`,
            html: `
                <div style="text-align: left; font-size: 0.95rem; line-height: 1.5;">
                    <p>Tu asiento anterior (<b>${session.asiento}</b>) quedará libre para otros compañeros.</p>
                    ${avisoBanco}
                    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 12px; border-radius: 4px; margin-top: 10px;">
                        <p style="margin: 0; color: #1e40af; font-weight: 600;">🤝 Actividad en Parejas (Jornada de Limpieza):</p>
                        <p style="margin: 4px 0 0 0; color: #1e3a8a; font-size: 0.88rem;">
                            Recuerda que la jornada se trabajará en <b>parejas</b>. La persona sentada a tu lado será tu compañero(a) de equipo para la actividad.
                        </p>
                    </div>
                    ${estadoParejaHtml}
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: 'var(--primary)',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, cambiar',
            cancelButtonText: 'Cancelar'
        }).then(async (res) => {
            if(res.isConfirmed) {
                try {
                    const libre = await puedeTomarAsiento(session.id, session.transporte_id, numero);
                    if (!libre.ok) {
                        lastOccupiedStr = "";
                        renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
                        return Swal.fire('No disponible', libre.motivo, 'warning');
                    }
                    const { error } = await window.db.from('usuarios').update({ asiento: numero.toString(), fecha_reserva: new Date().toISOString() }).eq('id', session.id);
                    if (error) throw error;
                    session.asiento = numero.toString();
                    localStorage.setItem('omni_user', JSON.stringify(session));
                    Swal.fire('¡Éxito!', 'Asiento cambiado.', 'success');
                    lastOccupiedStr = ""; // Forzar recargo
                    renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
                    notificarCambioAsiento(window.currentViajeId, session.transporte_id);
                } catch(e) {
                    Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error');
                    lastOccupiedStr = ""; 
                    renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
                }
            }
        });
        return;
    }

    Swal.fire({
        title: `¿Elegir Asiento ${numero}?`,
        html: `
            <div style="text-align: left; font-size: 0.95rem; line-height: 1.5;">
                <p>Estás seleccionando el <b>Asiento ${numero}</b>.</p>
                ${avisoBanco}
                <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 12px; border-radius: 4px; margin-top: 10px;">
                    <p style="margin: 0; color: #1e40af; font-weight: 600;">🤝 Actividad en Parejas (Jornada de Limpieza):</p>
                    <p style="margin: 4px 0 0 0; color: #1e3a8a; font-size: 0.88rem;">
                        Recuerda que la jornada se trabajará en <b>parejas</b>. La persona sentada a tu lado será tu compañero(a) de equipo para la actividad.
                    </p>
                </div>
                ${estadoParejaHtml}
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: 'var(--primary)',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, confirmar asiento',
        cancelButtonText: 'Cancelar'
    }).then(async (res) => {
        if(res.isConfirmed) {
            try {
                // Doble check para prevenir colisión (race condition)
                const libre = await puedeTomarAsiento(session.id, session.transporte_id, numero);
                if (!libre.ok) return Swal.fire('No disponible', libre.motivo, 'warning');

                const { error } = await window.db.from('usuarios').update({
                    asiento: numero.toString(),
                    estado_viaje: 'asiento_elegido',
                    fecha_reserva: new Date().toISOString()
                }).eq('id', session.id);
                if (error) throw error;
                
                session.asiento = numero.toString();
                session.estado_viaje = 'asiento_elegido';
                localStorage.setItem('omni_user', JSON.stringify(session));
                
                Swal.fire('Asiento reservado', 'Ahora indique la parada de subida.', 'success');
                notificarCambioAsiento(window.currentViajeId, session.transporte_id);
                loadEstudianteDashboard(true);
            } catch(e) { 
                Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error'); 
                lastOccupiedStr = ""; 
                renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
            }
        }
    });
}

function geometriaActiva() {
    if (window.rutaGeometria && window.rutaGeometria.length > 1) return window.rutaGeometria;
    const ruta = window.currentViajeData && window.currentViajeData.ruta;
    return puntosDeRuta(ruta || []);
}

function paradaSigueAprobada(solicitud, lat, lng, nombre) {
    if (!solicitud || String(solicitud.estado || '') !== 'aprobada') return false;
    const info = clasificarSolicitud(solicitud);
    if (nombresParadaIguales(info.nombre, nombre)) return true;
    const slat = Number(solicitud.lat);
    const slng = Number(solicitud.lng);
    return isFinite(slat) && isFinite(slng) && isFinite(Number(lat)) && isFinite(Number(lng)) && distanciaMetros(slat, slng, Number(lat), Number(lng)) <= 80;
}

async function llenarSelectorParadas(puntos) {
    const selectParadas = document.getElementById('parada-select');
    if (!selectParadas) return;
    let lista = puntosDeRuta(puntos);
    if (window.currentViajeId && window.db) {
        try {
            const solRes = await window.db.from('paradas_intermitentes').select('lat, lng, estado').eq('viaje_id', window.currentViajeId);
            const extRes = await window.db.from('paradas').select('id, nombre, latitud, longitud, detalle').eq('viaje_id', window.currentViajeId);
            const solicitudes = solRes.error ? null : (solRes.data || []);
            const extras = extRes.error ? [] : (extRes.data || []);
            const huerfanas = solicitudes ? extras.filter((p) => {
                const detalle = detalleDeParada(p.detalle);
                if (detalle && detalle.origen === 'elegida') return false;
                return !solicitudes.some((s) => paradaSigueAprobada(s, p.latitud, p.longitud, p.nombre));
            }) : [];
            if (huerfanas.length) {
                const antes = lista.length;
                lista = lista.filter((r, indice) => {
                    if (indice === 0) return true;
                    const sobra = huerfanas.some((p) => nombresParadaIguales(p.nombre, r.nombre) && distanciaMetros(Number(p.latitud), Number(p.longitud), Number(r.lat), Number(r.lng)) <= 80);
                    return !sobra;
                });
                if (lista.length !== antes && window.currentViajeData) {
                    await window.db.from('viajes').update({ ruta: lista }).eq('id', window.currentViajeId);
                    window.currentViajeData.ruta = lista;
                }
                const ids = huerfanas.map((p) => p.id).filter(Boolean);
                if (ids.length) {
                    await window.db.from('paradas').delete().in('id', ids);
                    const { data: gente } = await window.db.from('usuarios').select('id, parada_id').eq('viaje_id', window.currentViajeId).not('parada_id', 'is', null);
                    for (const persona of gente || []) {
                        const pid = String(persona.parada_id || '');
                        let quitar = ids.indexOf(pid) !== -1;
                        if (!quitar) {
                            try {
                                const datos = JSON.parse(pid);
                                quitar = huerfanas.some((p) => nombresParadaIguales(p.nombre, datos.nombre));
                            } catch (errJson) { quitar = false; }
                        }
                        if (quitar) await window.db.from('usuarios').update({ parada_id: null }).eq('id', persona.id);
                    }
                }
            }
            (extras || []).forEach((p) => {
                if (huerfanas.some((h) => h.id === p.id)) return;
                const lat = Number(p.latitud);
                const lng = Number(p.longitud);
                if (!isFinite(lat) || !isFinite(lng)) return;
                if (!(solicitudes || []).some((s) => paradaSigueAprobada(s, lat, lng, p.nombre))) return;
                const ya = lista.some((r) => nombresParadaIguales(r.nombre, p.nombre) || distanciaMetros(Number(r.lat), Number(r.lng), lat, lng) < 40);
                if (!ya) lista.push({ lat: lat, lng: lng, nombre: p.nombre || 'Parada aprobada', origen: 'solicitud' });
            });
        } catch (e) { /* la ruta del viaje sigue siendo la lista principal */ }
    }
    const actual = leerParada(session.parada_id, lista);
    selectParadas.innerHTML = '<option value="">Seleccione una parada</option>';
    lista.forEach((r) => {
        const nombre = r.nombre || 'Parada';
        const valor = encodeURIComponent(JSON.stringify({ lat: r.lat, lng: r.lng, nombre: nombre, origen: 'ruta' }));
        const esMisma = actual && (
            (Math.abs(Number(actual.lat) - Number(r.lat)) < 0.0002 && Math.abs(Number(actual.lng) - Number(r.lng)) < 0.0002) ||
            (actual.nombre && r.nombre && actual.nombre.trim().toLowerCase() === r.nombre.trim().toLowerCase())
        );
        const selected = esMisma ? ' selected' : '';
        selectParadas.innerHTML += `<option value="${valor}"${selected}>${escaparHtml(nombre)}</option>`;
    });
    selectParadas.innerHTML += '<option value="otro">Otro punto sobre la ruta</option>';
    const ayuda = document.getElementById('parada-otro-ayuda');
    selectParadas.onchange = () => {
        if (ayuda) ayuda.style.display = selectParadas.value === 'otro' ? 'block' : 'none';
    };
}

function marcarPuntoSobreRuta(latlng) {
    if (window.eligiendoParadaRuta) {
        confirmarParadaSeleccionada(latlng);
        return;
    }
    const select = document.getElementById('parada-select');
    if (!select || select.value !== 'otro') {
        Swal.fire('Parada de la ruta', 'Para la parada de subida elija "Otro punto sobre la ruta". Para una parada durante el viaje use "Solicitar parada en el mapa" y después haga clic cerca de la línea.', 'info');
        return;
    }
    const ajustado = puntoSobreRuta(latlng.lat, latlng.lng, geometriaActiva(), MARGEN_RUTA_METROS);
    if (!ajustado) {
        Swal.fire('Fuera de la ruta', 'Ese punto queda a más de 50 metros del recorrido. La caravana no se desvía.', 'warning');
        return;
    }
    window.puntoOtro = ajustado;
    if (window.markerIntermitente) map.removeLayer(window.markerIntermitente);
    window.markerIntermitente = L.marker([ajustado.lat, ajustado.lng]).addTo(map).bindPopup('Punto solicitado sobre la ruta').openPopup();
}

async function guardarParada() {
    if (session.estado_viaje !== 'asiento_elegido') {
        return Swal.fire('Asiento pendiente', 'Reserve su asiento antes de indicar la parada de subida.', 'info');
    }
    const select = document.getElementById('parada-select');
    const valor = select ? select.value : '';
    if (!valor) return Swal.fire('Parada', 'Seleccione una parada de este viaje.', 'warning');

    if (valor === 'otro') {
        if (!window.puntoOtro) {
            return Swal.fire('Punto no marcado', 'Marque el lugar sobre la línea del recorrido.', 'warning');
        }
        const { value: nombre } = await Swal.fire({
            title: 'Nombre del punto',
            input: 'text',
            inputPlaceholder: 'Ejemplo: El Delirio',
            showCancelButton: true,
            confirmButtonText: 'Enviar solicitud'
        });
        if (!nombre || !nombre.trim()) return;
        try {
            const { error } = await window.db.from('paradas_intermitentes').insert([{
                viaje_id: window.currentViajeId,
                usuario_id: session.id,
                lat: window.puntoOtro.lat,
                lng: window.puntoOtro.lng,
                estado: 'abordaje:' + nombre.trim().replace(/:/g, ' ')
            }]);
            if (error) throw error;
            Swal.fire('Solicitud enviada', 'La parada queda pendiente hasta que la administración la acepte.', 'success');
            consultarSolicitudParada();
        } catch (e) {
            console.error(e);
            Swal.fire('No se envió', 'No se pudo registrar la solicitud.', 'error');
        }
        return;
    }

    try {
        const datos = JSON.parse(decodeURIComponent(valor));
        const guardadoJson = JSON.stringify(datos);
        let paradaIdFinal = guardadoJson;

        // 1. Intentar actualizar directamente como JSON (por si la columna usuarios.parada_id es TEXT)
        const { error: errDirecto } = await window.db.from('usuarios').update({ parada_id: guardadoJson }).eq('id', session.id);

        if (errDirecto) {
            console.warn('Actualización directa con JSON falló (columna es UUID). Resolviendo mediante tabla paradas...', errDirecto);
            // La columna es UUID con FK a public.paradas(id)
            let paradaId = null;

            // Buscar si ya existe la parada en public.paradas para este viaje
            const { data: paradasViaje } = await window.db.from('paradas')
                .select('id, nombre, latitud, longitud')
                .eq('viaje_id', window.currentViajeId);

            if (paradasViaje && paradasViaje.length > 0) {
                const encontrada = paradasViaje.find((p) => {
                    const matchNombre = p.nombre && datos.nombre && p.nombre.trim().toLowerCase() === datos.nombre.trim().toLowerCase();
                    const latP = Number(p.latitud);
                    const lngP = Number(p.longitud);
                    const matchCoord = isFinite(latP) && isFinite(lngP) && distanciaMetros(latP, lngP, datos.lat, datos.lng) <= 80;
                    return matchNombre || matchCoord;
                });
                if (encontrada) paradaId = encontrada.id;
            }

            // Si aún no está registrada en public.paradas, insertarla
            if (!paradaId) {
                const { data: nuevaParada, error: errInsert } = await window.db.from('paradas').insert([{
                    viaje_id: window.currentViajeId,
                    nombre: datos.nombre || 'Parada',
                    latitud: datos.lat,
                    longitud: datos.lng,
                    detalle: JSON.stringify(Object.assign({}, datos, { origen: 'elegida' }))
                }]).select('id').single();

                if (errInsert) {
                    console.error('Error insertando en tabla paradas:', errInsert);
                    throw errDirecto;
                }
                if (nuevaParada) paradaId = nuevaParada.id;
            }

            if (paradaId) {
                const { error: errUuid } = await window.db.from('usuarios').update({ parada_id: paradaId }).eq('id', session.id);
                if (errUuid) throw errUuid;
                paradaIdFinal = paradaId;

                if (!window.cacheParadasMap) window.cacheParadasMap = {};
                window.cacheParadasMap[paradaId] = datos;
            } else {
                throw errDirecto;
            }
        }

        session.parada_id = paradaIdFinal;
        session.parada_detalle = datos;
        localStorage.setItem('omni_user', JSON.stringify(session));

        Swal.fire('Parada confirmada', datos.nombre || 'Parada registrada.', 'success');
        loadEstudianteDashboard(true);
    } catch (e) {
        console.error('Error al guardar parada:', e);
        Swal.fire('No se guardó', 'No se pudo confirmar la parada.', 'error');
    }
}

async function consultarSolicitudParada() {
    const estado = document.getElementById('parada-estado');
    if (!estado || !window.currentViajeId) return;
    const { data } = await window.db.from('paradas_intermitentes').select('*').eq('usuario_id', session.id).eq('viaje_id', window.currentViajeId);
    const abordaje = (data || []).map((row) => Object.assign({ row: row }, clasificarSolicitud(row))).filter((x) => x.tipo === 'abordaje');
    const parada = leerParada(session.parada_id, puntosDeRuta(window.currentViajeData && window.currentViajeData.ruta));
    const pendiente = abordaje.find((x) => x.estado === 'pendiente');
    if (pendiente) {
        estado.innerText = 'Solicitud pendiente: ' + (pendiente.nombre || 'punto sobre la ruta') + '.';
        return;
    }
    if (!parada && abordaje.some((x) => x.estado === 'rechazada')) {
        estado.innerText = 'La última solicitud fue rechazada. Puede elegir una parada de la ruta o marcar otro punto.';
        return;
    }
    estado.innerText = parada ? 'Parada confirmada: ' + (parada.nombre || 'punto registrado') + '.' : '';
}

loadEstudianteDashboard();

// ====== ASISTENCIA DE ESTUDIANTE ======
async function marcarAsistencia(abordo) {
    if (!session.id) return;
    const viaje = window.currentViajeData;
    if (!viaje) return Swal.fire('Viaje', 'No se encontraron datos del viaje activo.', 'warning');

    if (abordo) {
        // Verificar si es el día de la actividad
        const hoy = new Date();
        const hoyStr = hoy.toISOString().slice(0, 10);
        const fechaSalida = viaje.fecha_salida ? new Date(viaje.fecha_salida) : null;
        const fechaStr = fechaSalida ? fechaSalida.toISOString().slice(0, 10) : '';
        const esDia = hoyStr === fechaStr || (fechaSalida && hoy >= fechaSalida) || viaje.estado === 'en_ruta_ida' || viaje.estado === 'en_ruta' || viaje.estado === 'en_ruta_vuelta';

        if (!esDia && fechaSalida) {
            const fechaFormateada = fechaSalida.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const confirm = await Swal.fire({
                title: 'Confirmar asistencia',
                html: `<p>El día programado para esta actividad es el <b>${fechaFormateada}</b>.</p><p style="margin-top:8px;">¿Confirmas que ya estás a bordo de la unidad de transporte?</p>`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: 'var(--success)',
                confirmButtonText: 'Sí, ¡ya estoy a bordo!',
                cancelButtonText: 'Cancelar'
            });
            if (!confirm.isConfirmed) return;
        } else {
            const confirm = await Swal.fire({
                title: '¿Estás a bordo?',
                text: 'Se confirmará tu asistencia dentro de la unidad.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: 'var(--success)',
                confirmButtonText: 'Sí, ¡ya estoy a bordo!',
                cancelButtonText: 'Cancelar'
            });
            if (!confirm.isConfirmed) return;
        }

        let parada = leerParada(session.parada_id, puntosDeRuta(viaje.ruta)) || session.parada_detalle;
        if ((!parada || !isFinite(Number(parada.lat))) && session.parada_id) {
            try {
                const { data: filaParada } = await window.db.from('paradas').select('nombre, latitud, longitud').eq('id', session.parada_id).maybeSingle();
                if (filaParada) parada = { lat: Number(filaParada.latitud), lng: Number(filaParada.longitud), nombre: filaParada.nombre };
            } catch (e) { /* se valida abajo */ }
        }
        if (!parada || !isFinite(Number(parada.lat)) || !isFinite(Number(parada.lng))) {
            return Swal.fire('Parada de subida', 'Primero indique la parada en la que se va a subir. Solo puede elegir las paradas guardadas en este viaje.', 'warning');
        }
        const cerca = await validarCercaDePunto(parada, 50, 'Lejos de su parada', 'Para marcar que ya abordó debe estar a 50 metros o menos de ' + (parada.nombre || 'su parada de subida') + '.');
        if (!cerca) return;

        try {
            await window.db.from('usuarios').update({ abordo: true, asistencia_cancelada: false }).eq('id', session.id);
            session.abordo = true;
            session.asistencia_cancelada = false;
            localStorage.setItem('omni_user', JSON.stringify(session));
            Swal.fire({
                icon: 'success',
                title: '¡Asistencia Confirmada!',
                text: 'Has quedado registrado como A BORDO de la unidad.',
                timer: 2000,
                showConfirmButton: false
            });
            loadEstudianteDashboard();
        } catch(e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo registrar la asistencia.', 'error');
        }
    } else {
        const confirm = await Swal.fire({
            title: '¿Aún no estás dentro?',
            text: 'Se indicará que aún no has abordado el transporte.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Sí, aún no estoy dentro',
            cancelButtonText: 'Cancelar'
        });
        if (!confirm.isConfirmed) return;

        try {
            await window.db.from('usuarios').update({ abordo: false }).eq('id', session.id);
            session.abordo = false;
            localStorage.setItem('omni_user', JSON.stringify(session));
            Swal.fire('Actualizado', 'Se indicó que aún no estás dentro de la unidad.', 'info');
            loadEstudianteDashboard();
        } catch(e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo actualizar el estado.', 'error');
        }
    }
}

async function cancelarAsistencia() {
    return marcarAsistencia(false);
}

// ====== PARADAS DURANTE EL VIAJE ======
function iniciarSeleccionParada() {
    if (!window.currentViajeId) return Swal.fire('Atención', 'Aún no se ha cargado la ruta de su viaje.', 'warning');
    if (geometriaActiva().length < 2) return Swal.fire('Ruta', 'El recorrido todavía no está disponible en el mapa.', 'warning');
    window.eligiendoParadaRuta = !window.eligiendoParadaRuta;
    const btn = document.getElementById('btn-parada-ruta');
    const ayuda = document.getElementById('ayuda-parada-mapa');
    if (!window.eligiendoParadaRuta) {
        if (btn) btn.innerText = 'Solicitar parada en el mapa';
        if (ayuda) ayuda.innerText = 'Marque un punto cerca de la línea del recorrido. No tiene que ser su ubicación actual. Si queda a más de 50 metros de la ruta, no se envía. No sustituye la parada de subida.';
        return;
    }
    if (btn) btn.innerText = 'Cancelar selección';
    if (ayuda) ayuda.innerText = 'Selección activa. Haga clic en el mapa, cerca de la línea. El punto se acepta solo si queda a 50 metros o menos y se ajusta al recorrido.';
    const panel = document.getElementById('panel-mapa');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { if (map) map.invalidateSize(); }, 300);
}

async function confirmarParadaSeleccionada(latlng) {
    const ajustado = puntoSobreRuta(latlng.lat, latlng.lng, geometriaActiva(), MARGEN_RUTA_METROS);
    if (!ajustado) {
        Swal.fire('Fuera de la ruta', 'Ese punto queda a más de 50 metros del recorrido. Elija otro lugar más cerca de la línea. La caravana no se desvía.', 'warning');
        return;
    }
    if (window.markerSolicitudRuta) map.removeLayer(window.markerSolicitudRuta);
    window.markerSolicitudRuta = L.marker([ajustado.lat, ajustado.lng]).addTo(map).bindPopup('Punto elegido sobre la ruta').openPopup();
    const respuesta = await Swal.fire({
        title: 'Solicitar esta parada',
        text: 'El punto quedó sobre la ruta. Escriba el nombre del lugar para que la administración lo reconozca.',
        input: 'text',
        inputPlaceholder: 'Ejemplo: El Delirio',
        showCancelButton: true,
        confirmButtonText: 'Enviar solicitud',
        cancelButtonText: 'Elegir otro punto'
    });
    if (!respuesta.isConfirmed) return;
    const nombre = (respuesta.value || '').trim().replace(/:/g, ' ') || 'Punto sobre la ruta';
    try {
        const { error } = await window.db.from('paradas_intermitentes').insert([{
            viaje_id: window.currentViajeId,
            usuario_id: session.id,
            lat: ajustado.lat,
            lng: ajustado.lng,
            estado: 'en_ruta:' + nombre
        }]);
        if (error) throw error;
        window.eligiendoParadaRuta = false;
        const btn = document.getElementById('btn-parada-ruta');
        const ayuda = document.getElementById('ayuda-parada-mapa');
        if (btn) btn.innerText = 'Solicitar parada en el mapa';
        if (ayuda) ayuda.innerText = 'Solicitud enviada. La administración verá el punto que marcó sobre la ruta.';
        if (window.markerSolicitudRuta) window.markerSolicitudRuta.setPopupContent(nombre).openPopup();
        Swal.fire('Solicitud enviada', 'Quedó pendiente de aprobación en el punto que eligió.', 'success');
    } catch (e) {
        console.error(e);
        Swal.fire('No se envió', 'No se pudo registrar la solicitud.', 'error');
    }
}

function comprimirImagen(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const max = 1280;
            let w = img.width;
            let h = img.height;
            if (w > max || h > max) {
                const escala = Math.min(max / w, max / h);
                w = Math.round(w * escala);
                h = Math.round(h * escala);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('imagen'));
        };
        img.src = url;
    });
}

async function cargarEvidencia() {
    const estado = document.getElementById('evidencia-estado');
    const preview = document.getElementById('evidencia-preview');
    const acciones = document.getElementById('evidencia-acciones');
    if (!estado || !window.currentViajeId) return;
    const { data, error } = await window.db.from('evidencias').select('*').eq('usuario_id', session.id).eq('viaje_id', window.currentViajeId).limit(1);
    if (error) {
        estado.innerText = 'El envío de evidencias se habilita cuando se aplique la actualización de la base de datos.';
        if (acciones) acciones.style.display = 'none';
        return;
    }
    const fila = data && data[0];
    window.evidenciaActual = fila || null;
    function pintarAviso(clase, titulo, detalle) {
        estado.className = 'aviso-evidencia' + (clase ? ' ' + clase : '');
        estado.innerHTML = '<strong>' + escaparHtml(titulo) + '</strong><p>' + escaparHtml(detalle) + '</p>';
    }
    if (!fila) {
        pintarAviso('', 'Sin evidencia', 'Tome o suba una foto en la que se le vea recogiendo basura.');
        if (preview) preview.style.display = 'none';
        if (acciones) acciones.style.display = 'flex';
        return;
    }
    if (preview) {
        preview.src = fila.imagen;
        preview.style.display = 'block';
    }
    if (fila.estado === 'aprobada') {
        pintarAviso('aprobada', 'Participación aprobada', 'La fotografía fue aceptada. Su participación queda validada para U-VIBE y ya no se puede cambiar.');
        if (acciones) acciones.style.display = 'none';
    } else if (fila.estado === 'rechazada') {
        const motivo = fila.observacion ? fila.observacion : 'No se indicó un motivo.';
        pintarAviso('rechazada', 'Evidencia rechazada', 'Motivo: ' + motivo + ' Puede tomar o subir otra fotografía.');
        if (acciones) acciones.style.display = 'flex';
    } else {
        pintarAviso('pendiente', 'Evidencia en revisión', 'La fotografía está pendiente. Puede reemplazarla mientras no sea aprobada.');
        if (acciones) acciones.style.display = 'flex';
    }
}

async function enviarEvidencia(file) {
    if (!file || !window.currentViajeId) return;
    if (window.evidenciaActual && window.evidenciaActual.estado === 'aprobada') return;
    Swal.fire({ title: 'Preparando la fotografía', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const imagen = await comprimirImagen(file);
        const { error } = await window.db.from('evidencias').upsert([{
            usuario_id: session.id,
            viaje_id: window.currentViajeId,
            imagen: imagen,
            estado: 'pendiente',
            observacion: null,
            revisado_en: null
        }], { onConflict: 'usuario_id,viaje_id' });
        if (error) throw error;
        Swal.fire('Evidencia enviada', 'Quedó pendiente de revisión. Solo si se aprueba se valida la participación en U-VIBE.', 'success');
        cargarEvidencia();
    } catch (e) {
        console.error(e);
        Swal.fire('No se envió', 'No se pudo guardar la fotografía. Si la base aún no tiene la tabla de evidencias, hay que ejecutar el script antes.', 'error');
    }
}

const btnEvidenciaCamara = document.getElementById('btn-evidencia-camara');
const btnEvidenciaArchivo = document.getElementById('btn-evidencia-archivo');
if (btnEvidenciaCamara) btnEvidenciaCamara.addEventListener('click', () => document.getElementById('evidencia-camara').click());
if (btnEvidenciaArchivo) btnEvidenciaArchivo.addEventListener('click', () => document.getElementById('evidencia-archivo').click());
['evidencia-camara', 'evidencia-archivo'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('change', (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (file) enviarEvidencia(file);
    });
});
