// Keyboard + mouse input with pointer lock. Read-only state for systems.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();          // KeyboardEvent.code values currently held
    this.pressed = new Set();       // codes pressed this frame (cleared in endFrame)
    this.mouse = { dx: 0, dy: 0, buttons: 0, pressed: 0, wheel: 0 }; // pressed: bitmask of buttons pressed this frame
    this.locked = false;
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.locked && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = 0; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      this.mouse.buttons |= (1 << e.button); this.mouse.pressed |= (1 << e.button);
    });
    addEventListener('mouseup', (e) => { this.mouse.buttons &= ~(1 << e.button); });
    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
    });
  }
  lock() { this.dom.requestPointerLock?.()?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }
  mouseDown(btn = 0) { return (this.mouse.buttons & (1 << btn)) !== 0; }
  mouseJustPressed(btn = 0) { return (this.mouse.pressed & (1 << btn)) !== 0; }
  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.pressed = 0; this.mouse.wheel = 0; }
}
