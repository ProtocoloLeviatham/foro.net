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

// Intentar activar persistencia para mayor estabilidad en cualquier dispositivo
db.enablePersistence().catch((err) => {
    if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
        console.error("Error al activar la persistencia:", err);
    }
});

// Referencias a elementos de la UI
const preloader = document.getElementById('preloader');
const contentWrapper = document.getElementById('content-wrapper');
const rulesModal = document.getElementById('rules-modal');
const threadListView = document.getElementById('thread-list-view');
const threadDetailView = document.getElementById('thread-detail-view');
const rankingView = document.getElementById('ranking-view'); // Nueva vista
const postsContainer = document.getElementById('posts-container');
const repliesContainer = document.getElementById('replies-container');
const topThreadsContainer = document.getElementById('top-threads-container');
const submitThreadBtn = document.getElementById('submit-thread-btn');


// -----------------------------------------------------
// 01. GESTIÓN DE VISTAS Y UTILIDADES
// -----------------------------------------------------

function formatTimestamp(timestamp) {
    if (!timestamp || !timestamp.toDate) return 'Timestamp no disponible';
    const date = timestamp.toDate();
    if (isNaN(date)) return 'Fecha inválida';
    return date.toLocaleString('es-ES', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function showListView() {
    threadDetailView.style.display = 'none';
    rankingView.style.display = 'none';
    threadListView.style.display = 'block';
}

function showDetailView() {
    threadListView.style.display = 'none';
    rankingView.style.display = 'none';
    threadDetailView.style.display = 'block';
}

function showRankingView() {
    threadListView.style.display = 'none';
    threadDetailView.style.display = 'none';
    rankingView.style.display = 'block';
    loadTopThreads(); // Aseguramos que se cargue al entrar
}

// -----------------------------------------------------
// 02. ANIMACIÓN DE INICIO Y LOGS
// -----------------------------------------------------

function initPreloader() {
    const animationDuration = 7500; 

    setTimeout(() => {
        preloader.style.opacity = '0';
        setTimeout(() => {
            preloader.style.display = 'none';
            contentWrapper.classList.remove('hidden');
            rulesModal.style.display = 'flex';
            loadThreads(); 
        }, 500);
    }, animationDuration);
}

function generateRandomLog(id) {
    const logElement = document.getElementById(id);
    if (!logElement) return;

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
// 03. FUNCIONES DE INTERACCIÓN (LIKES)
// -----------------------------------------------------

function addLike(threadId) {
    // Usamos localStorage para evitar likes dobles desde el mismo dispositivo
    const likesKey = `liked_${threadId}`;
    
    if (localStorage.getItem(likesKey) === 'true') {
        alert("ERROR: Like ya registrado para esta transmisión. [Code: 409]");
        return;
    }

    threadsCollection.doc(threadId).update({
        likes: firebase.firestore.FieldValue.increment(1)
    })
    .then(() => {
        localStorage.setItem(likesKey, 'true');
        console.log(`Like añadido a ${threadId}`);
        // No es necesario alertar, ya que el onSnapshot lo actualizará.
    })
    .catch((error) => {
        console.error("Error al dar like:", error);
        alert("ERROR: Fallo al procesar el like. [Code: 500]");
    });
}


// -----------------------------------------------------
// 04. GESTIÓN DE DATOS (FIREBASE)
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
        replyCount: 0,
        likes: 0
    })
    .then(() => {
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
        // ✅ CORRECCIÓN CLAVE: Incrementar el contador de respuestas del hilo padre
        // Esto asegura que el contador se actualice inmediatamente en la lista
        threadsCollection.doc(threadId).update({
            replyCount: firebase.firestore.FieldValue.increment(1)
        });
        
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

    threadsCollection.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        postsContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const timestampStr = formatTimestamp(threadData.timestamp);
            const likes = threadData.likes || 0;

            const threadElement = document.createElement('div');
            threadElement.className = 'p-3 border border-dashed border-gray-700 hover:border-green-500 transition';
            threadElement.innerHTML = `
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-red-400 font-bold">[ THREAD_ID: ${threadId.substring(0, 6)}... ]</span>
                    <span class="text-gray-500">${timestampStr}</span>
                </div>
                <h3 class="text-white text-md font-bold cursor-pointer hover:underline">${threadData.content.substring(0, 100)}${threadData.content.length > 100 ? '...' : ''}</h3>
                <div class="flex justify-between items-center text-xs mt-2">
                    <span class="text-green-400">Operador: ${threadData.author} | Respuestas: ${threadData.replyCount || 0}</span>
                    <button class="text-red-500 hover:text-white transition like-btn" onclick="addLike('${threadId}')">
                        <span data-lucide="heart" class="w-4 h-4 inline-block mr-1"></span> ${likes}
                    </button>
                </div>
            `;
            
            threadElement.querySelector('h3').addEventListener('click', () => {
                displayThread(threadId, threadData);
            });
            
            postsContainer.appendChild(threadElement);
        });
        
        if (snapshot.empty) {
            postsContainer.innerHTML = '<p class="text-center text-gray-600">-- DIRECTORIO VACÍO. INICIE TRANSMISIÓN --</p>';
        }
        lucide.createIcons();
    }, (error) => {
        console.error("Error al escuchar hilos:", error);
        postsContainer.innerHTML = '<p class="text-center text-error">ERROR DE CONEXIÓN. Código: 503</p>';
    });
}

