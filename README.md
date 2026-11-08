# Recipes

My recipes, published at **https://yoorkevich.github.io/recipes/**.

## Adding a recipe

1. **Collect the source.** A video, website, cookbook photo, PDF or your own notes.
2. **Convert it** to `recipes/<slug>.md` using [`TEMPLATE.md`](TEMPLATE.md) and the conventions below.
   Easiest: give the source to Claude Code in this repo and ask it to add the recipe (it reads `CLAUDE.md`).
   `<slug>` is lowercase-with-dashes, e.g. `beef-and-broccoli`.
3. **Check it.** Every quantity converted, nothing missing, steps in cooking order.
4. *(Optional)* add `recipes/<slug>.pdf`. It gets linked from the recipe page.
5. **Publish:** `git add . && git commit -m "Add <recipe>" && git push`. The GitHub Action rebuilds the index and the site updates in about 30 s.

## Recipe conventions

### Units: EU metric

| What | Unit | Notes |
|---|---|---|
| Solids (meat, veg, sugar, flour, spices) | **g** | Weigh everything that can be weighed |
| Liquids (soy sauce, oil, wine, water, stock) | **ml** | |
| Small amounts | **g** or **ml**, with the spoon in brackets | `**5 ml** sesame oil *(1 tsp)*`. 1 tsp = 5 ml, 1 tbsp = 15 ml |
| Temperature | **°C** | Oven: say if fan (`200 °C, fan 180 °C`). Stovetop: describe heat (`high heat`) |
| Length / thickness | **mm**, **cm** | `sliced ~6 mm thick`, `2.5 cm pieces` |
| Time | **min** / **s** | Give a visual cue too: `2–3 min, until golden` |
| Counts | plain numbers | `3–4 medium cloves`, `1 egg` |

- Never use cups, oz, lb, °F or inches. Convert American recipes (1 cup ≈ 240 ml; weigh dry ingredients rather than converting cups).
- Use decimal points (`1.5 g`) and a dash for ranges (`3–4`).
- Round to amounts you can measure on a kitchen scale: whole grams above 10 g, 0.5 g below that.
- Salt: say which kind, because volumes differ (`½ tsp kosher salt *(or ¼ tsp fine table salt)*`).

### Portions

- Every recipe states its base portions on its own line right after the title: `**Serves:** 2`. The site turns this into a − / + stepper.
- When you change portions, **every number in an ingredient line scales**, except sizes, temperatures and times (`mm`, `cm`, `°C`, `min`, `s`, `h`, `%`) and step references (`Step 2`).
  - So write counts as numbers (`**2** eggs`, `½ onion`) and anything that must *not* scale in words: `*(one per bowl)*`, not `*(1 per bowl)*`.
  - Scaled grams/ml round to whole numbers (half units below 10); spoons and counts round to the nearest ¼.
- Without a `Serves:` line the stepper becomes a batch multiplier (×½, ×1, ×1½…).

### Structure

- `# Title`: the dish name, in title case. Then the `**Serves:**` line.
- **Intro** (optional, before the first step): servings, total time, notes on equipment or substitutions.
- `## Step name`: one step per stage of cooking. **The ingredients for a step go inside that step** (mise en place style), so you never need to scroll back to an ingredients list.
  - Add a short hint in italics if useful: `## Sauce *(mix in a small bowl)*`.
  - The site numbers steps automatically; a `Step 3 —` prefix is optional.
- `- [ ] **quantity** ingredient, prep *(alternative measure / note)*`: one checkbox per ingredient or action.
  - Quantity first and **bold**, prep after a comma, notes in *(italics)*.
  - Plain sub-bullets under an item are shown as notes, e.g. how to cut something.
  - Refer back to earlier steps by name: `- [ ] → add the **Sauce** (Step 2)`.
- Separate steps with `---` so the raw file and the PDF stay readable.

### How it shows on the site

| Markdown | On the site |
|---|---|
| `# Title` (first line) | Recipe title and index entry |
| Text before the first `##` | Intro shown above the steps |
| `## Step name` | One step card |
| `- [ ] **qty** name, prep…` inside a step | Also listed in the **Ingredients** box at the top (name = text up to the first comma or bracket; same name + unit across steps is summed) |
| `- [ ] item` inside a step | Tickable item. Ticking the last one folds the card away and moves to the next step |
| `---` | Ignored (cards already separate steps) |

Steps without checkboxes get a **Done with this step** button instead. Tap a finished step to reopen it.
Progress is saved per device, and the screen stays on while a recipe is open.

## Previewing locally

```sh
echo '[{"slug":"beef-and-broccoli","title":"Beef and Broccoli"}]' > recipes.json   # list the recipes you want to see
python -m http.server
```

Then open http://localhost:8000. (`recipes.json` is generated at deploy time and git-ignored.)
