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
        if(item.dataset.target === 'dashboard') {
            setTimeout(() => { globalMap.invalidateSize(); }, 100);
        }
        if(item.dataset.target === 'evidencias') cargarEvidencias();
        if(item.dataset.target === 'asignacion') cargarAsignacionPanel();
    });
});

// ====== CARGA DE DATOS INICIALES ======
async function loadDashboard() {
    try {
        // Refrescar perfil para verificar si le quitaron el rol
        const { data: me, error } = await window.db.from('usuarios').select('*').eq('id', session.id).single();
        if (error || !me) {
            localStorage.removeItem('omni_user');
            window.location.href = 'index.html';
            return;
        }
        if(me) {
            if(me.rol !== 'superadmin') {
                Object.assign(session, me);
                localStorage.setItem('omni_user', JSON.stringify(session));
                window.location.href = 'index.html';
                return;
            }
            Object.assign(session, me);
            localStorage.setItem('omni_user', JSON.stringify(session));
        }

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
        pintarGpsGlobal();
        cargarBiblioteca();
        cargarEvidencias();

        // Transportes
        const { data: transportes } = await window.db.from('transportes').select('*');
        document.getElementById('stat-transportes').innerText = transportes ? transportes.length : 0;
        
        cargarSelectAdminVehiculos(transportes || []);
        
        // ====== SUSCRIPCIONES REALTIME SUPERADMIN ======
        if(!window.superadminChannel) {
            window.superadminChannel = window.db.channel('superadmin-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, (payload) => {
                    // Si el usuario fue eliminado
                    if (payload.eventType === 'DELETE' && payload.old && payload.old.id === session.id) {
                        localStorage.removeItem('omni_user');
                        Swal.fire('Cuenta Eliminada', 'Tu cuenta ya no está disponible. Serás redirigido.', 'error').then(() => {
                            window.location.href = 'index.html';
                        });
                        return;
                    }

                    if (payload.new && payload.new.id === session.id) {
                        if(payload.new.rol !== 'superadmin') {
                            Object.assign(session, payload.new);
                            localStorage.setItem('omni_user', JSON.stringify(session));
                            Swal.fire('Rol Modificado', 'Has dejado de ser Superadmin. Serás redirigido.', 'info').then(() => {
                                window.location.href = 'index.html';
                            });
                            return;
                        }
                    }

                    // Recargar silenciosamente sin SweetAlerts
                    window.db.from('usuarios').select('id, estado_aprobacion, rol').neq('rol', 'superadmin').then(({ data: users }) => {
                        if(users) {
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
                            renderRoles(aprobados);
                        }
                    });
                    
                    // Actualizar croquis en tiempo real si el superadmin lo está viendo
                    if(document.getElementById('admin-vehiculo-select') && document.getElementById('admin-vehiculo-select').value) {
                        lastAdminOccupiedStr = "";
                        renderAdminCroquis();
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
                    loadDashboard(); // Refresca lista de viajes
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'paradas_intermitentes' }, async (payload) => {
                    const p = payload.new;
                    const info = clasificarSolicitud(p);
                    const { data: u } = await window.db.from('usuarios').select('nombre_completo').eq('id', p.usuario_id).maybeSingle();
                    const nombre = u ? u.nombre_completo : 'Un estudiante';
                    const tipoTxt = info.tipo === 'abordaje' ? 'subirse' : 'una parada durante el recorrido';
                    Swal.fire({
                        title: 'Solicitud de parada',
                        text: nombre + ' solicitó ' + tipoTxt + (info.nombre ? ' en ' + info.nombre : '') + '.',
                        icon: 'info',
                        showCancelButton: true,
                        confirmButtonText: 'Aprobar',
                        cancelButtonText: 'Rechazar'
                    }).then(async (result) => {
                        await resolverSolicitudGuardada(p, result.isConfirmed ? 'aprobada' : 'rechazada');
                    });
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_logs' }, (payload) => {
                    if (window.currentViajeMonitoreo) verRutaActiva(window.currentViajeMonitoreo, true);
                    else pintarGpsGlobal();
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

routeControl.on('routesfound', function() { pintarParadasEditor(); });

function leerWaypoints() {
    return routeControl.getWaypoints().filter((w) => w.latLng);
}

function sincronizarMetaParadas() {
    const wps = leerWaypoints();
    const previa = window.metaParadas || [];
    window.metaParadas = wps.map((w, i) => {
        const porDist = previa.find((m) => distanciaMetros(m.lat, m.lng, w.latLng.lat, w.latLng.lng) < 80);
        const base = porDist || previa[i] || {};
        const nombre = (w.options && w.options.nombre) || w.name || base.nombre || ('Parada ' + (i + 1));
        const tiempo = (w.options && w.options.tiempo) ? w.options.tiempo : (base.tiempo || '');
        w.options = Object.assign({}, w.options, { nombre: nombre, tiempo: tiempo });
        return { lat: w.latLng.lat, lng: w.latLng.lng, nombre: nombre, tiempo: tiempo };
    });
}

function pintarParadasEditor() {
    const lista = document.getElementById('lista-paradas-editor');
    if (!lista) return;
    sincronizarMetaParadas();
    const puntos = window.metaParadas || [];
    if (!puntos.length) {
        lista.innerHTML = '<p class="text-muted" style="padding:0.75rem;">Todavía no hay puntos. Haga clic en el mapa.</p>';
        return;
    }
    lista.innerHTML = puntos.map((p, i) => {
        const hora = p.tiempo ? ' · ' + escaparHtml(p.tiempo) : '';
        return `<div class="parada-editor-item"><span><b>${i + 1}.</b> ${escaparHtml(p.nombre)}${hora}</span><button type="button" class="btn btn-outline btn-auto" onclick="quitarParada(${i})">Quitar</button></div>`;
    }).join('');
}

function quitarParada(indice) {
    const wps = leerWaypoints();
    if (indice < 0 || indice >= wps.length) return;
    const meta = (window.metaParadas || []).slice();
    meta.splice(indice, 1);
    wps.splice(indice, 1);
    window.metaParadas = meta;
    routeControl.setWaypoints(wps);
    pintarParadasEditor();
}

function salirModoEdicion() {
    window.viajeEnEdicion = null;
    const aviso = document.getElementById('aviso-edicion');
    if (aviso) aviso.style.display = 'none';
    const btn = document.getElementById('btn-save-viaje');
    if (btn) btn.innerText = 'Guardar Viaje y Ruta';
}

function cancelarEdicionViaje() {
    salirModoEdicion();
    document.getElementById('v-nombre').value = '';
    document.getElementById('v-fecha').value = '';
    document.getElementById('v-inicio-asientos').value = '';
    document.getElementById('v-cierre-asientos').value = '';
    document.getElementById('v-modo-gps').value = '';
    window.metaParadas = [];
    routeControl.setWaypoints([]);
    pintarParadasEditor();
}

function aDatetimeLocal(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor).slice(0, 16);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

async function editarRecorrido(id) {
    const { data: viaje, error } = await window.db.from('viajes').select('*').eq('id', id).single();
    if (error || !viaje) return Swal.fire('Viaje', 'No se pudo abrir el recorrido.', 'error');
    window.viajeEnEdicion = viaje;
    const item = document.querySelector('.menu-item[data-target="viajes"]');
    if (item) item.click();
    document.getElementById('v-nombre').value = viaje.titulo || '';
    document.getElementById('v-fecha').value = aDatetimeLocal(viaje.fecha_salida);
    document.getElementById('v-inicio-asientos').value = aDatetimeLocal(viaje.inicio_asientos);
    document.getElementById('v-cierre-asientos').value = aDatetimeLocal(viaje.cierre_asientos);
    document.getElementById('v-modo-gps').value = modoGpsDe(viaje);
    const puntos = puntosDeRuta(viaje.ruta);
    window.metaParadas = puntos.map((p, i) => ({
        lat: p.lat,
        lng: p.lng,
        nombre: p.nombre || ('Parada ' + (i + 1)),
        tiempo: p.tiempo || ''
    }));
    routeControl.setWaypoints(window.metaParadas.map((p) => L.Routing.waypoint(L.latLng(p.lat, p.lng), p.nombre, { nombre: p.nombre, tiempo: p.tiempo })));
    document.getElementById('aviso-edicion').style.display = 'block';
    document.getElementById('aviso-edicion-titulo').innerText = 'Editando: ' + (viaje.titulo || 'viaje');
    document.getElementById('btn-save-viaje').innerText = 'Guardar cambios del recorrido';
    pintarParadasEditor();
    setTimeout(() => {
        routingMap.invalidateSize();
        if (puntos.length) routingMap.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng])), { padding: [24, 24] });
    }, 250);
}

document.getElementById('btn-quitar-ultima').addEventListener('click', () => {
    const total = leerWaypoints().length;
    if (!total) return;
    quitarParada(total - 1);
});
document.getElementById('btn-cancelar-edicion').addEventListener('click', cancelarEdicionViaje);

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
            '<input id="swal-p-nombre" class="swal2-input" placeholder="Nombre (ejemplo: UGB San Miguel)" style="width:80% !important;">' +
            '<input id="swal-p-tiempo" type="time" class="swal2-input" style="width:80% !important;">' +
            '<label style="display:flex; gap:8px; align-items:center; justify-content:center; margin-top:8px;"><input type="checkbox" id="swal-p-bib" checked> Guardar en la biblioteca</label>',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Añadir a este viaje',
        preConfirm: () => {
            return {
                nombre: document.getElementById('swal-p-nombre').value,
                tiempo: document.getElementById('swal-p-tiempo').value,
                biblioteca: document.getElementById('swal-p-bib').checked
            }
        }
    });

    window.ultimoPuntoMapa = e.latlng;
    if (formValues) {
        const nombre = formValues.nombre || `Parada ${currentWaypoints.length + 1}`;
        const wp = L.Routing.waypoint(e.latlng);
        wp.options = { nombre, tiempo: formValues.tiempo || '' };
        currentWaypoints.push(wp);
        routeControl.setWaypoints(currentWaypoints);
        if (formValues.biblioteca && formValues.nombre) {
            await guardarEnBiblioteca(formValues.nombre.trim(), e.latlng.lat, e.latlng.lng);
        }
    }
});

