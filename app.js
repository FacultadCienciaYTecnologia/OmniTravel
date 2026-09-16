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
    document.getElementById(`step-${next}`).classList.add('active');
    
    document.getElementById(`ind-${current}`).classList.add('completed');
    document.getElementById(`ind-${current}`).classList.remove('current');
    document.getElementById(`ind-${next}`).classList.add('current');
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
    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        faceModelsLoaded = true;
        console.log("Modelos Face-API cargados");
    } catch (e) {
        console.error("Error cargando modelos, es posible que el CDN tenga restricciones de CORS.", e);
        // Fallback en caso de CORS de github:
        Swal.fire('Aviso', 'Error cargando modelo facial. Se usará modo básico de captura.', 'warning');
    }
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
        video.srcObject = currentStream;
        
        document.getElementById('btn-start-cam').style.display = 'none';
        
        // Esperar a que el video empiece a reproducirse para analizar
        video.onloadedmetadata = () => {
            const btnTake = document.getElementById('btn-take-foto');
            btnTake.disabled = true; // Bloqueado hasta pasar prueba de vida
            window.livenessStage = 0; // Reiniciar estado
            
            // Iniciar detección de rostro si los modelos cargaron
            if(faceModelsLoaded) {
                detectFaceLoop(video, 'canvas-overlay-reg', 'overlay', 'btn-take-foto');
            }
        };

    } catch (err) {
        Swal.fire('Error', 'No se pudo acceder a la cámara.', 'error');
    }
}

function detectFaceLoop(video, canvasId, overlayId, btnId) {
    const canvas = document.getElementById(canvasId);
    const overlay = document.getElementById(overlayId);
    const btn = document.getElementById(btnId);
    const statusLabel = document.getElementById('face-reg-status');
    
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);
    
    faceInterval = setInterval(async () => {
        const detections = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceExpressions().withFaceDescriptor();
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (detections) {
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            faceapi.draw.drawDetections(canvas, resizedDetections);
            
            // --- PRUEBA DE VIDA (3D ANTI-SPOOFING) ---
            const landmarks = detections.landmarks;
            const nose = landmarks.getNose()[3];
            const leftJaw = landmarks.getJawOutline()[0];
            const rightJaw = landmarks.getJawOutline()[16];
            
            const distLeft = Math.hypot(nose.x - leftJaw.x, nose.y - leftJaw.y);
            const distRight = Math.hypot(nose.x - rightJaw.x, nose.y - rightJaw.y);
            const ratio = distLeft / distRight;

            if (window.livenessStage === 0) {
                if(statusLabel) statusLabel.innerText = "PRUEBA DE VIDA: Sonríe abiertamente a la cámara.";
                overlay.style.borderColor = "var(--warning)";
                if (detections.expressions.happy > 0.8) window.livenessStage = 1;
            } 
            else if (window.livenessStage === 1) {
                if(statusLabel) statusLabel.innerText = "PRUEBA DE VIDA: Ponte serio(a) y gira la cabeza a la IZQUIERDA.";
                if (ratio > 1.4 && detections.expressions.happy < 0.2) window.livenessStage = 2; 
            }
            else if (window.livenessStage === 2) {
                if(statusLabel) statusLabel.innerText = "PRUEBA DE VIDA: Gira la cabeza levemente a la DERECHA.";
                if (ratio < 0.7) window.livenessStage = 3; 
            }
            else if (window.livenessStage === 3) {
                overlay.classList.add('success');
                overlay.classList.remove('error', 'scanning');
                overlay.style.borderColor = "var(--success)";
                if(statusLabel) statusLabel.innerText = "¡Relieve detectado! Prueba superada, puedes escanear.";
                
                window.currentDescriptor = detections.descriptor;
                if(btn) btn.disabled = false;
            }
        } else {
            overlay.classList.remove('success');
            overlay.classList.add('error');
            overlay.style.borderColor = "var(--error)";
            if(statusLabel) statusLabel.innerText = "No se detecta un rostro claro. Centrate e ilumínate.";
            window.currentDescriptor = null;
            if(btn) btn.disabled = true;
        }
    }, 200); // 200ms para más fluidez en el tracking
}