function loadTopThreads() {
    topThreadsContainer.innerHTML = '<p class="text-gray-600">Buscando ranking...</p>';

    // Consulta para los 10 hilos con más likes
    threadsCollection.orderBy('likes', 'desc').limit(10).onSnapshot((snapshot) => {
        topThreadsContainer.innerHTML = '';
        
        if (snapshot.empty) {
            topThreadsContainer.innerHTML = '<p class="text-gray-600">No hay transmisiones rankeadas aún. Necesitas likes.</p>';
            return;
        }

        snapshot.forEach((doc, index) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const likes = threadData.likes || 0;

            const threadElement = document.createElement('div');
            threadElement.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 border-b border-gray-800 cursor-pointer hover:bg-gray-900 transition';
            threadElement.innerHTML = `
                <div class="flex items-center flex-1 mb-1 sm:mb-0" onclick="displayThread('${threadId}', ${JSON.stringify(threadData).replace(/'/g, "\\'")})">
                    <span class="text-yellow-400 font-bold w-4">${index + 1}.</span>
                    <span class="truncate text-green-400 flex-1 ml-2">
                        ${threadData.content.substring(0, 40)}...
                    </span>
                </div>
                <span class="text-red-500 text-xs ml-6 sm:ml-2">
                    <span data-lucide="heart" class="w-3 h-3 inline-block"></span> ${likes} LIKES
                </span>
            `;
            topThreadsContainer.appendChild(threadElement);
        });
        lucide.createIcons();
    }, (error) => {
        console.error("Error al cargar ranking:", error);
        topThreadsContainer.innerHTML = '<p class="text-center text-error">ERROR: No se pudo cargar el ranking.</p>';
    });
}


function displayThread(threadId, threadData) {
    showDetailView();

    const threadContentDiv = document.getElementById('current-thread-content');
    const replyButton = document.getElementById('reply-button');
    const timestampStr = formatTimestamp(threadData.timestamp);
    const likes = threadData.likes || 0;

    threadContentDiv.innerHTML = `
        <h3 class="text-xl text-red-400 mb-2 font-bold">[ HILO CIFRADO: ${threadId} ]</h3>
        <p class="mb-4">${threadData.content}</p>
        <div class="flex justify-between items-center text-xs text-gray-500 mt-4">
            <span>Operador: ${threadData.author} | Fecha/Hora: ${timestampStr}</span>
            <button class="text-red-500 hover:text-white transition hacker-btn like-btn" onclick="addLike('${threadId}')">
                <span data-lucide="heart" class="w-4 h-4 inline-block mr-1"></span> DAR LIKE (${likes})
            </button>
        </div>
    `;

    replyButton.onclick = () => publishReply(threadId);
    loadReplies(threadId);
    lucide.createIcons();
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
    });
}

// -----------------------------------------------------
// 05. INICIALIZACIÓN FINAL
// -----------------------------------------------------

function initApp() {
    // Generar ID anónimo (estable)
    const userId = localStorage.getItem('user-id') || 'Cipher_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('user-id', userId);
    document.getElementById('user-id-display').textContent = userId;

    generateRandomLog('log-left');
    generateRandomLog('log-right');
    
    // Control de modales
    document.getElementById('close-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'none';
    });
    document.getElementById('show-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'flex';
    });
    
    // Desactivar botón de post hasta la inicialización completa
    submitThreadBtn.disabled = false;
    submitThreadBtn.textContent = "EXECUTE (INIT)";
    
    // Iniciar la secuencia de carga
    initPreloader();
    lucide.createIcons();
}
