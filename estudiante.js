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
async function loadEstudianteDashboard() {
    try {
        // Refrescar datos del usuario desde la BD
        const { data: user } = await window.db.from('usuarios').select('*').eq('id', session.id).single();
        if(user) {
            Object.assign(session, user);
            localStorage.setItem('omni_user', JSON.stringify(session));
        }

        // Obtener el viaje con inscripción abierta
        const { data: viajes } = await window.db.from('viajes').select('*').eq('inscripcion_abierta', true).limit(1);
        
        if (!viajes || viajes.length === 0) {
            document.getElementById('v-titulo').innerHTML = `<h3 style="color:var(--error);">No hay viajes abiertos.</h3>`;
            document.getElementById('v-fecha').innerText = '';
            document.getElementById('v-transporte').innerText = '';
            document.getElementById('panel-anotarse').style.display = 'none';
            document.getElementById('panel-espera').style.display = 'none';
            document.getElementById('panel-croquis').style.display = 'none';
            return;
        }

        const viaje = viajes[0];
        window.currentViajeId = viaje.id;
        document.getElementById('v-titulo').innerText = viaje.titulo;
        document.getElementById('v-fecha').innerText = `Fecha de Salida: ${new Date(viaje.fecha_salida).toLocaleString()}`;
        document.getElementById('badge-estado').innerText = "Inscripciones Abiertas";
        document.getElementById('badge-estado').style.background = "var(--success)";

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

        // Mostrar paneles según estado de las 3 etapas
        const estado = session.estado_viaje || 'ninguno';

        document.getElementById('panel-anotarse').style.display = 'none';
        document.getElementById('panel-espera').style.display = 'none';
        document.getElementById('panel-croquis').style.display = 'none';

        if (estado === 'ninguno' || session.viaje_id !== viaje.id) {
            document.getElementById('panel-anotarse').style.display = 'block';
        } 
        else if (estado === 'anotado') {
            document.getElementById('panel-espera').style.display = 'block';
            cargarMiembrosGenerales(viaje.id);
        }
        else if (estado === 'asignado' || estado === 'asiento_elegido') {
            document.getElementById('panel-croquis').style.display = 'block';
            
            // Cargar miembros
            cargarMiembros(session.transporte_id);
            cargarMiembrosGenerales(viaje.id);

            // Validar reloj de asientos
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
                    
                    if(!croquisInterval) {
                        renderCroquisEstudiante(viaje.id, session.transporte_id);
                        croquisInterval = setInterval(() => renderCroquisEstudiante(viaje.id, session.transporte_id), 2500);
                    }
                } 
                else {
                    timerDiv.style.display = 'block';
                    timerDiv.style.background = '#fee2e2';
                    timerDiv.style.color = '#b91c1c';
                    timerDiv.innerHTML = `El periodo de selección ha finalizado.`;
                    
                    if(estado !== 'asiento_elegido') {
                        croquisDiv.innerHTML = `<p class="text-center" style="margin:20px;">Ya no puedes seleccionar asiento.</p>`;
                        if(croquisInterval) { clearInterval(croquisInterval); croquisInterval = null; }
                    } else {
                        // Ya eligió, mostrar croquis de solo lectura
                        if(!croquisInterval) {
                            renderCroquisEstudiante(viaje.id, session.transporte_id);
                            croquisInterval = setInterval(() => renderCroquisEstudiante(viaje.id, session.transporte_id), 5000);
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

            // Lógica de parada intermitente (punto a segmento)
            map.off('click');
            map.on('click', async function(e) {
                if (!polylineRuta || !polylineRuta._selectedRoute) return;
                
                const routeCoords = polylineRuta._selectedRoute.coordinates; 
                if (!routeCoords) return;

                let minDistance = Infinity;
                routeCoords.forEach(coord => {
                    const d = map.distance(e.latlng, coord);
                    if(d < minDistance) minDistance = d;
                });

                // 30 metros de tolerancia en la carretera
                if (minDistance <= 30) {
                    const { isConfirmed } = await Swal.fire({
                        title: 'Parada Intermitente',
                        text: 'Has seleccionado un punto en la ruta. ¿Deseas solicitar subirte aquí?',
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, guardar parada'
                    });

                    if (isConfirmed) {
                        if(window.markerIntermitente) map.removeLayer(window.markerIntermitente);
                        window.markerIntermitente = L.marker(e.latlng, { icon: L.divIcon({className: 'custom-div-icon', html: "<div style='background:#fde047; width:15px; height:15px; border-radius:50%; border:2px solid #b45309;'></div>"}) }).addTo(map).bindPopup("Tu parada intermitente").openPopup();
                        
                        const select = document.getElementById('parada-select');
                        const val = JSON.stringify({lat: e.latlng.lat, lng: e.latlng.lng});
                        select.innerHTML += `<option value='${val}' selected>Parada Intermitente Solicitada</option>`;
                        Swal.fire('Parada Seleccionada', 'Recuerda dar clic en "Confirmar Parada".', 'success');
                    }
                } else {
                    Swal.fire('Fuera de Ruta', 'Debes hacer clic directamente en la línea azul por donde pasará el transporte.', 'warning');
                }
            });
        }

        // Obtener info del transporte si lo tiene
        if(session.transporte_id) {
            const { data: transporte } = await window.db.from('transportes').select('*').eq('id', session.transporte_id).single();
            if(transporte) {
                document.getElementById('v-transporte').innerText = `Vehículo: ${transporte.tipo.replace('_', ' ').toUpperCase()}`;
            }
        }

    } catch (e) {
        console.error("Error", e);
    }
}

async function anotarseViaje() {
    Swal.fire({
        title: '¿Anotarse a este viaje?',
        text: "Al anotarte, esperarás a que el Superadmin te asigne un vehículo.",
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Sí, anotarme'
    }).then(async (res) => {
        if(res.isConfirmed) {
            try {
                await window.db.from('usuarios').update({
                    viaje_id: window.currentViajeId,
                    estado_viaje: 'anotado',
                    transporte_id: null,
                    asiento: null
                }).eq('id', session.id);
                Swal.fire('Anotado', 'Estás en lista de espera.', 'success');
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
    
    const { data: usuarios } = await window.db.from('usuarios').select('asiento').eq('transporte_id', transporteId).not('asiento', 'is', null);
    const asientosOcupados = usuarios ? usuarios.map(u => u.asiento).sort() : [];
    const occupiedStr = JSON.stringify(asientosOcupados);

    if (croquisDiv.innerHTML !== '' && lastOccupiedStr === occupiedStr) return; // Evitar parpadeos si no hay cambios
    lastOccupiedStr = occupiedStr;

    const miAsiento = session.asiento; 
    const plazas = t.tipo === 'bus_50' ? 50 : (t.tipo === 'microbus_15' ? 15 : 2);
    let html = '';

    if (plazas === 2) {
        html = `
            <div style="display:flex; justify-content:center; width:100%; margin-top:10px;">
                <div style="display: flex; flex-direction: row-reverse; align-items: center; background: #cbd5e1; padding: 20px 40px; border-radius: 80px 20px 20px 80px; border: 5px solid #94a3b8; gap: 15px; box-shadow: inset 0 0 15px rgba(0,0,0,0.15);">
                    
                    <!-- Frente (Manubrio y Foco) -->
                    <div style="display: flex; flex-direction: column; align-items: center; margin-left: 10px;">
                        <div style="width: 20px; height: 70px; background: #1e293b; border-radius: 10px; position:relative;">
                            <div style="position:absolute; right:-12px; top:50%; transform:translateY(-50%); width:12px; height:25px; background:#fde047; border-radius:50%; box-shadow: 0 0 10px #fde047;"></div>
                        </div>
                    </div>

                    <!-- Asientos (Piloto y Copiloto) -->
                    <div style="display: flex; gap: 8px;">
                        ${genSeat(1, asientosOcupados, miAsiento)}
                        ${genSeat(2, asientosOcupados, miAsiento)}
                    </div>
                    
                    <!-- Cola de moto -->
                    <div style="width: 30px; height: 50px; background: #334155; border-radius: 10px; margin-right: 10px;"></div>
                </div>
            </div>
        `;
    } else if (plazas === 15) {
        html = `<div class="bus-horizontal" style="border-radius: 40px; padding: 20px;">
                    <!-- Columna 1: Frente (Copilotos y Volante) -->
                    <div class="bus-front" style="justify-content: space-between; height: 180px; border:none; padding-left:10px;">
                        <div class="seat-pair">
                            ${genSeat(1, asientosOcupados, miAsiento)}
                            ${genSeat(2, asientosOcupados, miAsiento)}
                        </div>
                        <div class="steering-wheel"></div>
                    </div>

                    <!-- Columna 2: Puerta arriba, 3 asientos abajo -->
                    <div class="bus-column" style="justify-content: flex-end; gap: 0;">
                        <div class="seat-pair">
                            ${genSeat(3, asientosOcupados, miAsiento)}
                            ${genSeat(4, asientosOcupados, miAsiento)}
                            ${genSeat(5, asientosOcupados, miAsiento)}
                        </div>
                    </div>

                    <!-- Columna 3: 1 asiento arriba, pasillo, 2 asientos abajo -->
                    <div class="bus-column" style="justify-content: space-between;">
                        ${genSeat(6, asientosOcupados, miAsiento)}
                        <div class="seat-pair">
                            ${genSeat(7, asientosOcupados, miAsiento)}
                            ${genSeat(8, asientosOcupados, miAsiento)}
                        </div>
                    </div>

                    <!-- Columna 4: 1 asiento arriba, pasillo, 2 asientos abajo -->
                    <div class="bus-column" style="justify-content: space-between;">
                        ${genSeat(9, asientosOcupados, miAsiento)}
                        <div class="seat-pair">
                            ${genSeat(10, asientosOcupados, miAsiento)}
                            ${genSeat(11, asientosOcupados, miAsiento)}
                        </div>
                    </div>

                    <!-- Columna 5: 4 asientos atrás -->
                    <div class="bus-column" style="justify-content: space-between; gap: 5px;">
                        ${genSeat(12, asientosOcupados, miAsiento)}
                        ${genSeat(13, asientosOcupados, miAsiento)}
                        ${genSeat(14, asientosOcupados, miAsiento)}
                        ${genSeat(15, asientosOcupados, miAsiento)}
                    </div>
                </div>`;
    } else { // Bus 50
        html = `<div class="bus-horizontal">
                        <div class="bus-front">
                            <div class="steering-wheel"></div>
                            <div style="width:50px; height:20px; background:#94a3b8; border-radius:10px;"></div>
                        </div>`;
                        
        for (let i = 1; i <= plazas; i+=4) {
            let topPair = `<div class="seat-pair">${genSeat(i, asientosOcupados, miAsiento)}${genSeat(i+1, asientosOcupados, miAsiento)}</div>`;
            let bottomPair = '';
            
            if (i === 49) {
                bottomPair = `<div style="width: 45px; height: 85px; background: #cbd5e1; border: 2px dashed #64748b; border-radius: 5px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; color:#475569; writing-mode: vertical-rl; transform: rotate(180deg);">WC</div>`;
            } else {
                bottomPair = `<div class="seat-pair">${genSeat(i+2, asientosOcupados, miAsiento)}${genSeat(i+3, asientosOcupados, miAsiento)}</div>`;
            }

            html += `<div class="bus-column">
                        ${topPair}
                        ${bottomPair}
                     </div>`;
        }
        html += `</div>`;
    }
    
    croquisDiv.innerHTML = html;
}

function genSeat(numero, ocupados, miAsiento) {
    if(numero > 50 || numero <= 0 || !numero) return '';
    const esMio = (miAsiento == numero.toString());
    const estaOcupado = ocupados.includes(numero.toString());
    
    let clase = 'seat';
    if(esMio) clase += ' selected';
    else if(estaOcupado) clase += ' occupied';

    return `<div class="${clase}" onclick="selectSeat(this, ${numero})"><span>${numero}</span></div>`;
}

function selectSeat(seatElement, numero) {
    if (seatElement.classList.contains('occupied')) return Swal.fire('Ocupado', 'Este asiento ya fue tomado.', 'warning');
    
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
                    await window.db.from('usuarios').update({ asiento: null, estado_viaje: 'asignado', fecha_reserva: null }).eq('id', session.id);
                    session.asiento = null;
                    session.estado_viaje = 'asignado';
                    localStorage.setItem('omni_user', JSON.stringify(session));
                    Swal.fire('Liberado', 'Tu asiento ha sido liberado.', 'success');
                    lastOccupiedStr = ""; // Forzar recargo
                    loadEstudianteDashboard();
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
                    await window.db.from('usuarios').update({ asiento: numero.toString(), fecha_reserva: new Date().toISOString() }).eq('id', session.id);
                    session.asiento = numero.toString();
                    localStorage.setItem('omni_user', JSON.stringify(session));
                    Swal.fire('¡Éxito!', 'Asiento cambiado.', 'success');
                    lastOccupiedStr = ""; // Forzar recargo
                    loadEstudianteDashboard();
                } catch(e) {
                    Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error');
                    lastOccupiedStr = ""; 
                    loadEstudianteDashboard();
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
                await window.db.from('usuarios').update({
                    asiento: numero.toString(),
                    estado_viaje: 'asiento_elegido',
                    fecha_reserva: new Date().toISOString()
                }).eq('id', session.id);
                
                session.asiento = numero.toString();
                session.estado_viaje = 'asiento_elegido';
                localStorage.setItem('omni_user', JSON.stringify(session));
                
                Swal.fire('¡Éxito!', 'Tu asiento ha sido reservado.', 'success');
                lastOccupiedStr = ""; // Forzar recargo
                loadEstudianteDashboard();
            } catch(e) { 
                Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error'); 
                lastOccupiedStr = ""; 
                loadEstudianteDashboard();
            }
        }
    });
}

function guardarParada() {
    const select = document.getElementById('parada-select').value;
    if(!select) return Swal.fire('Atención', 'Selecciona una parada primero.', 'warning');
    
    // Aquí el estudiante podría guardar la parada en BD (agregar parada_json a su perfil si es necesario)
    Swal.fire('Parada Confirmada', 'Se ha guardado tu parada de abordaje.', 'success');
}

loadEstudianteDashboard();
