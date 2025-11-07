// **IMPORTANTE:** Para el desarrollo de un foro cliente, las keys deben estar
// en el código. No es posible "esconderlas" de forma segura en el cliente.
// La seguridad se garantiza con las REGLAS DE SEGURIDAD DE FIREBASE.
// --- CLAVE ADMINISTRATIVA ---
const ADMIN_KEY = "Leviathan2025AdminKey"; // CAMBIA ESTA CLAVE POR UNA MUCHO MÁS LARGA Y COMPLEJA
// ----------------------------
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

// Función de utilidad para formatear la fecha
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

/**
 * Publica un nuevo hilo en Firestore.
 */
function publishThread() {
    const authorInput = document.getElementById('thread-author');
    const contentInput = document.getElementById('thread-content');

    const author = authorInput.value.trim() || 'Anonimo'; // Por defecto es 'Anonimo'
    const content = contentInput.value.trim();

    if (content.length < 5) {
        alert("El contenido del hilo es demasiado corto. Mínimo 5 caracteres.");
        return;
    }

    // Estilo "Hacking": simular una carga/conexión
    console.log(`> Conectando a [${firebaseConfig.projectId}]...`);
    
    threadsCollection.add({
        author: author,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        // Inicializa un contador simple de respuestas (opcional pero útil)
        replyCount: 0 
    })
    .then((docRef) => {
        console.log(`> Transmisión enviada. ID: ${docRef.id}`);
        authorInput.value = ''; // Limpiar campo de autor
        contentInput.value = ''; // Limpiar campo de contenido
        alert("Transmisión Enviada (ACK)");
    })
    .catch((error) => {
        console.error("> ERROR DE CONEXIÓN/ESCRITURA:", error);
        alert("ERROR: No se pudo enviar la transmisión. Revisa la consola o las reglas de Firebase.");
    });
}

/**
 * Escucha en tiempo real los cambios en la colección de hilos y actualiza el DOM.
 */
function loadThreads() {
    const threadsList = document.getElementById('threads-list');

    // Escucha en tiempo real, ordenando por fecha de creación descendente
    threadsCollection.orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        threadsList.innerHTML = '<h2>> Hilos de Datos Cifrados:</h2>'; // Limpiar lista
        snapshot.forEach((doc) => {
            const threadData = doc.data();
            const threadId = doc.id;
            
            const threadElement = document.createElement('div');
            threadElement.className = 'thread-post';
            threadElement.setAttribute('data-thread-id', threadId);
            
            const timestampStr = formatTimestamp(threadData.timestamp);

            threadElement.innerHTML = `
                <h3>${threadData.content.substring(0, 80)}${threadData.content.length > 80 ? '...' : ''}</h3>
                <div class="thread-meta">
                    [Autor: ${threadData.author}] | [Fecha/Hora: ${timestampStr}] 
                    <span class="reply-count">| [Respuestas: ${threadData.replyCount || 0}]</span>
                </div>
            `;
            
            // Adjuntar listener para ver respuestas
            threadElement.addEventListener('click', () => {
                displayThread(threadId, threadData);
            });
            
            threadsList.appendChild(threadElement);
        });
        
        // Si no hay hilos, mostrar un mensaje
        if (snapshot.empty) {
            threadsList.innerHTML += '<p style="text-align: center;">-- No hay hilos aún. Sé el primero en transmitir --</p>';
        }
    }, (error) => {
        console.error("Error al escuchar hilos:", error);
        threadsList.innerHTML = '<h2>> ERROR DE CONEXIÓN. Código: 503</h2>';
    });
}

// Llama a la función para cargar los hilos al iniciar
window.onload = loadThreads;

// -----------------------------------------------------
// FUNCIÓN PARA MOSTRAR HILO COMPLETO Y RESPUESTAS (MÁS AVANZADO)
// -----------------------------------------------------