// Guardar Viaje con su ruta
document.getElementById('btn-save-viaje').addEventListener('click', async () => {
    const titulo = document.getElementById('v-nombre').value.trim();
    const fecha = document.getElementById('v-fecha').value;
    const inicio_asientos = document.getElementById('v-inicio-asientos').value;
    const cierre_asientos = document.getElementById('v-cierre-asientos').value;
    const modo_gps = document.getElementById('v-modo-gps').value;
    
    if(!titulo || !fecha || !inicio_asientos || !cierre_asientos || !modo_gps) return Swal.fire('Datos incompletos', 'Complete el nombre, las fechas y el modo de GPS.', 'warning');
    
    const waypoints = leerWaypoints();
    if(waypoints.length < 2) return Swal.fire('Error', 'Debe haber al menos dos puntos en el mapa: salida y destino.', 'warning');
    sincronizarMetaParadas();
    const waypointsJSON = (window.metaParadas || []).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        nombre: p.nombre || 'Parada',
        tiempo: p.tiempo || ''
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
        const ruta = conModoGps(waypointsJSON, modo_gps);
        const editando = window.viajeEnEdicion;
        const { error } = editando
            ? await window.db.from('viajes').update({
                titulo,
                fecha_salida: fecha,
                inicio_asientos: inicio_asientos,
                cierre_asientos: cierre_asientos,
                ruta: ruta
            }).eq('id', editando.id)
            : await window.db.from('viajes').insert([{
                titulo,
                fecha_salida: fecha,
                inicio_asientos: inicio_asientos,
                cierre_asientos: cierre_asientos,
                ruta: ruta,
                inscripcion_abierta: true,
                estado: 'preparacion'
            }]);
        
        if (error) throw error;
        
        Swal.fire('Guardado', editando ? 'El recorrido quedó actualizado.' : 'Viaje programado correctamente.', 'success');
        cancelarEdicionViaje();
        
        loadDashboard(); // Refrescar listas
    } catch(e) {
        console.error(e);
        Swal.fire('Error', 'No se guardó el viaje.', 'error');
    } finally {
        btn.disabled = false;
        if (!window.viajeEnEdicion) btn.innerText = "Guardar Viaje y Ruta";
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
        
        const btnTransportes = `<button class="btn btn-primary btn-auto" onclick="abrirModalTransportes('${v.id}', '${escaparHtml(v.titulo).replace(/'/g, '')}')">Transportes</button>`;
        const btnAsignar = `<button class="btn btn-outline btn-auto" onclick="irAAsignacion('${v.id}')">Asignar pasajeros</button>`;
        const btnInscripcion = v.inscripcion_abierta 
            ? `<button class="btn btn-outline error btn-auto" onclick="toggleInscripcion('${v.id}', false)">Cerrar Inscripción</button>`
            : `<button class="btn btn-success btn-auto" onclick="toggleInscripcion('${v.id}', true)">Habilitar Inscripción</button>`;

        const btnCroquis = `<button class="btn btn-outline btn-auto" onclick="document.getElementById('admin-croquis-container').style.display='block'; window.scrollTo(0, document.getElementById('admin-croquis-container').offsetTop);">Ver Croquis</button>`;
        const btnRuta = `<button class="btn btn-outline btn-auto" onclick="editarRecorrido('${v.id}')">Editar recorrido</button>`;
        const btnEdit = `<button class="btn btn-outline btn-auto" onclick="editarViaje('${v.id}')">Editar datos</button>`;
        const btnMapa = `<button class="btn btn-outline btn-auto" onclick="verRutaActiva('${v.id}')">Ver en mapa</button>`;
        const btnDelete = `<button class="btn btn-danger btn-auto" onclick="eliminarViaje('${v.id}')">Eliminar</button>`;
        const btnRestart = v.estado === 'finalizado' ? `<button class="btn btn-warning btn-auto" style="background:#eab308; border-color:#ca8a04; color:#fff;" onclick="reiniciarViaje('${v.id}')">Reiniciar</button>` : '';

        container.innerHTML += `
            <div class="trip-item">
                <div class="trip-info">
                    <h4>${v.titulo}</h4>
                    <p>Fecha: ${new Date(v.fecha_salida).toLocaleString()}</p>
                    <p>Inscripción: <span class="badge" style="background:${v.inscripcion_abierta ? 'var(--success-light)' : 'var(--error-light)'}; color:${v.inscripcion_abierta ? 'var(--success)' : 'var(--error)'};">${v.inscripcion_abierta ? 'ABIERTA' : 'CERRADA'}</span></p>
                    <p>Estado: <b>${escaparHtml(v.estado).toUpperCase()}</b></p>
                    <p>GPS: <b>${modoGpsDe(v) === 'caravana' ? 'Caravana' : 'Por transporte'}</b></p>
                </div>
                <div class="btn-group" style="display:flex; gap:5px; flex-wrap:wrap;">
                    ${btnTransportes}
                    ${btnAsignar}
                    ${btnMapa}
                    ${btnRestart}
                    ${btnInscripcion}
                    ${btnCroquis}
                    ${btnRuta}
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
            `<label style="display:block; margin-top:10px; font-size:14px;">Cierre de selección de asientos</label>` +
            `<input id="swal-v-cierre" type="datetime-local" class="swal2-input" value="${viaje.cierre_asientos.slice(0,16)}">` +
            `<label style="display:block; margin-top:10px; font-size:14px;">Transmisión GPS</label>` +
            `<select id="swal-v-gps" class="swal2-input">
                <option value="por_transporte" ${modoGpsDe(viaje) !== 'caravana' ? 'selected' : ''}>Cada transporte transmite su ubicación</option>
                <option value="caravana" ${modoGpsDe(viaje) === 'caravana' ? 'selected' : ''}>Una sola ubicación para la caravana</option>
            </select>`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        preConfirm: () => {
            return {
                titulo: document.getElementById('swal-v-titulo').value,
                fecha_salida: document.getElementById('swal-v-fecha').value,
                inicio_asientos: document.getElementById('swal-v-inicio').value,
                cierre_asientos: document.getElementById('swal-v-cierre').value,
                modo_gps: document.getElementById('swal-v-gps').value
            }
        }
    });

    if (formValues) {
        try {
            const modo = formValues.modo_gps;
            await window.db.from('viajes').update({
                titulo: formValues.titulo,
                fecha_salida: formValues.fecha_salida,
                inicio_asientos: formValues.inicio_asientos,
                cierre_asientos: formValues.cierre_asientos,
                ruta: conModoGps(puntosDeRuta(viaje.ruta), modo)
            }).eq('id', id);
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
        const { data: anotados } = await window.db.from('usuarios').select('id, nombre_completo, dni, transporte_id, rol').eq('viaje_id', viajeId).in('estado_viaje', ['anotado', 'asignado', 'asiento_elegido']);
        
        if(!transportes || transportes.length === 0) {
            container.innerHTML = '<p class="text-muted">Aún no hay transportes en este viaje. Agregue las unidades y después asigne a cada persona.</p>';
            renderAsignacionSuper(viajeId, [], anotados || []);
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
                        <button class="btn btn-outline error" style="margin-left:auto; padding:5px 10px; font-size:0.8rem;" onclick="eliminarTransporte('${t.id}', '${viajeId}')">Eliminar</button>
                    </div>
                    <div>
                        <div style="margin-bottom:10px;">
                            <p style="margin-bottom: 5px; font-size: 0.85rem; font-weight: bold; color: #475569;">Pasajeros en esta unidad</p>
                            ${listaAlumnosHtml}
                        </div>
                    </div>
                </div>
            `;
        });
        renderAsignacionSuper(viajeId, transportes, anotados || []);
        
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
        const transporteSel = document.getElementById('admin-vehiculo-select').value;
        croquisDiv.innerHTML = htmlAsientos(plazasPorTipo(t.tipo), (n) => genAdminSeat(n, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteSel));

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
        const tipoNom = nombreTipoTransporte(t.tipo);
        select.innerHTML += `<option value="${t.id}">Vehículo ${i + 1} - ${tipoNom} [Viaje ${t.viaje_id.substring(0,4)}]</option>`;
    });
    if(currentVal) select.value = currentVal; // Restaurar estado
}

