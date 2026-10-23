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
        if(item.dataset.target === 'asistencia') cargarControlAsistencia();
        if(item.dataset.target === 'operacion') cargarOperacion();
        if(item.dataset.target === 'paradas') cargarSolicitudesSuper();
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
        cargarSolicitudesSuper();

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
                    
                    // Actualizar croquis y asignación en tiempo real si el superadmin lo está viendo
                    lastAdminOccupiedStr = "";
                    renderAdminCroquis(window.croquisOrigen || 'admin');
                    renderAdminCroquis('operacion');

                    const asigTab = document.getElementById('asignacion');
                    if (asigTab && asigTab.classList.contains('active')) {
                        const buscando = document.activeElement && (document.activeElement.id === 'asig-buscar' || document.activeElement.tagName === 'SELECT');
                        if (!buscando) pintarAsignacion(false);
                    }

                    const asistTab = document.getElementById('asistencia');
                    if (asistTab && asistTab.classList.contains('active')) {
                        const buscandoAsis = document.activeElement && document.activeElement.id === 'asist-buscar';
                        if (!buscandoAsis) cargarControlAsistencia(true);
                    }

                    const operTab = document.getElementById('operacion');
                    if (operTab && operTab.classList.contains('active')) {
                        cargarOperacionUnidad();
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
                    loadDashboard(); // Refresca lista de viajes
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'paradas_intermitentes' }, async (payload) => {
                    cargarSolicitudesSuper();
                    if (document.getElementById('operacion') && document.getElementById('operacion').classList.contains('active')) cargarParadasOperacion();
                    if (payload.eventType !== 'INSERT' || !payload.new) return;
                    const p = payload.new;
                    const info = clasificarSolicitud(p);
                    if (info.estado !== 'pendiente') return;
                    await evaluarSolicitudSuper(p.id);
                })
                .subscribe();

            if (!window.subAsientosRegistrada) {
                window.subAsientosRegistrada = true;
                suscribirAsientosEnVivo(() => {
                    lastAdminOccupiedStr = "";
                    renderAdminCroquis(window.croquisOrigen || 'admin');
                    renderAdminCroquis('operacion');
                    const tabAsig = document.getElementById('asignacion');
                    if (tabAsig && tabAsig.classList.contains('active')) {
                        const buscando = document.activeElement && (document.activeElement.id === 'asig-buscar' || document.activeElement.tagName === 'SELECT');
                        if (!buscando) pintarAsignacion(false);
                    }
                });

                if (window.adminCroquisInterval) clearInterval(window.adminCroquisInterval);
                window.adminCroquisInterval = setInterval(() => {
                    const divAdmin = document.getElementById('admin-croquis-container');
                    const divOp = document.getElementById('operacion');
                    const hayAdmin = divAdmin && divAdmin.style.display !== 'none';
                    const hayOp = divOp && divOp.classList.contains('active');
                    if (hayAdmin) renderAdminCroquis('admin');
                    if (hayOp) renderAdminCroquis('operacion');

                    const tabAsig = document.getElementById('asignacion');
                    if (tabAsig && tabAsig.classList.contains('active')) {
                        const buscando = document.activeElement && (document.activeElement.id === 'asig-buscar' || document.activeElement.tagName === 'SELECT');
                        if (!buscando) pintarAsignacion(false);
                    }
                }, 3000);
            }
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
        text: 'Esta acción borrará TODOS los usuarios, viajes y transportes, excepto tu propia cuenta de Superadmin. Ingresa el código de seguridad para proceder:',
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
    
    let puntos = puntosDeRuta(viaje.ruta);

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
    
    if(!titulo || !fecha || !inicio_asientos || !cierre_asientos) return Swal.fire('Datos incompletos', 'Complete el nombre y las fechas del viaje.', 'warning');
    
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
        const ruta = waypointsJSON;
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

        // Si se editó la ruta, sincronizar paradas_intermitentes para revertir las que fueron quitadas del mapa
        if (editando && editando.id) {
            try {
                const { data: solsAprobadas } = await window.db
                    .from('paradas_intermitentes')
                    .select('id, lat, lng, usuario_id')
                    .eq('viaje_id', editando.id)
                    .eq('estado', 'aprobada');

                if (solsAprobadas && solsAprobadas.length > 0) {
                    for (const sol of solsAprobadas) {
                        const estaEnRuta = (ruta || []).some(w => distanciaMetros(Number(w.lat), Number(w.lng), Number(sol.lat), Number(sol.lng)) <= 80);
                        if (!estaEnRuta) {
                            await window.db.from('paradas_intermitentes').update({ estado: 'rechazada' }).eq('id', sol.id);
                            if (sol.usuario_id) {
                                await window.db.from('usuarios').update({ parada_id: null }).eq('id', sol.usuario_id);
                            }
                        }
                    }
                }
            } catch (syncErr) {
                console.warn('Error sincronizando solicitudes al guardar ruta:', syncErr);
            }
        }
        
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
            await window.db.from('viajes').update({
                titulo: formValues.titulo,
                fecha_salida: formValues.fecha_salida,
                inicio_asientos: formValues.inicio_asientos,
                cierre_asientos: formValues.cierre_asientos
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

// Actualizar requerimiento visual de chofer según topología (Obligatorio solo para Autobús)
const topoSelectEl = document.getElementById('t-topologia-select');
const badgeAdminReqEl = document.getElementById('badge-admin-req');
if (topoSelectEl) {
    topoSelectEl.addEventListener('change', () => {
        if (!badgeAdminReqEl) return;
        if (topoSelectEl.value === 'bus_50') {
            badgeAdminReqEl.innerText = '*Requerido para Autobús';
            badgeAdminReqEl.style.color = 'var(--error)';
        } else {
            badgeAdminReqEl.innerText = '(Opcional - Se guía por el bus principal)';
            badgeAdminReqEl.style.color = '#16a34a';
        }
    });
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
    const adminIdRaw = document.getElementById('t-admin-select').value;
    const adminId = (adminIdRaw && adminIdRaw.trim() !== '') ? adminIdRaw.trim() : null;

    // Solo el autobús de 50 plazas requiere obligatoriamente un chofer asignado
    if (tipo === 'bus_50' && !adminId) {
        Swal.fire('Chofer Requerido', 'Para un Autobús de 50 plazas es obligatorio asignar un Administrador/Chofer responsable de la unidad.', 'warning');
        btn.disabled = false;
        return;
    }
    
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
            const adminName = t.admin ? t.admin.nombre_completo : '<span style="color:#64748b; font-style:italic;">Sin chofer asignado (Sigue al bus líder)</span>';
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
                            <p style="margin:0; font-size:0.85rem; color:#64748b;">Chofer: ${adminName} <button class="btn btn-outline" style="padding:2px 5px; font-size:0.7rem; margin-left:5px;" onclick="cambiarChofer('${t.id}', '${t.admin_id}', '${viajeId}', '${t.tipo}')">${t.admin_id ? 'Cambiar' : 'Asignar chofer'}</button></p>
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

async function cambiarChofer(transporteId, oldAdminId, viajeId, tipo) {
    const { data: allTransportes } = await window.db.from('transportes').select('admin_id');
    const assignedAdmins = allTransportes ? allTransportes.map(t => t.admin_id) : [];
    const { data: admins } = await window.db.from('usuarios').select('id, nombre_completo').eq('rol', 'admin');
    
    let optionsHtml = '';
    // Para microbús o motocicleta, se permite dejar sin chofer
    if (tipo !== 'bus_50') {
        optionsHtml += '<option value="__none__">-- Dejar sin chofer (Opcional para este transporte) --</option>';
    }
    if(admins) {
        admins.forEach(a => {
            if(!assignedAdmins.includes(a.id)) {
                optionsHtml += `<option value="${a.id}">${a.nombre_completo}</option>`;
            }
        });
    }

    const { value: newAdminId } = await Swal.fire({
        title: 'Asignar / Cambiar Chofer',
        html: `
            <select id="swal-new-admin" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none;">
                <option value="">Seleccione una opción...</option>
                ${optionsHtml}
            </select>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        preConfirm: () => {
            const val = document.getElementById('swal-new-admin').value;
            if(!val && tipo === 'bus_50') {
                Swal.showValidationMessage('Para un autobús debe seleccionar un chofer');
            }
            return val;
        }
    });

    if (newAdminId !== undefined && newAdminId !== null) {
        try {
            const finalAdminId = (newAdminId === '__none__' || newAdminId === '') ? null : newAdminId;
            Swal.fire({ title: 'Actualizando...', didOpen: () => Swal.showLoading() });
            await window.db.from('transportes').update({ admin_id: finalAdminId }).eq('id', transporteId);
            if(oldAdminId && oldAdminId !== 'null' && oldAdminId !== 'undefined') {
                await window.db.from('usuarios').update({ transporte_id: null, viaje_id: null, asiento: null }).eq('id', oldAdminId);
            }
            if(finalAdminId) {
                await window.db.from('usuarios').update({ transporte_id: transporteId, viaje_id: viajeId }).eq('id', finalAdminId);
            }
            Swal.fire('¡Actualizado!', 'Se ha actualizado la asignación del transporte.', 'success');
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
async function renderAdminCroquis(origen) {
    if (origen === 'operacion' || origen === 'admin') window.croquisOrigen = origen;
    const desdeOperacion = origen === 'operacion' || (!origen && window.croquisOrigen === 'operacion');
    const selCroquis = document.getElementById(desdeOperacion ? 'op-transporte' : 'admin-vehiculo-select');
    const transporteId = selCroquis ? selCroquis.value : '';
    const croquisDiv = document.getElementById(desdeOperacion ? 'op-croquis' : 'admin-croquis');
    if (!croquisDiv) return;
    
    if(!transporteId) {
        croquisDiv.innerHTML = '<div class="text-muted">Selecciona un vehículo para ver los asientos.</div>';
        return;
    }

    try {
        const { data: t } = await window.db.from('transportes').select('tipo, viaje_id').eq('id', transporteId).single();
        if(!t) return;
        
        // Usuarios del transporte
        const { data: usuarios } = await window.db.from('usuarios').select('*').eq('transporte_id', transporteId).not('asiento', 'is', null);
        const asientosOcupadosInfo = {};
        
        const occupiedIds = usuarios ? usuarios.map(u => u.asiento + '-' + u.id).sort() : [];
        occupiedIds.push('MINE:' + (session.asiento || 'none'));
        const occupiedStr = JSON.stringify(occupiedIds);
        
        if (croquisDiv.innerHTML !== '' && lastAdminOccupiedStr === occupiedStr) return;
        lastAdminOccupiedStr = occupiedStr;

        if(usuarios) {
            usuarios.forEach(u => { asientosOcupadosInfo[u.asiento] = u; });
        }

        const miAsiento = session.asiento;
        croquisDiv.innerHTML = htmlAsientos(plazasPorTipo(t.tipo), (n) => genAdminSeat(n, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteId));

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
                    renderAdminCroquis(window.croquisOrigen || 'admin');
                    notificarCambioAsiento(viajeId, transporteId);
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
                    renderAdminCroquis(window.croquisOrigen || 'admin');
                    notificarCambioAsiento(viajeId, transporteId);
                } catch(e) {
                    Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error');
                    lastAdminOccupiedStr = "";
                    renderAdminCroquis(window.croquisOrigen || 'admin');
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
                renderAdminCroquis(window.croquisOrigen || 'admin');
                notificarCambioAsiento(viajeId, transporteId);
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
        const consultaP = window.db.from('usuarios').select('id, nombre_completo, dni, rol, viaje_id, transporte_id, estado_viaje, estado_aprobacion').eq('rol', 'estudiante');
        const consultaV = window.db.from('viajes').select('id, titulo');
        const [tRes, pRes, vRes] = await Promise.all([consultaT, consultaP, consultaV]);
        window.transportesAsignacion = tRes.data || [];
        window.personasAsignacion = pRes.data || [];
        if (vRes.data) window.viajesAsignacion = vRes.data;
    }
    const transportes = window.transportesAsignacion || [];
    const q = ((document.getElementById('asig-buscar') || {}).value || '').trim().toLowerCase();
    const filtroEl = document.getElementById('asig-filtro-transporte');
    const filtroVal = filtroEl ? filtroEl.value : 'todos';

    // Identificar Bus 1, Bus 2, Microbús, Motocicletas
    const buses = transportes.filter(t => t.tipo === 'bus_50');
    const microbuses = transportes.filter(t => t.tipo === 'microbus_16' || t.tipo === 'microbus_15');
    const motos = transportes.filter(t => t.tipo === 'moto' || t.tipo === 'moto_2');

    const bus1Id = buses[0] ? buses[0].id : null;
    const bus2Id = buses[1] ? buses[1].id : null;
    const microbusIds = new Set(microbuses.map(t => t.id));
    const motoIds = new Set(motos.map(t => t.id));
    const idsUnidad = new Set(transportes.map((t) => t.id));
    const cupo = {};
    (window.personasAsignacion || []).forEach((u) => {
        if (u.transporte_id && idsUnidad.has(u.transporte_id)) cupo[u.transporte_id] = (cupo[u.transporte_id] || 0) + 1;
    });

    if (resumen) {
        resumen.innerHTML = transportes.length
            ? '<div class="btn-group">' + transportes.map((t) => {
                const label = etiquetaTransporte(t, transportes);
                return `<span class="badge" style="background:#f4f7fa;color:#0c2340;border:1px solid #cfd6de;">${escaparHtml(label)}: ${cupo[t.id] || 0}/${plazasPorTipo(t.tipo)}</span>`;
            }).join('') + '</div>'
            : '<p class="aviso aviso-info">Este viaje no tiene transportes. Créelos en Gestión de Viajes con el botón Transportes.</p>';
    }

    let lista = (window.personasAsignacion || []).slice().sort((a, b) => String(a.nombre_completo).localeCompare(String(b.nombre_completo), 'es'));
    if (q) lista = lista.filter((u) => String(u.nombre_completo || '').toLowerCase().includes(q) || String(u.dni || '').toLowerCase().includes(q));

    // Filtro para solo tener los inscritos en Bus 1, Bus 2, Microbús y Motocicletas
    if (filtroVal === 'bus_1') {
        lista = lista.filter((u) => u.viaje_id === viajeId && u.transporte_id === bus1Id);
    } else if (filtroVal === 'bus_2') {
        lista = lista.filter((u) => u.viaje_id === viajeId && u.transporte_id === bus2Id);
    } else if (filtroVal === 'microbus') {
        lista = lista.filter((u) => u.viaje_id === viajeId && microbusIds.has(u.transporte_id));
    } else if (filtroVal === 'motos') {
        lista = lista.filter((u) => u.viaje_id === viajeId && motoIds.has(u.transporte_id));
    } else if (filtroVal === 'sin_unidad') {
        lista = lista.filter((u) => u.viaje_id === viajeId && (!u.transporte_id || !idsUnidad.has(u.transporte_id)));
    } else {
        // 'todos': solo tener los inscritos en este viaje
        lista = lista.filter((u) => u.viaje_id === viajeId);
    }

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
        if (u.estado_aprobacion && u.estado_aprobacion !== 'aprobado') situacion += ' · cuenta sin aprobar';
        const enEstaUnidad = idsUnidad.has(u.transporte_id);
        let opciones = '<option value="">Sin transporte</option>';
        if (u.transporte_id && !enEstaUnidad) {
            opciones = '<option value="__actual" selected disabled>Asignado en otro viaje</option>' + opciones;
        }
        transportes.forEach((t) => {
            const plazas = plazasPorTipo(t.tipo);
            const usados = cupo[t.id] || 0;
            const lleno = usados >= plazas && u.transporte_id !== t.id;
            const selected = u.transporte_id === t.id ? ' selected' : '';
            const label = etiquetaTransporte(t, transportes);
            opciones += `<option value="${t.id}"${selected}${lleno ? ' disabled' : ''}>${escaparHtml(label)} (${usados}/${plazas})</option>`;
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
            notificarCambioAsiento(viajeId, null);
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
        const mismo = actual && actual.transporte_id === transporteId && actual.viaje_id === viajeId;
        const cambios = { transporte_id: transporteId, viaje_id: viajeId };
        if (mismo && actual.estado_viaje === 'asiento_elegido') {
            /* conserva el asiento ya elegido en esta misma unidad */
        } else {
            cambios.asiento = null;
            cambios.estado_viaje = 'asignado';
        }
        const { error } = await window.db.from('usuarios').update(cambios).eq('id', usuarioId);
        if (error) throw error;
        window.personasAsignacion = null;
        await pintarAsignacion();
        notificarCambioAsiento(viajeId, transporteId);
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Transporte asignado. El estudiante ya puede elegir asiento.', showConfirmButton: false, timer: 2200 });
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

async function cargarSolicitudesSuper() {
    const tbody = document.getElementById('super-paradas');
    const badge = document.getElementById('badge-paradas');
    const contador = document.getElementById('super-paradas-count');
    if (!tbody) return;
    const { data, error } = await window.db.from('paradas_intermitentes').select('*');
    if (error) {
        if (badge) badge.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="6">No se pudieron cargar las solicitudes.</td></tr>';
        return;
    }
    const filas = (data || []).slice().sort((a, b) => {
        const pa = clasificarSolicitud(a).estado === 'pendiente' ? 0 : 1;
        const pb = clasificarSolicitud(b).estado === 'pendiente' ? 0 : 1;
        return pa - pb;
    });
    const pendientes = filas.filter((s) => clasificarSolicitud(s).estado === 'pendiente').length;
    if (badge) {
        badge.style.display = pendientes ? 'inline' : 'none';
        badge.innerText = pendientes;
    }
    if (contador) contador.innerText = 'Pendientes: ' + pendientes;
    window.solicitudesCache = filas;
    const userIds = [...new Set(filas.map((s) => s.usuario_id).filter(Boolean))];
    const viajeIds = [...new Set(filas.map((s) => s.viaje_id).filter(Boolean))];
    const personasP = userIds.length ? window.db.from('usuarios').select('id, nombre_completo').in('id', userIds) : Promise.resolve({ data: [] });
    const viajesP = viajeIds.length ? window.db.from('viajes').select('id, titulo, ruta').in('id', viajeIds) : Promise.resolve({ data: [] });
    const [{ data: personas }, { data: viajes }] = await Promise.all([personasP, viajesP]);
    window.solicitudesViajes = viajes || [];
    const nombres = {};
    (personas || []).forEach((u) => { nombres[u.id] = u.nombre_completo; });
    const titulos = {};
    (viajes || []).forEach((v) => { titulos[v.id] = v.titulo; });
    if (!filas.length) tbody.innerHTML = '<tr><td colspan="6">No hay solicitudes.</td></tr>';
    else tbody.innerHTML = filas.map((p) => {
        const info = clasificarSolicitud(p);
        const latN = Number(p.lat);
        const lngN = Number(p.lng);
        const coord = isFinite(latN) && isFinite(lngN) ? latN.toFixed(5) + ', ' + lngN.toFixed(5) : 'Sin coordenadas';
        const badgeColor = info.estado === 'pendiente' ? 'pending' : (info.estado === 'aprobada' ? 'approved' : '');
        let acciones = `<button type="button" class="btn ${info.estado === 'pendiente' ? 'btn-primary' : 'btn-outline'} btn-auto" onclick="evaluarSolicitudSuper('${p.id}')" style="display:inline-flex; align-items:center; gap:4px; padding:4px 8px; font-size:0.82rem;">
            🔍 ${info.estado === 'pendiente' ? 'Revisar' : 'Ver'}
        </button>`;
        if (info.estado === 'aprobada') {
            acciones += ` <button type="button" class="btn btn-outline btn-auto" style="border-color:#ef4444; color:#dc2626; padding:4px 8px; font-size:0.82rem;" onclick="revertirParadaAprobada('${p.id}')" title="Revertir y quitar del recorrido">✕ Revertir</button>`;
        }
        acciones += ` <button type="button" class="btn btn-outline btn-auto" style="border-color:#94a3b8; color:#64748b; padding:4px 8px; font-size:0.82rem;" onclick="eliminarSolicitudParada('${p.id}')" title="Eliminar solicitud permanentemente">🗑️</button>`;
        return `<tr>
            <td>${escaparHtml(nombres[p.usuario_id] || 'Estudiante')}</td>
            <td>${escaparHtml(titulos[p.viaje_id] || 'Viaje')}</td>
            <td>${info.tipo === 'abordaje' ? 'Subida (Abordaje)' : 'Durante el viaje'}</td>
            <td><b>${escaparHtml(info.nombre || 'Punto sobre la ruta')}</b><br><span class="text-muted" style="font-size:0.8rem;">${coord}</span></td>
            <td><span class="badge ${badgeColor}">${escaparHtml(info.estado)}</span></td>
            <td><div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">${acciones}</div></td>
        </tr>`;
    }).join('');
    if (document.getElementById('paradas') && document.getElementById('paradas').classList.contains('active')) {
        pintarMapaSolicitudes(window.solicitudEnfocada || null);
        window.solicitudEnfocada = null;
    }
}

let paradasMap = null;
let paradasCapas = [];

function asegurarMapaParadas() {
    const caja = document.getElementById('paradas-map');
    if (!caja) return null;
    if (!paradasMap) {
        paradasMap = L.map('paradas-map').setView([13.6929, -89.2182], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(paradasMap);
    }
    setTimeout(() => paradasMap.invalidateSize(), 80);
    setTimeout(() => paradasMap.invalidateSize(), 400);
    return paradasMap;
}

function pintarMapaSolicitudes(enfocarId) {
    const mapa = asegurarMapaParadas();
    if (!mapa) return;
    paradasCapas.forEach((capa) => mapa.removeLayer(capa));
    paradasCapas = [];
    const filas = window.solicitudesCache || [];
    const viajes = window.solicitudesViajes || [];
    const visibles = enfocarId ? filas.filter((s) => s.id === enfocarId) : filas.filter((s) => clasificarSolicitud(s).estado === 'pendiente');
    const viajesDibujados = {};
    const limites = [];
    visibles.forEach((s) => {
        if (!viajesDibujados[s.viaje_id]) {
            viajesDibujados[s.viaje_id] = true;
            const viaje = viajes.find((v) => v.id === s.viaje_id);
            const ruta = puntosDeRuta(viaje && viaje.ruta);
            if (ruta.length > 1) {
                const linea = trazarRutaConCalles(mapa, ruta, { color: '#0e4c81', weight: 4.5, opacity: 0.85 });
                if (linea) paradasCapas.push(linea);
                ruta.forEach((r) => limites.push([r.lat, r.lng]));
            }
        }
        const latN = Number(s.lat);
        const lngN = Number(s.lng);
        if (!isFinite(latN) || !isFinite(lngN)) return;
        const info = clasificarSolicitud(s);
        const marca = L.circleMarker([latN, lngN], { radius: enfocarId ? 11 : 8, color: '#8e2f2f', fillColor: '#c45c4a', fillOpacity: 1, weight: 2 }).addTo(mapa);
        marca.bindPopup('<b>' + escaparHtml(info.nombre || 'Punto solicitado') + '</b><br>' + (info.tipo === 'abordaje' ? 'Subida' : 'Durante el viaje'));
        paradasCapas.push(marca);
        limites.push([latN, lngN]);
        if (enfocarId) marca.openPopup();
    });
    if (limites.length) mapa.fitBounds(limites, { padding: [28, 28], maxZoom: 16 });
    setTimeout(() => mapa.invalidateSize(), 200);
}

function verPuntoSolicitud(id) {
    window.solicitudEnfocada = id;
    const tab = document.getElementById('paradas');
    const item = document.querySelector('.menu-item[data-target="paradas"]');
    if (tab && !tab.classList.contains('active') && item) item.click();
    else pintarMapaSolicitudes(id);
    const caja = document.getElementById('paradas-map');
    if (caja) caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function evaluarSolicitudSuper(id) {
    const p = (window.solicitudesCache || []).find((s) => s.id === id) || 
              (await window.db.from('paradas_intermitentes').select('*').eq('id', id).single()).data;
    if (!p) return Swal.fire('Error', 'No se encontró la solicitud.', 'error');

    const info = clasificarSolicitud(p);
    
    // Obtener datos del estudiante y del viaje
    const { data: usuario } = await window.db.from('usuarios').select('id, nombre_completo, codigo_pasajero, foto_perfil, telefono').eq('id', p.usuario_id).maybeSingle();
    const { data: viaje } = await window.db.from('viajes').select('id, titulo, ruta, fecha_salida').eq('id', p.viaje_id).maybeSingle();
    
    const nombreEstudiante = usuario ? usuario.nombre_completo : 'Estudiante';
    const codigoEstudiante = (usuario && usuario.codigo_pasajero) ? `Código: ${usuario.codigo_pasajero}` : '';
    const tituloViaje = viaje ? viaje.titulo : 'Viaje';
    const rutaPuntos = puntosDeRuta(viaje && viaje.ruta);
    const latP = Number(p.lat);
    const lngP = Number(p.lng);
    const tieneCoords = isFinite(latP) && isFinite(lngP);
    
    // Distancia al recorrido
    let textoDistancia = '';
    if (tieneCoords && rutaPuntos.length >= 2) {
        const proy = puntoSobreRuta(latP, lngP, rutaPuntos, 5000);
        if (proy) {
            const d = Math.round(proy.dist);
            const dentroMargen = d <= MARGEN_RUTA_METROS;
            textoDistancia = dentroMargen
                ? `<span style="color:#16a34a; font-weight:600; font-size:0.85rem;">✓ A ${d} metros del trazado (Dentro del margen de 50 m)</span>`
                : `<span style="color:#dc2626; font-weight:600; font-size:0.85rem;">⚠️ A ${d} metros del trazado (Supera el margen recomendado de 50 m)</span>`;
        }
    }
    
    const fotoSrc = (usuario && usuario.foto_perfil) ? usuario.foto_perfil : `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreEstudiante)}&background=random`;
    const tipoTexto = info.tipo === 'abordaje' ? 'Punto de Subida (Abordaje)' : 'Parada solicitada durante el viaje';
    const isPendiente = info.estado === 'pendiente';
    
    await Swal.fire({
        title: `Solicitud de Parada: ${escaparHtml(info.nombre || 'Punto')}`,
        html: `
            <div style="text-align:left; font-size:0.92rem; margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
                    <img src="${fotoSrc}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid var(--accent);">
                    <div style="flex:1;">
                        <strong style="color:var(--navy); font-size:1rem; display:block;">${escaparHtml(nombreEstudiante)}</strong>
                        <span style="color:var(--text-muted); font-size:0.85rem;">${codigoEstudiante} &nbsp;|&nbsp; <b>Viaje:</b> ${escaparHtml(tituloViaje)}</span>
                    </div>
                    <span class="badge ${isPendiente ? 'pending' : (info.estado === 'aprobada' ? 'approved' : '')}" style="font-size:0.85rem;">
                        ${escaparHtml(info.estado.toUpperCase())}
                    </span>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                    <div>
                        <span style="font-weight:600; color:var(--navy);">Lugar:</span> ${escaparHtml(info.nombre || 'Sin nombre')} (${tipoTexto})
                    </div>
                    <div>${textoDistancia}</div>
                </div>
            </div>

            <!-- Contenedor del mapa de evaluación -->
            <div id="modal-evaluar-map" style="width:100%; height:370px; border-radius:8px; border:2px solid #cbd5e1; box-shadow:0 2px 4px rgba(0,0,0,0.05);"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#64748b; margin-top:6px;">
                <span>🟢 Salida &nbsp;|&nbsp; 🔴 Destino &nbsp;|&nbsp; 📍 Punto Solicitado &nbsp;|&nbsp; ━━ Ruta</span>
                <span>${tieneCoords ? (latP.toFixed(5) + ', ' + lngP.toFixed(5)) : 'Sin coordenadas'}</span>
            </div>
        `,
        width: 780,
        showCancelButton: true,
        showDenyButton: isPendiente || info.estado === 'aprobada',
        confirmButtonText: isPendiente ? '✓ Aprobar Parada' : 'Aceptar',
        confirmButtonColor: '#16a34a',
        denyButtonText: isPendiente ? '✕ Rechazar Parada' : '✕ Revertir / Quitar del Recorrido',
        denyButtonColor: '#dc2626',
        cancelButtonText: isPendiente ? 'Dejar Pendiente' : 'Cerrar',
        cancelButtonColor: '#64748b',
        didOpen: () => {
            if (!tieneCoords) return;
            const mapEl = document.getElementById('modal-evaluar-map');
            if (!mapEl) return;
            
            const mapaModal = L.map('modal-evaluar-map').setView([latP, lngP], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19
            }).addTo(mapaModal);

            const limites = [[latP, lngP]];

            // 1. Dibujar la ruta planeada del viaje siguiendo calles
            if (rutaPuntos.length >= 2) {
                const polyline = trazarRutaConCalles(mapaModal, rutaPuntos, { color: '#0e4c81', weight: 5, opacity: 0.9 });
                rutaPuntos.forEach(ll => limites.push([ll.lat, ll.lng]));

                // Marcador de salida (Verde)
                const origen = rutaPuntos[0];
                const iconOrigen = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background:#16a34a; width:16px; height:16px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 6px rgba(0,0,0,0.4);" title="Salida: ${origen.nombre || ''}"></div>`,
                    iconSize: [16, 16]
                });
                L.marker([origen.lat, origen.lng], { icon: iconOrigen }).addTo(mapaModal).bindPopup(`<b>Punto de Salida</b><br>${origen.nombre || ''}`);

                // Marcador de destino (Rojo)
                const destino = rutaPuntos[rutaPuntos.length - 1];
                const iconDestino = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background:#b91c1c; width:16px; height:16px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 6px rgba(0,0,0,0.4);" title="Destino: ${destino.nombre || ''}"></div>`,
                    iconSize: [16, 16]
                });
                L.marker([destino.lat, destino.lng], { icon: iconDestino }).addTo(mapaModal).bindPopup(`<b>Destino Final</b><br>${destino.nombre || ''}`);

                // Paradas intermedias oficiales
                for (let i = 1; i < rutaPuntos.length - 1; i++) {
                    const pi = rutaPuntos[i];
                    L.circleMarker([pi.lat, pi.lng], { radius: 6, color: '#0e4c81', fillColor: '#38bdf8', fillOpacity: 0.9, weight: 2 })
                        .addTo(mapaModal).bindPopup(`<b>Parada oficial ${i+1}:</b> ${pi.nombre || ''}`);
                }
            }

            // 2. Marcador destacado del punto solicitado por el estudiante
            const iconPunto = L.divIcon({
                className: 'custom-div-icon',
                html: `
                    <div style="position:relative; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">
                        <div style="position:absolute; width:30px; height:30px; border-radius:50%; background:rgba(239,68,68,0.35); animation:pulse-gps 1.5s infinite;"></div>
                        <div style="position:relative; background:#ef4444; width:24px; height:24px; border-radius:50%; border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; font-weight:bold;">📍</div>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const markerPunto = L.marker([latP, lngP], { icon: iconPunto }).addTo(mapaModal);
            markerPunto.bindPopup(`
                <div style="font-size:0.9rem;">
                    <b style="color:#b91c1c;">📍 Punto Solicitado</b><br>
                    <b>Lugar:</b> ${escaparHtml(info.nombre || 'Sin nombre')}<br>
                    <b>Estudiante:</b> ${escaparHtml(nombreEstudiante)}<br>
                    <b>Tipo:</b> ${tipoTexto}
                </div>
            `).openPopup();

            if (limites.length > 1) {
                mapaModal.fitBounds(L.latLngBounds(limites).pad(0.18), { maxZoom: 16 });
            } else {
                mapaModal.setView([latP, lngP], 16);
            }

            setTimeout(() => mapaModal.invalidateSize(), 200);
            setTimeout(() => mapaModal.invalidateSize(), 500);
        }
    }).then(async (result) => {
        if (result.isConfirmed && isPendiente) {
            await resolverSolicitudGuardada(p, 'aprobada');
            Swal.fire({ icon: 'success', title: 'Parada Aprobada', text: `Se ha confirmado la parada "${info.nombre || ''}" para ${nombreEstudiante}.`, timer: 2000, showConfirmButton: false });
            cargarSolicitudesSuper();
            if (document.getElementById('operacion') && document.getElementById('operacion').classList.contains('active')) cargarParadasOperacion();
        } else if (result.isDenied) {
            if (isPendiente) {
                await resolverSolicitudGuardada(p, 'rechazada');
                Swal.fire({ icon: 'info', title: 'Parada Rechazada', text: `La solicitud fue rechazada.`, timer: 2000, showConfirmButton: false });
                cargarSolicitudesSuper();
                if (document.getElementById('operacion') && document.getElementById('operacion').classList.contains('active')) cargarParadasOperacion();
            } else if (info.estado === 'aprobada') {
                await revertirParadaAprobada(p.id);
            }
        }
    });
}

async function revertirParadaAprobada(id) {
    const { data: p } = await window.db.from('paradas_intermitentes').select('*').eq('id', id).single();
    if (!p) return;
    const conf = await Swal.fire({
        title: '¿Revertir parada aprobada?',
        text: 'La parada volverá a estado Rechazada y se quitará automáticamente del recorrido del viaje.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, revertir parada',
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'Cancelar'
    });
    if (!conf.isConfirmed) return;

    try {
        await window.db.from('paradas_intermitentes').update({ estado: 'rechazada' }).eq('id', id);
        if (p.usuario_id) {
            await window.db.from('usuarios').update({ parada_id: null }).eq('id', p.usuario_id);
        }
        if (p.viaje_id) {
            const { data: viaje } = await window.db.from('viajes').select('id, ruta').eq('id', p.viaje_id).single();
            if (viaje && Array.isArray(viaje.ruta)) {
                const rutaLimpia = viaje.ruta.filter(pt => {
                    if (!pt || typeof pt.lat !== 'number') return true;
                    return distanciaMetros(pt.lat, pt.lng, Number(p.lat), Number(p.lng)) > 75;
                });
                await window.db.from('viajes').update({ ruta: rutaLimpia }).eq('id', p.viaje_id);
            }
        }
        Swal.fire('Parada Revertida', 'La parada ha quedado rechazada y se retiró del recorrido.', 'success');
        cargarSolicitudesSuper();
        if (typeof loadDashboard === 'function') loadDashboard();
        if (document.getElementById('operacion') && document.getElementById('operacion').classList.contains('active')) cargarParadasOperacion();
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo revertir la parada.', 'error');
    }
}

async function eliminarSolicitudParada(id) {
    const conf = await Swal.fire({
        title: '¿Eliminar solicitud?',
        text: 'Se eliminará permanentemente este registro de solicitud de parada.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'Cancelar'
    });
    if (!conf.isConfirmed) return;

    try {
        const { data: p } = await window.db.from('paradas_intermitentes').select('*').eq('id', id).maybeSingle();
        if (p && p.estado === 'aprobada' && p.viaje_id) {
            const { data: viaje } = await window.db.from('viajes').select('id, ruta').eq('id', p.viaje_id).single();
            if (viaje && Array.isArray(viaje.ruta)) {
                const rutaLimpia = viaje.ruta.filter(pt => {
                    if (!pt || typeof pt.lat !== 'number') return true;
                    return distanciaMetros(pt.lat, pt.lng, Number(p.lat), Number(p.lng)) > 75;
                });
                await window.db.from('viajes').update({ ruta: rutaLimpia }).eq('id', p.viaje_id);
            }
        }
        await window.db.from('paradas_intermitentes').delete().eq('id', id);
        Swal.fire('Eliminada', 'La solicitud ha sido eliminada.', 'success');
        cargarSolicitudesSuper();
        if (typeof loadDashboard === 'function') loadDashboard();
        if (document.getElementById('operacion') && document.getElementById('operacion').classList.contains('active')) cargarParadasOperacion();
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo eliminar la solicitud.', 'error');
    }
}

async function superResolverParada(id, decision) {
    const { data: p } = await window.db.from('paradas_intermitentes').select('*').eq('id', id).single();
    if (!p) return;
    await resolverSolicitudGuardada(p, decision);
    cargarSolicitudesSuper();
    if (document.getElementById('operacion') && document.getElementById('operacion').classList.contains('active')) cargarParadasOperacion();
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
    if (decision === 'aprobada') {
        await agregarParadaAprobadaAViaje(p.viaje_id, {
            lat: p.lat,
            lng: p.lng,
            nombre: info.nombre || 'Parada aceptada'
        });
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
    if (window.currentViajeMonitoreo) {
        verRutaActiva(window.currentViajeMonitoreo);
        return;
    }
    const { data: viajes } = await window.db.from('viajes').select('id, titulo, estado, ruta').neq('estado', 'finalizado');
    if (!viajes || !viajes.length) return;
    const conRuta = viajes.find((v) => puntosDeRuta(v.ruta).length > 1) || viajes[0];
    if (conRuta) {
        verRutaActiva(conRuta.id);
    }
}

async function verRutaActiva(viajeId, soloMarcadores) {
    window.currentViajeMonitoreo = viajeId;
    document.querySelector('.menu-item[data-target="dashboard"]').click();
    const { data: viaje } = await window.db.from('viajes').select('*').eq('id', viajeId).single();
    if (!viaje) return;

    if (window.rutaMonitoreo) {
        if (window.rutaMonitoreo.getWaypoints) globalMap.removeControl(window.rutaMonitoreo);
        else globalMap.removeLayer(window.rutaMonitoreo);
        window.rutaMonitoreo = null;
    }
    if (window.marcadoresViaje) window.marcadoresViaje.forEach((m) => globalMap.removeLayer(m));
    window.marcadoresViaje = [];

    const puntos = puntosDeRuta(viaje.ruta);
    if (puntos.length > 1) {
        // Trazado de ruta siguiendo las calles reales con OSRM/GPS
        window.rutaMonitoreo = trazarRutaConCalles(globalMap, puntos, {
            color: '#0e4c81',
            weight: 5,
            opacity: 0.9,
            onRutaCalculada: (info) => {
                const infoBox = document.getElementById('gps-route-info');
                const metrics = document.getElementById('gps-route-metrics');
                if (infoBox && metrics) {
                    metrics.innerText = `${info.distanciaKm} km · ~${info.duracionMin} min`;
                    infoBox.style.display = 'flex';
                }
            }
        });

        puntos.forEach((p, idx) => {
            const esExtremo = idx === 0 || idx === puntos.length - 1;
            const esOrigen = idx === 0;
            const esDestino = idx === puntos.length - 1;
            const colorPunto = esOrigen ? '#10b981' : (esDestino ? '#ef4444' : '#3b82f6');
            const tituloPunto = esOrigen ? '📍 Punto de Salida / Origen' : (esDestino ? '🏁 Destino Final' : `🚏 Parada Oficial ${idx + 1}`);
            const horaStr = p.tiempo ? `<br><small style="color:#64748b;">Hora programada: ${escaparHtml(p.tiempo)}</small>` : '';

            const m = L.circleMarker([p.lat, p.lng], {
                radius: esExtremo ? 9 : 6.5,
                color: '#0c2340',
                fillColor: colorPunto,
                fillOpacity: 1,
                weight: 2.5
            }).addTo(globalMap).bindPopup(`<b>${escaparHtml(p.nombre || (esOrigen ? 'Origen' : (esDestino ? 'Destino' : 'Parada ' + (idx + 1))))}</b><br><span style="color:${colorPunto};font-weight:600;">${tituloPunto}</span>${horaStr}`);
            window.marcadoresViaje.push(m);
        });
    }

    const { data: paradasAprobadas } = await window.db.from('paradas_intermitentes').select('*').eq('viaje_id', viajeId).eq('estado', 'aprobada');
    if (paradasAprobadas && paradasAprobadas.length) {
        paradasAprobadas.forEach((s) => {
            const latN = Number(s.lat);
            const lngN = Number(s.lng);
            if (!isFinite(latN) || !isFinite(lngN)) return;
            // Solo pintar en el mapa general si la parada sigue estando presente en el recorrido oficial
            const sigueEnRuta = puntos.some(p => distanciaMetros(p.lat, p.lng, latN, lngN) <= 80);
            if (!sigueEnRuta) return;
            const info = clasificarSolicitud(s);
            const m = L.circleMarker([latN, lngN], {
                radius: 7.5,
                color: '#854d0e',
                fillColor: '#eab308',
                fillOpacity: 1,
                weight: 2
            }).addTo(globalMap).bindPopup(`<b>${escaparHtml(info.nombre || 'Parada aprobada')}</b><br><span style="color:#854d0e;font-weight:600;">Solicitud de estudiante (Aprobada)</span><br><small>${info.tipo === 'abordaje' ? 'Subida' : 'Durante el viaje'}</small>`);
            window.marcadoresViaje.push(m);
        });
    }

    // Ubicaciones GPS en tiempo real de unidades en ruta (si están transmitiendo)
    try {
        const { data: trans } = await window.db.from('transportes').select('id, tipo').eq('viaje_id', viajeId);
        if (trans && trans.length) {
            const transIds = trans.map(t => t.id);
            const { data: logs } = await window.db.from('gps_logs').select('*').in('transporte_id', transIds).order('actualizado_en', { ascending: false }).limit(30);
            if (logs && logs.length) {
                const porTransporte = {};
                logs.forEach(g => {
                    if (!porTransporte[g.transporte_id] || esLecturaMasNueva(g, porTransporte[g.transporte_id])) {
                        porTransporte[g.transporte_id] = g;
                    }
                });
                trans.forEach(t => {
                    const g = porTransporte[t.id];
                    if (!g || !isFinite(Number(g.latitud)) || !isFinite(Number(g.longitud))) return;
                    const busIcon = L.divIcon({
                        className: 'custom-bus-icon',
                        html: `<div style="background:#2563eb; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(37,99,235,0.7); border:2px solid #fff; font-size:16px;">🚌</div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });
                    const markerBus = L.marker([Number(g.latitud), Number(g.longitud)], { icon: busIcon }).addTo(globalMap)
                        .bindPopup(`<b>${etiquetaTransporte(t, trans)}</b><br><span style="color:#2563eb;font-weight:600;">📡 Posición GPS en vivo</span><br><small>Velocidad: ${Math.round(g.velocidad || 0)} km/h</small>`);
                    window.marcadoresViaje.push(markerBus);
                });
            }
        }
    } catch (e) {
        console.warn('Error leyendo GPS logs para el viaje:', e);
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
            const btnVer = `<button type="button" class="btn btn-outline btn-auto" style="padding:4px 8px; font-size:0.82rem;" onclick="verEvidencia('${e.id}')">🔍 Ver</button>`;
            const btnAprobar = e.estado !== 'aprobada' ? `<button type="button" class="btn btn-success btn-auto" style="padding:4px 8px; font-size:0.82rem;" onclick="resolverEvidencia('${e.id}', 'aprobada')">✓ Aprobar</button>` : '<span style="color:#10b981; font-weight:600; font-size:0.85rem;">✓ Validada</span>';
            const btnRechazar = e.estado !== 'rechazada' ? `<button type="button" class="btn btn-warning btn-auto" style="padding:4px 8px; font-size:0.82rem;" onclick="resolverEvidencia('${e.id}', 'rechazada')">✕ Rechazar</button>` : '<span style="color:#ef4444; font-weight:600; font-size:0.85rem;">✕ Rechazada</span>';
            const btnEliminar = `<button type="button" class="btn btn-danger btn-auto" style="padding:4px 8px; font-size:0.82rem;" onclick="eliminarEvidencia('${e.id}')" title="Eliminar evidencia de la base de datos">🗑️ Eliminar</button>`;
            const acciones = `<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">${btnVer} ${btnAprobar} ${btnRechazar} ${btnEliminar}</div>`;
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
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        confirmButtonText: '🗑️ Eliminar Evidencia',
        confirmButtonColor: '#ef4444',
        width: 720
    }).then((res) => {
        if (res.isConfirmed) {
            eliminarEvidencia(id);
        }
    });
}

