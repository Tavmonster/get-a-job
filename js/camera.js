/**
 * camera.js — Simple third-person camera that sits behind the target mesh.
 * Uses a plain FreeCamera repositioned manually every frame.
 */
const GameCamera = (() => {
    let camera  = null;
    let target  = null;

    const RISE      = 11;   // height above target
    const BEHIND    = 13;   // distance behind target
    // Inner face of boundary walls is at ±118.5 (halfMap=120 - 1.5).
    // Clamp the camera to ±118 so it never enters the wall geometry.
    const WALL_INNER = 118;

    function init(scene, targetMesh, cvs) {
        cvs.addEventListener("contextmenu", (e) => e.preventDefault());

        // Start at a sensible position; we'll move it every frame
        camera = new BABYLON.FreeCamera(
            "cam",
            new BABYLON.Vector3(0, RISE, -BEHIND),
            scene
        );
        camera.minZ  = 0.1;
        camera.maxZ  = 500;
        camera.fov   = 1.1;   // ~63° — slightly wide

        target = targetMesh;
        return camera;
    }

    /**
     * Call once per frame from the render loop.
     * Positions the camera BEHIND+ABOVE the target and aims at the target.
     */
    function update() {
        if (!camera || !target) return;

        const rot = target.rotation.y;

        // Unit vector pointing in the direction the target faces
        const fwdX = Math.sin(rot);
        const fwdZ = Math.cos(rot);

        // Camera sits behind and above the target
        camera.position.x = target.position.x - fwdX * BEHIND;
        camera.position.y = target.position.y + RISE;
        camera.position.z = target.position.z - fwdZ * BEHIND;

        // Don't let the camera enter the boundary walls
        camera.position.x = Math.max(-WALL_INNER, Math.min(WALL_INNER, camera.position.x));
        camera.position.z = Math.max(-WALL_INNER, Math.min(WALL_INNER, camera.position.z));

        // Look at a point at the target's chest height
        camera.setTarget(new BABYLON.Vector3(
            target.position.x,
            target.position.y + 0.5,
            target.position.z
        ));
    }

    function switchTarget(newTarget) {
        target = newTarget;
    }

    function getCamera() { return camera; }

    return { init, update, switchTarget, getCamera };
})();

