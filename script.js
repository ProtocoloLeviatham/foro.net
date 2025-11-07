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

// Intentar habilitar la persistencia de datos (guardado local)
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
        console.warn("WARN: Persistencia de Firebase fallida:", err);
    }
});

// Referencias a elementos de la UI
const preloader = document.getElementById('preloader');
const contentWrapper = document.getElementById('content-wrapper');
const rulesModal = document.getElementById('rules-modal');
const postsContainer = document.getElementById('posts-container');
const repliesContainer = document.getElementById('replies-container');
const matrixCanvas = document.getElementById('matrix-canvas');
const paginationControls = document.getElementById('pagination-controls');

// Parámetros de Paginación para Respuestas (Comentarios)
const REPLIES_PER_PAGE = 20; // 20 comentarios por página, sí o sí
let currentThreadId = null;
let currentThreadData = null;
let repliesHistory = {}; // Almacenará los cursores de las páginas de respuestas

// -----------------------------------------------------
// 01. EFECTO MATRIX (MORADO) Y LOGS LATERALES
// -----------------------------------------------------
function initMatrixEffect() {
    if (!matrixCanvas) return;
    
    const ctx = matrixCanvas.getContext('2d');
    matrixCanvas.height = window.innerHeight;
    matrixCanvas.width = window.innerWidth;
    
    const chinese = '0123456789ABCDEF!$%^&*#@';
    const font_size = 10;
    const columns = matrixCanvas.width / font_size;
    const drops = [];
    
    for (let x = 0; x < columns; x++) {
        drops[x] = 1;
    }
    
    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
        
        // Color Morado
        ctx.fillStyle = '#9900FF'; 
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

function generateRandomLog() {
    const actions = [
        "[+] TCP/443 ESTABLISHED: 172.16.2.8 -> 51.255.45.10",
        "[TOR] NEW CIRCUIT: RU->CH->DE. LATENCY HIGH.",
        "[FIREBASE] PULL /THREADS/ SUCCESS. SIZE 4KB.",
        "[PROXY] ANONIMITY CHECK: 100% SECURE.",
        "[NETWORK] PACKET LOSS 0.1% ON NODE 3.",
        "[$] SQLI ATTEMPT DETECTED: DROP TABLE.",
        "[INFO] OPERATOR 0x513FA ACTIVITY LOGGED.",
        "[UPLOAD] COMPRESSION LVL 9 APPLIED.",
        "[WARNING] SERVER LOAD ABOVE 70%.",
        "[SUCCESS] DB WRITE: THREAD_ID OK."
    ];
    
    const randomLog = () => actions[Math.floor(Math.random() * actions.length)] + ` (${Date.now().toString().slice(-4)})`;

    const createScrollingContent = (elementId) => {
        const preElement = document.getElementById(elementId);
        let content = '';
        for (let i = 0; i < 150; i++) {
            content += randomLog() + '\n';
        }
        preElement.textContent = content;
    };

    createScrollingContent('log-left');
    createScrollingContent('log-right');
}

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
    document.getElementById('thread-list-view').style.display = 'block';
    document.getElementById('thread-detail-view').style.display = 'none';
    // Se elimina la referencia a 'ranking-view'
}

function showDetailView() {
    document.getElementById('thread-list-view').style.display = 'none';
    document.getElementById('thread-detail-view').style.display = 'block';
    // Se elimina la referencia a 'ranking-view'
}

// -----------------------------------------------------
// 03. GESTIÓN DE DATOS (FIREBASE)
// -----------------------------------------------------

