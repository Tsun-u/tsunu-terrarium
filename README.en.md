# 🌱 Pixel Terrarium

A nearly wordless pixel-art idle game: little pixel creatures live in a terrarium on their own — meeting, starting families, and having children who inherit their parents' shape and color genes. All you have to do is watch over them gently: pet them once in a while, drop a fruit, collect hearts.

**🎮 Play online: https://tsun-u.github.io/tsunu-terrarium/**

*[中文說明 →](README.md)*

## First launch: the opening ceremony

Every new bottle begins with an opening ceremony:

1. Give your bottle a name (the default works fine too)
2. Decide what the 8 founders look like — pick each one's shape and color yourself, or press 🎲 to leave it to fate (🎲🎲 rolls them all at once)
3. Press 🌱 and the world is born

## How this world works

- **8 founders** start from four shapes (circle, triangle, square, diamond) and the color wheel
- Shapes are **superformula parameter genes**: a child = its parents' parameters interpolated plus noise, so circle × triangle makes soft in-between shapes; on rare occasions a mutation produces something brand new — stars, gears, and stranger things
- Colors are **HSL genes**: hue leans toward one parent, with a tiny chance of a color jump or a faintly glowing constitution
- Life cycle: egg (it wobbles!) → child (a little dot; after six hours its **shape is revealed**) → adult → elder (walks slowly, sometimes stops to gaze at the sky) → gently floats up into the night sky and **becomes a star** — tap a star in the sky to see which child it was
- When two single adults keep running into each other, they may **tie the knot**: a red string lights up, hearts fountain out, wedding chimes ring. The more often they meet, the more likely it happens
- Married couples wander together and daydream side by side; young children stay close to their parents
- If one partner becomes a star first, a not-yet-elderly widow may **find new love someday**; elders keep their memories and grow old faithfully
- Place playground gear and they'll play on their own: children ride the swing, climb the slide and whoosh down, pairs ride the seesaw, daytime water fights by the pond, strolls across the bridge — and at night a mischievous kid may sneak over to flick the stone lantern on and off
- Lifespan is 4–7 days (real time). The world keeps running while you're away (up to 72 hours are simulated), and a picture summary of "while you were gone…" greets you when you return

## Interactions

| Action | Effect |
|---|---|
| Tap a creature | Info card (portrait, name, life stage, partner, parents) |
| Tap again while the card is open | Pet it — hearts pop out ❤ |
| Tap ✏️ next to the name | Rename (the only text input in the whole game) |
| Tap open ground | Drop a fruit; nearby creatures sprint over like Pikmin (you can place up to as many fruits as there are creatures) |
| Tap a star in the night sky | See which child that star was |
| Tap a decoration | Pick it up to move it (free); 🗑️ puts it away — buy it back anytime for ❤0 |

## Button legend

| Button | Function |
|---|---|
| 🌳 | Family tree: generations with parent-child lines |
| 🛍️ | Heart shop: 🍎 life extension (gets pricier per creature), 🧵 matchmaker's red string (pair up two singles), flowers / stone lantern (glows at night) / seesaw / swing / slide / bridge (auto-widens to span the pond) / pond upgrade |
| 🫙 | Bottle manager: switch between terrariums, start a new one, ⬇️⬆️ export/import saves, ☁️ Google Drive sync |
| ▶ | Time speed: 1× / 2× / 5× / 10× — the impatient get to see a whole life too |
| ⭐ | Star gallery: every child who became a star |
| 🎵 | Music box toggle (generative pentatonic melodies that never repeat) |
| 🔊 | Sound toggle (birdsong, crickets, wind, event sounds) — independent from the music |
| 🌐 / EN / 中 | Switch language |

The world also springs little surprises: butterfly swarms, butterfly chases, shooting stars, rainbows, fireflies, flower gifts, nap piles, petal rain, pond reflections — be there to see one and you earn ❤.

## Saves

- Saves live in your browser's localStorage — close the tab and everything is still there on the same device
- The 🫙 panel can export a JSON backup, or sync all bottles to the cloud with your Google account (stored in your own Drive's app data folder — we can't see it)
- Switching devices: ☁️⬆️ upload on the old one, ☁️⬇️ download on the new one

## Tech

Pure front-end with zero build steps: Canvas 2D pixel rendering, with the logic layer (genetics/simulation) and the presentation layer (render/UI) meeting only through `contract.js`. Logic-layer tests:

```bash
node --test tests/sim.test.js tests/genetics.test.js
```

During development, append `?fast=N` to speed up time (e.g. `?fast=3600` makes one second equal one hour) — handy for watching a full life cycle.

## License

MIT License — Tsun-u and ATone (宇你童行)
