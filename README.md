# Adaptive AI Dodge

A premium neon browser game built with **HTML, CSS, and JavaScript Canvas API**.

The player controls a glowing energy orb and must dodge incoming obstacles. The game includes an adaptive AI system that changes obstacle spawning based on how the player moves.

## Features

- Dark sci-fi theme with neon glow
- Glassmorphism UI
- Smooth 60 FPS-style animations
- Particle trail behind the player
- Adaptive obstacle spawning
- Dynamic difficulty scaling
- Screen shake on collision
- Pause / resume support
- High score saved in `localStorage`
- Touch drag support for phones and tablets
- Phone vibration on crash
- Fully self-contained, no backend required

## Controls

### Desktop
- **Arrow keys** or **WASD**: Move
- **P** or **Space**: Pause / resume
- **Enter**: Start or restart
- **Escape**: Resume from pause

### Mobile / Touch
- **Touch and drag anywhere** to move the orb
- Tap **Start Game** to begin
- The phone vibrates on crash if supported by the browser

## How to run locally

### Option 1: Open directly
Open `index.html` in your browser.

### Option 2: Use a local server
If your browser blocks some features when opening files directly, run:

```bash
python -m http.server 8000
```

Then open:

```bash
http://localhost:8000
```

## GitHub Pages deployment

1. Put these files in the repository root:
   - `index.html`
   - `style.css`
   - `script.js`
   - `README.md`
2. Commit and push to GitHub.
3. Open the repository settings.
4. Go to **Pages**.
5. Select **Deploy from a branch**.
6. Choose:
   - **Branch**: `main`
   - **Folder**: `/ (root)`
7. Save and wait for the public link.

## Notes

- No external libraries are required.
- The game is compatible with GitHub Pages and any static host.
- High score is stored locally in the browser using `localStorage`.
