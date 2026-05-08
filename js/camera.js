/**
 * camera.js — Simple third-person camera that sits behind the target mesh.
 * Uses a plain FreeCamera repositioned manually every frame.
 */
const GameCamera = (() => {
    let camera  = null;
    let target  = null;
    let _scene  = null;

    const RISE       = 11;   // height above target
    const BEHIND     = 13;   // distance behind target
    const WALL_INNER = 118;
    const OCCLUDE_VIS = 0.25; // visibility of buildings that occlude the player

    // Pre-allocated vectors — avoids a new Vector3 allocation every frame.
    const _camPos    = new BABYLON.Vector3();
    const _lookAt    = new BABYLON.Vector3();
    const _rayDir    = new BABYLON.Vector3();

    // Pre-allocated ray for occlusion testing.
    const _occRay    = new BABYLON.Ray(new BABYLON.Vector3(), new BABYLON.Vector3(), 1);

    // Tracks which building meshes are currently faded.
    const _fadedMeshes   = new Set();
    const _currentHits   = new Set();

    // Mesh name prefixes that count as occluders (building bodies, roofs, doors).
    const OCCLUDER_PREFIXES = ["building_", "roof_", "door_", "store", "hotel", "fastfood", "depot"];

    // Cached list of occluder meshes — populated lazily on first occlusion check.
    let _occluderMeshList = null;

    function _isOccluderName(name) {
        for (let i = 0; i < OCCLUDER_PREFIXES.length; i++) {
            if (name.startsWith(OCCLUDER_PREFIXES[i])) return true;
        }
        return false;
    }

    function _getOccluderMeshes() {
        if (_occluderMeshList) return _occluderMeshList;
        _occluderMeshList = _scene.meshes.filter(m => _isOccluderName(m.name));
        return _occluderMeshList;
    }

    function init(scene, targetMesh, cvs) {
        _scene = scene;
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

        // Remove ALL built-in FreeCamera key/mouse bindings — we drive it manually.
        camera.inputs.clear();

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

        _updateOcclusion();
    }

    /**
     * Fades any building mesh that sits between the camera and the player,
     * and restores any previously-faded mesh that no longer occludes.
     */
    function _updateOcclusion() {
        if (!_scene) return;

        // Build a ray from the camera to the player.
        const tp = target.position;
        const cp = camera.position;
        _rayDir.x = tp.x - cp.x;
        _rayDir.y = tp.y - cp.y;
        _rayDir.z = tp.z - cp.z;
        const dist = _rayDir.length();
        _rayDir.scaleInPlace(1 / dist);

        _occRay.origin.copyFrom(cp);
        _occRay.direction.copyFrom(_rayDir);
        _occRay.length = dist;

        // Use ray.intersectsMesh() directly — bypasses isPickable so it works
        // even though world.js sets isPickable = false on static meshes.
        const meshes = _getOccluderMeshes();
        _currentHits.clear();
        for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            if (mesh.isVisible && _occRay.intersectsMesh(mesh, /*fastCheck=*/true).hit) {
                _currentHits.add(mesh);
            }
        }

        // Restore meshes no longer occluding.
        for (const mesh of _fadedMeshes) {
            if (!_currentHits.has(mesh)) mesh.visibility = 1.0;
        }

        // Fade newly-occluding meshes.
        for (const mesh of _currentHits) {
            mesh.visibility = OCCLUDE_VIS;
        }

        // Update the faded-meshes record.
        _fadedMeshes.clear();
        for (const mesh of _currentHits) _fadedMeshes.add(mesh);
    }

    function switchTarget(newTarget) {
        target = newTarget;
    }

    function getCamera() { return camera; }

    return { init, update, switchTarget, getCamera };
})();

