/**
 * app.js - Lógica Serverless para Anon-Net
 * * NOTA: Este código asume que tienes configurada una conexión a Firebase/Supabase u otro servicio Serverless.
 * Las funciones 'getPosts' y 'savePost' son ESQUEMAS que debes completar con la API de tu servicio elegido.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar la configuración de tu Base de Datos aquí (Ej: Firebase.initializeApp(config);)
    
    const postForm = document.getElementById('post-form');
    const postsContainer = document.getElementById('posts-container');

    /**
     * Función para generar identificadores anónimos temporales
     */
    function generateAnonID() {
        const hash = Math.random().toString(16).substring(2, 8).toUpperCase();
        return `Anon-User-${hash}`;
    }

    /**
     * ⚠️ ESQUEMA DE FUNCIÓN - Debe conectarse a Firebase/Supabase para guardar el post
     */
    async function savePost(content) {
        // En un entorno real, aquí se enviarían los datos a la Base de Datos
        console.log("Enviando post a la Base de Datos Serverless...");
        
        const postData = {
            author: "Anónimo", // Fijo para todos los usuarios
            content: content,
            timestamp: new Date().toISOString()
        };
        
        // **FALTA IMPLEMENTACIÓN REAL:** Usar la API del servicio (Ej: db.collection("posts").add(postData))
        
        // Simulación:
        return postData; 
    }

    /**
     * ⚠️ ESQUEMA DE FUNCIÓN - Debe conectarse a Firebase/Supabase para obtener todos los posts
     */
    async function getPosts() {
        // **FALTA IMPLEMENTACIÓN REAL:** Usar la API del servicio (Ej: db.collection("posts").get())
        
        // Simulación de posts para mostrar la estructura:
        return [
            {
                author: "Anónimo",
                content: "Bienvenido al Protocolo A.N. Mantenga la seguridad.",
                timestamp: new Date(Date.now() - 3600000).toLocaleString() // Hace 1 hora
            },
            {
                author: "Anónimo",
                content: "Tengo un problema con la encriptación AES-256 en mi nodo...",
                timestamp: new Date(Date.now() - 1200000).toLocaleString() // Hace 20 minutos
            }
        ];
    }

    /**
     * Renderiza un post en el DOM
     */
    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        
        // Limpiamos el contenido para prevenir XSS (Validación de Entradas)
        const safeContent = post.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        postElement.innerHTML = `
            <div class="post-header">
                <span class="post-author">${post.author}</span>
                <span class="post-time">${post.timestamp}</span>
            </div>
            <div class="post-content">${safeContent}</div>
            <a href="#" class="reply-link" onclick="console.log('Integrar lógica de respuesta aquí'); return false;">[ Responder ]</a>
        `;
        postsContainer.prepend(postElement); // Añade el más nuevo al principio
    }

    // --- MANEJO DE ENVÍO DE FORMULARIO ---
    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = document.getElementById('post-content').value.trim();

        if (content) {
            // Guardar en el Back-end Serverless
            const newPost = await savePost(content); 
            renderPost(newPost);
            
            // Limpiar el formulario
            document.getElementById('post-content').value = '';
        }
    });

    // --- CARGA INICIAL DE POSTS ---
    async function loadPosts() {
        const posts = await getPosts();
        posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Ordenar por fecha (más reciente primero)
        posts.forEach(renderPost);
    }

    loadPosts();
});