async function eliminarEvidencia(id) {
    const conf = await Swal.fire({
        title: '¿Eliminar evidencia?',
        text: 'Esta fotografía será eliminada permanentemente de la base de datos.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'Cancelar'
    });
    if (!conf.isConfirmed) return;

    try {
        const { error } = await window.db.from('evidencias').delete().eq('id', id);
        if (error) throw error;
        Swal.fire('Eliminada', 'La evidencia fue eliminada con éxito.', 'success');
        cargarEvidencias();
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo eliminar la evidencia: ' + (e.message || ''), 'error');
    }
}

async function limpiarTodasEvidencias() {
    const conf = await Swal.fire({
        title: '¿Eliminar TODAS las evidencias?',
        text: 'Esta acción borrará todas las fotografías de prueba almacenadas en la base de datos.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, borrar todas',
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'Cancelar'
    });
    if (!conf.isConfirmed) return;

    try {
        const { error } = await window.db.from('evidencias').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        Swal.fire('Base limpia', 'Todas las evidencias de prueba fueron eliminadas con éxito.', 'success');
        cargarEvidencias();
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudieron limpiar las evidencias: ' + (e.message || ''), 'error');
    }
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

const opNoSleep = (typeof NoSleep !== 'undefined') ? new NoSleep() : { enable() {}, disable() {} };
let opMap = null;
let opMarker = null;
let opWatch = null;

function asegurarMapaOperacion() {
    const caja = document.getElementById('op-map');
    if (!caja) return;
    if (!opMap) {
        opMap = L.map('op-map').setView([13.6929, -89.2182], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(opMap);
    }
    setTimeout(() => opMap.invalidateSize(), 80);
    setTimeout(() => opMap.invalidateSize(), 450);
}

async function cargarOperacion() {
    asegurarMapaOperacion();
    const sel = document.getElementById('op-viaje');
    if (!sel) return;
    const previo = sel.value || window.operacionViajeId || '';
    const { data: viajes } = await window.db.from('viajes').select('id, titulo, estado, ruta');
    window.operacionViajes = viajes || [];
    sel.innerHTML = '<option value="">Seleccione un viaje</option>' + window.operacionViajes.map((v) => `<option value="${v.id}">${escaparHtml(v.titulo)}</option>`).join('');
    if (previo && window.operacionViajes.some((v) => v.id === previo)) sel.value = previo;
    window.operacionViajeId = sel.value;
    const viaje = window.operacionViajes.find((v) => v.id === sel.value);
    const unidad = document.getElementById('op-transporte');
    unidad.innerHTML = '<option value="">Seleccione una unidad</option>';
    if (!viaje) {
        document.getElementById('op-estado').innerText = 'Sin viaje';
        return;
    }
    window.rutaOperacion = puntosDeRuta(viaje.ruta);
    pintarEstadoOperacion(viaje.estado);
    dibujarRutaOperacion();
    const { data: unidades } = await window.db.from('transportes').select('id, tipo').eq('viaje_id', viaje.id);
    window.operacionUnidades = unidades || [];
    window.operacionUnidades.forEach((t) => {
        unidad.innerHTML += `<option value="${t.id}">${escaparHtml(etiquetaTransporte(t, window.operacionUnidades))}</option>`;
    });
    if (window.operacionTransporteId && window.operacionUnidades.some((t) => t.id === window.operacionTransporteId)) {
        unidad.value = window.operacionTransporteId;
    }
    await cargarOperacionUnidad();
    await cargarParadasOperacion();
}

function pintarEstadoOperacion(estado) {
    window.operacionEstado = estado || 'preparacion';
    const etiqueta = document.getElementById('op-estado');
    const iniciar = document.getElementById('op-btn-iniciar');
    const finalizar = document.getElementById('op-btn-finalizar');
    const reiniciar = document.getElementById('op-btn-reiniciar');
    const nombres = { preparacion: 'Preparación', en_ruta: 'Ruta de ida', en_ruta_ida: 'Ruta de ida', espera_vuelta: 'Esperando el regreso', en_ruta_vuelta: 'Ruta de vuelta', finalizado: 'Finalizado' };
    if (etiqueta) etiqueta.innerText = nombres[window.operacionEstado] || window.operacionEstado;
    const enIda = window.operacionEstado === 'en_ruta' || window.operacionEstado === 'en_ruta_ida';
    const enVuelta = window.operacionEstado === 'en_ruta_vuelta';
    if (iniciar) {
        iniciar.style.display = (enIda || enVuelta || window.operacionEstado === 'finalizado') ? 'none' : 'inline-block';
        iniciar.innerText = window.operacionEstado === 'espera_vuelta' ? 'Iniciar regreso' : 'Iniciar ruta';
    }
    if (finalizar) {
        finalizar.style.display = (enIda || enVuelta) ? 'inline-block' : 'none';
        finalizar.innerText = enVuelta ? 'Finalizar viaje' : 'Llegamos al destino';
    }
    if (reiniciar) {
        reiniciar.style.display = 'inline-block';
        if (window.operacionEstado === 'finalizado') {
            reiniciar.className = 'btn btn-primary btn-auto';
            reiniciar.innerText = '🔄 Reiniciar ciclo para nuevas pruebas';
        } else {
            reiniciar.className = 'btn btn-outline btn-auto';
            reiniciar.innerText = '🔄 Reiniciar ciclo del viaje';
        }
    }
}

function dibujarRutaOperacion() {
    if (!opMap) return;
    if (window.opGrupo) opMap.removeLayer(window.opGrupo);
    window.opGrupo = L.layerGroup().addTo(opMap);
    const puntos = window.rutaOperacion || [];
    if (puntos.length > 1) {
        const linea = trazarRutaConCalles(opMap, puntos, { color: '#0e4c81', weight: 4.5, opacity: 0.9 });
        if (linea) window.opGrupo.addLayer(linea);
        puntos.forEach((p, i) => {
            const esExtremo = i === 0 || i === puntos.length - 1;
            const cColor = i === 0 ? '#10b981' : (i === puntos.length - 1 ? '#ef4444' : '#ffffff');
            L.circleMarker([p.lat, p.lng], { radius: esExtremo ? 7 : 5, color: '#0c2340', fillColor: cColor, fillOpacity: 1, weight: 2 })
                .addTo(window.opGrupo)
                .bindPopup('<b>' + escaparHtml(p.nombre || ('Parada ' + (i + 1))) + '</b>');
        });
    }
    setTimeout(() => opMap.invalidateSize(), 80);
    setTimeout(() => opMap.invalidateSize(), 450);
}

function marcarSolicitudesOperacion(filas) {
    if (!opMap) return;
    if (window.opSolicitudes) opMap.removeLayer(window.opSolicitudes);
    window.opSolicitudes = L.layerGroup().addTo(opMap);
    (filas || []).forEach((s) => {
        const latN = Number(s.lat);
        const lngN = Number(s.lng);
        if (!isFinite(latN) || !isFinite(lngN)) return;
        const info = clasificarSolicitud(s);
        L.circleMarker([latN, lngN], { radius: 9, color: '#8e2f2f', fillColor: '#c45c4a', fillOpacity: 1, weight: 2 })
            .addTo(window.opSolicitudes)
            .bindPopup('<b>' + escaparHtml(info.nombre || 'Punto solicitado') + '</b><br>' + (info.tipo === 'abordaje' ? 'Subida' : 'Durante el viaje'));
    });
}

function verPuntoOperacion(id) {
    const s = (window.paradasOperacion || []).find((x) => x.id === id);
    const latN = s ? Number(s.lat) : NaN;
    const lngN = s ? Number(s.lng) : NaN;
    if (!opMap || !isFinite(latN) || !isFinite(lngN)) return;
    opMap.setView([latN, lngN], 16);
    const caja = document.getElementById('op-map');
    if (caja) caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => opMap.invalidateSize(), 300);
}

async function cargarOperacionUnidad() {
    const transporteId = document.getElementById('op-transporte').value;
    window.operacionTransporteId = transporteId;
    const tbody = document.getElementById('op-manifiesto');
    if (!transporteId) {
        tbody.innerHTML = '<tr><td colspan="5">Elija una unidad.</td></tr>';
        document.getElementById('op-abordo').innerText = 'A bordo: 0';
        return;
    }
    const viajeId = document.getElementById('op-viaje').value;
    const { data: pasajeros } = await window.db.from('usuarios').select('id, nombre_completo, asiento, parada_id, abordo, asistencia_cancelada, rol').eq('viaje_id', viajeId).eq('transporte_id', transporteId);
    const lista = pasajeros || [];
    const aBordo = lista.filter((p) => p.abordo).length;
    document.getElementById('op-abordo').innerText = 'A bordo: ' + aBordo + ' / ' + lista.length;
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="5">Esta unidad no tiene pasajeros. Asígnelos en Asignación de pasajeros.</td></tr>';
    } else {
        tbody.innerHTML = lista.map((p) => {
            const parada = leerParada(p.parada_id, window.rutaOperacion);
            const estado = p.abordo
                ? '<span style="color:#10b981;font-weight:700;background:rgba(16,185,129,0.12);padding:4px 10px;border-radius:12px;display:inline-block;">🟢 A bordo</span>'
                : (p.asistencia_cancelada
                    ? '<span style="color:#ef4444;font-weight:700;background:rgba(239,68,68,0.12);padding:4px 10px;border-radius:12px;display:inline-block;">🔴 Canceló</span>'
                    : '<span style="color:#ef4444;font-weight:700;background:rgba(239,68,68,0.12);padding:4px 10px;border-radius:12px;display:inline-block;">🔴 Aún no está dentro</span>');
            const accion = `<button type="button" class="btn ${p.abordo ? 'btn-outline' : 'btn-primary'} btn-auto" style="padding:4px 10px;font-size:0.8rem;" onclick="operacionAbordo('${p.id}', ${p.abordo ? 'false' : 'true'})">${p.abordo ? 'Bajar' : 'Marcar a bordo'}</button>`;
            return `<tr><td>${escaparHtml(p.nombre_completo)}</td><td>${escaparHtml(p.asiento || '—')}</td><td>${escaparHtml(parada && parada.nombre ? parada.nombre : '—')}</td><td>${estado}</td><td>${accion}</td></tr>`;
        }).join('');
    }
    renderAdminCroquis('operacion');
}

