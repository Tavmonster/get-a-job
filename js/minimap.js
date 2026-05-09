/**
 * minimap.js — Overhead orthographic camera rendered in a corner viewport.
 * scene.cameraToUseForPointers is set to mainCamera so ALL mouse/touch
 * pointer events (GUI buttons, interview panel, game-over screen) always
 * map through the main full-screen camera, never through the minimap viewport.
 */
const Minimap = (() => {
    let minimapCamera = null;
    let _scene = null;
    let _mainCamera = null;
    let _objMarker = null;   // yellow blinking waypoint pentagon
    let _objActive = false;

    const ORTHO = 115;

    function init(scene, mainCamera) {
        _scene = scene;
        _mainCamera = mainCamera;
        minimapCamera = new BABYLON.FreeCamera(
            "minimapCam",
            new BABYLON.Vector3(0, 150, 0.001),
            scene
        );
        minimapCamera.setTarget(BABYLON.Vector3.Zero());
        minimapCamera.mode        = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
        minimapCamera.orthoTop    =  ORTHO;
        minimapCamera.orthoBottom = -ORTHO;
        minimapCamera.orthoLeft   = -ORTHO;
        minimapCamera.orthoRight  =  ORTHO;
        minimapCamera.minZ        = 1;
        minimapCamera.maxZ        = 350;

        // Bottom-right corner viewport (22% wide, 28% tall)
        minimapCamera.viewport = new BABYLON.Viewport(0.78, 0.0, 0.22, 0.28);

        // Layer 0x20000000 is used exclusively for minimap dots/markers so
        // they are invisible to the main camera (layerMask 0x0FFFFFFF).
        minimapCamera.layerMask = 0x2FFFFFFF;

        scene.activeCameras = [mainCamera, minimapCamera];

        // Route pointer events through the main camera's coordinate space.
        scene.cameraToUseForPointers = mainCamera;

        // Disable fog for the minimap camera by pushing fog range far out of view,
        // then restoring it. Avoids shader recompilation that toggling fogEnabled causes.
        let _fogStart, _fogEnd;
        scene.onBeforeCameraRenderObservable.add((cam) => {
            if (cam !== minimapCamera) return;
            _fogStart = scene.fogStart; _fogEnd = scene.fogEnd;
            scene.fogStart = 1e9; scene.fogEnd = 1e9;
        });
        scene.onAfterCameraRenderObservable.add((cam) => {
            if (cam !== minimapCamera) return;
            scene.fogStart = _fogStart; scene.fogEnd = _fogEnd;
        });

        // ── Objective marker (yellow pentagon, minimap-only) ─────────
        _objMarker = BABYLON.MeshBuilder.CreateCylinder("objMarker", {
            height: 0.3, diameter: 14, tessellation: 24,
        }, scene);
        const om = new BABYLON.StandardMaterial("objMarkerMat", scene);
        om.diffuseColor    = new BABYLON.Color3(1, 1, 0);
        om.emissiveColor   = new BABYLON.Color3(1, 1, 0);
        om.disableLighting = true;
        _objMarker.material   = om;
        _objMarker.isPickable = false;
        _objMarker.layerMask  = 0x20000000;
        _objMarker.setEnabled(false);

        // Blink the marker: visible 400 ms, hidden 150 ms → very noticeable.
        scene.registerBeforeRender(() => {
            if (!_objMarker || !_objActive) return;
            const t = Date.now() % 550;
            _objMarker.setEnabled(t < 400);
        });

        return minimapCamera;
    }

    function createDot(scene, colour, size) {
        size = size || 4;
        const dot = BABYLON.MeshBuilder.CreateCylinder("dot_" + colour + "_" + Math.random(), {
            height: 0.3, diameter: size, tessellation: 8,
        }, scene);
        const m = new BABYLON.StandardMaterial("dotMat_" + Math.random(), scene);
        m.diffuseColor    = BABYLON.Color3.FromHexString(colour);
        m.emissiveColor   = BABYLON.Color3.FromHexString(colour);
        m.disableLighting = true;
        dot.material   = m;
        dot.isPickable = false;
        dot.layerMask  = 0x20000000;
        return dot;
    }

    function updateDot(dot, targetMesh) {
        if (!dot || !targetMesh) return;
        dot.position.x = targetMesh.position.x;
        dot.position.y = 0.5;
        dot.position.z = targetMesh.position.z;
    }

    function setObjective(pos) {
        if (!_objMarker) return;
        if (!pos) {
            _objActive = false;
            _objMarker.setEnabled(false);
            return;
        }
        _objMarker.position.x = pos.x;
        _objMarker.position.y = 0.5;
        _objMarker.position.z = pos.z;
        _objActive = true;
    }

    function hide() {
        if (!_scene || !minimapCamera) return;
        _scene.activeCameras = [_mainCamera];
    }

    function show() {
        if (!_scene || !minimapCamera) return;
        _scene.activeCameras = [_mainCamera, minimapCamera];
    }

    function getCamera() { return minimapCamera; }

    return { init, createDot, updateDot, setObjective, hide, show, getCamera };
})();
