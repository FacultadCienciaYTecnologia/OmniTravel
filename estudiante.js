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
                    const tipoNom = transp.tipo === 'bus_50' ? 'Autobús (50)' : (transp.tipo === 'microbus_15' ? 'Microbús (15)' : 'Moto');
                    document.getElementById('v-transporte').innerText = `Vehículo asignado: ${tipoNom}`;
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

            if (estado === 'anotado') {
                document.getElementById('v-transporte').innerText = `Vehículo asignado: (TODAVÍA NO ESTÁS ASIGNADO A NINGÚN TRANSPORTE)`;
                document.getElementById('v-transporte').style.color = '#dc2626';
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
                        const diff = inicio - now;
                        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((diff % (1000 * 60)) / 1000);
                    
                    timerDiv.style.display = 'block';
                    timerDiv.style.background = '#e0f2fe';
                    timerDiv.style.color = '#0369a1';
                    timerDiv.innerHTML = `La selección de asientos se abrirá en:<br>${d}d ${h}h ${m}m ${s}s`;
                    
                    croquisDiv.innerHTML = `<div class="text-center text-muted" style="margin:20px;">Esperando apertura del croquis...</div>`;
                    if(croquisInterval) { clearInterval(croquisInterval); croquisInterval = null; }
                } 
                else if (now >= inicio && now <= cierre) {
                    const diff = cierre - now;
                    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((diff % (1000 * 60)) / 1000);
                    
                    timerDiv.style.display = 'block';
                    timerDiv.style.background = '#dcfce7';
                    timerDiv.style.color = '#15803d';
                    timerDiv.innerHTML = `¡Selección Abierta! Cierra en: ${d > 0 ? d+'d ' : ''}${h}h ${m}m ${s}s`;
                    
                    if(!window.croquisRendered) {
                        renderCroquisEstudiante(viaje.id, session.transporte_id);
                        window.croquisRendered = true;
                    }
                } 
                else {
                    timerDiv.style.display = 'block';
                    timerDiv.style.background = '#fee2e2';
                    timerDiv.style.color = '#b91c1c';
                    timerDiv.innerHTML = `El periodo de selección ha finalizado.`;
                    
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
            
            updateSeatTimer();
            window.seatTimerInterval = setInterval(updateSeatTimer, 1000);
        }

        // Cargar Ruta en el Mapa
        if (viaje.ruta && viaje.ruta.length > 0) {
            if(polylineRuta) {
                if(polylineRuta.getWaypoints) map.removeControl(polylineRuta);
                else map.removeLayer(polylineRuta);
            }

            const waypoints = viaje.ruta.map(r => L.latLng(r.lat, r.lng));
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
                    const nombre = viaje.ruta[i]?.nombre || `Parada ${i+1}`;
                    return L.marker(wp.latLng).bindPopup(`<b>${nombre}</b>`);
                }
            }).addTo(map);

            polylineRuta.on('routingerror', function(e) {
                console.warn('OSRM rate limit. Dibujando línea recta.');
                map.removeControl(polylineRuta);
                const latlngs = viaje.ruta.map(r => [r.lat, r.lng]);
                polylineRuta = L.polyline(latlngs, {color: 'var(--accent)', weight: 5}).addTo(map);
                map.fitBounds(polylineRuta.getBounds());
            });
            
            // Llenar paradas
            const selectParadas = document.getElementById('parada-select');
            if(selectParadas) {
                selectParadas.innerHTML = '<option value="">Seleccione una parada del mapa...</option>';
                viaje.ruta.forEach((r, i) => {
                    const nombre = r.nombre || `Parada ${i+1}`;
                    selectParadas.innerHTML += `<option value='{"lat":${r.lat}, "lng":${r.lng}}'>${nombre}</option>`;
                });
            }

            // Lógica de parada intermitente libre (click en el mapa)
            map.off('click');
            map.on('click', async function(e) {
                const { isConfirmed } = await Swal.fire({
                    title: 'Parada Personalizada',
                    text: 'Has seleccionado un punto en el mapa. ¿Deseas solicitar subirte aquí?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, guardar parada'
                });

                if (isConfirmed) {
                    if(window.markerIntermitente) map.removeLayer(window.markerIntermitente);
                    window.markerIntermitente = L.marker(e.latlng, { icon: L.divIcon({className: 'custom-div-icon', html: "<div style='background:#fde047; width:15px; height:15px; border-radius:50%; border:2px solid #b45309;'></div>"}) }).addTo(map).bindPopup("Tu parada intermitente").openPopup();
                    
                    const select = document.getElementById('parada-select');
                    const val = JSON.stringify({lat: e.latlng.lat, lng: e.latlng.lng});
                    select.innerHTML += `<option value='${val}' selected>Punto Seleccionado en Mapa</option>`;
                    Swal.fire('Parada Seleccionada', 'Recuerda dar clic en "Confirmar Parada".', 'success');
                }
            });
        }

        if(session.transporte_id) {
            const { data: transporte } = await window.db.from('transportes').select('*').eq('id', session.transporte_id).single();
            if(transporte) {
                document.getElementById('v-transporte').innerText = `Vehículo: ${transporte.tipo.replace('_', ' ').toUpperCase()}`;
            }
        } // Fin if session.transporte_id

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
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes' }, (payload) => {
                    // Recargar todo si el viaje cambia de estado
                    loadEstudianteDashboard();
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
        text: "Ingresarás al panel principal del viaje, pero deberás esperar a que un Chofer te asigne vehículo.",
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
    const plazas = t.tipo === 'bus_50' ? 50 : (t.tipo === 'microbus_15' ? 15 : 2);
    let html = '';

    if (plazas === 2) {
        html = `
            <div class="bus-vertical-container" style="max-width: 150px;">
                <div class="bus-v-front">
                    <div class="steering-wheel-v"></div>
                </div>
                <div class="bus-v-row" style="justify-content: center;">
                    <div class="bus-v-group">
                        ${genSeat(1, asientosOcupados, miAsiento)}
                        ${genSeat(2, asientosOcupados, miAsiento)}
                    </div>
                </div>
            </div>
        `;
    } else if (plazas === 15) {
        html = `<div class="bus-vertical-container">
                    <!-- Fila 1: Volante y Copilotos -->
                    <div class="bus-v-front">
                        <div class="steering-wheel-v"></div>
                        <div class="bus-v-group">
                            ${genSeat(1, asientosOcupados, miAsiento)}
                            ${genSeat(2, asientosOcupados, miAsiento)}
                        </div>
                    </div>

                    <!-- Fila 2: 3 asientos -->
                    <div class="bus-v-row">
                        <div class="bus-v-group" style="width: 100%; justify-content: flex-end;">
                            ${genSeat(3, asientosOcupados, miAsiento)}
                            ${genSeat(4, asientosOcupados, miAsiento)}
                            ${genSeat(5, asientosOcupados, miAsiento)}
                        </div>
                    </div>

                    <!-- Fila 3: 1, pasillo, 2 -->
                    <div class="bus-v-row">
                        ${genSeat(6, asientosOcupados, miAsiento)}
                        <div class="bus-v-aisle"></div>
                        <div class="bus-v-group">
                            ${genSeat(7, asientosOcupados, miAsiento)}
                            ${genSeat(8, asientosOcupados, miAsiento)}
                        </div>
                    </div>

                    <!-- Fila 4: 1, pasillo, 2 -->
                    <div class="bus-v-row">
                        ${genSeat(9, asientosOcupados, miAsiento)}
                        <div class="bus-v-aisle"></div>
                        <div class="bus-v-group">
                            ${genSeat(10, asientosOcupados, miAsiento)}
                            ${genSeat(11, asientosOcupados, miAsiento)}
                        </div>
                    </div>

                    <!-- Fila 5: 4 asientos seguidos -->
                    <div class="bus-v-row" style="justify-content: space-between;">
                        ${genSeat(12, asientosOcupados, miAsiento)}
                        ${genSeat(13, asientosOcupados, miAsiento)}
                        ${genSeat(14, asientosOcupados, miAsiento)}
                        ${genSeat(15, asientosOcupados, miAsiento)}
                    </div>
                </div>`;
    } else { // Bus 50
        html = `<div class="bus-vertical-container">
                    <div class="bus-v-front">
                        <div class="steering-wheel-v"></div>
                        <div style="width:40px; height:20px; background:#94a3b8; border-radius:10px;"></div>
                    </div>`;
                        
        for (let i = 1; i <= plazas; i+=4) {
            let topPair = `<div class="bus-v-group">${genSeat(i, asientosOcupados, miAsiento)}${genSeat(i+1, asientosOcupados, miAsiento)}</div>`;
            let bottomPair = '';
            
            if (i === 49) {
                bottomPair = `<div style="width: 85px; height: 42px; background: #cbd5e1; border: 2px dashed #64748b; border-radius: 5px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; color:#475569;">BAÑO</div>`;
            } else {
                bottomPair = `<div class="bus-v-group">${genSeat(i+2, asientosOcupados, miAsiento)}${genSeat(i+3, asientosOcupados, miAsiento)}</div>`;
            }

            html += `<div class="bus-v-row">
                        ${topPair}
                        <div class="bus-v-aisle"></div>
                        ${bottomPair}
                     </div>`;
        }
        html += `</div>`;
    }
    
    croquisDiv.innerHTML = html;
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
                    Swal.fire('Liberado', 'Tu asiento ha sido liberado.', 'success');
                    lastOccupiedStr = ""; // Forzar recargo
                    renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
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
                
                Swal.fire('¡Éxito!', 'Tu asiento ha sido reservado.', 'success');
                lastOccupiedStr = ""; // Forzar recargo
                renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
            } catch(e) { 
                Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error'); 
                lastOccupiedStr = ""; 
                renderCroquisEstudiante(window.currentViajeId, session.transporte_id);
            }
        }
    });
}