function renderAsignacionSuper(viajeId, transportes, anotados) {
    const tbody = document.getElementById('tabla-asignacion-super');
    if (!tbody) return;
    const filtro = document.getElementById('filtro-sin-asignar');
    let lista = (anotados || []).filter((u) => u.rol === 'estudiante');
    if (filtro && filtro.checked) lista = lista.filter((u) => !u.transporte_id);
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="3">No hay pasajeros en este filtro.</td></tr>';
        return;
    }
    const cupo = {};
    (anotados || []).forEach((u) => {
        if (u.transporte_id) cupo[u.transporte_id] = (cupo[u.transporte_id] || 0) + 1;
    });
    tbody.innerHTML = '';
    lista.forEach((u) => {
        let opciones = '<option value="">Sin asignar</option>';
        (transportes || []).forEach((t, i) => {
            const plazas = plazasPorTipo(t.tipo);
            const usados = cupo[t.id] || 0;
            const lleno = usados >= plazas && u.transporte_id !== t.id;
            const selected = u.transporte_id === t.id ? ' selected' : '';
            opciones += `<option value="${t.id}"${selected}${lleno ? ' disabled' : ''}>${nombreTipoTransporte(t.tipo)} ${i + 1} (${usados}/${plazas})</option>`;
        });
        tbody.innerHTML += `<tr>
            <td>${escaparHtml(u.nombre_completo)}</td>
            <td>${escaparHtml(u.dni || 'Menor')}</td>
            <td><select onchange="asignarDesdeSuper('${u.id}', this.value, '${viajeId}')">${opciones}</select></td>
        </tr>`;
    });
}

