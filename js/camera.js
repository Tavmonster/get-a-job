/**
 * camera.js — FollowCamera setup with mouse-drag rotation
 */
const GameCamera = (() => {
    let camera = null;
    let canvas = null;
    let isDragging = false;
    let lastMouseX = 0;
    let rotationY = 0;

    function init(scene, targetMesh, cvs) {
        canvas = cvs;

        camera = new BABYLON.FollowCamera("followCam", new BABYLON.Vector3(0, 10, -20), scene);
        camera.heightOffset     = 6;
        camera.radius           = 14;
        camera.rotationOffset   = 180;
        camera.cameraAcceleration = 0.08;
        camera.maxCameraSpeed   = 20;
        camera.lockedTarget     = targetMesh;
        camera.minZ             = 0.1;

        // Mouse-drag to rotate around the target
        canvas.addEventListener("mousedown", (e) => {
            if (e.button === 2) {
                isDragging = true;
                lastMouseX = e.clientX;
            }
        });
        window.addEventListener("mouseup", () => { isDragging = false; });
        window.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastMouseX;
            lastMouseX = e.clientX;
            camera.rotationOffset += dx * 0.5;
        });

        canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        return camera;
    }

    function switchTarget(newTarget) {
        if (camera) camera.lockedTarget = newTarget;
    }

    function getAlpha() {
        if (!camera) return 0;
        // Convert rotationOffset to radians relative to camera facing
        return (camera.rotationOffset * Math.PI) / 180;
    }

    function getCamera() { return camera; }

    return { init, switchTarget, getAlpha, getCamera };
})();
