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

// Referencias a elementos de la UI
const threadListView = document.getElementById('thread-list-view');
const threadDetailView = document.getElementById('thread-detail-view');
const preloader = document.getElementById('preloader');
const contentWrapper = document.getElementById('content-wrapper');

// -----------------------------------------------------
// FUNCIÓN DE UTILIDAD
// -----------------------------------------------------

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Timestamp no disponible';
    const date = timestamp.toDate();
    return date.toLocaleString('es-ES', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// -----------------------------------------------------
// GESTIÓN DE VISTAS Y PRELOADER
// -----------------------------------------------------

/** Muestra la vista detallada del hilo. */
function showDetailView() {
    threadListView.style.display = 'none';
    threadDetailView.style.display = 'block';
}

/** Muestra la vista principal de hilos. */
function showListView() {
    threadDetailView.style.display = 'none';
    threadListView.style.display = 'block';
}

/** Gestiona la animación de carga inicial. */
function initPreloader() {
    // Calcular el tiempo total de la animación de tipeo (aprox. 7.5s)
    const animationDuration = 7500; 

    setTimeout(() => {
        preloader.style.opacity = '0';
        // Después de la transición (0.5s), ocultar y mostrar el contenido
        setTimeout(() => {
            preloader.style.display = 'none';
            contentWrapper.classList.remove('hidden');
            loadThreads(); // Iniciar carga de datos
        }, 500);
    }, animationDuration);
}


// -----------------------------------------------------
// PUBLICACIÓN DE HILOS Y RESPUESTAS
// -----------------------------------------------------

function publishThread() {
    const authorInput = document.getElementById('thread-author');
    const contentInput = document.getElementById('thread-content');

    const author = authorInput.value.trim() || 'Anonimo';
    const content = contentInput.value.trim();

    if (content.length < 5) {
        alert("ERROR: Contenido demasiado corto. Mínimo 5 caracteres. [Code: 400]");
        return;
    }

    console.log(`> Transmitiendo paquete de datos inicial...`);
    
    threadsCollection.add({
        author: author,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        replyCount: 0 
    })
    .then((docRef) => {
        console.log(`> Transmisión enviada. ID: ${docRef.id}`);
        authorInput.value = '';
        contentInput.value = '';
        alert("Transmisión Enviada [ACK/200]");
    })
    .catch((error) => {
        console.error("> ERROR DE CONEXIÓN/ESCRITURA:", error);
        alert("ERROR: No se pudo enviar la transmisión. Revisar Reglas de Firewall. [Code: 503]");
    });
}


function publishReply(threadId) {
    const authorInput = document.getElementById('reply-author');
    const contentInput = document.getElementById('reply-content');

    const author = authorInput.value.trim() || 'Anonimo';
    const content = contentInput.value.trim();

    if (content.length < 2) {
        alert("ERROR: Respuesta demasiado corta. Mínimo 2 caracteres. [Code: 400]");
        return;
    }

    const repliesCollection = threadsCollection.doc(threadId).collection('replies');
    
    console.log(`> Enviando respuesta a Hilo ${threadId}...`);

    repliesCollection.add({
        author: author,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        // Incrementa el contador en el documento del hilo principal
        threadsCollection.doc(threadId).update({
            replyCount: firebase.firestore.FieldValue.increment(1)
        });
        
        console.log(`> Respuesta enviada. Datos comprometidos.`);
        contentInput.value = ''; 
    })
    .catch((error) => {
        console.error("> ERROR AL PUBLICAR RESPUESTA:", error);
        alert("ERROR: Fallo en la transmisión de respuesta. Revisar Reglas de Firebase. [Code: 500]");
    });
}

// -----------------------------------------------------
// CARGA Y LISTADO DE DATOS (REAL-TIME)
// -----------------------------------------------------

function loadThreads() {
    const threadsList = document.getElementById('threads-list');

    threadsCollection.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        threadsList.innerHTML = '<h2>> $ ls -l /data/threads</h2>';
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            
            const threadElement = document.createElement('div');
            threadElement.className = 'thread-post';
            threadElement.setAttribute('data-thread-id', threadId);
            
            const timestampStr = formatTimestamp(threadData.timestamp);

            threadElement.innerHTML = `
                <h3>[${threadId.substring(0, 4)}...] ${threadData.content.substring(0, 80)}${threadData.content.length > 80 ? '...' : ''}</h3>
                <div class="thread-meta">
                    [Autor: ${threadData.author}] | [Fecha: ${timestampStr}] 
                    <span class="reply-count">| [Respuestas: ${threadData.replyCount || 0}]</span>
                </div>
            `;
            
            threadElement.addEventListener('click', () => {
                displayThread(threadId, threadData);
            });
            
            threadsList.appendChild(threadElement);
        });
        
        if (snapshot.empty) {
            threadsList.innerHTML += '<p style="text-align: center;">-- DIRECTORIO VACÍO. INICIE TRANSMISIÓN --</p>';
        }
    }, (error) => {
        console.error("Error al escuchar hilos:", error);
        threadsList.innerHTML = '<h2>> ERROR DE CONEXIÓN. Código: 503 (Servicio no disponible)</h2>';
    });
}

function displayThread(threadId, threadData) {
    showDetailView();

    const threadContentDiv = document.getElementById('current-thread-content');
    const replyButton = document.getElementById('reply-button');
    const timestampStr = formatTimestamp(threadData.timestamp);
    
    // Contenido del hilo principal
    threadContentDiv.innerHTML = `
        <div class="main-thread-post">
            <h3>>> CÓDIGO DE HILO: ${threadId}</h3>
            <p>${threadData.content}</p>
            <div class="thread-meta">
                [Autor: ${threadData.author}] | [Fecha/Hora: ${timestampStr}]
            </div>
        </div>
    `;

    // Configurar el botón de respuesta
    replyButton.onclick = () => publishReply(threadId);

    // Cargar respuestas
    loadReplies(threadId);
}

function loadReplies(threadId) {
    const repliesList = document.getElementById('replies-list');
    const repliesCollection = threadsCollection.doc(threadId).collection('replies');

    repliesList.innerHTML = '<h2>> $ cat /data/replies (Cargando...)</h2>';
    
    // Escucha en tiempo real, ordenando por fecha de creación ascendente
    repliesCollection.orderBy('timestamp', 'asc').onSnapshot((snapshot) => {
        repliesList.innerHTML = '<h2>> $ cat /data/replies</h2>';
        
        snapshot.forEach((doc) => {
            const replyData = doc.data();
            const timestampStr = formatTimestamp(replyData.timestamp);
            
            const replyElement = document.createElement('div');
            replyElement.className = 'reply-post';
            replyElement.innerHTML = `
                <div class="thread-meta">
                    > Transmisión de ${replyData.author} [${timestampStr}]
                </div>
                <p>${replyData.content}</p>
            `;
            
            repliesList.appendChild(replyElement);
        });

        if (snapshot.empty) {
            repliesList.innerHTML += '<p style="text-align: center;">-- SUB-DIRECTORIO VACÍO. INICIE DIÁLOGO --</p>';
        }

    }, (error) => {
        console.error("Error al escuchar respuestas:", error);
        repliesList.innerHTML = '<h2>> ERROR DE LECTURA. Fallo de integridad de datos.</h2>';
    });
}


// -----------------------------------------------------
// INICIO
// -----------------------------------------------------
window.onload = initPreloader;