async function asignarDesdeSuper(usuarioId, transporteId, viajeId) {
    if (!transporteId) {
        await quitarAlumnoDeTransporte(usuarioId, viajeId);
        return;
    }
    await asignarTransporteUsuario(usuarioId, transporteId, viajeId);
}

function irAAsignacion(viajeId) {
    window.asignacionViajeId = viajeId || '';
    cerrarModalTransportes();
    const item = document.querySelector('.menu-item[data-target="asignacion"]');
    if (item) item.click();
}

async function cargarAsignacionPanel() {
    const { data: viajes } = await window.db.from('viajes').select('id, titulo');
    window.viajesAsignacion = viajes || [];
    const sel = document.getElementById('asig-viaje');
    if (!sel) return;
    const previo = window.asignacionViajeId || sel.value;
    sel.innerHTML = '<option value="">Seleccione un viaje</option>' + window.viajesAsignacion.map((v) => `<option value="${v.id}">${escaparHtml(v.titulo)}</option>`).join('');
    if (previo && window.viajesAsignacion.some((v) => v.id === previo)) sel.value = previo;
    window.personasAsignacion = null;
    await pintarAsignacion();
}

async function pintarAsignacion(usarCache) {
    const sel = document.getElementById('asig-viaje');
    const resumen = document.getElementById('asig-resumen');
    const tbody = document.getElementById('asig-tbody');
    if (!sel || !tbody) return;
    const viajeId = sel.value;
    window.asignacionViajeId = viajeId;
    if (!viajeId) {
        if (resumen) resumen.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="4">Seleccione un viaje.</td></tr>';
        return;
    }
    if (!usarCache || !window.personasAsignacion) {
        const consultaT = window.db.from('transportes').select('id, tipo, viaje_id').eq('viaje_id', viajeId);
        const consultaP = window.db.from('usuarios').select('id, nombre_completo, dni, rol, viaje_id, transporte_id, estado_viaje').eq('rol', 'estudiante').eq('estado_aprobacion', 'aprobado');
        const consultaV = window.db.from('viajes').select('id, titulo');
        const [tRes, pRes, vRes] = await Promise.all([consultaT, consultaP, consultaV]);
        window.transportesAsignacion = tRes.data || [];
        window.personasAsignacion = pRes.data || [];
        if (vRes.data) window.viajesAsignacion = vRes.data;
    }
    const transportes = window.transportesAsignacion || [];
    const q = ((document.getElementById('asig-buscar') || {}).value || '').trim().toLowerCase();
    const soloSin = document.getElementById('asig-sin-unidad') && document.getElementById('asig-sin-unidad').checked;
    const idsUnidad = new Set(transportes.map((t) => t.id));
    const cupo = {};
    (window.personasAsignacion || []).forEach((u) => {
        if (u.transporte_id && idsUnidad.has(u.transporte_id)) cupo[u.transporte_id] = (cupo[u.transporte_id] || 0) + 1;
    });
    if (resumen) {
        resumen.innerHTML = transportes.length
            ? '<div class="btn-group">' + transportes.map((t, i) => `<span class="badge" style="background:#f4f7fa;color:#0c2340;border:1px solid #cfd6de;">${escaparHtml(nombreTipoTransporte(t.tipo))} ${i + 1}: ${cupo[t.id] || 0}/${plazasPorTipo(t.tipo)}</span>`).join('') + '</div>'
            : '<p class="aviso aviso-info">Este viaje no tiene transportes. Créelos en Gestión de Viajes con el botón Transportes.</p>';
    }
    let lista = (window.personasAsignacion || []).slice().sort((a, b) => String(a.nombre_completo).localeCompare(String(b.nombre_completo), 'es'));
    if (q) lista = lista.filter((u) => String(u.nombre_completo || '').toLowerCase().includes(q) || String(u.dni || '').toLowerCase().includes(q));
    if (soloSin) lista = lista.filter((u) => !u.transporte_id || !idsUnidad.has(u.transporte_id));
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="4">No hay estudiantes en este filtro.</td></tr>';
        return;
    }
    const tituloViaje = (id) => {
        const v = (window.viajesAsignacion || []).find((x) => x.id === id);
        return v ? v.titulo : 'Otro viaje';
    };
    tbody.innerHTML = lista.map((u) => {
        let situacion = 'Sin viaje';
        if (u.viaje_id === viajeId && idsUnidad.has(u.transporte_id)) situacion = 'Asignado en este viaje';
        else if (u.viaje_id === viajeId) situacion = 'Anotado, sin transporte';
        else if (u.viaje_id) situacion = 'En otro viaje: ' + tituloViaje(u.viaje_id);
        const enEstaUnidad = idsUnidad.has(u.transporte_id);
        let opciones = '<option value="">Sin transporte</option>';
        if (u.transporte_id && !enEstaUnidad) {
            opciones = '<option value="__actual" selected disabled>Asignado en otro viaje</option>' + opciones;
        }
        transportes.forEach((t, i) => {
            const plazas = plazasPorTipo(t.tipo);
            const usados = cupo[t.id] || 0;
            const lleno = usados >= plazas && u.transporte_id !== t.id;
            const selected = u.transporte_id === t.id ? ' selected' : '';
            opciones += `<option value="${t.id}"${selected}${lleno ? ' disabled' : ''}>${escaparHtml(nombreTipoTransporte(t.tipo))} ${i + 1} (${usados}/${plazas})</option>`;
        });
        return `<tr>
            <td>${escaparHtml(u.nombre_completo)}</td>
            <td>${escaparHtml(u.dni || 'Menor')}</td>
            <td>${escaparHtml(situacion)}</td>
            <td><select onchange="asignarDesdePanel('${u.id}', this.value)">${opciones}</select></td>
        </tr>`;
    }).join('');
}

