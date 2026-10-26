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
if (document.getElementById('video-registro')) {
    loadFaceModels();
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

// ====== RELLENAR DATOS DE PRUEBA (ESTUDIANTE DEMO) ======
function autofillTestData() {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const nombreInput = document.getElementById('r-nombre');
    if (nombreInput) nombreInput.value = "Kevin Alexander (Estudiante Demo)";
    
    const countrySelect = document.getElementById('r-country-code');
    if (countrySelect) countrySelect.value = "+503";
    
    const telInput = document.getElementById('r-tel');
    if (telInput) telInput.value = "7" + String(randomSuffix).padStart(7, '4');
    
    const dniInput = document.getElementById('r-dni');
    if (dniInput) dniInput.value = `05${randomSuffix}-7`;
    
    const fechaInput = document.getElementById('r-fecha');
    if (fechaInput) fechaInput.value = "2003-08-20";
    
    const codigoInput = document.getElementById('r-codigo');
    if (codigoInput) codigoInput.value = `ED${randomSuffix}`;
    
    const emailInput = document.getElementById('r-email');
    if (emailInput) emailInput.value = `estudiante.demo.${randomSuffix}@omnitravel.edu`;
    
    const passInput = document.getElementById('r-pass');
    if (passInput) passInput.value = "Estudiante2026*";
    
    const deptoSelect = document.getElementById('r-depto');
    if (deptoSelect) {
        deptoSelect.value = "San Salvador";
        cargarMunicipios();
        const muniSelect = document.getElementById('r-muni');
        if (muniSelect) {
            setTimeout(() => {
                muniSelect.value = "San Salvador";
            }, 60);
        }
    }
    
    Swal.fire({
        icon: 'info',
        title: 'Datos de Prueba Cargados',
        html: `Se rellenaron datos de prueba para <b>Kevin Alexander</b>.<br><small style="color:#64748b;">Correo asignado: estudiante.demo.${randomSuffix}@omnitravel.edu</small>`,
        timer: 2000,
        showConfirmButton: false
    });
}

// ====== PRUEBA DE VIDA Y PROFUNDIDAD FACIAL 3D (ANTI-SPOOFING / ANTI-FOTOS) ======
window.livenessVerified = false;
window.__omniLivenessToken = null;

let livenessState = {
    stage: 0, // 0: Enfoque inicial, 1: Giro 3D en progreso, 2: Verificado
    baselineYaw: null,
    framesCentered: 0
};

function calcularDistanciaPuntos(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Ratio de asimetría 3D de profundidad de la nariz respecto a las mejillas (Perspectiva Parallax)
function calcularProfundidadYaw(landmarks) {
    if (!landmarks || !landmarks[30] || !landmarks[2] || !landmarks[14]) return 1.0;
    const nariz = landmarks[30];
    const mejillaIzq = landmarks[2];
    const mejillaDer = landmarks[14];
    const dIzq = calcularDistanciaPuntos(nariz, mejillaIzq);
    const dDer = calcularDistanciaPuntos(nariz, mejillaDer);
    if (dDer <= 0) return 1.0;
    return dIzq / dDer;
}

// Bucle de detección en vivo con Prueba de Vida y Profundidad 3D para Registro (Rápido por Giro)
function detectFaceLoop(video, canvasId, overlayId, btnId) {
    const canvas = document.getElementById(canvasId);
    const overlay = document.getElementById(overlayId);
    const btn = document.getElementById(btnId);
    const statusLabel = document.getElementById('face-reg-status');
    const badgeText = document.getElementById('liveness-badge-text');

    const chkRostro = document.getElementById('chk-rostro');
    const chkProfundidad = document.getElementById('chk-profundidad');
    
    const updateChecklistUI = (s) => {
        if (!chkRostro || !chkProfundidad) return;
        if (s === 0) {
            chkRostro.className = 'badge-liveness active';
            chkProfundidad.className = 'badge-liveness pending';
        } else if (s === 1) {
            chkRostro.className = 'badge-liveness done';
            chkRostro.innerText = '✅ 1. Rostro Detectado';
            chkProfundidad.className = 'badge-liveness active';
        } else if (s === 2) {
            chkRostro.className = 'badge-liveness done';
            chkProfundidad.className = 'badge-liveness done';
            chkProfundidad.innerText = '✅ 2. Profundidad 3D (Verificado)';
        }
    };

    window.livenessVerified = false;
    window.__omniLivenessToken = null;
    livenessState = {
        stage: 0,
        baselineYaw: null,
        framesCentered: 0
    };
    if (btn) btn.disabled = true;
    updateChecklistUI(0);

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

                const estaCentrado = relX >= 0.20 && relX <= 0.80 && relY >= 0.15 && relY <= 0.85;
                const tamanoAdecuado = relWidth >= 0.16 && relWidth <= 0.90;

                if (!estaCentrado || !tamanoAdecuado || score < 0.60) {
                    // Revocar inmediatamente aprobación si el rostro se sale de cuadro o se cubre
                    window.livenessVerified = false;
                    window.__omniLivenessToken = null;
                    window.currentDescriptor = null;
                    livenessState.stage = 0;
                    livenessState.framesCentered = 0;
                    if (btn) {
                        btn.disabled = true;
                        btn.classList.remove('pulse');
                        btn.innerHTML = 'Escanear Rostro';
                    }
                    updateChecklistUI(0);

                    if (overlay) {
                        overlay.className = 'face-overlay error';
                        overlay.style.borderColor = "var(--warning)";
                    }
                    if (relWidth < 0.16) {
                        if (statusLabel) statusLabel.innerText = "Acércate un poco más a la cámara.";
                    } else if (!estaCentrado) {
                        if (statusLabel) statusLabel.innerText = "Centra tu rostro dentro del recuadro.";
                    } else {
                        if (statusLabel) statusLabel.innerText = "Mejora la iluminación de tu rostro.";
                    }
                    return;
                }

                // Extraer landmarks y ratio de profundidad 3D
                const positions = detections.landmarks.positions;
                const yawRatio = calcularProfundidadYaw(positions);

                // MÁQUINA DE ESTADOS RÁPIDA: CENTRADO -> GIRO DE CABEZA -> VERIFICADO
                if (livenessState.stage === 0) {
                    livenessState.framesCentered++;
                    if (overlay) {
                        overlay.className = 'face-overlay scanning';
                        overlay.style.borderColor = "#38bdf8";
                    }
                    if (badgeText) badgeText.innerText = "🔍 Rostro enfocado...";
                    if (statusLabel) {
                        statusLabel.innerHTML = '👤 Rostro enfocado...';
                    }

                    if (livenessState.framesCentered >= 2) {
                        livenessState.baselineYaw = yawRatio;
                        livenessState.stage = 1;
                        updateChecklistUI(1);
                        if (badgeText) badgeText.innerText = "🔄 Gira levemente tu cabeza...";
                        if (statusLabel) {
                            statusLabel.innerHTML = '🔄 <b>PRUEBA 3D:</b> <span style="color:#d97706; font-weight:700; font-size:0.95rem;">GIRA LEVEMENTE LA CABEZA</span> hacia un lado para verificar profundidad.';
                        }
                    }

                } else if (livenessState.stage === 1) {
                    if (overlay) overlay.className = 'face-overlay scanning';
                    const yawDiff = Math.abs(yawRatio - (livenessState.baselineYaw || 1.0));

                    // Detección rápida de giro de cabeza (profundidad 3D real)
                    if (yawDiff >= 0.16 || yawRatio >= 1.30 || yawRatio <= 0.74) {
                        livenessState.stage = 2;
                        window.livenessVerified = true;
                        window.__omniLivenessToken = 'LIVENESS_3D_OK_' + Date.now();
                        window.currentDescriptor = detections.descriptor;
                        
                        updateChecklistUI(2);

                        if (btn) {
                            btn.disabled = false;
                            btn.classList.add('pulse');
                            btn.innerHTML = '📸 Escanear Rostro';
                        }

                        if (overlay) {
                            overlay.className = 'face-overlay success';
                            overlay.style.borderColor = "var(--success)";
                        }
                        if (badgeText) badgeText.innerText = "🛡️ Persona real confirmada (Profundidad 3D OK)";
                        if (statusLabel) {
                            statusLabel.innerHTML = `✅ <span style="color:#10b981; font-weight:700; font-size:0.95rem;">¡Profundidad 3D confirmada con éxito!</span> Ya puedes presionar <b>Escanear Rostro</b>.`;
                        }
                    } else {
                        if (statusLabel) {
                            statusLabel.innerHTML = '🔄 <b>PRUEBA 3D:</b> <span style="color:#d97706; font-weight:700; font-size:0.95rem;">GIRA LEVEMENTE LA CABEZA</span> hacia un lado para verificar profundidad.';
                        }
                    }

                } else if (livenessState.stage === 2) {
                    // Solo mantener habilitado mientras el rostro continúe en pantalla
                    window.currentDescriptor = detections.descriptor;
                    if (btn && btn.disabled) {
                        btn.disabled = false;
                    }
                }

            } else {
                // ROSTRO NO DETECTADO O CUBIERTO (Mano frente a la cámara, usuario retirado)
                // Revocar inmediatamente la aprobación y desactivar el botón
                window.livenessVerified = false;
                window.__omniLivenessToken = null;
                window.currentDescriptor = null;
                livenessState.stage = 0;
                livenessState.framesCentered = 0;
                if (btn) {
                    btn.disabled = true;
                    btn.classList.remove('pulse');
                    btn.innerHTML = 'Escanear Rostro';
                }
                updateChecklistUI(0);

                if (overlay) {
                    overlay.className = 'face-overlay error';
                    overlay.style.borderColor = "var(--error)";
                }
                if (badgeText) badgeText.innerText = "⚠️ Rostro no detectado";
                if (statusLabel) {
                    statusLabel.innerHTML = '<span style="color:#ef4444; font-weight:700;">⚠️ Rostro perdido o cubierto.</span> Muestra tu rostro frente a la cámara para verificar.';
                }
            }
        } catch (err) {
            console.error("Error en detección facial y prueba de vida:", err);
        } finally {
            isDetecting = false;
        }
    }, 200);
}

