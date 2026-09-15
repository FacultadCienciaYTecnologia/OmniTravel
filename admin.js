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

        // Si ya está en ruta, forzar encendido de GPS (visual)
        if(viajes[0].estado === 'en_ruta') {
            document.getElementById('gps-toggle').checked = true;
            activarGPS();
            document.getElementById('btn-iniciar').style.display = 'none';
            document.getElementById('btn-finalizar').style.display = 'inline-block';
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
    try {
        await window.db.from('viajes').update({ estado: 'en_ruta' }).eq('id', viajeIdActual);
        document.getElementById('gps-toggle').checked = true;
        activarGPS();
        document.getElementById('btn-iniciar').style.display = 'none';
        document.getElementById('btn-finalizar').style.display = 'inline-block';
        document.getElementById('estado-ruta').innerText = 'Ruta en Progreso';
        Swal.fire('Ruta Iniciada', 'El GPS ahora transmite en tiempo real.', 'success');
    } catch(e) { console.error(e); }
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