/**
 * Muestra el contenido completo de un hilo y sus respuestas
 * (Esto requiere una estructura de DOM más avanzada que por brevedad no incluyo,
 * pero es el paso a seguir después de hacer clic en el post).
 *
 * @param {string} threadId - El ID del hilo de Firestore.
 * @param {object} threadData - Los datos del hilo.
 */
function displayThread(threadId, threadData) {
    // Implementación:
    // 1. Mostrar el hilo completo en un modal o en una nueva vista.
    // 2. Cargar la subcolección `replies` para ese `threadId` (`db.collection("threads").doc(threadId).collection("replies")`).
    // 3. Mostrar un formulario para que los usuarios puedan añadir una nueva respuesta.
    
    alert(`Clic en Hilo ID: ${threadId}\nContenido: ${threadData.content}\n\nPara completar esta funcionalidad (mostrar respuestas y formulario de respuesta), necesitarías crear una nueva sección o modal de UI en el HTML/CSS.`);
    
    // Aquí iría el código para cargar las respuestas y el formulario de respuesta...
    // Ejemplo de cómo cargar respuestas:
    // db.collection("threads").doc(threadId).collection("replies").orderBy('timestamp', 'asc').get().then(...)

    // --- FUNCIONES DE ADMINISTRACIÓN ---

/**
 * Activa/Desactiva las herramientas de borrado tras verificar la clave.
 */
function toggleAdminMode() {
    const keyInput = document.getElementById('admin-key-input');
    const controlsStatus = document.getElementById('admin-controls-status');
    const adminButton = document.getElementById('admin-toggle-button');

    if (keyInput.type === 'text') { // Si ya está activo, desactivar
        keyInput.type = 'password';
        keyInput.value = '';
        controlsStatus.style.display = 'none';
        adminButton.textContent = 'ACTIVAR MODO';
        console.log("> MODO ADMIN DESACTIVADO.");
        return;
    }

    if (keyInput.value === ADMIN_KEY) {
        keyInput.type = 'text'; // Cambia a texto para que el admin pueda ver la clave
        controlsStatus.style.display = 'block';
        adminButton.textContent = 'DESACTIVAR MODO';
        console.log("> MODO ADMIN ACTIVADO CON ÉXITO.");
    } else {
        alert("CLAVE DE ACCESO DENEGADA. [Error: AUTH_FAIL]");
        keyInput.value = '';
    }
}

/**
 * Borra un hilo o una respuesta específica de Firebase.
 * @param {string} type - 'thread' o 'reply'.
 */
function deletePost(type) {
    let docRef;
    let successMessage;

    if (type === 'thread') {
        const threadId = document.getElementById('thread-id-to-delete').value.trim();
        if (!threadId) { alert("ERROR: ID de hilo requerido."); return; }
        docRef = threadsCollection.doc(threadId);
        successMessage = `Hilo [${threadId}] BORRADO.`;

    } else if (type === 'reply') {
        const replyId = document.getElementById('reply-id-to-delete').value.trim();
        const parentThreadId = document.getElementById('parent-thread-id').value.trim();
        if (!replyId || !parentThreadId) { alert("ERROR: IDs de respuesta e hilo padre requeridos."); return; }

        docRef = threadsCollection.doc(parentThreadId).collection('replies').doc(replyId);
        successMessage = `Respuesta [${replyId}] del hilo [${parentThreadId}] BORRADA.`;

        // Opcional: Desincrementar el replyCount del hilo padre (si el borrado es exitoso)
    }

    if (docRef) {
        docRef.delete().then(() => {
            alert(successMessage + " REINICIANDO CONEXIÓN.");
            console.warn(`> ${successMessage}`);
            // Limpiar campos y forzar una recarga visual
            document.getElementById('thread-id-to-delete').value = '';
            document.getElementById('reply-id-to-delete').value = '';
            document.getElementById('parent-thread-id').value = '';
            showListView(); // Vuelve a la vista de lista
        }).catch((error) => {
            console.error("ERROR AL BORRAR DOCUMENTO: ", error);
            alert("ERROR: No se pudo borrar el post. Revisa los IDs y las reglas de Firebase.");
        });
    }
}
}

