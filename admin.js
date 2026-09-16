// ====== VERIFICAR SESIÓN ======
const session = JSON.parse(localStorage.getItem('omni_user'));
if (!session || session.rol !== 'admin') {
    window.location.href = 'index.html';
}
document.getElementById('admin-name').innerText = `Admin: ${session.nombre_completo}`;
const profilePic = document.getElementById('nav-profile-pic');
if(profilePic) {
    profilePic.src = session.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.nombre_completo)}&background=random`;
}

function logout() {
    localStorage.removeItem('omni_user');
    window.location.href = 'index.html';
}

// ====== MAPA ADMIN ======
const map = L.map('admin-map').setView([13.6929, -89.2182], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let marker = null;
let watchId = null;
let viajeIdActual = null;
let transporteIdActual = null;

// ====== CARGA INICIAL ======
async function loadAdminDashboard() {
    try {
        // Encontrar un transporte asignado a este viaje.
        // Si no tenemos admin asignado por diseño, simplemente el admin entra y ve el viaje actual en progreso o preparacion
        const { data: viajes } = await window.db.from('viajes').select('id, titulo, estado, ruta').in('estado', ['preparacion', 'en_ruta']).limit(1);
        
        if(!viajes || viajes.length === 0) {
            Swal.fire('Atención', 'No hay viajes activos en este momento.', 'info');
            return;
        }

        viajeIdActual = viajes[0].id;
        window.rutaActual = viajes[0].ruta || [];
        document.getElementById('estado-ruta').innerText = viajes[0].estado === 'en_ruta' ? 'Ruta en Progreso' : 'Preparación';

        // Obtener datos actualizados del admin para saber su transporte asignado
        const { data: adminUser } = await window.db.from('usuarios').select('transporte_id').eq('id', session.id).single();
        if(adminUser && adminUser.transporte_id) {
            transporteIdActual = adminUser.transporte_id;
        } else {
            Swal.fire('Atención', 'No has sido asignado a ningún vehículo por el Superadmin. No puedes gestionar pasajeros ni el viaje.', 'warning');
            const tbodyAsignacion = document.getElementById('table-asignacion-body');
            const tbodyManifiesto = document.getElementById('manifest-tbody');
            if(tbodyAsignacion) tbodyAsignacion.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--warning);">No estás asignado a un vehículo.</td></tr>';
            if(tbodyManifiesto) tbodyManifiesto.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--warning);">No estás asignado a un vehículo.</td></tr>';
            document.getElementById('count-abordo').innerText = `A bordo: 0 / 0`;
            return;
        }

        cargarManifiesto();
        cargarAnotadosYVehiculos(); // Cargar asignaciones manuales
        renderAdminCroquis(); // Renderizar croquis

        // Si ya está en ruta, forzar encendido de GPS (visual)
        if(viajes[0].estado === 'en_ruta') {
            document.getElementById('gps-toggle').checked = true;
            document.getElementById('btn-iniciar').style.display = 'none';
            document.getElementById('btn-finalizar').style.display = 'inline-block';
            activarGPS(); // Tratar de reconectar GPS
        }

        // ====== SUSCRIPCIONES REALTIME ======
        if (!window.adminChannel) {
            window.adminChannel = window.db.channel('admin-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, (payload) => {
                    // Si cambian los pasajeros o asientos
                    if(viajeIdActual) {
                        lastAdminOccupiedStr = "";
                        cargarManifiesto();
                        cargarAnotadosYVehiculos();
                        renderAdminCroquis();
                    }
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes' }, (payload) => {
                    // Si el superadmin reinicia o edita el viaje, recargar
                    loadAdminDashboard();
                })
                .subscribe();
        }

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudieron cargar los datos del viaje.', 'error');
    }
}

async function cargarManifiesto() {
    const { data: pasajeros } = await window.db.from('usuarios').select('id, nombre_completo, codigo_pasajero, asiento, parada_id').eq('viaje_id', viajeIdActual);
    const tbody = document.getElementById('manifest-tbody');
    tbody.innerHTML = '';

    if(!pasajeros || pasajeros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay pasajeros registrados aún.</td></tr>';
        document.getElementById('count-abordo').innerText = `A bordo: 0 / 0`;
        return;
    }

    // Nota: Por simplicidad guardaremos localmente quién subió, ya que no hicimos columna "abordo" en la DB
    // En un sistema real se añadiría una tabla de abordajes o un boolean en el usuario.
    const abordoCount = 0;
    
    pasajeros.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td>${p.nombre_completo}</td>
                <td>${p.codigo_pasajero || '-'}</td>
                <td>Parada...</td>
                <td>${p.asiento || '-'}</td>
                <td id="status-${p.id}"><span class="badge" style="background:var(--error-light); color:var(--error);">Falta</span></td>
                <td><button class="btn btn-success btn-auto" onclick="marcarAbordo(this, '${p.id}')">Marcar A bordo</button></td>
            </tr>
        `;
    });

    document.getElementById('count-abordo').innerText = `Pasajeros inscritos: ${pasajeros.length}`;
}