async function asignarDesdePanel(usuarioId, transporteId) {
    const viajeId = document.getElementById('asig-viaje').value;
    const actual = (window.personasAsignacion || []).find((u) => u.id === usuarioId);
    if (!viajeId) return;
    try {
        if (!transporteId || transporteId === '__actual') {
            if (transporteId === '__actual') {
                await pintarAsignacion(true);
                return;
            }
            const sigueEnViaje = actual && actual.viaje_id === viajeId;
            if (!sigueEnViaje && actual && actual.viaje_id) {
                const ok = await Swal.fire({
                    title: 'Quitar su asignación actual',
                    text: 'Dejará el viaje en el que está y quedará sin transporte.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Quitar asignación'
                });
                if (!ok.isConfirmed) {
                    await pintarAsignacion(true);
                    return;
                }
            }
            await window.db.from('usuarios').update(sigueEnViaje
                ? { transporte_id: null, asiento: null, estado_viaje: 'anotado' }
                : { transporte_id: null, asiento: null, viaje_id: null, estado_viaje: 'ninguno' }
            ).eq('id', usuarioId);
            window.personasAsignacion = null;
            await pintarAsignacion();
            return;
        }
        if (actual && actual.viaje_id && actual.viaje_id !== viajeId) {
            const ok = await Swal.fire({
                title: 'Esta persona está en otro viaje',
                text: 'Pasará a este viaje y perderá el asiento que tuviera.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Mover a este transporte'
            });
            if (!ok.isConfirmed) {
                await pintarAsignacion(true);
                return;
            }
        }
        const t = (window.transportesAsignacion || []).find((x) => x.id === transporteId);
        const usados = (window.personasAsignacion || []).filter((u) => u.transporte_id === transporteId && u.id !== usuarioId).length;
        if (t && usados >= plazasPorTipo(t.tipo)) {
            Swal.fire('Cupo lleno', 'Esa unidad ya no tiene lugares.', 'warning');
            await pintarAsignacion(true);
            return;
        }
        const mismo = actual && actual.transporte_id === transporteId;
        const cambios = { transporte_id: transporteId, viaje_id: viajeId };
        if (!mismo) {
            cambios.asiento = null;
            cambios.estado_viaje = 'asignado';
        }
        const { error } = await window.db.from('usuarios').update(cambios).eq('id', usuarioId);
        if (error) throw error;
        window.personasAsignacion = null;
        await pintarAsignacion();
    } catch (e) {
        console.error(e);
        Swal.fire('No se asignó', 'No se pudo guardar el transporte.', 'error');
        window.personasAsignacion = null;
        await pintarAsignacion();
    }
}

