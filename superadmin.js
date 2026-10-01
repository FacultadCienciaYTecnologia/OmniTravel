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
        
        // ====== SUSCRIPCIONES REALTIME ======
        if(!window.superadminChannel) {
            window.superadminChannel = window.db.channel('superadmin-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, () => {
                    loadDashboard(); // Recargar usuarios pendientes y roles
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'paradas_intermitentes' }, (payload) => {
                    const p = payload.new;
                    Swal.fire({
                        title: 'Nueva Solicitud de Parada',
                        text: 'Un estudiante ha solicitado una parada intermitente. ¿Deseas aprobarla?',
                        icon: 'info',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, aprobar',
                        cancelButtonText: 'Rechazar'
                    }).then(async (result) => {
                        const nuevoEstado = result.isConfirmed ? 'aprobada' : 'rechazada';
                        await window.db.from('paradas_intermitentes').update({estado: nuevoEstado}).eq('id', p.id);
                        if(result.isConfirmed) Swal.fire('Aprobada', 'Se notificó la parada.', 'success');
                    });
                })
                .subscribe();
        }

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
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                        <button class="btn btn-success" style="padding: 5px 10px; font-size: 0.8rem; flex:1;" onclick="aprobarUsuario('${u.id}')">Aprobar</button>
                        <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8rem; flex:1;" onclick="rechazarUsuario('${u.id}')">Rechazar / Eliminar</button>
                    </div>
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
                        <option value="admin">Administrador</option>
                        <option value="estudiante">Estudiante</option>
                    </select>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-outline" style="padding: 2px 5px; font-size: 0.7rem; flex:1; border-color:var(--error); color:var(--error);" onclick="eliminarUsuario('${u.id}')">Eliminar</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

