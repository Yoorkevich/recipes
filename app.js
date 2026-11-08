// Single-page recipe viewer.
//   index.html               -> list of recipes (from recipes.json, generated at deploy)
//   index.html?r=<slug>      -> renders recipes/<slug>.md
const app = document.getElementById('app');
const slug = new URLSearchParams(location.search).get('r');

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function showIndex() {
  const res = await fetch('recipes.json', { cache: 'no-cache' });
  const recipes = res.ok ? await res.json() : [];
  recipes.sort((a, b) => a.title.localeCompare(b.title));
  app.innerHTML = `
    <h1>Recipes</h1>
    <input id="search" type="search" placeholder="Search…" autocomplete="off">
    <ul class="recipe-list">
      ${recipes.map(r => `<li data-title="${escapeHtml(r.title.toLowerCase())}">
        <a href="?r=${encodeURIComponent(r.slug)}">${escapeHtml(r.title)}</a></li>`).join('')}
    </ul>`;
  document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    app.querySelectorAll('.recipe-list li').forEach(li => { li.hidden = !li.dataset.title.includes(q); });
  });
}

async function showRecipe(slug) {
  const res = await fetch(`recipes/${encodeURIComponent(slug)}.md`, { cache: 'no-cache' });
  if (!res.ok) { app.innerHTML = `<p><a href="./">← All recipes</a></p><p>Recipe not found.</p>`; return; }
  const md = await res.text();
  const title = (md.match(/^#\s+(.+)$/m) || [, slug])[1];
  document.title = title;

  // A PDF with the same slug is optional; link it only if it exists.
  const pdf = `recipes/${encodeURIComponent(slug)}.pdf`;
  const hasPdf = (await fetch(pdf, { method: 'HEAD' })).ok;

  app.innerHTML = `
    <nav class="toolbar">
      <a href="./">← All recipes</a>
      <span>
        ${hasPdf ? `<a href="${pdf}">PDF</a>` : ''}
        <button id="reset" type="button">Clear checks</button>
      </span>
    </nav>
    <article>${marked.parse(md)}</article>`;

  // marked renders task lists as disabled checkboxes; make them usable and remember state.
  const key = `checks:${slug}`;
  const saved = new Set(store.get(key));
  const boxes = [...app.querySelectorAll('article input[type=checkbox]')];
  boxes.forEach((box, i) => {
    box.disabled = false;
    box.checked = saved.has(i);
    box.closest('li').classList.add('task');
    box.closest('li').classList.toggle('done', box.checked);
    box.addEventListener('change', () => {
      box.checked ? saved.add(i) : saved.delete(i);
      box.closest('li').classList.toggle('done', box.checked);
      store.set(key, [...saved]);
    });
  });
  document.getElementById('reset').addEventListener('click', () => {
    saved.clear();
    store.set(key, []);
    boxes.forEach(b => { b.checked = false; b.closest('li').classList.remove('done'); });
  });
}

(slug ? showRecipe(slug) : showIndex()).catch(err => {
  app.innerHTML = `<p>Something went wrong: ${escapeHtml(String(err))}</p>`;
});