function cargarBiblioteca() {
    const cont = document.getElementById('lista-biblioteca');
    if (!cont) return;
    const data = leerBiblioteca();
    window.bibliotecaParadas = data;
    if (!data.length) {
        cont.innerHTML = '<p class="text-muted">No hay paradas en la lista.</p>';
        return;
    }
    cont.innerHTML = data.map((p) => {
        const tienePunto = typeof p.lat === 'number' && typeof p.lng === 'number';
        const detalle = tienePunto ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : 'Sin punto. Márquela en el mapa y guárdela.';
        const boton = tienePunto
            ? `<button type="button" class="btn btn-auto" onclick="agregarBibliotecaARuta('${p.id}')">Agregar a este viaje</button>`
            : `<button type="button" class="btn btn-outline btn-auto" onclick="document.getElementById('bib-nombre').value='${escaparHtml(p.nombre).replace(/'/g, '')}'">Usar este nombre</button>`;
        return `
        <div class="trip-item">
            <div class="trip-info">
                <h4>${escaparHtml(p.nombre)}</h4>
                <p>${detalle}</p>
            </div>
            <div class="btn-group">
                ${boton}
                <button type="button" class="btn btn-outline btn-auto" onclick="eliminarDeBiblioteca('${p.id}')">Quitar de la lista</button>
            </div>
        </div>`;
    }).join('');
}

function guardarEnBiblioteca(nombre, lat, lng) {
    const existente = (window.bibliotecaParadas || []).find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
    const parada = {
        id: existente ? existente.id : ('p-' + Date.now()),
        nombre: nombre,
        lat: lat,
        lng: lng
    };
    guardarParadaLocal(parada);
    cargarBiblioteca();
}

function agregarBibliotecaARuta(id) {
    const p = (window.bibliotecaParadas || []).find((x) => x.id === id);
    if (!p || typeof p.lat !== 'number') {
        Swal.fire('Sin punto', 'Esa parada todavía no tiene ubicación. Márquela en el mapa.', 'info');
        return;
    }
    const actuales = routeControl.getWaypoints().filter((w) => w.latLng);
    const wp = L.Routing.waypoint(L.latLng(p.lat, p.lng));
    wp.options = { nombre: p.nombre, tiempo: '' };
    actuales.push(wp);
    routeControl.setWaypoints(actuales);
}

async function eliminarDeBiblioteca(id) {
    const res = await Swal.fire({ title: 'Quitar de la lista', text: 'No se borra de los viajes que ya la usan. En este navegador deja de aparecer para viajes nuevos.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Quitar' });
    if (!res.isConfirmed) return;
    ocultarParadaLocal(id);
    cargarBiblioteca();
}

