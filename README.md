# Recipes

My recipes, published at **https://yoorkevich.github.io/recipes/**.

## Adding a recipe

1. Add `recipes/<slug>.md` — the first `# Heading` becomes its title.
   Use `- [ ]` task lists for ingredients/steps; they become tickable checkboxes on the site.
2. Optionally add `recipes/<slug>.pdf` — it gets linked from the recipe page.
3. Commit and push to `main`. The GitHub Action rebuilds the index and deploys.

## Previewing locally

```sh
echo '[{"slug":"beef-and-broccoli","title":"Beef and Broccoli"}]' > recipes.json   # or any list
python -m http.server
```

Then open http://localhost:8000. (`recipes.json` is generated at deploy time and git-ignored.)
