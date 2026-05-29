/* editor.js — Modo edición de textos para Piscinas Cuyo
 * Se activa SOLO con ?edit en la URL (los visitantes nunca lo ven).
 * - Hacés clic en cualquier texto y lo editás en la página.
 * - Se guarda automáticamente en tu navegador (localStorage).
 * - Botón "Descargar HTML" → archivo listo para publicar.
 * - Botón "Copiar cambios" → resumen antes/después para pasarle a quien publica.
 */
(function () {
  'use strict';
  if (!/[?&]edit\b/.test(location.search)) return;

  var PAGE = (location.pathname.split('/').pop() || 'index.html');
  var KEY = 'cuyo.edits.' + PAGE;

  // Elementos de texto editables (cubre index y subpáginas)
  var SELECTORS = [
    '.hero__eyebrow', '.hero__title .l1', '.hero__title .l2', '.hero__sub', '.hero__scroll',
    '.marquee__item', '.stat__label', '.stat__desc',
    '.manifesto__label', '.manifesto__text', '.manifesto__sign',
    '.sec__title', '.sec__eyebrow',
    '.nos-lead', '.mv-card__eye', '.mv-card__title', '.mv-card__text',
    '.valor__name', '.valor__text', '.styles__group',
    '.style-card__name', '.style-card__desc', '.style-card__meta span',
    '.proc-step__name', '.proc-step__desc',
    '.gal-item__name', '.gal-item__loc',
    '.obra__name', '.obra__meta span', '.obra__badge', '.obra__id',
    '.feat-card__eye', '.feat-card__lead', '.feat-card__badge', '.feat-specs dt', '.feat-specs dd',
    '.testi__quote', '.testi__by',
    '.contact__title', '.contact__lead', '.agent__role', '.agent__name', '.agent__phone',
    '.foot__brand p', '.foot__col h5', '.foot__bottom span',
    '.lp-hero__eyebrow', '.lp-hero__title', '.lp-hero__sub',
    '.lp-card__title', '.lp-card__desc', '.lp-narrative__text', '.lp-narrative__label',
    '.lp-cta__title', '.footer__col h4', '.footer__col p'
  ].join(',');

  function init() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(SELECTORS));
    var els = nodes.filter(function (el) {
      return el.textContent.trim().length > 0 && !el.closest('#cuyo-edit-panel');
    });
    if (!els.length) return;

    // Firmar cada elemento y guardar su contenido original
    els.forEach(function (el, i) {
      el.setAttribute('data-edit-i', i);
      el.setAttribute('data-orig', el.innerHTML);
    });

    // Restaurar ediciones guardadas
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    els.forEach(function (el) {
      var i = el.getAttribute('data-edit-i');
      if (saved[i] != null) el.innerHTML = saved[i];
    });

    // Estilos del modo edición
    var st = document.createElement('style');
    st.id = 'cuyo-edit-style';
    st.textContent = [
      '.cuyo-editable{outline:1px dashed rgba(207,233,232,.45);outline-offset:3px;',
      '  cursor:text;border-radius:2px;transition:outline-color .2s,background .2s}',
      '.cuyo-editable:hover{outline-color:#e0c79a;background:rgba(224,199,154,.06)}',
      '.cuyo-editable:focus{outline:2px solid #e0c79a;background:rgba(224,199,154,.1)}',
      '#cuyo-edit-panel{position:fixed;left:16px;bottom:16px;z-index:99999;',
      '  background:rgba(8,18,14,.96);backdrop-filter:blur(12px);color:#f3efe4;',
      "  font-family:'Inter Tight',system-ui,sans-serif;font-size:12px;",
      '  padding:14px 16px;border-radius:12px;width:260px;',
      '  box-shadow:0 18px 50px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.08)}',
      '#cuyo-edit-panel h4{font-size:10px;letter-spacing:.28em;text-transform:uppercase;',
      '  color:#e0c79a;margin:0 0 4px;font-weight:600}',
      '#cuyo-edit-panel p{margin:0 0 12px;color:rgba(243,239,228,.6);line-height:1.4;font-size:11px}',
      '#cuyo-edit-panel button{display:block;width:100%;margin:6px 0;padding:9px 10px;',
      '  font:inherit;font-size:11.5px;letter-spacing:.04em;border-radius:7px;cursor:pointer;',
      '  background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#f3efe4;',
      '  transition:background .2s}',
      '#cuyo-edit-panel button:hover{background:rgba(224,199,154,.22);border-color:rgba(224,199,154,.5)}',
      '#cuyo-edit-panel button.primary{background:#cfe9e8;color:#03131e;border-color:#cfe9e8;font-weight:600}',
      '#cuyo-edit-panel .count{color:#cfe9e8;font-weight:600}'
    ].join('');
    document.head.appendChild(st);

    // Hacer editables
    els.forEach(function (el) {
      el.setAttribute('contenteditable', 'true');
      el.spellcheck = false;
      el.classList.add('cuyo-editable');
      el.addEventListener('input', persist);
      el.addEventListener('blur', persist);
      // Enter = salto de línea controlado, no enviar formularios ni romper
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { /* permitir <br> natural */ }
      });
    });

    // Evitar que los links naveguen mientras se edita
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a && !e.target.closest('#cuyo-edit-panel')) { e.preventDefault(); }
    }, true);

    function persist() {
      var data = {};
      els.forEach(function (el) {
        var i = el.getAttribute('data-edit-i');
        if (el.innerHTML !== el.getAttribute('data-orig')) data[i] = el.innerHTML;
      });
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
      updateCount();
    }

    // Panel flotante
    var panel = document.createElement('div');
    panel.id = 'cuyo-edit-panel';
    panel.innerHTML =
      '<h4>Modo edición</h4>' +
      '<p>Hacé clic en cualquier texto y editalo. Cambios: <span class="count" id="cuyo-count">0</span></p>' +
      '<button class="primary" id="cuyo-download">⬇ Descargar HTML</button>' +
      '<button id="cuyo-copy">📋 Copiar cambios</button>' +
      '<button id="cuyo-reset">↺ Reiniciar</button>' +
      '<button id="cuyo-exit">✕ Salir del modo edición</button>';
    document.body.appendChild(panel);

    function updateCount() {
      var n = 0;
      els.forEach(function (el) {
        if (el.innerHTML !== el.getAttribute('data-orig')) n++;
      });
      var c = document.getElementById('cuyo-count');
      if (c) c.textContent = n;
    }
    updateCount();

    // Descargar HTML limpio (sin rastros del editor)
    document.getElementById('cuyo-download').addEventListener('click', function () {
      var clone = document.documentElement.cloneNode(true);
      var p = clone.querySelector('#cuyo-edit-panel'); if (p) p.remove();
      var s = clone.querySelector('#cuyo-edit-style'); if (s) s.remove();
      var sc = clone.querySelector('script[src*="editor.js"]'); if (sc) sc.remove();
      clone.querySelectorAll('[data-edit-i]').forEach(function (el) {
        el.removeAttribute('data-edit-i');
        el.removeAttribute('data-orig');
        el.removeAttribute('contenteditable');
        el.removeAttribute('spellcheck');
        el.classList.remove('cuyo-editable');
        if (el.getAttribute('class') === '') el.removeAttribute('class');
      });
      var html = '<!doctype html>\n' + clone.outerHTML;
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = PAGE;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });

    // Copiar resumen de cambios
    document.getElementById('cuyo-copy').addEventListener('click', function () {
      var out = ['CAMBIOS DE TEXTO — ' + PAGE, ''];
      var n = 0;
      els.forEach(function (el) {
        var orig = el.getAttribute('data-orig').replace(/<[^>]+>/g, '').trim();
        var now = el.innerHTML.replace(/<[^>]+>/g, '').trim();
        if (orig !== now) {
          n++;
          out.push('• ANTES: ' + orig);
          out.push('  AHORA: ' + now);
          out.push('');
        }
      });
      if (!n) out.push('(sin cambios todavía)');
      var txt = out.join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
        .then(function () { flash('cuyo-copy', '✓ Copiado'); })
        .catch(function () { window.prompt('Copiá los cambios:', txt); });
    });

    // Reiniciar
    document.getElementById('cuyo-reset').addEventListener('click', function () {
      if (!window.confirm('¿Descartar todos los cambios de esta página?')) return;
      try { localStorage.removeItem(KEY); } catch (e) {}
      els.forEach(function (el) { el.innerHTML = el.getAttribute('data-orig'); });
      updateCount();
    });

    // Salir
    document.getElementById('cuyo-exit').addEventListener('click', function () {
      location.href = location.pathname;
    });

    function flash(id, txt) {
      var b = document.getElementById(id); if (!b) return;
      var o = b.textContent; b.textContent = txt;
      setTimeout(function () { b.textContent = o; }, 1400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
