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

// --- Portion scaling -------------------------------------------------------
// Any number inside a list item scales, except sizes/temperatures/times (by unit) and "Step 2"-style references.
const FRACS = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };
const NUM = '(?:\\d+(?:\\.\\d+)?(?: ?[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛])';
const QTY_RE = new RegExp(`(?<![\\w.])(${NUM})(?:\\s*[–-]\\s*(${NUM}))?(?=\\s*([A-Za-zµ°%]*))`, 'g');
const NO_SCALE_UNIT = /^(mm|cm|m|°c?|°f|c|f|min|mins|minutes?|s|secs?|seconds?|h|hrs?|hours?|%|x|inch|inches|degrees|days?|weeks?)$/i;
const NO_SCALE_BEFORE = /\b(step|steps|fan)\s*$/i;
const SERVES_RE = /^[*_]*(?:serves|servings|portions)[*_]*:?[*_]*\s*(\d+)[^\n]*\n?/im;

function parseNum(s) {
  const m = s.replace(' ', '').match(/^(\d+(?:\.\d+)?)?([½¼¾⅓⅔⅛])?$/);
  return (m[1] ? +m[1] : 0) + (m[2] ? FRACS[m[2]] : 0);
}

// Metric amounts round to what a kitchen scale shows; spoons and counts round to quarters.
function formatQty(v, unit) {
  if (/^(kg|l)$/i.test(unit)) return String(Math.round(v * 100) / 100);
  if (/^(mg|g|ml|cl|dl)$/i.test(unit)) return String(v >= 10 ? Math.round(v) : Math.round(v * 2) / 2 || Math.round(v * 10) / 10);
  const q = v < 0.25 ? Math.round(v * 8) / 8 : Math.round(v * 4) / 4;
  if (q === 0) return '⅛';
  const whole = Math.floor(q);
  const frac = { 0: '', 0.125: '⅛', 0.25: '¼', 0.5: '½', 0.75: '¾' }[q - whole];
  return whole ? `${whole}${frac}` : frac;
}