function marcarAbordo(btn, id) {
    btn.classList.remove('btn-success');
    btn.classList.add('btn-outline');
    btn.innerText = "Confirmado";
    btn.disabled = true;
    document.getElementById(`status-${id}`).innerHTML = '<span class="badge" style="background:var(--success-light); color:var(--success);">A bordo</span>';
}

// ====== LÓGICA DE VIAJE ======
async function iniciarRuta() {
    if(!viajeIdActual) return;
    if(!window.rutaActual || window.rutaActual.length === 0) {
        return Swal.fire('Error', 'El viaje no tiene una ruta definida.', 'error');
    }

    if (!navigator.geolocation) return Swal.fire('Error', 'Navegador no soporta GPS', 'error');

    Swal.fire({ title: 'Verificando ubicación...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        const origen = window.rutaActual[0];
        const dist = map.distance([lat, lng], [origen.lat, origen.lng]);

        if (dist > 25) { // 25 metros de margen de error GPS
            Swal.fire('Lejos del Origen', `Debes estar en el punto de inicio para comenzar. Estás a ${Math.round(dist)} metros.`, 'warning');
            return;
        }

        try {
            await window.db.from('viajes').update({ estado: 'en_ruta' }).eq('id', viajeIdActual);
            document.getElementById('gps-toggle').checked = true;
            activarGPS();
            document.getElementById('btn-iniciar').style.display = 'none';
            document.getElementById('btn-finalizar').style.display = 'inline-block';
            document.getElementById('estado-ruta').innerText = 'Ruta en Progreso';
            Swal.fire('Ruta Iniciada', 'El GPS ahora transmite en tiempo real.', 'success');
        } catch(e) { console.error(e); Swal.fire('Error', 'Fallo al iniciar ruta.', 'error'); }
    }, (err) => {
        Swal.fire('Error GPS', 'No se pudo obtener tu ubicación. Verifica permisos.', 'error');
    }, { enableHighAccuracy: true });
}

async function finalizarRuta() {
    if(!viajeIdActual) return;
    try {
        await window.db.from('viajes').update({ estado: 'finalizado', inscripcion_abierta: false }).eq('id', viajeIdActual);
        document.getElementById('gps-toggle').checked = false;
        desactivarGPS();
        document.getElementById('btn-finalizar').style.display = 'none';
        document.getElementById('estado-ruta').innerText = 'Viaje Finalizado';
        Swal.fire('Viaje Terminado', 'Se ha notificado al Superadmin.', 'success');
        
        setTimeout(() => window.location.reload(), 2000);
    } catch(e) { console.error(e); }
}

// ====== GPS Y REALTIME ======
const gpsToggle = document.getElementById('gps-toggle');
const gpsDot = document.getElementById('gps-dot');
const gpsText = document.getElementById('gps-text');

gpsToggle.addEventListener('change', (e) => {
    if (e.target.checked) activarGPS();
    else desactivarGPS();
});