async function resolverSolicitudGuardada(p, decision) {
    const info = clasificarSolicitud(p);
    const nuevoEstado = decision === 'aprobada'
        ? 'aprobada'
        : (info.tipo === 'abordaje' ? 'rechazo:' + info.nombre : 'rechazada');
    await window.db.from('paradas_intermitentes').update({ estado: nuevoEstado }).eq('id', p.id);
    if (decision === 'aprobada' && info.tipo === 'abordaje') {
        await window.db.from('usuarios').update({
            parada_id: JSON.stringify({ lat: p.lat, lng: p.lng, nombre: info.nombre || 'Punto sobre la ruta', origen: 'otro' })
        }).eq('id', p.usuario_id);
    }
}

async function buscarYGuardarParada() {
    const q = document.getElementById('bib-buscar').value.trim();
    const nombre = document.getElementById('bib-nombre').value.trim();
    if (!q || !nombre) return Swal.fire('Datos', 'Escriba el nombre de la parada y el lugar a buscar.', 'warning');
    try {
        const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
        const data = await res.json();
        if (!data.length) return Swal.fire('Sin resultado', 'No se encontró ese lugar.', 'warning');
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        window.ultimoPuntoMapa = L.latLng(lat, lng);
        routingMap.setView([lat, lng], 16);
        await guardarEnBiblioteca(nombre, lat, lng);
    } catch (e) {
        Swal.fire('Búsqueda', 'No se pudo consultar el mapa.', 'error');
    }
}

document.getElementById('btn-bib-buscar').addEventListener('click', buscarYGuardarParada);
document.getElementById('btn-bib-mapa').addEventListener('click', () => {
    const nombre = document.getElementById('bib-nombre').value.trim();
    if (!nombre || !window.ultimoPuntoMapa) {
        Swal.fire('Punto', 'Escriba el nombre y marque antes un punto en el mapa.', 'warning');
        return;
    }
    guardarEnBiblioteca(nombre, window.ultimoPuntoMapa.lat, window.ultimoPuntoMapa.lng);
});

async function pintarGpsGlobal() {
    const { data: viajes } = await window.db.from('viajes').select('id, titulo, estado').neq('estado', 'finalizado');
    if (!viajes || !viajes.length) return;
    const idsViaje = viajes.map((v) => v.id);
    const { data: trans } = await window.db.from('transportes').select('id, viaje_id, tipo').in('viaje_id', idsViaje);
    if (!trans || !trans.length) return;
    const { data: logs } = await window.db.from('gps_logs').select('*').limit(80);
    if (window.marcadoresGlobales) window.marcadoresGlobales.forEach((m) => globalMap.removeLayer(m));
    window.marcadoresGlobales = [];
    const porTransporte = {};
    (logs || []).forEach((g) => {
        const prev = porTransporte[g.transporte_id];
        if (!prev || esLecturaMasNueva(g, prev)) porTransporte[g.transporte_id] = g;
    });
    trans.forEach((t) => {
        const g = porTransporte[t.id];
        if (!g) return;
        const viaje = viajes.find((v) => v.id === t.viaje_id);
        const m = L.marker([g.latitud, g.longitud]).addTo(globalMap).bindPopup(`${viaje ? viaje.titulo : 'Viaje'} — ${nombreTipoTransporte(t.tipo)}`);
        window.marcadoresGlobales.push(m);
    });
}

async function verRutaActiva(viajeId, soloMarcadores) {
    window.currentViajeMonitoreo = viajeId;
    document.querySelector('.menu-item[data-target="dashboard"]').click();
    const { data: viaje } = await window.db.from('viajes').select('*').eq('id', viajeId).single();
    if (!viaje) return;
    if (!soloMarcadores) {
        if (window.rutaMonitoreo) {
            if (window.rutaMonitoreo.getWaypoints) globalMap.removeControl(window.rutaMonitoreo);
            else globalMap.removeLayer(window.rutaMonitoreo);
        }
        const puntos = puntosDeRuta(viaje.ruta);
        if (puntos.length > 1) {
            window.rutaMonitoreo = L.polyline(puntos.map((r) => [r.lat, r.lng]), { color: '#0e4c81', weight: 4 }).addTo(globalMap);
            globalMap.fitBounds(window.rutaMonitoreo.getBounds());
        }
    }
    const { data: trans } = await window.db.from('transportes').select('id, tipo').eq('viaje_id', viajeId);
    const { data: logs } = await window.db.from('gps_logs').select('*').limit(80);
    if (window.marcadoresViaje) window.marcadoresViaje.forEach((m) => globalMap.removeLayer(m));
    window.marcadoresViaje = [];
    const modo = modoGpsDe(viaje);
    const propios = (logs || []).filter((g) => (trans || []).some((t) => t.id === g.transporte_id));
    propios.sort((a, b) => esLecturaMasNueva(a, b) ? -1 : 1);
    if (modo === 'caravana') {
        if (propios[0]) window.marcadoresViaje.push(L.marker([propios[0].latitud, propios[0].longitud]).addTo(globalMap).bindPopup('Caravana — ' + viaje.titulo));
    } else {
        const visto = {};
        propios.forEach((g) => {
            if (visto[g.transporte_id]) return;
            visto[g.transporte_id] = true;
            const t = (trans || []).find((x) => x.id === g.transporte_id);
            window.marcadoresViaje.push(L.marker([g.latitud, g.longitud]).addTo(globalMap).bindPopup(nombreTipoTransporte(t && t.tipo)));
        });
    }
    setTimeout(() => globalMap.invalidateSize(), 200);
}

