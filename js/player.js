/**
 * player.js — Character mesh, WASD movement, collision, interaction
 */
const Player = (() => {
    let mesh = null;
    let scene = null;
    const SPEED = 0.15;
    const GRAVITY = -0.015;
    let velY = 0;
    let enabled = true;

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

        // ── Left leg / shoe ───────────────────────────────────────────
        const legL = BABYLON.MeshBuilder.CreateCylinder("legL", { height: 0.58, diameter: 0.22, tessellation: 8 }, scene);
        legL.material = mkMat("legMatL", ...SUIT);
        legL.position.set(-0.145, -0.48, 0);
        legL.parent = body;

        const shoeL = BABYLON.MeshBuilder.CreateBox("shoeL", { width: 0.20, height: 0.09, depth: 0.30 }, scene);
        shoeL.material = mkMat("shoeMatL", ...SHOE);
        shoeL.position.set(-0.145, -0.79, 0.04);
        shoeL.parent = body;

        // ── Right leg / shoe ──────────────────────────────────────────
        const legR = BABYLON.MeshBuilder.CreateCylinder("legR", { height: 0.58, diameter: 0.22, tessellation: 8 }, scene);
        legR.material = mkMat("legMatR", ...SUIT);
        legR.position.set(0.145, -0.48, 0);
        legR.parent = body;

        const shoeR = BABYLON.MeshBuilder.CreateBox("shoeR", { width: 0.20, height: 0.09, depth: 0.30 }, scene);
        shoeR.material = mkMat("shoeMatR", ...SHOE);
        shoeR.position.set(0.145, -0.79, 0.04);
        shoeR.parent = body;

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

        // ── Left arm / hand ───────────────────────────────────────────
        const armL = BABYLON.MeshBuilder.CreateCylinder("armL", { height: 0.52, diameter: 0.17, tessellation: 8 }, scene);
        armL.material = mkMat("armMatL", ...SUIT);
        armL.rotation.z = -0.15;  // splay outward (top toward -X)
        armL.position.set(-0.305, 0.15, 0);
        armL.parent = body;

        const handL = BABYLON.MeshBuilder.CreateSphere("handL", { diameter: 0.16, segments: 5 }, scene);
        handL.material = mkMat("handMatL", ...SKIN);
        handL.position.set(-0.345, -0.13, 0);
        handL.parent = body;

        // ── Right arm / hand ──────────────────────────────────────────
        const armR = BABYLON.MeshBuilder.CreateCylinder("armR", { height: 0.52, diameter: 0.17, tessellation: 8 }, scene);
        armR.material = mkMat("armMatR", ...SUIT);
        armR.rotation.z = 0.15;   // splay outward (top toward +X)
        armR.position.set(0.305, 0.15, 0);
        armR.parent = body;

        const handR = BABYLON.MeshBuilder.CreateSphere("handR", { diameter: 0.16, segments: 5 }, scene);
        handR.material = mkMat("handMatR", ...SKIN);
        handR.position.set(0.345, -0.13, 0);
        handR.parent = body;

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

    // ── Knockback state ───────────────────────────────────────────────
    let knockbackVelX = 0;
    let knockbackVelZ = 0;
    const KNOCKBACK_FORCE = 0.5;   // initial speed applied on hit
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

    function update() {
        if (!mesh || !enabled) return;

        // ── Rotation (Left / Right arrows or A / D) ──────────────────
        if (Input.isHeld("KeyA") || Input.isHeld("ArrowLeft"))  mesh.rotation.y -= TURN_SPEED;
        if (Input.isHeld("KeyD") || Input.isHeld("ArrowRight")) mesh.rotation.y += TURN_SPEED;

        // ── Forward / backward along character's own facing direction ─
        let moveZ = 0;
        if (Input.isHeld("KeyW") || Input.isHeld("ArrowUp"))   moveZ =  1;
        if (Input.isHeld("KeyS") || Input.isHeld("ArrowDown")) moveZ = -1;

        const fx = Math.sin(mesh.rotation.y) * moveZ * SPEED;
        const fz = Math.cos(mesh.rotation.y) * moveZ * SPEED;

        velY += GRAVITY;
        mesh.moveWithCollisions(new BABYLON.Vector3(fx + knockbackVelX, velY, fz + knockbackVelZ));

        // Decay knockback each frame
        knockbackVelX *= KNOCKBACK_DECAY;
        knockbackVelZ *= KNOCKBACK_DECAY;
        if (Math.abs(knockbackVelX) < KNOCKBACK_MIN && Math.abs(knockbackVelZ) < KNOCKBACK_MIN) {
            knockbackVelX = 0;
            knockbackVelZ = 0;
        }

        if (mesh.position.y < 1.05) {
            mesh.position.y = 1.0;
            velY = 0;
        }
    }

    function setEnabled(val) {
        enabled = val;
        if (mesh) mesh.setEnabled(val);
    }

    function getMesh() { return mesh; }

    function getPosition() {
        return mesh ? mesh.position : BABYLON.Vector3.Zero();
    }

    function teleport(pos) {
        if (mesh) mesh.position.copyFrom(pos);
    }

    return { init, update, setEnabled, getMesh, getPosition, teleport, applyKnockback };
})();
