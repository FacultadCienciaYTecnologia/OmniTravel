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

let faceModelsLoadingPromise = null;
let cachedFaceUsers = null;
let cachedFaceMatcher = null;

// Obtener las mejores opciones de detección disponibles (TinyFaceDetector ultra-rápido o SSD)
function getFaceDetectorOptions() {
    if (typeof faceapi !== 'undefined' && faceapi.nets && faceapi.nets.tinyFaceDetector && faceapi.nets.tinyFaceDetector.params) {
        return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    }
    return new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
}

// Carga asíncrona robusta con promesas compartidas y soporte offline/CDN
async function loadFaceModels() {
    if (faceModelsLoaded) return true;
    if (faceModelsLoadingPromise) return faceModelsLoadingPromise;

    faceModelsLoadingPromise = (async () => {
        const CDNS = [
            'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights',
            'https://justadudewhohacks.github.io/face-api.js/models'
        ];

        for (const url of CDNS) {
            try {
                // Intentar cargar TinyFaceDetector (190 KB), Landmarks y Recognition
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(url),
                    faceapi.nets.faceLandmark68Net.loadFromUri(url),
                    faceapi.nets.faceRecognitionNet.loadFromUri(url)
                ]);
                faceModelsLoaded = true;
                console.log("Modelos Face-API (TinyDetector + Landmarks + Recognition) cargados desde:", url);

                // Cargar SSD en segundo plano como respaldo sin bloquear la UI
                faceapi.nets.ssdMobilenetv1.loadFromUri(url).catch(() => {});
                return true;
            } catch (e) {
                console.warn("Fallo cargando TinyFaceDetector desde", url, e);
                // Si falla Tiny, intentar con SSD MobileNet
                try {
                    await Promise.all([
                        faceapi.nets.ssdMobilenetv1.loadFromUri(url),
                        faceapi.nets.faceLandmark68Net.loadFromUri(url),
                        faceapi.nets.faceRecognitionNet.loadFromUri(url)
                    ]);
                    faceModelsLoaded = true;
                    console.log("Modelos Face-API (SSD) cargados desde:", url);
                    return true;
                } catch (e2) {
                    console.warn("Fallo cargando SSD desde", url, e2);
                }
            }
        }

        console.error("No se pudieron cargar modelos Face-API desde los CDNs.");
        Swal.fire('Aviso', 'No se pudieron descargar los modelos faciales. Por favor verifica tu conexión a internet.', 'warning');
        return false;
    })();

    const result = await faceModelsLoadingPromise;
    faceModelsLoadingPromise = null;
    return result;
}

// Pre-cargar los modelos biométricos al iniciar si existen los contenedores
if (document.getElementById('video-registro') || document.getElementById('video-login')) {
    loadFaceModels();
}

// Precargar descriptores de usuarios registrados para verificación instantánea
async function prefetchFaceData() {
    if (cachedFaceMatcher && cachedFaceUsers) return { matcher: cachedFaceMatcher, users: cachedFaceUsers };
    try {
        const { data: users, error } = await window.db
            .from('usuarios')
            .select('id, nombre_completo, rol, estado_aprobacion, face_descriptor')
            .not('face_descriptor', 'is', null);

        if (error || !users || !users.length) {
            cachedFaceUsers = [];
            cachedFaceMatcher = null;
            return { matcher: null, users: [] };
        }

        const labeled = [];
        users.forEach(u => {
            let desc = u.face_descriptor;
            if (typeof desc === 'string') {
                try { desc = JSON.parse(desc); } catch (e) { desc = null; }
            }
            if (desc && !Array.isArray(desc) && typeof desc === 'object') {
                desc = Object.values(desc);
            }
            if (Array.isArray(desc) && desc.length === 128) {
                labeled.push(new faceapi.LabeledFaceDescriptors(String(u.id), [new Float32Array(desc)]));
            }
        });

        cachedFaceUsers = users;
        // Umbral de 0.54: óptimo para balance entre reconocimiento fiel y prevención de falsos positivos
        cachedFaceMatcher = labeled.length ? new faceapi.FaceMatcher(labeled, 0.54) : null;
        return { matcher: cachedFaceMatcher, users: cachedFaceUsers };
    } catch (e) {
        console.error("Error precargando usuarios biométricos:", e);
        return { matcher: null, users: [] };
    }
}

