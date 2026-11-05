# Personal Kpop Timeline (Python)

Draws my K-pop bias timeline from three CSV files using pandas and matplotlib.

## Files

| File | What it holds |
| :--- | :--- |
| `groups.csv` | One row per group, in the order they appear top to bottom, with the small line under the name |
| `biases.csv` | One row per bias stretch. Dates are `YYYY-MM`, `end` can be `now`. Two biases at once use `\|` in `members` and `colours` (drawn as a striped bar) |
| `songs.csv` | One row per song point. Use `\|` in `label` to stack songs that share a date. Fill `dot_member` and `dot_colour` for a coloured dot with no bar |
| `kpop_timeline.ipynb` | Jupyter notebook that reads the CSVs, shows the chart and saves `personal_kpop_timeline.png` (1920x1080) and `personal_kpop_timeline_4k.png` |

## Run it

```
pip install pandas matplotlib notebook
jupyter notebook kpop_timeline.ipynb
```

Then Kernel > Restart & Run All. It also works in VS Code's notebook view.

The chart uses the Inter font if it is installed (free from Google Fonts), otherwise the default font.

## Updating it

- New bias: add a row to `biases.csv`. The stat boxes (biases, longest, current) update on their own.
- New song: add a row to `songs.csv`. Labels move sideways by themselves if they would overlap.
- New group: add a row to `groups.csv` in the spot you want it.
- Change `NOW` in the Settings cell each month.
