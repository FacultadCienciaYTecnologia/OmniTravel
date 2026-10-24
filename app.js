// ====== LÓGICA MULTISTEP ======
function nextStep(current, next) {
    const form = document.getElementById(`form-${current}`);
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Validación extra para el DNI si no es menor de edad
    if (current === 1) {
        const isMenor = document.getElementById('r-menor').checked;
        const dniInput = document.getElementById('r-dni');
        if (!isMenor && dniInput.value.trim() === '') {
            document.getElementById('dni-error').style.display = 'block';
            document.getElementById('dni-error').innerText = "Debes ingresar tu documento o marcar que eres menor.";
            return;
        }
    }

    document.getElementById(`step-${current}`).classList.remove('active');
    const stepEl = document.getElementById(`step-${next}`);
    stepEl.classList.add('active');
    
    document.getElementById(`ind-${current}`).classList.add('completed');
    document.getElementById(`ind-${current}`).classList.remove('current');
    document.getElementById(`ind-${next}`).classList.add('current');

    const llevarArriba = () => {
        window.scrollTo(0, 0);
        if (stepEl) stepEl.scrollIntoView({ block: 'start' });
    };
    llevarArriba();
    const foco = { 2: 'r-email', 3: 'r-depto' }[next];
    if (foco) {
        const campo = document.getElementById(foco);
        if (campo) campo.focus({ preventScroll: true });
    }
    setTimeout(llevarArriba, 0);
}

function prevStep(current, prev) {
    document.getElementById(`step-${current}`).classList.remove('active');
    document.getElementById(`step-${prev}`).classList.add('active');
    
    document.getElementById(`ind-${current}`).classList.remove('current');
    document.getElementById(`ind-${prev}`).classList.remove('completed');
    document.getElementById(`ind-${prev}`).classList.add('current');
}

// ====== LÓGICA DE FACE ID (Registro) ======
let faceModelsLoaded = false;
let currentStream = null;
let profileDescriptor = null;
let profilePhotoBlob = null;
let faceInterval = null;

