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

    return {
        isHeld: (code) => !!held[code],
        /**
         * Returns and clears a one-shot press (use for action keys like E).
         */
        consumePress: (() => {
            const consumed = {};
            window.addEventListener("keydown", (e) => {
                consumed[e.code] = (consumed[e.code] || 0) + 1;
            });
            return (code) => {
                if (consumed[code] > 0) {
                    consumed[code]--;
                    return true;
                }
                return false;
            };
        })(),
    };
})();
