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
const matrixCanvas = document.getElementById('matrix-canvas');
const paginationControls = document.getElementById('pagination-controls');

// Parámetros de Paginación Global para Hilos
const THREADS_PER_PAGE = 20;
let lastVisible = null; // Último documento visible para paginación
let firstVisible = null; // Primer documento visible para paginación (navegación inversa)
let historySnapshot = []; // Almacenar el historial de 'lastVisible' para ir hacia atrás
let currentPage = 1;


// -----------------------------------------------------
// 01. EFECTO MATRIX (PÚRPURA/MORADO)
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
        
        ctx.fillStyle = '#C0C0FF'; // Púrpura más claro
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


// -----------------------------------------------------
// 03. ANIMACIÓN DE INICIO (CORRECCIÓN CRÍTICA DE ESTABILIDAD)
// -----------------------------------------------------

function initPreloader() {
    // Definición de las líneas y sus retrasos
    const lines = [
        { selector: '.loading-line:nth-child(1) span', delay: 0 },
        { selector: '.loading-line:nth-child(2) span', delay: 2500 },
        { selector: '.loading-line:nth-child(3) span', delay: 5000 },
        { selector: '.loading-line:nth-child(4) span', delay: 7500 },
        { selector: '.loading-line:nth-child(5) span', delay: 9000 },
    ];

    // Aplicar los estilos de animación a cada palabra/span
    lines.forEach(line => {
        const spans = document.querySelectorAll(line.selector);
        spans.forEach((span, index) => {
            // Cada palabra tiene un delay incremental para simular el tipeo
            span.style.animationDelay = `${line.delay + (index * 80)}ms`;
        });
    });

    const totalAnimationTime = 9500; // Duración total de la simulación

    setTimeout(() => {
        preloader.style.opacity = '0';
        
        setTimeout(() => {
            preloader.style.display = 'none';
            rulesModal.style.display = 'flex'; 
        }, 500); // 0.5 segundo para el desvanecimiento
    }, totalAnimationTime);
}


// -----------------------------------------------------
// 04. GESTIÓN DE DATOS Y PAGINACIÓN (FIREBASE)
// -----------------------------------------------------