const elSalvadorData = {
    "Ahuachapán": ["Ahuachapán", "Apaneca", "Atiquizaya", "Concepción de Ataco", "El Refugio", "Fascayuca", "Guaymango", "Jujutla", "San Francisco Menéndez", "San Lorenzo", "San Pedro Puxtla", "Tacuba", "Turín"],
    "Cabañas": ["Cinquera", "Dolores", "Guacotecti", "Ilobasco", "Jutiapa", "San Isidro", "Sensuntepeque", "Tejutepeque", "Victoria"],
    "Chalatenango": ["Agua Caliente", "Arcatao", "Azacualpa", "Chalatenango", "Citalá", "Comalapa", "Concepción Quezaltepeque", "Dulce Nombre de María", "El Carrizal", "El Paraíso", "La Laguna", "La Palma", "La Reina", "Las Flores", "Las Vueltas", "Nombre de Jesús", "Nueva Concepción", "Nueva Trinidad", "Ojos de Agua", "Potonico", "San Antonio de la Cruz", "San Antonio Los Ranchos", "San Fernando", "San Francisco Lempa", "San Francisco Morazán", "San Ignacio", "San Isidro Labrador", "San Luis del Carmen", "San Miguel de Mercedes", "San Rafael", "Santa Rita", "Tejutla"],
    "Cuscatlán": ["Candelaria", "Cojutepeque", "El Carmen", "El Rosario", "Monte San Juan", "Oratorio de Concepción", "San Bartolomé Perulapía", "San Cristóbal", "San José Guayabal", "San Pedro Perulapán", "San Rafael Cedros", "San Ramón", "Santa Cruz Analquito", "Santa Cruz Michapa", "Suchitoto", "Tenancingo"],
    "La Libertad": ["Antiguo Cuscatlán", "Chiltiupán", "Ciudad Arce", "Colón", "Comasagua", "Huizúcar", "Jayaque", "Jicalapa", "La Libertad", "Nuevo Cuscatlán", "Opico", "Quezaltepeque", "Sacacoyo", "San José Villanueva", "San Matías", "San Pablo Tacachico", "Santa Tecla", "Tamanique", "Teotepeque", "Tepecoyo", "Zaragoza"],
    "La Paz": ["Cuyultitán", "El Rosario", "Jerusalén", "Mercedes La Ceiba", "Olocuilta", "Paraíso de Osorio", "San Antonio Masahuat", "San Emigdio", "San Francisco Chinameca", "San Juan Nonualco", "San Juan Talpa", "San Juan Tepezontes", "San Luis La Herradura", "San Luis Talpa", "San Miguel Tepezontes", "San Pedro Masahuat", "San Pedro Nonualco", "San Rafael Obrajuelo", "Santa María Ostuma", "Santiago Nonualco", "Tapalhuaca", "Zacatecoluca"],
    "La Unión": ["Anamorós", "Bolívar", "Concepción de Oriente", "Conchagua", "El Carmen", "El Sauce", "Intipucá", "La Unión", "Lislique", "Meanguera del Golfo", "Nueva Esparta", "Pasaquina", "Polorós", "San Alejo", "San José", "Santa Rosa de Lima", "Yayantique", "Yucuaiquín"],
    "Morazán": ["Arambala", "Cacaopera", "Chilanga", "Corinto", "Delicias de Concepción", "El Divisadero", "El Rosario", "Gualococti", "Guatajiagua", "Joateca", "Jocoaitique", "Jocoro", "Lolotiquillo", "Meanguera", "Osicala", "Perquín", "San Carlos", "San Fernando", "San Francisco Gotera", "San Isidro", "San Simón", "Sensembra", "Sociedad", "Torola", "Yamabal", "Yoloaiquín"],
    "San Miguel": ["Carolina", "Chapeltique", "Chinameca", "Chirilagua", "Ciudad Barrios", "Comacarán", "El Tránsito", "Lolotique", "Moncagua", "Nueva Guadalupe", "Nuevo Edén de San Juan", "Quelepa", "San Antonio del Mosco", "San Gerardo", "San Jorge", "San Luis de la Reina", "San Miguel", "San Rafael Oriente", "Sesori", "Uluazapa"],
    "San Salvador": ["Aguilares", "Apopa", "Ayutuxtepeque", "Cuscatancingo", "Delgado", "El Paisnal", "Guazapa", "Ilopango", "Mejicanos", "Nejapa", "Panchimalco", "Rosario de Mora", "San Marcos", "San Martín", "San Salvador", "Santiago Texacuangos", "Santo Tomás", "Soyapango", "Tonacatepeque"],
    "San Vicente": ["Apastepeque", "Guadalupe", "San Cayetano Istepeque", "San Esteban Catarina", "San Ildefonso", "San Lorenzo", "San Sebastián", "San Vicente", "Santa Clara", "Santo Domingo", "Tecoluca", "Tepetitán", "Verapaz"],
    "Santa Ana": ["Candelaria de la Frontera", "Chalchuapa", "Coatepeque", "El Congo", "El Porvenir", "Masahuat", "Metapán", "San Antonio Pajonal", "San Sebastián Salitrillo", "Santa Ana", "Santa Rosa Guachipilín", "Santiago de la Frontera", "Texistepeque"],
    "Sonsonate": ["Acajutla", "Armenia", "Caluco", "Cuisnahuat", "Izalco", "Juayúa", "Nahuizalco", "Nahulingo", "Salcoatitán", "San Antonio del Monte", "San Julián", "Santa Catarina Masahuat", "Santa Isabel Ishuatán", "Santo Domingo de Guzmán", "Sonsonate", "Sonzacate"],
    "Usulután": ["Alegría", "Berlín", "California", "Concepción Batres", "El Triunfo", "Ereguayquín", "Estanzuelas", "Jiquilisco", "Jucuapa", "Jucuarán", "Mercedes Umaña", "Nueva Granada", "Ozatlán", "Puerto El Triunfo", "San Agustín", "San Buenaventura", "San Dionisio", "San Francisco Javier", "Santa Elena", "Santa María", "Santiago de María", "Tecapán", "Usulután"]
};

document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('r-depto')) {
        const deptoSelect = document.getElementById('r-depto');
        for(let depto in elSalvadorData) {
            deptoSelect.innerHTML += `<option value="${depto}">${depto}</option>`;
        }
    }
});

function cargarMunicipios() {
    const depto = document.getElementById('r-depto').value;
    const muniSelect = document.getElementById('r-muni');
    muniSelect.innerHTML = '<option value="" disabled selected>Selecciona...</option>';
    if(depto && elSalvadorData[depto]) {
        elSalvadorData[depto].forEach(muni => {
            muniSelect.innerHTML += `<option value="${muni}">${muni}</option>`;
        });
    }
}

