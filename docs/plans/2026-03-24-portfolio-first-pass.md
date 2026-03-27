# Portfolio First Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up legacy files, add favicon, and add a per-robot About section to the playground panel.

**Architecture:** All changes are to the static site only — no build step, no dependencies added.
Robot metadata (description, GitHub URL) lives in each robot's config file (`js/robots/*.js`).
`main.js` reads that metadata and injects it into a new About collapsible in the panel on every robot switch.

**Tech Stack:** Vanilla JS (ES modules), Three.js r128 (CDN global), plain CSS, static GitHub Pages

---

### Task 1: Delete legacy root-level files

These files (`lekiwi.html/css/js`, `akros.html/css/js`, `kr0003.html/css/js`) were the original
per-robot pages used for reference only. They are not linked from `index.html` and must be removed.

**Files:**
- Delete: `lekiwi.html`, `lekiwi.css`, `lekiwi.js`
- Delete: `akros.html`, `akros.css`, `akros.js`
- Delete: `kr0003.html`, `kr0003.css`, `kr0003.js`

**Step 1: Delete the files**

```bash
rm lekiwi.html lekiwi.css lekiwi.js
rm akros.html akros.css akros.js
rm kr0003.html kr0003.css kr0003.js
```

**Step 2: Verify nothing in the active codebase references them**

```bash
grep -r "lekiwi\.html\|akros\.html\|kr0003\.html\|lekiwi\.js\|akros\.js\|kr0003\.js\|lekiwi\.css\|akros\.css\|kr0003\.css" --include="*.html" --include="*.js" --include="*.css" .
```

Expected: no output (zero matches).

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove legacy per-robot HTML/CSS/JS files"
```

---

### Task 2: Add favicon

**Files:**
- Create: `assets/kamath_robotics_favicon.svg` (copy from source)
- Modify: `index.html` — `<head>` section

**Step 1: Copy the favicon into the repo**

```bash
cp "/Users/adityakamath/Documents/Kamath Robotics/Assets/kamath_robotics_favicon.svg" assets/kamath_robotics_favicon.svg
```

**Step 2: Add the favicon link to `index.html`**

In `index.html`, inside `<head>`, after the existing `<meta>` tags and before `<title>`, add:

```html
  <link rel="icon" type="image/svg+xml" href="assets/kamath_robotics_favicon.svg">
```

So the head reads:
```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="assets/kamath_robotics_favicon.svg">
  <title>Robot Playground — Kamath Robotics</title>
  <link rel="stylesheet" href="css/style.css">
</head>
```

**Step 3: Verify**

Open the site in the browser. The browser tab should show the Kamath Robotics favicon.

**Step 4: Commit**

```bash
git add assets/kamath_robotics_favicon.svg index.html
git commit -m "feat: add Kamath Robotics favicon"
```

---

### Task 3: Add `about` metadata to each robot config

Each robot's config file gets an `about` object with a `description` (HTML string, may contain
anchor tags) and a `githubUrl`. Use dummy/placeholder text for now — marked clearly with a
`// TODO(portfolio):` comment so they're easy to find and replace later.

**Files:**
- Modify: `js/robots/lekiwi.js`
- Modify: `js/robots/kr003.js`
- Modify: `js/robots/akros.js`

**Step 1: Add `about` to `js/robots/lekiwi.js`**

Inside the `config` object, after `kinematics`, add:

```js
  // TODO(portfolio): replace dummy description and confirm githubUrl before launch
  about: {
    description: 'LeKiwi is a low-cost, open-source omnidirectional mobile robot built on a three-wheel holonomic drive. Designed for research and education, it uses custom 3D-printed parts and off-the-shelf components, and runs fully on <a href="https://ros.org" target="_blank">ROS 2</a>.',
    githubUrl:   'https://github.com/adityakamath/lekiwi_ros2',
  },
```

**Step 2: Add `about` to `js/robots/kr003.js`**

Inside the `config` object, after `kinematics`, add:

```js
  // TODO(portfolio): replace dummy description and confirm githubUrl before launch
  about: {
    description: 'KR003 is a compact four-wheel mecanum drive robot designed for indoor navigation research. Its holonomic drive allows full omnidirectional movement without turning, making it ideal for tight-space autonomy experiments.',
    githubUrl:   'https://github.com/adityakamath/kr0003_description',
  },
```

