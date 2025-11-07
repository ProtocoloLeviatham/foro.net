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

// Intento robusto de persistencia
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
const rankingView = document.getElementById('ranking-view');
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
    loadTopThreads();
}

// -----------------------------------------------------
// 02. ANIMACIÓN DE INICIO Y LOGS
// -----------------------------------------------------

function initPreloader() {
    // 8.5 segundos es la duración total de la secuencia de tipeo
    const animationDuration = 8500; 

    setTimeout(() => {
        preloader.style.opacity = '0';
        setTimeout(() => {
            preloader.style.display = 'none';
            contentWrapper.classList.remove('hidden');
            rulesModal.style.display = 'flex';
            loadThreads(); 
        }, 1000); // 1 segundo de desvanecimiento
    }, animationDuration);
}

function generateRandomLog(id) {
    const logElement = document.getElementById(id);
    if (!logElement) return;

    const lines = 100;
    const logTypes = ['[STATUS]', '[INFO]', '[WARN]', '[SCAN]', '[INIT]', '[ACK]'];
    let logContent = '';

    for (let i = 0; i < lines; i++) {
        const type = logTypes[Math.floor(Math.random() * logTypes.length)];
        const code = Math.random().toString(16).substring(2, 8).toUpperCase();
        logContent += `${type} ${code} ${Math.random() < 0.2 ? 'ACCESS DENIED' : 'OK'} - ${Math.random().toString(36).substring(2, 10)}\n`;
    }
    logElement.textContent = logContent + logContent; 
}


// -----------------------------------------------------
// 03. FUNCIONES DE INTERACCIÓN (LIKES - CORREGIDO)
// -----------------------------------------------------

function addLike(threadId, buttonElement) {
    // Usamos el ID de sesión del usuario para evitar spam
    const likesKey = `liked_${threadId}`;
    
    if (localStorage.getItem(likesKey) === 'true') {
        alert("ERROR: Ya has otorgado un Badge a esta transmisión. [Code: 409]");
        return;
    }

    // Deshabilitar temporalmente el botón para prevenir doble click
    buttonElement.disabled = true;

    threadsCollection.doc(threadId).update({
        likes: firebase.firestore.FieldValue.increment(1)
    })
    .then(() => {
        localStorage.setItem(likesKey, 'true');
        // El onSnapshot debería actualizar el contador visualmente
        buttonElement.classList.add('liked-active');
    })
    .catch((error) => {
        // El fallo casi siempre es por las reglas de seguridad. 
        // Si las reglas están bien, esto debería ser solo un error de red.
        console.error("Error al dar like:", error);
        alert("ERROR CRÍTICO: Fallo en el servidor de Likes. Revise Reglas Firestore. [Code: 500]");
    })
    .finally(() => {
        // El botón permanece deshabilitado ya que el like fue usado
        buttonElement.disabled = false;
        // Pero si fue exitoso, mantenemos el estado de "ya ha votado"
        if (localStorage.getItem(likesKey) === 'true') {
             buttonElement.disabled = true;
        }
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

function loadThreads() {
    postsContainer.innerHTML = '<p class="text-gray-600">Buscando Hilos de Datos...</p>';

    // Se mantiene el orderBy para la lista principal
    threadsCollection.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        postsContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const timestampStr = formatTimestamp(threadData.timestamp);
            const likes = threadData.likes || 0;
            const hasLiked = localStorage.getItem(`liked_${threadId}`) === 'true';

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
                    <button id="like-btn-${threadId}" 
                            class="text-red-500 hover:text-white transition like-btn ${hasLiked ? 'liked-active' : ''}"
                            ${hasLiked ? 'disabled' : ''}>
                        <span data-lucide="zap" class="w-4 h-4 inline-block mr-1 like-icon"></span> ${likes} BADGES
                    </button>
                </div>
            `;
            
            // Event Listeners
            threadElement.querySelector('h3').addEventListener('click', () => {
                displayThread(threadId, threadData);
            });
            const likeButton = threadElement.querySelector(`#like-btn-${threadId}`);
            likeButton.addEventListener('click', () => addLike(threadId, likeButton));
            
            postsContainer.appendChild(threadElement);
        });
        
        if (snapshot.empty) {
            postsContainer.innerHTML = '<p class="text-center text-gray-600">-- DIRECTORIO VACÍO. INICIE TRANSMISIÓN --</p>';
        }
        lucide.createIcons();
    });
}

function loadTopThreads() {
    topThreadsContainer.innerHTML = '<p class="text-gray-600">Buscando ranking de Badges...</p>';

    // Consulta TOP 10 (Se mantiene el orden por likes)
    threadsCollection.orderBy('likes', 'desc').limit(10).onSnapshot((snapshot) => {
        topThreadsContainer.innerHTML = '';
        
        if (snapshot.empty) {
            topThreadsContainer.innerHTML = '<p class="text-gray-600">No hay transmisiones rankeadas aún. Necesitas Badges (Likes).</p>';
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
                    <span data-lucide="zap" class="w-3 h-3 inline-block"></span> ${likes} BADGES
                </span>
            `;
            topThreadsContainer.appendChild(threadElement);
        });
        lucide.createIcons();
    });
}

function displayThread(threadId, threadData) {
    showDetailView();

    const threadContentDiv = document.getElementById('current-thread-content');
    const replyButton = document.getElementById('reply-button');
    const timestampStr = formatTimestamp(threadData.timestamp);
    const likes = threadData.likes || 0;
    const hasLiked = localStorage.getItem(`liked_${threadId}`) === 'true';

    threadContentDiv.innerHTML = `
        <h3 class="text-xl text-red-400 mb-2 font-bold">[ HILO CIFRADO: ${threadId} ]</h3>
        <p class="mb-4">${threadData.content}</p>
        <div class="flex justify-between items-center text-xs text-gray-500 mt-4">
            <span>Operador: ${threadData.author} | Fecha/Hora: ${timestampStr}</span>
            <button id="detail-like-btn" 
                    class="text-red-500 transition hacker-btn like-btn ${hasLiked ? 'liked-active' : ''}"
                    ${hasLiked ? 'disabled' : ''}>
                <span data-lucide="zap" class="w-4 h-4 inline-block mr-1 like-icon"></span> OTORGAR BADGE (${likes})
            </button>
        </div>
    `;

    // Event listener para el botón de like en la vista de detalle
    const detailLikeButton = document.getElementById('detail-like-btn');
    detailLikeButton.addEventListener('click', () => addLike(threadId, detailLikeButton));

    // Configurar respuesta y cargar replies...
    const replyAuthorInput = document.getElementById('reply-author');
    const replyContentInput = document.getElementById('reply-content');
    replyButton.onclick = () => publishReply(threadId);

    loadReplies(threadId);
    lucide.createIcons();
}

// (La función publishReply y loadReplies se mantienen sin cambios, 
// ya que su lógica de Firebase es estable con las reglas)

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
    
    // Control de modales y botones
    document.getElementById('close-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'none';
    });
    document.getElementById('show-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'flex';
    });
    
    submitThreadBtn.disabled = false;
    submitThreadBtn.textContent = "EXECUTE (INIT)";
    
    // Iniciar la secuencia de carga
    initPreloader();
    lucide.createIcons();
}