async function rechazarUsuario(id) {
    Swal.fire({
        title: '¿Rechazar solicitud?',
        text: "El usuario será eliminado y tendrá que registrarse nuevamente si desea acceso.",
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Sí, rechazar y eliminar'
    }).then(async (result) => {
        if(result.isConfirmed) {
            try {
                await window.db.from('usuarios').delete().eq('id', id);
                Swal.fire('Eliminado', 'La solicitud ha sido rechazada y eliminada.', 'success');
                loadDashboard();
            } catch(e) { Swal.fire('Error', 'No se pudo rechazar la solicitud.', 'error'); }
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
        Swal.fire({ title: 'Actualizando rol y limpiando viajes...', didOpen: () => Swal.showLoading() });
        await window.db.from('usuarios').update({ 
            rol: nuevoRol,
            viaje_id: null,
            transporte_id: null,
            asiento: null,
            estado_viaje: 'ninguno',
            parada_id: null,
            fecha_reserva: null
        }).eq('id', id);
        
        // Failsafe: Si era admin y tenía transportes asignados, liberarlos.
        await window.db.from('transportes').update({ admin_id: null }).eq('admin_id', id);

        Swal.fire('Actualizado', 'Rol cambiado y asignaciones de viaje limpiadas con éxito.', 'success');
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
    router: L.Routing.osrmv1({
        serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1'
    }),
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

    Swal.fire({
        title: 'Guardando Viaje...',
        text: 'Por favor espera',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

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
    
    container.innerHTML = '';
    
    if(!viajes || viajes.length === 0) {
        container.innerHTML = '<p class="text-muted">No hay viajes programados.</p>';
        return;
    }
    
    viajes.forEach(v => {
        
        const btnTransportes = `<button class="btn btn-primary btn-auto" onclick="abrirModalTransportes('${v.id}', '${v.titulo}')">🚍 Transportes</button>`;
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
                <div class="btn-group" style="display:flex; gap:5px; flex-wrap:wrap;">
                    ${btnTransportes}
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

// ====== LÓGICA DE TRANSPORTES (MODAL) ======
async function abrirModalTransportes(viajeId, titulo) {
    document.getElementById('t-viaje-id').value = viajeId;
    document.getElementById('modal-t-titulo').innerText = `Transportes: ${titulo}`;
    
    await cargarTransportesModal(viajeId);
    document.getElementById('modal-transportes').style.display = 'block';
}

function cerrarModalTransportes() {
    document.getElementById('modal-transportes').style.display = 'none';
}

document.getElementById('form-transporte').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; // Prevenir doble clic

    Swal.fire({
        title: 'Procesando...',
        text: 'Subiendo vehículo e imagen, por favor espera...',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    const viajeId = document.getElementById('t-viaje-id').value;
    const tipo = document.getElementById('t-topologia-select').value;
    const adminId = document.getElementById('t-admin-select').value;
    
    const fileInput = document.getElementById('t-file-img');
    
    const procesarFormulario = async (imgDataUrl) => {
        try {
            const { data: newTransport, error } = await window.db.from('transportes').insert([{
                viaje_id: viajeId,
                tipo: tipo,
                imagen_url: imgDataUrl,
                admin_id: adminId
            }]).select().single();
            if(error) throw error;
            
            if (adminId) {
                await window.db.from('usuarios').update({ transporte_id: newTransport.id, viaje_id: viajeId }).eq('id', adminId);
            }
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Vehículo Agregado', showConfirmButton: false, timer: 1500 });
            cargarTransportesModal(viajeId);
            if(fileInput) fileInput.value = '';
        } catch(err) {
            Swal.fire('Error', 'No se pudo agregar.', 'error');
        } finally {
            btn.disabled = false;
        }
    };

    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        // Validar tamaño máximo (ej. 5MB)
        if(file.size > 5 * 1024 * 1024) {
            Swal.fire('Archivo muy grande', 'La imagen no debe superar los 5MB.', 'warning');
            btn.disabled = false;
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            procesarFormulario(evt.target.result);
        };
        reader.onerror = function() {
            Swal.fire('Error', 'No se pudo leer la imagen.', 'error');
            btn.disabled = false;
        }
        reader.readAsDataURL(file);
    } else {
        procesarFormulario('');
    }
});

async function cargarTransportesModal(viajeId) {
    const container = document.getElementById('lista-transportes-modal');
    container.innerHTML = '<p class="text-center">Cargando...</p>';
    
    try {
        // Traer transportes de este viaje
        const { data: transportes } = await window.db.from('transportes').select('*, admin:usuarios!admin_id(nombre_completo)').eq('viaje_id', viajeId);
        
        // Cargar Choferes (Admins) disponibles
        const { data: allTransportes } = await window.db.from('transportes').select('admin_id');
        const assignedAdmins = allTransportes ? allTransportes.map(t => t.admin_id) : [];
        const { data: admins } = await window.db.from('usuarios').select('id, nombre_completo').eq('rol', 'admin');
        
        const adminSelect = document.getElementById('t-admin-select');
        adminSelect.innerHTML = '<option value="">Seleccione un administrador...</option>';
        if(admins) {
            admins.forEach(a => {
                // Solo agregar si no está ya asignado a algún transporte
                if(!assignedAdmins.includes(a.id)) {
                    adminSelect.innerHTML += `<option value="${a.id}">${a.nombre_completo}</option>`;
                }
            });
        }
        
        // Traer SOLO los alumnos anotados a ESTE viaje
        const { data: anotados } = await window.db.from('usuarios').select('id, nombre_completo, transporte_id').eq('viaje_id', viajeId).in('estado_viaje', ['anotado', 'asignado', 'asiento_elegido']);
        
        if(!transportes || transportes.length === 0) {
            container.innerHTML = '<p class="text-muted">Aún no hay transportes asignados a este viaje.</p>';
            return;
        }

        container.innerHTML = '';
        transportes.forEach((t, index) => {
            const adminName = t.admin ? t.admin.nombre_completo : 'Sin Chofer';
            const imgHtml = t.imagen_url ? `<img src="${t.imagen_url}" style="width:100px; height:60px; object-fit:cover; border-radius:5px; margin-right:15px;">` : `<div style="width:100px; height:60px; background:#e2e8f0; border-radius:5px; margin-right:15px; display:flex; align-items:center; justify-content:center;">🚌</div>`;
            
            // Filtrar alumnos que ya están en este transporte
            const alumnosEnTransporte = anotados ? anotados.filter(a => a.transporte_id === t.id) : [];
            let listaAlumnosHtml = '';
            if(alumnosEnTransporte.length > 0) {
                listaAlumnosHtml = alumnosEnTransporte.map(a => `<span class="badge" style="background:#eff6ff; color:#1e40af; margin-right:5px; margin-bottom:5px; display:inline-block;">${a.nombre_completo} <b style="cursor:pointer;color:red;margin-left:5px;" onclick="quitarAlumnoDeTransporte('${a.id}', '${viajeId}')">x</b></span>`).join('');
            } else {
                listaAlumnosHtml = '<span class="text-muted" style="font-size:0.8rem;">Ningún alumno asignado aún.</span>';
            }

            container.innerHTML += `
                <div style="border:1px solid #cbd5e1; border-radius:8px; padding:15px; background:#fff; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
                        ${imgHtml}
                        <div>
                            <h4 style="margin:0;">Vehículo #${index + 1} - ${t.tipo.toUpperCase()}</h4>
                            <p style="margin:0; font-size:0.85rem; color:#64748b;">Chofer: ${adminName} <button class="btn btn-outline" style="padding:2px 5px; font-size:0.7rem; margin-left:5px;" onclick="cambiarChofer('${t.id}', '${t.admin_id}', '${viajeId}')">Cambiar</button></p>
                        </div>
                        <button class="btn btn-outline error" style="margin-left:auto; padding:5px 10px; font-size:0.8rem;" onclick="eliminarTransporte('${t.id}', '${viajeId}')">🗑️ Eliminar</button>
                    </div>
                    <div>
                        <div style="margin-bottom:10px;">
                            <p style="margin-bottom: 5px; font-size: 0.85rem; font-weight: bold; color: #475569;">Alumnos Asignados (por el Chofer):</p>
                            ${listaAlumnosHtml}
                        </div>
                    </div>
                </div>
            `;
        });
        
    } catch(e) {
        console.error(e);
        container.innerHTML = '<p class="text-muted">Error al cargar transportes.</p>';
    }
}

async function cambiarChofer(transporteId, oldAdminId, viajeId) {
    const { data: allTransportes } = await window.db.from('transportes').select('admin_id');
    const assignedAdmins = allTransportes ? allTransportes.map(t => t.admin_id) : [];
    const { data: admins } = await window.db.from('usuarios').select('id, nombre_completo').eq('rol', 'admin');
    
    let optionsHtml = '';
    let availableCount = 0;
    if(admins) {
        admins.forEach(a => {
            if(!assignedAdmins.includes(a.id)) {
                optionsHtml += `<option value="${a.id}">${a.nombre_completo}</option>`;
                availableCount++;
            }
        });
    }

    if (availableCount === 0) {
        return Swal.fire('Atención', 'No hay administradores disponibles. Todos están asignados a un transporte.', 'warning');
    }

    const { value: newAdminId } = await Swal.fire({
        title: 'Cambiar Chofer',
        html: `
            <select id="swal-new-admin" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none;">
                <option value="">Seleccione un nuevo chofer...</option>
                ${optionsHtml}
            </select>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        preConfirm: () => {
            const val = document.getElementById('swal-new-admin').value;
            if(!val) Swal.showValidationMessage('Debe seleccionar un chofer');
            return val;
        }
    });

    if (newAdminId) {
        try {
            Swal.fire({ title: 'Actualizando...', didOpen: () => Swal.showLoading() });
            await window.db.from('transportes').update({ admin_id: newAdminId }).eq('id', transporteId);
            
            if (oldAdminId && oldAdminId !== 'null' && oldAdminId !== 'undefined') {
                await window.db.from('usuarios').update({ transporte_id: null, viaje_id: null, asiento: null }).eq('id', oldAdminId);
            }
            await window.db.from('usuarios').update({ transporte_id: transporteId, viaje_id: viajeId }).eq('id', newAdminId);
            
            Swal.fire('¡Cambiado!', 'Se ha asignado el nuevo chofer.', 'success');
            cargarTransportesModal(viajeId);
        } catch(e) {
            Swal.fire('Error', 'Fallo al cambiar el chofer.', 'error');
        }
    }
}

async function quitarAlumnoDeTransporte(usuarioId, viajeId) {
    try {
        await window.db.from('usuarios').update({ transporte_id: null, asiento: null, estado_viaje: 'anotado' }).eq('id', usuarioId);
        cargarTransportesModal(viajeId);
    } catch(e) {}
}

async function asignarTransporteUsuario(usuarioId, transporteId, viajeId) {
    if(!usuarioId) return;
    try {
        await window.db.from('usuarios').update({ 
            transporte_id: transporteId,
            viaje_id: viajeId,
            estado_viaje: 'asignado',
            asiento: null // Se reinicia el asiento al cambiar de transporte
        }).eq('id', usuarioId);
        cargarTransportesModal(viajeId);
    } catch(e) { Swal.fire('Error', 'No se pudo asignar.', 'error'); }
}

async function eliminarTransporte(transporteId, viajeId) {
    Swal.fire({
        title: '¿Eliminar vehículo?',
        text: 'Los alumnos asignados quedarán sin vehículo (estado anotado).',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar'
    }).then(async (res) => {
        if(res.isConfirmed) {
            try {
                // Desasignar alumnos
                await window.db.from('usuarios').update({ transporte_id: null, asiento: null, estado_viaje: 'anotado' }).eq('transporte_id', transporteId);
                // Eliminar transporte
                await window.db.from('transportes').delete().eq('id', transporteId);
                cargarTransportesModal(viajeId);
            } catch(e) {}
        }
    });
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
                <div class="bus-vertical-container" style="max-width: 150px;">
                    <div class="bus-v-front">
                        <div class="steering-wheel-v"></div>
                    </div>
                    <div class="bus-v-row" style="justify-content: center;">
                        <div class="bus-v-group">
                            ${genAdminSeat(1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            ${genAdminSeat(2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
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
                                ${genAdminSeat(1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            </div>
                        </div>

                        <!-- Fila 2: 3 asientos -->
                        <div class="bus-v-row">
                            <div class="bus-v-group" style="width: 100%; justify-content: flex-end;">
                                ${genAdminSeat(3, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(4, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(5, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            </div>
                        </div>

                        <!-- Fila 3: 1, pasillo, 2 -->
                        <div class="bus-v-row">
                            ${genAdminSeat(6, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            <div class="bus-v-aisle"></div>
                            <div class="bus-v-group">
                                ${genAdminSeat(7, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(8, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            </div>
                        </div>

                        <!-- Fila 4: 1, pasillo, 2 -->
                        <div class="bus-v-row">
                            ${genAdminSeat(9, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            <div class="bus-v-aisle"></div>
                            <div class="bus-v-group">
                                ${genAdminSeat(10, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                                ${genAdminSeat(11, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            </div>
                        </div>

                        <!-- Fila 5: 4 asientos seguidos -->
                        <div class="bus-v-row" style="justify-content: space-between;">
                            ${genAdminSeat(12, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            ${genAdminSeat(13, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            ${genAdminSeat(14, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                            ${genAdminSeat(15, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}
                        </div>
                    </div>`;
        } else { // Bus 50
            html = `<div class="bus-vertical-container">
                            <div class="bus-v-front">
                                <div class="steering-wheel-v"></div>
                                <div style="width:40px; height:20px; background:#94a3b8; border-radius:10px;"></div>
                            </div>`;
                            
            for (let i = 1; i <= plazas; i+=4) {
                let topPair = `<div class="bus-v-group">${genAdminSeat(i, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}${genAdminSeat(i+1, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}</div>`;
                let bottomPair = '';
                
                if (i === 49) {
                    bottomPair = `<div style="width: 85px; height: 42px; background: #cbd5e1; border: 2px dashed #64748b; border-radius: 5px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; color:#475569;">BAÑO</div>`;
                } else {
                    bottomPair = `<div class="bus-v-group">${genAdminSeat(i+2, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}${genAdminSeat(i+3, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId)}</div>`;
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
    } catch(e) {
        console.error(e);
    }
}

function genAdminSeat(numero, ocupadosInfo, miAsiento, viajeId, transporteId) {
    if(numero > 50 || numero <= 0 || !numero) return '';
    
    // Sólo es MI asiento si coincide el número de asiento Y si estoy registrado exactamente en ESTE transporte
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
                    const { error } = await window.db.from('usuarios').update({ asiento: null, estado_viaje: 'asignado', fecha_reserva: null }).eq('id', session.id);
                    if (error) throw error;
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
                    const { error } = await window.db.from('usuarios').update({ asiento: numero.toString(), fecha_reserva: new Date().toISOString() }).eq('id', session.id);
                    if (error) throw error;
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
                // Doble check
                const { data: check } = await window.db.from('usuarios').select('id').eq('transporte_id', transporteId).eq('asiento', numero.toString()).limit(1);
                if (check && check.length > 0) {
                    return Swal.fire('Error', 'Ese asiento acaba de ser tomado.', 'error');
                }

                const { error } = await window.db.from('usuarios').update({
                    viaje_id: viajeId,
                    transporte_id: transporteId,
                    estado_viaje: 'asiento_elegido',
                    asiento: numero.toString(),
                    fecha_reserva: new Date().toISOString()
                }).eq('id', session.id);
                if (error) throw error;
                
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
    const currentVal = select.value; // Guardar estado
    select.innerHTML = '<option value="">Selecciona un vehículo...</option>';
    transportesArray.forEach((t, i) => {
        const tipoNom = t.tipo === 'bus_50' ? 'Autobús (50)' : (t.tipo === 'microbus_15' ? 'Microbús (15)' : 'Moto');
        select.innerHTML += `<option value="${t.id}">Vehículo ${i + 1} - ${tipoNom} [Viaje ${t.viaje_id.substring(0,4)}]</option>`;
    });
    if(currentVal) select.value = currentVal; // Restaurar estado
}

// Inicializar
loadDashboard();

// ====== SUSCRIPCIONES REALTIME ======
if (!window.superadminChannel) {
    window.superadminChannel = window.db.channel('superadmin-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, (payload) => {
            // Actualizar tablas de usuarios y croquis si hay admin seleccionado
            loadDashboard(); // Refresca stats y pendientes
            if(document.getElementById('admin-vehiculo-select') && document.getElementById('admin-vehiculo-select').value) {
                renderAdminCroquis();
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
            loadDashboard(); // Refresca lista de viajes
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_logs' }, (payload) => {
            // Refrescar mapa si estamos viendo la ruta activa
            if(window.currentViajeMonitoreo) {
                verRutaActiva(window.currentViajeMonitoreo);
            }
        })
        .subscribe();
}
