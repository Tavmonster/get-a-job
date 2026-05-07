/**
 * truck.js — Delivery truck mesh and driving logic
 */
const Truck = (() => {
    let mesh = null;
    let scene = null;
    let driving = false;
    const MAX_SPEED  = 0.24;
    const ACCEL      = 0.010;
    const TURN_SPEED = 0.018;   // radians per frame at full speed
    let speed = 0;

    function init(babylonScene) {
        scene = babylonScene;

        const root = new BABYLON.TransformNode("truckRoot", scene);

        // Cab
        const cab = BABYLON.MeshBuilder.CreateBox("truckCab", { width: 3.2, height: 2.8, depth: 3.5 }, scene);
        cab.material = new BABYLON.StandardMaterial("cabMat", scene);
        cab.material.diffuseColor = new BABYLON.Color3(0.8, 0.25, 0.1);
        cab.position.set(0, 1.6, 1.2);
        cab.parent = root;
        cab.checkCollisions = false;

        // Cargo box
        const cargo = BABYLON.MeshBuilder.CreateBox("truckCargo", { width: 3.4, height: 3, depth: 6 }, scene);
        cargo.material = new BABYLON.StandardMaterial("cargoMat", scene);
        cargo.material.diffuseColor = new BABYLON.Color3(0.9, 0.7, 0.2);
        cargo.position.set(0, 1.8, -2);
        cargo.parent = root;
        cargo.checkCollisions = false;

        // Wheels (4 cylinders)
        const wheelMat = new BABYLON.StandardMaterial("wheelMat", scene);
        wheelMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        const wheelOffsets = [
            [-1.9, 0.55, 1.8], [1.9, 0.55, 1.8],
            [-1.9, 0.55, -2.8], [1.9, 0.55, -2.8],
        ];
        wheelOffsets.forEach((wPos, i) => {
            const wheel = BABYLON.MeshBuilder.CreateCylinder("wheel_" + i, {
                height: 0.5, diameter: 1.1, tessellation: 10,
            }, scene);
            wheel.rotation.z = Math.PI / 2;
            wheel.material = wheelMat;
            wheel.position.set(...wPos);
            wheel.parent = root;
        });

        // Windshield (tinted plane)
        const ws = BABYLON.MeshBuilder.CreatePlane("windshield", { width: 2.6, height: 1.2 }, scene);
        ws.material = new BABYLON.StandardMaterial("wsMat", scene);
        ws.material.diffuseColor = new BABYLON.Color3(0.6, 0.85, 1.0);
        ws.material.alpha = 0.6;
        ws.position.set(0, 2.2, 2.96);
        ws.parent = root;

        // Collision box on root node using an invisible box
        const collider = BABYLON.MeshBuilder.CreateBox("truckCollider", { width: 3.6, height: 3, depth: 10 }, scene);
        collider.material = new BABYLON.StandardMaterial("colMat", scene);
        collider.material.alpha = 0;
        collider.position.set(0, 1.5, -0.5);
        collider.parent = root;
        collider.checkCollisions = true;
        collider.isPickable = false;

        // Use a dummy point as the physics pivot
        const pivot = BABYLON.MeshBuilder.CreateBox("truckPivot", { size: 0.01 }, scene);
        pivot.material = new BABYLON.StandardMaterial("pivMat", scene);
        pivot.material.alpha = 0;
        pivot.isPickable = false;
        pivot.checkCollisions = false;  // movement handled manually via raycast
        root.parent = pivot;
        root.position.y = 0;

        mesh = pivot;

        const spawnPos = World.getTruckSpawnPos();
        mesh.position.copyFrom(spawnPos);
        mesh.position.y = 0;
        // Face south (away from the depot building which is to the north)
        mesh.rotation.y = Math.PI;

        setVisible(false);
        return mesh;
    }

    function update() {
        if (!mesh || !driving) return;

        // Acceleration / braking
        if (Input.isHeld("KeyW") || Input.isHeld("ArrowUp")) {
            speed = Math.min(speed + ACCEL, MAX_SPEED);
        } else if (Input.isHeld("KeyS") || Input.isHeld("ArrowDown")) {
            speed = Math.max(speed - ACCEL * 1.5, -MAX_SPEED * 0.4);
        } else {
            speed *= 0.96;
            if (Math.abs(speed) < 0.001) speed = 0;
        }

        // Steering: direct rotation scaled by speed so it's weaker at low speed
        if (Math.abs(speed) > 0.005) {
            const turnAmount = TURN_SPEED * (Math.abs(speed) / MAX_SPEED) * Math.sign(speed);
            if (Input.isHeld("KeyA") || Input.isHeld("ArrowLeft"))       mesh.rotation.y -= turnAmount;
            else if (Input.isHeld("KeyD") || Input.isHeld("ArrowRight")) mesh.rotation.y += turnAmount;
        }

        if (Math.abs(speed) > 0.001) {
            const forward = new BABYLON.Vector3(
                Math.sin(mesh.rotation.y),
                0,
                Math.cos(mesh.rotation.y)
            );
            const right = new BABYLON.Vector3(
                Math.cos(mesh.rotation.y),
                0,
                -Math.sin(mesh.rotation.y)
            );

            // Cast three rays from the leading face of the truck (left corner,
            // centre, right corner) so that side edges can't clip through walls.
            // leadZ: front face is +4.5, rear face is -5.5 from pivot centre.
            const dir      = Math.sign(speed);
            const leadZ    = dir > 0 ? 4.5 : -5.5;
            const halfW    = 1.6;   // slightly inside half-width to avoid grazing
            const rayLen   = Math.abs(speed) + 0.4;
            const rayDir   = forward.scale(dir);

            const base        = new BABYLON.Vector3(mesh.position.x, 1.5, mesh.position.z);
            const leadCenter  = base.add(forward.scale(leadZ));
            const rayOrigins  = [
                leadCenter,
                leadCenter.add(right.scale( halfW)),
                leadCenter.add(right.scale(-halfW)),
            ];

            const collisionFilter = (m) =>
                (m.checkCollisions || m.metadata?.isNPCCar)
                && m.name !== "truckPivot"
                && m.name !== "truckCollider"
                && !m.name.startsWith("wheel")
                && m.name !== "ground";

            const blocked = rayOrigins.some(origin => {
                const ray = new BABYLON.Ray(origin, rayDir, rayLen);
                const hit = scene.pickWithRay(ray, collisionFilter);
                return hit && hit.hit;
            });

            if (!blocked) {
                mesh.position.x += forward.x * speed;
                mesh.position.z += forward.z * speed;
            } else {
                speed = 0; // stop on impact
            }
        }

        // Keep level with ground
        if (mesh.position.y < 0) mesh.position.y = 0;
    }

    function setDriving(val) {
        driving = val;
    }

    function setVisible(val) {
        if (!mesh) return;
        // Recursively set all descendant meshes (includes meshes under TransformNodes)
        mesh.getChildMeshes(false).forEach(c => c.setEnabled(val));
    }

    function getMesh() { return mesh; }

    function isDrivingActive() { return driving; }

    return { init, update, setDriving, setVisible, getMesh, isDrivingActive };
})();
