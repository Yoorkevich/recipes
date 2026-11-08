# Recipes repo

Static recipe site on GitHub Pages. Each recipe is one Markdown file in `recipes/`; the site (`index.html`, `app.js`, `style.css`) renders it client-side as step cards. There is no build step except `.github/workflows/pages.yml`, which generates `recipes.json` on deploy.

## When asked to add or convert a recipe

1. Follow `TEMPLATE.md` and **every rule in the "Recipe conventions" section of `README.md`**. In particular: EU metric units only (g, ml, °C, mm/cm), spoon measures only as a bracketed secondary, each step lists the ingredients it uses, and a `**Serves:** N` line after the title (write numbers that must not scale with portions in words).
2. Save as `recipes/<slug>.md` (lowercase, dashes).
3. Show the user the converted recipe and point out any conversions or guesses (e.g. cups → grams, missing quantities) before committing.
4. Commit and push to `main` only when the user confirms.
