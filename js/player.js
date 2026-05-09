/**
 * player.js — Character mesh, WASD movement, collision, interaction
 */
const Player = (() => {
    let mesh = null;
    let scene = null;
    const SPEED = 0.169;
    const GRAVITY = -0.0225;
    let velY = 0;
    let enabled = true;

    // Walking animation state
    let walkTime = 0;
    let legPivotL = null, legPivotR = null;
    let armPivotL = null, armPivotR = null;

    function init(babylonScene) {
        scene = babylonScene;

        // Helper: create a StandardMaterial with a diffuse colour
        function mkMat(name, r, g, b) {
            const m = new BABYLON.StandardMaterial(name, scene);
            m.diffuseColor = new BABYLON.Color3(r, g, b);
            return m;
        }

        // Colour palette
        const SUIT  = [0.13, 0.15, 0.22];  // dark navy — jacket & trousers
        const SHIRT = [0.95, 0.95, 0.95];  // white dress shirt
        const TIE   = [0.75, 0.10, 0.10];  // red tie
        const SKIN  = [0.90, 0.75, 0.60];  // skin tone
        const SHOE  = [0.08, 0.07, 0.07];  // near-black shoes
        const HAIR  = [0.22, 0.14, 0.08];  // dark-brown hair

        // ── Root: invisible cylinder used as collision hull ───────────
        const body = BABYLON.MeshBuilder.CreateCylinder("playerBody", {
            height: 1.6, diameter: 0.6, tessellation: 8,
        }, scene);
        const rootMat = new BABYLON.StandardMaterial("playerRootMat", scene);
        rootMat.alpha = 0;
        body.material = rootMat;

        // ── Left leg / shoe (pivot at hip) ───────────────────────────
        legPivotL = new BABYLON.TransformNode("legPivotL", scene);
        legPivotL.position.set(-0.145, -0.19, 0);
        legPivotL.parent = body;

        const legL = BABYLON.MeshBuilder.CreateCylinder("legL", { height: 0.58, diameter: 0.22, tessellation: 8 }, scene);
        legL.material = mkMat("legMatL", ...SUIT);
        legL.position.set(0, -0.29, 0);
        legL.parent = legPivotL;

        const shoeL = BABYLON.MeshBuilder.CreateBox("shoeL", { width: 0.20, height: 0.09, depth: 0.30 }, scene);
        shoeL.material = mkMat("shoeMatL", ...SHOE);
        shoeL.position.set(0, -0.60, 0.04);
        shoeL.parent = legPivotL;

        // ── Right leg / shoe (pivot at hip) ───────────────────────────
        legPivotR = new BABYLON.TransformNode("legPivotR", scene);
        legPivotR.position.set(0.145, -0.19, 0);
        legPivotR.parent = body;

        const legR = BABYLON.MeshBuilder.CreateCylinder("legR", { height: 0.58, diameter: 0.22, tessellation: 8 }, scene);
        legR.material = mkMat("legMatR", ...SUIT);
        legR.position.set(0, -0.29, 0);
        legR.parent = legPivotR;

        const shoeR = BABYLON.MeshBuilder.CreateBox("shoeR", { width: 0.20, height: 0.09, depth: 0.30 }, scene);
        shoeR.material = mkMat("shoeMatR", ...SHOE);
        shoeR.position.set(0, -0.60, 0.04);
        shoeR.parent = legPivotR;

        // ── Torso / suit jacket ───────────────────────────────────────
        const torso = BABYLON.MeshBuilder.CreateBox("torso", { width: 0.55, height: 0.60, depth: 0.30 }, scene);
        torso.material = mkMat("torsoMat", ...SUIT);
        torso.position.y = 0.10;
        torso.parent = body;

        // ── White shirt front ─────────────────────────────────────────
        const shirt = BABYLON.MeshBuilder.CreateBox("shirt", { width: 0.16, height: 0.52, depth: 0.02 }, scene);
        shirt.material = mkMat("shirtMat", ...SHIRT);
        shirt.position.set(0, 0.10, 0.155);
        shirt.parent = body;

        // ── Tie ───────────────────────────────────────────────────────
        const tie = BABYLON.MeshBuilder.CreateBox("tie", { width: 0.065, height: 0.36, depth: 0.02 }, scene);
        tie.material = mkMat("tieMat", ...TIE);
        tie.position.set(0, 0.04, 0.168);
        tie.parent = body;

        // ── Left arm / hand (pivot at shoulder) ──────────────────────
        armPivotL = new BABYLON.TransformNode("armPivotL", scene);
        armPivotL.position.set(-0.305, 0.41, 0);
        armPivotL.rotation.z = -0.15;  // outward splay
        armPivotL.parent = body;

        const armL = BABYLON.MeshBuilder.CreateCylinder("armL", { height: 0.52, diameter: 0.17, tessellation: 8 }, scene);
        armL.material = mkMat("armMatL", ...SUIT);
        armL.position.set(0, -0.26, 0);
        armL.parent = armPivotL;

        const handL = BABYLON.MeshBuilder.CreateSphere("handL", { diameter: 0.16, segments: 5 }, scene);
        handL.material = mkMat("handMatL", ...SKIN);
        handL.position.set(-0.04, -0.54, 0);
        handL.parent = armPivotL;

        // ── Right arm / hand (pivot at shoulder) ─────────────────────
        armPivotR = new BABYLON.TransformNode("armPivotR", scene);
        armPivotR.position.set(0.305, 0.41, 0);
        armPivotR.rotation.z = 0.15;   // outward splay
        armPivotR.parent = body;

        const armR = BABYLON.MeshBuilder.CreateCylinder("armR", { height: 0.52, diameter: 0.17, tessellation: 8 }, scene);
        armR.material = mkMat("armMatR", ...SUIT);
        armR.position.set(0, -0.26, 0);
        armR.parent = armPivotR;

        const handR = BABYLON.MeshBuilder.CreateSphere("handR", { diameter: 0.16, segments: 5 }, scene);
        handR.material = mkMat("handMatR", ...SKIN);
        handR.position.set(0.04, -0.54, 0);
        handR.parent = armPivotR;

        // ── Neck ──────────────────────────────────────────────────────
        const neck = BABYLON.MeshBuilder.CreateCylinder("neck", { height: 0.14, diameter: 0.19, tessellation: 8 }, scene);
        neck.material = mkMat("neckMat", ...SKIN);
        neck.position.y = 0.44;
        neck.parent = body;

        // ── Head ──────────────────────────────────────────────────────
        const head = BABYLON.MeshBuilder.CreateSphere("playerHead", { diameter: 0.50, segments: 8 }, scene);
        head.material = mkMat("headMat", ...SKIN);
        head.position.y = 0.64;
        head.parent = body;

        // ── Hair (flattened cap on top of head) ───────────────────────
        const hair = BABYLON.MeshBuilder.CreateSphere("hair", { diameter: 0.52, segments: 6 }, scene);
        hair.material = mkMat("hairMat", ...HAIR);
        hair.position.set(0, 0.71, 0);
        hair.scaling.y = 0.5;
        hair.parent = body;

        mesh = body;
        mesh.ellipsoid = new BABYLON.Vector3(0.4, 0.85, 0.4);
        mesh.ellipsoidOffset = new BABYLON.Vector3(0, 0.85, 0);
        mesh.checkCollisions = true;

        const spawnPos = World.getPlayerSpawnPos();
        mesh.position.copyFrom(spawnPos);

        return mesh;
    }

    const TURN_SPEED = 0.04; // radians per frame
    let _fpvMode = false;   // when true, A/D keys don't rotate (mouse does it)

    // ── Knockback state ───────────────────────────────────────────────
    let knockbackVelX = 0;
    let knockbackVelZ = 0;
    const KNOCKBACK_FORCE = 0.75;   // initial speed applied on hit
    const KNOCKBACK_DECAY = 0.88;  // per-frame velocity decay
    const KNOCKBACK_MIN   = 0.005; // velocity magnitude below which we zero out

    function applyKnockback(dirX, dirZ) {
        // Don't re-trigger while the player is already being knocked back
        if (knockbackVelX * knockbackVelX + knockbackVelZ * knockbackVelZ > 0.01) return;
        const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (len < 0.001) return;
        knockbackVelX = (dirX / len) * KNOCKBACK_FORCE;
        knockbackVelZ = (dirZ / len) * KNOCKBACK_FORCE;
    }

    function update(dt) {
        if (!mesh || !enabled) return;

        // ── No rotation via keys — A/D and arrows all strafe ─────────

        // ── Forward / backward along character's own facing direction ─
        let moveZ = 0;
        if (Input.isHeld("KeyW") || Input.isHeld("ArrowUp"))   moveZ =  1;
        if (Input.isHeld("KeyS") || Input.isHeld("ArrowDown")) moveZ = -1;

        // ── Strafe left / right (all modes) ──────────────────────────
        let moveX = 0;
        if (Input.isHeld("KeyA") || Input.isHeld("ArrowLeft"))  moveX = -1;
        if (Input.isHeld("KeyD") || Input.isHeld("ArrowRight")) moveX =  1;

        // Forward vector
        const fy = mesh.rotation.y;
        const fx = Math.sin(fy) * moveZ * SPEED + Math.cos(fy) * moveX * SPEED;
        const fz = Math.cos(fy) * moveZ * SPEED - Math.sin(fy) * moveX * SPEED;

        velY += GRAVITY * dt;
        mesh.moveWithCollisions(new BABYLON.Vector3(
            (fx + knockbackVelX) * dt,
            velY * dt,
            (fz + knockbackVelZ) * dt
        ));

        // Decay knockback (frame-rate independent)
        const kbDecay = Math.pow(KNOCKBACK_DECAY, dt);
        knockbackVelX *= kbDecay;
        knockbackVelZ *= kbDecay;
        if (Math.abs(knockbackVelX) < KNOCKBACK_MIN && Math.abs(knockbackVelZ) < KNOCKBACK_MIN) {
            knockbackVelX = 0;
            knockbackVelZ = 0;
        }

        if (mesh.position.y < 1.05) {
            mesh.position.y = 1.0;
            velY = 0;
        }

        // ── Walking animation ─────────────────────────────────────────
        const isWalking = moveZ !== 0 || moveX !== 0;
        if (isWalking) {
            walkTime += 0.225 * dt;
            const legSwing = Math.sin(walkTime) * 0.45;
            legPivotL.rotation.x =  legSwing;
            legPivotR.rotation.x = -legSwing;
            // Arms swing opposite to legs (right arm forward with left leg)
            armPivotL.rotation.x = -legSwing * 0.5;
            armPivotR.rotation.x =  legSwing * 0.5;
        } else {
            // Smoothly return limbs to rest (idle) — frame-rate independent
            const limbDecay = Math.pow(0.8, dt);
            legPivotL.rotation.x *= limbDecay;
            legPivotR.rotation.x *= limbDecay;
            armPivotL.rotation.x *= limbDecay;
            armPivotR.rotation.x *= limbDecay;
            if (Math.abs(legPivotL.rotation.x) < 0.005) legPivotL.rotation.x = 0;
            if (Math.abs(legPivotR.rotation.x) < 0.005) legPivotR.rotation.x = 0;
            if (Math.abs(armPivotL.rotation.x) < 0.005) armPivotL.rotation.x = 0;
            if (Math.abs(armPivotR.rotation.x) < 0.005) armPivotR.rotation.x = 0;
        }
    }

    function setEnabled(val) {
        enabled = val;
        if (mesh) mesh.setEnabled(val);
    }

    function setFPV(val) { _fpvMode = !!val; }

    function getMesh() { return mesh; }

    function getPosition() {
        return mesh ? mesh.position : BABYLON.Vector3.Zero();
    }

    function teleport(pos) {
        if (mesh) mesh.position.copyFrom(pos);
    }

    return { init, update, setEnabled, setFPV, getMesh, getPosition, teleport, applyKnockback };
})();
