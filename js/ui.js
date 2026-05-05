/**
 * ui.js — All 2D GUI overlays via Babylon.GUI
 * Must be initialised after the scene is created: UI.init(scene)
 */
const UI = (() => {
    let advTexture = null;
    let narrativeBlock = null;
    let interactHint = null;
    let hudText = null;
    let fadeTimeout = null;
    let interviewPanel = null;

    function init(scene) {
        advTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);

        // ── Narrative centre text ──────────────────────────────────────
        narrativeBlock = new BABYLON.GUI.TextBlock("narrative");
        narrativeBlock.text = "";
        narrativeBlock.color = "white";
        narrativeBlock.fontSize = 36;
        narrativeBlock.fontFamily = "Arial";
        narrativeBlock.textWrapping = true;
        narrativeBlock.outlineWidth = 4;
        narrativeBlock.outlineColor = "black";
        narrativeBlock.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        narrativeBlock.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        narrativeBlock.top = "-80px";
        narrativeBlock.alpha = 0;
        advTexture.addControl(narrativeBlock);

        // ── Interact hint (bottom centre) ─────────────────────────────
        interactHint = new BABYLON.GUI.TextBlock("interactHint");
        interactHint.text = "";
        interactHint.color = "#FFD700";
        interactHint.fontSize = 24;
        interactHint.fontFamily = "Arial";
        interactHint.outlineWidth = 3;
        interactHint.outlineColor = "black";
        interactHint.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        interactHint.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        interactHint.top = "-60px";
        interactHint.alpha = 0;
        advTexture.addControl(interactHint);

        // ── HUD (top-left) ────────────────────────────────────────────
        hudText = new BABYLON.GUI.TextBlock("hud");
        hudText.text = "";
        hudText.color = "white";
        hudText.fontSize = 20;
        hudText.fontFamily = "Arial";
        hudText.outlineWidth = 2;
        hudText.outlineColor = "black";
        hudText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        hudText.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        hudText.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        hudText.left = "16px";
        hudText.top = "16px";
        hudText.alpha = 0;
        advTexture.addControl(hudText);
    }

    // ── Show fading narrative text ────────────────────────────────────
    function showText(message, duration = 4000) {
        if (!narrativeBlock) return;
        clearTimeout(fadeTimeout);
        narrativeBlock.text = message;
        narrativeBlock.alpha = 1;

        fadeTimeout = setTimeout(() => {
            let a = 1;
            const interval = setInterval(() => {
                a -= 0.05;
                if (narrativeBlock) narrativeBlock.alpha = Math.max(0, a);
                if (a <= 0) clearInterval(interval);
            }, 50);
        }, duration);
    }

    // ── Interact hint ─────────────────────────────────────────────────
    function showInteractHint(message) {
        if (!interactHint) return;
        interactHint.text = message;
        interactHint.alpha = 1;
    }

    function hideInteractHint() {
        if (!interactHint) return;
        interactHint.alpha = 0;
    }

    // ── HUD ───────────────────────────────────────────────────────────
    function showHUD(packagesLeft, packagesTotal) {
        if (!hudText) return;
        hudText.text = `Packages Delivered: ${packagesTotal - packagesLeft} / ${packagesTotal}`;
        hudText.alpha = 1;
    }

    function hideHUD() {
        if (!hudText) return;
        hudText.alpha = 0;
    }

    // ── Full-screen overlay (game over / win) ─────────────────────────
    function showEndScreen(win, onRestart) {
        if (!advTexture) return;

        // Dim background
        const bg = new BABYLON.GUI.Rectangle("endBg");
        bg.background = win ? "rgba(0,80,0,0.85)" : "rgba(80,0,0,0.85)";
        bg.thickness = 0;
        bg.width = "100%";
        bg.height = "100%";
        advTexture.addControl(bg);

        const stack = new BABYLON.GUI.StackPanel("endStack");
        stack.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        stack.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        stack.width = "600px";
        bg.addControl(stack);

        const title = new BABYLON.GUI.TextBlock("endTitle");
        title.text = win ? "🎉 You Got The Job And Finished Your First Day!" : "GAME OVER";
        title.color = "white";
        title.fontSize = 42;
        title.fontFamily = "Arial";
        title.height = "100px";
        title.textWrapping = true;
        stack.addControl(title);

        const sub = new BABYLON.GUI.TextBlock("endSub");
        sub.text = win
            ? "You rented a room at the hotel. Get some rest — tomorrow is another day."
            : "You didn't get the job. Better luck next time!";
        sub.color = "#dddddd";
        sub.fontSize = 22;
        sub.fontFamily = "Arial";
        sub.height = "80px";
        sub.textWrapping = true;
        stack.addControl(sub);

        const btn = BABYLON.GUI.Button.CreateSimpleButton("restartBtn", "Play Again");
        btn.width = "200px";
        btn.height = "60px";
        btn.color = "white";
        btn.background = "#333";
        btn.fontSize = 24;
        btn.thickness = 2;
        btn.cornerRadius = 8;
        btn.paddingTop = "20px";
        btn.onPointerClickObservable.add(() => {
            location.reload();
        });
        stack.addControl(btn);
    }

    // ── Interview panel ───────────────────────────────────────────────
    function showInterviewPanel(questions, onComplete) {
        if (!advTexture) return;

        let questionIndex = 0;
        let score = 0;
        const PASS_THRESHOLD = 3;

        // Dim overlay
        const bg = new BABYLON.GUI.Rectangle("intBg");
        bg.background = "rgba(0,0,0,0.82)";
        bg.thickness = 0;
        bg.width = "100%";
        bg.height = "100%";
        advTexture.addControl(bg);
        interviewPanel = bg;

        const card = new BABYLON.GUI.Rectangle("intCard");
        card.background = "#1a1a2e";
        card.thickness = 2;
        card.color = "#4a90e2";
        card.cornerRadius = 12;
        card.width = "680px";
        card.height = "480px";
        card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        bg.addControl(card);

        const stack = new BABYLON.GUI.StackPanel("intStack");
        stack.width = "620px";
        stack.paddingTop = "20px";
        card.addControl(stack);

        // Header
        const header = new BABYLON.GUI.TextBlock("intHeader");
        header.text = "Job Interview — Delivery Driver";
        header.color = "#4a90e2";
        header.fontSize = 22;
        header.fontFamily = "Arial";
        header.height = "40px";
        stack.addControl(header);

        // Progress
        const progress = new BABYLON.GUI.TextBlock("intProgress");
        progress.color = "#aaaaaa";
        progress.fontSize = 16;
        progress.fontFamily = "Arial";
        progress.height = "28px";
        stack.addControl(progress);

        // Question text
        const qText = new BABYLON.GUI.TextBlock("intQ");
        qText.color = "white";
        qText.fontSize = 20;
        qText.fontFamily = "Arial";
        qText.textWrapping = true;
        qText.height = "80px";
        qText.paddingTop = "10px";
        stack.addControl(qText);

        // Answer buttons container
        const btnStack = new BABYLON.GUI.StackPanel("intBtnStack");
        btnStack.width = "620px";
        btnStack.paddingTop = "10px";
        stack.addControl(btnStack);

        // Feedback
        const feedback = new BABYLON.GUI.TextBlock("intFeedback");
        feedback.color = "#FFD700";
        feedback.fontSize = 18;
        feedback.fontFamily = "Arial";
        feedback.height = "36px";
        feedback.text = "";
        stack.addControl(feedback);

        function loadQuestion() {
            if (questionIndex >= questions.length) {
                // Done
                bg.isVisible = false;
                onComplete(score >= PASS_THRESHOLD, score, questions.length);
                return;
            }

            const q = questions[questionIndex];
            progress.text = `Question ${questionIndex + 1} of ${questions.length}  |  Score: ${score}`;
            qText.text = q.question;
            feedback.text = "";

            // Clear old buttons
            btnStack.clearControls();

            q.choices.forEach((choice, idx) => {
                const btn = BABYLON.GUI.Button.CreateSimpleButton(`choice_${idx}`, choice);
                btn.width = "580px";
                btn.height = "46px";
                btn.color = "white";
                btn.background = "#2c3e50";
                btn.fontSize = 17;
                btn.thickness = 1;
                btn.cornerRadius = 6;
                btn.paddingTop = "6px";
                btn.textBlock.textWrapping = true;

                btn.onPointerClickObservable.add(() => {
                    const correct = idx === q.correct;
                    if (correct) {
                        score++;
                        feedback.text = "✓ Correct!";
                        feedback.color = "#2ecc71";
                    } else {
                        feedback.text = `✗ Wrong. Correct answer: "${q.choices[q.correct]}"`;
                        feedback.color = "#e74c3c";
                    }
                    // Disable all buttons
                    btnStack.children.forEach((b) => (b.isEnabled = false));
                    // Next question after delay
                    setTimeout(() => {
                        questionIndex++;
                        loadQuestion();
                    }, 1400);
                });

                btnStack.addControl(btn);
            });
        }

        loadQuestion();
    }

    return {
        init,
        showText,
        showInteractHint,
        hideInteractHint,
        showHUD,
        hideHUD,
        showEndScreen,
        showInterviewPanel,
    };
})();
