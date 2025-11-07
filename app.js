// === 1. CONFIGURACIÓN DE FIREBASE (¡REEMPLAZA CON TUS DATOS REALES!) ===
const firebaseConfig = {
    apiKey: "AIzaSyBZCPk8qp39BoQ99qLfoQlT6pabnqaqinY", // Clave real de tu proyecto
    authDomain: "foro-513fa.firebaseapp.com",
    projectId: "foro-513fa", // ID de tu proyecto Firebase
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};

// Inicializar Firebase y Firestore
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const postsCollection = db.collection('posts');

// === Variables Globales del Foro ===
const POSTS_PER_PAGE = 10; // Número de posts por página
let currentPage = 1;
let totalPosts = 0;
let lastVisible = null; // Para paginación eficiente en Firestore

document.addEventListener('DOMContentLoaded', () => {
    const postForm = document.getElementById('post-form');
    const postContent = document.getElementById('post-content');
    const charCount = document.getElementById('char-count');
    const postsContainer = document.getElementById('posts-container');
    const totalPostsCount = document.getElementById('total-posts-count');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    // --- Efectos Visuales ---
    initBackgroundAnimation();
    initGlobalGlitchEffect();
    initGlitchTextAnimations(); // Activar animaciones de texto glitch

    // --- Funciones de Firebase ---

    /**
     * Guarda un post en Firestore.
     */
    async function savePost(content) {
        // Sanitizamos el contenido antes de guardar para prevenir XSS
        const safeContent = content.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const postData = {
            author: "Anónimo", // Fijo para todos
            content: safeContent,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() // Timestamp del servidor
        };
        
        await postsCollection.add(postData);
        // Actualizamos el contador de posts después de añadir uno
        totalPosts++;
        totalPostsCount.textContent = `(${totalPosts})`;
        return postData;
    }

    /**
     * Obtiene los posts paginados de Firestore.
     */
    async function getPosts(direction = 'next') {
        let query = postsCollection.orderBy('timestamp', 'desc');
        let snapshot;

        if (direction === 'next' && lastVisible) {
            query = query.startAfter(lastVisible);
        } else if (direction === 'prev' && firstVisible) {
            query = postsCollection.orderBy('timestamp', 'asc').startAfter(firstVisible); // Reverse for previous page
        }
        
        // Limita a POSTS_PER_PAGE + 1 para saber si hay más páginas
        snapshot = await query.limit(POSTS_PER_PAGE + 1).get();

        if (direction === 'prev') {
            const tempDocs = snapshot.docs.reverse(); // Invertir para mostrar correctamente
            lastVisible = tempDocs[tempDocs.length - 1];
            // No hay firstVisible en esta implementación sencilla de "prev"
            // Para una paginación "prev" perfecta se necesita un "startAt" y un "endAt"
            // Esta es una simulación básica de la página anterior
            return tempDocs.slice(0, POSTS_PER_PAGE);
        } else {
            lastVisible = snapshot.docs[snapshot.docs.length - 1];
            return snapshot.docs.slice(0, POSTS_PER_PAGE);
        }
    }

    /**
     * Obtiene el número total de posts para el contador.
     */
    async function getTotalPostsCount() {
        const snapshot = await postsCollection.count().get();
        totalPosts = snapshot.data().count;
        totalPostsCount.textContent = `(${totalPosts})`;
    }

    // --- Funciones de Renderizado y UI ---

    /**
     * Formatea un timestamp a un string legible.
     */
    function formatTimestamp(timestamp) {
        if (!timestamp) return 'Desconocido';
        // Si viene de Firebase, es un objeto Timestamp
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffSeconds = Math.floor((now - date) / 1000);

        if (diffSeconds < 60) return `${diffSeconds} segundos atrás`;
        const diffMinutes = Math.floor(diffSeconds / 60);
        if (diffMinutes < 60) return `${diffMinutes} minutos atrás`;
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours} horas atrás`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays} días atrás`;

        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    /**
     * Renderiza un post en el DOM.
     */
    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        
        const formattedTime = formatTimestamp(post.timestamp);
        const safeContent = post.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        postElement.innerHTML = `
            <div class="post-header">
                <span class="post-author">${post.author}</span>
                <span class="post-time">${formattedTime}</span>
            </div>
            <div class="post-content">${safeContent}</div>
            <a href="#" class="reply-link" data-post-content="${safeContent}" onclick="handleReply(event)">[ RESPONDER ]</a>
        `;
        postsContainer.appendChild(postElement);
    }

    /**
     * Limpia el contenedor de posts y carga la página actual.
     */
    async function loadPage(page = 1, direction = 'next') {
        postsContainer.innerHTML = ''; // Limpiar posts existentes
        currentPage = page;
        
        const fetchedPosts = await getPosts(direction);
        fetchedPosts.forEach(renderPost);
        
        updatePaginationControls(fetchedPosts.length);
        pageInfo.textContent = `Página ${currentPage}`;
    }

    /**
     * Actualiza el estado de los botones de paginación.
     */
    function updatePaginationControls(postsOnPage) {
        prevPageBtn.disabled = (currentPage === 1);
        // Deshabilitar "Siguiente" si no hay más posts que el límite por página
        nextPageBtn.disabled = (postsOnPage < POSTS_PER_PAGE); 
    }

    // --- Manejo de Eventos ---

    // Contador de caracteres
    postContent.addEventListener('input', () => {
        const currentLength = postContent.value.length;
        charCount.textContent = `${currentLength} / 500`;
        if (currentLength > 500) {
            postContent.value = postContent.value.substring(0, 500);
            charCount.style.color = var(--glitch-red);
        } else {
            charCount.style.color = ''; // Reset color
        }
    });

    // Envío del formulario
    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = postContent.value.trim();

        if (content && content.length <= 500) {
            const button = e.submitter;
            button.disabled = true; // Deshabilitar botón para evitar doble envío
            button.textContent = 'ENCRIPTANDO...';

            try {
                const newPost = await savePost(content);
                // Volver a cargar la primera página para ver el nuevo post
                currentPage = 1;
                lastVisible = null; // Resetear la paginación
                await loadPage();
                postContent.value = ''; // Limpiar el área de texto
                charCount.textContent = '0 / 500';
            } catch (error) {
                console.error("Error al enviar el post:", error);
                alert("Error al enviar el post. Intente de nuevo.");
            } finally {
                button.disabled = false;
                button.textContent = 'ENVIAR SEGURO';
            }
        } else if (content.length > 500) {
            alert("El mensaje excede el límite de 500 caracteres.");
        }
    });

    // Paginación
    prevPageBtn.addEventListener('click', async () => {
        if (currentPage > 1) {
            currentPage--;
            lastVisible = null; // Necesitamos recalcular el lastVisible para la página anterior
            await loadPage(currentPage, 'prev');
        }
    });

    nextPageBtn.addEventListener('click', async () => {
        // Para "next", necesitamos volver a cargar con el `lastVisible` de la página actual
        await loadPage(currentPage + 1, 'next');
        currentPage++; // Incrementar solo si hay posts en la siguiente página
    });

    // Función global para manejar "Responder"
    window.handleReply = (event) => {
        event.preventDefault();
        const postContentToReply = event.target.dataset.postContent;
        // Puedes personalizar el formato de la respuesta, ej: "> Texto de la respuesta\n\n"
        postContent.value = `> ${postContentToReply.split('\n')[0].substring(0, 100)}...\n\n`;
        postContent.focus();
        charCount.textContent = `${postContent.value.length} / 500`;
    };

    // --- Carga Inicial ---
    async function init() {
        await getTotalPostsCount();
        await loadPage(1, 'next');
    }
    init();

    // --- Funciones para Efectos de Fondo y Glitch ---

    function initBackgroundAnimation() {
        const canvas = document.getElementById('background-canvas');
        const ctx = canvas.getContext('2d');
        let particles = [];
        const numParticles = 100;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            particles = []; // Reiniciar partículas al redimensionar
            createParticles();
        });

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 0.5; // Tamaño pequeño
                this.speedX = Math.random() * 0.5 - 0.25; // Movimiento lento
                this.speedY = Math.random() * 0.5 - 0.25;
                this.color = `rgba(0, 255, 65, ${Math.random() * 0.3 + 0.1})`; // Verde sutil
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                if (this.size > 0.1) this.size -= 0.01; // Las partículas se desvanecen lentamente

                // Reaparecer si salen de la pantalla
                if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                    this.x = Math.random() * canvas.width;
                    this.y = Math.random() * canvas.height;
                    this.size = Math.random() * 2 + 0.5;
                }
            }
            draw() {
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function createParticles() {
            for (let i = 0; i < numParticles; i++) {
                particles.push(new Particle());
            }
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Limpiar canvas
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
            }
            requestAnimationFrame(animateParticles);
        }

        createParticles();
        animateParticles();
    }

    function initGlobalGlitchEffect() {
        const body = document.body;
        let glitchTimeout;

        function triggerGlitch() {
            const glitchDiv = document.createElement('div');
            glitchDiv.classList.add('glitch-effect');
            body.appendChild(glitchDiv);

            // Eliminar el glitch después de un corto tiempo y programar el siguiente
            setTimeout(() => {
                glitchDiv.remove();
                glitchTimeout = setTimeout(triggerGlitch, Math.random() * 5000 + 2000); // Glitch cada 2-7 segundos
            }, Math.random() * 200 + 50); // El glitch dura 50-250ms
        }

        glitchTimeout = setTimeout(triggerGlitch, Math.random() * 3000 + 1000); // Primer glitch en 1-4 segundos
    }

    // Pequeña función para asegurarse de que las animaciones de CSS se activen
    function initGlitchTextAnimations() {
        // Esto solo asegura que los elementos existan y sus animaciones CSS se apliquen
        // No hay lógica JS adicional para estos, ya que las animaciones son puramente CSS.
        document.querySelectorAll('.glitch-text').forEach(el => {
            // Un simple reflow para reiniciar la animación si es necesario
            void el.offsetWidth; 
        });
    }

}); // Fin de DOMContentLoaded
});