function activarGPS() {
    if (!navigator.geolocation) return Swal.fire('Error', 'Navegador no soporta GPS', 'error');
    
    gpsDot.classList.add('active');
    gpsText.innerText = 'Transmitiendo...';
    
    watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const speed = position.coords.speed || 0;
            
            if (!marker) {
                const busIcon = L.divIcon({ className: 'custom-div-icon', html: "<div style='background:var(--accent); width:15px; height:15px; border-radius:50%; border:2px solid white;'></div>", iconSize: [15, 15] });
                marker = L.marker([lat, lng], {icon: busIcon}).addTo(map);
            } else {
                marker.setLatLng([lat, lng]);
            }
            map.setView([lat, lng]);
            
            // Insertar log en Supabase
            if(transporteIdActual) {
                await window.db.from('gps_logs').insert([{
                    transporte_id: transporteIdActual,
                    latitud: lat,
                    longitud: lng,
                    velocidad: speed
                }]);
            }
            
            // Verificación de fin de ruta automático
            if(window.rutaActual && window.rutaActual.length > 0) {
                const destino = window.rutaActual[window.rutaActual.length - 1];
                const distDestino = map.distance([lat, lng], [destino.lat, destino.lng]);
                if (distDestino <= 20 && document.getElementById('btn-finalizar').style.display !== 'none') {
                    // Prevenir múltiples llamadas quitando el botón
                    document.getElementById('btn-finalizar').style.display = 'none';
                    Swal.fire('Destino Alcanzado', 'Has llegado al punto final de la ruta. Finalizando viaje...', 'info');
                    finalizarRuta();
                }
            }
        },
        (error) => {
            Swal.fire('Error GPS', 'Activa el permiso de ubicación.', 'error');
            desactivarGPS();
            gpsToggle.checked = false;
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
}

function desactivarGPS() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    gpsDot.classList.remove('active');
    gpsText.innerText = 'Inactivo';
    if(marker) { map.removeLayer(marker); marker = null; }
}