function captureFace() {
    if (faceModelsLoaded && !window.currentDescriptor) {
        Swal.fire('Atención', 'No se ha detectado un rostro válido. Por favor enfócate bien.', 'warning');
        return;
    }
    
    // Si tenemos descriptor, lo guardamos para mandarlo a supabase
    if (window.currentDescriptor) {
        profileDescriptor = Array.from(window.currentDescriptor); // Convertir Float32Array a Array normal
    }

    const video = document.getElementById('video-registro');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/webp', 0.8);
    
    // Mostrar foto tomada
    const img = document.getElementById('img-perfil');
    img.src = dataUrl;
    img.style.display = 'block';
    
    document.getElementById('cam-container').style.display = 'none';
    document.getElementById('btn-take-foto').style.display = 'none';
    
    // Guardar blob
    canvas.toBlob((blob) => { profilePhotoBlob = blob; }, 'image/webp', 0.8);

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
        video.srcObject = currentStream;
        
        document.getElementById('btn-start-face').style.display = 'none';
        
        video.onloadedmetadata = () => {
            if(faceModelsLoaded) {
                document.getElementById('overlay-login').classList.add('scanning');
                document.getElementById('face-status').innerText = "Escaneando rostro...";
                loginDetectFaceLoop(video);
            }
        };
    } catch (err) {
        Swal.fire('Error', 'No se pudo acceder a la cámara.', 'error');
    }
}

