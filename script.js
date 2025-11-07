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
        console.warn("WARN: Persistencia de Firebase no disponible o fallida:", err);
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
    return date.toLocaleString('es-ES', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
}

function showListView() {
    threadDetailView.style.display = 'none';
    rankingView.style.display = 'none';
    threadListView.style.display = 'block';
}

function showDetailView(threadId) {
    threadListView.style.display = 'none';
    rankingView.style.display = 'none';
    threadDetailView.style.display = 'block';
    // Se asegura de que la URL refleje el hilo (opcional, pero útil para historial)
    // window.history.pushState(null, '', `#thread-${threadId}`);
}

function showRankingView() {
    threadListView.style.display = 'none';
    threadDetailView.style.display = 'none';
    rankingView.style.display = 'block';
    loadTopThreads();
}

// -----------------------------------------------------
// 02. ANIMACIÓN DE INICIO (CORREGIDA)
// -----------------------------------------------------

function initPreloader() {
    // Calcular el tiempo total de la animación de tipeo (8.5s del último delay + 0.5s de buffer)
    const animationDuration = 9000; 

    setTimeout(() => {
        // Iniciar el desvanecimiento después de que todas las líneas se han escrito
        preloader.style.opacity = '0';
        
        setTimeout(() => {
            // Ocultar el preloader y mostrar el contenido
            preloader.style.display = 'none';
            contentWrapper.classList.remove('hidden');
            rulesModal.style.display = 'flex'; // Mostrar Modal de Reglas
            loadThreads(); 
        }, 1000); // 1 segundo para el desvanecimiento
    }, animationDuration);
}

// -----------------------------------------------------
// 03. FUNCIONES DE INTERACCIÓN (LIKES/BADGES)
// -----------------------------------------------------

function addLike(threadId, buttonElement) {
    const likesKey = `liked_${threadId}`;
    
    // Verificación de doble like (primero en la interfaz)
    if (localStorage.getItem(likesKey) === 'true') {
        console.warn("Ya se otorgó Badge. Intento bloqueado localmente.");
        return; // Salir inmediatamente si ya votó
    }

    // Deshabilitar el botón inmediatamente
    buttonElement.disabled = true;
    buttonElement.style.opacity = '0.5';

    threadsCollection.doc(threadId).update({
        likes: firebase.firestore.FieldValue.increment(1)
    })
    .then(() => {
        localStorage.setItem(likesKey, 'true');
        
        // Efecto visual de Badge otorgado
        buttonElement.classList.add('liked-active');
        buttonElement.style.opacity = '1';
        
        console.log(`Badge otorgado a ${threadId}.`);
    })
    .catch((error) => {
        console.error("ERROR CRÍTICO AL PROCESAR BADGE (LIKE):", error);
        alert("ERROR: El servidor de Badges falló. Revise reglas de seguridad. [Code: 500]");
        
        // Si falla, re-habilitamos el botón para permitir reintento (aunque no debería ocurrir con reglas correctas)
        buttonElement.disabled = false; 
        buttonElement.style.opacity = '1';
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
    
    db.runTransaction((transaction) => {
        // 1. Añadir la respuesta
        transaction.set(repliesCollection.doc(), {
            author: author,
            content: content,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // 2. Incrementar el contador del hilo padre (CORRECCIÓN CLAVE)
        const threadRef = threadsCollection.doc(threadId);
        transaction.update(threadRef, {
            replyCount: firebase.firestore.FieldValue.increment(1)
        });
        
        return Promise.resolve(); // Transacción exitosa
    })
    .then(() => {
        contentInput.value = ''; 
        // No es necesario alertar, el onSnapshot actualizará la lista de respuestas
    })
    .catch((error) => {
        console.error("> ERROR AL PUBLICAR RESPUESTA (TRANSACCIÓN):", error);
        alert("ERROR: Fallo de transacción. [Code: 500]");
    })
    .finally(() => {
        replyButton.disabled = false;
        replyButton.textContent = "EXECUTE (REPLY)";
    });
}


function loadThreads() {
    postsContainer.innerHTML = '<p class="text-gray-600">Buscando Hilos de Datos...</p>';

    // Hilos por defecto: Más recientes primero (timestamp: 'desc')
    threadsCollection.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        postsContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const timestampStr = formatTimestamp(threadData.timestamp);
            const likes = threadData.likes || 0;
            const hasLiked = localStorage.getItem(`liked_${threadId}`) === 'true';

            const threadElement = document.createElement('div');
            threadElement.className = 'p-3 border border-dashed border-gray-700 hover:border-green-500 transition cursor-pointer';
            
            threadElement.innerHTML = `
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-red-400 font-bold">[ THREAD_ID: ${threadId.substring(0, 6)}... ]</span>
                    <span class="text-gray-500">${timestampStr}</span>
                </div>
                <h3 class="text-white text-md font-bold hover:underline">${threadData.content.substring(0, 100)}${threadData.content.length > 100 ? '...' : ''}</h3>
                <div class="flex justify-between items-center text-xs mt-2">
                    <span class="text-green-400">Operador: ${threadData.author} | Respuestas: ${threadData.replyCount || 0}</span>
                    <button id="like-btn-${threadId}" 
                            class="text-red-500 hover:text-white transition like-btn ${hasLiked ? 'liked-active' : ''}"
                            ${hasLiked ? 'disabled' : ''}>
                        <span data-lucide="zap" class="w-4 h-4 inline-block mr-1 like-icon"></span> ${likes} BADGES
                    </button>
                </div>
            `;
            
            // Event Listeners (Delegados)
            threadElement.addEventListener('click', () => {
                displayThread(threadId, threadData);
            });

            const likeButton = threadElement.querySelector(`#like-btn-${threadId}`);
            if (likeButton) {
                // Prevenir que el click en el botón navegue al detalle
                likeButton.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    addLike(threadId, likeButton);
                });
            }
            
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

    // Ranking: Ordenar por likes (CORRECTO)
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
    showDetailView(threadId);

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

    const detailLikeButton = document.getElementById('detail-like-btn');
    if (detailLikeButton) {
        detailLikeButton.addEventListener('click', () => addLike(threadId, detailLikeButton));
    }

    const replyAuthorInput = document.getElementById('reply-author');
    const replyContentInput = document.getElementById('reply-content');
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

    // Generar logs laterales (no se muestra aquí por concisión)
    // generateRandomLog('log-left'); 
    // generateRandomLog('log-right');
    
    // Control de modales y botones
    document.getElementById('close-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'none';
    });
    document.getElementById('show-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'flex';
    });
    
    submitThreadBtn.disabled = false;
    submitThreadBtn.textContent = "EXECUTE (INIT)";
    
    // Iniciar la secuencia de carga corregida
    initPreloader();
    lucide.createIcons();
}