// ====== ASIGNACIÓN DE PASAJEROS ======
async function cargarAnotadosYVehiculos() {
    const tbody = document.getElementById('table-asignacion-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>';
    
    if(!viajeIdActual) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay viaje activo.</td></tr>';
        return;
    }
    
    try {
        const { data: transporteAdmin } = await window.db.from('transportes').select('tipo').eq('id', transporteIdActual).single();
        
        if(!transporteAdmin) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--error);">No estás asignado a un vehículo válido.</td></tr>';
            return;
        }

        const tipoNom = transporteAdmin.tipo === 'bus_50' ? 'Autobús (50)' : (transporteAdmin.tipo === 'microbus_15' ? 'Microbús (15)' : 'Moto');
        const opcionesTransporte = `<option value="" disabled selected>Asignar a...</option><option value="${transporteIdActual}">Mi Vehículo: ${tipoNom}</option>`;

        // Traer usuarios anotados o asignados (excluir admins)
        const { data: usuarios } = await window.db.from('usuarios')
            .select('*')
            .eq('viaje_id', viajeIdActual)
            .neq('rol', 'admin') // ¡Los admins no pueden ser asignados por otros admins!
            .in('estado_viaje', ['anotado', 'asignado', 'asiento_elegido']);
        
        if(!usuarios || usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay estudiantes anotados para este viaje.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        usuarios.forEach(u => {
            const fotoSrc = u.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nombre_completo)}&background=random`;
            
            let userSelect = opcionesTransporte;
            if(u.transporte_id) {
                if(u.transporte_id === transporteIdActual) {
                    userSelect = userSelect.replace(`value="${u.transporte_id}"`, `value="${u.transporte_id}" selected`);
                    userSelect = userSelect.replace('selected>Asignar', '>Asignar');
                } else {
                    userSelect = `<option disabled selected>En otro vehículo</option>`;
                }
            }
            
            const badge = (u.estado_viaje === 'asignado' || u.estado_viaje === 'asiento_elegido') ? '<span style="color:var(--success); font-size:12px; margin-left:5px;">✓ Asignado</span>' : '';
            
            tbody.innerHTML += `
                <tr>
                    <td style="text-align:center;"><img src="${fotoSrc}" style="width:35px;height:35px;border-radius:50%;cursor:pointer;object-fit:cover;"></td>
                    <td>${u.nombre_completo} <br><small class="text-muted">${u.rol.toUpperCase()}</small></td>
                    <td>${u.dni || 'Menor'}</td>
                    <td>
                        <select onchange="asignarTransporteUsuario('${u.id}', this.value)" style="padding:4px; font-size:0.8rem; border-radius:4px;">
                            ${userSelect}
                        </select>
                        ${badge}
                    </td>
                </tr>
            `;
        });
        
    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--error);">Error al cargar.</td></tr>';
    }
}

async function asignarTransporteUsuario(userId, transporteId) {
    try {
        await window.db.from('usuarios').update({ 
            transporte_id: transporteId,
            estado_viaje: 'asignado',
            asiento: null // Se reinicia el asiento al cambiar de bus
        }).eq('id', userId);
        
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Asignado con éxito', showConfirmButton: false, timer: 1500 });
        cargarAnotadosYVehiculos(); 
        cargarManifiesto();
    } catch(e) {
        Swal.fire('Error', 'No se pudo asignar.', 'error');
    }
}

loadAdminDashboard();

let adminCroquisInterval = null;
let lastAdminOccupiedStr = "";

// ====== VIP CROQUIS ======
async function renderAdminCroquis() {
    const croquisDiv = document.getElementById('admin-croquis');
    
    if(!transporteIdActual) {
        if (croquisDiv) croquisDiv.innerHTML = '<div class="text-muted">No estás asignado a un vehículo.</div>';
        return;
    }

    try {
        const { data: t } = await window.db.from('transportes').select('tipo, viaje_id').eq('id', transporteIdActual).single();
        if(!t) return;
        
        // Usuarios del transporte
        const { data: usuarios } = await window.db.from('usuarios').select('*').eq('transporte_id', transporteIdActual).not('asiento', 'is', null);
        const asientosOcupadosInfo = {};
        
        const occupiedIds = usuarios ? usuarios.map(u => u.asiento + '-' + u.id).sort() : [];
        const occupiedStr = JSON.stringify(occupiedIds);
        
        if (croquisDiv.innerHTML !== '' && lastAdminOccupiedStr === occupiedStr) return;
        lastAdminOccupiedStr = occupiedStr;

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
                            ${genAdminSeat(1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            ${genAdminSeat(2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
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
                                ${genAdminSeat(1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                                ${genAdminSeat(2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            </div>
                        </div>

                        <!-- Fila 2: 3 asientos -->
                        <div class="bus-v-row">
                            <div class="bus-v-group" style="width: 100%; justify-content: flex-end;">
                                ${genAdminSeat(3, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                                ${genAdminSeat(4, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                                ${genAdminSeat(5, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            </div>
                        </div>

                        <!-- Fila 3: 1, pasillo, 2 -->
                        <div class="bus-v-row">
                            ${genAdminSeat(6, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            <div class="bus-v-aisle"></div>
                            <div class="bus-v-group">
                                ${genAdminSeat(7, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                                ${genAdminSeat(8, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            </div>
                        </div>

                        <!-- Fila 4: 1, pasillo, 2 -->
                        <div class="bus-v-row">
                            ${genAdminSeat(9, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            <div class="bus-v-aisle"></div>
                            <div class="bus-v-group">
                                ${genAdminSeat(10, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                                ${genAdminSeat(11, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            </div>
                        </div>

                        <!-- Fila 5: 4 asientos seguidos -->
                        <div class="bus-v-row" style="justify-content: space-between;">
                            ${genAdminSeat(12, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            ${genAdminSeat(13, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            ${genAdminSeat(14, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                            ${genAdminSeat(15, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}
                        </div>
                    </div>`;
        } else {
            html = `<div class="bus-vertical-container">
                            <div class="bus-v-front">
                                <div class="steering-wheel-v"></div>
                                <div style="width:40px; height:20px; background:#94a3b8; border-radius:10px;"></div>
                            </div>`;
                            
            for (let i = 1; i <= plazas; i+=4) {
                let topPair = `<div class="bus-v-group">${genAdminSeat(i, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}${genAdminSeat(i+1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}</div>`;
                let bottomPair = '';
                
                if (i === 49) {
                    bottomPair = `<div style="width: 85px; height: 42px; background: #cbd5e1; border: 2px dashed #64748b; border-radius: 5px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; color:#475569;">BAÑO</div>`;
                } else {
                    bottomPair = `<div class="bus-v-group">${genAdminSeat(i+2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}${genAdminSeat(i+3, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual)}</div>`;
                }

                html += `<div class="bus-v-row">
                            ${topPair}
                            <div class="bus-v-aisle"></div>
                            ${bottomPair}
                         </div>`;
            }
            html += `</div>`;
        }
        if (croquisDiv) croquisDiv.innerHTML = html;
    } catch(e) {
        console.error(e);
    }
}

