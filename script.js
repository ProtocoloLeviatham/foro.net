// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyBZCPk8qp39BoQ99qLfoQlT6pabnqaqinY",
    authDomain: "foro-513fa.firebaseapp.com",
    projectId: "foro-513fa",
    storageBucket: "foro-513fa.firebasestorage.app",
    messagingSenderId: "18055166367",
    appId: "1:18055166367:web:f6c6c421dd385eab4165aa"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const threadsCollection = db.collection("threads");

// 🚨 CORRECCIÓN CLAVE PARA MÓVILES: Intentar activar persistencia offline
// Esto ayuda a que Firestore gestione mejor la conexión en entornos inestables o móviles.
db.enablePersistence()
  .catch((err) => {
    if (err.code == 'failed-precondition') {
        // Múltiples pestañas abiertas, no se puede activar.
        console.warn("Firestore Persistencia NO activada (Múltiples pestañas).");
    } else if (err.code == 'unimplemented') {
        // El navegador no lo soporta (ej. Edge/IE).
        console.warn("Firestore Persistencia NO soportada por este navegador.");
    }
  });

// Referencias a elementos de la UI
const threadListView = document.getElementById('thread-list-view');
const threadDetailView = document.getElementById('thread-detail-view');
const preloader = document.getElementById('preloader');
const contentWrapper = document.getElementById('content-wrapper');
const rulesModal = document.getElementById('rules-modal');
const submitThreadBtn = document.getElementById('submit-thread-btn');
const postsContainer = document.getElementById('posts-container');
const repliesContainer = document.getElementById('replies-container');

// -----------------------------------------------------
// 01. GESTIÓN DE VISTAS Y UTILIDADES
// -----------------------------------------------------

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Timestamp no disponible';
    const date = timestamp.toDate();
    // Mejorar la robustez del manejo de fechas
    if (isNaN(date)) return 'Fecha inválida'; 
    return date.toLocaleString('es-ES', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function showDetailView() {
    threadListView.style.display = 'none';
    threadDetailView.style.display = 'block';
}

function showListView() {
    threadDetailView.style.display = 'none';
    threadListView.style.display = 'block';
}

// -----------------------------------------------------
// 02. ANIMACIÓN DE INICIO Y CANVAS MATRIX
// -----------------------------------------------------

function initPreloader() {
    // 7.5s es el tiempo total de la animación de tipeo
    const animationDuration = 7500; 

    setTimeout(() => {
        preloader.style.opacity = '0';
        setTimeout(() => {
            preloader.style.display = 'none';
            contentWrapper.classList.remove('hidden');
            
            // Mostrar modal de reglas y cargar datos después de la intro
            rulesModal.style.display = 'flex';
            loadThreads(); // Iniciar carga de datos
        }, 500);
    }, animationDuration);
}

// Inicializar Canvas (Efecto Matrix de fondo)
function initMatrixCanvas() {
    const canvas = document.getElementById('matrix-bg');
    if (!canvas || !canvas.getContext) return; // Doble chequeo para estabilidad
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890@#$%^&*()_+=-[]{};:<>,./?|`~';
    const font_size = 10;
    const columns = canvas.width / font_size;
    const drops = [];

    for (let x = 0; x < columns; x++) {
        drops[x] = 1;
    }

    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#0F0'; 
        ctx.font = font_size + 'px monospace';

        for (let i = 0; i < drops.length; i++) {
            const text = characters[Math.floor(Math.random() * characters.length)];
            ctx.fillText(text, i * font_size, drops[i] * font_size);

            if (drops[i] * font_size > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }
    setInterval(draw, 33);
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// Generar logs aleatorios para los sidebars
function generateRandomLog(id) {
    const logElement = document.getElementById(id);
    const lines = 100;
    const logTypes = ['[STATUS]', '[INFO]', '[WARN]', '[SCAN]'];
    let logContent = '';

    for (let i = 0; i < lines; i++) {
        const type = logTypes[Math.floor(Math.random() * logTypes.length)];
        const code = Math.random().toString(16).substring(2, 8).toUpperCase();
        logContent += `${type} ${code} ${Math.random() < 0.2 ? 'ACCESS DENIED' : 'OK'} - ${Math.random().toString(36).substring(2, 10)}\n`;
    }
    logElement.textContent = logContent + logContent; 
}

// -----------------------------------------------------
// 03. PUBLICACIÓN DE HILOS Y RESPUESTAS (FIREBASE)
// -----------------------------------------------------

function publishThread() {
    const authorInput = document.getElementById('thread-author');
    const contentInput = document.getElementById('thread-content');

    const author = authorInput.value.trim() || 'Anonimo Cifrado'; 
    const content = contentInput.value.trim();

    if (content.length < 10) {
        alert("ERROR: Longitud mínima de 10 caracteres. [Code: 400]");
        return;
    }

    submitThreadBtn.disabled = true;
    submitThreadBtn.textContent = "TRANSMITIENDO...";
    
    threadsCollection.add({
        author: author,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        replyCount: 0 
    })
    .then((docRef) => {
        console.log(`> Transmisión enviada. ID: ${docRef.id}`);
        contentInput.value = ''; 
        authorInput.value = '';
        alert("Transmisión Enviada [ACK/200]");
    })
    .catch((error) => {
        console.error("> ERROR DE ESCRITURA:", error);
        alert("ERROR: Fallo de escritura. Verificar estado de Firebase. [Code: 503]");
    })
    .finally(() => {
        submitThreadBtn.disabled = false;
        submitThreadBtn.textContent = "EXECUTE (INIT)";
    });
}


function publishReply(threadId) {
    const authorInput = document.getElementById('reply-author');
    const contentInput = document.getElementById('reply-content');
    const replyButton = document.getElementById('reply-button');

    const author = authorInput.value.trim() || 'Anonimo Cifrado';
    const content = contentInput.value.trim();

    if (content.length < 5) {
        alert("ERROR: Respuesta demasiado corta. Mínimo 5 caracteres. [Code: 400]");
        return;
    }

    replyButton.disabled = true;
    replyButton.textContent = "EJECUTANDO...";

    const repliesCollection = threadsCollection.doc(threadId).collection('replies');
    
    repliesCollection.add({
        author: author,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        // Incrementa el contador del hilo padre
        threadsCollection.doc(threadId).update({
            replyCount: firebase.firestore.FieldValue.increment(1)
        });
        
        console.log(`> Respuesta enviada a Hilo: ${threadId}`);
        contentInput.value = ''; 
    })
    .catch((error) => {
        console.error("> ERROR AL PUBLICAR RESPUESTA:", error);
        alert("ERROR: Fallo en la transmisión de respuesta. [Code: 500]");
    })
    .finally(() => {
        replyButton.disabled = false;
        replyButton.textContent = "EXECUTE (REPLY)";
    });
}


function loadThreads() {
    postsContainer.innerHTML = '<p class="text-gray-600">Buscando Hilos de Datos...</p>';

    // Usamos onSnapshot que ya funcionaba
    threadsCollection.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        postsContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const timestampStr = formatTimestamp(threadData.timestamp);

            const threadElement = document.createElement('div');
            threadElement.className = 'p-3 border border-dashed border-gray-700 hover:border-green-500 cursor-pointer transition';
            threadElement.innerHTML = `
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-red-400 font-bold">[ THREAD_ID: ${threadId.substring(0, 6)}... ]</span>
                    <span class="text-gray-500">${timestampStr}</span>
                </div>
                <h3 class="text-white text-md font-bold">${threadData.content.substring(0, 100)}${threadData.content.length > 100 ? '...' : ''}</h3>
                <div class="text-xs mt-1 text-green-400">
                    Operador: ${threadData.author} | Respuestas: ${threadData.replyCount || 0}
                </div>
            `;
            
            threadElement.addEventListener('click', () => {
                displayThread(threadId, threadData);
            });
            
            postsContainer.appendChild(threadElement);
        });
        
        if (snapshot.empty) {
            postsContainer.innerHTML = '<p class="text-center text-gray-600">-- DIRECTORIO VACÍO. INICIE TRANSMISIÓN --</p>';
        }
    }, (error) => {
        console.error("Error al escuchar hilos:", error);
        postsContainer.innerHTML = '<p class="text-center text-error">ERROR DE CONEXIÓN. Código: 503</p>';
    });
}

