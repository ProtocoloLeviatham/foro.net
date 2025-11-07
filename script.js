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
const matrixCanvas = document.getElementById('matrix-canvas');
const paginationControls = document.getElementById('pagination-controls');

// Parámetros de Paginación
const REPLIES_PER_PAGE = 20;
let currentThreadId = null;
let currentThreadData = null;


// -----------------------------------------------------
// 01. EFECTO MATRIX (PÚRPURA/MORADO)
// -----------------------------------------------------
function initMatrixEffect() {
    if (!matrixCanvas) return;
    
    const ctx = matrixCanvas.getContext('2d');
    
    matrixCanvas.height = window.innerHeight;
    matrixCanvas.width = window.innerWidth;
    
    const chinese = '0123456789ABCDEF!$%^&*'; // Caracteres más "Hacker"
    const font_size = 10;
    const columns = matrixCanvas.width / font_size;
    const drops = [];
    
    for (let x = 0; x < columns; x++) {
        drops[x] = 1;
    }
    
    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
        
        // Estilo de texto: Morado vibrante
        ctx.fillStyle = '#C0C0FF'; // Púrpura más claro para mejor visibilidad
        ctx.font = font_size + 'px monospace';
        
        for (let i = 0; i < drops.length; i++) {
            const text = chinese[Math.floor(Math.random() * chinese.length)];
            
            ctx.fillText(text, i * font_size, drops[i] * font_size);
            
            if (drops[i] * font_size > matrixCanvas.height && Math.random() > 0.975) {
                drops[i] = 0; 
            }
            
            drops[i]++;
        }
    }
    
    return setInterval(draw, 33);
}

window.addEventListener('resize', () => {
    matrixCanvas.height = window.innerHeight;
    matrixCanvas.width = window.innerWidth;
});

// -----------------------------------------------------
// 02. GESTIÓN DE VISTAS Y UTILIDADES
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
}

function showRankingView() {
    threadListView.style.display = 'none';
    threadDetailView.style.display = 'none';
    rankingView.style.display = 'block';
    loadTopThreadsByReplies(); 
}

// -----------------------------------------------------
// 03. ANIMACIÓN DE INICIO (PULIDA)
// -----------------------------------------------------

function initPreloader() {
    // 9.5 segundos es la duración total del tipeo
    const animationDuration = 9500; 

    setTimeout(() => {
        preloader.style.opacity = '0';
        
        setTimeout(() => {
            preloader.style.display = 'none';
            // Mostrar el modal de reglas para la aceptación forzosa
            rulesModal.style.display = 'flex'; 
        }, 1000); // 1 segundo para el desvanecimiento
    }, animationDuration);
}


// -----------------------------------------------------
// 04. GESTIÓN DE DATOS (FIREBASE)
// -----------------------------------------------------

