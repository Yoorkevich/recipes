# Recipes

My recipes, published at **https://yoorkevich.github.io/recipes/**.

## Recipe format

Every recipe is one Markdown file following [`TEMPLATE.md`](TEMPLATE.md):

| Markdown | On the site |
|---|---|
| `# Title` (first line) | Recipe title and index entry |
| Text before the first `##` | Intro shown above the steps |
| `## Step name` | One step card. The site numbers them, so a `Step 3 —` prefix is optional and gets removed |
| `- [ ] item` inside a step | Tickable item. Ticking the last one folds the card away and moves to the next step |
| `---` | Ignored on the site (cards already separate steps) but keeps the raw file / PDF readable |

Steps without checkboxes get a **Done with this step** button instead. Tap a finished step to reopen it.
Progress is saved per device, and the screen stays on while a recipe is open.

## Adding a recipe

1. Copy `TEMPLATE.md` to `recipes/<slug>.md` and fill it in.
2. Optionally add `recipes/<slug>.pdf` — it gets linked from the recipe page.
3. Commit and push to `main`. The GitHub Action rebuilds the index and deploys.

## Previewing locally

```sh
echo '[{"slug":"beef-and-broccoli","title":"Beef and Broccoli"}]' > recipes.json   # or any list
python -m http.server
```

Then open http://localhost:8000. (`recipes.json` is generated at deploy time and git-ignored.)
