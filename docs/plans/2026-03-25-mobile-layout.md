# Mobile Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Responsive mobile layout (≤767px) — fullscreen 3D canvas, fixed top bar with robot selector, collapsible bottom sheet with VIEW buttons, Kamath Robotics logo in footer; CONTROLS section hidden; telemetry hidden.

**Architecture:** Pure CSS `@media (max-width: 767px)` overrides — zero impact on desktop. New mobile-only DOM elements (`#mobile-topbar`, `#bottom-sheet`) added to `index.html` and hidden on desktop via CSS. Mobile robot selector is a duplicate `<select>` kept in sync via JS. Bottom sheet slides via `transform: translateY` transition. Future touch joystick slots into `#sheet-content` with no structural changes.

**Tech Stack:** Vanilla JS, CSS media queries, no build system, static HTML.

---

### Task 1: Add mobile HTML elements to index.html

**Files:**
- Modify: `index.html:10` (add `#mobile-topbar` after `<body>`)
- Modify: `index.html:130` (add `#bottom-sheet` before `<footer>`)

**Step 1: Add `#mobile-topbar` after the opening `<body>` tag (line 10), before `<div id="canvas-container">`**

```html
  <!-- Mobile top bar — hidden on desktop, shown on mobile via CSS -->
  <div id="mobile-topbar">
    <img src="assets/playground_title.svg" alt="PLAYGROUND" id="mobile-title">
    <div class="mobile-selector-row">
      <div class="robot-selector">
        <select id="mobileRobotSelect">
          <option value="lekiwi" selected>LeKiwi</option>
          <option value="akros">AKROS</option>
          <option value="kr003">KR003</option>
        </select>
      </div>
      <button id="mobileInfoButton" class="info-button" aria-label="About this robot">ⓘ</button>
    </div>
  </div>
```

**Step 2: Add `#bottom-sheet` before `<footer id="footer">` (currently line 131)**

```html
  <!-- Mobile bottom sheet — hidden on desktop, shown on mobile via CSS -->
  <div id="bottom-sheet">
    <button id="sheet-handle" aria-label="Toggle controls panel">▲</button>
    <div id="sheet-content">
      <div class="view-buttons">
        <button id="mobileAxesButton" class="toggle-button active">Axes</button>
        <button id="mobileGridButton" class="toggle-button active">Grid</button>
        <button id="mobileResetButton">Reset</button>
      </div>
    </div>
  </div>
```

**Step 3: Verify HTML is valid — open index.html in browser at mobile width, confirm no console errors**

---

### Task 2: CSS — hide/show mobile elements at desktop baseline

**Files:**
- Modify: `css/style.css` (append new `@media` block at end of file)

**Step 1: Add the following to the very end of `css/style.css` — desktop baseline (elements hidden outside media query)**

```css
/* ── Mobile-only elements: hidden on desktop ── */
#mobile-topbar  { display: none; }
#bottom-sheet   { display: none; }
```

**Step 2: Verify — at desktop width (>767px) the page looks identical to before. Take a screenshot.**

---

### Task 3: CSS — mobile top bar styles

**Files:**
- Modify: `css/style.css` (add inside new `@media (max-width: 767px)` block)

**Step 1: Add the media query block and top bar styles (append after Task 2 additions)**

```css
@media (max-width: 767px) {

  /* Hide desktop panel */
  #controls { display: none; }

  /* Fullscreen 3D canvas — already 100vw×100vh, just ensure no offset */
  #canvas-container { position: fixed; top: 0; left: 0; }

  /* ── Top bar ── */
  #mobile-topbar {
    display: flex;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 52px;
    background: rgba(38, 38, 38, 0.90);
    align-items: center;
    padding: 0 12px;
    gap: 10px;
    z-index: 10;
  }

  #mobile-title {
    height: 14px;
    width: auto;
    flex-shrink: 0;
  }

  .mobile-selector-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    justify-content: flex-end;
    min-width: 0;
  }

  .mobile-selector-row .robot-selector {
    flex: 1;
    min-width: 0;
    max-width: 180px;
  }

  /* Info card repositioned: below top bar, full width */
  #infoCard {
    top: 52px;
    left: 0;
    right: 0;
    width: auto;
  }

}
```

