// ====== VERIFICAR SESIÓN ======
const session = JSON.parse(localStorage.getItem('omni_user'));
if (!session || session.rol !== 'estudiante') {
    window.location.href = 'index.html';
}
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

        const estado = session.estado_viaje || 'ninguno';

        if (estado === 'ninguno' || !session.viaje_id) {
            // == VISTA DE LOBBY (Lista de Viajes) ==
            document.getElementById('panel-lobby').style.display = 'block';
            document.getElementById('panel-viaje-activo').style.display = 'none';

            const { data: viajes } = await window.db.from('viajes').select('*').eq('inscripcion_abierta', true);
            const container = document.getElementById('lista-viajes-lobby');
            container.innerHTML = '';

            if (!viajes || viajes.length === 0) {
                container.innerHTML = `<div class="card" style="grid-column: 1 / -1;"><h3 style="color:var(--text-muted);">No hay viajes abiertos en este momento.</h3></div>`;
                return;
            }

            viajes.forEach(v => {
                container.innerHTML += `
                    <div class="card text-center" style="border-top: 4px solid var(--accent);">
                        <h3 style="word-break: break-word;">${v.titulo}</h3>
                        <p class="text-muted" style="margin-bottom:15px;">Salida: ${new Date(v.fecha_salida).toLocaleString()}</p>
                        <button class="btn btn-success w-100" onclick="anotarseViaje('${v.id}')">Anotarme a este viaje</button>
                    </div>
                `;
            });

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

            document.getElementById('v-titulo').innerText = viaje.titulo;
            document.getElementById('v-fecha').innerText = `Fecha de Salida: ${new Date(viaje.fecha_salida).toLocaleString()}`;
            cargarEvidencia();
            
            // Asistencia UI
            const panelAsistencia = document.getElementById('panel-asistencia');
            const btnAsis = document.getElementById('btn-asistencia');
            const btnCancAsis = document.getElementById('btn-cancelar-asistencia');

            if (estado === 'asiento_elegido') {
                panelAsistencia.style.display = 'block';
                if (session.abordo) {
                    btnAsis.style.display = 'none';
                    btnCancAsis.style.display = 'block';
                    document.getElementById('badge-estado').innerText = "Estás a bordo";
                    document.getElementById('badge-estado').style.background = "var(--success)";
                } else if (session.asistencia_cancelada) {
                    btnAsis.style.display = 'block';
                    btnCancAsis.style.display = 'none';
                    document.getElementById('badge-estado').innerText = "Asistencia Cancelada";
                    document.getElementById('badge-estado').style.background = "var(--error)";
                } else {
                    btnAsis.style.display = 'block';
                    btnCancAsis.style.display = 'none';
                    document.getElementById('badge-estado').innerText = "Asiento Confirmado";
                    document.getElementById('badge-estado').style.background = "var(--primary)";
                }
            } else {
                panelAsistencia.style.display = 'none';
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

            if (estado === 'anotado') {
                document.getElementById('v-transporte').innerText = 'Transporte: pendiente de asignación';
                document.getElementById('v-transporte').style.color = '#f3e6c8';
                if (guia) guia.innerHTML = '<strong>Paso actual: espera de transporte</strong><p>Ya está anotado. El superadministrador indicará la unidad. Cuando eso ocurra podrá reservar asiento y, después, la parada de subida.</p>';
                cargarMiembrosGenerales(viaje.id);
            }
            else if (estado === 'asignado' || estado === 'asiento_elegido') {
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
                        if (guia && estado === 'asignado') guia.innerHTML = '<strong>Paso actual: espera de asientos</strong><p>Ya tiene transporte. Podrá elegir asiento cuando abra el horario indicado arriba.</p>';
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
                    if (guia && estado === 'asignado') guia.innerHTML = '<strong>Paso actual: reserva de asiento</strong><p>Elija un asiento libre en el croquis. La parada de subida se habilita después.</p>';
                    
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
                guia.innerHTML = parada
                    ? `<strong>Registro del viaje completo</strong><p>Asiento ${escaparHtml(session.asiento)} y parada ${escaparHtml(parada.nombre || 'confirmada')}. El día de la salida confirme la asistencia en ese punto.</p>`
                    : `<strong>Paso actual: parada de subida</strong><p>El asiento ${escaparHtml(session.asiento)} ya está reservado. Indique dónde va a subir. Si elige otro punto, queda pendiente de aprobación.</p>`;
            }
            updateSeatTimer();
            window.seatTimerInterval = setInterval(updateSeatTimer, 1000);
        }

        // Cargar Ruta en el Mapa
        const puntosRuta = puntosDeRuta(viaje.ruta);
        if (puntosRuta.length > 0) {
            if(polylineRuta) {
                if(polylineRuta.getWaypoints) map.removeControl(polylineRuta);
                else map.removeLayer(polylineRuta);
            }

            const waypoints = puntosRuta.map(r => L.latLng(r.lat, r.lng));
            polylineRuta = L.Routing.control({
                waypoints: waypoints,
                routeWhileDragging: false,
                addWaypoints: false,
                draggableWaypoints: false,
                fitSelectedRoutes: true,
                show: false, // Ocultar panel de texto
                router: L.Routing.osrmv1({
                    serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1'
                }),
                createMarker: function(i, wp, nWps) {
                    const nombre = puntosRuta[i]?.nombre || `Parada ${i+1}`;
                    return L.marker(wp.latLng).bindPopup(`<b>${nombre}</b>`);
                }
            }).addTo(map);

            polylineRuta.on('routesfound', function(e) {
                const coords = e.routes && e.routes[0] && e.routes[0].coordinates;
                if (coords) window.rutaGeometria = normalizarPuntos(coords);
            });
            polylineRuta.on('routingerror', function() {
                map.removeControl(polylineRuta);
                const latlngs = puntosRuta.map(r => [r.lat, r.lng]);
                polylineRuta = L.polyline(latlngs, {color: 'var(--accent)', weight: 5}).addTo(map);
                map.fitBounds(polylineRuta.getBounds());
                window.rutaGeometria = normalizarPuntos(puntosRuta);
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

        const modoTxt = document.getElementById('gps-modo-texto');
        const modo = modoGpsDe(viaje);
        if (modoTxt) {
            modoTxt.innerText = modo === 'caravana'
                ? 'Modo caravana: se muestra la última ubicación recibida de cualquier unidad de este viaje.'
                : 'Modo por transporte: se muestra la ubicación de su unidad.';
        }
        iniciarSeguimiento(viaje);
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
                        lastOccupiedStr = ""; // Forzar recargo
                        renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
                        cargarMiembros(session.transporte_id);
                        cargarMiembrosGenerales(window.currentViajeId);
                    }
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes' }, () => {
                    loadEstudianteDashboard();
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_logs' }, (payload) => {
                    aplicarLecturaGps(payload.new);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'paradas_intermitentes' }, (payload) => {
                    const fila = payload.new || payload.old;
                    if (fila && fila.usuario_id === session.id) consultarSolicitudParada();
                })
                .subscribe();
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
    const { data: usuarios } = await window.db.from('usuarios').select('nombre_completo, foto_perfil').eq('transporte_id', transporteId);
    
    if(usuarios) {
        usuarios.forEach(u => {
            const src = u.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nombre_completo)}&background=random`;
            // Sin onclick para estudiantes (por privacidad)
            contenedor.innerHTML += `<img src="${src}" title="${u.nombre_completo}" style="width:35px;height:35px;border-radius:50%;object-fit:cover;border:1px solid #cbd5e1;">`;
        });
    }
}

async function cargarMiembrosGenerales(viajeId) {
    const contenedor = document.getElementById('lista-general');
    if(!contenedor) return;
    contenedor.innerHTML = '';
    const { data: usuarios } = await window.db.from('usuarios')
        .select('nombre_completo, foto_perfil, rol')
        .eq('viaje_id', viajeId)
        .in('estado_viaje', ['anotado', 'asignado', 'asiento_elegido']);
    
    if(usuarios && usuarios.length > 0) {
        usuarios.forEach(u => {
            const src = u.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nombre_completo)}&background=random`;
            const borderColor = u.rol === 'admin' ? 'var(--error)' : 'var(--accent)';
            contenedor.innerHTML += `<img src="${src}" title="${u.nombre_completo} (${u.rol})" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid ${borderColor};">`;
        });
    } else {
        contenedor.innerHTML = '<span class="text-muted">Aún no hay nadie anotado.</span>';
    }
}

