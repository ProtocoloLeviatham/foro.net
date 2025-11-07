// La función crypto.randomUUID() se asume disponible en el entorno.

// =========================================================================
// === 1. CONFIGURACIÓN DE FIREBASE (¡CLAVES REALES INYECTADAS!) ===
// =========================================================================
// Confirma que estas claves son las que obtuviste de la consola de Firebase.
const firebaseConfig = {
    apiKey: "AIzaSyBZCPk8qp39BoQ99qLfoQlT6pabnqaqinY",
    authDomain: "foro-513fa.firebaseapp.com",
    projectId: "foro-513fa",
    storageBucket: "foro-513fa.firebasestorage.app",
    messagingSenderId: "18055166367",
    appId: "1:18055166367:web:f6c6c421dd385eab4165aa"
};

// =========================================================================
// === 2. INICIALIZACIÓN DE FIREBASE Y FIRESTORE ===
// =========================================================================

// Global Variables
let db;
let postsCollection;
let userId;

/**
 * Muestra un mensaje temporal de estado (éxito o error) en la interfaz.
 * @param {string} message - El mensaje a mostrar.
 * @param {boolean} isError - Si el mensaje es de error.
 */
function displayStatusMessage(message, isError = false) {
    const statusBox = document.getElementById('status-message');
    if (!statusBox) return;

    statusBox.textContent = message;
    statusBox.classList.remove('hidden', 'error-box');
    
    if (isError) {
        statusBox.classList.add('error-box');
        statusBox.style.color = '#FF0000'; // Red
    } else {
        statusBox.style.color = '#39FF14'; // Neon Green
    }

    // Hide the message after 5 seconds
    setTimeout(() => {
        statusBox.classList.add('hidden');
    }, 5000);
}

/**
 * Inicializa Firebase, Auth (anónimo) y Firestore.
 * Luego, establece el listener en la base de datos.
 */
function initializeFirebaseAndApp() {
    try {
        const app = firebase.initializeApp(firebaseConfig); 
        db = firebase.firestore();
        
        // ¡CAMBIO CRÍTICO! Usamos 'posts' para coincidir con las reglas.
        postsCollection = db.collection('posts'); 

        // Autenticación simple (anónima)
        const auth = firebase.auth();
        auth.signInAnonymously()
            .then(() => {
                userId = auth.currentUser.uid;
                // Mostrar el ID del usuario en la consola
                const userIdElement = document.getElementById('local-user-id');
                if (userIdElement) {
                    userIdElement.textContent = userId;
                }
                console.log(`[AUTH] Conectado anónimamente con UID: ${userId}`);
                // Una vez autenticado, iniciamos la escucha de posts
                startPostListener();
            })
            .catch((error) => {
                console.error("[AUTH ERROR] Error en la autenticación anónima:", error);
                displayStatusMessage("ERROR: No se pudo conectar a AUTH (Error de configuración).", true);
            });

    } catch (error) {
        console.error("[FIREBASE ERROR] Error al inicializar Firebase. Revisa las claves:", error);
        displayStatusMessage("ERROR CRÍTICO: Fallo en la configuración de Firebase.", true);
    }
}


// =========================================================================
// === 3. LÓGICA DE FIRESTORE (Lectura y Escritura) ===
// =========================================================================

/**
 * Escucha los cambios en la colección 'posts' y actualiza la UI.
 */
function startPostListener() {
    if (!postsCollection) return;

    postsCollection
        .onSnapshot(snapshot => {
            let posts = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                posts.push({ id: doc.id, ...data });
            });

            // Ordenar los posts por 'createdAt' de forma descendente (más reciente primero)
            posts.sort((a, b) => {
                const timeA = a.createdAt ? a.createdAt.toDate().getTime() : 0;
                const timeB = b.createdAt ? b.createdAt.toDate().getTime() : 0;
                return timeB - timeA;
            });

            renderPosts(posts);

        }, error => {
            console.error("[FIRESTORE ERROR] Error al escuchar posts:", error);
            displayStatusMessage("ERROR: Fallo al cargar el historial del canal. (Revisar Reglas)", true);
        });
}

/**
 * Maneja el envío del formulario para agregar un nuevo post.
 * @param {Event} e - Evento de envío del formulario.
 */
function handlePostSubmit(e) {
    e.preventDefault();

    const usernameInput = document.getElementById('username');
    const contentInput = document.getElementById('postContent');
    
    let username = usernameInput.value.trim();
    const content = contentInput.value.trim();

    // Validaciones
    if (!content) {
        displayStatusMessage("ALERTA: El contenido del Thread no puede estar vacío.", true);
        return;
    }
    if (content.length > 280) { // Limitamos a 280 como dijimos en HTML
        displayStatusMessage("ALERTA: Contenido excede 280 caracteres.", true);
        return;
    }
    if (!username) {
        username = "Agente_Anonimo";
    }

    // Objeto del nuevo post
    const newPost = {
        username: username,
        content: content,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Timestamp requerido por la regla
        authorId: userId || 'unknown'
    };

    // Agregar el documento a la colección
    postsCollection.add(newPost)
        .then(() => {
            displayStatusMessage("Mensaje cifrado inyectado con éxito.", false);
            contentInput.value = '';
        })
        .catch(error => {
            console.error("[FIRESTORE ERROR] Error al añadir el post:", error);
            // Mensaje de error más específico para el usuario
            displayStatusMessage("ERROR: Fallo en la inyección de datos. (¿Reglas de Firestore?)", true);
        });
}


// =========================================================================
// === 4. RENDERIZADO DE LA UI ===
// =========================================================================

/**
 * Genera el HTML para mostrar los posts.
 * @param {Array<Object>} posts - Lista de objetos de post.
 */
function renderPosts(posts) {
    const container = document.getElementById('postsContainer');
    if (!container) return; 

    container.innerHTML = ''; 

    if (posts.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-8">El canal está en silencio. Sé el primero en inyectar un thread...</p>';
        return;
    }

    posts.forEach(post => {
        let timeString = 'Sin registro';
        if (post.createdAt && post.createdAt.toDate) {
            const date = post.createdAt.toDate();
            timeString = date.toLocaleTimeString('es-ES', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        }
        
        const postElement = document.createElement('div');
        postElement.className = 'post-card';
        // Check if the post was created by the current user
        const isUserPost = post.authorId === userId;
        
        postElement.innerHTML = `
            <div class="post-meta">
                <span class="post-username">${post.username} 
                    ${isUserPost ? '<span class="text-yellow-400 text-xs">(YO)</span>' : ''}
                </span>
                <span class="post-time">${timeString}</span>
            </div>
            <div class="post-content">${post.content}</div>
            <p class="text-xs text-gray-600 mt-2">ID: ${post.authorId ? post.authorId.substring(0, 8) + '...' : 'N/A'}</p>
        `;
        
        container.appendChild(postElement);
    });
}


// =========================================================================
// === 5. INICIO DE LA APLICACIÓN ===
// =========================================================================

window.onload = function () {
    // 1. Inicializar Firebase, Auth y Firestore
    initializeFirebaseAndApp();

    // 2. Asignar el listener al formulario de envío
    const form = document.getElementById('postForm');
    if (form) {
        form.addEventListener('submit', handlePostSubmit);
    }
};