async function operacionAbordo(id, abordo) {
    await window.db.from('usuarios').update({ abordo: abordo === true || abordo === 'true', asistencia_cancelada: false }).eq('id', id);
    cargarOperacionUnidad();
    if (typeof cargarControlAsistencia === 'function') cargarControlAsistencia(false);
}

async function cargarParadasOperacion() {
    const tbody = document.getElementById('op-paradas');
    const viajeId = document.getElementById('op-viaje').value;
    if (!viajeId) {
        tbody.innerHTML = '<tr><td colspan="5">Elija un viaje.</td></tr>';
        return;
    }
    const { data: sols } = await window.db.from('paradas_intermitentes').select('*').eq('viaje_id', viajeId);
    const filas = sols || [];
    window.paradasOperacion = filas;
    marcarSolicitudesOperacion(filas);
    if (!filas.length) {
        tbody.innerHTML = '<tr><td colspan="5">Sin solicitudes.</td></tr>';
        return;
    }
    const ids = [...new Set(filas.map((s) => s.usuario_id).filter(Boolean))];
    const { data: personas } = ids.length ? await window.db.from('usuarios').select('id, nombre_completo').in('id', ids) : { data: [] };
    const nombres = {};
    (personas || []).forEach((u) => { nombres[u.id] = u.nombre_completo; });
    tbody.innerHTML = filas.map((p) => {
        const info = clasificarSolicitud(p);
        const acciones = `<button type="button" class="btn ${info.estado === 'pendiente' ? 'btn-primary' : 'btn-outline'} btn-auto" onclick="evaluarSolicitudSuper('${p.id}')">🔍 Revisar en Mapa</button>`;
        return `<tr><td>${escaparHtml(nombres[p.usuario_id] || 'Estudiante')}</td><td>${info.tipo === 'abordaje' ? 'Subida' : 'Durante el viaje'}</td><td>${escaparHtml(info.nombre || 'Punto')}</td><td>${escaparHtml(info.estado)}</td><td>${acciones}</td></tr>`;
    }).join('');
}