function etiquetaEstadoEvidencia(estado) {
    if (estado === 'aprobada') return 'Validada para U-VIBE';
    if (estado === 'rechazada') return 'Rechazada';
    return 'Pendiente de revisión';
}

async function cargarEvidencias() {
    const cont = document.getElementById('lista-evidencias');
    const badge = document.getElementById('badge-evidencias');
    if (!cont) return;
    const { data, error } = await window.db.from('evidencias').select('*').order('creado_en', { ascending: false });
    if (error) {
        if (badge) badge.style.display = 'none';
        cont.innerHTML = '<p class="aviso aviso-info">La revisión de fotografías estará disponible cuando se ejecute el script supabase/evidencias.sql en la base de datos.</p>';
        return;
    }
    const filas = data || [];
    window.evidenciasCache = filas;
    const pendientes = filas.filter((e) => e.estado === 'pendiente').length;
    if (badge) {
        badge.style.display = pendientes ? 'inline' : 'none';
        badge.innerText = pendientes;
    }
    if (!filas.length) {
        cont.innerHTML = '<p class="text-muted">Ningún estudiante ha enviado evidencia.</p>';
        return;
    }
    const ids = [...new Set(filas.map((e) => e.usuario_id))];
    const viajeIds = [...new Set(filas.map((e) => e.viaje_id))];
    const { data: personas } = await window.db.from('usuarios').select('id, nombre_completo').in('id', ids);
    const { data: viajesEv } = await window.db.from('viajes').select('id, titulo').in('id', viajeIds);
    const nombreDe = (id) => {
        const p = (personas || []).find((u) => u.id === id);
        return p ? p.nombre_completo : 'Estudiante';
    };
    const viajeDe = (id) => {
        const v = (viajesEv || []).find((x) => x.id === id);
        return v ? v.titulo : 'Viaje';
    };
    cont.innerHTML = `<div class="table-responsive"><table><thead><tr><th>Foto</th><th>Estudiante</th><th>Viaje</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${
        filas.map((e) => {
            const obs = e.observacion ? `<br><span class="text-muted">${escaparHtml(e.observacion)}</span>` : '';
            const acciones = e.estado === 'aprobada'
                ? '<span class="text-muted">Validada</span>'
                : `<button type="button" class="btn btn-auto" onclick="verEvidencia('${e.id}')">Ver</button> <button type="button" class="btn btn-success btn-auto" onclick="resolverEvidencia('${e.id}', 'aprobada')">Aprobar</button> <button type="button" class="btn btn-danger btn-auto" onclick="resolverEvidencia('${e.id}', 'rechazada')">Rechazar</button>`;
            return `<tr><td><img class="miniatura-evidencia" src="${e.imagen}" alt="Evidencia" onclick="verEvidencia('${e.id}')"></td><td>${escaparHtml(nombreDe(e.usuario_id))}</td><td>${escaparHtml(viajeDe(e.viaje_id))}${obs}</td><td>${etiquetaEstadoEvidencia(e.estado)}</td><td>${acciones}</td></tr>`;
        }).join('')
    }</tbody></table></div>`;
}

function verEvidencia(id) {
    const ev = (window.evidenciasCache || []).find((e) => e.id === id);
    if (!ev) return;
    Swal.fire({
        title: 'Evidencia de limpieza',
        imageUrl: ev.imagen,
        imageAlt: 'Fotografía enviada por el estudiante',
        text: etiquetaEstadoEvidencia(ev.estado) + (ev.observacion ? '. ' + ev.observacion : ''),
        width: 720
    });
}

async function resolverEvidencia(id, estado) {
    let observacion = null;
    if (estado === 'rechazada') {
        const motivo = await Swal.fire({
            title: 'Rechazar evidencia',
            text: 'Indique por qué no se valida. El estudiante podrá enviar otra fotografía.',
            input: 'text',
            inputPlaceholder: 'No se observa al estudiante recogiendo basura',
            showCancelButton: true,
            confirmButtonText: 'Rechazar'
        });
        if (!motivo.isConfirmed) return;
        observacion = (motivo.value || '').trim() || 'La imagen no muestra la limpieza.';
    } else {
        const ok = await Swal.fire({
            title: 'Validar participación',
            text: 'Confirme que en la fotografía se ve al estudiante ayudando a recoger basura. Con esto queda acreditado para U-VIBE.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Aprobar'
        });
        if (!ok.isConfirmed) return;
    }
    const { error } = await window.db.from('evidencias').update({
        estado: estado,
        observacion: observacion,
        revisado_en: new Date().toISOString()
    }).eq('id', id);
    if (error) return Swal.fire('No se guardó', 'No se pudo registrar la revisión.', 'error');
    Swal.fire('Registrado', estado === 'aprobada' ? 'La participación quedó validada.' : 'Se notificará el rechazo en el panel del estudiante.', 'success');
    cargarEvidencias();
}

// Inicializar
loadDashboard();
