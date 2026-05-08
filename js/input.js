/**
 * input.js — Keyboard state tracker
 * Tracks which keys are currently held down.
 */
const Input = (() => {
    const held = {};

    window.addEventListener("keydown", (e) => {
        held[e.code] = true;
    });

    window.addEventListener("keyup", (e) => {
        held[e.code] = false;
    });

    const consumed = {};
    window.addEventListener("keydown", (e) => {
        consumed[e.code] = (consumed[e.code] || 0) + 1;
    });

    return {
        isHeld: (code) => !!held[code],
        /**
         * Returns and clears a one-shot press (use for action keys like E).
         */
        consumePress: (code) => {
            if (consumed[code] > 0) {
                consumed[code]--;
                return true;
            }
            return false;
        },
        /**
         * Discards all buffered presses for a key.
         * Call when showing an interaction hint to prevent pre-buffered
         * presses from auto-triggering the action.
         */
        flushPress: (code) => { consumed[code] = 0; },
        /**
         * Programmatically press a key (used by touch controls).
         * Only fires once per press — safe to call from touchstart.
         */
        pressKey: (code) => {
            if (!held[code]) {
                held[code] = true;
                consumed[code] = (consumed[code] || 0) + 1;
            }
        },
        /** Programmatically release a key (used by touch controls). */
        releaseKey: (code) => { held[code] = false; },
    };
})();