async function operacionResolverParada(id, decision) {
    const { data: p } = await window.db.from('paradas_intermitentes').select('*').eq('id', id).single();
    if (p) await resolverSolicitudGuardada(p, decision);
    cargarParadasOperacion();
}

async function operacionIniciar() {
    const viajeId = document.getElementById('op-viaje').value;
    const transporteId = document.getElementById('op-transporte').value;
    if (!viajeId || !transporteId) return Swal.fire('Unidad', 'Elija el viaje y la unidad que va a operar.', 'warning');
    if (!window.rutaOperacion || window.rutaOperacion.length < 2) return Swal.fire('Ruta', 'Este viaje no tiene recorrido.', 'warning');
    const regreso = window.operacionEstado === 'espera_vuelta';

    const resp = await Swal.fire({
        title: regreso ? '¿Iniciar viaje de regreso?' : '¿Iniciar ruta de ida?',
        text: regreso ? 'Se notificará el inicio del viaje de retorno a todos los participantes.' : 'El viaje pasará a estado En ruta (ida).',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, iniciar ruta',
        cancelButtonText: 'Cancelar'
    });
    if (!resp.isConfirmed) return;

    const estado = regreso ? 'en_ruta_vuelta' : 'en_ruta_ida';
    const { error } = await window.db.from('viajes').update({ estado: estado }).eq('id', viajeId);
    if (error) return Swal.fire('No se inició', 'No se pudo cambiar el estado del viaje.', 'error');
    opNoSleep.enable();
    Swal.fire('Ruta en curso', regreso ? 'El regreso ha quedado iniciado.' : 'La ruta de ida ha quedado iniciada.', 'success');
    cargarOperacion();
}

