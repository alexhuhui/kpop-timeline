# Personal Kpop Timeline

My K-pop bias timeline since 2018, drawn from three CSV files.

- **Website:** https://alexhuhui.github.io/kpop-timeline/ — zoom, pan, and tap a song to watch it on YouTube.
- **Images:** `personal_kpop_timeline.png` (1920x1080) and `personal_kpop_timeline_4k.png`, made by the notebook.

The website and the notebook read the same files, so they always show the same data.

## Files

| File | What it holds |
| :--- | :--- |
| `settings.json` | Title, subtitle, author, footer text, the first and last year, and `now` (the last month on the chart) |
| `groups.csv` | One row per group, in the order they appear top to bottom, with the small line under the name |
| `biases.csv` | One row per bias stretch. Dates are `YYYY-MM`, `end` can be `now`. Two biases at once use `\|` in `members` and `colours` (drawn as a striped bar) |
| `songs.csv` | One row per song point. Use `\|` in `label` to stack songs that share a date, and the same number of `\|` parts in `youtube`. Fill `dot_member` and `dot_colour` for a coloured dot with no bar |
| `index.html`, `app.js`, `style.css` | The website |
| `kpop_timeline.ipynb` | Jupyter notebook that makes the PNG images |

## Updating it

- **Each month:** change `now` (and `date_line`) in `settings.json`.
- **New bias:** add a row to `biases.csv`. The stat boxes (biases, longest, current) update on their own.
- **New song:** add a row to `songs.csv`. Put the video link in `youtube` (`https://www.youtube.com/watch?v=...`). Leave it empty if there is no video. Only YouTube links are used; anything else is ignored.
- **New group:** add a row to `groups.csv` in the spot you want it.

Push to `main` and the website updates in about a minute (GitHub Actions, `.github/workflows/pages.yml`).

## Preview the website

The page loads the CSV files, so it needs a small local server (opening `index.html` directly will not work):

```
python -m http.server 8000 --bind 127.0.0.1
```

Then open http://localhost:8000.

## Make the images

```
pip install pandas matplotlib notebook
jupyter notebook kpop_timeline.ipynb
```

Then Kernel > Restart & Run All. It also works in VS Code's notebook view.
The chart uses the Inter font if it is installed on your computer (free from Google Fonts), otherwise Segoe UI or Arial.