// Capturar rostro, generar descriptor y foto recortada
async function captureFace() {
    const video = document.getElementById('video-registro');
    if (!video || !video.videoWidth) return;

    const btnTake = document.getElementById('btn-take-foto');

    // 1. Verificación instantánea en el fotograma exacto capturado
    // (Bloquea si alguien puso la mano o quitó el rostro al presionar el botón)
    const options = getFaceDetectorOptions();
    const liveDetection = await faceapi.detectSingleFace(video, options).withFaceLandmarks().withFaceDescriptor();

    if (!liveDetection || liveDetection.detection.score < 0.60) {
        window.livenessVerified = false;
        window.__omniLivenessToken = null;
        window.currentDescriptor = null;
        livenessState.stage = 0;
        livenessState.framesCentered = 0;
        if (btnTake) {
            btnTake.disabled = true;
            btnTake.classList.remove('pulse');
            btnTake.innerHTML = 'Escanear Rostro';
        }
        const chkR = document.getElementById('chk-rostro');
        const chkP = document.getElementById('chk-profundidad');
        if (chkR) { chkR.className = 'badge-liveness pending'; chkR.innerText = '👤 1. Rostro Humano'; }
        if (chkP) { chkP.className = 'badge-liveness pending'; chkP.innerText = '🔄 2. Giro de Cabeza (Profundidad 3D)'; }

        Swal.fire({
            icon: 'error',
            title: 'Rostro no detectado',
            text: 'No se detecta un rostro humano en este momento. Por favor no cubras la cámara con la mano ni retires tu rostro del encuadre.'
        });
        return;
    }

    if (!window.livenessVerified || !window.__omniLivenessToken) {
        Swal.fire({
            icon: 'warning',
            title: 'Prueba 3D Requerida',
            text: 'Debes girar levemente tu cabeza frente a la cámara para verificar que eres una persona real con profundidad 3D y no una fotografía.'
        });
        return;
    }
    
    // Guardar descriptor extraído DIRECTAMENTE del fotograma vivo verificado
    profileDescriptor = Array.from(liveDetection.descriptor);

    // Recortar centrado en formato cuadrado de 240x240 px (optimizado a ~12 KB)
    const size = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    // Reflejar horizontalmente para que la foto capturada coincida idéntica con la vista previa del video (sin invertirse)
    ctx.translate(240, 0);
    ctx.scale(-1, 1);
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
    if (btnTake) btnTake.style.display = 'none';
    
    // Guardar blob para envío
    canvas.toBlob((blob) => { profilePhotoBlob = blob; }, 'image/webp', 0.82);

    // Detener cámara e intervalo
    if (faceInterval) clearInterval(faceInterval);
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());

    const statusLabel = document.getElementById('face-reg-status');
    if (statusLabel) statusLabel.innerHTML = '🎉 <span style="color:#10b981; font-weight:700;">¡Rostro 3D registrado con éxito!</span> Ya puedes continuar al siguiente paso.';
}

function validateStep2() {
    const email = document.getElementById('r-email').value.trim();
    const pass = document.getElementById('r-pass').value;
    if (!email || !pass || pass.length < 6) {
        Swal.fire('Atención', 'Por favor ingresa un correo electrónico válido y una contraseña de al menos 6 caracteres.', 'warning');
        return;
    }
    if (!profilePhotoBlob || !profileDescriptor || !window.livenessVerified) {
        Swal.fire({
            icon: 'warning',
            title: 'Rostro no verificado',
            text: 'Debes completar la prueba de profundidad 3D (giro de cabeza) y capturar tu rostro antes de avanzar.'
        });
        return;
    }
    nextStep(2, 3);
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