async function operacionFinalizar() {
    const viajeId = document.getElementById('op-viaje').value;
    if (!viajeId) return;
    const enVuelta = window.operacionEstado === 'en_ruta_vuelta';
    const resp = await Swal.fire({
        title: enVuelta ? '¿Finalizar el viaje?' : '¿Confirmar llegada al destino?',
        text: enVuelta ? 'El viaje quedará concluido.' : 'El estado cambiará a espera de regreso.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: enVuelta ? 'Sí, finalizar viaje' : 'Sí, confirmar llegada',
        cancelButtonText: 'Cancelar'
    });
    if (!resp.isConfirmed) return;

    const cambios = enVuelta ? { estado: 'finalizado', inscripcion_abierta: false } : { estado: 'espera_vuelta' };
    const { error } = await window.db.from('viajes').update(cambios).eq('id', viajeId);
    if (error) return Swal.fire('No se guardó', 'No se pudo actualizar el viaje.', 'error');
    opNoSleep.disable();
    Swal.fire(enVuelta ? 'Viaje terminado' : 'Destino alcanzado', enVuelta ? 'El viaje quedó finalizado.' : 'Llegada registrada. Puede iniciar el regreso cuando corresponda.', 'success');
    cargarOperacion();
}

async function operacionReiniciarCiclo() {
    const viajeId = document.getElementById('op-viaje').value;
    if (!viajeId) return Swal.fire('Viaje', 'Seleccione el viaje que desea reiniciar.', 'warning');

    const conf = await Swal.fire({
        title: '¿Reiniciar ciclo del viaje?',
        text: 'El viaje volverá al estado "Preparación" con inscripciones abiertas y se reiniciará el estado "A bordo" de todos los pasajeros para volver a realizar las pruebas.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, reiniciar ciclo',
        confirmButtonColor: '#6366f1',
        cancelButtonText: 'Cancelar'
    });
    if (!conf.isConfirmed) return;

    try {
        // 1. Reset viaje a preparacion e inscripcion abierta
        await window.db.from('viajes').update({
            estado: 'preparacion',
            inscripcion_abierta: true
        }).eq('id', viajeId);

        // 2. Reset usuarios a no a bordo
        await window.db.from('usuarios').update({
            abordo: false
        }).eq('viaje_id', viajeId);

        // 3. Limpiar registros de gps_logs de las unidades de este viaje
        const { data: trans } = await window.db.from('transportes').select('id').eq('viaje_id', viajeId);
        if (trans && trans.length) {
            const transIds = trans.map(t => t.id);
            await window.db.from('gps_logs').delete().in('transporte_id', transIds);
        }

        opNoSleep.disable();
        Swal.fire('Ciclo reiniciado', 'El viaje volvió a Preparación listo para iniciar ruta nuevamente.', 'success');
        cargarOperacion();
        if (typeof loadDashboard === 'function') loadDashboard();
        if (typeof cargarControlAsistencia === 'function') cargarControlAsistencia(true);
    } catch(err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo reiniciar el viaje: ' + (err.message || ''), 'error');
    }
}

