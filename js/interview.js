/**
 * interview.js — Interview questions and scoring
 *
 * QUESTIONS: Replace or extend the `QUESTIONS` array with your own questions.
 * Each entry: { question: string, choices: string[4], correct: 0-based index }
 *
 * Pass threshold: 3 out of 5 correct.
 */
const Interview = (() => {

    // ── ⚙️  EDIT QUESTIONS HERE ──────────────────────────────────────
    const QUESTIONS = [
        {
            question: "A customer says their package was supposed to arrive yesterday. What do you do?",
            choices: [
                "Apologize and promise to look into the delay right away",
                "Tell them it's not your problem",
                "Ignore the complaint and keep driving",
                "Blame the weather and hang up",
            ],
            correct: 0,
        },
        {
            question: "You arrive at a house but no one is home. What is the correct procedure?",
            choices: [
                "Leave the package on the front porch and photo it",
                "Take the package back without leaving a note",
                "Leave a delivery-attempt notice and reattempt next day",
                "Open the door and place the package inside",
            ],
            correct: 2,
        },
        {
            question: "Your delivery truck starts making a strange noise mid-route. What do you do?",
            choices: [
                "Keep driving and hope it stops",
                "Pull over safely and report it to dispatch",
                "Speed up to finish the route faster",
                "Turn up the radio to block the sound",
            ],
            correct: 1,
        },
        {
            question: "You accidentally deliver a package to the wrong address. What should you do?",
            choices: [
                "Hope no one notices",
                "Retrieve the package and deliver it to the correct address",
                "Call the customer and tell them to walk over",
                "Mark it as delivered and move on",
            ],
            correct: 1,
        },
        {
            question: "What is the most important thing to check before starting your delivery route each morning?",
            choices: [
                "That your lunch is packed",
                "That the radio is working",
                "That your vehicle is fuelled, safe, and all packages are loaded",
                "That the weather looks nice",
            ],
            correct: 2,
        },
    ];
    // ─────────────────────────────────────────────────────────────────

    const PASS_THRESHOLD = 3;

    function start(onResult) {
        UI.showInterviewPanel(QUESTIONS, (passed, score, total) => {
            onResult(passed, score, total);
        });
    }

    return { start, PASS_THRESHOLD };
})();