function displayThread(threadId, threadData) {
    showDetailView();

    const threadContentDiv = document.getElementById('current-thread-content');
    const replyButton = document.getElementById('reply-button');
    const timestampStr = formatTimestamp(threadData.timestamp);
    
    // Contenido del hilo principal
    threadContentDiv.innerHTML = `
        <h3 class="text-xl text-red-400 mb-2 font-bold">[ HILO CIFRADO: ${threadId} ]</h3>
        <p class="mb-4">${threadData.content}</p>
        <div class="text-xs text-gray-500">
            Operador: ${threadData.author} | Fecha/Hora: ${timestampStr}
        </div>
    `;

    // Configurar el botón de respuesta
    replyButton.onclick = () => publishReply(threadId);

    // Cargar respuestas
    loadReplies(threadId);
}

function loadReplies(threadId) {
    repliesContainer.innerHTML = '<p class="text-gray-600">Buscando Respuestas de Datos...</p>';
    const repliesCollection = threadsCollection.doc(threadId).collection('replies');
    
    repliesCollection.orderBy('timestamp', 'asc').onSnapshot((snapshot) => {
        repliesContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const replyData = doc.data();
            const timestampStr = formatTimestamp(replyData.timestamp);
            
            const replyElement = document.createElement('div');
            replyElement.className = 'p-3 border-l-2 border-green-500 bg-black bg-opacity-30';
            replyElement.innerHTML = `
                <div class="text-xs text-green-400 mb-1">
                    > Transmisión de ${replyData.author} [${timestampStr}]
                </div>
                <p class="text-sm">${replyData.content}</p>
            `;
            
            repliesContainer.appendChild(replyElement);
        });

        if (snapshot.empty) {
            repliesContainer.innerHTML = '<p class="text-center text-gray-600">-- SUB-DIRECTORIO VACÍO --</p>';
        }

    }, (error) => {
        console.error("Error al escuchar respuestas:", error);
        repliesContainer.innerHTML = '<p class="text-center text-error">ERROR DE LECTURA DE RESPUESTAS.</p>';
    });
}

// -----------------------------------------------------
// 04. INICIALIZACIÓN FINAL
// -----------------------------------------------------

function initApp() {
    // Inicializar efectos visuales
    initMatrixCanvas();
    generateRandomLog('log-left');
    generateRandomLog('log-right');
    
    // Generar ID anónimo para el usuario (simulación)
    document.getElementById('user-id-display').textContent = 'Cipher_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Configurar modal de reglas
    document.getElementById('close-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'none';
    });
    document.getElementById('show-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'flex';
    });
    
    // Iniciar la secuencia de carga
    initPreloader();
}