// ==========================================
// CONTROL DE ASISTENCIA (POR TRANSPORTES)
// ==========================================
window.asistenciaViajeId = null;
window.asistenciaViajes = [];
window.asistenciaTransportes = [];
window.asistenciaPasajeros = [];
window.asistenciaFiltroTab = 'todos';
window.asistenciaBusqueda = '';
window.asistenciaRuta = [];

async function cargarControlAsistencia(forzar) {
    const selViaje = document.getElementById('asist-viaje-select');
    if (!selViaje) return;

    if (forzar || !selViaje.options.length) {
        const { data: viajes } = await window.db.from('viajes').select('id, titulo, estado, fecha_salida, ruta').order('fecha_salida', { ascending: false });
        window.asistenciaViajes = viajes || [];
        selViaje.innerHTML = window.asistenciaViajes.map((v) => {
            const estadoTxt = v.estado === 'finalizado' ? ' (Finalizado)' : (v.estado === 'en_ruta_ida' || v.estado === 'en_ruta_vuelta' ? ' (En curso)' : '');
            return `<option value="${v.id}">${escaparHtml(v.titulo)}${estadoTxt}</option>`;
        }).join('');
        if (window.asistenciaViajes.length && !window.asistenciaViajeId) {
            const activo = window.asistenciaViajes.find((v) => v.estado !== 'finalizado') || window.asistenciaViajes[0];
            window.asistenciaViajeId = activo.id;
            selViaje.value = activo.id;
        } else if (window.asistenciaViajeId) {
            selViaje.value = window.asistenciaViajeId;
        }
    }

    const viajeId = selViaje.value;
    window.asistenciaViajeId = viajeId;
    if (!viajeId) {
        const container = document.getElementById('asist-unidades-container');
        if (container) container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-light);">Seleccione un viaje para ver el control de asistencia.</div>';
        return;
    }

    const viajeActual = (window.asistenciaViajes || []).find((v) => v.id === viajeId);
    window.asistenciaRuta = viajeActual ? puntosDeRuta(viajeActual.ruta) : [];

    const { data: transportes } = await window.db.from('transportes').select('*').eq('viaje_id', viajeId).order('created_at', { ascending: true });
    window.asistenciaTransportes = transportes || [];

    const { data: pasajeros } = await window.db.from('usuarios')
        .select('id, nombre_completo, correo, telefono, asiento, parada_id, abordo, asistencia_cancelada, transporte_id, rol')
        .eq('viaje_id', viajeId);
    window.asistenciaPasajeros = pasajeros || [];

    const totalEstudiantes = window.asistenciaPasajeros.length;
    const totalAbordo = window.asistenciaPasajeros.filter((p) => p.abordo).length;
    const totalPendientes = totalEstudiantes - totalAbordo;
    const pctAbordo = totalEstudiantes ? Math.round((totalAbordo / totalEstudiantes) * 100) : 0;

    const resumenBox = document.getElementById('asist-resumen-general');
    if (resumenBox) {
        resumenBox.innerHTML = `
            <div style="background:var(--card-bg, #ffffff); border:1px solid var(--border); border-radius:10px; padding:1rem; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size:0.8rem; text-transform:uppercase; color:var(--text-light); font-weight:700;">Total Inscritos</div>
                <div style="font-size:1.8rem; font-weight:800; color:var(--text-color); margin-top:4px;">${totalEstudiantes}</div>
                <div style="font-size:0.8rem; color:var(--text-light); margin-top:2px;">En ${window.asistenciaTransportes.length} transporte(s)</div>
            </div>
            <div style="background:rgba(16,185,129,0.07); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:1rem;">
                <div style="font-size:0.8rem; text-transform:uppercase; color:#065f46; font-weight:700;">🟢 A Bordo</div>
                <div style="font-size:1.8rem; font-weight:800; color:#10b981; margin-top:4px;">${totalAbordo} <small style="font-size:0.9rem; font-weight:600; color:#059669;">(${pctAbordo}%)</small></div>
                <div style="font-size:0.8rem; color:#065f46; margin-top:2px;">Confirmaron estar dentro</div>
            </div>
            <div style="background:rgba(239,68,68,0.07); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:1rem;">
                <div style="font-size:0.8rem; text-transform:uppercase; color:#991b1b; font-weight:700;">🔴 Aún no dentro</div>
                <div style="font-size:1.8rem; font-weight:800; color:#ef4444; margin-top:4px;">${totalPendientes} <small style="font-size:0.9rem; font-weight:600; color:#dc2626;">(${100 - pctAbordo}%)</small></div>
                <div style="font-size:0.8rem; color:#991b1b; margin-top:2px;">Pendientes por abordar</div>
            </div>
        `;
    }

    const tabsBox = document.getElementById('asist-tabs-unidades');
    if (tabsBox) {
        let tabsHtml = `<button type="button" class="btn ${window.asistenciaFiltroTab === 'todos' ? 'btn-primary' : 'btn-outline'} btn-auto" style="border-radius:20px; padding:6px 16px;" onclick="renderVistaAsistencia('todos')">Todos (${totalEstudiantes})</button>`;
        
        window.asistenciaTransportes.forEach((t) => {
            const label = etiquetaTransporte(t, window.asistenciaTransportes);
            const enUnidad = window.asistenciaPasajeros.filter((p) => p.transporte_id === t.id);
            const abordoUnidad = enUnidad.filter((p) => p.abordo).length;
            const activa = window.asistenciaFiltroTab === t.id;
            tabsHtml += `
                <button type="button" class="btn ${activa ? 'btn-primary' : 'btn-outline'} btn-auto" style="border-radius:20px; padding:6px 16px;" onclick="renderVistaAsistencia('${t.id}')">
                    ${escaparHtml(label)} <span style="font-size:0.8rem; opacity:0.85;">(${abordoUnidad}/${enUnidad.length})</span>
                </button>
            `;
        });

        const sinUnidad = window.asistenciaPasajeros.filter((p) => !p.transporte_id);
        if (sinUnidad.length) {
            const activa = window.asistenciaFiltroTab === 'sin_unidad';
            tabsHtml += `
                <button type="button" class="btn ${activa ? 'btn-primary' : 'btn-outline'} btn-auto" style="border-radius:20px; padding:6px 16px;" onclick="renderVistaAsistencia('sin_unidad')">
                    Sin transporte (${sinUnidad.length})
                </button>
            `;
        }
        tabsBox.innerHTML = tabsHtml;
    }

    renderVistaAsistencia();
}

