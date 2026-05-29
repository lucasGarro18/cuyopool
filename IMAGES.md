# Guía de imágenes — Piscinas Cuyo

Listado completo de imágenes usadas en el sitio y dónde reemplazarlas.
**Para publicar**: simplemente reemplazá los archivos JPG en `assets/` manteniendo el mismo nombre y formato.

---

## 1. Fondo principal (pool background)

**Archivo**: `assets/pool-extended.jpg`
**Tamaño recomendado**: 768 × 6489 px (proporción vertical extra alta)
**Tipo**: Foto aérea vertical de una pileta con su entorno completo (piedra, vegetación).
**Donde se usa**: Fondo de toda la página principal (index.html). El agua del centro se reemplaza por la animación WebGL.

> **Importante**: el área de los azulejos de la pileta debe estar centrada horizontalmente entre el 25.6% y el 74.4% del ancho. Si cambiás la foto, podés ajustar el encuadre desde el panel flotante con `?frame` en la URL.

---

## 2. Subpáginas — heros aéreos

Cada subpágina tiene una foto de portada aérea (proporción **vertical**, ~2:3).
**Tamaño recomendado**: 2400 × 3600 px (o similar relación 2:3).

| Subpágina | Archivo | Foto sugerida |
|-----------|---------|---------------|
| `canal-de-nado.html` | `assets/lp-canal.jpg` | Pileta rectangular larga (lap pool), vista aérea cenital |
| `piscinas-diseno.html` | `assets/lp-cascada.jpg` | Piscina de diseño con cascada / forma especial, vista aérea |
| `desborde-infinito.html` | `assets/lp-infinito.jpg` | Piscina con desborde infinito sobre paisaje, vista aérea |
| `bali.html` | `assets/lp-bali.jpg` | Piscina rodeada de piedra y vegetación tropical, vista aérea |
| `travertino.html` | `assets/lp-travertino.jpg` | Piscina con borde y solárium de travertino, vista aérea |
| `porcelanato.html` | `assets/lp-porcelana.jpg` | Piscina con revestimiento de porcelanato turquesa, vista aérea |

---

## 3. Galería (index.html — sección "06 Galería")

Grid editorial asimétrico con 8 imágenes. Reusan las imágenes de subpáginas y suman 2 extras:

| Posición | Archivo | Slot CSS |
|----------|---------|----------|
| Hero (grande) | `assets/lp-infinito.jpg` | `gal-item--hero` (6×4) |
| Vertical | `assets/lp-canal.jpg` | `gal-item--tall` (3×4) |
| Card mediana | `assets/lp-bali.jpg` | `gal-item--md` (3×3) |
| Horizontal ancha | `assets/lp-cascada.jpg` | `gal-item--wide` (6×2) |
| Card mediana | `assets/lp-travertino.jpg` | `gal-item--md` (3×3) |
| Card chica | `assets/lp-porcelana.jpg` | `gal-item--sm` (3×2) |
| Card chica | `assets/lp-semi.jpg` | Semi-olímpica · 18 m |
| Card chica | `assets/lp-jacuzzi.jpg` | Jacuzzi integrado |

---

## 4. Sección "Obras" (placeholders actuales)

La sección Obras (`#obras`) usa placeholders sin foto, solo gradiente con grid pattern. Para publicar con fotos reales, en `index.html` buscá los `<article class="obra">` y agregá un `<img>` dentro de cada `.obra__media`:

```html
<div class="obra__media">
  <img src="assets/obra-tunuyan.jpg" alt="..." />
  <span class="obra__badge">...</span>
  <span class="obra__id">...</span>
</div>
```

(CSS opcional: `.obra__media img { width:100%; height:100%; object-fit:cover; }`)

---

## 5. Loader / favicon

- **Loader**: solo texto, no requiere imagen.
- **Favicon**: no configurado todavía. Sugerencia: agregar `<link rel="icon" type="image/png" href="assets/favicon.png" />` en el `<head>`.

---

## Origen / créditos imágenes actuales

Las imágenes `lp-*.jpg` actuales son placeholders genéricos. Reemplazar con fotos propias de obra terminada **antes de publicar**.
Fuente recomendada para nuevas fotos: tomas de drone propias de proyectos firmados.
Si se usan fotos de stock (Pexels/Unsplash), preferir orientación portrait/vertical para los hero de subpágina.

---

## Checklist antes de publicar

- [ ] Reemplazar `assets/pool-extended.jpg` con foto aérea real de obra firmada.
- [ ] Reemplazar las 6 `assets/lp-*.jpg` con fotos verticales de cada estilo/material.
- [ ] (Opcional) Agregar fotos reales a la sección Obras.
- [ ] Agregar `favicon.png` y enlazarlo en `<head>`.
- [ ] Verificar contactos: WhatsApps `+54 9 261 557 4180` (Lucas) y `+54 9 261 344 6651` (Ariel) están correctos.
- [ ] Cambiar dominio del email `hola@piscinascuyo.ar` si corresponde.
- [ ] Comprimir todas las imágenes a `< 500 KB` cada una (TinyJPG / Squoosh).
