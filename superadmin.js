// ====== VERIFICAR SESIÓN ======
const session = JSON.parse(localStorage.getItem('omni_user'));
if (!session || session.rol !== 'superadmin') {
    window.location.href = 'index.html';
}
document.getElementById('admin-name').innerText = session.nombre_completo;
const profilePic = document.getElementById('nav-profile-pic');
if(profilePic) {
    profilePic.src = session.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.nombre_completo)}&background=random`;
}

function logout() {
    localStorage.removeItem('omni_user');
    window.location.href = 'index.html';
}

// ====== SPA TABS LOGIC ======
const menuItems = document.querySelectorAll('.menu-item[data-target]');
const tabContents = document.querySelectorAll('.tab-content');

menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(i => i.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        item.classList.add('active');
        document.getElementById(item.dataset.target).classList.add('active');
        document.getElementById('header-title').innerText = item.innerText.replace(/[0-9]/g, '').trim();

        // Si se abre el tab de viajes, asegurar que el mapa renderice correctamente
        if(item.dataset.target === 'viajes') {
            setTimeout(() => { routingMap.invalidateSize(); }, 100);
        }
    });
});

// ====== CARGA DE DATOS INICIALES ======
async function loadDashboard() {
    try {
        // Usuarios
        const { data: users } = await window.db.from('usuarios').select('id, estado_aprobacion, rol').neq('rol', 'superadmin');
        const aprobados = users.filter(u => u.estado_aprobacion === 'aprobado');
        const pendientes = users.filter(u => u.estado_aprobacion === 'pendiente');
        
        document.getElementById('stat-usuarios').innerText = aprobados.length;
        
        if (pendientes.length > 0) {
            document.getElementById('badge-pendientes').style.display = 'inline';
            document.getElementById('badge-pendientes').innerText = pendientes.length;
        } else {
            document.getElementById('badge-pendientes').style.display = 'none';
        }
        
        renderPendientes(pendientes); 
        renderRoles(users.filter(u => u.estado_aprobacion === 'aprobado'));

        // Viajes
        const { data: viajes } = await window.db.from('viajes').select('*');
        document.getElementById('stat-viajes').innerText = viajes ? viajes.length : 0;
        renderViajes(viajes || []);

        // Transportes
        const { data: transportes } = await window.db.from('transportes').select('*');
        document.getElementById('stat-transportes').innerText = transportes ? transportes.length : 0;
        
        cargarSelectAdminVehiculos(transportes || []);
        
    } catch(e) { console.error("Error cargando dashboard", e); }
}

async function renderPendientes() {
    const { data: pendientes } = await window.db.from('usuarios').select('*').eq('estado_aprobacion', 'pendiente').neq('rol', 'superadmin');
    const tbody = document.querySelector('#table-aprobaciones tbody');
    tbody.innerHTML = '';
    
    if(!pendientes || pendientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay usuarios pendientes.</td></tr>';
        return;
    }
    
    pendientes.forEach(u => {
        const fotoSrc = u.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nombre_completo)}&background=random`;
        tbody.innerHTML += `
            <tr>
                <td style="text-align:center;"><img src="${fotoSrc}" style="width:35px;height:35px;border-radius:50%;cursor:pointer;object-fit:cover;" onclick="ampliarFoto('${fotoSrc}', '${u.nombre_completo}')"></td>
                <td>${u.nombre_completo}</td>
                <td>${u.codigo_pasajero || '-'}</td>
                <td>${u.dni || 'Menor'}</td>
                <td>${new Date(u.creado_en).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-success" style="padding: 5px 10px; font-size: 0.8rem; width: auto;" onclick="aprobarUsuario('${u.id}')">Aprobar</button>
                </td>
            </tr>
        `;
    });
}