function publishThread() {
    // ... (Lógica de publicación de hilo se mantiene igual)
    const authorInput = document.getElementById('thread-author');
    const contentInput = document.getElementById('thread-content');

    const author = authorInput.value.trim() || 'Anonimo Cifrado'; 
    const content = contentInput.value.trim();

    if (content.length < 15 || content.length > 500) {
        alert("ERROR: El hilo debe tener entre 15 y 500 caracteres. [Code: 400]");
        return;
    }

    submitThreadBtn.disabled = true;
    submitThreadBtn.textContent = "TRANSMITIENDO...";
    
    threadsCollection.add({
        author: author,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        replyCount: 0,
    })
    .then(() => {
        contentInput.value = ''; 
        authorInput.value = '';
        alert("Transmisión Enviada [ACK/200]");
    })
    .catch((error) => {
        console.error("> ERROR DE ESCRITURA:", error);
        alert("ERROR: Fallo de escritura. Verificar Reglas de Firebase. [Code: 503]");
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

    if (content.length < 10) {
        alert("ERROR: Respuesta demasiado corta. Mínimo 10 caracteres. [Code: 400]");
        return;
    }

    replyButton.disabled = true;
    replyButton.textContent = "EJECUTANDO...";

    const repliesCollection = threadsCollection.doc(threadId).collection('replies');
    
    // **USAMOS BATCH/TRANSACCIÓN PARA GARANTIZAR LA INTEGRIDAD DEL CONTADOR**
    db.runTransaction((transaction) => {
        // 1. Añadir la respuesta
        transaction.set(repliesCollection.doc(), {
            author: author,
            content: content,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // 2. Incrementar el contador del hilo padre
        const threadRef = threadsCollection.doc(threadId);
        transaction.update(threadRef, {
            replyCount: firebase.firestore.FieldValue.increment(1)
        });
        
        return Promise.resolve(); 
    })
    .then(() => {
        // Si la transacción es exitosa, limpiamos y recargamos
        contentInput.value = ''; 
        authorInput.value = '';
        // Al completar, forzamos la carga de la primera página (o la última si es relevante)
        // Por simplicidad, recargamos la vista del detalle:
        displayThread(currentThreadId, currentThreadData); 
    })
    .catch((error) => {
        console.error("> ERROR AL PUBLICAR RESPUESTA (TRANSACCIÓN):", error);
        alert("ERROR CRÍTICO: Fallo al registrar respuesta. [Code: 500]");
    })
    .finally(() => {
        replyButton.disabled = false;
        replyButton.textContent = "EXECUTE (REPLY)";
    });
}


function loadThreads() {
    // ... (Lógica de carga de hilos principales se mantiene igual)
    postsContainer.innerHTML = '<p class="text-gray-600">Buscando Hilos de Datos...</p>';

    threadsCollection.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        postsContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const timestampStr = formatTimestamp(threadData.timestamp);
            const replies = threadData.replyCount || 0;

            const threadElement = document.createElement('div');
            threadElement.className = 'p-3 border border-dashed border-gray-700 hover:border-green-500 transition cursor-pointer';
            
            threadElement.innerHTML = `
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-red-400 font-bold">[ THREAD_ID: ${threadId.substring(0, 6)}... ]</span>
                    <span class="text-gray-500">${timestampStr}</span>
                </div>
                <h3 class="text-white text-md font-bold hover:underline">${threadData.content.substring(0, 100)}${threadData.content.length > 100 ? '...' : ''}</h3>
                <div class="flex justify-between items-center text-xs mt-2">
                    <span class="text-green-400">Operador: ${threadData.author}</span>
                    <span class="text-yellow-400">
                        <span data-lucide="message-square" class="w-4 h-4 inline-block mr-1"></span> ${replies} RESPUESTAS
                    </span>
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
        lucide.createIcons();
    });
}

function loadTopThreadsByReplies() {
    topThreadsContainer.innerHTML = '<p class="text-gray-600">Buscando ranking por actividad...</p>';

    threadsCollection.orderBy('replyCount', 'desc').limit(10).onSnapshot((snapshot) => {
        topThreadsContainer.innerHTML = '';
        
        if (snapshot.empty) {
            topThreadsContainer.innerHTML = '<p class="text-gray-600">No hay hilos rankeados por actividad aún.</p>';
            return;
        }

        snapshot.forEach((doc, index) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const replies = threadData.replyCount || 0;
            
            // Convertir threadData a string y manejar comillas para el onclick (CORRECCIÓN CRÍTICA)
            // Se usa encodeURIComponent para evitar problemas de sintaxis con el JSON en el HTML
            const encodedThreadData = encodeURIComponent(JSON.stringify(threadData));

            const threadElement = document.createElement('div');
            threadElement.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 border-b border-gray-800 cursor-pointer hover:bg-gray-900 transition';
            threadElement.innerHTML = `
                <div class="flex items-center flex-1 mb-1 sm:mb-0" onclick="displayThread('${threadId}', JSON.parse(decodeURIComponent('${encodedThreadData}')))">
                    <span class="text-yellow-400 font-bold w-4">${index + 1}.</span>
                    <span class="truncate text-green-400 flex-1 ml-2">
                        ${threadData.content.substring(0, 40)}...
                    </span>
                </div>
                <span class="text-red-500 text-xs ml-6 sm:ml-2">
                    <span data-lucide="message-square" class="w-3 h-3 inline-block"></span> ${replies} REPLIES
                </span>
            `;
            topThreadsContainer.appendChild(threadElement);
        });
        lucide.createIcons();
    });
}


function displayThread(threadId, threadData) {
    showDetailView(threadId);
    currentThreadId = threadId;
    currentThreadData = threadData; // Guardar datos para re-carga después del reply

    const threadContentDiv = document.getElementById('current-thread-content');
    const replyButton = document.getElementById('reply-button');
    const timestampStr = formatTimestamp(threadData.timestamp);
    const replies = threadData.replyCount || 0;

    threadContentDiv.innerHTML = `
        <h3 class="text-xl text-red-400 mb-2 font-bold">[ HILO CIFRADO: ${threadId} ]</h3>
        <p class="mb-4">${threadData.content}</p>
        <div class="flex justify-between items-center text-xs text-gray-500 mt-4">
            <span>Operador: ${threadData.author} | Fecha/Hora: ${timestampStr}</span>
            <span class="text-yellow-400">
                <span data-lucide="message-square" class="w-4 h-4 inline-block mr-1"></span> REPLIES: ${replies}
            </span>
        </div>
    `;

    // Configurar el botón de respuesta
    replyButton.onclick = () => publishReply(threadId);

    // Cargar la primera página de respuestas
    loadReplies(threadId, 1);
    lucide.createIcons();
}

/**
 * Genera y maneja la paginación de respuestas
 */
function loadReplies(threadId, pageNumber = 1) {
    repliesContainer.innerHTML = '<p class="text-gray-600">Buscando Respuestas de Datos...</p>';
    paginationControls.innerHTML = ''; // Limpiar controles de paginación
    
    const repliesCollection = threadsCollection.doc(threadId).collection('replies');
    const offset = (pageNumber - 1) * REPLIES_PER_PAGE;

    // 1. Obtener el total para calcular el número de páginas (basado en replyCount del hilo padre)
    const totalReplies = currentThreadData ? currentThreadData.replyCount || 0 : 0;
    const totalPages = Math.ceil(totalReplies / REPLIES_PER_PAGE);

    // 2. Obtener solo las respuestas de la página actual
    repliesCollection
        .orderBy('timestamp', 'asc')
        .limit(REPLIES_PER_PAGE)
        .offset(offset)
        .get()
        .then((snapshot) => {
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

            if (snapshot.empty && pageNumber === 1) {
                repliesContainer.innerHTML = '<p class="text-center text-gray-600">-- SUB-DIRECTORIO VACÍO --</p>';
            }
            
            // 3. Generar controles de paginación si hay más de una página
            if (totalPages > 1) {
                renderPagination(threadId, totalPages, pageNumber);
            }
        })
        .catch(error => {
            console.error("Error al cargar respuestas paginadas:", error);
            repliesContainer.innerHTML = '<p class="text-center text-red-500">ERROR: Fallo al cargar los fragmentos de datos.</p>';
        });
}

function renderPagination(threadId, totalPages, currentPage) {
    paginationControls.innerHTML = '';

    // Botón Anterior
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'hacker-btn pagination-btn';
        prevBtn.innerHTML = `<span data-lucide="chevrons-left" class="w-4 h-4 inline-block"></span> PREV`;
        prevBtn.onclick = () => loadReplies(threadId, currentPage - 1);
        paginationControls.appendChild(prevBtn);
    }

    // Botones de Página
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `hacker-btn pagination-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = `[ ${i} ]`;
        pageBtn.onclick = () => loadReplies(threadId, i);
        paginationControls.appendChild(pageBtn);
    }

    // Botón Siguiente
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'hacker-btn pagination-btn';
        nextBtn.innerHTML = `NEXT <span data-lucide="chevrons-right" class="w-4 h-4 inline-block"></span>`;
        nextBtn.onclick = () => loadReplies(threadId, currentPage + 1);
        paginationControls.appendChild(nextBtn);
    }
    lucide.createIcons();
}

// -----------------------------------------------------
// 05. INICIALIZACIÓN FINAL
// -----------------------------------------------------

function initApp() {
    const userId = localStorage.getItem('user-id') || 'Cipher_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('user-id', userId);
    document.getElementById('user-id-display').textContent = userId;

    // Iniciar el efecto Matrix (Ahora es el Z-index 0, siempre visible)
    initMatrixEffect();
    
    // Control de modales y botones
    document.getElementById('close-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'none';
        contentWrapper.classList.remove('hidden'); // Mostrar el contenido principal al ACEPTAR
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

