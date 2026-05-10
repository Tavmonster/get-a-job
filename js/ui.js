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
    let hungerRow = null;
    let hungerFill = null;
    let _moneyAmount = 0;
    let _hatShopPanel = null;

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

        // ── Hunger bar (top-left, row 3 on desktop; above joystick on mobile) ──────
        const _touchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        hungerRow = new BABYLON.GUI.StackPanel("hungerRow");
        hungerRow.isVertical = false;
        hungerRow.height = "30px";
        if (_touchDevice) {
            // On mobile, sit above the virtual joystick (bottom:~166px) so it
            // doesn't overlap the narrative text in landscape.
            hungerRow.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
            hungerRow.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            hungerRow.top = "-170px";
            hungerRow.left = "16px";
        } else {
            hungerRow.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
            hungerRow.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            hungerRow.left = "16px";
            hungerRow.top = "82px";
        }
        hungerRow.alpha = 1;
        advTexture.addControl(hungerRow);

        const hungerLbl = new BABYLON.GUI.TextBlock("hungerLbl");
        hungerLbl.text = "HUNGER ";
        hungerLbl.color = "#FFD700";
        hungerLbl.fontSize = 15;
        hungerLbl.fontFamily = "Arial";
        hungerLbl.outlineWidth = 2;
        hungerLbl.outlineColor = "black";
        hungerLbl.width = "68px";
        hungerRow.addControl(hungerLbl);

        const hungerBarBg = new BABYLON.GUI.Rectangle("hungerBarBg");
        hungerBarBg.width = "180px";
        hungerBarBg.height = "18px";
        hungerBarBg.background = "#888";
        hungerBarBg.thickness = 1;
        hungerBarBg.color = "#555";
        hungerRow.addControl(hungerBarBg);

        hungerFill = new BABYLON.GUI.Rectangle("hungerFill");
        hungerFill.width = "180px";
        hungerFill.height = "18px";
        hungerFill.background = "#44cc44";
        hungerFill.thickness = 0;
        hungerFill.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        hungerBarBg.addControl(hungerFill);

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
        _moneyAmount = amount;
        if (!moneyText) return;
        moneyText.text = `$${amount}`;
    }

    function getMoney() { return _moneyAmount; }

    // ── Hunger bar ────────────────────────────────────────────────────
    function setHunger(value) {
        if (!hungerFill) return;
        const pct = Math.max(0, Math.min(100, value)) / 100;
        hungerFill.width = `${Math.round(pct * 180)}px`;
        if (pct > 0.6) {
            hungerFill.background = "#44cc44";
        } else if (pct > 0.3) {
            hungerFill.background = "#ff9900";
        } else {
            hungerFill.background = "#cc2222";
        }
    }

    function showHungerBar() {
        if (hungerRow) hungerRow.alpha = 1;
    }

    function hideHungerBar() {
        if (hungerRow) hungerRow.alpha = 0;
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
        document.exitPointerLock?.();

        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed;top:0;left:0;width:100%;height:100%',
            'background:rgba(0,0,0,0.82)',
            'display:flex;align-items:center;justify-content:center',
            'z-index:150;font-family:Arial,sans-serif',
            'padding:12px;box-sizing:border-box',
            // Restore touch handling for this overlay — overrides body touch-action:none
            // which on iOS Safari would otherwise suppress click events on buttons.
            'touch-action:auto',
        ].join(';');

        const card = document.createElement('div');
        card.style.cssText = [
            'background:#1a1a2e;border:2px solid #4a90e2;border-radius:12px',
            'padding:20px;width:680px;max-width:100%;max-height:90vh',
            'box-sizing:border-box;color:white;overflow-y:auto',
        ].join(';');
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function loadQuestion() {
            if (questionIndex >= questions.length) {
                document.body.removeChild(overlay);
                if (typeof Minimap !== 'undefined') Minimap.show();
                // Re-lock cursor now that the quiz is done
                document.getElementById('renderCanvas')?.requestPointerLock?.();
                onComplete(score >= PASS_THRESHOLD, score, questions.length);
                return;
            }

            const q = questions[questionIndex];
            card.innerHTML = '';

            const header = document.createElement('div');
            header.style.cssText = 'color:#4a90e2;font-size:18px;text-align:center;margin-bottom:6px';
            header.textContent = 'Job Interview — Delivery Driver';
            card.appendChild(header);

            const progress = document.createElement('div');
            progress.style.cssText = 'color:#aaa;font-size:14px;text-align:center;margin-bottom:12px';
            progress.textContent = `Question ${questionIndex + 1} of ${questions.length}  |  Score: ${score}`;
            card.appendChild(progress);

            const qText = document.createElement('div');
            qText.style.cssText = 'font-size:17px;margin-bottom:12px;line-height:1.4';
            qText.textContent = q.question;
            card.appendChild(qText);

            const feedback = document.createElement('div');
            feedback.style.cssText = 'min-height:28px;font-size:15px;margin-top:6px';
            card.appendChild(feedback);

            q.choices.forEach((choice, idx) => {
                const btn = document.createElement('button');
                btn.textContent = choice;
                btn.style.cssText = [
                    'display:block;width:100%;margin-bottom:8px',
                    'padding:10px 12px;background:#2c3e50;color:white',
                    'border:1px solid #555;border-radius:6px',
                    'font-size:15px;cursor:pointer;text-align:left;line-height:1.3',
                ].join(';');
                btn.addEventListener('mouseover', () => { btn.style.background = '#3d5166'; });
                btn.addEventListener('mouseout',  () => { if (!btn.disabled) btn.style.background = '#2c3e50'; });
                function _handleAnswer() {
                    if (btn.disabled) return;
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
                }
                btn.addEventListener('click', _handleAnswer);
                // touchend fires reliably on iOS even when body has touch-action:none
                btn.addEventListener('touchend', (e) => { e.preventDefault(); _handleAnswer(); });
                card.insertBefore(btn, feedback);
            });
        }

        loadQuestion();
    }

    // ── Hat shop overlay ─────────────────────────────────────────
    // onBuy(hatType, cost)  — called when a hat is purchased
    // onClose()             — called when the panel is dismissed
    function showHatShop(currentHat, ownedHats, onBuy, onClose) {
        if (!advTexture) return;
        if (_hatShopPanel) hideHatShop();

        const HATS = [
            { type: "cap",    label: "Baseball Cap",  cost: 15, color: "#2980b9" },
            { type: "tophat", label: "Top Hat",        cost: 25, color: "#34495e" },
            { type: "cowboy", label: "Cowboy Hat",      cost: 20, color: "#a93226" },
        ];

        let _wornHat = currentHat;   // tracks hat currently being worn within this session

        const panel = new BABYLON.GUI.Rectangle("hatShopPanel");
        panel.background = "rgba(20,10,30,0.92)";
        panel.thickness = 2;
        panel.color = "#9b59b6";
        panel.cornerRadius = 10;
        panel.width = "360px";
        panel.adaptHeightToChildren = true;
        panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        advTexture.addControl(panel);
        _hatShopPanel = panel;

        const stack = new BABYLON.GUI.StackPanel("hatShopStack");
        stack.paddingTop = "14px";
        stack.paddingBottom = "14px";
        panel.addControl(stack);

        const title = new BABYLON.GUI.TextBlock("hatShopTitle");
        title.text = "HAT SHOP";
        title.color = "#e8aaff";
        title.fontSize = 26;
        title.fontFamily = "Arial";
        title.fontStyle = "bold";
        title.height = "38px";
        stack.addControl(title);

        // Money display (refreshable)
        const moneyLbl = new BABYLON.GUI.TextBlock("hatShopMoney");
        moneyLbl.text = `Your money: $${_moneyAmount}`;
        moneyLbl.color = "#00FF88";
        moneyLbl.fontSize = 18;
        moneyLbl.fontFamily = "Arial";
        moneyLbl.height = "28px";
        stack.addControl(moneyLbl);

        const sep = new BABYLON.GUI.TextBlock("hatSep");
        sep.text = "";
        sep.height = "8px";
        stack.addControl(sep);

        function _refreshButtons() {
            HATS.forEach(h => {
                const b = stack.getDescendants(false, n => n.name === "hatBtn_" + h.type)[0];
                const t = stack.getDescendants(false, n => n.name === "hatTag_" + h.type)[0];
                const owned = ownedHats.has(h.type);
                if (b) {
                    b.textBlock.text = owned ? h.label : `${h.label}  ($${h.cost})`;
                    b.background = (h.type === _wornHat) ? h.color
                        : owned ? "#1a3a1a" : "#2a2a3a";
                }
                if (t) {
                    t.text = owned ? "  ✓" : (_moneyAmount >= h.cost ? "" : "  ✗");
                    t.color = owned ? "#44cc44" : "#cc4444";
                }
            });
            moneyLbl.text = `Your money: $${_moneyAmount}`;
        }

        HATS.forEach(hat => {
            const row = new BABYLON.GUI.StackPanel("hatRow_" + hat.type);
            row.isVertical = false;
            row.height = "46px";
            row.paddingTop = "4px";
            stack.addControl(row);

            const owned = ownedHats.has(hat.type);
            const btn = BABYLON.GUI.Button.CreateSimpleButton("hatBtn_" + hat.type,
                owned ? hat.label : `${hat.label}  ($${hat.cost})`);
            btn.width = "270px";
            btn.height = "38px";
            btn.color = "white";
            btn.background = _wornHat === hat.type ? hat.color
                : owned ? "#1a3a1a" : "#2a2a3a";
            btn.fontSize = 16;
            btn.thickness = 1;
            btn.cornerRadius = 6;
            btn.onPointerClickObservable.add(() => {
                const isOwned = ownedHats.has(hat.type);
                const cost = isOwned ? 0 : hat.cost;
                if (!isOwned && _moneyAmount < hat.cost) return;
                onBuy(hat.type, cost);
                _wornHat = hat.type;
                _refreshButtons();
            });
            row.addControl(btn);

            // Owned / affordability indicator
            const tag = new BABYLON.GUI.TextBlock("hatTag_" + hat.type);
            tag.text = owned ? "  ✓" : (_moneyAmount >= hat.cost ? "" : "  ✗");
            tag.color = owned ? "#44cc44" : "#cc4444";
            tag.fontSize = 18;
            tag.width = "30px";
            row.addControl(tag);
        });

        const sep2 = new BABYLON.GUI.TextBlock("hatSep2");
        sep2.text = "";
        sep2.height = "8px";
        stack.addControl(sep2);

        const removeBtn = BABYLON.GUI.Button.CreateSimpleButton("hatRemoveBtn", "Remove Hat");
        removeBtn.width = "270px";
        removeBtn.height = "34px";
        removeBtn.color = "#aaaaaa";
        removeBtn.background = "#1a1a1a";
        removeBtn.fontSize = 14;
        removeBtn.thickness = 1;
        removeBtn.cornerRadius = 6;
        removeBtn.onPointerClickObservable.add(() => {
            onBuy(null, 0);
            _wornHat = null;
            moneyLbl.text = `Your money: $${_moneyAmount}`;
            HATS.forEach(h => {
                const b = stack.getDescendants(false, n => n.name === "hatBtn_" + h.type)[0];
                if (b) b.background = ownedHats.has(h.type) ? "#1a3a1a" : "#2a2a3a";
            });
        });
        stack.addControl(removeBtn);

        const sep3 = new BABYLON.GUI.TextBlock("hatSep3");
        sep3.text = "";
        sep3.height = "10px";
        stack.addControl(sep3);

        const closeBtn = BABYLON.GUI.Button.CreateSimpleButton("hatCloseBtn", "Close  [E]");
        closeBtn.width = "270px";
        closeBtn.height = "36px";
        closeBtn.color = "white";
        closeBtn.background = "#333";
        closeBtn.fontSize = 15;
        closeBtn.thickness = 1;
        closeBtn.cornerRadius = 6;
        closeBtn.onPointerClickObservable.add(() => { hideHatShop(); onClose(); });
        stack.addControl(closeBtn);
    }

    function hideHatShop() {
        if (_hatShopPanel) {
            advTexture.removeControl(_hatShopPanel);
            _hatShopPanel.dispose();
            _hatShopPanel = null;
        }
    }

    function isHatShopOpen() { return !!_hatShopPanel; }

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
        getMoney,
        setHunger,
        showHungerBar,
        hideHungerBar,
        showHatShop,
        hideHatShop,
        isHatShopOpen,
    };
})();