function filtrarListaAsistencia() {
    const input = document.getElementById('asist-buscar');
    window.asistenciaBusqueda = input ? input.value.toLowerCase().trim() : '';
    renderVistaAsistencia();
}

function renderVistaAsistencia(filtroTab) {
    if (filtroTab !== undefined) {
        window.asistenciaFiltroTab = filtroTab;
        const tabsBox = document.getElementById('asist-tabs-unidades');
        if (tabsBox) {
            const btns = tabsBox.querySelectorAll('button');
            btns.forEach((btn) => {
                const clickAttr = btn.getAttribute('onclick') || '';
                if (clickAttr.includes(`'${window.asistenciaFiltroTab}'`)) {
                    btn.classList.remove('btn-outline');
                    btn.classList.add('btn-primary');
                } else {
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-outline');
                }
            });
        }
    }

    const container = document.getElementById('asist-unidades-container');
    if (!container) return;

    let unidadesAMostrar = [];
    let mostrarSinUnidad = false;

    if (window.asistenciaFiltroTab === 'todos') {
        unidadesAMostrar = window.asistenciaTransportes;
        mostrarSinUnidad = window.asistenciaPasajeros.some((p) => !p.transporte_id);
    } else if (window.asistenciaFiltroTab === 'sin_unidad') {
        mostrarSinUnidad = true;
    } else {
        unidadesAMostrar = window.asistenciaTransportes.filter((t) => t.id === window.asistenciaFiltroTab);
    }

    const busq = window.asistenciaBusqueda;
    const filtrarPasajeros = (lista) => {
        if (!busq) return lista;
        return lista.filter((p) => (p.nombre_completo || '').toLowerCase().includes(busq) || (p.correo || '').toLowerCase().includes(busq));
    };

    let html = '';

    if (!unidadesAMostrar.length && !mostrarSinUnidad) {
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-light);">No hay unidades de transporte registradas para este viaje.</div>';
        return;
    }

    unidadesAMostrar.forEach((t) => {
        const nombreUnidad = etiquetaTransporte(t, window.asistenciaTransportes);
        const tipoDetalle = nombreTipoTransporte(t.tipo);
        const pasajerosUnidad = window.asistenciaPasajeros.filter((p) => p.transporte_id === t.id);
        const pasajerosFiltrados = filtrarPasajeros(pasajerosUnidad);
        const abordo = pasajerosUnidad.filter((p) => p.abordo).length;
        const faltantes = pasajerosUnidad.length - abordo;

        const icono = t.tipo === 'moto' ? '🏍️' : (t.tipo === 'microbus_16' ? '🚐' : '🚌');

        html += `
            <div style="background:var(--card-bg, #ffffff); border:1px solid var(--border); border-radius:12px; margin-bottom:1.5rem; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                <div style="background:var(--bg-main, #f8fafc); padding:1rem 1.25rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h4 style="margin:0; display:flex; align-items:center; gap:8px; font-size:1.15rem; color:var(--text-color);">
                            <span>${icono}</span> <span>${escaparHtml(nombreUnidad)}</span>
                            <span style="font-size:0.8rem; font-weight:normal; color:var(--text-light); background:var(--border); padding:2px 8px; border-radius:8px;">${escaparHtml(tipoDetalle)} - Capacidad: ${t.capacidad || '—'}</span>
                        </h4>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; font-size:0.88rem;">
                        <span style="background:rgba(16,185,129,0.12); color:#065f46; border:1px solid rgba(16,185,129,0.3); font-weight:700; padding:4px 10px; border-radius:12px;">
                            🟢 ${abordo} a bordo
                        </span>
                        <span style="background:rgba(239,68,68,0.12); color:#991b1b; border:1px solid rgba(239,68,68,0.3); font-weight:700; padding:4px 10px; border-radius:12px;">
                            🔴 ${faltantes} aún no dentro
                        </span>
                        <span style="font-weight:600; color:var(--text-light);">
                            Total: ${pasajerosUnidad.length}
                        </span>
                    </div>
                </div>

                <div class="table-responsive" style="margin:0;">
                    <table style="margin:0; width:100%;">
                        <thead>
                            <tr style="background:transparent;">
                                <th>Estudiante</th>
                                <th>Asiento</th>
                                <th>Parada Asignada</th>
                                <th style="text-align:center;">Estado</th>
                                <th style="text-align:center;">Acción Manual</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${!pasajerosFiltrados.length ? `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-light);">${pasajerosUnidad.length === 0 ? 'Sin pasajeros asignados a esta unidad.' : 'No hay estudiantes que coincidan con la búsqueda.'}</td></tr>` : pasajerosFiltrados.map((p) => {
                                const parada = leerParada(p.parada_id, window.asistenciaRuta);
                                const estadoBadge = p.abordo
                                    ? '<span style="color:#10b981; font-weight:700; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); padding:4px 12px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">🟢 A bordo</span>'
                                    : (p.asistencia_cancelada
                                        ? '<span style="color:#ef4444; font-weight:700; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); padding:4px 12px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">🔴 Canceló</span>'
                                        : '<span style="color:#ef4444; font-weight:700; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); padding:4px 12px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">🔴 Aún no está dentro</span>');
                                
                                const btnAccion = p.abordo
                                    ? `<button type="button" class="btn btn-outline btn-auto" style="color:#ef4444; border-color:#ef4444; padding:4px 10px; font-size:0.8rem;" onclick="cambiarAbordoSuper('${p.id}', false)">🔴 Marcar no dentro</button>`
                                    : `<button type="button" class="btn btn-primary btn-auto" style="background:#10b981; border-color:#10b981; padding:4px 10px; font-size:0.8rem;" onclick="cambiarAbordoSuper('${p.id}', true)">🟢 Marcar a bordo</button>`;

                                return `
                                    <tr style="${p.abordo ? 'background:rgba(16,185,129,0.02);' : ''}">
                                        <td>
                                            <div style="font-weight:600; color:var(--text-color);">${escaparHtml(p.nombre_completo)}</div>
                                            <div style="font-size:0.8rem; color:var(--text-light);">${escaparHtml(p.correo || '')}</div>
                                        </td>
                                        <td><span class="badge" style="background:var(--border); color:var(--text-color);">${escaparHtml(p.asiento || '—')}</span></td>
                                        <td>${escaparHtml(parada && parada.nombre ? parada.nombre : '—')}</td>
                                        <td style="text-align:center;">${estadoBadge}</td>
                                        <td style="text-align:center;">${btnAccion}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    if (mostrarSinUnidad) {
        const sinUnidad = window.asistenciaPasajeros.filter((p) => !p.transporte_id);
        const sinUnidadFiltrados = filtrarPasajeros(sinUnidad);
        if (sinUnidad.length) {
            html += `
                <div style="background:var(--card-bg, #ffffff); border:1px solid var(--border); border-radius:12px; margin-bottom:1.5rem; overflow:hidden;">
                    <div style="background:#fffbeb; padding:1rem 1.25rem; border-bottom:1px solid #fde68a; display:flex; justify-content:space-between; align-items:center;">
                        <h4 style="margin:0; color:#b45309; display:flex; align-items:center; gap:8px;">
                            <span>⚠️</span> <span>Inscritos sin Unidad Asignada</span>
                        </h4>
                        <span style="font-weight:700; color:#b45309;">Total: ${sinUnidad.length}</span>
                    </div>
                    <div class="table-responsive" style="margin:0;">
                        <table style="margin:0; width:100%;">
                            <thead>
                                <tr>
                                    <th>Estudiante</th>
                                    <th>Asiento</th>
                                    <th>Parada Asignada</th>
                                    <th style="text-align:center;">Estado</th>
                                    <th style="text-align:center;">Acción Manual</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sinUnidadFiltrados.map((p) => {
                                    const parada = leerParada(p.parada_id, window.asistenciaRuta);
                                    const estadoBadge = p.abordo
                                        ? '<span style="color:#10b981; font-weight:700; background:rgba(16,185,129,0.12); padding:4px 12px; border-radius:12px;">🟢 A bordo</span>'
                                        : '<span style="color:#ef4444; font-weight:700; background:rgba(239,68,68,0.12); padding:4px 12px; border-radius:12px;">🔴 Aún no está dentro</span>';
                                    const btnAccion = p.abordo
                                        ? `<button type="button" class="btn btn-outline btn-auto" style="color:#ef4444; border-color:#ef4444; padding:4px 10px; font-size:0.8rem;" onclick="cambiarAbordoSuper('${p.id}', false)">🔴 Marcar no dentro</button>`
                                        : `<button type="button" class="btn btn-primary btn-auto" style="background:#10b981; border-color:#10b981; padding:4px 10px; font-size:0.8rem;" onclick="cambiarAbordoSuper('${p.id}', true)">🟢 Marcar a bordo</button>`;
                                    return `
                                        <tr>
                                            <td>
                                                <div style="font-weight:600;">${escaparHtml(p.nombre_completo)}</div>
                                                <div style="font-size:0.8rem; color:var(--text-light);">${escaparHtml(p.correo || '')}</div>
                                            </td>
                                            <td>—</td>
                                            <td>${escaparHtml(parada && parada.nombre ? parada.nombre : '—')}</td>
                                            <td style="text-align:center;">${estadoBadge}</td>
                                            <td style="text-align:center;">${btnAccion}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

async function cambiarAbordoSuper(usuarioId, nuevoEstado) {
    const { error } = await window.db.from('usuarios').update({ abordo: nuevoEstado, asistencia_cancelada: false }).eq('id', usuarioId);
    if (error) {
        Swal.fire('Error', 'No se pudo actualizar el estado de asistencia.', 'error');
        return;
    }
    const p = (window.asistenciaPasajeros || []).find((u) => u.id === usuarioId);
    if (p) {
        p.abordo = nuevoEstado;
        p.asistencia_cancelada = false;
    }
    if (typeof cargarOperacionUnidad === 'function') cargarOperacionUnidad();
    cargarControlAsistencia(false);

    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: nuevoEstado ? '🟢 Marcado a bordo' : '🔴 Marcado fuera de la unidad',
        showConfirmButton: false,
        timer: 1600
    });
}

window.cargarControlAsistencia = cargarControlAsistencia;
window.renderVistaAsistencia = renderVistaAsistencia;
window.cambiarAbordoSuper = cambiarAbordoSuper;
window.filtrarListaAsistencia = filtrarListaAsistencia;

// Inicializar
loadDashboard();