async function aprobarUsuario(id) {
    try {
        await window.db.from('usuarios').update({ estado_aprobacion: 'aprobado' }).eq('id', id);
        Swal.fire('Aprobado', 'El usuario ya puede ingresar al sistema.', 'success');
        loadDashboard();
        renderPendientes();
    } catch(e) { Swal.fire('Error', 'No se pudo aprobar.', 'error'); }
}

async function renderRoles() {
    const { data: aprobados } = await window.db.from('usuarios').select('*').eq('estado_aprobacion', 'aprobado');
    const tbody = document.querySelector('#table-roles tbody');
    tbody.innerHTML = '';
    
    if(!aprobados || aprobados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay usuarios en el sistema.</td></tr>';
        return;
    }

    aprobados.forEach(u => {
        const fotoSrc = u.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nombre_completo)}&background=random`;
        tbody.innerHTML += `
            <tr>
                <td style="text-align:center;"><img src="${fotoSrc}" style="width:35px;height:35px;border-radius:50%;cursor:pointer;object-fit:cover;" onclick="ampliarFoto('${fotoSrc}', '${u.nombre_completo}')"></td>
                <td>${u.nombre_completo}</td>
                <td>${u.email}</td>
                <td><span class="badge" style="background:#e2e8f0; color:#475569;">${u.rol.toUpperCase()}</span></td>
                <td>
                    <select onchange="cambiarRol('${u.id}', this.value)" style="padding:4px; font-size:0.8rem; border-radius:4px; margin-bottom: 5px; width:100%;">
                        <option value="" disabled selected>Cambiar a...</option>
                        <option value="superadmin">Superadmin</option>
                        <option value="admin">Admin (Chofer)</option>
                        <option value="estudiante">Estudiante</option>
                    </select>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-outline" style="padding: 2px 5px; font-size: 0.7rem; flex:1; border-color:#d97706; color:#d97706;" onclick="desaprobarUsuario('${u.id}')">Desaprobar</button>
                        <button class="btn btn-outline" style="padding: 2px 5px; font-size: 0.7rem; flex:1; border-color:var(--error); color:var(--error);" onclick="eliminarUsuario('${u.id}')">Eliminar</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

async function desaprobarUsuario(id) {
    if(id === session.id) return Swal.fire('Error', 'No puedes desaprobarte a ti mismo.', 'error');
    Swal.fire({
        title: '¿Desaprobar usuario?',
        text: "Volverá a la lista de pendientes.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, desaprobar'
    }).then(async (result) => {
        if(result.isConfirmed) {
            try {
                await window.db.from('usuarios').update({ estado_aprobacion: 'pendiente' }).eq('id', id);
                Swal.fire('Hecho', 'Usuario desaprobado.', 'success');
                loadDashboard();
            } catch(e) { Swal.fire('Error', 'No se pudo desaprobar.', 'error'); }
        }
    });
}

async function eliminarUsuario(id) {
    if(id === session.id) return Swal.fire('Error', 'No puedes eliminarte a ti mismo.', 'error');
    Swal.fire({
        title: '¿Eliminar usuario permanentemente?',
        text: "Esta acción no se puede deshacer.",
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'ELIMINAR',
        confirmButtonColor: '#ef4444'
    }).then(async (result) => {
        if(result.isConfirmed) {
            try {
                await window.db.from('usuarios').delete().eq('id', id);
                Swal.fire('Eliminado', 'El usuario fue eliminado.', 'success');
                loadDashboard();
            } catch(e) { Swal.fire('Error', 'No se pudo eliminar.', 'error'); }
        }
    });
}

function ampliarFoto(src, nombre) {
    Swal.fire({
        title: nombre,
        imageUrl: src,
        imageWidth: 300,
        imageAlt: 'Foto de perfil',
        confirmButtonText: 'Cerrar'
    });
}

async function cambiarRol(id, nuevoRol) {
    try {
        await window.db.from('usuarios').update({ rol: nuevoRol }).eq('id', id);
        Swal.fire('Actualizado', 'Rol cambiado con éxito.', 'success');
        renderRoles();
    } catch(e) {
        Swal.fire('Error', 'No se pudo cambiar el rol.', 'error');
    }
}

async function vaciarBaseDeDatos() {
    const { value: code } = await Swal.fire({
        title: 'VACIADO DE BASE DE DATOS',
        text: 'Esta acción borrará TODOS los usuarios, viajes, transportes y GPS, excepto tu propia cuenta de Superadmin. Ingresa el código de seguridad para proceder:',
        input: 'password',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ELIMINAR TODO',
        cancelButtonText: 'Cancelar'
    });

    if (code) {
        if (code.trim() !== '0809') {
            return Swal.fire('Error', 'Código de seguridad incorrecto.', 'error');
        }

        const { value: password } = await Swal.fire({
            title: 'Verificación Adicional',
            text: 'Ingresa tu contraseña de Superadmin para confirmar:',
            input: 'password',
            showCancelButton: true
        });

        if (password) {
            if (password !== session.password) {
                return Swal.fire('Error', 'Contraseña incorrecta.', 'error');
            }

            // Ejecutar vaciado
            Swal.fire({ title: 'Vaciando sistema...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

            try {
                // El orden importa si hay dependencias (FK), aunque configuramos CASCADE en viajes, es mejor ser explícito
                await window.db.from('gps_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete All bypass
                await window.db.from('transportes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                await window.db.from('viajes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                // Eliminar todos los usuarios EXCEPTO la cuenta actual del superadmin
                await window.db.from('usuarios').delete().neq('id', session.id);

                Swal.fire('Completado', 'El sistema ha sido reseteado a cero (excepto tu cuenta).', 'success').then(() => {
                    window.location.reload();
                });
            } catch(e) {
                console.error(e);
                Swal.fire('Error crítico', 'Ocurrió un problema vaciando las tablas. Revisa permisos o constraints.', 'error');
            }
        }
    }
}

// ====== MAPAS Y RUTAS (LEAFLET ROUTING MACHINE) ======
const globalMap = L.map('global-map').setView([13.6929, -89.2182], 12); // Global map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(globalMap);

const routingMap = L.map('routing-map').setView([13.6929, -89.2182], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(routingMap);

let routeControl = L.Routing.control({
    waypoints: [],
    routeWhileDragging: true,
    language: 'es',
    show: false, // Ocultar el panel de instrucciones texto
    createMarker: function(i, wp, nWps) {
        const nombre = (wp.options && wp.options.nombre) ? wp.options.nombre : `Parada ${i+1}`;
        const tiempo = (wp.options && wp.options.tiempo) ? `<br>Hora est.: ${wp.options.tiempo}` : '';
        return L.marker(wp.latLng, { draggable: true }).bindPopup(`<b>${nombre}</b>${tiempo}`);
    }
}).addTo(routingMap);

// En caso de error de OSRM (ej. 429), ocultar el error visual pero mantener la ruta (solo que recta)
routeControl.on('routingerror', function(e) {
    console.warn('Error de enrutamiento OSRM (límite alcanzado). Dibujando línea recta en su lugar.', e);
});

// Click en el mapa para añadir paradas a la ruta
routingMap.on('click', async function(e) {
    const currentWaypoints = routeControl.getWaypoints().filter(w => w.latLng); // Filtrar nulos
    
    const { value: formValues } = await Swal.fire({
        title: `Detalles de Parada ${currentWaypoints.length + 1}`,
        html:
            '<input id="swal-p-nombre" class="swal2-input" placeholder="Nombre (Ej. Metrocentro)" style="width:80% !important;">' +
            '<input id="swal-p-tiempo" type="time" class="swal2-input" style="width:80% !important;">',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Añadir Parada',
        preConfirm: () => {
            return {
                nombre: document.getElementById('swal-p-nombre').value,
                tiempo: document.getElementById('swal-p-tiempo').value
            }
        }
    });

    if (formValues) {
        const wp = L.Routing.waypoint(e.latlng);
        wp.options = { 
            nombre: formValues.nombre || `Parada ${currentWaypoints.length + 1}`, 
            tiempo: formValues.tiempo || '' 
        };
        currentWaypoints.push(wp);
        routeControl.setWaypoints(currentWaypoints);
    }
});

// Guardar Viaje con su ruta
document.getElementById('btn-save-viaje').addEventListener('click', async () => {
    const titulo = document.getElementById('v-nombre').value.trim();
    const fecha = document.getElementById('v-fecha').value;
    const inicio_asientos = document.getElementById('v-inicio-asientos').value;
    const cierre_asientos = document.getElementById('v-cierre-asientos').value;
    
    if(!titulo || !fecha || !inicio_asientos || !cierre_asientos) return Swal.fire('Error', 'Completa todos los campos de fechas y nombres.', 'warning');
    
    const waypoints = routeControl.getWaypoints().filter(w => w.latLng);
    if(waypoints.length < 2) return Swal.fire('Error', 'Debes hacer clic en el mapa al menos dos veces (Origen y Destino).', 'warning');
    
    const waypointsJSON = waypoints.map(w => ({ 
        lat: w.latLng.lat, 
        lng: w.latLng.lng,
        nombre: w.options?.nombre || 'Parada',
        tiempo: w.options?.tiempo || ''
    }));

    const btn = document.getElementById('btn-save-viaje');
    btn.disabled = true;
    btn.innerText = "Guardando...";

    try {
        const { error } = await window.db.from('viajes').insert([{
            titulo,
            fecha_salida: fecha,
            inicio_asientos: inicio_asientos,
            cierre_asientos: cierre_asientos,
            ruta: waypointsJSON,
            inscripcion_abierta: true,
            estado: 'preparacion'
        }]);
        
        if (error) throw error;
        
        Swal.fire('¡Éxito!', 'Viaje programado correctamente.', 'success');
        
        // Limpiar
        document.getElementById('v-nombre').value = '';
        document.getElementById('v-fecha').value = '';
        document.getElementById('v-inicio-asientos').value = '';
        document.getElementById('v-cierre-asientos').value = '';
        routeControl.setWaypoints([]);
        
        loadDashboard(); // Refrescar listas
    } catch(e) {
        console.error(e);
        Swal.fire('Error', 'No se guardó el viaje.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = "Guardar Viaje y Ruta";
    }
});

function renderViajes(viajes) {
    const container = document.getElementById('lista-viajes');
    const selectTransporte = document.getElementById('t-viaje-select');
    const selectAsignacion = document.getElementById('a-viaje-select');
    
    container.innerHTML = '';
    selectTransporte.innerHTML = '<option value="">Seleccione un viaje...</option>';
    if(selectAsignacion) selectAsignacion.innerHTML = '<option value="">Seleccione un viaje...</option>';
    
    if(!viajes || viajes.length === 0) {
        container.innerHTML = '<p class="text-muted">No hay viajes programados.</p>';
        return;
    }
    
    viajes.forEach(v => {
        // Dropdown transportes y asignaciones
        selectTransporte.innerHTML += `<option value="${v.id}">${v.titulo} (${new Date(v.fecha_salida).toLocaleDateString()})</option>`;
        if(selectAsignacion) selectAsignacion.innerHTML += `<option value="${v.id}">${v.titulo}</option>`;
        
        // Tarjeta viaje
        const btnInscripcion = v.inscripcion_abierta 
            ? `<button class="btn btn-outline error btn-auto" onclick="toggleInscripcion('${v.id}', false)">Cerrar Inscripción</button>`
            : `<button class="btn btn-success btn-auto" onclick="toggleInscripcion('${v.id}', true)">Habilitar Inscripción</button>`;

        const btnCroquis = `<button class="btn btn-outline btn-auto" onclick="document.getElementById('admin-croquis-container').style.display='block'; window.scrollTo(0, document.getElementById('admin-croquis-container').offsetTop);">Ver Croquis</button>`;
        const btnEdit = `<button class="btn btn-outline btn-auto" onclick="editarViaje('${v.id}')">Editar</button>`;
        const btnDelete = `<button class="btn btn-danger btn-auto" onclick="eliminarViaje('${v.id}')">Eliminar</button>`;
        const btnRestart = v.estado === 'finalizado' ? `<button class="btn btn-warning btn-auto" style="background:#eab308; border-color:#ca8a04; color:#fff;" onclick="reiniciarViaje('${v.id}')">Reiniciar</button>` : '';

        container.innerHTML += `
            <div class="trip-item">
                <div class="trip-info">
                    <h4>${v.titulo}</h4>
                    <p>Fecha: ${new Date(v.fecha_salida).toLocaleString()}</p>
                    <p>Inscripción: <span class="badge" style="background:${v.inscripcion_abierta ? 'var(--success-light)' : 'var(--error-light)'}; color:${v.inscripcion_abierta ? 'var(--success)' : 'var(--error)'};">${v.inscripcion_abierta ? 'ABIERTA' : 'CERRADA'}</span></p>
                    <p>Estado: <b>${v.estado.toUpperCase()}</b></p>
                </div>
                <div class="btn-group">
                    ${btnRestart}
                    ${btnInscripcion}
                    ${btnCroquis}
                    ${btnEdit}
                    ${btnDelete}
                </div>
            </div>
        `;
    });
}

async function toggleInscripcion(id, estado) {
    try {
        await window.db.from('viajes').update({ inscripcion_abierta: estado }).eq('id', id);
        loadDashboard();
    } catch(e) { Swal.fire('Error', 'Fallo al cambiar estado.', 'error'); }
}

async function editarViaje(id) {
    const { data: viaje } = await window.db.from('viajes').select('*').eq('id', id).single();
    if(!viaje) return;

    const { value: formValues } = await Swal.fire({
        title: 'Editar Viaje',
        html:
            `<input id="swal-v-titulo" class="swal2-input" placeholder="Título" value="${viaje.titulo}">` +
            `<input id="swal-v-fecha" type="datetime-local" class="swal2-input" value="${viaje.fecha_salida.slice(0,16)}">` +
            `<label style="display:block; margin-top:10px; font-size:14px;">Inicio Selección Asientos:</label>` +
            `<input id="swal-v-inicio" type="datetime-local" class="swal2-input" value="${viaje.inicio_asientos.slice(0,16)}">` +
            `<label style="display:block; margin-top:10px; font-size:14px;">Cierre Selección Asientos:</label>` +
            `<input id="swal-v-cierre" type="datetime-local" class="swal2-input" value="${viaje.cierre_asientos.slice(0,16)}">`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        preConfirm: () => {
            return {
                titulo: document.getElementById('swal-v-titulo').value,
                fecha_salida: document.getElementById('swal-v-fecha').value,
                inicio_asientos: document.getElementById('swal-v-inicio').value,
                cierre_asientos: document.getElementById('swal-v-cierre').value
            }
        }
    });

    if (formValues) {
        try {
            await window.db.from('viajes').update(formValues).eq('id', id);
            Swal.fire('Guardado', 'El viaje ha sido actualizado.', 'success');
            loadDashboard();
        } catch(e) { Swal.fire('Error', 'No se pudo actualizar.', 'error'); }
    }
}

async function reiniciarViaje(id) {
    Swal.fire({
        title: '¿Reiniciar Viaje?',
        text: "Esto volverá a poner el viaje en estado de 'Preparación' para que el chofer lo vuelva a ver y se reabrirán las inscripciones.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, reiniciar'
    }).then(async (res) => {
        if(res.isConfirmed) {
            try {
                await window.db.from('viajes').update({ estado: 'preparacion', inscripcion_abierta: true }).eq('id', id);
                Swal.fire('Reiniciado', 'El viaje está activo de nuevo.', 'success');
                loadDashboard();
            } catch(e) { Swal.fire('Error', 'No se pudo reiniciar el viaje.', 'error'); }
        }
    });
}

async function eliminarViaje(id) {
    const res = await Swal.fire({
        title: '¿Estás seguro?',
        text: "Esta acción borrará el viaje, los transportes, y desasignará a todos los pasajeros inscritos.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, eliminar todo'
    });

    if(res.isConfirmed) {
        try {
            // 1. Liberar a los usuarios (poner viaje_id y transporte_id en null)
            await window.db.from('usuarios').update({ viaje_id: null, transporte_id: null, estado_viaje: 'ninguno', asiento: null }).eq('viaje_id', id);
            
            // 2. Eliminar transportes asociados (Supabase debería hacerlo si hay cascada, pero lo hacemos manual por si acaso)
            await window.db.from('transportes').delete().eq('viaje_id', id);

            // 3. Eliminar el viaje
            await window.db.from('viajes').delete().eq('id', id);
            
            Swal.fire('Eliminado', 'El viaje ha sido borrado.', 'success');
            loadDashboard();
        } catch(e) { 
            console.error(e);
            Swal.fire('Error', 'No se pudo eliminar completamente.', 'error'); 
        }
    }
}

// ====== TOPOLOGÍAS ======
let selectedTopo = 'bus_50';
document.querySelectorAll('.topo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.topo-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        selectedTopo = e.target.dataset.tipo;
    });
});

document.getElementById('form-transporte').addEventListener('submit', async (e) => {
    e.preventDefault();
    const viaje_id = document.getElementById('t-viaje-select').value;
    if(!viaje_id) return Swal.fire('Error', 'Selecciona un viaje.', 'warning');
    
    try {
        const { error } = await window.db.from('transportes').insert([{
            viaje_id,
            tipo: selectedTopo
        }]);
        if(error) throw error;
        Swal.fire('Guardado', 'Vehículo asignado al viaje.', 'success');
        loadDashboard();
    } catch(e) { Swal.fire('Error', 'No se pudo guardar.', 'error'); }
});

// Lógica de Asignación Manual
async function cargarAnotadosYVehiculos() {
    const viaje_id = document.getElementById('a-viaje-select').value;
    const tbody = document.querySelector('#table-asignacion tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>';
    
    if(!viaje_id) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Seleccione un viaje primero.</td></tr>';
        return;
    }
    
    try {
        // Traer transportes de este viaje
        const { data: transportes } = await window.db.from('transportes').select('*').eq('viaje_id', viaje_id);
        
        if(!transportes || transportes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--error);">Este viaje aún no tiene vehículos asignados.</td></tr>';
            return;
        }

        let opcionesTransporte = '<option value="" disabled selected>Asignar a...</option>';
        transportes.forEach((t, i) => {
            const tipoNom = t.tipo === 'bus_50' ? 'Autobús (50)' : (t.tipo === 'microbus_15' ? 'Microbús (15)' : 'Moto');
            opcionesTransporte += `<option value="${t.id}">Vehículo ${i+1}: ${tipoNom}</option>`;
        });

        // Traer usuarios anotados a este viaje (o que ya estén asignados)
        const { data: usuarios } = await window.db.from('usuarios').select('*').eq('viaje_id', viaje_id).in('estado_viaje', ['anotado', 'asignado']);
        
        if(!usuarios || usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay pasajeros anotados para este viaje.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        usuarios.forEach(u => {
            const fotoSrc = u.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nombre_completo)}&background=random`;
            
            // Reconstruir select con el value seleccionado si ya tiene transporte
            let userSelect = opcionesTransporte;
            if(u.transporte_id) {
                userSelect = userSelect.replace(`value="${u.transporte_id}"`, `value="${u.transporte_id}" selected`);
                userSelect = userSelect.replace('selected>Asignar', '>Asignar'); // Quitar el selected del placeholder
            }
            
            tbody.innerHTML += `
                <tr>
                    <td style="text-align:center;"><img src="${fotoSrc}" style="width:35px;height:35px;border-radius:50%;cursor:pointer;object-fit:cover;" onclick="ampliarFoto('${fotoSrc}', '${u.nombre_completo}')"></td>
                    <td>${u.nombre_completo} <br><small class="text-muted">${u.rol.toUpperCase()}</small></td>
                    <td>${u.dni || 'Menor'}</td>
                    <td>
                        <select onchange="asignarTransporteUsuario('${u.id}', this.value)" style="padding:4px; font-size:0.8rem; border-radius:4px;">
                            ${userSelect}
                        </select>
                        ${u.estado_viaje === 'asignado' ? '<span style="color:var(--success); font-size:12px; margin-left:5px;">✓ Asignado</span>' : ''}
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
            estado_viaje: 'asignado' 
        }).eq('id', userId);
        
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Asignado con éxito', showConfirmButton: false, timer: 1500 });
        cargarAnotadosYVehiculos(); // refrescar
    } catch(e) {
        Swal.fire('Error', 'No se pudo asignar.', 'error');
    }
}

let adminCroquisInterval = null;
let lastAdminOccupiedStr = "";

// ====== VIP CROQUIS ======
async function renderAdminCroquis() {
    const transporteId = document.getElementById('admin-vehiculo-select').value;
    const croquisDiv = document.getElementById('admin-croquis');
    
    if(!transporteId) {
        croquisDiv.innerHTML = '<div class="text-muted">Selecciona un vehículo para ver los asientos.</div>';
        if (adminCroquisInterval) clearInterval(adminCroquisInterval);
        return;
    }

    try {
        const { data: t } = await window.db.from('transportes').select('tipo, viaje_id').eq('id', transporteId).single();
        if(!t) return;
        
        // Usuarios del transporte
        const { data: usuarios } = await window.db.from('usuarios').select('*').eq('transporte_id', transporteId).not('asiento', 'is', null);
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
                            ${genAdminSeat(1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            ${genAdminSeat(2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
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
                                ${genAdminSeat(1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            </div>
                            <div class="steering-wheel"></div>
                        </div>

                        <!-- Columna 2: Puerta arriba, 3 asientos abajo -->
                        <div class="bus-column" style="justify-content: flex-end; gap: 0;">
                            <div class="seat-pair">
                                ${genAdminSeat(3, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(4, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(5, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            </div>
                        </div>

                        <!-- Columna 3: 1 asiento arriba, pasillo, 2 asientos abajo -->
                        <div class="bus-column" style="justify-content: space-between;">
                            ${genAdminSeat(6, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            <div class="seat-pair">
                                ${genAdminSeat(7, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(8, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            </div>
                        </div>

                        <!-- Columna 4: 1 asiento arriba, pasillo, 2 asientos abajo -->
                        <div class="bus-column" style="justify-content: space-between;">
                            ${genAdminSeat(9, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            <div class="seat-pair">
                                ${genAdminSeat(10, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(11, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            </div>
                        </div>

                        <!-- Columna 5: 4 asientos atrás -->
                        <div class="bus-column" style="justify-content: space-between; gap: 5px;">
                            ${genAdminSeat(12, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            ${genAdminSeat(13, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            ${genAdminSeat(14, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            ${genAdminSeat(15, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                        </div>
                    </div>`;
        } else { // Bus 50
            html = `<div class="bus-horizontal">
                            <div class="bus-front">
                                <div class="steering-wheel"></div>
                                <div style="width:50px; height:20px; background:#94a3b8; border-radius:10px;"></div>
                            </div>`;
                            
            for (let i = 1; i <= plazas; i+=4) {
                let topPair = `<div class="seat-pair">${genAdminSeat(i, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}${genAdminSeat(i+1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}</div>`;
                let bottomPair = '';
                
                if (i === 49) {
                    bottomPair = `<div style="width: 45px; height: 85px; background: #cbd5e1; border: 2px dashed #64748b; border-radius: 5px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; color:#475569; writing-mode: vertical-rl; transform: rotate(180deg);">WC</div>`;
                } else {
                    bottomPair = `<div class="seat-pair">${genAdminSeat(i+2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}${genAdminSeat(i+3, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}</div>`;
                }

                html += `<div class="bus-column">
                            ${topPair}
                            ${bottomPair}
                         </div>`;
            }
            
            html += `</div>`;
        }
        croquisDiv.innerHTML = html;
    } catch(e) {
        console.error(e);
    }
}

function genAdminSeat(numero, ocupadosInfo, miAsiento, viajeId, transporteId) {
    if(numero > 50 || numero <= 0 || !numero) return '';
    
    // Sólo es MI asiento si coincide el número de asiento Y si estoy registrado exactamente en ESTE transporte
    const esMio = (miAsiento == numero.toString() && session.transporte_id == transporteId);
    const usuarioAsiento = ocupadosInfo[numero.toString()];
    
    let clase = 'seat';
    let onclickFn = `seleccionarAsientoVIP(${numero}, '${viajeId}', '${transporteId}')`;
    
    if(esMio) {
        clase += ' selected';
    }
    else if(usuarioAsiento) {
        clase += ' occupied';
        const u = usuarioAsiento;
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
                    await window.db.from('usuarios').update({ asiento: null, estado_viaje: 'asignado', fecha_reserva: null }).eq('id', session.id);
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

    if (miAsiento) {
        Swal.fire({
            title: `¿Cambiar al Asiento VIP ${numero}?`,
            text: "Tu asiento anterior quedará libre.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, cambiar'
        }).then(async (res) => {
            if(res.isConfirmed) {
                try {
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
        return;
    }

    Swal.fire({
        title: `¿Ocupar asiento VIP ${numero}?`,
        text: "Como administrador, esto ignorará los horarios y te asignará a este viaje permanentemente.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Reservar VIP'
    }).then(async (res) => {
        if(res.isConfirmed) {
            try {
                await window.db.from('usuarios').update({
                    viaje_id: viajeId,
                    transporte_id: transporteId,
                    estado_viaje: 'asiento_elegido',
                    asiento: numero.toString(),
                    fecha_reserva: new Date().toISOString()
                }).eq('id', session.id);
                
                session.asiento = numero.toString();
                session.viaje_id = viajeId;
                session.transporte_id = transporteId;
                session.estado_viaje = 'asiento_elegido';
                localStorage.setItem('omni_user', JSON.stringify(session));
                
                Swal.fire('¡Éxito!', 'Asiento reservado.', 'success');
                lastAdminOccupiedStr = "";
                renderAdminCroquis();
            } catch(e) { Swal.fire('Error', 'Fallo al reservar.', 'error'); }
        }
    });
}

function cargarSelectAdminVehiculos(transportesArray) {
    const select = document.getElementById('admin-vehiculo-select');
    if(!select) return;
    select.innerHTML = '<option value="">Selecciona un vehículo...</option>';
    transportesArray.forEach((t, i) => {
        const tipoNom = t.tipo === 'bus_50' ? 'Autobús (50)' : (t.tipo === 'microbus_15' ? 'Microbús (15)' : 'Moto');
        select.innerHTML += `<option value="${t.id}">Vehículo ${i + 1} - ${tipoNom} [Viaje ${t.viaje_id.substring(0,4)}]</option>`;
    });
}

// Inicializar
loadDashboard();
setInterval(() => {
    if(document.getElementById('admin-vehiculo-select') && document.getElementById('admin-vehiculo-select').value) {
        renderAdminCroquis();
    }
}, 2500);
