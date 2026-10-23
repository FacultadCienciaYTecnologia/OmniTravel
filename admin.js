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
        // Refrescar perfil para verificar cambios de rol
        const { data: user, error } = await window.db.from('usuarios').select('*').eq('id', session.id).single();
        if (error || !user) {
            // El usuario fue eliminado
            localStorage.removeItem('omni_user');
            window.location.href = 'index.html';
            return;
        }
        if(user) {
            if(user.rol !== 'admin') {
                Object.assign(session, user);
                localStorage.setItem('omni_user', JSON.stringify(session));
                window.location.href = 'index.html';
                return;
            }
            Object.assign(session, user);
            localStorage.setItem('omni_user', JSON.stringify(session));
        }
        // Encontrar un transporte asignado a este viaje.
        const { data: viajes } = await window.db.from('viajes').select('id, titulo, estado, ruta').in('estado', ['preparacion', 'en_ruta', 'en_ruta_ida', 'espera_vuelta', 'en_ruta_vuelta']).limit(1);
        
        if(!viajes || viajes.length === 0) {
            Swal.fire('Atención', 'No hay viajes activos en este momento.', 'info');
            return;
        }

        viajeIdActual = viajes[0].id;
        window.rutaActual = puntosDeRuta(viajes[0].ruta || []);
        window.viajeEstadoActual = viajes[0].estado;
        
        let label = 'Preparación';
        if(window.viajeEstadoActual === 'en_ruta' || window.viajeEstadoActual === 'en_ruta_ida') label = 'Ruta de Ida en Progreso';
        if(window.viajeEstadoActual === 'espera_vuelta') label = 'Esperando Regreso';
        if(window.viajeEstadoActual === 'en_ruta_vuelta') label = 'Ruta de Vuelta en Progreso';
        document.getElementById('estado-ruta').innerText = label;

        // Trazar ruta y punto de inicio (desplazamiento) en el mapa del Chofer con calles reales
        if (window.rutaActual && window.rutaActual.length > 0) {
            if (window.polylineRutaAdmin) {
                if (window.polylineRutaAdmin.getWaypoints) map.removeControl(window.polylineRutaAdmin);
                else map.removeLayer(window.polylineRutaAdmin);
                window.polylineRutaAdmin = null;
            }
            if (window.marcadoresRutaAdmin) {
                window.marcadoresRutaAdmin.forEach(m => map.removeLayer(m));
            }
            window.marcadoresRutaAdmin = [];

            const puntos = puntosDeRuta(window.rutaActual);
            if (puntos.length > 1) {
                window.polylineRutaAdmin = trazarRutaConCalles(map, puntos, {
                    color: '#4338ca',
                    weight: 5,
                    opacity: 0.9,
                    onRutaCalculada: (info) => {
                        const summaryEl = document.getElementById('route-summary');
                        if (summaryEl) {
                            summaryEl.innerHTML = `⏱️ Tiempo est.: <b>${info.duracionMin} min</b> &nbsp;|&nbsp; 📏 Distancia: <b>${info.distanciaKm} km</b> &nbsp;|&nbsp; <span style="color:#16a34a; font-weight:600;">🛣️ Calles reales activas</span>`;
                        }
                    }
                });

                puntos.forEach((p, i) => {
                    const esOrigen = i === 0;
                    const esDestino = i === puntos.length - 1;
                    const cColor = esOrigen ? '#10b981' : (esDestino ? '#ef4444' : '#6366f1');
                    const titulo = esOrigen ? 'Punto de Inicio' : (esDestino ? 'Destino Final' : (p.nombre || `Parada ${i + 1}`));
                    const m = L.circleMarker([p.lat, p.lng], {
                        radius: (esOrigen || esDestino) ? 8.5 : 6,
                        color: '#1e1b4b',
                        fillColor: cColor,
                        fillOpacity: 1,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>${escaparHtml(titulo)}</b>${esOrigen ? '<br><small>Debes estar a máximo 25 metros de aquí para iniciar.</small>' : ''}`);
                    window.marcadoresRutaAdmin.push(m);
                });
            }
        }

        // Obtener datos actualizados del admin para saber su transporte asignado
        let transporteIdActualTemp = null;
        const { data: adminUser } = await window.db.from('usuarios').select('transporte_id').eq('id', session.id).single();
        if(adminUser && adminUser.transporte_id) {
            transporteIdActualTemp = adminUser.transporte_id;
            if (session.transporte_id !== transporteIdActualTemp) {
                session.transporte_id = transporteIdActualTemp;
                localStorage.setItem('omni_user', JSON.stringify(session));
            }
        } else {
            // Failsafe por si el superadmin lo asignó pero no se actualizó su tabla usuarios
            const { data: transpFailsafe } = await window.db.from('transportes').select('id, viaje_id').eq('admin_id', session.id).eq('viaje_id', viajeIdActual).limit(1);
            if (transpFailsafe && transpFailsafe.length > 0) {
                transporteIdActualTemp = transpFailsafe[0].id;
                // Auto corregir en DB y localStorage
                window.db.from('usuarios').update({ transporte_id: transporteIdActualTemp, viaje_id: viajeIdActual }).eq('id', session.id).then();
                session.transporte_id = transporteIdActualTemp;
                session.viaje_id = viajeIdActual;
                localStorage.setItem('omni_user', JSON.stringify(session));
            }
        }

        if(transporteIdActualTemp) {
            transporteIdActual = transporteIdActualTemp;
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
        cargarSolicitudesParada();
        renderAdminCroquis();

        // Actualización visual de estado de ruta
        const btnIni = document.getElementById('btn-iniciar');
        const btnFin = document.getElementById('btn-finalizar');
        const estRuta = document.getElementById('estado-ruta');
        const infoUni = document.getElementById('unidad-estado-info');

        if(window.viajeEstadoActual === 'en_ruta' || window.viajeEstadoActual === 'en_ruta_ida' || window.viajeEstadoActual === 'en_ruta_vuelta') {
            if (btnIni) btnIni.style.display = 'none';
            if (btnFin) btnFin.style.display = 'inline-block';
            if(window.viajeEstadoActual === 'en_ruta_vuelta') {
                if (btnFin) btnFin.innerText = "Finalizar Viaje Completo";
                if (estRuta) estRuta.innerText = 'Ruta de Retorno en Progreso';
                if (infoUni) infoUni.innerText = 'Regresando hacia el origen.';
            } else {
                if (btnFin) btnFin.innerText = "Llegamos al Destino";
                if (estRuta) estRuta.innerText = 'Ruta de Ida en Progreso';
                if (infoUni) infoUni.innerText = 'En trayecto hacia el destino.';
            }
        } else if (window.viajeEstadoActual === 'espera_vuelta') {
            if (btnIni) {
                btnIni.style.display = 'inline-block';
                btnIni.innerText = "Iniciar Viaje de Retorno";
                btnIni.onclick = iniciarRetorno;
            }
            if (btnFin) btnFin.style.display = 'none';
            if (estRuta) estRuta.innerText = 'En Destino (Espera de Retorno)';
            if (infoUni) infoUni.innerText = 'En el destino. Listo para iniciar el regreso cuando se indique.';
        } else {
            if (btnIni) {
                btnIni.style.display = 'inline-block';
                btnIni.innerText = "Iniciar Ruta";
                btnIni.onclick = iniciarRuta;
            }
            if (btnFin) btnFin.style.display = 'none';
            if (estRuta) estRuta.innerText = 'Preparación';
            if (infoUni) infoUni.innerText = 'Ruta programada lista para iniciar.';
        }

        // ====== SUSCRIPCIONES REALTIME ======
        if (!window.adminChannel) {
            window.adminChannel = window.db.channel('admin-realtime')
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
                        if(payload.new.rol !== 'admin') {
                            Object.assign(session, payload.new);
                            localStorage.setItem('omni_user', JSON.stringify(session));
                            Swal.fire('Rol Modificado', 'Tu rol ha sido cambiado. Serás redirigido.', 'info').then(() => {
                                window.location.href = 'index.html';
                            });
                            return;
                        }
                    }

                    if(viajeIdActual) {
                        lastAdminOccupiedStr = "";
                        cargarManifiesto();
                        renderAdminCroquis();
                        cargarAnotadosYVehiculos();
                    }
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes' }, (payload) => {
                    loadAdminDashboard();
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'paradas_intermitentes' }, async (payload) => {
                    const p = payload.new;
                    if (p.viaje_id !== viajeIdActual) return;
                    const info = clasificarSolicitud(p);
                    const { data: u } = await window.db.from('usuarios').select('nombre_completo').eq('id', p.usuario_id).maybeSingle();
                    const nombre = u ? u.nombre_completo : 'Un estudiante';
                    const tipoTxt = info.tipo === 'abordaje' ? 'subirse' : 'una parada durante el recorrido';
                    const lugar = info.nombre ? ' en ' + info.nombre : '';
                    const latA = Number(p.lat);
                    const lngA = Number(p.lng);
                    Swal.fire({
                        title: 'Solicitud de parada',
                        html: '<p style="margin:0 1.2rem 0.6rem;">' + escaparHtml(nombre) + ' solicitó ' + escaparHtml(tipoTxt) + escaparHtml(lugar) + '.</p><div id="swal-parada-admin" style="height:280px;margin:0 1rem;border:1px solid #cfd6de;"></div>',
                        width: 680,
                        showDenyButton: true,
                        showCancelButton: true,
                        confirmButtonText: 'Aprobar',
                        denyButtonText: 'Rechazar',
                        cancelButtonText: 'Dejar pendiente',
                        didOpen: () => {
                            if (!isFinite(latA) || !isFinite(lngA)) return;
                            const mapaAviso = L.map('swal-parada-admin').setView([latA, lngA], 16);
                            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaAviso);
                            if (window.rutaActual && window.rutaActual.length > 1) {
                                const trazo = trazarRutaConCalles(mapaAviso, window.rutaActual, { color: '#0e4c81', weight: 4 });
                                if (trazo) mapaAviso.fitBounds(trazo.getBounds().extend([latA, lngA]), { padding: [24, 24], maxZoom: 17 });
                            }
                            L.circleMarker([latA, lngA], { radius: 9, color: '#8e2f2f', fillColor: '#c45c4a', fillOpacity: 1, weight: 2 }).addTo(mapaAviso).bindPopup(escaparHtml(info.nombre || 'Punto solicitado')).openPopup();
                            setTimeout(() => mapaAviso.invalidateSize(), 200);
                        }
                    }).then(async (result) => {
                        if (result.isConfirmed) await resolverSolicitud(p, 'aprobada');
                        else if (result.isDenied) await resolverSolicitud(p, 'rechazada');
                        cargarSolicitudesParada();
                    });
                    cargarSolicitudesParada();
                })
                .subscribe();

            if (!window.subAsientosRegistradaAdmin) {
                window.subAsientosRegistradaAdmin = true;
                suscribirAsientosEnVivo(() => {
                    if (viajeIdActual) {
                        lastAdminOccupiedStr = "";
                        renderAdminCroquis();
                        cargarManifiesto();
                        cargarAnotadosYVehiculos();
                    }
                });

                if (window.adminCroquisInterval) clearInterval(window.adminCroquisInterval);
                window.adminCroquisInterval = setInterval(() => {
                    if (viajeIdActual) {
                        renderAdminCroquis();
                        const tabManif = document.getElementById('manifiesto');
                        if (tabManif && tabManif.classList.contains('active')) cargarManifiesto();
                        const tabAsig = document.getElementById('asignacion');
                        if (tabAsig && tabAsig.classList.contains('active')) cargarAnotadosYVehiculos();
                    }
                }, 3000);
            }
        }

        setTimeout(() => { map.invalidateSize(); }, 500);
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudieron cargar los datos del viaje.', 'error');
    }
}

async function cargarManifiesto() {
    const { data: pasajeros } = await window.db.from('usuarios').select('id, nombre_completo, telefono, codigo_pasajero, asiento, parada_id, abordo, asistencia_cancelada, rol').eq('viaje_id', viajeIdActual).eq('transporte_id', transporteIdActual);
    const tbody = document.getElementById('manifest-tbody');
    tbody.innerHTML = '';

    if(!pasajeros || pasajeros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay pasajeros asignados a tu unidad.</td></tr>';
        document.getElementById('count-abordo').innerText = `A bordo: 0 / 0`;
        return;
    }

    let abordoCount = 0;
    
    pasajeros.forEach(p => {
        if(p.abordo) abordoCount++;
        
        let statusHtml = '';
        if(p.abordo) {
            statusHtml = '<span class="badge" style="background:var(--success); color:white; font-weight:700;">🟢 A bordo</span>';
        } else {
            statusHtml = '<span class="badge" style="background:var(--error); color:white; font-weight:700;">🔴 Aún no está dentro</span>';
        }

        let paradaNombre = 'Inicio / Por defecto';
        if (p.parada_id) {
            try {
                // p.parada_id ahora es un string JSON: '{"lat":13.0,"lng":-89.0}'
                const coords = JSON.parse(p.parada_id);
                // Buscar si coincide con alguna parada definida en la ruta
                let indexRuta = -1;
                if(window.rutaActual) {
                    indexRuta = window.rutaActual.findIndex(r => r.lat === coords.lat && r.lng === coords.lng);
                }
                
                if (indexRuta !== -1) {
                    paradaNombre = window.rutaActual[indexRuta].nombre || `Parada ${indexRuta + 1}`;
                } else {
                    paradaNombre = `Punto Personalizado (Lat: ${coords.lat.toFixed(4)})`;
                }
            } catch(e) {
                // Fallback por si hay datos viejos que usaban índices (0, 1, 2...)
                if(window.rutaActual && window.rutaActual[parseInt(p.parada_id)]) {
                    const rObj = window.rutaActual[parseInt(p.parada_id)];
                    paradaNombre = rObj.nombre || `Parada ${parseInt(p.parada_id) + 1}`;
                }
            }
        }

        const phoneLink = p.telefono ? `<a href="tel:${p.telefono}" class="btn btn-outline btn-auto">Llamar</a>` : '-';
        
        const actionHtml = `<button class="btn btn-${p.abordo ? 'outline' : 'success'} btn-auto" onclick="marcarAbordo(this, '${p.id}', ${p.abordo})" style="padding: 3px 8px; font-size: 0.78rem;">
            ${p.abordo ? 'Bajar' : 'Marcar A bordo'}
        </button>`;

        tbody.innerHTML += `
            <tr>
                <td>${p.nombre_completo} <br> ${phoneLink}</td>
                <td>${p.codigo_pasajero || '-'}</td>
                <td><b>${paradaNombre}</b></td>
                <td>${p.asiento || '-'}</td>
                <td id="status-${p.id}">${statusHtml}</td>
                <td>${actionHtml}</td>
            </tr>
        `;
    });

    document.getElementById('count-abordo').innerText = `A bordo: ${abordoCount} / ${pasajeros.length}`;
    
    // Dibujar los puntos personalizados de los estudiantes en el mapa del Chofer
    if (window.customParadaMarkers) {
        window.customParadaMarkers.forEach(m => map.removeLayer(m));
    }
    window.customParadaMarkers = [];
    
    pasajeros.forEach(p => {
        if(p.parada_id) {
            try {
                const coords = JSON.parse(p.parada_id);
                if(window.rutaActual) {
                    const indexRuta = window.rutaActual.findIndex(r => r.lat === coords.lat && r.lng === coords.lng);
                    if(indexRuta === -1) {
                        // Es un punto personalizado, dibujarlo!
                        const marker = L.marker([coords.lat, coords.lng], { 
                            icon: L.divIcon({className: 'custom-div-icon', html: "<div style='background:#fde047; width:15px; height:15px; border-radius:50%; border:2px solid #b45309;'></div>"}) 
                        }).addTo(map).bindPopup(`<b>Punto de Recogida</b><br>${p.nombre_completo}`);
                        window.customParadaMarkers.push(marker);
                    }
                }
            } catch(e) {}
        }
    });
}

async function marcarAbordo(btn, id, estaAbordo) {
    const nuevoEstado = !estaAbordo;
    await window.db.from('usuarios').update({ abordo: nuevoEstado, asistencia_cancelada: false }).eq('id', id);
}

// ====== LÓGICA DE VIAJE Y TRANSMISIÓN GPS ======
let markerUbicacionChofer = null;
let noSleepInstance = null;
try { if (typeof NoSleep !== 'undefined') noSleepInstance = new NoSleep(); } catch(e) {}

const gpsToggle = document.getElementById('gps-toggle');
const gpsDot = document.getElementById('gps-dot');
const gpsText = document.getElementById('gps-text');

if (gpsToggle) {
    gpsToggle.addEventListener('change', (e) => {
        if (e.target.checked) activarGPS();
        else desactivarGPS();
    });
}

function activarGPS() {
    if (!navigator.geolocation) {
        if (gpsToggle) gpsToggle.checked = false;
        return Swal.fire('Sin soporte GPS', 'Tu dispositivo no cuenta con soporte para geolocalización.', 'warning');
    }
    
    if (gpsDot) gpsDot.classList.add('active');
    if (gpsText) gpsText.innerText = 'Transmitiendo en vivo...';
    try { if (noSleepInstance) noSleepInstance.enable(); } catch (e) { }
    
    watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const speed = position.coords.speed || 0;
            
            if (!markerUbicacionChofer) {
                const busIcon = L.divIcon({
                    className: 'custom-bus-icon',
                    html: `<div style="background:#10b981; color:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(16,185,129,0.8); border:2px solid #fff; font-size:14px;">📍</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
                markerUbicacionChofer = L.marker([lat, lng], { icon: busIcon }).addTo(map).bindPopup('<b>Tu ubicación GPS actual</b>');
            } else {
                markerUbicacionChofer.setLatLng([lat, lng]);
            }
            
            // Insertar lectura en Supabase para visibilidad del superadmin y pasajeros
            if (transporteIdActual) {
                try {
                    await window.db.from('gps_logs').insert([{
                        transporte_id: transporteIdActual,
                        latitud: lat,
                        longitud: lng,
                        velocidad: speed
                    }]);
                } catch(err) {
                    console.warn('Registro de GPS en BD omitido:', err);
                }
            }
        },
        (error) => {
            console.warn('Error obteniendo geolocalización:', error);
            if (gpsText) gpsText.innerText = 'Sin señal o permiso denegado';
            desactivarGPS();
            if (gpsToggle) gpsToggle.checked = false;
        },
        { enableHighAccuracy: true, maximumAge: 8000, timeout: 10000 }
    );
}

function desactivarGPS() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (gpsDot) gpsDot.classList.remove('active');
    if (gpsText) gpsText.innerText = 'Inactivo';
    try { if (noSleepInstance) noSleepInstance.disable(); } catch (e) { }
    if (markerUbicacionChofer) {
        map.removeLayer(markerUbicacionChofer);
        markerUbicacionChofer = null;
    }
}

async function iniciarRuta() {
    if(!viajeIdActual) return;
    if(!window.rutaActual || window.rutaActual.length === 0) {
        return Swal.fire('Error', 'El viaje no tiene una ruta definida.', 'error');
    }

    const res = await Swal.fire({
        title: '¿Iniciar la Ruta de Ida?',
        text: 'Se registrará que la unidad ha iniciado el recorrido.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, iniciar ruta',
        cancelButtonText: 'Cancelar'
    });
    if(!res.isConfirmed) return;

    try {
        await window.db.from('viajes').update({ estado: 'en_ruta_ida' }).eq('id', viajeIdActual);
        document.getElementById('btn-iniciar').style.display = 'none';
        document.getElementById('btn-finalizar').style.display = 'inline-block';
        document.getElementById('btn-finalizar').innerText = "Llegamos al Destino";
        document.getElementById('estado-ruta').innerText = 'Ruta de Ida en Progreso';
        const infoUni = document.getElementById('unidad-estado-info');
        if (infoUni) infoUni.innerText = 'En trayecto hacia el destino.';
        
        // Si el chofer tiene el toggle activo, inicia transmisión GPS
        if (gpsToggle && gpsToggle.checked && !watchId) activarGPS();

        Swal.fire('Ruta Iniciada', 'La ruta de ida ha quedado iniciada.', 'success');
        setTimeout(() => loadAdminDashboard(), 1000);
    } catch(e) { console.error(e); Swal.fire('Error', 'Fallo al iniciar ruta.', 'error'); }
}

async function iniciarRetorno() {
    if(!viajeIdActual) return;
    const res = await Swal.fire({
        title: '¿Iniciar Ruta de Retorno?',
        text: 'Se iniciará el viaje de regreso hacia el punto de origen.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, iniciar retorno',
        cancelButtonText: 'Cancelar'
    });
    if(!res.isConfirmed) return;

    try {
        await window.db.from('viajes').update({ estado: 'en_ruta_vuelta' }).eq('id', viajeIdActual);
        if (gpsToggle && gpsToggle.checked && !watchId) activarGPS();
        Swal.fire('Ruta de Retorno Iniciada', 'El viaje de regreso está en curso.', 'success');
        setTimeout(() => loadAdminDashboard(), 1000);
    } catch(e) { console.error(e); }
}

async function finalizarRuta() {
    if(!viajeIdActual) return;
    try {
        if(window.viajeEstadoActual === 'en_ruta_ida' || window.viajeEstadoActual === 'en_ruta') {
            const res = await Swal.fire({
                title: '¿Llegamos al Destino?',
                text: 'Se indicará que la unidad llegó al destino intermedio.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, llegamos al destino'
            });
            if(!res.isConfirmed) return;
            await window.db.from('viajes').update({ estado: 'espera_vuelta' }).eq('id', viajeIdActual);
            Swal.fire('Destino Alcanzado', 'El viaje está en espera hasta la hora de regreso.', 'info');
            setTimeout(() => loadAdminDashboard(), 1000);
        } else if (window.viajeEstadoActual === 'en_ruta_vuelta') {
            const res = await Swal.fire({
                title: '¿Finalizar Viaje Completo?',
                text: 'Se dará por concluido todo el recorrido y regreso a la institución.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, finalizar viaje'
            });
            if(!res.isConfirmed) return;
            await window.db.from('viajes').update({ estado: 'finalizado', inscripcion_abierta: false }).eq('id', viajeIdActual);
            desactivarGPS();
            if (gpsToggle) gpsToggle.checked = false;
            Swal.fire('Viaje Concluido', 'El viaje ha finalizado con éxito.', 'success');
            setTimeout(() => loadAdminDashboard(), 1000);
        }
    } catch(e) { console.error(e); }
}

async function cargarSolicitudesParada() {
    const tbody = document.getElementById('paradas-tbody');
    const panel = document.getElementById('panel-paradas');
    if (!tbody || !viajeIdActual) return;
    if (panel) panel.style.display = 'block';
    const { data: sols } = await window.db.from('paradas_intermitentes').select('*').eq('viaje_id', viajeIdActual);
    window.solicitudesAdmin = sols || [];
    pintarMapaParadasAdmin(window.solicitudesAdmin);
    if (!sols || sols.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No hay solicitudes.</td></tr>';
        document.getElementById('count-paradas').innerText = 'Pendientes: 0';
        return;
    }
    const ids = [...new Set(sols.map((s) => s.usuario_id).filter(Boolean))];
    const { data: usuarios } = ids.length ? await window.db.from('usuarios').select('id, nombre_completo').in('id', ids) : { data: [] };
    const nombres = {};
    (usuarios || []).forEach((u) => { nombres[u.id] = u.nombre_completo; });
    const pendientes = sols.filter((s) => clasificarSolicitud(s).estado === 'pendiente').length;
    document.getElementById('count-paradas').innerText = 'Pendientes: ' + pendientes;
    tbody.innerHTML = '';
    sols.forEach((p) => {
        const info = clasificarSolicitud(p);
        const tipo = info.tipo === 'abordaje' ? 'Subida' : 'Durante el viaje';
        const acciones = `<button class="btn ${info.estado === 'pendiente' ? 'btn-primary' : 'btn-outline'} btn-auto" onclick="evaluarSolicitudAdmin('${p.id}')">🔍 ${info.estado === 'pendiente' ? 'Revisar en Mapa' : 'Ver en Mapa'}</button>`;
        tbody.innerHTML += `<tr>
            <td>${escaparHtml(nombres[p.usuario_id] || 'Estudiante')}</td>
            <td>${tipo}</td>
            <td>${escaparHtml(info.nombre || 'Punto sobre la ruta')}</td>
            <td>${escaparHtml(info.estado)}</td>
            <td>${acciones}</td>
        </tr>`;
    });
}

let mapaParadasAdmin = null;
function pintarMapaParadasAdmin(sols) {
    const caja = document.getElementById('admin-paradas-map');
    if (!caja) return;
    if (!mapaParadasAdmin) {
        mapaParadasAdmin = L.map('admin-paradas-map').setView([13.6929, -89.2182], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaParadasAdmin);
    }
    if (window.capasParadasAdmin) window.capasParadasAdmin.forEach((c) => mapaParadasAdmin.removeLayer(c));
    window.capasParadasAdmin = [];
    const limites = [];
    if (window.rutaActual && window.rutaActual.length > 1) {
        const linea = trazarRutaConCalles(mapaParadasAdmin, window.rutaActual, { color: '#0e4c81', weight: 4 });
        if (linea) window.capasParadasAdmin.push(linea);
        window.rutaActual.forEach((r) => limites.push([r.lat, r.lng]));
    }
    (sols || []).forEach((s) => {
        const latN = Number(s.lat);
        const lngN = Number(s.lng);
        if (!isFinite(latN) || !isFinite(lngN)) return;
        const info = clasificarSolicitud(s);
        const marca = L.circleMarker([latN, lngN], { radius: 8, color: '#8e2f2f', fillColor: '#c45c4a', fillOpacity: 1, weight: 2 }).addTo(mapaParadasAdmin);
        marca.bindPopup('<b>' + escaparHtml(info.nombre || 'Punto solicitado') + '</b>');
        window.capasParadasAdmin.push(marca);
        limites.push([latN, lngN]);
    });
    if (limites.length) mapaParadasAdmin.fitBounds(limites, { padding: [24, 24], maxZoom: 16 });
    setTimeout(() => mapaParadasAdmin.invalidateSize(), 200);
}

function verPuntoParadaAdmin(id) {
    const s = (window.solicitudesAdmin || []).find((x) => x.id === id);
    const latN = s ? Number(s.lat) : NaN;
    const lngN = s ? Number(s.lng) : NaN;
    if (!mapaParadasAdmin || !isFinite(latN) || !isFinite(lngN)) return;
    mapaParadasAdmin.setView([latN, lngN], 16);
    const caja = document.getElementById('admin-paradas-map');
    if (caja) caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function evaluarSolicitudAdmin(id) {
    const p = (window.solicitudesAdmin || []).find((s) => s.id === id) || 
              (await window.db.from('paradas_intermitentes').select('*').eq('id', id).single()).data;
    if (!p) return Swal.fire('Error', 'No se encontró la solicitud.', 'error');

    const info = clasificarSolicitud(p);
    const { data: usuario } = await window.db.from('usuarios').select('id, nombre_completo, codigo_pasajero, foto_perfil, telefono').eq('id', p.usuario_id).maybeSingle();
    const nombre = usuario ? usuario.nombre_completo : 'Un estudiante';
    const codigo = (usuario && usuario.codigo_pasajero) ? `Código: ${usuario.codigo_pasajero}` : '';
    const fotoSrc = (usuario && usuario.foto_perfil) ? usuario.foto_perfil : `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=random`;
    const tipoTxt = info.tipo === 'abordaje' ? 'Punto de Subida (Abordaje inicial)' : 'Parada solicitada durante el recorrido';
    const latA = Number(p.lat);
    const lngA = Number(p.lng);
    const isPendiente = info.estado === 'pendiente';

    let textoDistancia = '';
    if (window.rutaActual && window.rutaActual.length >= 2 && isFinite(latA) && isFinite(lngA)) {
        const proy = puntoSobreRuta(latA, lngA, window.rutaActual, 5000);
        if (proy) {
            const d = Math.round(proy.dist);
            textoDistancia = d <= MARGEN_RUTA_METROS
                ? `<span style="color:#16a34a; font-weight:600; font-size:0.85rem;">✓ A ${d} m del recorrido</span>`
                : `<span style="color:#dc2626; font-weight:600; font-size:0.85rem;">⚠️ A ${d} m del recorrido (lejos)</span>`;
        }
    }

    await Swal.fire({
        title: `Solicitud: ${escaparHtml(info.nombre || 'Punto')}`,
        html: `
            <div style="text-align:left; font-size:0.92rem; margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
                    <img src="${fotoSrc}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                    <div style="flex:1;">
                        <strong style="color:var(--navy); font-size:1rem; display:block;">${escaparHtml(nombre)}</strong>
                        <span style="color:var(--text-muted); font-size:0.85rem;">${codigo}</span>
                    </div>
                    <span class="badge ${isPendiente ? 'pending' : 'approved'}">${escaparHtml(info.estado.toUpperCase())}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div><b>Lugar:</b> ${escaparHtml(info.nombre || 'Sin nombre')} (${tipoTxt})</div>
                    <div>${textoDistancia}</div>
                </div>
            </div>
            <div id="swal-admin-evaluar-map" style="height:320px; border-radius:8px; border:2px solid #cbd5e1;"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#64748b; margin-top:6px;">
                <span>🟢 Salida &nbsp;|&nbsp; 📍 Punto Solicitado &nbsp;|&nbsp; ━━ Ruta</span>
                <span>${isFinite(latA) ? (latA.toFixed(5) + ', ' + lngA.toFixed(5)) : ''}</span>
            </div>
        `,
        width: 720,
        showCancelButton: true,
        showDenyButton: isPendiente,
        confirmButtonText: isPendiente ? '✓ Aprobar Parada' : 'Aceptar',
        confirmButtonColor: '#16a34a',
        denyButtonText: '✕ Rechazar Parada',
        denyButtonColor: '#dc2626',
        cancelButtonText: isPendiente ? 'Dejar Pendiente' : 'Cerrar',
        didOpen: () => {
            if (!isFinite(latA) || !isFinite(lngA)) return;
            const mapa = L.map('swal-admin-evaluar-map').setView([latA, lngA], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
            
            const limites = [[latA, lngA]];
            if (window.rutaActual && window.rutaActual.length > 1) {
                const linea = trazarRutaConCalles(mapa, window.rutaActual, { color: '#0e4c81', weight: 5 });
                window.rutaActual.forEach(ll => limites.push([ll.lat, ll.lng]));

                const origen = window.rutaActual[0];
                L.circleMarker([origen.lat, origen.lng], { radius: 8, color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1 }).addTo(mapa).bindPopup("<b>Inicio</b>");
            }

            const iconPunto = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background:#ef4444; width:22px; height:22px; border-radius:50%; border:2px solid white; box-shadow:0 0 8px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; color:white; font-size:12px;">📍</div>`,
                iconSize: [22, 22]
            });
            L.marker([latA, lngA], { icon: iconPunto }).addTo(mapa).bindPopup(`<b>Punto Solicitado</b><br>${escaparHtml(info.nombre || 'Parada')}`).openPopup();

            if (limites.length > 1) mapa.fitBounds(L.latLngBounds(limites).pad(0.18), { maxZoom: 16 });
            setTimeout(() => mapa.invalidateSize(), 200);
        }
    }).then(async (result) => {
        if (result.isConfirmed && isPendiente) {
            await resolverSolicitud(p, 'aprobada');
            cargarSolicitudesParada();
        } else if (result.isDenied && isPendiente) {
            await resolverSolicitud(p, 'rechazada');
            cargarSolicitudesParada();
        }
    });
}

async function resolverSolicitudPorId(id, estado) {
    const { data: p } = await window.db.from('paradas_intermitentes').select('*').eq('id', id).single();
    if (p) await resolverSolicitud(p, estado);
}

async function resolverSolicitud(p, decision) {
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
        L.marker([p.lat, p.lng]).addTo(map).bindPopup((info.nombre || 'Parada') + ' — aprobada');
    }
    cargarSolicitudesParada();
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

        // Traer usuarios anotados o asignados a este viaje (excluir admins)
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
            viaje_id: viajeIdActual,
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
        occupiedIds.push('MINE:' + (session.asiento || 'none'));
        const occupiedStr = JSON.stringify(occupiedIds);
        
        if (croquisDiv.innerHTML !== '' && lastAdminOccupiedStr === occupiedStr) return;
        lastAdminOccupiedStr = occupiedStr;

        if(usuarios) {
            usuarios.forEach(u => { asientosOcupadosInfo[u.asiento] = u; });
        }

        const miAsiento = session.asiento;
        const html = htmlAsientos(plazasPorTipo(t.tipo), (n) => genAdminSeat(n, asientosOcupadosInfo, miAsiento, t.viaje_id, transporteIdActual));
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
                    notificarCambioAsiento(viajeId, transporteId);
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
                notificarCambioAsiento(viajeId, transporteId);
            } catch(e) {
                Swal.fire('Error', 'Ese asiento acaba de ser tomado por otra persona.', 'error');
                lastAdminOccupiedStr = "";
                renderAdminCroquis();
            }
        }
    });
}