// Wrap every scalable quantity inside list items in <span class="qty"> so it can be rewritten later.
function markQuantities(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement.closest('li') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const spans = [];
  for (const node of nodes) {
    const text = node.textContent;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(QTY_RE)) {
      const unit = m[3] || '';
      if (NO_SCALE_UNIT.test(unit) || NO_SCALE_BEFORE.test(text.slice(0, m.index))) continue;
      const span = document.createElement('span');
      span.className = 'qty';
      span.textContent = m[0];
      Object.assign(span.dataset, { orig: m[0], a: parseNum(m[1]), b: m[2] ? parseNum(m[2]) : '', unit });
      frag.append(text.slice(last, m.index), span);
      spans.push(span);
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
  return spans;
}

function scaleQuantities(spans, factor) {
  for (const s of spans) {
    const { orig, a, b, unit } = s.dataset;
    s.textContent = factor === 1 ? orig
      : formatQty(a * factor, unit) + (b ? `–${formatQty(b * factor, unit)}` : '');
    s.classList.toggle('changed', factor !== 1);
  }
}

// An ingredient is a step item that starts with a bold quantity: "**340 g** skirt steak, sliced…".
// Its name is the text up to the first comma/bracket. Same name + unit across steps are summed.
function collectIngredients(root) {
  const byKey = new Map();
  for (const li of root.querySelectorAll('.step-body li')) {
    const strong = [...li.children].find(el => el.tagName !== 'INPUT');
    if (strong?.tagName !== 'STRONG' || strong.previousSibling?.textContent.trim()) continue;
    const qm = strong.textContent.trim().match(new RegExp(`^(${NUM})(?:\\s*[–-]\\s*${NUM})?\\s*(.*)$`));
    if (!qm) continue;
    let name = '';
    for (let n = strong.nextSibling; n && n.nodeName !== 'UL'; n = n.nextSibling) name += n.textContent;
    // Cut at the first comma, unless the commas belong to an "A, B, or C" list of alternatives.
    const parts = name.split(/[(→—]/)[0].split(',');
    const orAt = parts.findIndex((p, i) => i > 0 && /^\s*or\b/.test(p));
    name = parts.slice(0, orAt > 0 ? orAt + 1 : 1).join(',').trim();
    if (!name) continue;
    const unit = qm[2];
    const isRange = /[–-]/.test(strong.textContent);
    const key = `${name.toLowerCase()}|${unit}`;
    const prev = byKey.get(key);
    if (prev && !prev.isRange && !isRange) prev.amount += parseNum(qm[1]);
    else byKey.set(prev ? `${key}|${byKey.size}` : key, { name, unit, isRange, raw: strong.textContent.trim(), amount: parseNum(qm[1]) });
  }
  return [...byKey.values()].map(i => ({
    name: i.name,
    qty: i.isRange ? i.raw : `${formatQty(i.amount, i.unit)}${i.unit ? ` ${i.unit}` : ''}`,
  }));
}

// Split the markdown into title / intro / steps using marked's token stream.
function parseRecipe(md) {
  // "**Serves:** 2" in the intro sets the base portions; the stepper replaces that line.
  const servesMatch = md.match(SERVES_RE);
  md = md.replace(SERVES_RE, '');
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
    servings: servesMatch ? +servesMatch[1] : null,
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
    <div class="servings">
      <button id="less" type="button" aria-label="Fewer">−</button>
      <span class="servings-label"></span>
      <button id="more" type="button" aria-label="More">+</button>
      <button id="servings-reset" type="button" hidden>reset</button>
    </div>
    ${recipe.introHtml.trim() ? `<div class="intro">${recipe.introHtml}</div>` : ''}
    <details class="ingredients" hidden>
      <summary>Ingredients</summary>
      <ul></ul>
    </details>
    <div class="progress"><div class="progress-bar"></div></div>
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

  // Ingredient overview, built from the step items (must run before quantities are wrapped for scaling).
  const ingredients = collectIngredients(app.querySelector('.steps'));
  const details = app.querySelector('.ingredients');
  if (ingredients.length) {
    details.hidden = false;
    details.querySelector('summary').textContent = `Ingredients (${ingredients.length})`;
    details.querySelector('ul').innerHTML = ingredients.map(i => `<li><strong>${escapeHtml(i.qty)}</strong> ${escapeHtml(i.name)}</li>`).join('');
    details.open = store.get(`ingredients-open:${slug}`, true);
    details.addEventListener('toggle', () => store.set(`ingredients-open:${slug}`, details.open));
  }

  // Servings stepper. Without a "Serves:" line we can only offer a batch multiplier.
  const qtySpans = [details, app.querySelector('.steps')].flatMap(markQuantities);
  const base = recipe.servings;
  const stepSize = base ? 1 : 0.5;
  let amount = store.get(`servings:${slug}`, base ?? 1);
  const setAmount = n => {
    amount = Math.max(stepSize, n);
    store.set(`servings:${slug}`, amount);
    scaleQuantities(qtySpans, base ? amount / base : amount);
    app.querySelector('.servings-label').innerHTML = base
      ? `<strong>${amount}</strong> ${amount === 1 ? 'serving' : 'servings'}`
      : `<strong>×${formatQty(amount, '')}</strong> batch`;
    app.querySelector('#servings-reset').hidden = amount === (base ?? 1);
  };
  document.getElementById('less').addEventListener('click', () => setAmount(amount - stepSize));
  document.getElementById('more').addEventListener('click', () => setAmount(amount + stepSize));
  document.getElementById('servings-reset').addEventListener('click', () => setAmount(base ?? 1));
  setAmount(amount);

  update();
  keepAwake();
}

(slug ? showRecipe(slug) : showIndex()).catch(err => {
  app.innerHTML = `<p>Something went wrong: ${escapeHtml(String(err))}</p>`;
});
