/**
 * camera.js — Simple third-person camera that sits behind the target mesh.
 * Uses a plain FreeCamera repositioned manually every frame.
 */
const GameCamera = (() => {
    let camera  = null;
    let target  = null;

    const RISE      = 11;   // height above target
    const BEHIND    = 13;   // distance behind target
    const WALL_INNER = 118;

    // Pre-allocated vectors — avoids a new Vector3 allocation every frame.
    const _camPos    = new BABYLON.Vector3();
    const _lookAt    = new BABYLON.Vector3();

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

        const fwdX = Math.sin(rot);
        const fwdZ = Math.cos(rot);

        // Camera sits behind and above the target
        _camPos.x = target.position.x - fwdX * BEHIND;
        _camPos.y = target.position.y + RISE;
        _camPos.z = target.position.z - fwdZ * BEHIND;

        // Don't let the camera enter the boundary walls
        _camPos.x = Math.max(-WALL_INNER, Math.min(WALL_INNER, _camPos.x));
        _camPos.z = Math.max(-WALL_INNER, Math.min(WALL_INNER, _camPos.z));

        camera.position.copyFrom(_camPos);

        // Look at a point at the target's chest height
        _lookAt.set(target.position.x, target.position.y + 0.5, target.position.z);
        camera.setTarget(_lookAt);
    }

    function switchTarget(newTarget) {
        target = newTarget;
    }

    function getCamera() { return camera; }

    return { init, update, switchTarget, getCamera };
})();