function genAdminSeat(numero, ocupadosInfo, miAsiento, viajeId, transporteId) {
    if(numero > 50 || numero <= 0 || !numero) return '';
    const esMio = (miAsiento == numero.toString() && session.transporte_id == transporteId);
    const usuarioAsiento = ocupadosInfo[numero.toString()];
    
    let clase = 'seat-v';
    let onclickFn = `seleccionarAsientoVIP(${numero}, '${viajeId}', '${transporteId}')`;
    
    if(esMio) {
        clase += ' selected';
    }
    else if(usuarioAsiento) {
        const u = usuarioAsiento;
        if(u.rol === 'admin' || u.rol === 'superadmin') clase += ' occupied-red';
        else clase += ' occupied-blue';
        const foto = u.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nombre_completo)}&background=random`;
        onclickFn = `verDetalleAsiento('${u.nombre_completo}', '${foto}', '${u.dni}', '${u.fecha_reserva}')`;
    }

    return `<div class="${clase}" onclick="${onclickFn}"><span>${numero}</span></div>`;
}

function verDetalleAsiento(nombre, foto, dni, fechaReserva) {
    const d = fechaReserva ? new Date(fechaReserva).toLocaleString() : 'Desconocida';
    Swal.fire({
        title: nombre,
        html: `
            <img src="${foto}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; margin-bottom:10px;">
            <p><strong>DNI:</strong> ${dni || 'N/A'}</p>
            <p><strong>Hora de Reserva:</strong> ${d}</p>
        `,
        confirmButtonText: 'Cerrar'
    });
}

function seleccionarAsientoVIP(numero, viajeId, transporteId) {
    const miAsiento = session.asiento;
    
    if (miAsiento == numero.toString()) {
        Swal.fire({
            title: `¿Liberar el Asiento VIP ${numero}?`,
            text: "Te quedarás sin asiento asignado en este viaje.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, liberar'
        }).then(async (res) => {
            if(res.isConfirmed) {
                try {
                    await window.db.from('usuarios').update({ asiento: null, fecha_reserva: null }).eq('id', session.id);
                    session.asiento = null;
                    localStorage.setItem('omni_user', JSON.stringify(session));
                    Swal.fire('Liberado', 'Tu asiento VIP ha sido liberado.', 'success');
                    lastAdminOccupiedStr = "";
                    renderAdminCroquis();
                } catch(e) {}
            }
        });
        return;
    }

    Swal.fire({
        title: `¿Cambiar al Asiento VIP ${numero}?`,
        text: miAsiento ? "Tu asiento anterior quedará libre." : "",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, elegir'
    }).then(async (res) => {
        if(res.isConfirmed) {
            try {
                // Doble check para colisiones
                const { data: check } = await window.db.from('usuarios').select('id').eq('transporte_id', transporteId).eq('asiento', numero.toString()).limit(1);
                if (check && check.length > 0) {
                    return Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error');
                }

                await window.db.from('usuarios').update({ asiento: numero.toString(), fecha_reserva: new Date().toISOString() }).eq('id', session.id);
                session.asiento = numero.toString();
                localStorage.setItem('omni_user', JSON.stringify(session));
                Swal.fire('¡Éxito!', 'Asiento VIP asignado.', 'success');
                lastAdminOccupiedStr = "";
                renderAdminCroquis();
            } catch(e) {
                Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error');
                lastAdminOccupiedStr = "";
                renderAdminCroquis();
            }
        }
    });
}
