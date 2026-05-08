/**
 * touch.js — On-screen virtual controls for mobile play.
 *
 * Only activates on touch-capable devices. Injects synthetic key states into
 * the Input module so all game logic works without modification.
 *
 * Layout:
 *   • Bottom-left        — virtual joystick  (WASD / truck steering)
 *   • Bottom-right       — action button "E" (interact / enter–exit truck)
 *   • Right-side swipe   — horizontal drag rotates the player / camera
 *
 * z-index 100 keeps controls below cutscene overlays (z-index 200–300)
 * so cutscene Next/Skip buttons remain fully interactive.
 */
(() => {
    // Only initialise on touch devices.
    if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;

    const STICK_RADIUS  = 55;   // outer ring radius in px
    const HANDLE_RADIUS = 22;   // inner dot radius in px
    const DEAD_ZONE     = 12;   // pixels before any key registers
    const LOOK_SENS     = 0.006; // radians per pixel for camera/player yaw

    let baseEl, handleEl, actionBtn;

    let stickTouchId = null;
    let baseCX = 0, baseCY = 0;

    // Look (right-side swipe) tracking
    let lookTouchId  = null;
    let lookLastX    = 0;

    // Keys currently held via the joystick (so we can release cleanly).
    const activeKeys = new Set();

    // ── Helpers ───────────────────────────────────────────────────────

    function _setKey(code, on) {
        if (on && !activeKeys.has(code)) {
            activeKeys.add(code);
            Input.pressKey(code);
        } else if (!on && activeKeys.has(code)) {
            activeKeys.delete(code);
            Input.releaseKey(code);
        }
    }

    function _releaseAllMovement() {
        for (const k of activeKeys) Input.releaseKey(k);
        activeKeys.clear();
    }

    // ── Joystick update ───────────────────────────────────────────────

    function _updateStick(cx, cy) {
        const dx   = cx - baseCX;
        const dy   = cy - baseCY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Clamp handle dot visually within the ring.
        const clamp = Math.min(dist, STICK_RADIUS);
        const ang   = Math.atan2(dy, dx);
        handleEl.style.transform =
            `translate(${Math.cos(ang) * clamp}px, ${Math.sin(ang) * clamp}px)`;

        if (dist > DEAD_ZONE) {
            const nx = dx / dist;
            const ny = dy / dist;
            _setKey("KeyW", ny < -0.3);
            _setKey("KeyS", ny >  0.3);
            _setKey("KeyA", nx < -0.3);
            _setKey("KeyD", nx >  0.3);
        } else {
            _releaseAllMovement();
        }
    }

    // ── Build DOM ─────────────────────────────────────────────────────

    // Joystick outer ring.
    baseEl = document.createElement('div');
    baseEl.style.cssText = [
        'position:fixed;bottom:28px;left:28px',
        `width:${STICK_RADIUS * 2}px;height:${STICK_RADIUS * 2}px`,
        'border-radius:50%',
        'background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.22)',
        'display:flex;align-items:center;justify-content:center',
        'touch-action:none;user-select:none;z-index:100',
    ].join(';');

    // Joystick inner dot.
    handleEl = document.createElement('div');
    handleEl.style.cssText = [
        `width:${HANDLE_RADIUS * 2}px;height:${HANDLE_RADIUS * 2}px`,
        'border-radius:50%;background:rgba(255,255,255,0.38)',
        'pointer-events:none',
        'transition:transform 0.04s',
    ].join(';');
    baseEl.appendChild(handleEl);

    // Action / interact button — right side, well above the minimap (28% tall).
    actionBtn = document.createElement('div');
    actionBtn.textContent = 'E';
    actionBtn.style.cssText = [
        'position:fixed;right:28px;bottom:calc(28% + 20px)',
        'width:72px;height:72px;border-radius:50%',
        'background:rgba(255,200,50,0.16);border:2px solid rgba(255,200,50,0.45)',
        'color:rgba(255,220,100,0.90);font-size:28px;font-weight:bold',
        'font-family:Arial,sans-serif',
        'display:flex;align-items:center;justify-content:center',
        'touch-action:none;user-select:none;z-index:100',
    ].join(';');

    // ── Joystick events ───────────────────────────────────────────────

    baseEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (stickTouchId !== null) return;   // already tracking a finger
        const t = e.changedTouches[0];
        stickTouchId = t.identifier;
        const r = baseEl.getBoundingClientRect();
        baseCX = r.left + STICK_RADIUS;
        baseCY = r.top  + STICK_RADIUS;
        _updateStick(t.clientX, t.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === stickTouchId) {
                e.preventDefault();
                _updateStick(t.clientX, t.clientY);
            } else if (t.identifier === lookTouchId) {
                e.preventDefault();
                const dx = t.clientX - lookLastX;
                lookLastX = t.clientX;
                // Skip rotation during cutscenes
                if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) return;
                // Rotate whichever mesh the camera is currently following
                const pm = (typeof Truck !== 'undefined' && Truck.isDrivingActive())
                    ? Truck.getMesh()
                    : Player.getMesh();
                if (pm) pm.rotation.y += dx * LOOK_SENS;
            }
        }
    }, { passive: false });

    function _endStick(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === stickTouchId) {
                stickTouchId = null;
                handleEl.style.transform = 'translate(0,0)';
                _releaseAllMovement();
            } else if (t.identifier === lookTouchId) {
                lookTouchId = null;
            }
        }
    }
    window.addEventListener('touchend',    _endStick);
    window.addEventListener('touchcancel', _endStick);

    // ── Look zone: any touchstart on the right half ON THE CANVAS (not DOM overlays) ──

    window.addEventListener('touchstart', (e) => {
        if (lookTouchId !== null) return;   // already tracking a look finger
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            // Must be on the right half of the screen
            if (t.clientX < window.innerWidth * 0.45) continue;
            // Must not already be the stick touch
            if (t.identifier === stickTouchId) continue;
            // Only claim touches that land directly on the game canvas —
            // this prevents swallowing taps on DOM overlays (interview panel,
            // cutscene buttons, etc.) which would stop click events firing.
            const hit = document.elementFromPoint(t.clientX, t.clientY);
            if (!hit || hit.id !== 'renderCanvas') continue;
            lookTouchId = t.identifier;
            lookLastX   = t.clientX;
            break;
        }
    }, { passive: true });

    // ── Action button events ──────────────────────────────────────────

    actionBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        Input.pressKey("KeyE");
        actionBtn.style.background = 'rgba(255,200,50,0.42)';
    }, { passive: false });

    function _endAction(e) {
        e.preventDefault();
        Input.releaseKey("KeyE");
        actionBtn.style.background = 'rgba(255,200,50,0.16)';
    }
    actionBtn.addEventListener('touchend',    _endAction, { passive: false });
    actionBtn.addEventListener('touchcancel', _endAction, { passive: false });

    // ── Mount ─────────────────────────────────────────────────────────

    document.body.appendChild(baseEl);
    document.body.appendChild(actionBtn);
})();
