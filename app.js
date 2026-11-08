// Single-page recipe viewer.
//   index.html               -> list of recipes (from recipes.json, generated at deploy)
//   index.html?r=<slug>      -> renders recipes/<slug>.md as step cards
//
// Recipe format: "# Title", optional intro, then one "## Heading" per step.
// "- [ ]" items inside a step are tickable; a step collapses once all are ticked (or "Done" is pressed).
const app = document.getElementById('app');
const slug = new URLSearchParams(location.search).get('r');

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
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

// Split the markdown into title / intro / steps using marked's token stream.
function parseRecipe(md) {
  const tokens = marked.lexer(md);
  const render = toks => { toks.links = tokens.links; return marked.parser(toks); };
  let title = null;
  const intro = [];
  const steps = [];
  for (const t of tokens) {
    if (t.type === 'heading' && t.depth === 1 && title === null) { title = t.text; continue; }
    if (t.type === 'hr') continue; // cards already separate steps
    if (t.type === 'heading' && t.depth === 2) {
      // The app numbers steps itself, so drop a leading "Step 3 —" from the heading.
      steps.push({ title: t.text.replace(/^step\s*\d+\s*[—–:.-]?\s*/i, ''), body: [] });
      continue;
    }
    (steps.length ? steps[steps.length - 1].body : intro).push(t);
  }
  return {
    title: title ?? slug,
    introHtml: render(intro),
    steps: steps.map(s => ({ titleHtml: marked.parseInline(s.title), bodyHtml: render(s.body) })),
  };
}

// Keep the screen on while a recipe is open (silently unsupported on some browsers).
async function keepAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (slug && document.visibilityState === 'visible') keepAwake();
});

async function showRecipe(slug) {
  const res = await fetch(`recipes/${encodeURIComponent(slug)}.md`, { cache: 'no-cache' });
  if (!res.ok) { app.innerHTML = `<p><a href="./">← All recipes</a></p><p>Recipe not found.</p>`; return; }
  const recipe = parseRecipe(await res.text());
  document.title = recipe.title;

  // A PDF with the same slug is optional; link it only if it exists.
  const pdf = `recipes/${encodeURIComponent(slug)}.pdf`;
  const hasPdf = (await fetch(pdf, { method: 'HEAD' })).ok;

  app.innerHTML = `
    <nav class="toolbar">
      <a href="./">← All recipes</a>
      <span>
        ${hasPdf ? `<a href="${pdf}">PDF</a>` : ''}
        <button id="reset" type="button">Start over</button>
      </span>
    </nav>
    <h1>${escapeHtml(recipe.title)}</h1>
    <div class="progress"><div class="progress-bar"></div></div>
    ${recipe.introHtml.trim() ? `<div class="intro">${recipe.introHtml}</div>` : ''}
    <div class="steps">
      ${recipe.steps.map((s, i) => `
        <section class="step" data-step="${i}">
          <button class="step-head" type="button" aria-expanded="true">
            <span class="step-num">${i + 1}</span>
            <span class="step-title">${s.titleHtml}</span>
            <span class="step-count"></span>
          </button>
          <div class="step-body">
            ${s.bodyHtml}
            <button class="step-done" type="button"></button>
          </div>
        </section>`).join('')}
    </div>
    <p class="finished" hidden>All steps done. Enjoy! 🍽️</p>`;

  // Progress = ticked item ids ("step:item") + steps explicitly marked done (needed for steps without checkboxes).
  const key = `progress:${slug}`;
  const saved = store.get(key, {});
  const checked = new Set(saved.checked ?? []);
  const done = new Set(saved.done ?? []);
  const open = new Set(); // completed steps the user re-expanded; not persisted
  const save = () => store.set(key, { checked: [...checked], done: [...done] });

  const cards = [...app.querySelectorAll('.step')].map((el, i) => {
    const boxes = [...el.querySelectorAll('.step-body input[type=checkbox]')];
    boxes.forEach((box, j) => {
      const id = `${i}:${j}`;
      box.disabled = false;
      box.checked = checked.has(id);
      box.closest('li').classList.add('task');
      box.addEventListener('change', () => {
        box.checked ? checked.add(id) : (checked.delete(id), done.delete(i));
        save();
        // Give the tick a moment to register visually before the card folds away.
        if (isComplete(i)) { open.delete(i); setTimeout(() => update(true), 450); } else update();
      });
    });
    return { el, boxes };
  });

  const isComplete = i => done.has(i) || (cards[i].boxes.length > 0 && cards[i].boxes.every(b => b.checked));

  function update(advance = false) {
    const current = cards.findIndex((_, i) => !isComplete(i));
    cards.forEach(({ el, boxes }, i) => {
      const complete = isComplete(i);
      const expanded = !complete || open.has(i);
      el.classList.toggle('complete', complete);
      el.classList.toggle('current', i === current);
      el.classList.toggle('collapsed', !expanded);
      el.querySelector('.step-head').setAttribute('aria-expanded', expanded);
      el.querySelector('.step-num').textContent = complete ? '✓' : i + 1;
      boxes.forEach(b => b.closest('li').classList.toggle('done', b.checked));
      const ticked = boxes.filter(b => b.checked).length;
      el.querySelector('.step-count').textContent = complete ? '' : boxes.length ? `${ticked}/${boxes.length}` : '';
      el.querySelector('.step-done').textContent = complete ? 'Not done yet' : 'Done with this step ✓';
    });
    const completed = cards.filter((_, i) => isComplete(i)).length;
    app.querySelector('.progress-bar').style.width = `${cards.length ? (100 * completed) / cards.length : 0}%`;
    app.querySelector('.finished').hidden = completed < cards.length;
    if (advance && current >= 0) cards[current].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  cards.forEach(({ el, boxes }, i) => {
    el.querySelector('.step-head').addEventListener('click', () => {
      if (!isComplete(i)) return;
      open.has(i) ? open.delete(i) : open.add(i);
      update();
    });
    el.querySelector('.step-done').addEventListener('click', () => {
      if (isComplete(i)) {
        done.delete(i);
        boxes.forEach((b, j) => { b.checked = false; checked.delete(`${i}:${j}`); });
        open.delete(i);
        update();
      } else {
        done.add(i);
        boxes.forEach((b, j) => { b.checked = true; checked.add(`${i}:${j}`); });
        open.delete(i);
        update(true);
      }
      save();
    });
  });

  document.getElementById('reset').addEventListener('click', () => {
    checked.clear(); done.clear(); open.clear(); save();
    cards.forEach(({ boxes }) => boxes.forEach(b => { b.checked = false; }));
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  update();
  keepAwake();
}

(slug ? showRecipe(slug) : showIndex()).catch(err => {
  app.innerHTML = `<p>Something went wrong: ${escapeHtml(String(err))}</p>`;
});
