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

        // Simple character: cylinder body + sphere head
        const body = BABYLON.MeshBuilder.CreateCylinder("playerBody", {
            height: 1.6, diameter: 0.6, tessellation: 8,
        }, scene);
        body.material = new BABYLON.StandardMaterial("playerMat", scene);
        body.material.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8);

        const head = BABYLON.MeshBuilder.CreateSphere("playerHead", { diameter: 0.55, segments: 6 }, scene);
        head.material = new BABYLON.StandardMaterial("headMat", scene);
        head.material.diffuseColor = new BABYLON.Color3(0.9, 0.75, 0.6);
        head.position.y = 1.05;
        head.parent = body;

        mesh = body;
        mesh.ellipsoid = new BABYLON.Vector3(0.4, 0.85, 0.4);
        mesh.ellipsoidOffset = new BABYLON.Vector3(0, 0.85, 0);
        mesh.checkCollisions = true;

        const spawnPos = World.getPlayerSpawnPos();
        mesh.position.copyFrom(spawnPos);

        return mesh;
    }

    function update(cameraAlpha) {
        if (!mesh || !enabled) return;

        let moveX = 0;
        let moveZ = 0;

        if (Input.isHeld("KeyW") || Input.isHeld("ArrowUp"))    moveZ = 1;
        if (Input.isHeld("KeyS") || Input.isHeld("ArrowDown"))  moveZ = -1;
        if (Input.isHeld("KeyA") || Input.isHeld("ArrowLeft"))  moveX = -1;
        if (Input.isHeld("KeyD") || Input.isHeld("ArrowRight")) moveX = 1;

        if (moveX !== 0 || moveZ !== 0) {
            // Move relative to camera facing direction
            const angle = cameraAlpha + Math.PI;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const worldX = moveX * cosA + moveZ * sinA;
            const worldZ = moveX * -sinA + moveZ * cosA;

            const len = Math.sqrt(worldX * worldX + worldZ * worldZ);
            const nx = (worldX / len) * SPEED;
            const nz = (worldZ / len) * SPEED;

            // Face direction of movement
            mesh.rotation.y = Math.atan2(nx, nz);

            velY += GRAVITY;
            const delta = new BABYLON.Vector3(nx, velY, nz);
            mesh.moveWithCollisions(delta);

            // Reset velY when on ground
            if (mesh.position.y < 1.05) {
                mesh.position.y = 1.0;
                velY = 0;
            }
        } else {
            // Apply gravity even when standing still
            velY += GRAVITY;
            mesh.moveWithCollisions(new BABYLON.Vector3(0, velY, 0));
            if (mesh.position.y < 1.05) {
                mesh.position.y = 1.0;
                velY = 0;
            }
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

    return { init, update, setEnabled, getMesh, getPosition, teleport };
})();
