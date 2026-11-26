// Sky Courier input: keyboard state plus mouse steering and wheel throttle.
// The game reads this one object; nothing else touches DOM events.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last consume (edge trigger)
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseMovedAt = 0;
    this.wheelDelta = 0;
    this.clicked = null; // {x, y} of the last click, consumed by menus
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.key.toLowerCase());
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.mouseMovedAt = performance.now();
    });
    canvas.addEventListener('mousedown', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.mouseDown = true;
      this.clicked = { x: this.mouseX, y: this.mouseY };
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...names) {
    return names.some((n) => this.keys.has(n));
  }

  // Edge-triggered: true once per physical press.
  hit(...names) {
    return names.some((n) => this.pressed.has(n));
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = null;
    return c;
  }

  takeWheel() {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
  }

  // Mouse steering: while the button is held, how far the pointer sits from
  // the screen centre, -1..1 on each axis. 0 when the button is up.
  steer() {
    if (!this.mouseDown) return { x: 0, y: 0 };
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x: Math.max(-1, Math.min(1, (this.mouseX - w / 2) / (w * 0.3))),
      y: Math.max(-1, Math.min(1, (this.mouseY - h / 2) / (h * 0.3))),
    };
  }
}