async function guardarParada() {
    const select = document.getElementById('parada-select').value;
    if(!select) return Swal.fire('Atención', 'Selecciona una parada primero.', 'warning');
    
    try {
        const { error } = await window.db.from('usuarios').update({ parada_id: select }).eq('id', session.id);
        if(error) throw error;
        session.parada_id = select;
        localStorage.setItem('omni_user', JSON.stringify(session));
        Swal.fire('Parada Confirmada', 'Se ha guardado tu parada de abordaje.', 'success');
    } catch(e) {
        Swal.fire('Error', 'No se pudo guardar la parada.', 'error');
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
        if (!ruta || ruta.length === 0) return Swal.fire('Error', 'El viaje no tiene ruta definida', 'error');

        // Determinar qué punto usar para la distancia
        let targetLat = ruta[0].lat;
        let targetLng = ruta[0].lng;
        
        // Si el estudiante eligió una parada, comparamos con la parada en su lugar
        if (session.parada_id && ruta[parseInt(session.parada_id)]) {
            const pIdx = parseInt(session.parada_id);
            targetLat = ruta[pIdx].lat;
            targetLng = ruta[pIdx].lng;
        }

        // Calcular distancia al punto de abordaje
        const R = 6371e3; // metres
        const φ1 = lat * Math.PI/180;
        const φ2 = targetLat * Math.PI/180;
        const Δφ = (targetLat-lat) * Math.PI/180;
        const Δλ = (targetLng-lng) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const dist = R * c;

        // La regla estricta: Debe estar a menos de 50 metros del bus (punto de origen del viaje actual)
        if (dist > 50) {
            Swal.fire('Lejos del Bus', `Debes estar a menos de 50 metros del punto de origen para confirmar tu asistencia. Estás a ${Math.round(dist)} metros.`, 'warning');
            return;
        }

        try {
            await window.db.from('usuarios').update({ abordo: true, asistencia_cancelada: false }).eq('id', session.id);
            session.abordo = true;
            session.asistencia_cancelada = false;
            localStorage.setItem('omni_user', JSON.stringify(session));
            Swal.fire('¡Asistencia Confirmada!', 'Ya estás a bordo. Tu cronómetro de viaje se ha activado.', 'success');
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

// ====== PARADAS INTERMITENTES ======
async function solicitarParadaIntermitente() {
    if (!navigator.geolocation) return Swal.fire('Error', 'Necesitas GPS activo para solicitar parada.', 'error');
    if (!window.currentViajeId) return Swal.fire('Atención', 'Aún no se ha cargado la ruta completa de tu viaje.', 'warning');

    Swal.fire({
        title: '¿Solicitar Parada Intermitente Aquí?',
        text: 'Se enviará tu ubicación actual al Administrador y Superadmin para aprobación.',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Sí, solicitar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Enviando solicitud...', didOpen: () => Swal.showLoading() });
            
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                
                try {
                    const { error } = await window.db.from('paradas_intermitentes').insert([{
                        viaje_id: window.currentViajeId,
                        usuario_id: session.id,
                        lat: lat,
                        lng: lng,
                        estado: 'pendiente'
                    }]);
                    if (error) throw error;
                    
                    Swal.fire('Enviado', 'Solicitud enviada al Administrador. Espera confirmación.', 'success');
                } catch(e) {
                    console.error(e);
                    Swal.fire('Error', 'Fallo al solicitar parada.', 'error');
                }
            }, (err) => {
                Swal.fire('Error GPS', 'No pudimos obtener tu ubicación.', 'error');
            }, { enableHighAccuracy: true });
        }
    });
}