// ====== REGISTRO: ACTIVAR CÁMARA ======
async function startRegistroFace() {
    const btnStart = document.getElementById('btn-start-cam');
    const statusLabel = document.getElementById('face-reg-status');
    if (btnStart) btnStart.disabled = true;

    if (!faceModelsLoaded) {
        if (statusLabel) statusLabel.innerText = "Preparando detector biométrico...";
        const ok = await loadFaceModels();
        if (!ok) {
            if (btnStart) btnStart.disabled = false;
            return;
        }
    }

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, 
            audio: false 
        });
        const video = document.getElementById('video-registro');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.srcObject = currentStream;

        const onVideoReady = () => {
            if (btnStart) btnStart.style.display = 'none';
            const btnTake = document.getElementById('btn-take-foto');
            if (btnTake) btnTake.disabled = true;
            if (statusLabel) statusLabel.innerText = "Centra tu rostro frente a la cámara...";
            detectFaceLoop(video, 'canvas-overlay-reg', 'overlay', 'btn-take-foto');
        };

        await video.play().catch(e => console.warn('Video play:', e));

        if (video.readyState >= 2) {
            onVideoReady();
        } else {
            video.addEventListener('loadeddata', onVideoReady, { once: true });
        }

    } catch (err) {
        console.error("Error accediendo a cámara:", err);
        if (btnStart) btnStart.disabled = false;
        Swal.fire('Error', 'No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios en el navegador.', 'error');
    }
}

// Bucle de detección en vivo para Registro
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

            const options = getFaceDetectorOptions();
            const detections = await faceapi.detectSingleFace(video, options).withFaceLandmarks().withFaceDescriptor();
            
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

                const estaCentrado = relX >= 0.25 && relX <= 0.75 && relY >= 0.20 && relY <= 0.80;
                const tamanoAdecuado = relWidth >= 0.18 && relWidth <= 0.85;

                if (score >= 0.60 && estaCentrado && tamanoAdecuado) {
                    if (overlay) {
                        overlay.classList.add('success');
                        overlay.classList.remove('error', 'scanning');
                        overlay.style.borderColor = "var(--success)";
                    }
                    if (statusLabel) {
                        statusLabel.innerHTML = '✅ <span style="color:#10b981; font-weight:700;">Rostro detectado correctamente.</span> Ya puedes presionar <b>Escanear Rostro</b>.';
                    }
                    window.currentDescriptor = detections.descriptor;
                    if (btn) btn.disabled = false;
                } else if (!tamanoAdecuado && relWidth < 0.18) {
                    if (overlay) overlay.style.borderColor = "var(--warning)";
                    if (statusLabel) statusLabel.innerText = "Acércate un poco más a la cámara.";
                } else if (!estaCentrado) {
                    if (overlay) overlay.style.borderColor = "var(--warning)";
                    if (statusLabel) statusLabel.innerText = "Centra tu rostro dentro del círculo guía.";
                } else {
                    if (overlay) overlay.style.borderColor = "var(--warning)";
                    if (statusLabel) statusLabel.innerText = "Mantén la mirada fija y mejora la iluminación.";
                }
            } else {
                if (overlay) {
                    overlay.classList.remove('success');
                    overlay.style.borderColor = "var(--error)";
                }
                if (statusLabel) statusLabel.innerText = "Centra tu rostro frente a la cámara...";
            }
        } catch (err) {
            console.error("Error en detección facial:", err);
        } finally {
            isDetecting = false;
        }
    }, 280);
}

// Capturar rostro, generar descriptor y foto recortada
function captureFace() {
    if (!window.currentDescriptor) {
        Swal.fire('Atención', 'Aún no se ha detectado un rostro válido. Por favor enfócate bien frente a la cámara.', 'warning');
        return;
    }
    
    // Guardar descriptor como Array JSON de 128 elementos
    profileDescriptor = Array.from(window.currentDescriptor);

    const video = document.getElementById('video-registro');
    if (!video || !video.videoWidth) return;

    // Recortar centrado en formato cuadrado de 240x240 px (optimizado a ~12 KB)
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
    if (img) {
        img.src = dataUrl;
        img.style.display = 'block';
    }
    
    const camCont = document.getElementById('cam-container');
    if (camCont) camCont.style.display = 'none';
    const btnTake = document.getElementById('btn-take-foto');
    if (btnTake) btnTake.style.display = 'none';
    
    // Guardar blob para envío
    canvas.toBlob((blob) => { profilePhotoBlob = blob; }, 'image/webp', 0.82);

    // Detener cámara e intervalo
    if (faceInterval) clearInterval(faceInterval);
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());

    const statusLabel = document.getElementById('face-reg-status');
    if (statusLabel) statusLabel.innerHTML = '🎉 <span style="color:#10b981; font-weight:700;">¡Rostro registrado con éxito!</span> Ya puedes continuar al siguiente paso.';
}

