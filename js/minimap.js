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

    const ORTHO = 100;

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

        scene.activeCameras = [mainCamera, minimapCamera];

        // Route pointer events through the main camera's coordinate space.
        scene.cameraToUseForPointers = mainCamera;

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
        return dot;
    }

    function updateDot(dot, targetMesh) {
        if (!dot || !targetMesh) return;
        dot.position.x = targetMesh.position.x;
        dot.position.y = 0.5;
        dot.position.z = targetMesh.position.z;
    }

    function createObjectiveMarker(scene) {
        const star = BABYLON.MeshBuilder.CreateCylinder("objMarker", {
            height: 0.3, diameter: 7, tessellation: 5,
        }, scene);
        const m = new BABYLON.StandardMaterial("objMarkerMat", scene);
        m.diffuseColor    = new BABYLON.Color3(1, 1, 0);
        m.emissiveColor   = new BABYLON.Color3(1, 1, 0);
        m.disableLighting = true;
        star.material   = m;
        star.isPickable = false;
        star.setEnabled(false);
        return star;
    }

    function setObjective(marker, pos) {
        if (!marker) return;
        if (!pos) { marker.setEnabled(false); return; }
        marker.position.x = pos.x;
        marker.position.y = 0.5;
        marker.position.z = pos.z;
        marker.setEnabled(true);
    }

    function hide() {
        if (!_scene || !minimapCamera) return;
        _scene.activeCameras = [_mainCamera];
    }

    function show() {
        if (!_scene || !minimapCamera) return;
        _scene.activeCameras = [_mainCamera, minimapCamera];
    }

    return { init, createDot, updateDot, createObjectiveMarker, setObjective, hide, show };
})();