function publishThread() {
    const authorInput = document.getElementById('thread-author');
    const contentInput = document.getElementById('thread-content');

    const author = authorInput.value.trim() || 'Anonimo Cifrado'; 
    const content = contentInput.value.trim();

    if (content.length < 15 || content.length > 1500) { // Límite de 1500 caracteres
        alert("ERROR: El hilo debe tener entre 15 y 1500 caracteres. [Code: 400]");
        return;
    }

    const submitThreadBtn = document.getElementById('submit-thread-btn');
    submitThreadBtn.disabled = true;
    submitThreadBtn.textContent = "TRANSMITIENDO...";
    
    threadsCollection.add({
        author: author,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => {
        contentInput.value = ''; 
        authorInput.value = '';
        alert("Transmisión Enviada [ACK/200]");
        // Al publicar un nuevo hilo, forzamos la recarga de la primera página
        loadThreads('first');
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

/**
 * Carga los hilos con paginación basada en cursor.
 * @param {string} direction 'next', 'prev', o 'first'.
 */
function loadThreads(direction = 'first') {
    postsContainer.innerHTML = '<p class="text-gray-600">Buscando Hilos de Datos...</p>';
    paginationControls.innerHTML = '';

    let query = threadsCollection.orderBy('timestamp', 'desc').limit(THREADS_PER_PAGE);

    if (direction === 'next' && lastVisible) {
        query = query.startAfter(lastVisible);
    } else if (direction === 'prev' && firstVisible) {
        // Para ir hacia atrás, revertimos el orden, usamos startAfter(firstVisible), y luego revertimos la lista.
        // También debemos usar el historial almacenado para un cursor fiable
        
        if (historySnapshot.length > 1) {
            // El cursor para ir "atrás" es el penúltimo elemento del historial.
            query = threadsCollection
                .orderBy('timestamp', 'desc')
                .endBefore(historySnapshot[historySnapshot.length - 2].cursor) // Usamos endBefore con el cursor anterior
                .limitToLast(THREADS_PER_PAGE); // Y limitToLast para obtener los 20 anteriores
        } else {
             // Si el historial es 1 o menos, ya estamos en la primera página
             direction = 'first';
        }

    } else if (direction === 'first') {
        // Reiniciar la paginación
        historySnapshot = [];
        currentPage = 1;
    }

    query.get().then((snapshot) => {
        postsContainer.innerHTML = '';

        if (snapshot.empty) {
             postsContainer.innerHTML = `<p class="text-center text-gray-600">-- DIRECTORIO VACÍO ${direction !== 'first' ? '(FIN DE LA TRANSMISIÓN)' : ''} --</p>`;
             renderPagination(false, false);
             return;
        }

        // 1. Guardar los cursores para la siguiente/anterior paginación
        firstVisible = snapshot.docs[0];
        lastVisible = snapshot.docs[snapshot.docs.length - 1];

        // 2. Manejar el historial de paginación
        if (direction === 'next') {
            currentPage++;
            historySnapshot.push({ page: currentPage, cursor: firstVisible });
        } else if (direction === 'prev') {
            currentPage--;
            // Removemos los dos últimos elementos (el cursor actual y el que usamos para ir atrás)
            historySnapshot.pop(); 
            historySnapshot.pop(); 
        } else if (direction === 'first') {
            currentPage = 1;
            historySnapshot = [{ page: 1, cursor: firstVisible }];
        }
        
        // 3. Renderizar los hilos
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            const timestampStr = formatTimestamp(threadData.timestamp);

            const threadElement = document.createElement('div');
            threadElement.className = 'p-3 border border-dashed border-gray-700 hover:border-green-500 transition';
            
            threadElement.innerHTML = `
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-red-400 font-bold">[ THREAD_ID: ${threadId.substring(0, 8)}... ]</span>
                    <span class="text-gray-500">${timestampStr}</span>
                </div>
                <p class="text-white text-md">${threadData.content}</p>
                <div class="text-xs mt-2 text-green-400">Operador: ${threadData.author}</div>
            `;
            
            postsContainer.appendChild(threadElement);
        });
        
        // 4. Renderizar controles
        const hasNext = snapshot.docs.length === THREADS_PER_PAGE;
        const hasPrev = currentPage > 1;

        renderPagination(hasPrev, hasNext);
        lucide.createIcons();

    }).catch(error => {
        console.error("ERROR CRÍTICO al cargar hilos:", error);
        postsContainer.innerHTML = `<p class="text-center text-red-500">ERROR CRÍTICO: Fallo de conexión a la Base de Datos. Code: ${error.code || 'UNKNOWN'}</p>`;
        renderPagination(false, false);
    });
}


function renderPagination(hasPrev, hasNext) {
    paginationControls.innerHTML = '';
    
    // Botón Anterior
    const prevBtn = document.createElement('button');
    prevBtn.className = 'hacker-btn pagination-btn';
    prevBtn.innerHTML = `<span data-lucide="chevrons-left" class="w-4 h-4 inline-block"></span> PREV`;
    prevBtn.disabled = !hasPrev;
    prevBtn.onclick = () => loadThreads('prev');
    paginationControls.appendChild(prevBtn);

    // Indicador de página
    const pageIndicator = document.createElement('span');
    pageIndicator.className = 'text-yellow-400 font-bold';
    pageIndicator.textContent = `[ PAGE ${currentPage} ]`;
    paginationControls.appendChild(pageIndicator);

    // Botón Siguiente
    const nextBtn = document.createElement('button');
    nextBtn.className = 'hacker-btn pagination-btn';
    nextBtn.innerHTML = `NEXT <span data-lucide="chevrons-right" class="w-4 h-4 inline-block"></span>`;
    nextBtn.disabled = !hasNext;
    nextBtn.onclick = () => loadThreads('next');
    paginationControls.appendChild(nextBtn);
    
    lucide.createIcons();
}

// -----------------------------------------------------
// 05. INICIALIZACIÓN FINAL
// -----------------------------------------------------

function initApp() {
    // Generación de ID anónimo
    const userId = localStorage.getItem('user-id') || 'Cipher_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('user-id', userId);
    document.getElementById('user-id-display').textContent = userId;

    // Iniciar el efecto Matrix
    initMatrixEffect();
    
    // Control de modales y botones
    document.getElementById('close-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'none';
        contentWrapper.classList.remove('hidden'); // Mostrar el contenido principal al ACEPTAR
        loadThreads('first'); // Cargar la primera página de hilos
    });
    document.getElementById('show-rules-btn').addEventListener('click', () => {
        rulesModal.style.display = 'flex';
    });
    
    // Estado inicial del botón de publicación
    document.getElementById('submit-thread-btn').disabled = false;
    document.getElementById('submit-thread-btn').textContent = "EXECUTE (INIT)";
    
    // Iniciar la secuencia de carga corregida y robusta
    initPreloader();
    lucide.createIcons();
}