function validateStep2() {
    const email = document.getElementById('r-email').value.trim();
    const pass = document.getElementById('r-pass').value;
    if (!email || !pass || pass.length < 6) {
        Swal.fire('Atención', 'Por favor ingresa un correo electrónico válido y una contraseña de al menos 6 caracteres.', 'warning');
        return;
    }
    if (!profilePhotoBlob || !profileDescriptor) {
        Swal.fire('Atención', 'Debes registrar tu rostro para crear tu Face ID.', 'warning');
        return;
    }
    nextStep(2, 3);
}

// ====== LOGIN FACE ID ======
async function startFaceLogin() {
    const btnStart = document.getElementById('btn-start-face');
    const statusLabel = document.getElementById('face-status');
    const overlay = document.getElementById('overlay-login');
    
    if (btnStart) btnStart.disabled = true;

    if (!faceModelsLoaded) {
        if (statusLabel) statusLabel.innerText = "Cargando modelos biométricos de alta velocidad...";
        const ok = await loadFaceModels();
        if (!ok) {
            if (btnStart) btnStart.disabled = false;
            return;
        }
    }

    // Iniciar prefetch de la base de datos en segundo plano
    prefetchFaceData();

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, 
            audio: false 
        });
        const video = document.getElementById('video-login');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.srcObject = currentStream;

        const onVideoReady = () => {
            if (btnStart) btnStart.style.display = 'none';
            if (overlay) {
                overlay.classList.add('scanning');
                overlay.classList.remove('success', 'error');
            }
            if (statusLabel) statusLabel.innerText = "Escaneando rostro... Mantén la mirada fija.";
            loginDetectFaceLoop(video);
        };

        await video.play().catch(e => console.warn('Video play login:', e));

        if (video.readyState >= 2) {
            onVideoReady();
        } else {
            video.addEventListener('loadeddata', onVideoReady, { once: true });
        }

    } catch (err) {
        console.error("Error cámara Face Login:", err);
        if (btnStart) {
            btnStart.disabled = false;
            btnStart.style.display = 'inline-block';
        }
        Swal.fire('Error', 'No se pudo acceder a la cámara. Asegúrate de otorgar los permisos de cámara en tu navegador.', 'error');
    }
}

