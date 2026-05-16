# Boxplot Shift Lab

An interactive web app for comparing two groups with draggable boxplots, dot plots, overlap/shift checks, and skewness visualization.

## Overview

Boxplot Shift Lab helps students explore how two distributions compare. Users can adjust the minimum, lower quartile, median, upper quartile, and maximum for each group, then check whether the two groups show overlap or shift.

The example data is based on a comparison of female and male kiwi weights. The original kilogram values are mapped onto a 0-100 display scale for easier interaction.

## Features

- Draggable boxplots for Group A and Group B
- Adjustable min, Q1, median, Q3, and max handles
- Dot plots shown above each boxplot
- Automatic skewness labels: left skew, right skew, or roughly symmetric
- A Check button that reveals whether the groups show overlap or shift
- Transparent highlight bands for overlap and shift
- Reset button to restore the original example data
- No build step required

## Files

- `index.html` - page structure
- `styles.css` - visual styling
- `script.js` - chart rendering and interaction logic
- `README.md` - project documentation

## Run Locally

Open `index.html` directly in a browser, or start a simple local server:

```bash
python3 -m http.server 4173
```

Then visit:

```text
http://127.0.0.1:4173/index.html
```

## Deploy to GitHub Pages

1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, `script.js`, and `README.md` to the repository root.
3. Go to `Settings` -> `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select the `main` branch and the `/root` folder.
6. Save the settings.

After GitHub finishes publishing, the app will be available at a URL like:

```text
https://your-username.github.io/your-repository-name/
```

## Purpose

This project is designed as a visual learning tool for understanding distribution comparison, especially the ideas of overlap, shift, and skewness in boxplots.
