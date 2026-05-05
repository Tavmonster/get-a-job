/**
 * minimap.js — Overhead orthographic camera in a corner viewport
 */
const Minimap = (() => {
    let minimapCamera = null;

    function init(scene, mainCamera) {
        // Orthographic top-down camera
        minimapCamera = new BABYLON.FreeCamera("minimapCam", new BABYLON.Vector3(0, 120, 0), scene);
        minimapCamera.setTarget(new BABYLON.Vector3(0, 0, 0));
        minimapCamera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        const orthoSize = 95;
        minimapCamera.orthoTop    =  orthoSize;
        minimapCamera.orthoBottom = -orthoSize;
        minimapCamera.orthoLeft   = -orthoSize;
        minimapCamera.orthoRight  =  orthoSize;
        minimapCamera.minZ        = 1;
        minimapCamera.maxZ        = 300;

        // Bottom-right corner, 22% of canvas
        minimapCamera.viewport = new BABYLON.Viewport(0.78, 0.0, 0.22, 0.28);

        // Layer masks — minimap camera sees layer 1 and 2
        // Main camera sees layer 1 only
        // Minimap-only objects (player dot, markers) get layer 2
        mainCamera.layerMask = 0x10000001;
        minimapCamera.layerMask = 0x10000003;

        scene.activeCameras = [mainCamera, minimapCamera];

        return minimapCamera;
    }

    /**
     * Create a coloured dot visible only on minimap for a mesh (player/truck).
     */
    function createDot(scene, colour, size = 3) {
        const dot = BABYLON.MeshBuilder.CreateCylinder("minimapDot_" + colour, {
            height: 0.5, diameter: size, tessellation: 8,
        }, scene);
        const mat = new BABYLON.StandardMaterial("dotMat_" + colour, scene);
        mat.diffuseColor  = BABYLON.Color3.FromHexString(colour);
        mat.emissiveColor = BABYLON.Color3.FromHexString(colour);
        dot.material = mat;
        dot.layerMask = 0x00000002; // only minimap camera
        dot.isPickable = false;
        return dot;
    }

    /**
     * Update the dot position to follow a mesh (slightly elevated so it's visible from above).
     */
    function updateDot(dot, targetMesh) {
        if (!dot || !targetMesh) return;
        dot.position.x = targetMesh.position.x;
        dot.position.y = 2;
        dot.position.z = targetMesh.position.z;
    }

    return { init, createDot, updateDot };
})();
