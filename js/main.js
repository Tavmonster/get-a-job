/**
 * main.js — Engine bootstrap, render loop, game orchestration
 */
(function () {
    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

    function createScene() {
        const scene = new BABYLON.Scene(engine);
        scene.collisionsEnabled = true;
        scene.gravity = new BABYLON.Vector3(0, -0.015, 0);
        scene.clearColor = new BABYLON.Color4(0.53, 0.81, 0.98, 1); // sky blue

        // ── Lighting ────────────────────────────────────────────────
        const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-1, -2, -1), scene);
        sun.intensity = 1.2;
        sun.diffuse = new BABYLON.Color3(1, 0.97, 0.85);

        const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
        ambient.intensity = 0.5;
        ambient.groundColor = new BABYLON.Color3(0.3, 0.5, 0.3);

        // ── Fog ─────────────────────────────────────────────────────
        scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
        scene.fogColor = new BABYLON.Color3(0.75, 0.88, 1.0);
        scene.fogStart = 80;
        scene.fogEnd   = 200;

        // ── Build world ─────────────────────────────────────────────
        World.build(scene);

        // ── Player ──────────────────────────────────────────────────
        const playerMesh = Player.init(scene);

        // ── Camera ──────────────────────────────────────────────────
        const mainCamera = GameCamera.init(scene, playerMesh, canvas);

        // ── Truck ───────────────────────────────────────────────────
        const truckMesh = Truck.init(scene);

        // ── UI ──────────────────────────────────────────────────────
        UI.init(scene);

        // ── Minimap ─────────────────────────────────────────────────
        Minimap.init(scene, mainCamera);        const playerDot = Minimap.createDot(scene, "#4488ff", 9);
        const truckDot  = Minimap.createDot(scene, "#ffaa00", 9);
        // Prevent Babylon GUI (text, HUD, hints) from rendering over the minimap.
        // The GUI layer gets a dedicated bit (0x10000000); mainCamera opts in,
        // minimapCamera keeps the default mask (0x0FFFFFFF) which excludes that bit.
        const guiTexture = UI.getAdvTexture();
        if (guiTexture && guiTexture.layer) {
            guiTexture.layer.layerMask = 0x10000000;
        }
        mainCamera.layerMask = 0x0FFFFFFF | 0x10000000;

        // ── Packages ────────────────────────────────────────────────
        Packages.init(scene, onAllDelivered);

        // ── NPCs ─────────────────────────────────────────────────────
        NPCSystem.init(scene);

        // ── NPC Cars ─────────────────────────────────────────────────
        NPCCars.init(scene);

        // ── References to key trigger zones ─────────────────────────
        const storeData  = World.getSpecialBuilding("store");
        const depotData  = World.getSpecialBuilding("depot");
        const hotelData  = World.getSpecialBuilding("hotel");

        // ── State flags ─────────────────────────────────────────────
        let interactHintActive = "";
        let paydayReady = false;        let interviewScore = 0;
        // ── Game state machine ───────────────────────────────────────
        GameState.on((newState, prev) => {
            switch (newState) {

                case GameState.STATES.INTRO:
                    break;

                case GameState.STATES.WALK_TO_STORE:
                    UI.showMission("Find a Job");
                    UI.showText("I need to get a job...", 4000);
                    setTimeout(() => {
                        UI.showText("Wait — is that a HIRING sign?!", 3500);
                    }, 4500);
                    // Point objective marker at the store
                    if (storeData) Minimap.setObjective(storeData.trigger.position);
                    break;

                case GameState.STATES.INTERVIEW:
                    UI.showMission("Job Interview");
                    UI.hideInteractHint();
                    Interview.start((passed, score, total) => {
                        interviewScore = score;
                        if (passed) {
                            GameState.set(GameState.STATES.HIRED);
                        } else {
                            GameState.set(GameState.STATES.GAME_OVER);
                        }
                    });
                    break;

                case GameState.STATES.HIRED:
                    UI.showMission("Drive to the Depot");
                    Player.setEnabled(true);
                    UI.showText(`You got the job! You scored ${interviewScore}/5. Here are the truck keys — drive to the depot!`, 6000);
                    // Point objective at depot / truck
                    if (depotData) Minimap.setObjective(depotData.trigger.position);
                    // Unlock truck
                    Truck.setVisible(true);
                    setTimeout(() => {
                        GameState.set(GameState.STATES.DELIVERING);
                    }, 1500);
                    break;

                case GameState.STATES.DELIVERING:
                    UI.showMission("Deliver Packages");
                    Packages.activate();
                    UI.showText("Drive to each marked house and deliver the packages!", 4000);
                    // Hide single objective — delivery markers on minimap serve as targets
                    Minimap.setObjective(null);
                    break;

                case GameState.STATES.RETURN_DEPOT:
                    UI.showMission("Return to Depot");
                    UI.showText("All packages delivered! Return the truck to the depot.", 5000);
                    if (depotData) Minimap.setObjective(depotData.trigger.position);
                    break;

                case GameState.STATES.PAYDAY:
                    UI.showMission("Collect Paycheck");
                    Player.setEnabled(true);
                    Truck.setDriving(false);
                    GameCamera.switchTarget(playerMesh);
                    UI.showText("Great work! Go back to the store to collect your paycheck.", 5000);
                    if (storeData) Minimap.setObjective(storeData.trigger.position);
                    paydayReady = true;
                    break;

                case GameState.STATES.HOTEL:
                    UI.showMission("Rest at Hotel");
                    UI.showText("Nice work today. Head to the hotel to rest.", 4000);
                    if (hotelData) Minimap.setObjective(hotelData.trigger.position);
                    break;

                case GameState.STATES.GAME_OVER:
                    UI.showMission("");
                    Player.setEnabled(false);
                    Player.teleport(World.getPlayerSpawnPos());
                    setTimeout(() => UI.showEndScreen(false, () => location.reload()), 800);
                    break;
            }
        });

        // ── Intro sequence ───────────────────────────────────────────
        setTimeout(() => {
            GameState.set(GameState.STATES.WALK_TO_STORE);
        }, 1000);

        // ── Helper: distance between a position and a trigger box ────
        function nearTrigger(pos, trigger, dist = 9) {
            if (!trigger) return false;
            return BABYLON.Vector3.Distance(pos, trigger.position) < dist;
        }

        // ── Render loop ──────────────────────────────────────────────
        scene.registerBeforeRender(() => {
            const gs = GameState.get();
            const S  = GameState.STATES;
            const playerPos = Player.getPosition();
            const truckPos  = truckMesh ? truckMesh.position : BABYLON.Vector3.Zero();

            // ── Camera ─────────────────────────────────────────
            GameCamera.update();

            // ── NPCs ────────────────────────────────────────────
            NPCSystem.update();

            // ── NPC Cars ─────────────────────────────────────────
            NPCCars.update();

            // ── Walking states ──────────────────────────────────────
            if (gs === S.WALK_TO_STORE || gs === S.PAYDAY || gs === S.HOTEL) {
                Player.update();
            }

            // ── Driving states ──────────────────────────────────────
            if (gs === S.DELIVERING || gs === S.RETURN_DEPOT) {
                if (Truck.isDrivingActive()) {
                    Truck.update();
                    Packages.checkDeliveries(truckPos);
                } else {
                    Player.update();
                }
            }

            // ── Minimap dots ─────────────────────────────────────────
            Minimap.updateDot(playerDot, Player.getMesh());
            Minimap.updateDot(truckDot, truckMesh);

            // ── Interaction hints & triggers ─────────────────────────

            // Store entrance
            if ((gs === S.WALK_TO_STORE) && storeData) {
                if (nearTrigger(playerPos, storeData.trigger, 10)) {
                    if (interactHintActive !== "store") {
                        UI.showInteractHint("Press E to enter and ask about the job");
                        interactHintActive = "store";
                    }
                    if (Input.consumePress("KeyE")) {
                        GameState.set(S.INTERVIEW);
                    }
                } else {
                    if (interactHintActive === "store") {
                        UI.hideInteractHint();
                        interactHintActive = "";
                    }
                }
            }

            // Truck mount/dismount (depot area, after hired)
            if ((gs === S.DELIVERING || gs === S.RETURN_DEPOT || gs === S.HIRED) && Truck.getMesh()) {
                const distToTruck = BABYLON.Vector3.Distance(playerPos, truckPos);
                if (!Truck.isDrivingActive()) {
                    if (distToTruck < 7) {
                        if (interactHintActive !== "truck") {
                            UI.showInteractHint("Press E to get in the truck");
                            interactHintActive = "truck";
                        }
                        if (Input.consumePress("KeyE") && gs !== S.HIRED) {
                            // Enter truck
                            Player.setEnabled(false);
                            Truck.setDriving(true);
                            GameCamera.switchTarget(truckMesh);
                            UI.hideInteractHint();
                            interactHintActive = "";
                        }
                    } else {
                        if (interactHintActive === "truck") {
                            UI.hideInteractHint();
                            interactHintActive = "";
                        }
                    }
                } else {
                    // Driving — show exit hint
                    if (interactHintActive !== "exitTruck") {
                        UI.showInteractHint("Press E to exit the truck");
                        interactHintActive = "exitTruck";
                    }
                    if (Input.consumePress("KeyE")) {
                        // Exit truck
                        Truck.setDriving(false);
                        Player.setEnabled(true);
                        Player.teleport(new BABYLON.Vector3(truckPos.x + 3, 1, truckPos.z));
                        GameCamera.switchTarget(playerMesh);
                        UI.hideInteractHint();
                        interactHintActive = "";
                    }
                }
            }

            // Depot return trigger (after all delivered)
            // Works whether the player is driving OR has exited the truck on foot.
            if (gs === S.RETURN_DEPOT && depotData) {
                const checkPos = Truck.isDrivingActive() ? truckPos : playerPos;
                const checkDist = Truck.isDrivingActive() ? 14 : 10;
                if (nearTrigger(checkPos, depotData.trigger, checkDist)) {
                    if (Truck.isDrivingActive()) {
                        Truck.setDriving(false);
                        Player.setEnabled(true);
                        Player.teleport(new BABYLON.Vector3(truckPos.x + 3, 1, truckPos.z));
                        GameCamera.switchTarget(playerMesh);
                    }
                    UI.hideInteractHint();
                    interactHintActive = "";
                    GameState.set(S.PAYDAY);
                }
            }

            // Payday — collect paycheck at the store
            if (gs === S.PAYDAY && storeData && paydayReady) {
                if (nearTrigger(playerPos, storeData.trigger, 10)) {
                    if (interactHintActive !== "manager") {
                        UI.showInteractHint("Press E to collect your paycheck");
                        interactHintActive = "manager";
                    }
                    if (Input.consumePress("KeyE")) {
                        paydayReady = false;
                        UI.hideInteractHint();
                        interactHintActive = "";
                        UI.setMoney(100);
                        UI.showText("Manager: 'You did great today! Here is your first paycheck — $100!'", 5000);
                        setTimeout(() => {
                            UI.showText("Now go find a hotel and get some rest.", 4000);
                            GameState.set(S.HOTEL);
                        }, 5500);
                    }
                } else {
                    if (interactHintActive === "manager") {
                        UI.hideInteractHint();
                        interactHintActive = "";
                    }
                }
            }

            // Hotel entrance — end game
            if (gs === S.HOTEL && hotelData) {
                if (nearTrigger(playerPos, hotelData.trigger, 10)) {
                    if (interactHintActive !== "hotel") {
                        UI.showInteractHint("Press E to check in to the hotel");
                        interactHintActive = "hotel";
                    }
                    if (Input.consumePress("KeyE")) {
                        Player.setEnabled(false);
                        UI.hideInteractHint();
                        interactHintActive = "";
                        UI.setMoney(40);
                        UI.showText("You pay $60 for a room and get some well-deserved rest. $40 left over.", 5000);
                        setTimeout(() => UI.showEndScreen(true, () => location.reload()), 5500);
                    }
                } else {
                    if (interactHintActive === "hotel") {
                        UI.hideInteractHint();
                        interactHintActive = "";
                    }
                }
            }
        });

        return scene;
    }

    // ── All packages delivered callback ──────────────────────────────
    function onAllDelivered() {
        UI.hideHUD();
        GameState.set(GameState.STATES.RETURN_DEPOT);
    }

    const scene = createScene();

    // ── Resize handler ───────────────────────────────────────────────
    window.addEventListener("resize", () => engine.resize());

    // ── Start render loop ────────────────────────────────────────────
    engine.runRenderLoop(() => scene.render());

    // ── Fix HIRED state score display (patch after interview completes) ─
    // The score is passed back via the interview callback; update the text.
    // This is handled inside GameState.on for HIRED above.

})();