function loginDetectFaceLoop(video) {
    const canvas = document.getElementById('canvas-overlay');
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);
    
    let attempts = 0;
    window.livenessStage = 0;
    const statusLabel = document.getElementById('face-status');
    
    const interval = setInterval(async () => {
        attempts++;
        if (attempts > 60) { // Aumentado para dar tiempo a girar la cabeza
            clearInterval(interval);
            if(statusLabel) statusLabel.innerText = "Tiempo de espera agotado. Intenta con contraseña.";
            document.getElementById('overlay-login').classList.remove('scanning');
            stopCamera();
            return;
        }

        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceExpressions().withFaceDescriptor();
        
        if (detection) {
            // --- PRUEBA DE VIDA (3D ANTI-SPOOFING) ---
            const landmarks = detection.landmarks;
            const nose = landmarks.getNose()[3];
            const leftJaw = landmarks.getJawOutline()[0];
            const rightJaw = landmarks.getJawOutline()[16];
            
            const distLeft = Math.hypot(nose.x - leftJaw.x, nose.y - leftJaw.y);
            const distRight = Math.hypot(nose.x - rightJaw.x, nose.y - rightJaw.y);
            const ratio = distLeft / distRight;

            if (window.livenessStage === 0) {
                if(statusLabel) statusLabel.innerText = "PRUEBA DE VIDA: Sonríe abiertamente a la cámara.";
                if (detections.expressions && detections.expressions.happy > 0.8) window.livenessStage = 1; // Fallback para login
                else if (detection.expressions && detection.expressions.happy > 0.8) window.livenessStage = 1; 
            } 
            else if (window.livenessStage === 1) {
                if(statusLabel) statusLabel.innerText = "PRUEBA DE VIDA: Ponte serio(a) y gira la cabeza a la IZQUIERDA.";
                const isNeutral = (detection.expressions ? detection.expressions.happy < 0.2 : true);
                if (ratio > 1.4 && isNeutral) window.livenessStage = 2; 
            }
            else if (window.livenessStage === 2) {
                if(statusLabel) statusLabel.innerText = "PRUEBA DE VIDA: Gira la cabeza levemente a la DERECHA.";
                if (ratio < 0.7) window.livenessStage = 3; 
            }
            else if (window.livenessStage === 3) {
                clearInterval(interval);
                document.getElementById('overlay-login').classList.remove('scanning');
                document.getElementById('overlay-login').classList.add('success');
                if(statusLabel) statusLabel.innerText = "¡Relieve 3D confirmado! Verificando identidad...";
                
                try {
                    // Obtener todos los descriptores de Supabase
                    const { data: users, error } = await window.db.from('usuarios').select('id, nombre_completo, rol, face_descriptor').not('face_descriptor', 'is', null);
                    
                    if(error) throw error;

                    if (!users || users.length === 0) {
                        Swal.fire('Error', 'No hay rostros registrados en el sistema.', 'error');
                        stopCamera();
                        return;
                    }

                    // Crear LabeledFaceDescriptors
                    const labeledDescriptors = users.map(u => {
                        const descArray = new Float32Array(u.face_descriptor);
                        return new faceapi.LabeledFaceDescriptors(JSON.stringify(u), [descArray]);
                    });

                    // Crear FaceMatcher con 0.5 de distancia máxima (tolerancia estricta)
                    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
                    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

                    if (bestMatch.label !== 'unknown') {
                        // Match encontrado
                        const matchedUser = JSON.parse(bestMatch.label);
                        
                        Swal.fire({ icon: 'success', title: 'Face ID Exitoso', text: `Bienvenido, ${matchedUser.nombre_completo}`, showConfirmButton: false, timer: 1500 }).then(() => {
                            localStorage.setItem('omni_user', JSON.stringify(matchedUser));
                            localStorage.setItem('omni_session_time', Date.now().toString());
                            stopCamera();
                            if (matchedUser.rol === 'superadmin') window.location.href = 'superadmin.html';
                            else if (matchedUser.rol === 'admin') window.location.href = 'admin.html';
                            else window.location.href = 'estudiante.html';
                        });
                    } else {
                        Swal.fire('Acceso Denegado', 'Rostro no reconocido. Intenta con tu contraseña.', 'error');
                        document.getElementById('face-status').innerText = "Rostro no reconocido.";
                        stopCamera();
                    }
                } catch(e) {
                    console.error("Error validando rostro", e);
                    Swal.fire('Error', 'No se pudo conectar con la base de datos.', 'error');
                    stopCamera();
                }
            } // Fin de livenessStage 3
        } else {
            // No hay detección
            if(statusLabel) statusLabel.innerText = "No se detecta rostro. Ajusta la iluminación.";
        }
    }, 800);
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
                // Al no existir el bucket, guardaremos la foto en formato Base64 directamente en la tabla.
                // Es completamente válido para fotos ligeras de perfil y evitará el error 400.
                publicUrl = document.getElementById('img-perfil').src;
            }

            const isMenor = document.getElementById('r-menor').checked;
            let dniVal = document.getElementById('r-dni').value.trim();
            if (isMenor && !dniVal) dniVal = `MENOR-${Date.now()}`;

            // 2. Insertar Usuario
            const datos = {
                nombre_completo: document.getElementById('r-nombre').value,
                telefono: document.getElementById('r-tel').value,
                dni: dniVal,
                es_menor: isMenor,
                fecha_nacimiento: document.getElementById('r-fecha').value,
                codigo_pasajero: document.getElementById('r-codigo').value,
                email: document.getElementById('r-email').value,
                password: document.getElementById('r-pass').value, // En un entorno de producción, esto iría cifrado
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
                    throw new Error("El correo electrónico o Documento ya está registrado.");
                }
                throw new Error("Error interno al crear usuario.");
            }
            
            // 3. Mostrar Pantalla de Espera
            nextStep(3, 4);

        } catch (err) {
            Swal.fire('Error', err.message || 'Hubo un problema. Intenta de nuevo.', 'error');
            btn.disabled = false;
            btn.innerText = "Finalizar Registro";
        }
    });
}