async function loadFaceModels() {
    const CDNS = [
        'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights',
        'https://justadudewhohacks.github.io/face-api.js/models'
    ];
    
    for (const url of CDNS) {
        try {
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(url),
                faceapi.nets.faceLandmark68Net.loadFromUri(url),
                faceapi.nets.faceRecognitionNet.loadFromUri(url)
            ]);
            faceModelsLoaded = true;
            console.log("Modelos Face-API cargados exitosamente desde:", url);
            return;
        } catch (e) {
            console.warn("Fallo cargando modelos desde", url, e);
        }
    }
    console.error("No se pudieron cargar modelos Face-API.");
    Swal.fire('Aviso', 'No se pudieron descargar los modelos faciales. Por favor verifica tu conexión.', 'warning');
}

// Cargar modelos al iniciar si estamos en registro o login facial
if(document.getElementById('video-registro') || document.getElementById('video-login')) {
    loadFaceModels();
}

async function startRegistroFace() {
    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, 
            audio: false 
        });
        const video = document.getElementById('video-registro');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.srcObject = currentStream;
        await video.play().catch(e => console.log('Video play catch:', e));
        
        document.getElementById('btn-start-cam').style.display = 'none';
        
        // Esperar a que el video empiece a reproducirse para analizar
        video.onloadedmetadata = () => {
            video.play().catch(e => console.log(e));
            const btnTake = document.getElementById('btn-take-foto');
            btnTake.disabled = true; // Habilitado automáticamente al detectar rostro
            
            if(faceModelsLoaded) {
                detectFaceLoop(video, 'canvas-overlay-reg', 'overlay', 'btn-take-foto');
            } else {
                loadFaceModels().then(() => {
                    if (faceModelsLoaded) detectFaceLoop(video, 'canvas-overlay-reg', 'overlay', 'btn-take-foto');
                });
            }
        };

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo acceder a la cámara. Asegúrate de dar permisos.', 'error');
    }
}

function detectFaceLoop(video, canvasId, overlayId, btnId) {
    const canvas = document.getElementById(canvasId);
    const overlay = document.getElementById(overlayId);
    const btn = document.getElementById(btnId);
    const statusLabel = document.getElementById('face-reg-status');
    
    let displaySize = { width: video.videoWidth || 640, height: video.videoHeight || 480 };
    if (canvas) faceapi.matchDimensions(canvas, displaySize);
    
    if (faceInterval) clearInterval(faceInterval);
    let isDetecting = false;

    faceInterval = setInterval(async () => {
        if (isDetecting) return;
        if (!video || video.paused || video.ended) return;

        isDetecting = true;
        try {
            if (video.videoWidth && canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
                displaySize = { width: video.videoWidth, height: video.videoHeight };
                faceapi.matchDimensions(canvas, displaySize);
            }

            const detections = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
            
            const ctx = canvas ? canvas.getContext('2d') : null;
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (detections) {
                if (canvas) {
                    const resizedDetections = faceapi.resizeResults(detections, displaySize);
                    faceapi.draw.drawDetections(canvas, resizedDetections);
                }
                
                const score = detections.detection.score || 0;
                const box = detections.detection.box;
                const vw = video.videoWidth || 640;
                const vh = video.videoHeight || 480;

                const centerX = box.x + box.width / 2;
                const centerY = box.y + box.height / 2;
                const relX = centerX / vw;
                const relY = centerY / vh;
                const relWidth = box.width / vw;

                // Validación de centrado y distancia adecuada
                const estaCentrado = relX >= 0.28 && relX <= 0.72 && relY >= 0.22 && relY <= 0.78;
                const tamanoAdecuado = relWidth >= 0.20 && relWidth <= 0.85;

                if (score >= 0.65 && estaCentrado && tamanoAdecuado) {
                    overlay.classList.add('success');
                    overlay.classList.remove('error', 'scanning');
                    overlay.style.borderColor = "var(--success)";
                    if(statusLabel) {
                        statusLabel.innerHTML = '✅ <span style="color:#10b981; font-weight:700;">Rostro detectado correctamente.</span> Ya puedes hacer clic en <b>Escanear Rostro</b>.';
                    }
                    window.currentDescriptor = detections.descriptor;
                    if(btn) btn.disabled = false;
                } else if (!tamanoAdecuado && relWidth < 0.20) {
                    overlay.style.borderColor = "var(--warning)";
                    if(statusLabel) statusLabel.innerText = "Acércate un poco más a la cámara.";
                } else if (!estaCentrado) {
                    overlay.style.borderColor = "var(--warning)";
                    if(statusLabel) statusLabel.innerText = "Centra tu rostro dentro del círculo guía.";
                } else {
                    overlay.style.borderColor = "var(--warning)";
                    if(statusLabel) statusLabel.innerText = "Mejora la iluminación de tu rostro.";
                }
            } else {
                overlay.classList.remove('success');
                overlay.style.borderColor = "var(--error)";
                if(statusLabel) statusLabel.innerText = "No se detecta un rostro claro. Centrate e ilumínate.";
            }
        } catch(err) {
            console.error("Error en detección facial:", err);
        } finally {
            isDetecting = false;
        }
    }, 350); // Intervalo optimizado para evitar saturar el CPU en móviles
}

