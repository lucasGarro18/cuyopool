# Cuyo Pool — Manual del proyecto

Sitio web de **Cuyo Pool**, la marca de autor de **Piscinas Cuyo** (Lucas Garro).
Piscinas premium en **Mendoza · San Juan · San Luis**, desde 1995.

## Stack
- HTML/CSS/JS a mano, **sin framework**. One-page `index.html` + 9 subpáginas de estilos.
- Tipografías: Cormorant Garamond (serif) + Inter Tight (sans). Paleta: teal profundo + oro.
- Server local de dev: `node serve.mjs` (puerto 8888).

## Deploy — PUBLICAR SIEMPRE
- Repo: `github.com/lucasGarro18/cuyopool`, rama `main`. Deploy por **GitHub Pages** → https://lucasgarro18.github.io/cuyopool/
- **Después de CADA cambio: `git add -A` + `git commit` (mensaje claro en español) + `git push origin main`**, sin preguntar. Es la única forma de que se vea en la web. Avisar al usuario y recordar **Ctrl+Shift+R**.

## Estructura
- `index.html` — home (hero, experiencia/stats, manifiesto, nosotros, estilos, proceso, galería, obras, destacada, testimonio, contacto).
- Subpáginas — revestimientos: `bali`, `travertino`, `porcelanato`. Líneas: `piscinas-diseno`, `piscinas-semiolimpicas`, `canal-de-nado`, `jacuzzis`, `cascadas`, `desborde-infinito`.
- `styles-pages.css` — estilos compartidos de subpáginas. `water.js` — inyecta el fondo de agua en subpáginas. `interactions.js`, `page-init.js`. `editor.js` (modo edición con `?edit`, invisible para visitantes).
- `assets/` — imágenes. `assets/gallery/px-*.jpg` = **stock de Pexels TEMPORAL** (reemplazar 1:1 por fotos reales de obras cuando lleguen).

## Animación de agua (SOLUCIÓN FINAL — shader WebGL)
- El fondo de TODO el sitio es un **shader de agua WebGL procedural** en `water-gl.js`.
- Cómo funciona: un canvas `#water-gl` **fijo al viewport** toma la **foto real del agua** (`assets/water-surface.jpg`) como textura y le aplica **ondas de refracción + caustics** → agua de pileta **realista** que se mueve sola (`uTime`), reacciona al cursor (`uMouse`) y tiene **parallax suave al scrollear** (`uScroll`). Es liviano y sin el límite de tamaño del GPU. (Importante: el usuario rechazó la versión de caustics 100% procedural por "muy abstracta" — el agua DEBE verse como pileta realista, usando la foto.) Para tunear el look: la fuerza de las ondas (`d*0.022`), los caustics, o cambiar `water-surface.jpg`.
- Performance: render a `0.6x` + cap `30fps` + pausa en pestaña oculta. Respeta `prefers-reduced-motion`. Si no hay WebGL, queda el degradado CSS del `body`.
- Index lo carga con `<script src="water-gl.js?v=N">`. Subpáginas: `water.js` monta la vela `#bg-veil` y carga `water-gl.js`. La **vela** (`#bg-veil`, fija) regula la legibilidad; tunear ahí si el agua tapa el texto o si se quiere más/menos visible.
- Las portadas/heroes NO se tocan (en subpáginas, su foto de estilo sigue arriba y se va con el scroll).
- Eliminados por quedar sin uso: `jquery.ripples` (CDN), `water-surface.jpg`, `water-bg.js`, `ripple.js`, `water-canvas.js`, `water-flow.js`. Para tunear el agua: editar el fragment shader (colores `deep/mid/hi`, `light`) o la vela.

## Contactos
- **Lucas Garro** (principal, 2 números): San Juan +54 9 264 544 1838 · Mendoza +54 9 261 557 4180.
- **Ariel Mercau** (segundo contacto): +54 9 261 344 6651.
- Mail: cuyopiscinas@gmail.com · Instagram @piscinascuyo · Facebook piscinascuyooficial.

## Convenciones
- Textos en **español argentino** (voseo), tono premium/sobrio, sin relleno.
- No inventar datos de obras/clientes; si faltan, marcar el placeholder.
- Mensajes de commit en español, claros (qué y por qué), terminando con `Co-Authored-By`.
- Cambios quirúrgicos; verificar en el navegador (preview) antes de publicar.