**Step 2: Reload browser at 375px width. Confirm:**
- Top bar visible, 52px tall, dark background
- PLAYGROUND SVG visible on left
- Robot selector + ⓘ button on right
- 3D canvas fills rest of screen
- Desktop `#controls` panel gone

---

### Task 4: CSS — bottom sheet styles

**Files:**
- Modify: `css/style.css` (add inside the existing `@media (max-width: 767px)` block from Task 3)

**Step 1: Add bottom sheet styles inside the media query (before the closing `}`)**

```css
  /* ── Bottom sheet ── */
  #bottom-sheet {
    display: flex;
    flex-direction: column;
    position: fixed;
    bottom: 48px;           /* sits directly above the 48px footer */
    left: 0;
    right: 0;
    z-index: 10;
    background: rgba(38, 38, 38, 0.90);
    transform: translateY(calc(100% - 28px));   /* collapsed: only handle visible */
    transition: transform 0.25s ease;
  }

  #bottom-sheet.open {
    transform: translateY(0);
  }

  #sheet-handle {
    height: 28px;
    width: 100%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  #sheet-handle:hover {
    color: rgba(255, 255, 255, 0.85);
  }

  #sheet-content {
    padding: 8px 12px 12px;
  }

  /* ── Footer: hide telemetry on mobile ── */
  #telem-left { display: none; }

  /* Footer logo stays — ensure it fills the now-empty footer */
  #footer { justify-content: flex-end; }

```

**Step 2: Reload at 375px. Confirm:**
- A small `▲` handle tab visible just above the footer
- Tapping the handle does nothing yet (JS comes next)
- Telemetry gone from footer, logo stays right-aligned

---

### Task 5: JS — bottom sheet toggle

**Files:**
- Modify: `js/main.js` (append to end of `// ── UI event wiring ──` section, before `// ── Bootstrap ──`)

**Step 1: Add bottom sheet toggle logic (around line 430, before the `// ── Bootstrap ──` comment)**

```js
// ── Mobile bottom sheet toggle ─────────────────────────────────────────────
const sheetHandle = document.getElementById('sheet-handle');
if (sheetHandle) {
  const sheet = document.getElementById('bottom-sheet');
  sheetHandle.addEventListener('click', () => {
    const open = sheet.classList.toggle('open');
    sheetHandle.textContent = open ? '▼' : '▲';
  });
}
```

**Step 2: Reload at 375px. Tap the `▲` handle — sheet slides up showing VIEW buttons. Tap `▼` — sheet collapses. Confirm transition is smooth.**

---

### Task 6: JS — mobile view buttons

**Files:**
- Modify: `js/main.js` (append after Task 5 addition)

The mobile view buttons mirror the desktop button logic exactly. They reference `axesHelper`, `gridHelper`, `robotAxes`, `originLine`, `orbitControls`, `camera` which are all in scope.

**Step 1: Add mobile view button wiring (after the sheet toggle block)**

```js
// ── Mobile view buttons ────────────────────────────────────────────────────
const mobileAxesBtn  = document.getElementById('mobileAxesButton');
const mobileGridBtn  = document.getElementById('mobileGridButton');
const mobileResetBtn = document.getElementById('mobileResetButton');

if (mobileAxesBtn) {
  mobileAxesBtn.addEventListener('click', () => {
    mobileAxesBtn.classList.toggle('active');
    const v = mobileAxesBtn.classList.contains('active');
    axesHelper.visible = v;
    if (robotAxes)  robotAxes.visible  = v;
    if (originLine) originLine.visible = v;
  });
}

if (mobileGridBtn) {
  mobileGridBtn.addEventListener('click', () => {
    mobileGridBtn.classList.toggle('active');
    gridHelper.visible = mobileGridBtn.classList.contains('active');
  });
}

if (mobileResetBtn) {
  mobileResetBtn.addEventListener('click', () => {
    mobileResetBtn.classList.add('active');
    camera.position.set(0.75, -0.75, 0.35);
    orbitControls.target.set(0, 0, 0.06);
    orbitControls.update();
    robotPose = { x: 0, y: 0, theta: 0 };
    if (robot && activeRobot) {
      robot.position.set(0, 0, activeRobot.config.zOffset);
      robot.rotation.z = 0;
    }
    if (activeRobot) applyProfile(activeRobot.inputProfile);
    axesHelper.visible = true;
    if (robotAxes)  robotAxes.visible  = true;
    if (originLine) originLine.visible = true;
    gridHelper.visible = true;
    mobileAxesBtn.classList.add('active');
    mobileGridBtn.classList.add('active');
    setTimeout(() => mobileResetBtn.classList.remove('active'), 400);
  });
}
```