function captureFace() {
    if (faceModelsLoaded && !window.currentDescriptor) {
        Swal.fire('Atención', 'No se ha detectado un rostro válido. Por favor enfócate bien en la cámara.', 'warning');
        return;
    }
    
    if (window.currentDescriptor) {
        profileDescriptor = Array.from(window.currentDescriptor); // Convertir Float32Array a Array JSON
    }

    const video = document.getElementById('video-registro');
    if (!video || !video.videoWidth) return;

    // Recortar en cuadrado centrado y optimizar a 240x240 para no saturar la BD con 2000 estudiantes (~12 KB)
    const size = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, startX, startY, size, size, 0, 0, 240, 240);
    
    const dataUrl = canvas.toDataURL('image/webp', 0.82);
    
    // Mostrar foto tomada
    const img = document.getElementById('img-perfil');
    img.src = dataUrl;
    img.style.display = 'block';
    
    document.getElementById('cam-container').style.display = 'none';
    document.getElementById('btn-take-foto').style.display = 'none';
    
    // Guardar blob
    canvas.toBlob((blob) => { profilePhotoBlob = blob; }, 'image/webp', 0.82);

    // Limpiar stream
    if (faceInterval) clearInterval(faceInterval);
    if(currentStream) currentStream.getTracks().forEach(track => track.stop());
}

function validateStep2() {
    if(!profilePhotoBlob) {
        Swal.fire('Atención', 'Debes registrar tu rostro para crear el Face ID.', 'warning');
        return;
    }
    nextStep(2, 3);
}

// ====== LOGIN FACE ID ======
async function startFaceLogin() {
    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, 
            audio: false 
        });
        const video = document.getElementById('video-login');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.srcObject = currentStream;
        await video.play().catch(e => console.log('Video play catch:', e));
        
        document.getElementById('btn-start-face').style.display = 'none';
        
        video.onloadedmetadata = () => {
            video.play().catch(e => console.log(e));
            if(faceModelsLoaded) {
                document.getElementById('overlay-login').classList.add('scanning');
                document.getElementById('face-status').innerText = "Escaneando rostro...";
                loginDetectFaceLoop(video);
            }
        };
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo acceder a la cámara.', 'error');
    }
}

