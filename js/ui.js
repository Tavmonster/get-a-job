/**
 * ui.js — All 2D GUI overlays via Babylon.GUI
 * Must be initialised after the scene is created: UI.init(scene)
 */
const UI = (() => {
    let advTexture = null;
    let narrativeBlock = null;
    let interactHint = null;
    let hudText = null;
    let missionText = null;
    let moneyText = null;
    let fadeTimeout = null;

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

        // ── Mission name (top-left, row 1) ──────────────────────────────
        missionText = new BABYLON.GUI.TextBlock("mission");
        missionText.text = "";
        missionText.color = "#FFD700";
        missionText.fontSize = 26;
        missionText.fontFamily = "Arial";
        missionText.fontStyle = "bold";
        missionText.outlineWidth = 2;
        missionText.outlineColor = "black";
        missionText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        missionText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        missionText.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        missionText.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        missionText.height = "36px";
        missionText.left = "16px";
        missionText.top = "8px";
        advTexture.addControl(missionText);

        // ── HUD (top-left, row 2) ────────────────────────────────────────
        hudText = new BABYLON.GUI.TextBlock("hud");
        hudText.text = "";
        hudText.color = "white";
        hudText.fontSize = 18;
        hudText.fontFamily = "Arial";
        hudText.outlineWidth = 2;
        hudText.outlineColor = "black";
        hudText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        hudText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        hudText.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        hudText.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        hudText.height = "28px";
        hudText.left = "16px";
        hudText.top = "48px";
        hudText.alpha = 0;
        advTexture.addControl(hudText);

        // ── Money (top-right) ─────────────────────────────────────────
        moneyText = new BABYLON.GUI.TextBlock("moneyText");
        moneyText.text = "$0";
        moneyText.color = "#00FF88";
        moneyText.fontSize = 22;
        moneyText.fontFamily = "Arial";
        moneyText.fontStyle = "bold";
        moneyText.outlineWidth = 2;
        moneyText.outlineColor = "black";
        moneyText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        moneyText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        moneyText.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        moneyText.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        moneyText.height = "36px";
        moneyText.left = "-16px";
        moneyText.top = "8px";
        advTexture.addControl(moneyText);
    }

    // ── Money HUD ─────────────────────────────────────────────────────
    function setMoney(amount) {
        if (!moneyText) return;
        moneyText.text = `$${amount}`;
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

    // ── Mission name ──────────────────────────────────────────────────
    function showMission(name) {
        if (!missionText) return;
        missionText.text = name ? `Mission: ${name}` : "";
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

    // ── Full-screen overlay (game over / win / jailed) ──────────────────
    function showEndScreen(win, onRestart, reason) {
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
        title.text = win ? "🎉 You Got The Job And Finished Your First Day!"
            : reason === 'jailed' ? "BUSTED!"
            : "GAME OVER";
        title.color = "white";
        title.fontSize = 42;
        title.fontFamily = "Arial";
        title.height = "100px";
        title.textWrapping = true;
        stack.addControl(title);

        const sub = new BABYLON.GUI.TextBlock("endSub");
        sub.text = win
            ? "You rented a room at the hotel. Get some rest — tomorrow is another day."
            : reason === 'jailed'
            ? "You hit a pedestrian and were arrested. You've been taken to jail. Game over!"
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

    // ── Interview panel (DOM overlay — sidesteps Babylon camera viewport issues) ──
    function showInterviewPanel(questions, onComplete) {
        let questionIndex = 0;
        let score = 0;
        const PASS_THRESHOLD = 3;

        if (typeof Minimap !== 'undefined') Minimap.hide();
        // Release cursor so the player can click answer buttons
        document.exitPointerLock();

        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed;top:0;left:0;width:100%;height:100%',
            'background:rgba(0,0,0,0.82)',
            'display:flex;align-items:center;justify-content:center',
            'z-index:100;font-family:Arial,sans-serif',
        ].join(';');

        const card = document.createElement('div');
        card.style.cssText = [
            'background:#1a1a2e;border:2px solid #4a90e2;border-radius:12px',
            'padding:28px 32px;width:680px;max-width:90vw;box-sizing:border-box;color:white',
        ].join(';');
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function loadQuestion() {
            if (questionIndex >= questions.length) {
                document.body.removeChild(overlay);
                if (typeof Minimap !== 'undefined') Minimap.show();
                // Re-lock cursor now that the quiz is done
                document.getElementById('renderCanvas')?.requestPointerLock();
                onComplete(score >= PASS_THRESHOLD, score, questions.length);
                return;
            }

            const q = questions[questionIndex];
            card.innerHTML = '';

            const header = document.createElement('div');
            header.style.cssText = 'color:#4a90e2;font-size:22px;text-align:center;margin-bottom:8px';
            header.textContent = 'Job Interview — Delivery Driver';
            card.appendChild(header);

            const progress = document.createElement('div');
            progress.style.cssText = 'color:#aaa;font-size:16px;text-align:center;margin-bottom:16px';
            progress.textContent = `Question ${questionIndex + 1} of ${questions.length}  |  Score: ${score}`;
            card.appendChild(progress);

            const qText = document.createElement('div');
            qText.style.cssText = 'font-size:20px;margin-bottom:16px;min-height:60px';
            qText.textContent = q.question;
            card.appendChild(qText);

            const feedback = document.createElement('div');
            feedback.style.cssText = 'height:32px;font-size:18px;margin-top:8px';
            card.appendChild(feedback);

            q.choices.forEach((choice, idx) => {
                const btn = document.createElement('button');
                btn.textContent = choice;
                btn.style.cssText = [
                    'display:block;width:100%;margin-bottom:8px',
                    'padding:10px 14px;background:#2c3e50;color:white',
                    'border:1px solid #555;border-radius:6px',
                    'font-size:17px;cursor:pointer;text-align:left',
                ].join(';');
                btn.addEventListener('mouseover', () => { btn.style.background = '#3d5166'; });
                btn.addEventListener('mouseout',  () => { if (!btn.disabled) btn.style.background = '#2c3e50'; });
                btn.addEventListener('click', () => {
                    const correct = idx === q.correct;
                    if (correct) {
                        score++;
                        feedback.style.color = '#2ecc71';
                        feedback.textContent = '✓ Correct!';
                    } else {
                        feedback.style.color = '#e74c3c';
                        feedback.textContent = `✗ Wrong. Correct answer: "${q.choices[q.correct]}"`;
                    }
                    card.querySelectorAll('button').forEach((b) => {
                        b.disabled = true;
                        b.style.cursor = 'default';
                    });
                    setTimeout(() => {
                        questionIndex++;
                        loadQuestion();
                    }, 1400);
                });
                card.insertBefore(btn, feedback);
            });
        }

        loadQuestion();
    }

    return {
        init,
        getAdvTexture: () => advTexture,
        showText,
        showInteractHint,
        hideInteractHint,
        showMission,
        showHUD,
        hideHUD,
        showEndScreen,
        showInterviewPanel,
        setMoney,
    };
})();
