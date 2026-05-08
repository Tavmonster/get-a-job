/**
 * npc.js — Pedestrian NPCs walking on city sidewalks
 *
 * Each NPC follows a closed loop of explicit [x, z] waypoints.
 *
 * Road centrelines: ROAD_X = ROAD_Z = [-75,-45,-15,15,45,75]
 * Road half-width = 4  →  road edges at centreline ± 4
 * Sidewalk offset = 5  →  NPCs at centreline ± 5 (1 unit outside the road,
 *   ~4.5 units from nearest building face with minimum-width buildings).
 *
 * Eight NPCs loop clockwise around a city block perimeter, staying on the
 * inner sidewalk rectangle — they never enter a road.
 *
 * Four NPCs have cross-road routes: they walk along one sidewalk then turn
 * perpendicular, passing through the road centreline to the opposite
 * sidewalk, before continuing.
 */
const NPCSystem = (() => {

    const SPEED = 0.0375;  // units per frame
    const REACH = 0.8;   // distance to count waypoint as reached
    let _frame  = 0;

    // Appearance variants: skin, hair, shirt, pants  (RGB 0-1)
    const VARIANTS = [
        { skin: [0.90, 0.75, 0.60], hair: [0.22, 0.14, 0.08], shirt: [0.20, 0.50, 0.90], pants: [0.20, 0.20, 0.22] },
        { skin: [0.55, 0.35, 0.20], hair: [0.05, 0.03, 0.02], shirt: [0.90, 0.30, 0.20], pants: [0.15, 0.25, 0.40] },
        { skin: [0.85, 0.70, 0.55], hair: [0.60, 0.40, 0.20], shirt: [0.20, 0.70, 0.30], pants: [0.28, 0.28, 0.30] },
        { skin: [0.40, 0.28, 0.18], hair: [0.15, 0.10, 0.05], shirt: [0.90, 0.80, 0.20], pants: [0.20, 0.30, 0.20] },
        { skin: [0.95, 0.80, 0.68], hair: [0.85, 0.70, 0.50], shirt: [0.70, 0.20, 0.70], pants: [0.25, 0.20, 0.35] },
        { skin: [0.65, 0.45, 0.30], hair: [0.10, 0.08, 0.05], shirt: [0.95, 0.95, 0.95], pants: [0.15, 0.15, 0.18] },
        { skin: [0.75, 0.60, 0.45], hair: [0.45, 0.30, 0.15], shirt: [0.20, 0.55, 0.55], pants: [0.22, 0.22, 0.28] },
        { skin: [0.88, 0.73, 0.58], hair: [0.30, 0.20, 0.10], shirt: [0.85, 0.45, 0.20], pants: [0.18, 0.22, 0.18] },
        { skin: [0.72, 0.55, 0.38], hair: [0.55, 0.35, 0.10], shirt: [0.30, 0.60, 0.80], pants: [0.18, 0.18, 0.25] },
        { skin: [0.92, 0.78, 0.62], hair: [0.18, 0.12, 0.06], shirt: [0.80, 0.25, 0.35], pants: [0.25, 0.25, 0.20] },
        { skin: [0.50, 0.33, 0.20], hair: [0.08, 0.05, 0.03], shirt: [0.40, 0.75, 0.40], pants: [0.20, 0.28, 0.22] },
        { skin: [0.82, 0.65, 0.48], hair: [0.70, 0.50, 0.25], shirt: [0.90, 0.75, 0.20], pants: [0.30, 0.22, 0.18] },
    ];

    // Closed-loop waypoint routes.  Each entry is an array of [x, z] pairs;
    // the NPC advances through them in order and wraps back to index 0.
    //
    // Road edge = centreline ± 4.  Offset 3.5 keeps NPCs on the dark road
    // surface right at the kerb edge so they look like pavement walkers.
    //
    // Two-waypoint routes produce a natural back-and-forth pace.
    // Cross-road routes have an intermediate point at the road centreline
    // so the NPC visibly crosses the street.
    const SW = 5;   // sidewalk centreline — world.js places sidewalk strips at road_centre ± (4 + 1)
    const ROUTES = [
        // ── Road-side back-and-forth (8 NPCs) ─────────────────────────────
        // Horizontal roads — one NPC per road, alternating N/S side
        [ [-60, -75 - SW], [ 60, -75 - SW] ],  // road Z=-75, north kerb
        [ [-60, -45 + SW], [ 60, -45 + SW] ],  // road Z=-45, south kerb
        [ [-60, -15 - SW], [ 60, -15 - SW] ],  // road Z=-15, north kerb
        [ [-60,  15 + SW], [ 60,  15 + SW] ],  // road Z=+15, south kerb
        // Vertical roads — one NPC per road, alternating E/W side
        [ [-75 + SW, -60], [-75 + SW,  60] ],  // road X=-75, east kerb
        [ [-45 - SW, -60], [-45 - SW,  60] ],  // road X=-45, west kerb
        [ [ 15 - SW, -60], [ 15 - SW,  60] ],  // road X=+15, west kerb
        [ [ 45 + SW, -60], [ 45 + SW,  60] ],  // road X=+45, east kerb

    ];

    const npcs = [];

    // ── Helpers ────────────────────────────────────────────────────────

    function mkMat(scene, r, g, b) {
        const m = new BABYLON.StandardMaterial("npcMat_" + Math.random(), scene);
        m.diffuseColor  = new BABYLON.Color3(r, g, b);
        m.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);
        return m;
    }

    // ── Mesh builder ───────────────────────────────────────────────────

    function buildNPC(scene, v) {
        // Invisible root used for positioning only (no collision — NPCs ghost through)
        const root = BABYLON.MeshBuilder.CreateCylinder("npcRoot", {
            height: 1.6, diameter: 0.6, tessellation: 8,
        }, scene);
        const rootMat = new BABYLON.StandardMaterial("npcRootAlpha_" + Math.random(), scene);
        rootMat.alpha = 0;
        root.material = rootMat;
        root.isPickable = false;

        // ── Legs ──────────────────────────────────────────────────────
        const legL = BABYLON.MeshBuilder.CreateCylinder("npcLegL", { height: 0.55, diameter: 0.21, tessellation: 8 }, scene);
        legL.material = mkMat(scene, ...v.pants);
        legL.position.set(-0.14, -0.47, 0);
        legL.parent = root;
        legL.isPickable = false;

        const legR = BABYLON.MeshBuilder.CreateCylinder("npcLegR", { height: 0.55, diameter: 0.21, tessellation: 8 }, scene);
        legR.material = mkMat(scene, ...v.pants);
        legR.position.set(0.14, -0.47, 0);
        legR.parent = root;
        legR.isPickable = false;

        // ── Shoes ─────────────────────────────────────────────────────
        const shoeL = BABYLON.MeshBuilder.CreateBox("npcShoeL", { width: 0.18, height: 0.08, depth: 0.28 }, scene);
        shoeL.material = mkMat(scene, 0.08, 0.07, 0.07);
        shoeL.position.set(-0.14, -0.77, 0.04);
        shoeL.parent = root;
        shoeL.isPickable = false;

        const shoeR = BABYLON.MeshBuilder.CreateBox("npcShoeR", { width: 0.18, height: 0.08, depth: 0.28 }, scene);
        shoeR.material = mkMat(scene, 0.08, 0.07, 0.07);
        shoeR.position.set(0.14, -0.77, 0.04);
        shoeR.parent = root;
        shoeR.isPickable = false;

        // ── Torso ─────────────────────────────────────────────────────
        const torso = BABYLON.MeshBuilder.CreateBox("npcTorso", { width: 0.50, height: 0.56, depth: 0.27 }, scene);
        torso.material = mkMat(scene, ...v.shirt);
        torso.position.y = 0.08;
        torso.parent = root;
        torso.isPickable = false;

        // ── Arms ──────────────────────────────────────────────────────
        const armL = BABYLON.MeshBuilder.CreateCylinder("npcArmL", { height: 0.48, diameter: 0.16, tessellation: 8 }, scene);
        armL.material = mkMat(scene, ...v.shirt);
        armL.rotation.z = -0.15;
        armL.position.set(-0.30, 0.13, 0);
        armL.parent = root;
        armL.isPickable = false;

        const armR = BABYLON.MeshBuilder.CreateCylinder("npcArmR", { height: 0.48, diameter: 0.16, tessellation: 8 }, scene);
        armR.material = mkMat(scene, ...v.shirt);
        armR.rotation.z = 0.15;
        armR.position.set(0.30, 0.13, 0);
        armR.parent = root;
        armR.isPickable = false;

        // ── Neck ──────────────────────────────────────────────────────
        const neck = BABYLON.MeshBuilder.CreateCylinder("npcNeck", { height: 0.13, diameter: 0.18, tessellation: 8 }, scene);
        neck.material = mkMat(scene, ...v.skin);
        neck.position.y = 0.42;
        neck.parent = root;
        neck.isPickable = false;

        // ── Head ──────────────────────────────────────────────────────
        const head = BABYLON.MeshBuilder.CreateSphere("npcHead", { diameter: 0.46, segments: 8 }, scene);
        head.material = mkMat(scene, ...v.skin);
        head.position.y = 0.60;
        head.parent = root;
        head.isPickable = false;

        // ── Hair ──────────────────────────────────────────────────────
        const hair = BABYLON.MeshBuilder.CreateSphere("npcHair", { diameter: 0.48, segments: 6 }, scene);
        hair.material = mkMat(scene, ...v.hair);
        hair.position.set(0, 0.67, 0);
        hair.scaling.y = 0.5;
        hair.parent = root;
        hair.isPickable = false;

        return { root, legL, legR, armL, armR };
    }

    // ── Public API ────────────────────────────────────────────────────

    function init(scene) {
        ROUTES.forEach((route, i) => {
            const v = VARIANTS[i % VARIANTS.length];
            const parts = buildNPC(scene, v);
            const { root } = parts;

            // Stagger start positions so NPCs on the same block aren't bunched
            const startIdx = Math.floor(Math.random() * route.length);
            root.position.set(route[startIdx][0], 1, route[startIdx][1]);

            npcs.push({
                root,
                legL:   parts.legL,
                legR:   parts.legR,
                armL:   parts.armL,
                armR:   parts.armR,
                route,
                wpIdx:  (startIdx + 1) % route.length,
                phase:  Math.random() * Math.PI * 2,
            });
        });
    }

    function update() {
        _frame++;
        const animFrame = (_frame & 1) === 0; // update limb rotations every other frame

        for (const npc of npcs) {
            const pos = npc.root.position;
            const wp  = npc.route[npc.wpIdx];
            const tx  = wp[0];
            const tz  = wp[1];

            const dx   = tx - pos.x;
            const dz   = tz - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < REACH) {
                pos.x  = tx;
                pos.z  = tz;
                pos.y  = 1.0;
                npc.wpIdx = (npc.wpIdx + 1) % npc.route.length;

                if (animFrame) {
                    npc.legL.rotation.x = 0;
                    npc.legR.rotation.x = 0;
                    npc.armL.rotation.x = 0;
                    npc.armR.rotation.x = 0;
                }
            } else {
                npc.root.rotation.y = Math.atan2(dx, dz);
                pos.x += (dx / dist) * SPEED;
                pos.z += (dz / dist) * SPEED;
                pos.y  = 1.0;

                if (animFrame) {
                    npc.phase += 0.20; // doubled since we update half as often
                    const swing = Math.sin(npc.phase) * 0.45;
                    npc.legL.rotation.x =  swing;
                    npc.legR.rotation.x = -swing;
                    npc.armL.rotation.x = -swing * 0.6;
                    npc.armR.rotation.x =  swing * 0.6;
                }
            }
        }
    }

    /**
     * Returns true if any NPC root position is within `radius` world units
     * of the given (tx, tz) position.  Used by the truck for pedestrian-hit
     * detection each frame.
     */
    function checkTruckHit(tx, tz, radius) {
        const r2 = radius * radius;
        for (const npc of npcs) {
            const dx = npc.root.position.x - tx;
            const dz = npc.root.position.z - tz;
            if (dx * dx + dz * dz < r2) return true;
        }
        return false;
    }

    return { init, update, checkTruckHit };
})();