**Step 3: Add `about` to `js/robots/akros.js`**

Inside the `config` object, after `kinematics`, add:

```js
  // TODO(portfolio): replace dummy description and confirm githubUrl before launch
  about: {
    description: 'AKROS is a mid-size mecanum-drive research platform built for ROS 2 navigation and manipulation experiments. It features a modular sensor suite and is designed to support rapid hardware iteration.',
    githubUrl:   'https://github.com/adityakamath/akros2',
  },
```

**Step 4: Commit**

```bash
git add js/robots/lekiwi.js js/robots/kr003.js js/robots/akros.js
git commit -m "feat: add placeholder About metadata to all robot configs"
```

---

### Task 4: Add About section HTML to `index.html`

**Files:**
- Modify: `index.html`

**Step 1: Add the About collapsible block**

In `index.html`, after the closing `</div>` of `#viewSection` and before `<div id="loadingStatus">`,
insert:

```html
    <!-- About section — collapsed by default; content injected by main.js on robot switch -->
    <div class="collapsible" id="aboutSection">
      <div class="collapsible-header">
        <span>About</span>
        <span class="collapsible-icon">▾</span>
      </div>
      <div class="collapsible-content">
        <p id="aboutDescription" class="about-description"></p>
        <a id="aboutGithub" href="#" target="_blank" class="github-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
          View on GitHub
        </a>
      </div>
    </div>
```

**Step 2: Verify HTML is well-formed**

Open the browser. The panel should show three collapsible sections: CONTROLS, VIEW, ABOUT.
ABOUT should be collapsed by default. Clicking its header should expand/collapse it
(the existing `querySelectorAll('.collapsible-header')` listener in `main.js` picks it up automatically).

---

### Task 5: Style the About section in `css/style.css`

**Files:**
- Modify: `css/style.css`

**Step 1: Add About section styles**

At the end of `css/style.css`, append:

```css
/* ── About section ── */
.about-description {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.55;
  margin: 0 0 10px 0;
}

.about-description a {
  color: rgba(2, 210, 210, 0.9);
  text-decoration: none;
  transition: color 0.15s;
}

.about-description a:hover {
  color: rgba(2, 230, 230, 1);
}

.github-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 5px 0;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  text-decoration: none;
  font-size: 11px;
  font-family: Arial, sans-serif;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.github-button:hover {
  background: rgba(255, 255, 255, 0.16);
  color: white;
}

.github-button svg {
  flex-shrink: 0;
}
```

**Step 2: Verify visually**

Expand the About section in the browser. The paragraph should be readable at 11px with 1.55
line height. The GitHub button should match the style of the Axes/Grid/Reset buttons. Any links
in the description text should be teal-coloured.

---

### Task 6: Wire up About content updates in `main.js`

**Files:**
- Modify: `js/main.js`

**Step 1: Add About section update inside `loadRobot()`**

In `js/main.js`, inside `loadRobot()`, after the line `applyProfile(entry.inputProfile);`, add:

```js
  // Update About section with per-robot metadata
  const aboutDesc  = document.getElementById('aboutDescription');
  const aboutGh    = document.getElementById('aboutGithub');
  if (aboutDesc) aboutDesc.innerHTML = entry.config.about.description;
  if (aboutGh)   aboutGh.href        = entry.config.about.githubUrl;
```

**Step 2: Verify behaviour**

1. Load the page — LeKiwi About content should appear immediately (LeKiwi is the default robot).
2. Switch to KR003 — About content should update without a page reload.
3. Switch to AKROS — same.
4. Expand the About section and switch robots — content updates while section stays open.

**Step 3: Commit everything**

```bash
git add index.html css/style.css js/main.js
git commit -m "feat: add per-robot About section with GitHub link to control panel"
```

---

### Task 7: Smoke test the full first pass

**Step 1: Confirm no legacy files remain**

```bash
ls lekiwi.html akros.html kr0003.html 2>&1
```
Expected: `No such file or directory` for all three.

**Step 2: Confirm favicon appears**

Open the site. Check the browser tab for the Kamath Robotics favicon.

**Step 3: Confirm About section works end-to-end**

- Select each robot from the dropdown
- Expand About for each — correct description and GitHub URL for each
- Click the GitHub button — opens the correct repo in a new tab
- Collapse/expand About — chevron animates correctly

**Step 4: Final commit if anything was missed**

```bash
git status   # should be clean
```