// Bucle de detección y emparejamiento biométrico para Login
async function loginDetectFaceLoop(video) {
    const canvas = document.getElementById('canvas-overlay');
    let displaySize = { width: video.videoWidth || 640, height: video.videoHeight || 480 };
    if (canvas) faceapi.matchDimensions(canvas, displaySize);
    
    let attempts = 0;
    const statusLabel = document.getElementById('face-status');
    let isMatching = false;
    let isDetecting = false;

    // Obtener los descriptores de la base de datos (cacheados o frescos)
    if (statusLabel) statusLabel.innerText = "Preparando base biométrica...";
    const { matcher, users } = await prefetchFaceData();

    if (!matcher || !users || users.length === 0) {
        Swal.fire('Aviso', 'No se encontraron usuarios aprobados con Face ID registrado en el sistema.', 'info');
        if (statusLabel) statusLabel.innerText = "No hay rostros registrados en el sistema.";
        stopCamera();
        return;
    }

    if (statusLabel) statusLabel.innerText = "Ubica tu rostro en el centro del círculo...";

    const interval = setInterval(async () => {
        if (isMatching || isDetecting) return;
        if (!video || video.paused || video.ended) return;

        isDetecting = true;
        attempts++;

        if (attempts > 40) {
            clearInterval(interval);
            if (statusLabel) statusLabel.innerText = "Tiempo agotado. Intenta ingresar con tu contraseña.";
            stopCamera();
            Swal.fire('Tiempo agotado', 'No se pudo verificar el rostro a tiempo. Puedes ingresar con tu correo y contraseña.', 'info');
            return;
        }

        try {
            if (video.videoWidth && canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
                displaySize = { width: video.videoWidth, height: video.videoHeight };
                faceapi.matchDimensions(canvas, displaySize);
            }

            const options = getFaceDetectorOptions();
            const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks().withFaceDescriptor();

            if (detection && detection.detection.score >= 0.60) {
                // Dibujar en canvas
                const ctx = canvas ? canvas.getContext('2d') : null;
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    const resized = faceapi.resizeResults(detection, displaySize);
                    faceapi.draw.drawDetections(canvas, resized);
                }

                // Comparar con base de descriptores en memoria
                const bestMatch = matcher.findBestMatch(detection.descriptor);
                console.log("Face Matcher resultado:", bestMatch.toString());

                if (bestMatch.label !== 'unknown') {
                    isMatching = true;
                    clearInterval(interval);

                    const overlay = document.getElementById('overlay-login');
                    if (overlay) {
                        overlay.classList.remove('scanning');
                        overlay.classList.add('success');
                        overlay.style.borderColor = "var(--success)";
                    }
                    if (statusLabel) {
                        statusLabel.innerHTML = '✅ <span style="color:#10b981; font-weight:700;">¡Identidad confirmada!</span>';
                    }

                    const matchedUser = users.find(u => String(u.id) === bestMatch.label);
                    if (!matchedUser) throw new Error("Usuario biométrico no localizado");

                    // Validar estado de aprobación
                    if (matchedUser.rol !== 'superadmin' && matchedUser.estado_aprobacion !== 'aprobado') {
                        stopCamera();
                        Swal.fire('Cuenta en revisión', 'Su cuenta aún no ha sido aprobada por la administración.', 'warning');
                        return;
                    }

                    // Obtener perfil completo actualizado
                    const { data: fullUser } = await window.db.from('usuarios').select('*').eq('id', matchedUser.id).single();
                    const sessionData = fullUser || matchedUser;

                    Swal.fire({
                        icon: 'success',
                        title: '¡Identidad Confirmada!',
                        text: `Bienvenido(a), ${sessionData.nombre_completo}`,
                        showConfirmButton: false,
                        timer: 1400
                    }).then(() => {
                        localStorage.setItem('omni_user', JSON.stringify(sessionData));
                        localStorage.setItem('omni_session_time', Date.now().toString());
                        stopCamera();
                        if (sessionData.rol === 'superadmin') window.location.href = 'superadmin.html';
                        else if (sessionData.rol === 'admin') window.location.href = 'admin.html';
                        else window.location.href = 'estudiante.html';
                    });
                    return;
                } else {
                    if (statusLabel) statusLabel.innerText = "Rostro enfocado. Verificando identidad...";
                }
            } else if (detection) {
                if (statusLabel) statusLabel.innerText = "Acerca tu rostro y mantén la mirada fija...";
            } else {
                if (statusLabel) statusLabel.innerText = "Centra tu rostro frente a la cámara...";
            }
        } catch (err) {
            console.error("Error en proceso de verificación biométrica:", err);
        } finally {
            isDetecting = false;
        }
    }, 280);
}

// Detener cámara y restablecer vista
function stopCamera() {
    if (faceInterval) {
        clearInterval(faceInterval);
        faceInterval = null;
    }
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    const btn = document.getElementById('btn-start-face');
    if (btn) {
        btn.disabled = false;
        btn.style.display = 'inline-block';
    }
    const btnCam = document.getElementById('btn-start-cam');
    if (btnCam) {
        btnCam.disabled = false;
        btnCam.style.display = 'inline-block';
    }
    const overlay = document.getElementById('overlay-login') || document.getElementById('overlay');
    if (overlay) {
        overlay.classList.remove('scanning', 'success');
        overlay.style.borderColor = "";
    }
    const canvasLogin = document.getElementById('canvas-overlay');
    if (canvasLogin) {
        const ctx = canvasLogin.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasLogin.width, canvasLogin.height);
    }
    const canvasReg = document.getElementById('canvas-overlay-reg');
    if (canvasReg) {
        const ctx = canvasReg.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasReg.width, canvasReg.height);
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