function publishThread() {
    const authorInput = document.getElementById('thread-author');
    const contentInput = document.getElementById('thread-content');
    const submitThreadBtn = document.getElementById('submit-thread-btn');

    const author = authorInput.value.trim() || 'Anonimo Cifrado'; 
    const content = contentInput.value.trim();

    if (content.length < 15 || content.length > 500) {
        alert("ERROR: El hilo debe tener entre 15 y 500 caracteres.");
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
        alert("ERROR: Fallo de escritura. [Code: 503]");
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
        alert("ERROR: Respuesta demasiado corta. Mínimo 10 caracteres.");
        return;
    }

    replyButton.disabled = true;
    replyButton.textContent = "EJECUTANDO...";

    const repliesCollection = threadsCollection.doc(threadId).collection('replies');
    
    // Transacción para garantizar el contador (el punto débil corregido)
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
        contentInput.value = ''; 
        authorInput.value = '';
        alert("Respuesta Enviada [ACK/200]");
        
        // Recargamos la página actual de respuestas
        const currentReplyPage = repliesHistory[threadId] ? repliesHistory[threadId].currentPage : 1;
        loadReplies(threadId, currentReplyPage); 
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
    postsContainer.innerHTML = '<p class="text-gray-600">Buscando Hilos de Datos...</p>';

    // Se mantiene onSnapshot para la actualización en tiempo real del contador de respuestas
    threadsCollection.orderBy('timestamp', 'desc').onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
        
        if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
             console.warn("WARN: Modo sin conexión. Mostrando datos de caché.");
        }

        postsContainer.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const timestampStr = formatTimestamp(threadData.timestamp);
            const replies = threadData.replyCount || 0;

            const threadElement = document.createElement('div');
            threadElement.className = 'p-3 border border-dashed border-gray-700 hover:border-green-500 transition cursor-pointer';
            
            const encodedThreadData = encodeURIComponent(JSON.stringify(threadData));

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
                displayThread(threadId, JSON.parse(decodeURIComponent(encodedThreadData)));
            });
            
            postsContainer.appendChild(threadElement);
        });
        
        if (snapshot.empty) {
            postsContainer.innerHTML = '<p class="text-center text-gray-600">-- DIRECTORIO VACÍO. INICIE TRANSMISIÓN --</p>';
        }
        lucide.createIcons();
    }, (error) => {
        console.error("ERROR CRÍTICO EN ON-SNAPSHOT:", error);
        postsContainer.innerHTML = `<p class="text-center text-red-500">ERROR CRÍTICO: Fallo de conexión a la Base de Datos. Code: ${error.code || 'UNKNOWN'}. Intente recargar.</p>`;
    });
}


function displayThread(threadId, threadData) {
    showDetailView();
    currentThreadId = threadId;
    currentThreadData = threadData; 

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

    replyButton.onclick = () => publishReply(threadId);

    // Reiniciar la paginación de respuestas al abrir un hilo nuevo
    if (!repliesHistory[threadId]) {
        repliesHistory[threadId] = { currentPage: 1, lastVisible: null };
    }
    
    // Cargar la primera página de respuestas
    loadReplies(threadId, repliesHistory[threadId].currentPage);
    lucide.createIcons();
}

/**
 * Genera y maneja la paginación de respuestas (Comentarios).
 */
function loadReplies(threadId, pageNumber = 1, direction = 'none') {
    repliesContainer.innerHTML = '<p class="text-gray-600">Buscando Respuestas de Datos...</p>';
    paginationControls.innerHTML = ''; 
    
    const repliesCollection = threadsCollection.doc(threadId).collection('replies');
    let query = repliesCollection.orderBy('timestamp', 'asc').limit(REPLIES_PER_PAGE);

    const threadHistory = repliesHistory[threadId];
    
    if (direction === 'next' && threadHistory.lastVisible) {
        query = query.startAfter(threadHistory.lastVisible);
    } 
    // Nota: La paginación 'prev' es compleja sin historial de cursores, la simplificamos
    // para que la navegación principal sea solo 'next' por estabilidad.

    if (pageNumber === 1) {
        threadHistory.lastVisible = null;
    }


    query.get().then((snapshot) => {
        repliesContainer.innerHTML = '';
        
        // Guardar el cursor para la paginación 'next'
        if (snapshot.docs.length > 0) {
            threadHistory.lastVisible = snapshot.docs[snapshot.docs.length - 1];
        } else {
             threadHistory.lastVisible = null;
        }

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
        
        const totalReplies = currentThreadData ? currentThreadData.replyCount || 0 : 0;
        const totalPages = Math.ceil(totalReplies / REPLIES_PER_PAGE);

        renderPaginationControls(threadId, totalPages, pageNumber, snapshot.docs.length);
        
    }).catch(error => {
        console.error("Error al cargar respuestas paginadas:", error);
        repliesContainer.innerHTML = '<p class="text-center text-red-500">ERROR: Fallo al cargar los fragmentos de datos.</p>';
    });
}