function loginDetectFaceLoop(video) {
    const canvas = document.getElementById('canvas-overlay');
    let displaySize = { width: video.videoWidth || 640, height: video.videoHeight || 480 };
    if (canvas) faceapi.matchDimensions(canvas, displaySize);
    
    let attempts = 0;
    const statusLabel = document.getElementById('face-status');
    let isMatching = false;
    
    const interval = setInterval(async () => {
        if (isMatching) return;
        if (!video || video.paused || video.ended) return;

        if (video.videoWidth && canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
            displaySize = { width: video.videoWidth, height: video.videoHeight };
            faceapi.matchDimensions(canvas, displaySize);
        }
        attempts++;
        if (attempts > 50) {
            clearInterval(interval);
            if(statusLabel) statusLabel.innerText = "Tiempo de espera agotado. Intenta con tu contraseña.";
            const over = document.getElementById('overlay-login');
            if (over) over.classList.remove('scanning');
            stopCamera();
            return;
        }

        try {
            const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
            
            if (detection && detection.detection.score >= 0.68) {
                isMatching = true;
                clearInterval(interval);

                const over = document.getElementById('overlay-login');
                if (over) {
                    over.classList.remove('scanning');
                    over.classList.add('success');
                }
                if (statusLabel) statusLabel.innerText = "Verificando identidad biométrica...";
                
                // Obtener solo usuarios aprobados con descriptor
                const { data: users, error } = await window.db
                    .from('usuarios')
                    .select('id, nombre_completo, rol, estado_aprobacion, face_descriptor')
                    .not('face_descriptor', 'is', null);
                
                if (error || !users || users.length === 0) {
                    Swal.fire('Aviso', 'No hay rostros registrados en el sistema.', 'info');
                    stopCamera();
                    return;
                }

                const labeledDescriptors = users
                    .filter(u => Array.isArray(u.face_descriptor) && u.face_descriptor.length === 128)
                    .map(u => new faceapi.LabeledFaceDescriptors(String(u.id), [new Float32Array(u.face_descriptor)]));

                if (!labeledDescriptors.length) {
                    Swal.fire('Aviso', 'No se encontraron descriptores faciales compatibles.', 'info');
                    stopCamera();
                    return;
                }

                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.52);
                const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

                if (bestMatch.label !== 'unknown') {
                    const matchedUser = users.find(u => String(u.id) === bestMatch.label);
                    if (!matchedUser) throw new Error('Usuario no encontrado');

                    if (matchedUser.rol !== 'superadmin' && matchedUser.estado_aprobacion !== 'aprobado') {
                        Swal.fire('Cuenta en revisión', 'Su cuenta aún no ha sido aprobada por la administración.', 'warning');
                        stopCamera();
                        return;
                    }

                    const { data: fullUser } = await window.db.from('usuarios').select('*').eq('id', matchedUser.id).single();
                    const sessionData = fullUser || matchedUser;

                    Swal.fire({
                        icon: 'success',
                        title: '¡Identidad Confirmada!',
                        text: `Bienvenido(a), ${sessionData.nombre_completo}`,
                        showConfirmButton: false,
                        timer: 1500
                    }).then(() => {
                        localStorage.setItem('omni_user', JSON.stringify(sessionData));
                        localStorage.setItem('omni_session_time', Date.now().toString());
                        stopCamera();
                        if (sessionData.rol === 'superadmin') window.location.href = 'superadmin.html';
                        else if (sessionData.rol === 'admin') window.location.href = 'admin.html';
                        else window.location.href = 'estudiante.html';
                    });
                } else {
                    Swal.fire('Acceso Denegado', 'Rostro no reconocido. Intenta con tu contraseña o documento.', 'error');
                    if (statusLabel) statusLabel.innerText = "Rostro no reconocido.";
                    stopCamera();
                }
            } else if (detection) {
                if (statusLabel) statusLabel.innerText = "Centra tu mirada en la cámara...";
            } else {
                if (statusLabel) statusLabel.innerText = "Centra tu rostro frente a la cámara...";
            }
        } catch(e) {
            console.error("Error validando rostro", e);
            Swal.fire('Error', 'No se pudo conectar con la base de datos.', 'error');
            stopCamera();
        }
    }, 450);
}

function stopCamera() {
    if(currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    const btn = document.getElementById('btn-start-face');
    if(btn) btn.style.display = 'inline-block';
    
    const overlay = document.getElementById('overlay-login');
    if(overlay) {
        overlay.classList.remove('scanning');
        overlay.classList.remove('success');
    }
}

// ====== SUBMIT FINAL REGISTRO ======
const form3 = document.getElementById('form-3');
if(form3) {
    form3.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-final');
        btn.disabled = true;
        btn.innerText = "Creando cuenta...";

        try {
            let publicUrl = null;
            if (profilePhotoBlob) {
                publicUrl = document.getElementById('img-perfil').src;
            }

            const isMenor = document.getElementById('r-menor').checked;
            let dniVal = document.getElementById('r-dni').value.trim();
            if (isMenor && !dniVal) dniVal = `MENOR-${Date.now()}`;

            const plainPassword = document.getElementById('r-pass').value;
            const hashedPassword = CryptoJS.SHA256(plainPassword).toString();

            const datos = {
                nombre_completo: document.getElementById('r-nombre').value.trim(),
                telefono: document.getElementById('r-tel').value.trim(),
                dni: dniVal,
                es_menor: isMenor,
                fecha_nacimiento: document.getElementById('r-fecha').value,
                codigo_pasajero: document.getElementById('r-codigo').value.trim(),
                email: document.getElementById('r-email').value.trim().toLowerCase(),
                password: hashedPassword,
                foto_perfil: publicUrl,
                face_descriptor: profileDescriptor,
                departamento: document.getElementById('r-depto').value,
                municipio: document.getElementById('r-muni').value,
                estado_aprobacion: 'pendiente',
                rol: 'estudiante'
            };

            const { error: insertError } = await window.db.from('usuarios').insert([datos]);
            if (insertError) {
                console.error("Error en DB:", insertError);
                if (insertError.code === '23505') {
                    throw new Error("El correo electrónico o Documento ya está registrado en el sistema.");
                }
                throw new Error("Error interno al crear usuario: " + (insertError.message || ''));
            }
            
            nextStep(3, 4);

        } catch (err) {
            Swal.fire('Error', err.message || 'Hubo un problema. Intenta de nuevo.', 'error');
            btn.disabled = false;
            btn.innerText = "Finalizar Registro";
        }
    });
}
