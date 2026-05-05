/**
 * gamestate.js — Central state machine
 *
 * States:
 *   INTRO          → player spawns on bench, text appears
 *   WALK_TO_STORE  → player explores, sees Hiring sign
 *   INTERVIEW      → quiz with manager
 *   HIRED          → player gets keys, truck unlocked
 *   DELIVERING     → driving truck, delivering 5 packages
 *   RETURN_DEPOT   → all packages delivered, drive back
 *   PAYDAY         → manager gives $100 paycheck
 *   HOTEL          → player walks to hotel, win
 *   GAME_OVER      → failed interview
 */
const GameState = (() => {
    const STATES = {
        INTRO:         "INTRO",
        WALK_TO_STORE: "WALK_TO_STORE",
        INTERVIEW:     "INTERVIEW",
        HIRED:         "HIRED",
        DELIVERING:    "DELIVERING",
        RETURN_DEPOT:  "RETURN_DEPOT",
        PAYDAY:        "PAYDAY",
        HOTEL:         "HOTEL",
        GAME_OVER:     "GAME_OVER",
    };

    let current = STATES.INTRO;
    const listeners = [];

    function set(newState) {
        if (current === newState) return;
        const prev = current;
        current = newState;
        console.log(`[GameState] ${prev} → ${newState}`);
        listeners.forEach((fn) => fn(newState, prev));
    }

    function on(fn) {
        listeners.push(fn);
    }

    function is(state) {
        return current === state;
    }

    function get() {
        return current;
    }

    return { STATES, set, on, is, get };
})();
