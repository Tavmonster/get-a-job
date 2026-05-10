/**
 * cutscene.js — DOM-based narrative cutscene system with animations
 *
 * Animations:
 *   • Overlay fades in; card slides up on entry
 *   • Typewriter effect per slide (adaptive speed)
 *   • Blinking cursor while typing
 *   • Content area cross-fades between slides
 *   • Overlay fades out before firing the callback
 *
 * Controls:
 *   Space / Enter / Next ► — while typing: skip to full text; otherwise: next slide
 *   Esc / Skip             — immediately dismiss and fire callback
 */
const Cutscene = (() => {

    // ── Inject CSS once ────────────────────────────────────────────────
    (function injectStyles() {
        if (document.getElementById('cs-styles')) return;
        const s = document.createElement('style');
        s.id = 'cs-styles';
        s.textContent = `
            @keyframes cs-fade-in  { from { opacity:0 } to { opacity:1 } }
            @keyframes cs-fade-out { from { opacity:1 } to { opacity:0 } }
            @keyframes cs-slide-up {
                from { opacity:0; transform:translateY(36px) scale(0.97); }
                to   { opacity:1; transform:translateY(0)    scale(1);    }
            }
            @keyframes cs-blink { 0%,100%{opacity:1} 50%{opacity:0} }
            .cs-overlay {
                animation: cs-fade-in 0.35s ease forwards;
            }
            .cs-overlay.cs-out {
                animation: cs-fade-out 0.3s ease forwards;
            }
            .cs-card {
                animation: cs-slide-up 0.45s cubic-bezier(0.22,1,0.36,1) forwards;
            }
            .cs-body {
                transition: opacity 0.18s ease;
            }
            .cs-body.cs-fade {
                opacity: 0;
            }
            .cs-cursor {
                display: inline-block;
                width: 2px;
                height: 0.85em;
                background: currentColor;
                margin-left: 2px;
                vertical-align: text-bottom;
                animation: cs-blink 0.65s step-end infinite;
            }
        `;
        document.head.appendChild(s);
    })();

    // ── Slide definitions ──────────────────────────────────────────────
    const SCENES = {

        intro: [
            { speaker: "Narrator", text: "Another day, another dollar…\n\nActually, zero dollars." },
            { speaker: "Narrator", text: "You wake up on a park bench with nothing but the clothes on your back and a fading hope." },
            { speaker: "Narrator", text: "Rent is due. Food costs money. You need a job — fast." },
            { speaker: "Narrator", text: "You spot a HIRING sign at a local shop down the street.\n\nMaybe today's your lucky day." },
        ],

        interview: [
            { speaker: "Narrator", text: "You push open the door. The bell above it jingles. A harried-looking manager glances up from a clipboard." },
            { speaker: "Manager", text: "\"You here about the delivery driver position?\n\nFine. Let's see if you actually know what you're doing.\"" },
            { speaker: "Narrator", text: "You straighten up and take a deep breath.\n\nAnswer carefully — you really need this job." },
        ],

        payday: [
            { speaker: "Manager", text: "\"Not bad for a first day. Every package delivered, right on time.\"" },
            { speaker: "Manager", text: "\"Here's your pay — $100 cash.\n\nDon't spend it all in one place.\"" },
            { speaker: "Narrator", text: "You pocket the crisp bills.\n\nAlmost immediately, your stomach growls loud enough to turn heads." },
        ],

        fastfood: [
            { speaker: "Narrator", text: "You push through the grease-smudged door of Burger Barn.\nThe smell hits you like a warm, delicious wall." },
            { speaker: "Cashier", text: "\"Welcome to Burger Barn! What can I get ya?\"" },
            { speaker: "You",      text: "\"Give me the classic combo, please.\"" },
            { speaker: "Cashier", text: "\"That'll be $10. Enjoy!\"" },
            { speaker: "Narrator", text: "The food arrives in thirty seconds flat.\n\nHot, greasy, and absolutely perfect." },
        ],

        hotel: [
            { speaker: "Clerk",    text: "\"Checking in? Last room available tonight — $60 for the night.\"" },
            { speaker: "You",      text: "\"I'll take it.\"" },
            { speaker: "Narrator", text: "You hand over the cash and trudge up a narrow staircase to your room." },
            { speaker: "Narrator", text: "You collapse onto the bed, shoes still on.\n\nTomorrow you do it all over again — but tonight, you rest." },
        ],

        gameover: [
            { speaker: "Narrator", text: "The afternoon sun is warm on your face.\n\nYou stare up at the sky from the park bench." },
            { speaker: "Narrator", text: "\"We need someone reliable.\"\n\nHis words drift through your mind." },
            { speaker: "Narrator", text: "Maybe next time you'll be better prepared." },
        ],

        broke: [
            { speaker: "Narrator", text: "Your wallet is empty.\n\nYou count the coins in your pocket for the third time, hoping the math changes." },
            { speaker: "Narrator", text: "It doesn't." },
            { speaker: "Narrator", text: "Without food, without shelter, the city swallows you whole.\n\nGame over." },
        ],
    };

    // ── State ──────────────────────────────────────────────────────────
    let _active = false;

    // ── Speaker colour map ─────────────────────────────────────────────
    const SPEAKER_COLOURS = {
        Narrator: "#aabbff",
        Manager:  "#ffcc66",
        Cashier:  "#66ffcc",
        Clerk:    "#cc99ff",
        You:      "#88ff88",
    };

    // ── Public: play(id, onComplete) ───────────────────────────────────
    function play(id, onComplete) {
        const slides = SCENES[id];
        if (!slides || slides.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        _active = true;
        // Release the cursor so the user can click slide buttons
        document.exitPointerLock?.();
        let index   = 0;
        let typing  = false;
        let typeTimer = null;
        let currentFullText = '';

        // ── Overlay ────────────────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.className = 'cs-overlay';
        overlay.style.cssText = [
            'position:fixed;top:0;left:0;width:100%;height:100%',
            'background:rgba(0,0,0,0.88)',
            'display:flex;align-items:center;justify-content:center',
            'z-index:300;font-family:Georgia,"Times New Roman",serif',
        ].join(';');

        // ── Card ───────────────────────────────────────────────────────
        const card = document.createElement('div');
        card.className = 'cs-card';
        card.style.cssText = [
            'background:#0d0d1a;border:2px solid #445599',
            'border-radius:12px;padding:40px 44px',
            'width:720px;max-width:92vw;box-sizing:border-box;color:white',
            'position:relative;user-select:none',
            'box-shadow:0 0 60px rgba(60,80,200,0.35)',
        ].join(';');
        overlay.appendChild(card);

        // ── Content area (cross-faded between slides) ──────────────────
        const bodyEl = document.createElement('div');
        bodyEl.className = 'cs-body';
        card.appendChild(bodyEl);

        // ── Speaker label ──────────────────────────────────────────────
        const speakerEl = document.createElement('div');
        speakerEl.style.cssText = [
            'font-size:15px;font-family:Arial,sans-serif;font-weight:bold',
            'letter-spacing:2px;text-transform:uppercase;margin-bottom:14px',
        ].join(';');
        bodyEl.appendChild(speakerEl);

        // ── Dialogue text + cursor ─────────────────────────────────────
        const textEl = document.createElement('div');
        textEl.style.cssText = [
            'font-size:22px;line-height:1.65;min-height:110px',
            'white-space:pre-wrap',
        ].join(';');
        bodyEl.appendChild(textEl);

        const cursor = document.createElement('span');
        cursor.className = 'cs-cursor';
        cursor.style.display = 'none';

        // ── Footer ─────────────────────────────────────────────────────
        const footer = document.createElement('div');
        footer.style.cssText = [
            'display:flex;justify-content:space-between;align-items:center',
            'margin-top:28px',
        ].join(';');
        card.appendChild(footer);

        const progressEl = document.createElement('div');
        progressEl.style.cssText = 'color:#555;font-size:13px;font-family:Arial,sans-serif';
        footer.appendChild(progressEl);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px';
        footer.appendChild(btnRow);

        const skipBtn = document.createElement('button');
        skipBtn.textContent = 'Skip';
        skipBtn.style.cssText = [
            'padding:8px 18px;background:transparent;color:#666',
            'border:1px solid #444;border-radius:6px',
            'font-size:14px;cursor:pointer;font-family:Arial,sans-serif',
            'transition:color 0.15s,border-color 0.15s',
        ].join(';');
        skipBtn.addEventListener('mouseover', () => { skipBtn.style.color = '#aaa'; skipBtn.style.borderColor = '#888'; });
        skipBtn.addEventListener('mouseout',  () => { skipBtn.style.color = '#666'; skipBtn.style.borderColor = '#444'; });
        btnRow.appendChild(skipBtn);

        const nextBtn = document.createElement('button');
        nextBtn.style.cssText = [
            'padding:10px 26px;background:#1e3a8a;color:white',
            'border:2px solid #4466cc;border-radius:6px',
            'font-size:17px;cursor:pointer;font-weight:bold;font-family:Arial,sans-serif',
            'transition:background 0.15s',
        ].join(';');
        nextBtn.addEventListener('mouseover', () => { nextBtn.style.background = '#2952b3'; });
        nextBtn.addEventListener('mouseout',  () => { nextBtn.style.background = '#1e3a8a'; });
        btnRow.appendChild(nextBtn);

        // ── Keyboard hint ──────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.style.cssText = [
            'position:absolute;bottom:14px;left:50%;transform:translateX(-50%)',
            'color:#444;font-size:12px;font-family:Arial,sans-serif;white-space:nowrap',
        ].join(';');
        hint.textContent = 'Space / Enter to advance  ·  Esc to skip';
        card.appendChild(hint);

        // ── Typewriter ────────────────────────────────────────────────
        function startTypewriter(text) {
            clearTimeout(typeTimer);
            currentFullText = text;
            typing = true;
            nextBtn.textContent = '▶';
            textEl.textContent = '';
            textEl.appendChild(cursor);
            cursor.style.display = 'inline-block';

            // Adaptive speed: target ~2 s for short lines, ~4 s for long ones
            const charCount = text.length;
            const totalMs   = Math.min(4000, Math.max(1500, charCount * 22));
            const delay     = totalMs / charCount;

            let i = 0;
            function tick() {
                if (i < text.length) {
                    // Insert text node before cursor
                    textEl.insertBefore(document.createTextNode(text[i]), cursor);
                    i++;
                    typeTimer = setTimeout(tick, delay);
                } else {
                    finishTypewriter();
                }
            }
            tick();
        }

        function finishTypewriter() {
            clearTimeout(typeTimer);
            typing = false;
            textEl.textContent = currentFullText; // clean rebuild without cursor span
            cursor.style.display = 'none';
            nextBtn.textContent = index < slides.length - 1 ? 'Next ►' : 'Continue ►';
        }

        // ── Show a slide (with cross-fade if not first) ────────────────
        function showSlide(i, skipFade) {
            const slide = slides[i];
            progressEl.textContent = `${i + 1} / ${slides.length}`;
            nextBtn.textContent = '▶';

            function populate() {
                speakerEl.textContent = slide.speaker;
                speakerEl.style.color = SPEAKER_COLOURS[slide.speaker] || '#aabbff';
                textEl.textContent = '';
                bodyEl.classList.remove('cs-fade');
                startTypewriter(slide.text);
            }

            if (skipFade) {
                populate();
            } else {
                bodyEl.classList.add('cs-fade');
                setTimeout(populate, 190);
            }
        }

        // ── Advance ────────────────────────────────────────────────────
        function advance() {
            if (typing) {
                finishTypewriter();
                return;
            }
            index++;
            if (index >= slides.length) {
                finish();
            } else {
                showSlide(index, false);
            }
        }

        // ── Finish with fade-out ───────────────────────────────────────
        function finish() {
            clearTimeout(typeTimer);
            document.removeEventListener('keydown', onKey, true);
            _active = false;
            overlay.classList.add('cs-out');
            setTimeout(() => {
                if (document.body.contains(overlay)) document.body.removeChild(overlay);
                // Re-lock the cursor now that the overlay is gone
                document.getElementById('renderCanvas')?.requestPointerLock?.();
                if (onComplete) onComplete();
            }, 310);
        }

        // ── Keyboard handler ───────────────────────────────────────────
        function onKey(e) {
            e.stopPropagation();
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                advance();
            } else if (e.code === 'Escape') {
                e.preventDefault();
                finish();
            }
        }

        nextBtn.addEventListener('click', (e) => { e.stopPropagation(); advance(); });
        skipBtn.addEventListener('click', (e) => { e.stopPropagation(); finish(); });

        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);

        // Slight delay so the card slide-up animation is visible first
        setTimeout(() => showSlide(0, true), 180);
    }

    // ── Shared: build a temporary humanoid character mesh ─────────────
    // Returns { root, disposeAll }.  Call disposeAll() when done.
    // v = { skin:[r,g,b], hair:[r,g,b], shirt:[r,g,b], pants:[r,g,b] }
    function buildSimpleCharacter(scene, v) {
        const allMeshes = [];

        function mkMat(r, g, b) {
            const m = new BABYLON.StandardMaterial("cs_mat_" + Math.random(), scene);
            m.diffuseColor  = new BABYLON.Color3(r, g, b);
            m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            return m;
        }
        function add(mesh) { allMeshes.push(mesh); return mesh; }

        // Invisible collision root
        const root = BABYLON.MeshBuilder.CreateCylinder(
            "cs_root", { height: 1.6, diameter: 0.6, tessellation: 8 }, scene);
        const rootMat = new BABYLON.StandardMaterial("cs_rootAlpha_" + Math.random(), scene);
        rootMat.alpha = 0;
        root.material = rootMat;
        add(root);

        // Leg pivots at hip height — allow rotation for sitting animation
        const legPivotL = new BABYLON.TransformNode("cs_legPivotL", scene);
        legPivotL.position.set(-0.14, -0.19, 0);
        legPivotL.parent = root;
        allMeshes.push(legPivotL);

        const legL = add(BABYLON.MeshBuilder.CreateCylinder(
            "cs_legL", { height: 0.55, diameter: 0.21, tessellation: 8 }, scene));
        legL.material = mkMat(...v.pants);
        legL.position.set(0, -0.28, 0);   // hangs from pivot
        legL.parent = legPivotL;

        const legPivotR = new BABYLON.TransformNode("cs_legPivotR", scene);
        legPivotR.position.set(0.14, -0.19, 0);
        legPivotR.parent = root;
        allMeshes.push(legPivotR);

        const legR = add(BABYLON.MeshBuilder.CreateCylinder(
            "cs_legR", { height: 0.55, diameter: 0.21, tessellation: 8 }, scene));
        legR.material = mkMat(...v.pants);
        legR.position.set(0, -0.28, 0);
        legR.parent = legPivotR;

        // Shoes — parented to leg pivots so they follow the leg bend
        const shoeL = add(BABYLON.MeshBuilder.CreateBox(
            "cs_shoeL", { width: 0.19, height: 0.08, depth: 0.29 }, scene));
        shoeL.material = mkMat(0.08, 0.07, 0.07);
        shoeL.position.set(0, -0.58, 0.04);
        shoeL.parent = legPivotL;

        const shoeR = add(BABYLON.MeshBuilder.CreateBox(
            "cs_shoeR", { width: 0.19, height: 0.08, depth: 0.29 }, scene));
        shoeR.material = mkMat(0.08, 0.07, 0.07);
        shoeR.position.set(0, -0.58, 0.04);
        shoeR.parent = legPivotR;

        // Torso
        const torso = add(BABYLON.MeshBuilder.CreateBox(
            "cs_torso", { width: 0.52, height: 0.58, depth: 0.28 }, scene));
        torso.material = mkMat(...v.shirt);
        torso.position.y = 0.09;
        torso.parent = root;

        // Arms
        const armL = add(BABYLON.MeshBuilder.CreateCylinder(
            "cs_armL", { height: 0.48, diameter: 0.17, tessellation: 8 }, scene));
        armL.material = mkMat(...v.shirt);
        armL.rotation.z = -0.15;
        armL.position.set(-0.31, 0.12, 0);
        armL.parent = root;

        const armR = add(BABYLON.MeshBuilder.CreateCylinder(
            "cs_armR", { height: 0.48, diameter: 0.17, tessellation: 8 }, scene));
        armR.material = mkMat(...v.shirt);
        armR.rotation.z =  0.15;
        armR.position.set( 0.31, 0.12, 0);
        armR.parent = root;

        // Neck
        const neck = add(BABYLON.MeshBuilder.CreateCylinder(
            "cs_neck", { height: 0.13, diameter: 0.18, tessellation: 8 }, scene));
        neck.material = mkMat(...v.skin);
        neck.position.y = 0.42;
        neck.parent = root;

        // Head
        const head = add(BABYLON.MeshBuilder.CreateSphere(
            "cs_head", { diameter: 0.46, segments: 8 }, scene));
        head.material = mkMat(...v.skin);
        head.position.y = 0.60;
        head.parent = root;

        // Hair
        const hair = add(BABYLON.MeshBuilder.CreateSphere(
            "cs_hair", { diameter: 0.48, segments: 6 }, scene));
        hair.material = mkMat(...v.hair);
        hair.position.set(0, 0.68, -0.03);
        hair.parent = root;

        return {
            root,
            legPivotL, legPivotR,
            disposeAll() { allMeshes.forEach(m => m.dispose()); },
        };
    }

    // ── In-engine interview cutscene ───────────────────────────────────
    // storeData: the full storeData object returned by World.getSpecialBuilding("store").
    //   Must have: storeData.pos (Vector3), storeData.doorPivot (TransformNode).
    function playInterviewCutscene(scene, playerMesh, cam, storeData, onComplete) {
        _active = true;

        const SX = storeData.pos.x;
        const SZ = storeData.pos.z;
        const D  = 14;   // store depth (matches buildStore)
        const W  = 14;

        // Key world positions (derived from buildStore geometry)
        const FRONT_Z   = SZ - D / 2;        // south face Z
        const DOOR_OPEN = -Math.PI / 2;      // door swings west (+Z inward)

        // Counter is 8 units wide (w-6), leaving 3-unit west aisle between SX-4 and wall at SX-7
        const AISLE_X = SX - 5.5;   // centre of west aisle — clear of counter end at SX-4
        const GAP_S   = SZ - 4.0;   // south side of gap (counter south face ≈ SZ-3.2)
        const GAP_N   = SZ - 1.2;   // north side of gap (counter north face ≈ SZ-1.8)
        const DIV_Z   = SZ + 0.6;   // just through the back-room divider doorway (divider at SZ+0.5)

        // Named positions for readability
        const CHAIR_PLY_Z = SZ + D/2 - 5.5;   // pushed south for clearance from desk
        const CHAIR_MGR_Z = SZ + D/2 - 1.5;

        // ── Manager NPC ───────────────────────────────────────────────
        const {
            root: mgrMesh,
            legPivotL: mgrLegPivotL, legPivotR: mgrLegPivotR,
            disposeAll: disposeMgr,
        } = buildSimpleCharacter(scene, {
            skin:  [0.75, 0.60, 0.45],
            hair:  [0.12, 0.08, 0.04],
            shirt: [0.15, 0.35, 0.65],
            pants: [0.18, 0.18, 0.22],
        });
        // Start in employee area: north of counter, east side — visible "behind the counter"
        mgrMesh.position.set(SX + 2, 1, SZ - 1.3);
        mgrMesh.rotation.y = 0;

        // ── Place player at door approach ─────────────────────────────
        playerMesh.position.set(SX, 1, FRONT_Z - 2.5);
        playerMesh.rotation.y = 0;   // facing north (+Z) = tie faces the building
        playerMesh.rotation.z = 0;

        // ── Player rig nodes for sit animation ────────────────────────
        const plyLegPivotL = scene.getNodeByName("legPivotL");
        const plyLegPivotR = scene.getNodeByName("legPivotR");
        const plyArmPivotL = scene.getNodeByName("armPivotL");
        const plyArmPivotR = scene.getNodeByName("armPivotR");

        // ── Math helpers ──────────────────────────────────────────────
        function eio(t)  { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t) * t; }
        function clamp01(t) { return Math.max(0, Math.min(1, t)); }
        function moveToward(mesh, tx, tz, speed, dt) {
            const dx = tx - mesh.position.x;
            const dz = tz - mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const step = speed * dt;
            if (dist <= step) { mesh.position.x = tx; mesh.position.z = tz; return true; }
            mesh.position.x += (dx / dist) * step;
            mesh.position.z += (dz / dist) * step;
            mesh.rotation.y  = Math.atan2(dx, dz);
            return false;
        }
        function makeWalker(mesh, pts, speed) {
            let i = 0;
            return function(dt) {
                if (i >= pts.length) return true;
                if (moveToward(mesh, pts[i].x, pts[i].z, speed, dt)) i++;
                return i >= pts.length;
            };
        }

        // ── First-person camera helpers ───────────────────────────────
        const EYE_STAND = 1.65;   // eye height above mesh origin while standing
        const EYE_SIT   = 1.50;   // eye height while seated

        // Look ahead in the direction the player mesh is facing
        function fpvForward(eyeOffset) {
            const ey = playerMesh.position.y + (eyeOffset || EYE_STAND);
            cam.position.set(playerMesh.position.x, ey, playerMesh.position.z);
            const fx = Math.sin(playerMesh.rotation.y);
            const fz = Math.cos(playerMesh.rotation.y);
            cam.setTarget(new BABYLON.Vector3(
                playerMesh.position.x + fx * 8,
                ey - 0.1,
                playerMesh.position.z + fz * 8
            ));
        }
        // Look at an explicit world-space target
        function fpvLookAt(tx, ty, tz, eyeOffset) {
            const ey = playerMesh.position.y + (eyeOffset || EYE_STAND);
            cam.position.set(playerMesh.position.x, ey, playerMesh.position.z);
            cam.setTarget(new BABYLON.Vector3(tx, ty, tz));
        }

        // ── Sequence phases ───────────────────────────────────────────
        let phase = 0;
        const phases = [];
        const timers = [];
        function sub(text, dur, delay) { timers.push(setTimeout(() => UI.showText(text, dur), delay)); }
        // Speed in units per millisecond (3.6 units/sec — same as 0.06/frame at 60 fps)
        const WALK_SPEED = 0.0036;

        // Phase 0 — player pauses, camera settles looking at door ─────
        let p0elapsed = 0;
        phases.push((dt) => {
            p0elapsed += dt;
            moveToward(playerMesh, SX, FRONT_Z - 2.5, WALK_SPEED, dt);
            fpvLookAt(SX, 1.5, FRONT_Z);
            return p0elapsed > 1500;
        });

        // Phase 1 — door swings open (from whatever state it’s currently at) ────
        const p1DoorStart = storeData.doorPivot ? storeData.doorPivot.rotation.y : 0;
        let p1elapsed = 0;
        phases.push((dt) => {
            p1elapsed += dt;
            const t = clamp01(p1elapsed / 800);
            if (storeData.doorPivot)
                storeData.doorPivot.rotation.y = p1DoorStart + (DOOR_OPEN - p1DoorStart) * eio(t);
            fpvLookAt(SX, 1.5, FRONT_Z);
            return t >= 1;
        });

        // Phase 2 — player walks through door ──────────────────────────
        phases.push((dt) => {
            const arrived = moveToward(playerMesh, SX, FRONT_Z + 2.0, WALK_SPEED, dt);
            fpvForward();
            return arrived;
        });

        // Phase 2.5 — door swings shut behind the player ────────────────
        let p2dElapsed = 0;
        phases.push((dt) => {
            p2dElapsed += dt;
            const t = clamp01(p2dElapsed / 600);
            if (storeData.doorPivot)
                storeData.doorPivot.rotation.y = DOOR_OPEN * (1 - eio(t));
            fpvForward();
            return t >= 1;
        });

        // Phase 3 — manager walks from behind counter, around west gap ─
        const mgrWalk3 = makeWalker(mgrMesh, [
            { x: AISLE_X, z: GAP_N },
            { x: AISLE_X, z: GAP_S },
        ], WALK_SPEED * 0.9);
        let p3elapsed = 0;
        phases.push((dt) => {
            p3elapsed += dt;
            const done = mgrWalk3(dt);
            // Look at the manager as they approach
            fpvLookAt(mgrMesh.position.x, mgrMesh.position.y + 1.5, mgrMesh.position.z);
            return done && p3elapsed > 600;
        });

        // Phase 4 — player walks to join manager at west aisle ────────
        phases.push((dt) => {
            const arrived = moveToward(playerMesh, AISLE_X, GAP_S, WALK_SPEED, dt);
            fpvForward();
            return arrived;
        });

        // Phase 5 — both walk through gap, divider doorway, to chairs ─
        // Manager routes east of the desk (desk spans X:SX-1.6..SX+1.6, Z:SZ+3.1..SZ+4.9)
        const DESK_E = SX + 2.5;  // east clear lane
        const mgrWalk5 = makeWalker(mgrMesh, [
            { x: AISLE_X, z: GAP_N        },
            { x: SX,      z: DIV_Z        },
            { x: DESK_E,  z: SZ + 3.0    },   // east of desk, approach south corner
            { x: DESK_E,  z: SZ + 5.1    },   // east of desk, past north corner
            { x: SX,      z: CHAIR_MGR_Z },   // arrive at chair
        ], WALK_SPEED * 0.9);
        const plyWalk5 = makeWalker(playerMesh, [
            { x: AISLE_X, z: GAP_N      },
            { x: SX,      z: DIV_Z      },
            { x: SX,      z: CHAIR_PLY_Z },
        ], WALK_SPEED);
        let p5elapsed = 0;
        phases.push((dt) => {
            p5elapsed += dt;
            const mDone = mgrWalk5(dt);
            const pDone = plyWalk5(dt);
            fpvForward();
            return mDone && pDone;
        });

        // Phase 6 — sit animation: legs bend forward, body rises to seat height
        let p6elapsed = 0;
        phases.push((dt) => {
            p6elapsed += dt;
            const t = clamp01(p6elapsed / 1000);
            playerMesh.rotation.y = 0;        // faces north (toward manager)
            mgrMesh.rotation.y    = Math.PI;  // faces south (toward player)
            const sitY = 1.0 + eio(t) * 0.12;
            playerMesh.position.y = sitY;
            mgrMesh.position.y    = sitY;
            const bend = -eio(t) * 1.2;
            if (plyLegPivotL) plyLegPivotL.rotation.x = bend;
            if (plyLegPivotR) plyLegPivotR.rotation.x = bend;
            if (mgrLegPivotL) mgrLegPivotL.rotation.x = bend;
            if (mgrLegPivotR) mgrLegPivotR.rotation.x = bend;
            if (plyArmPivotL) plyArmPivotL.rotation.x = -eio(t) * 0.5;
            if (plyArmPivotR) plyArmPivotR.rotation.x = -eio(t) * 0.5;
            // First-person: look at manager while sitting down
            fpvLookAt(mgrMesh.position.x, mgrMesh.position.y + 1.4, mgrMesh.position.z, EYE_SIT);
            return t >= 1;
        });

        // Phase 7 — hold on desk scene, then finish ───────────────────
        let p7elapsed = 0;
        phases.push((dt) => {
            p7elapsed += dt;
            fpvLookAt(mgrMesh.position.x, mgrMesh.position.y + 1.4, mgrMesh.position.z, EYE_SIT);
            return p7elapsed > 2000;
        });

        // ── Schedule subtitles ─────────────────────────────────────────
        sub("You approach the store...",                          3000,   200);
        sub("The door swings open.",                              2500,  2400);
        sub("The manager walks out to greet you.",                3200,  4500);
        sub("\"Right this way,\" he says.",                       2500,  8800);
        sub("You take a seat across the desk.",                   3000, 14000);
        sub("\"Alright. Let's begin.\"",                          3000, 16500);

        // ── Finish ─────────────────────────────────────────────────────
        function finish() {
            if (_done) return;
            _done = true;
            timers.forEach(id => clearTimeout(id));
            document.removeEventListener('keydown', onSkipKey, true);
            scene.onBeforeRenderObservable.remove(observer);
            // Reset player transforms
            playerMesh.position.y = 1;
            mgrMesh.position.y    = 1;
            if (plyLegPivotL) plyLegPivotL.rotation.x = 0;
            if (plyLegPivotR) plyLegPivotR.rotation.x = 0;
            if (plyArmPivotL) { plyArmPivotL.rotation.x = 0; }
            if (plyArmPivotR) { plyArmPivotR.rotation.x = 0; }
            disposeMgr();
            _active = false;
            if (onComplete) onComplete();
        }
        let _done = false;

        function onSkipKey(e) {
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                finish();
            }
        }
        document.addEventListener('keydown', onSkipKey, true);

        // Safety: auto-finish after 35 s in case of unexpected stall
        const _safetyTimer = setTimeout(finish, 35000);
        timers.push(_safetyTimer);

        // ── Per-frame observer ─────────────────────────────────────────
        let _lastT = performance.now();
        const observer = scene.onBeforeRenderObservable.add(() => {
            if (_done) return;
            const now = performance.now();
            const dt  = now - _lastT;
            _lastT    = now;

            if (phase >= phases.length) { finish(); return; }
            const done = phases[phase](dt);
            if (done) phase++;
        });
    }

    // ── In-engine payday cutscene ─────────────────────────────────────
    // Player walks into the store, manager hands over paycheck envelope,
    // player pockets it and exits.
    function playPaydayCutscene(scene, playerMesh, cam, storeData, onComplete) {
        _active = true;

        const SX = storeData.pos.x;
        const SZ = storeData.pos.z;
        const D  = 14;

        const FRONT_Z   = SZ - D / 2;        // south face Z
        const DOOR_OPEN = -Math.PI / 2;

        // Aisle route the manager uses to come around the counter
        const AISLE_X   = SX - 5.5;
        const GAP_S     = SZ - 4.0;
        const GAP_N     = SZ - 1.2;

        // Meeting positions (both north of the walk-in stop SZ-5.5 so player always moves forward)
        // Counter south face = SZ - 2.5 - 0.7 = SZ - 3.2, so manager must stay at SZ - 3.6 or less
        const MEET_PLY_Z = SZ - 4.5;   // 2.5 units inside the door
        const MEET_MGR_Z = SZ - 3.7;   // just south of counter face (SZ-3.2), 0.5 unit buffer

        // ── Manager NPC ───────────────────────────────────────────────
        const {
            root: mgrMesh,
            legPivotL: mgrLegPivotL, legPivotR: mgrLegPivotR,
            disposeAll: disposeMgr,
        } = buildSimpleCharacter(scene, {
            skin:  [0.75, 0.60, 0.45],
            hair:  [0.12, 0.08, 0.04],
            shirt: [0.15, 0.35, 0.65],
            pants: [0.18, 0.18, 0.22],
        });
        mgrMesh.position.set(SX + 2, 1, SZ - 1.3);
        mgrMesh.rotation.y = 0;

        // ── Paycheck envelope ─────────────────────────────────────────
        const envelope = BABYLON.MeshBuilder.CreateBox(
            "cs_envelope", { width: 0.30, height: 0.02, depth: 0.22 }, scene);
        const envMat = new BABYLON.StandardMaterial("cs_envMat_" + Math.random(), scene);
        envMat.diffuseColor  = new BABYLON.Color3(0.95, 0.90, 0.68);
        envMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        envelope.material = envMat;
        envelope.setEnabled(false);

        // ── Place player at approach position ─────────────────────────
        playerMesh.position.set(SX, 1, FRONT_Z - 2.5);
        playerMesh.rotation.y = 0;
        playerMesh.rotation.z = 0;

        // Player rig arm nodes
        const plyArmPivotR = scene.getNodeByName("armPivotR");

        // ── Helpers ───────────────────────────────────────────────────
        function eio(t)  { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }
        function clamp01(t) { return Math.max(0, Math.min(1, t)); }
        function moveToward(mesh, tx, tz, speed, dt) {
            const dx = tx - mesh.position.x;
            const dz = tz - mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const step = speed * dt;
            if (dist <= step) { mesh.position.x = tx; mesh.position.z = tz; return true; }
            mesh.position.x += (dx / dist) * step;
            mesh.position.z += (dz / dist) * step;
            mesh.rotation.y  = Math.atan2(dx, dz);
            return false;
        }
        function makeWalker(mesh, pts, speed) {
            let i = 0;
            return function(dt) {
                if (i >= pts.length) return true;
                if (moveToward(mesh, pts[i].x, pts[i].z, speed, dt)) i++;
                return i >= pts.length;
            };
        }

        // Single eyeHeight variable — lerped smoothly to avoid camera snaps
        const EYE_STAND = 1.65;
        const EYE_FACE  = 0.60;  // head centre is +0.60 above mesh root — look straight across
        let   eyeHeight = EYE_STAND;

        function fpvForward() {
            const ey = playerMesh.position.y + eyeHeight;
            cam.position.set(playerMesh.position.x, ey, playerMesh.position.z);
            const fx = Math.sin(playerMesh.rotation.y);
            const fz = Math.cos(playerMesh.rotation.y);
            cam.setTarget(new BABYLON.Vector3(
                playerMesh.position.x + fx * 8, ey - 0.1,
                playerMesh.position.z + fz * 8));
        }
        function fpvLookAt(tx, ty, tz) {
            const ey = playerMesh.position.y + eyeHeight;
            cam.position.set(playerMesh.position.x, ey, playerMesh.position.z);
            cam.setTarget(new BABYLON.Vector3(tx, ty, tz));
        }

        const WALK_SPEED = 0.0036;
        let phase = 0;
        const phases = [];
        const timers = [];
        function sub(text, dur, delay) { timers.push(setTimeout(() => UI.showText(text, dur), delay)); }

        // Phase 0 — pause outside, look toward store front ─────────────
        // ~1200 ms  cumulative: 0→1200
        let p0e = 0;
        phases.push((dt) => {
            p0e += dt;
            fpvLookAt(SX, 1.5, FRONT_Z);
            return p0e > 1200;
        });

        // Phase 1 — door swings open ─────────────────────────────────
        // ~800 ms  cumulative: 1200→2000
        const p1DoorStart = storeData.doorPivot ? storeData.doorPivot.rotation.y : 0;
        let p1e = 0;
        phases.push((dt) => {
            p1e += dt;
            const t = clamp01(p1e / 800);
            if (storeData.doorPivot)
                storeData.doorPivot.rotation.y = p1DoorStart + (DOOR_OPEN - p1DoorStart) * eio(t);
            fpvLookAt(SX, 1.5, FRONT_Z);
            return t >= 1;
        });

        // Phase 2 — player walks in; door stays open ──────────────────
        // ~1111 ms  cumulative: 2000→3111
        phases.push((dt) => {
            const arrived = moveToward(playerMesh, SX, FRONT_Z + 1.5, WALK_SPEED, dt);
            fpvForward();
            return arrived;
        });

        // Phase 2.5 — door closes behind player (door is behind camera, not visible)
        // ~600 ms  cumulative: 3111→3711
        let p2de = 0;
        phases.push((dt) => {
            p2de += dt;
            const t = clamp01(p2de / 600);
            if (storeData.doorPivot)
                storeData.doorPivot.rotation.y = DOOR_OPEN * (1 - eio(t));
            fpvForward();
            return t >= 1;
        });

        // Phase 3 — manager walks around counter to meet player ────────
        // ~5500 ms  cumulative: 3711→8611 (route: behind counter → west aisle → south floor)
        const mgrWalk3 = makeWalker(mgrMesh, [
            { x: AISLE_X, z: GAP_N      },
            { x: AISLE_X, z: GAP_S      },
            { x: SX,      z: MEET_MGR_Z },
        ], WALK_SPEED * 0.9);
        let p3e = 0;
        phases.push((dt) => {
            p3e += dt;
            const done = mgrWalk3(dt);
            fpvLookAt(mgrMesh.position.x, mgrMesh.position.y + 0.55, mgrMesh.position.z);
            return done && p3e > 600;
        });

        // Phase 4 — player walks forward to meet manager; eye height lerps down
        // ~278 ms  cumulative: 8611→8889
        let p4e = 0;
        phases.push((dt) => {
            p4e += dt;
            // Begin lowering eye height so it's already transitioning before phase 5
            eyeHeight = EYE_STAND + (EYE_FACE - EYE_STAND) * eio(clamp01(p4e / 600));
            const arrived = moveToward(playerMesh, SX, MEET_PLY_Z, WALK_SPEED, dt);
            fpvForward();
            return arrived;
        });

        // Phase 5 — face each other; finish eye lerp; manager raises envelope
        // ~1200 ms  cumulative: 8889→10089
        let p5e = 0;
        phases.push((dt) => {
            p5e += dt;
            const t = clamp01(p5e / 1200);
            eyeHeight = EYE_STAND + (EYE_FACE - EYE_STAND) * eio(Math.min(1, (p4e + p5e) / 600));
            playerMesh.rotation.y = 0;        // faces north (toward manager)
            mgrMesh.rotation.y    = Math.PI;  // faces south (toward player)

            if (t > 0.2) {
                envelope.setEnabled(true);
                const raise = eio(clamp01((t - 0.2) / 0.8));
                envelope.position.set(
                    mgrMesh.position.x,
                    mgrMesh.position.y + 0.55 + raise * 0.35,
                    mgrMesh.position.z + 0.38
                );
                envelope.rotation.x = -raise * 0.45;
            }
            fpvLookAt(mgrMesh.position.x, mgrMesh.position.y + 0.65, mgrMesh.position.z);
            return t >= 1;
        });

        // Phase 6 — player reaches for envelope; it travels to player ──
        // ~1100 ms  cumulative: 10089→11189
        let p6e = 0;
        phases.push((dt) => {
            p6e += dt;
            const t = clamp01(p6e / 1100);
            if (plyArmPivotR) plyArmPivotR.rotation.x = -eio(t) * 0.75;

            const ex0 = mgrMesh.position.x;
            const ez0 = mgrMesh.position.z + 0.38;
            const ey0 = mgrMesh.position.y + 0.90;
            const ex1 = playerMesh.position.x + 0.28;  // right-hand side
            const ez1 = playerMesh.position.z + 0.38;
            const ey1 = playerMesh.position.y + 0.30;  // hand/chest height (+0.12 arm centre, +0.18 tips)
            envelope.position.set(
                ex0 + (ex1 - ex0) * eio(t),
                ey0 + (ey1 - ey0) * eio(t),
                ez0 + (ez1 - ez0) * eio(t)
            );
            fpvLookAt(mgrMesh.position.x, mgrMesh.position.y + 0.65, mgrMesh.position.z);
            return t >= 1;
        });

        // Phase 7 — player pockets envelope (arm returns, envelope hides)
        // ~1100 ms  cumulative: 11189→12289
        let p7e = 0;
        phases.push((dt) => {
            p7e += dt;
            const t = clamp01(p7e / 900);
            if (plyArmPivotR) plyArmPivotR.rotation.x = -0.75 * (1 - eio(t));
            if (t > 0.45) envelope.setEnabled(false);
            fpvLookAt(mgrMesh.position.x, mgrMesh.position.y + 0.65, mgrMesh.position.z);
            return p7e > 1100;
        });

        // Phase 8 — player walks out; door opens ahead of them ────────
        // Door opens first (500 ms), player walks all the way outside (~1667 ms for 6 units)
        // cumulative: 12289→13956.  Door open starts at 12289, player reaches door at ~12956.
        let p8e = 0;
        phases.push((dt) => {
            p8e += dt;
            // Smooth eye height back to standing before player exits
            eyeHeight = EYE_FACE + (EYE_STAND - EYE_FACE) * eio(clamp01(p8e / 700));
            // Open door early so it's clear before the player reaches it
            if (storeData.doorPivot)
                storeData.doorPivot.rotation.y = DOOR_OPEN * eio(clamp01(p8e / 500));
            const arrived = moveToward(playerMesh, SX, FRONT_Z - 2.5, WALK_SPEED, dt);
            fpvForward();
            return arrived;
        });

        // Phase 9 — door swings closed behind player ──────────────────
        // ~600 ms  cumulative: 13956→14556
        let p9e = 0;
        phases.push((dt) => {
            p9e += dt;
            const t = clamp01(p9e / 600);
            if (storeData.doorPivot)
                storeData.doorPivot.rotation.y = DOOR_OPEN * (1 - eio(t));
            fpvForward();
            return t >= 1;
        });

        // Phase 10 — brief pause before callback ──────────────────────
        let p10e = 0;
        phases.push((dt) => {
            p10e += dt;
            return p10e > 500;
        });

        // ── Subtitle schedule ─────────────────────────────────────────
        // Cumulative timings: p0=1200 p1=2000 p2=3111 p2.5=3711
        // p3≈8611 p4≈8889 p5≈10089 p6≈11189 p7≈12289 p8≈13956 p9≈14556 p10≈15056
        sub("You head back to collect your pay...",              2200,   400);
        sub("The manager walks out to meet you.",                3000,  3800);
        sub("\"Not bad for a first day.\"",                      2200,  8800);
        sub("\"$100 cash — don't spend it all in one place.\"",  2400, 10200);
        sub("You pocket the bills.",                             2000, 12000);

        // ── Finish ─────────────────────────────────────────────────────
        function finish() {
            if (_done) return;
            _done = true;
            timers.forEach(id => clearTimeout(id));
            UI.showText(' ', 1);   // clear any in-progress subtitle immediately
            document.removeEventListener('keydown', onSkipKey, true);
            scene.onBeforeRenderObservable.remove(observer);
            playerMesh.position.y = 1;
            eyeHeight = EYE_STAND;
            if (plyArmPivotR) plyArmPivotR.rotation.x = 0;
            envelope.dispose();
            disposeMgr();
            _active = false;
            if (onComplete) onComplete();
        }
        let _done = false;

        function onSkipKey(e) {
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                finish();
            }
        }
        document.addEventListener('keydown', onSkipKey, true);

        const _safetyTimer = setTimeout(finish, 25000);
        timers.push(_safetyTimer);

        let _lastT = performance.now();
        const observer = scene.onBeforeRenderObservable.add(() => {
            if (_done) return;
            const now = performance.now();
            const dt  = now - _lastT;
            _lastT    = now;
            if (phase >= phases.length) { finish(); return; }
            const done = phases[phase](dt);
            if (done) phase++;
        });
    }

    // ── In-engine intro cutscene ───────────────────────────────────────
    // Animates the Babylon.js camera and player mesh directly — no DOM card.
    // benchPos: world-space Vector3 of the bench seat surface (passed from main.js).
    function playIntroCutscene(scene, playerMesh, cam, benchPos, onComplete) {
        _active = true;

        const BX = benchPos.x;
        const BZ = benchPos.z;

        // Place the player on the bench, lying down
        playerMesh.position.set(BX, benchPos.y, BZ);
        playerMesh.rotation.y = 0;
        playerMesh.rotation.z = 1.15;  // ~66° tilt — slumped/sleeping

        // ── Camera waypoints ──────────────────────────────────────────
        // Shot A  (0–30%):   tight side-angle at bench, low, close
        const A_POS = new BABYLON.Vector3(BX + 7,  1.2, BZ - 3);
        const A_TGT = new BABYLON.Vector3(BX,      0.9, BZ    );
        // Shot B  (30–55%):  slow pull-back, rising to reveal the park
        const B_POS = new BABYLON.Vector3(BX + 3,  5.5, BZ - 9);
        const B_TGT = new BABYLON.Vector3(BX,      0.7, BZ    );
        // Shot C  (55–80%):  arcs overhead while player wakes up
        const C_POS = new BABYLON.Vector3(BX,      9,   BZ - 12);
        const C_TGT = new BABYLON.Vector3(BX,      1.2, BZ     );
        // Shot D  (80–100%): eases toward the normal follow-cam position
        const D_POS = new BABYLON.Vector3(BX,      11,  BZ - 13);
        const D_TGT = new BABYLON.Vector3(BX,      1.5, BZ     );

        cam.position.copyFrom(A_POS);
        cam.setTarget(A_TGT);

        // ── Timing ────────────────────────────────────────────────────
        const TOTAL_MS = 12000;
        let elapsed   = 0;
        let lastTime  = performance.now();
        let done      = false;

        // ── Helpers ───────────────────────────────────────────────────
        function eio(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }
        function lerpV(a, b, t) {
            return new BABYLON.Vector3(
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t
            );
        }

        // ── Subtitle schedule ─────────────────────────────────────────
        const timers = [
            setTimeout(() => UI.showText("Another morning...",              4500),  800),
            setTimeout(() => UI.showText("No job.  No money.",              4500), 6000),
            setTimeout(() => UI.showText("Gotta do something about it.",    4000), 11000),
        ];

        // ── Shared finish logic ───────────────────────────────────────
        function finish() {
            if (done) return;
            done = true;

            timers.forEach(id => clearTimeout(id));
            document.removeEventListener('keydown', onSkipKey, true);
            scene.onBeforeRenderObservable.remove(observer);

            // Stand the player up (GameCamera.update() will take over next frame)
            playerMesh.rotation.z = 0;
            playerMesh.rotation.y = 0;
            playerMesh.position.y = 1;

            _active = false;
            if (onComplete) onComplete();
        }

        // ── Keyboard skip ─────────────────────────────────────────────
        function onSkipKey(e) {
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                finish();
            }
        }
        document.addEventListener('keydown', onSkipKey, true);

        // ── Per-frame observer ────────────────────────────────────────
        const observer = scene.onBeforeRenderObservable.add(() => {
            if (done) return;

            const now = performance.now();
            elapsed  += now - lastTime;
            lastTime  = now;

            const t = Math.min(elapsed / TOTAL_MS, 1);

            let camPos, lookAt;

            if (t < 0.30) {
                // Shot A: close-up lingers, very gentle drift toward B
                const s = eio(t / 0.30);
                camPos = lerpV(A_POS, B_POS, s * 0.20);
                lookAt = lerpV(A_TGT, B_TGT, s * 0.20);

            } else if (t < 0.55) {
                // Shot B: pull back & rise to show the park
                const s = eio((t - 0.30) / 0.25);
                camPos = lerpV(A_POS, B_POS, 0.20 + s * 0.80);
                lookAt = lerpV(A_TGT, B_TGT, 0.20 + s * 0.80);

            } else if (t < 0.80) {
                // Shot C: arc overhead; player starts waking up at t=0.60
                const s = eio((t - 0.55) / 0.25);
                camPos = lerpV(B_POS, C_POS, s);
                lookAt = lerpV(B_TGT, C_TGT, s);

                if (t > 0.60) {
                    const w = eio(Math.min((t - 0.60) / 0.20, 1));
                    playerMesh.rotation.z = 1.15 * (1 - w);
                    playerMesh.position.y = benchPos.y + (1 - benchPos.y) * w;
                }

            } else {
                // Shot D: ease toward normal follow-cam
                const s = eio((t - 0.80) / 0.20);
                camPos = lerpV(C_POS, D_POS, s);
                lookAt = lerpV(C_TGT, D_TGT, s);
            }

            cam.position.copyFrom(camPos);
            cam.setTarget(lookAt);

            if (t >= 1) finish();
        });
    }

    // ── In-engine fail cutscene ────────────────────────────────────────
    // Brief shot outside the store, then hard cut to bench — player lies down.
    // storeData: World.getSpecialBuilding("store"); benchPos: Vector3 bench position.
    function playFailCutscene(scene, playerMesh, cam, storeData, benchPos, onComplete) {
        _active = true;

        const SX      = storeData.pos.x;
        const SZ      = storeData.pos.z;
        const FRONT_Z = SZ - 7;   // south face of store (D=14, half=7)

        const BX = benchPos.x;
        const BZ = benchPos.z;

        // ── Player rig nodes ──────────────────────────────────────────
        const plyLegPivotL = scene.getNodeByName("legPivotL");
        const plyLegPivotR = scene.getNodeByName("legPivotR");
        const plyArmPivotL = scene.getNodeByName("armPivotL");
        const plyArmPivotR = scene.getNodeByName("armPivotR");

        // Reset limbs to rest
        function resetLimbs() {
            if (plyLegPivotL) plyLegPivotL.rotation.x = 0;
            if (plyLegPivotR) plyLegPivotR.rotation.x = 0;
            if (plyArmPivotL) plyArmPivotL.rotation.x = 0;
            if (plyArmPivotR) plyArmPivotR.rotation.x = 0;
        }

        // ── Helpers ───────────────────────────────────────────────────
        function eio(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t) * t; }
        function clamp01(t) { return Math.max(0, Math.min(1, t)); }

        const timers = [];
        function sub(text, dur, delay) { timers.push(setTimeout(() => UI.showText(text, dur), delay)); }

        let phase = 0;
        const phases = [];

        // Camera positions
        // Shot A: side-angle in front of store door, looking at dejected player
        const CAM_STORE_POS = new BABYLON.Vector3(SX - 5, 2.2, FRONT_Z - 4);
        const CAM_STORE_TGT = new BABYLON.Vector3(SX,     1.5, FRONT_Z - 1);
        // Shot B: close bench side-angle (mirrors intro)
        const BENCH_A_POS   = new BABYLON.Vector3(BX + 7, 1.2, BZ - 3);
        const BENCH_A_TGT   = new BABYLON.Vector3(BX,     0.9, BZ);
        // Shot C: pull-back reveal
        const BENCH_B_POS   = new BABYLON.Vector3(BX + 3, 5.5, BZ - 9);
        const BENCH_B_TGT   = new BABYLON.Vector3(BX,     0.7, BZ);

        // Phase 0 — brief shot outside store (1.2 s) ──────────────────
        // Place player just outside the door, facing away (south / dejected)
        // Restore child mesh visibility (hidden during in-store FPV)
        playerMesh.getChildMeshes().forEach(m => { m.isVisible = true; });
        playerMesh.position.set(SX, 1, FRONT_Z - 1.5);
        playerMesh.rotation.y = Math.PI;
        playerMesh.rotation.z = 0;
        resetLimbs();

        let p0e = 0;
        phases.push((dt) => {
            p0e += dt;
            cam.position.copyFrom(CAM_STORE_POS);
            cam.setTarget(CAM_STORE_TGT);
            return p0e > 1200;
        });

        // Phase 1 — hard cut: teleport to bench, instant camera snap ──
        // Runs for exactly one frame to reposition everything.
        let p1done = false;
        phases.push((_dt) => {
            if (!p1done) {
                p1done = true;
                playerMesh.position.set(BX, 1, BZ);
                playerMesh.rotation.y = 0;
                playerMesh.rotation.z = 0;
                resetLimbs();
                cam.position.copyFrom(BENCH_A_POS);
                cam.setTarget(BENCH_A_TGT);
            }
            return true;
        });

        // Phase 2 — lie-down animation (1.2 s) ────────────────────────
        // Seat top = benchPos.y (0.75); cylinder radius = 0.3 → rest center at 1.05
        const LIE_Y = benchPos.y + 0.3;
        let p2e = 0;
        phases.push((dt) => {
            p2e += dt;
            const t = clamp01(p2e / 1200);
            playerMesh.rotation.z = eio(t) * 1.15;
            playerMesh.position.y = 1.0 + (LIE_Y - 1.0) * eio(t);
            cam.position.copyFrom(BENCH_A_POS);
            cam.setTarget(BENCH_A_TGT);
            return t >= 1;
        });

        // Phase 3 — hold close bench shot (1.2 s) ─────────────────────
        let p3e = 0;
        phases.push((dt) => {
            p3e += dt;
            cam.position.copyFrom(BENCH_A_POS);
            cam.setTarget(BENCH_A_TGT);
            return p3e > 1200;
        });

        // Phase 4 — pull back to park wide shot (1.5 s) ───────────────
        let p4e = 0;
        phases.push((dt) => {
            p4e += dt;
            const t = clamp01(p4e / 1500);
            const s = eio(t);
            cam.position.set(
                BENCH_A_POS.x + (BENCH_B_POS.x - BENCH_A_POS.x) * s,
                BENCH_A_POS.y + (BENCH_B_POS.y - BENCH_A_POS.y) * s,
                BENCH_A_POS.z + (BENCH_B_POS.z - BENCH_A_POS.z) * s
            );
            cam.setTarget(new BABYLON.Vector3(
                BENCH_A_TGT.x + (BENCH_B_TGT.x - BENCH_A_TGT.x) * s,
                BENCH_A_TGT.y + (BENCH_B_TGT.y - BENCH_A_TGT.y) * s,
                BENCH_A_TGT.z + (BENCH_B_TGT.z - BENCH_A_TGT.z) * s
            ));
            return t >= 1;
        });

        // Phase 5 — hold wide shot (0.8 s) ────────────────────────────
        let p5e = 0;
        phases.push((dt) => {
            p5e += dt;
            cam.position.copyFrom(BENCH_B_POS);
            cam.setTarget(BENCH_B_TGT);
            return p5e > 800;
        });

        // (no subtitles)

        // ── Timed text ────────────────────────────────────────────────
        sub('"Sorry, you didn\'t get the job."',  3500,   200);   // outside store
        sub('You go back to the bench, tomorrow is another day.', 4500,  3200);   // after bench cut

        // ── Finish ────────────────────────────────────────────────────
        function finish() {
            if (_done) return;
            _done = true;
            timers.forEach(id => clearTimeout(id));
            document.removeEventListener('keydown', onSkipKey, true);
            scene.onBeforeRenderObservable.remove(observer);
            // Leave player lying on the bench
            playerMesh.rotation.z = 1.15;
            playerMesh.position.set(BX, LIE_Y, BZ);
            if (plyLegPivotL) plyLegPivotL.rotation.x = 0;
            if (plyLegPivotR) plyLegPivotR.rotation.x = 0;
            if (plyArmPivotL) plyArmPivotL.rotation.x = 0;
            if (plyArmPivotR) plyArmPivotR.rotation.x = 0;
            _active = false;
            if (onComplete) onComplete();
        }
        let _done = false;

        function onSkipKey(e) {
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                finish();
            }
        }
        document.addEventListener('keydown', onSkipKey, true);

        // Safety: auto-finish after 15 s
        const _safetyTimer = setTimeout(finish, 15000);
        timers.push(_safetyTimer);

        // ── Per-frame observer ─────────────────────────────────────────
        let _lastT = performance.now();
        const observer = scene.onBeforeRenderObservable.add(() => {
            if (_done) return;
            const now = performance.now();
            const dt  = now - _lastT;
            _lastT    = now;
            if (phase >= phases.length) { finish(); return; }
            const done = phases[phase](dt);
            if (done) phase++;
        });
    }

    // ── In-engine fast-food cutscene ──────────────────────────────────
    // Player walks into Burger Barn, orders at the counter, receives a
    // burger bag, and walks back out.
    // fastFoodData: World.getSpecialBuilding("fastfood") — needs .pos and .doorPivot.
    function playFastFoodCutscene(scene, playerMesh, cam, fastFoodData, onComplete) {
        _active = true;

        const FX = fastFoodData.pos.x;
        const FZ = fastFoodData.pos.z;
        const D  = 13;

        const FRONT_Z      = FZ - D / 2;       // south face of building (FZ - 6.5)
        const DOOR_OPEN    = -Math.PI / 2;      // door swings west (same convention as store)
        const COUNTER_N_Z  = FZ - 1.8;         // cashier stands here (north of counter)
        const COUNTER_S_Z  = FZ - 4.5;         // player stops here   (south of counter)

        // ── Cashier NPC ────────────────────────────────────────────────
        // Hide the permanent cashier so only the cutscene's own NPC is visible.
        if (fastFoodData.cashierRoot) fastFoodData.cashierRoot.setEnabled(false);

        const {
            root: cshMesh,
            disposeAll: disposeCsh,
        } = buildSimpleCharacter(scene, {
            skin:  [0.85, 0.65, 0.45],
            hair:  [0.55, 0.30, 0.10],
            shirt: [0.82, 0.22, 0.08],   // Burger Barn red
            pants: [0.15, 0.15, 0.18],
        });
        cshMesh.position.set(FX, 1, COUNTER_N_Z);
        cshMesh.rotation.y = Math.PI;   // faces south toward player

        // Visor cap — same geometry/colours as the permanent cashier NPC
        const _capMat = new BABYLON.StandardMaterial("cs_cshCapMat_" + Math.random(), scene);
        _capMat.diffuseColor = new BABYLON.Color3(0.6, 0.07, 0.0);
        const cshCap = BABYLON.MeshBuilder.CreateCylinder(
            "cs_cshCap", { height: 0.17, diameterTop: 0.34, diameterBottom: 0.46, tessellation: 8 }, scene);
        cshCap.material = _capMat;
        cshCap.position.set(0, 0.85, 0.05);
        cshCap.parent = cshMesh;
        const cshBrim = BABYLON.MeshBuilder.CreateBox(
            "cs_cshBrim", { width: 0.54, height: 0.05, depth: 0.28 }, scene);
        cshBrim.material = _capMat;
        cshBrim.position.set(0, 0.77, 0.26);   // local +Z = front (cashier faces south w/ rot.y=PI)
        cshBrim.parent = cshMesh;

        // ── Burger bag prop ────────────────────────────────────────────
        const burger = BABYLON.MeshBuilder.CreateBox(
            "cs_burger", { width: 0.28, height: 0.24, depth: 0.28 }, scene);
        const burgerMat = new BABYLON.StandardMaterial("cs_burgerMat_" + Math.random(), scene);
        burgerMat.diffuseColor  = new BABYLON.Color3(0.95, 0.62, 0.10);
        burgerMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        burger.material = burgerMat;
        burger.setEnabled(false);

        // ── Place player outside ───────────────────────────────────────
        playerMesh.position.set(FX, 1, FRONT_Z - 2.5);
        playerMesh.rotation.y = 0;
        playerMesh.rotation.z = 0;

        const plyArmPivotR = scene.getNodeByName("armPivotR");

        // ── Helpers ────────────────────────────────────────────────────
        function eio(t)     { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }
        function clamp01(t) { return Math.max(0, Math.min(1, t)); }
        function moveToward(mesh, tx, tz, speed, dt) {
            const dx = tx - mesh.position.x;
            const dz = tz - mesh.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            const step = speed * dt;
            if (dist <= step) { mesh.position.x = tx; mesh.position.z = tz; return true; }
            mesh.position.x += (dx / dist) * step;
            mesh.position.z += (dz / dist) * step;
            mesh.rotation.y  = Math.atan2(dx, dz);
            return false;
        }

        const EYE_STAND = 1.65;
        let   eyeHeight = EYE_STAND;

        function fpvForward() {
            const ey = playerMesh.position.y + eyeHeight;
            cam.position.set(playerMesh.position.x, ey, playerMesh.position.z);
            const fx = Math.sin(playerMesh.rotation.y);
            const fz = Math.cos(playerMesh.rotation.y);
            cam.setTarget(new BABYLON.Vector3(
                playerMesh.position.x + fx * 8, ey - 0.1,
                playerMesh.position.z + fz * 8));
        }
        function fpvLookAt(tx, ty, tz) {
            const ey = playerMesh.position.y + eyeHeight;
            cam.position.set(playerMesh.position.x, ey, playerMesh.position.z);
            cam.setTarget(new BABYLON.Vector3(tx, ty, tz));
        }

        const WALK_SPEED = 0.0036;
        let phase = 0;
        const phases = [];
        const timers = [];
        function sub(text, dur, delay) { timers.push(setTimeout(() => UI.showText(text, dur), delay)); }

        // Phase 0 — pause outside, look at building (1200 ms) ──────────
        let p0e = 0;
        phases.push((dt) => {
            p0e += dt;
            fpvLookAt(FX, 2.2, FRONT_Z);
            return p0e > 1200;
        });

        // Phase 1 — door swings open (800 ms) ───────────────────────────
        const p1DoorStart = fastFoodData.doorPivot ? fastFoodData.doorPivot.rotation.y : 0;
        let p1e = 0;
        phases.push((dt) => {
            p1e += dt;
            const t = clamp01(p1e / 800);
            if (fastFoodData.doorPivot)
                fastFoodData.doorPivot.rotation.y = p1DoorStart + (DOOR_OPEN - p1DoorStart) * eio(t);
            fpvLookAt(FX, 2.0, FRONT_Z);
            return t >= 1;
        });

        // Phase 2 — player walks through door (≈1100 ms) ────────────────
        phases.push((dt) => {
            const arrived = moveToward(playerMesh, FX, FRONT_Z + 1.5, WALK_SPEED, dt);
            fpvForward();
            return arrived;
        });

        // Phase 2.5 — door swings closed behind player (600 ms) ─────────
        let p2de = 0;
        phases.push((dt) => {
            p2de += dt;
            const t = clamp01(p2de / 600);
            if (fastFoodData.doorPivot)
                fastFoodData.doorPivot.rotation.y = DOOR_OPEN * (1 - eio(t));
            fpvForward();
            return t >= 1;
        });

        // Phase 3 — player walks to the counter (≈850 ms) ───────────────
        phases.push((dt) => {
            const arrived = moveToward(playerMesh, FX, COUNTER_S_Z, WALK_SPEED, dt);
            fpvForward();
            return arrived;
        });

        // Phase 4 — both face each other; settle (600 ms) ───────────────
        let p4e = 0;
        phases.push((dt) => {
            p4e += dt;
            playerMesh.rotation.y = 0;
            cshMesh.rotation.y    = Math.PI;
            fpvLookAt(cshMesh.position.x, cshMesh.position.y + 0.55, cshMesh.position.z);
            return p4e > 600;
        });

        // Phase 5 — cashier raises burger bag (1000 ms) ─────────────────
        let p5e = 0;
        phases.push((dt) => {
            p5e += dt;
            const t = clamp01(p5e / 1000);
            if (t > 0.15) {
                burger.setEnabled(true);
                const raise = eio(clamp01((t - 0.15) / 0.85));
                burger.position.set(
                    cshMesh.position.x,
                    cshMesh.position.y + 0.55 + raise * 0.30,
                    cshMesh.position.z + 0.35
                );
            }
            fpvLookAt(cshMesh.position.x, cshMesh.position.y + 0.70, cshMesh.position.z);
            return t >= 1;
        });

        // Phase 6 — burger slides across counter (900 ms) ───────────────
        let p6e = 0;
        phases.push((dt) => {
            p6e += dt;
            const t = clamp01(p6e / 900);
            const bx0 = cshMesh.position.x,      bz0 = cshMesh.position.z + 0.35,      by0 = cshMesh.position.y + 0.85;
            const bx1 = playerMesh.position.x + 0.25, bz1 = playerMesh.position.z + 0.35, by1 = playerMesh.position.y + 0.55;
            burger.position.set(bx0+(bx1-bx0)*eio(t), by0+(by1-by0)*eio(t), bz0+(bz1-bz0)*eio(t));
            fpvLookAt(cshMesh.position.x, cshMesh.position.y + 0.60, cshMesh.position.z);
            return t >= 1;
        });

        // Phase 7 — player reaches out and takes the burger (900 ms) ────
        let p7e = 0;
        phases.push((dt) => {
            p7e += dt;
            const t = clamp01(p7e / 900);
            if (plyArmPivotR) plyArmPivotR.rotation.x = -eio(Math.min(t * 2, 1)) * 0.70;
            burger.position.set(
                playerMesh.position.x + 0.25,
                playerMesh.position.y + 0.45 + eio(t) * 0.05,
                playerMesh.position.z + 0.35
            );
            if (t > 0.85) burger.setEnabled(false);
            fpvLookAt(cshMesh.position.x, cshMesh.position.y + 0.55, cshMesh.position.z);
            return p7e > 900;
        });

        // Phase 8 — arm returns; hold (800 ms) ──────────────────────────
        let p8e = 0;
        phases.push((dt) => {
            p8e += dt;
            const t = clamp01(p8e / 600);
            if (plyArmPivotR) plyArmPivotR.rotation.x = -0.70 * (1 - eio(t));
            fpvLookAt(cshMesh.position.x, cshMesh.position.y + 0.55, cshMesh.position.z);
            return p8e > 800;
        });

        // Phase 9 — door opens; player walks out (≈1700 ms) ─────────────
        let p9e = 0;
        phases.push((dt) => {
            p9e += dt;
            eyeHeight = EYE_STAND;
            if (fastFoodData.doorPivot)
                fastFoodData.doorPivot.rotation.y = DOOR_OPEN * eio(clamp01(p9e / 500));
            const arrived = moveToward(playerMesh, FX, FRONT_Z - 2.5, WALK_SPEED, dt);
            fpvForward();
            return arrived;
        });

        // Phase 10 — door swings shut (600 ms) ───────────────────────────
        let p10e = 0;
        phases.push((dt) => {
            p10e += dt;
            const t = clamp01(p10e / 600);
            if (fastFoodData.doorPivot)
                fastFoodData.doorPivot.rotation.y = DOOR_OPEN * (1 - eio(t));
            fpvForward();
            return t >= 1;
        });

        // Phase 11 — brief pause (500 ms) ────────────────────────────────
        let p11e = 0;
        phases.push((dt) => { p11e += dt; return p11e > 500; });

        // ── Subtitle schedule ──────────────────────────────────────────
        // p0=1200 p1=2000 p2≈3100 p2.5=3700 p3≈4550 p4=5150
        // p5=6150 p6=7050 p7=7950 p8=8750 p9≈10450 p10=11050 p11=11550
        sub("You push through the door of Burger Barn...",         2200,   300);
        sub("The smell hits you like a warm, delicious wall.",      2500,  3200);
        sub("\"Welcome! What can I get ya?\"",                      2000,  5200);
        sub("\"Classic combo, please.\"  You hand over $10.",       2200,  6200);
        sub("Hot, fresh, and absolutely perfect.",                  2500,  8000);

        // ── Finish ──────────────────────────────────────────────────────
        function finish() {
            if (_done) return;
            _done = true;
            timers.forEach(id => clearTimeout(id));
            UI.showText(' ', 1);
            document.removeEventListener('keydown', onSkipKey, true);
            scene.onBeforeRenderObservable.remove(observer);
            playerMesh.position.y = 1;
            eyeHeight = EYE_STAND;
            if (plyArmPivotR) plyArmPivotR.rotation.x = 0;
            burger.dispose();
            cshCap.dispose();
            cshBrim.dispose();
            disposeCsh();
            // Restore permanent cashier
            if (fastFoodData.cashierRoot) fastFoodData.cashierRoot.setEnabled(true);
            _active = false;
            if (onComplete) onComplete();
        }
        let _done = false;

        function onSkipKey(e) {
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                finish();
            }
        }
        document.addEventListener('keydown', onSkipKey, true);

        const _safetyTimer = setTimeout(finish, 25000);
        timers.push(_safetyTimer);

        let _lastT = performance.now();
        const observer = scene.onBeforeRenderObservable.add(() => {
            if (_done) return;
            const now = performance.now();
            const dt  = now - _lastT;
            _lastT    = now;
            if (phase >= phases.length) { finish(); return; }
            const done = phases[phase](dt);
            if (done) phase++;
        });
    }

    // ── In-engine broke cutscene ──────────────────────────────────────
    // Player runs out of money. They slump to the ground wherever they are;
    // camera pulls back wide. No teleport — happens in place.
    function playBrokeCutscene(scene, playerMesh, cam, benchPos, onComplete) {
        _active = true;
        document.exitPointerLock?.();

        const plyLegPivotL = scene.getNodeByName("legPivotL");
        const plyLegPivotR = scene.getNodeByName("legPivotR");
        const plyArmPivotL = scene.getNodeByName("armPivotL");
        const plyArmPivotR = scene.getNodeByName("armPivotR");

        function resetLimbs() {
            if (plyLegPivotL) plyLegPivotL.rotation.x = 0;
            if (plyLegPivotR) plyLegPivotR.rotation.x = 0;
            if (plyArmPivotL) plyArmPivotL.rotation.x = 0;
            if (plyArmPivotR) plyArmPivotR.rotation.x = 0;
        }

        function eio(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
        function clamp01(t) { return Math.max(0, Math.min(1, t)); }

        const timers = [];
        function sub(text, dur, delay) { timers.push(setTimeout(() => UI.showText(text, dur), delay)); }

        // Re-enable player mesh (may have been disabled before triggering game over)
        playerMesh.setEnabled(true);
        playerMesh.getChildMeshes().forEach(m => { m.isVisible = true; });
        playerMesh.rotation.z = 0;
        resetLimbs();
        const PX = playerMesh.position.x;
        const PZ = playerMesh.position.z;

        // Camera shots — bench
        const BX = benchPos.x;
        const BZ = benchPos.z;
        const LIE_Y = benchPos.y + 0.3;
        const BENCH_POS = new BABYLON.Vector3(BX + 7, 1.2, BZ - 3);
        const BENCH_TGT = new BABYLON.Vector3(BX,     0.9, BZ);
        const BENCH_WIDE_POS = new BABYLON.Vector3(BX + 3, 5.5, BZ - 9);
        const BENCH_WIDE_TGT = new BABYLON.Vector3(BX,     0.7, BZ);

        // Camera: side angle that follows player as they walk away
        function sideCamera() {
            cam.position.set(playerMesh.position.x + 7, 2.2, playerMesh.position.z - 2);
            cam.setTarget(new BABYLON.Vector3(playerMesh.position.x, 1.4, playerMesh.position.z));
        }

        function moveToward(tx, tz, speed, dt) {
            const dx = tx - playerMesh.position.x;
            const dz = tz - playerMesh.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            const step = speed * dt;
            if (dist <= step) { playerMesh.position.x = tx; playerMesh.position.z = tz; return true; }
            playerMesh.position.x += (dx / dist) * step;
            playerMesh.position.z += (dz / dist) * step;
            playerMesh.rotation.y = Math.atan2(dx, dz);
            return false;
        }

        // Walk target: southward ~10 units, staying in the road between buildings
        const WALK_TGT_Z = PZ - 10;
        let walkCycle = 0;

        let phase = 0;
        const phases = [];

        // Phase 0 — player pauses, camera gets side angle (600 ms) ────
        let p0e = 0;
        phases.push((dt) => {
            p0e += dt;
            playerMesh.rotation.y = Math.PI;  // face south (away)
            playerMesh.rotation.z = 0;
            sideCamera();
            return p0e > 600;
        });

        // Phase 1 — player walks sadly away (≈3600 ms) ─────────────────
        const WALK_SPEED = 0.0024;
        phases.push((dt) => {
            walkCycle += dt * 0.004;
            const swing = Math.sin(walkCycle) * 0.35;
            if (plyLegPivotL) plyLegPivotL.rotation.x =  swing;
            if (plyLegPivotR) plyLegPivotR.rotation.x = -swing;
            if (plyArmPivotL) plyArmPivotL.rotation.x = -swing * 0.45;
            if (plyArmPivotR) plyArmPivotR.rotation.x =  swing * 0.45;
            const arrived = moveToward(PX, WALK_TGT_Z, WALK_SPEED, dt);
            sideCamera();
            return arrived;
        });

        // Phase 2 — player stops, hold shot (700 ms) ───────────────────
        let p2e = 0;
        phases.push((dt) => {
            p2e += dt;
            resetLimbs();
            sideCamera();
            return p2e > 700;
        });

        // Phase 3 — hard cut to bench, player already lying (1 frame) ─
        let p3done = false;
        phases.push((_dt) => {
            if (!p3done) {
                p3done = true;
                playerMesh.position.set(BX, LIE_Y, BZ);
                playerMesh.rotation.y = 0;
                playerMesh.rotation.z = 1.3;
                cam.position.copyFrom(BENCH_POS);
                cam.setTarget(BENCH_TGT);
            }
            return true;
        });

        // Phase 4 — hold bench close shot (1200 ms) ───────────────────
        let p4e = 0;
        phases.push((dt) => {
            p4e += dt;
            cam.position.copyFrom(BENCH_POS);
            cam.setTarget(BENCH_TGT);
            return p4e > 1200;
        });

        // Phase 5 — pull back to park wide (1500 ms) ──────────────────
        let p5e = 0;
        phases.push((dt) => {
            p5e += dt;
            const t = clamp01(p5e / 1500);
            const s = eio(t);
            cam.position.set(
                BENCH_POS.x + (BENCH_WIDE_POS.x - BENCH_POS.x) * s,
                BENCH_POS.y + (BENCH_WIDE_POS.y - BENCH_POS.y) * s,
                BENCH_POS.z + (BENCH_WIDE_POS.z - BENCH_POS.z) * s
            );
            cam.setTarget(new BABYLON.Vector3(
                BENCH_TGT.x + (BENCH_WIDE_TGT.x - BENCH_TGT.x) * s,
                BENCH_TGT.y + (BENCH_WIDE_TGT.y - BENCH_TGT.y) * s,
                BENCH_TGT.z + (BENCH_WIDE_TGT.z - BENCH_TGT.z) * s
            ));
            return t >= 1;
        });

        // Phase 6 — hold wide (900 ms) ─────────────────────────────────
        let p6e = 0;
        phases.push((dt) => {
            p6e += dt;
            cam.position.copyFrom(BENCH_WIDE_POS);
            cam.setTarget(BENCH_WIDE_TGT);
            return p6e > 900;
        });

        sub('Your money is gone.',          3000,  300);
        sub('You trudge away, alone.',       3000, 2000);
        sub('"Tomorrow is another day…"',    4000, 5200);

        function finish() {
            if (_done) return;
            _done = true;
            timers.forEach(id => clearTimeout(id));
            document.removeEventListener('keydown', onSkipKey, true);
            scene.onBeforeRenderObservable.remove(observer);
            playerMesh.rotation.z = 1.3;
            playerMesh.position.set(BX, LIE_Y, BZ);
            resetLimbs();
            _active = false;
            if (onComplete) onComplete();
        }
        let _done = false;

        function onSkipKey(e) {
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
                e.stopPropagation(); e.preventDefault(); finish();
            }
        }
        document.addEventListener('keydown', onSkipKey, true);
        timers.push(setTimeout(finish, 15000));

        let _lastT = performance.now();
        const observer = scene.onBeforeRenderObservable.add(() => {
            if (_done) return;
            const now = performance.now();
            const dt  = now - _lastT;
            _lastT    = now;
            if (phase >= phases.length) { finish(); return; }
            const done = phases[phase](dt);
            if (done) phase++;
        });
    }

    // ── Public: query active state ─────────────────────────────────────
    function isActive() {
        return _active;
    }

    return { play, isActive, playIntroCutscene, playInterviewCutscene, playPaydayCutscene, playFailCutscene, playFastFoodCutscene, playBrokeCutscene };
})();