let croquisInterval = null;
let lastOccupiedStr = "";

async function renderCroquisEstudiante(viajeId, transporteId) {
    const croquisDiv = document.getElementById('croquis');
    
    const { data: t } = await window.db.from('transportes').select('tipo').eq('id', transporteId).single();
    if(!t) return;
    
    const { data: usuarios } = await window.db.from('usuarios').select('asiento, nombre_completo, rol').eq('transporte_id', transporteId).not('asiento', 'is', null);
    const asientosOcupadosInfo = {};
    const asientosOcupados = asientosOcupadosInfo;
    
    const occupiedIds = usuarios ? usuarios.map(u => u.asiento + '-' + u.nombre_completo).sort() : [];
    const occupiedStr = JSON.stringify(occupiedIds);

    if (croquisDiv.innerHTML !== '' && lastOccupiedStr === occupiedStr) return; // Evitar parpadeos si no hay cambios
    lastOccupiedStr = occupiedStr;

    if(usuarios) {
        usuarios.forEach(u => { asientosOcupadosInfo[u.asiento] = u; });
    }

    const miAsiento = session.asiento;
    croquisDiv.innerHTML = htmlAsientos(plazasPorTipo(t.tipo), (n) => genSeat(n, asientosOcupados, miAsiento));
}

function genSeat(numero, ocupadosInfo, miAsiento) {
    if(numero > 50 || numero <= 0 || !numero) return '';
    const esMio = (miAsiento == numero.toString());
    const ocupante = ocupadosInfo[numero.toString()];
    
    let clase = 'seat-v';
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

function selectSeat(seatElement, numero, ocupanteNombre) {
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
                    const { error } = await window.db.from('usuarios').update({ asiento: null, estado_viaje: 'asignado', fecha_reserva: null }).eq('id', session.id);
                    if (error) throw error;
                    session.asiento = null;
                    session.estado_viaje = 'asignado';
                    localStorage.setItem('omni_user', JSON.stringify(session));
                    Swal.fire('Asiento liberado', 'Puede elegir otro dentro del horario.', 'success');
                    loadEstudianteDashboard(true);
                } catch(e) {}
            }
        });
        return;
    }

    if (session.asiento) {
        Swal.fire({
            title: `¿Cambiar al Asiento ${numero}?`,
            text: "Tu asiento anterior quedará libre para otros.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, cambiar'
        }).then(async (res) => {
            if(res.isConfirmed) {
                try {
                    const { data: check } = await window.db.from('usuarios').select('id').eq('transporte_id', session.transporte_id).eq('asiento', numero.toString()).neq('id', session.id).limit(1);
                    if (check && check.length > 0) {
                        lastOccupiedStr = "";
                        renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
                        return Swal.fire('No disponible', 'Ese asiento acaba de ser tomado por otra persona.', 'error');
                    }
                    const { error } = await window.db.from('usuarios').update({ asiento: numero.toString(), fecha_reserva: new Date().toISOString() }).eq('id', session.id);
                    if (error) throw error;
                    session.asiento = numero.toString();
                    localStorage.setItem('omni_user', JSON.stringify(session));
                    Swal.fire('¡Éxito!', 'Asiento cambiado.', 'success');
                    lastOccupiedStr = ""; // Forzar recargo
                    renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
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
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, elegir'
    }).then(async (res) => {
        if(res.isConfirmed) {
            try {
                // Doble check para prevenir colisión (race condition)
                const { data: check } = await window.db.from('usuarios').select('id').eq('transporte_id', session.transporte_id).eq('asiento', numero.toString()).limit(1);
                if (check && check.length > 0) {
                    return Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error');
                }

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

function llenarSelectorParadas(puntos) {
    const selectParadas = document.getElementById('parada-select');
    if (!selectParadas) return;
    const lista = puntosDeRuta(puntos);
    const actual = leerParada(session.parada_id, lista);
    selectParadas.innerHTML = '<option value="">Seleccione una parada</option>';
    lista.forEach((r) => {
        const nombre = r.nombre || 'Parada';
        const valor = encodeURIComponent(JSON.stringify({ lat: r.lat, lng: r.lng, nombre: nombre, origen: 'ruta' }));
        const selected = actual && actual.origen !== 'otro' && actual.lat === r.lat && actual.lng === r.lng ? ' selected' : '';
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
        const guardado = JSON.stringify(datos);
        const { error } = await window.db.from('usuarios').update({ parada_id: guardado }).eq('id', session.id);
        if (error) throw error;
        session.parada_id = guardado;
        localStorage.setItem('omni_user', JSON.stringify(session));
        Swal.fire('Parada confirmada', datos.nombre || 'Parada registrada.', 'success');
        loadEstudianteDashboard(true);
    } catch (e) {
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

async function iniciarSeguimiento(viaje) {
    window.modoGps = modoGpsDe(viaje);
    const { data: trans } = await window.db.from('transportes').select('id').eq('viaje_id', viaje.id);
    window.transportesViaje = trans || [];
    let consulta = window.db.from('gps_logs').select('*').limit(40);
    const { data, error } = await consulta;
    if (error || !data) return;
    const ids = new Set(window.transportesViaje.map((t) => t.id));
    const relevantes = data.filter((g) => ids.has(g.transporte_id));
    relevantes.sort((a, b) => esLecturaMasNueva(a, b) ? -1 : 1);
    if (window.modoGps === 'caravana') {
        if (relevantes[0]) moverBus(relevantes[0].latitud, relevantes[0].longitud, 'Caravana');
    } else if (session.transporte_id) {
        const mio = relevantes.find((g) => g.transporte_id === session.transporte_id);
        if (mio) moverBus(mio.latitud, mio.longitud, 'Su transporte');
    }
}

function aplicarLecturaGps(log) {
    if (!log) return;
    const ids = new Set((window.transportesViaje || []).map((t) => t.id));
    if (!ids.has(log.transporte_id)) return;
    if (window.modoGps === 'caravana' || log.transporte_id === session.transporte_id) {
        moverBus(log.latitud, log.longitud, window.modoGps === 'caravana' ? 'Caravana' : 'Su transporte');
    }
}

function moverBus(lat, lng, etiqueta) {
    if (!map || typeof lat !== 'number') return;
    if (!busMarker) busMarker = L.marker([lat, lng]).addTo(map).bindPopup(etiqueta);
    else {
        busMarker.setLatLng([lat, lng]);
        busMarker.setPopupContent(etiqueta);
    }
}

loadEstudianteDashboard();
// ====== ASISTENCIA (GEOFENCING) ======
async function marcarAsistencia() {
    if (!navigator.geolocation) return Swal.fire('Error', 'Navegador no soporta GPS', 'error');
    if (!window.currentViajeData || !window.currentViajeData.ruta || window.currentViajeData.ruta.length === 0) return Swal.fire('Error', 'Datos de la ruta no disponibles', 'error');

    Swal.fire({ title: 'Verificando ubicación...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const ruta = window.currentViajeData.ruta;
        const punto = leerParada(session.parada_id, ruta);
        if (!punto) return Swal.fire('Parada no confirmada', 'Debe tener una parada de subida confirmada antes de marcar asistencia.', 'warning');

        const dist = distanciaMetros(lat, lng, punto.lat, punto.lng);
        if (dist > 50) {
            Swal.fire('Lejos de su parada', `Debe estar a 50 metros o menos de ${punto.nombre || 'su parada'}. Está a ${Math.round(dist)} metros.`, 'warning');
            return;
        }

        try {
            await window.db.from('usuarios').update({ abordo: true, asistencia_cancelada: false }).eq('id', session.id);
            session.abordo = true;
            session.asistencia_cancelada = false;
            localStorage.setItem('omni_user', JSON.stringify(session));
            Swal.fire('Asistencia confirmada', 'Quedó registrado en la parada de subida.', 'success');
            loadEstudianteDashboard();
        } catch(e) { console.error(e); Swal.fire('Error', 'Fallo al confirmar asistencia.', 'error'); }
    }, (err) => {
        Swal.fire('Error GPS', 'No se pudo obtener tu ubicación para verificar la distancia.', 'error');
    }, { enableHighAccuracy: true });
}

async function cancelarAsistencia() {
    Swal.fire({
        title: '¿No asistirás al viaje?',
        text: "Al confirmar, notificaremos al administrador para que no te espere.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, cancelar asistencia'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await window.db.from('usuarios').update({ asistencia_cancelada: true, abordo: false }).eq('id', session.id);
                session.asistencia_cancelada = true;
                session.abordo = false;
                localStorage.setItem('omni_user', JSON.stringify(session));
                Swal.fire('Cancelado', 'Se ha notificado al administrador.', 'info');
                loadEstudianteDashboard();
            } catch(e) {
                console.error(e);
            }
        }
    });
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
