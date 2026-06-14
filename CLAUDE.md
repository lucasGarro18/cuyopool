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

## Animación de agua (clave — mucha iteración)
- El usuario quiere que **TODO scrollee junto** (NO fondo fijo) y que el fondo sea **agua en movimiento en toda la página**.
- Estructura final: el ripple WebGL real (`jquery.ripples` sobre `assets/water-surface.jpg`) vive SOLO en el hero (`position:absolute`, se va con el scroll). El fondo de toda la página es agua animada por CSS (`#water-fx`: caustics difuminados que derivan, `position:absolute` dentro de `overflow:clip` para no agrandar el scroll).
- **Límite técnico:** un canvas WebGL no puede cubrir+scrollear los ~15.000px de la página en mobile (límite de textura del GPU ~4096px). **NO volver a poner el agua `position:fixed`.** La parte CSS es tuneable en visibilidad (vela + opacidad de los caustics).
- Mejora futura posible: shader de agua procedural (Three.js) con UV desplazada por scroll → más realista y controlable.

## Contactos
- **Lucas Garro** (principal, 2 números): San Juan +54 9 264 544 1838 · Mendoza +54 9 261 557 4180.
- **Ariel Mercau** (segundo contacto): +54 9 261 344 6651.
- Mail: cuyopiscinas@gmail.com · Instagram @piscinascuyo · Facebook piscinascuyooficial.

## Convenciones
- Textos en **español argentino** (voseo), tono premium/sobrio, sin relleno.
- No inventar datos de obras/clientes; si faltan, marcar el placeholder.
- Mensajes de commit en español, claros (qué y por qué), terminando con `Co-Authored-By`.
- Cambios quirúrgicos; verificar en el navegador (preview) antes de publicar.