function renderPaginationControls(threadId, totalPages, currentPage, docsCount) {
    paginationControls.innerHTML = '';
    
    const hasPrev = currentPage > 1;
    // Solo hay "next" si el número de documentos es igual al límite (REPLIES_PER_PAGE)
    const hasNext = docsCount === REPLIES_PER_PAGE && currentPage < totalPages;
    
    // Botón Anterior
    const prevBtn = document.createElement('button');
    prevBtn.className = 'hacker-btn pagination-btn';
    prevBtn.innerHTML = `<span data-lucide="chevrons-left" class="w-4 h-4 inline-block"></span> PREV`;
    prevBtn.disabled = !hasPrev;
    prevBtn.onclick = () => {
        repliesHistory[threadId].currentPage = currentPage - 1;
        // Para ir 'prev', forzamos a cargar la primera página, ya que la navegación hacia atrás con 'limit' y 'startAfter' es compleja y propensa a errores.
        loadReplies(threadId, 1, 'first'); 
        alert("INFO: Volviendo a la primera página de respuestas por seguridad del cursor.");
    };
    paginationControls.appendChild(prevBtn);

    // Indicador de página
    const pageIndicator = document.createElement('span');
    pageIndicator.className = 'text-yellow-400 font-bold';
    pageIndicator.textContent = `[ PAGE ${currentPage} / ${totalPages} ]`;
    paginationControls.appendChild(pageIndicator);

    // Botón Siguiente
    const nextBtn = document.createElement('button');
    nextBtn.className = 'hacker-btn pagination-btn';
    nextBtn.innerHTML = `NEXT <span data-lucide="chevrons-right" class="w-4 h-4 inline-block"></span>`;
    nextBtn.disabled = !hasNext; 
    nextBtn.onclick = () => {
        repliesHistory[threadId].currentPage = currentPage + 1;
        loadReplies(threadId, currentPage + 1, 'next');
    };
    paginationControls.appendChild(nextBtn);
    
    lucide.createIcons();
}

// -----------------------------------------------------
// 04. INICIALIZACIÓN FINAL
// -----------------------------------------------------

function initApp() {
    const userId = localStorage.getItem('user-id') || 'Cipher_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('user-id', userId);
    document.getElementById('user-id-display').textContent = userId;

    initMatrixEffect();
    generateRandomLog(); 
    
    document.getElementById('close-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'none';
        contentWrapper.classList.remove('hidden'); 
        loadThreads(); 
    });
    document.getElementById('show-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'flex';
    });
    
    initPreloader();
    lucide.createIcons();
}

function initPreloader() {
    const lines = [
        { selector: '.loading-line:nth-child(1) span', delay: 0 },
        { selector: '.loading-line:nth-child(2) span', delay: 2500 },
        { selector: '.loading-line:nth-child(3) span', delay: 5000 },
        { selector: '.loading-line:nth-child(4) span', delay: 7500 },
        { selector: '.loading-line:nth-child(5) span', delay: 9000 },
    ];

    lines.forEach(line => {
        const spans = document.querySelectorAll(line.selector);
        spans.forEach((span, index) => {
            span.style.animationDelay = `${line.delay + (index * 80)}ms`;
        });
    });

    const totalAnimationTime = 9500; 
    setTimeout(() => {
        preloader.style.opacity = '0';
        setTimeout(() => {
            preloader.style.display = 'none';
            rulesModal.style.display = 'flex'; 
        }, 500); 
    }, totalAnimationTime);
}