**Step 2: Reload at 375px, open sheet, tap AXES — axes toggle off/on. Tap GRID — grid toggles. Tap RESET — robot snaps back to origin, camera resets.**

---

### Task 7: JS — mobile robot selector sync

**Files:**
- Modify: `js/main.js` (append after Task 6 addition)

**Step 1: Add mobile selector event listener (after mobile view buttons block)**

```js
// ── Mobile robot selector ──────────────────────────────────────────────────
const mobileSel = document.getElementById('mobileRobotSelect');
if (mobileSel) {
  // Pre-select based on URL param (matches desktop bootstrap logic)
  mobileSel.value = initialKey;

  mobileSel.addEventListener('change', (e) => {
    const key = e.target.value;
    // Keep desktop selector in sync
    document.getElementById('robotSelect').value = key;
    if (key === 'lekiwi') {
      history.replaceState(null, '', window.location.pathname);
    } else {
      history.replaceState(null, '', `?robot=${key}`);
    }
    loadRobot(key);
  });

  // Keep mobile selector in sync when desktop selector changes
  document.getElementById('robotSelect').addEventListener('change', () => {
    mobileSel.value = document.getElementById('robotSelect').value;
  });
}
```

**Note:** `initialKey` is already declared at line 470 in the bootstrap section — `mobileSel.value = initialKey` must run after `initialKey` is defined. Since this block is appended before `// ── Bootstrap ──`, move the `mobileSel.value = initialKey` line to after `const initialKey = ...` in the bootstrap section instead. See Step 2.

**Step 2: In the `// ── Bootstrap ──` section (around line 469), add one line after `const initialKey` declaration:**

```js
const initialKey = (urlKey && ROBOTS[urlKey]) ? urlKey : 'lekiwi';
document.getElementById('robotSelect').value = initialKey;
if (mobileSel) mobileSel.value = initialKey;   // ← add this line
loadRobot(initialKey);
```

And remove `mobileSel.value = initialKey` from the Task 7 Step 1 block (keep only the event listener).

**Step 3: Reload at 375px. Switch robot in mobile selector — robot changes in 3D view. Switch at desktop width via desktop selector — desktop selector updates. Confirm URL param updates correctly.**

---

### Task 8: JS — mobile info button

**Files:**
- Modify: `js/main.js` (append after Task 7 addition)

**Step 1: Add mobile info button wiring (after mobile selector block)**

```js
// ── Mobile info button ─────────────────────────────────────────────────────
const mobileInfoBtn = document.getElementById('mobileInfoButton');
if (mobileInfoBtn) {
  mobileInfoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = infoCard.classList.toggle('visible');
    mobileInfoBtn.classList.toggle('active', open);
    // Keep desktop button state in sync (visual only — desktop button hidden on mobile)
    infoButton.classList.toggle('active', open);
  });
}
```

**Step 2: Update the `document.addEventListener('click', ...)` dismiss handler (around line 456) to also dismiss when tapping outside on mobile — add `mobileInfoBtn` to the exclusion check:**

Find:
```js
  if (!infoCard.contains(e.target) && e.target !== infoButton) {
```
Replace with:
```js
  if (!infoCard.contains(e.target) && e.target !== infoButton && e.target !== mobileInfoBtn) {
```

**Step 3: Reload at 375px. Tap ⓘ — info card appears below top bar. Tap ✕ or outside card — card closes. Switch robots — card closes.**

---

### Task 9: Visual verification pass

**Step 1: Screenshot at 375×812 (mobile preset)**
- Confirm: fullscreen robot, top bar with title + selector, ▲ handle above footer, logo bottom-right
- Confirm: no telemetry text in footer

**Step 2: Open bottom sheet — confirm VIEW buttons visible and functional**

**Step 3: Tap ⓘ — info card appears, full-width below top bar**

**Step 4: Switch robots from mobile selector — robot changes, URL updates**

**Step 5: Resize to desktop (>767px) — confirm desktop layout completely unchanged**

**Step 6: Commit**

```bash
git add index.html css/style.css js/main.js
git commit -m "feat: responsive mobile layout — fullscreen 3D, top bar, bottom sheet"
```
