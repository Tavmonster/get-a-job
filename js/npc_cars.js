/**
 * npc_cars.js — 4 AI-driven NPC cars that patrol the road network
 *
 * Each car follows a closed rectangular clockwise loop using road centrelines.
 * Lanes are offset 2 units to the right of each road centre so cars stay in
 * the correct lane and don't conflict head-on.
 *
 * Road centrelines: ROAD_X = ROAD_Z = [-75,-45,-15,15,45,75]
 * Road half-width = 4  →  lane centre = road_centreline ± 2
 *
 * Avoidance: three forward rays (centre, left, right) detect other NPC cars
 * and the player truck; the car brakes proportionally and stops when close.
 *
 * Fixes get-a-job-2vs
 */
const NPCCars = (() => {
    const CAR_SPEED      = 0.075;   // units/frame cruise speed
    const TURN_SPEED     = 0.06;   // rad/frame max yaw rate
    const REACH_DIST     = 4.5;    // waypoint snap distance (units)
    const LOOK_AHEAD     = 9.0;    // avoidance ray length (units)
    const STOP_DIST      = 3.5;    // full-stop distance (units)
    const CAR_HALF_W     = 0.9;    // lateral offset of side avoidance rays
    const HIT_DIST       = 2.6;    // distance from car pivot that counts as a player hit
    const RAY_INTERVAL   = 3;      // only recast avoidance rays every N frames

    // Pre-allocated reusable objects to avoid per-frame GC pressure
    const _fwd      = new BABYLON.Vector3();
    const _rgt      = new BABYLON.Vector3();
    const _frontBase= new BABYLON.Vector3();
    const _orig0    = new BABYLON.Vector3();
    const _orig1    = new BABYLON.Vector3();
    const _orig2    = new BABYLON.Vector3();
    const _ray      = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward(), 1);

    // ── Clockwise rectangular loop routes ────────────────────────────
    // Waypoints are [x, z] corners at road intersections, offset 2 units
    // to the right (correct lane for right-hand traffic).
    //
    // For a clockwise rectangle bounded by roads x1<x2, z1<z2:
    //   NW=[x1+2, z1+2]  NE=[x2-2, z1+2]  SE=[x2-2, z2-2]  SW=[x1+2, z2-2]
    //
    // INVARIANT: no two routes share the same (road, direction) — cars that
    // share a road always travel in opposite directions (different lanes), so
    // tailgate-deadlocks between NPC cars are impossible.
    //
    // PARK AVOIDANCE: The park occupies grid cols 0-1, rows 0-1 (world
    // X ∈ [-105,-45], Z ∈ [-105,-45]).  Road X=-75 bisects the park in that
    // Z range, so Car 0's north leg uses road X=-45 (east of the park)
    // instead.  Car 2's north leg uses X=-75 only in the south (Z=17→43),
    // which is entirely outside the park zone.  No car ever drives through
    // the park interior.
    //
    //  Car 0 — east+south ring (Z=-75 E, X=75 S, Z=75 W, X=-45 N)
    //  Car 1 — NE inner        (Z=-45 E, X=45 S, Z=-15 W, X=15 N)
    //  Car 2 — SW inner        (Z=15 E, X=-15 S, Z=45 W, X=-75[south] N)
    //  Car 3 — centre ring     (Z=-15 E, X=15 S, Z=15 W, X=-15 N)
    const ROUTES = [
        // Car 0 — east+south ring  (north leg uses X=-45, east of the park)
        [[ 73, -73], [ 73,  73], [-43,  73], [-43, -73]],

        // Car 1 — NE inner ring    (roads X=15/45, Z=-45/-15) — unchanged
        [[ 43, -43], [ 43, -17], [ 17, -17], [ 17, -43]],

        // Car 2 — SW inner ring    (north leg uses X=-75 south section only)
        [[-17,  17], [-17,  43], [-73,  43], [-73,  17]],

        // Car 3 — centre ring      (roads X=±15, Z=±15) — unchanged
        [[ 13, -13], [ 13,  13], [-13,  13], [-13, -13]],
    ];

    // Distinct body colours per car
    const BODY_COLOURS = [
        new BABYLON.Color3(0.15, 0.35, 0.80),   // steel blue
        new BABYLON.Color3(0.80, 0.15, 0.15),   // red
        new BABYLON.Color3(0.10, 0.55, 0.20),   // green
        new BABYLON.Color3(0.90, 0.72, 0.08),   // yellow
    ];

    const cars  = [];
    let scene_  = null;

    // ── Mesh builder ─────────────────────────────────────────────────

    function buildCar(scene, colour, idx) {
        const id = "npcCar" + idx;

        const pivot = new BABYLON.TransformNode(id + "Pivot", scene);

        // Lower body
        const bodyMat = new BABYLON.StandardMaterial(id + "BodyMat", scene);
        bodyMat.diffuseColor  = colour;
        bodyMat.specularColor = new BABYLON.Color3(0.25, 0.25, 0.25);

        const body = BABYLON.MeshBuilder.CreateBox(id + "Body", {
            width: 2.2, height: 0.75, depth: 4.0,
        }, scene);
        body.material = bodyMat;
        body.position.set(0, 0.5, 0);
        body.parent    = pivot;
        body.isPickable = false;

        // Cabin / roof section (slightly darker shade)
        const cabinMat = new BABYLON.StandardMaterial(id + "CabinMat", scene);
        cabinMat.diffuseColor  = colour.scale(0.65);
        cabinMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const cabin = BABYLON.MeshBuilder.CreateBox(id + "Cabin", {
            width: 1.8, height: 0.65, depth: 2.1,
        }, scene);
        cabin.material = cabinMat;
        cabin.position.set(0, 1.2, -0.2);
        cabin.parent    = pivot;
        cabin.isPickable = false;

        // Windshield (tinted plane on the front face of the cabin)
        const wsMat = new BABYLON.StandardMaterial(id + "WsMat", scene);
        wsMat.diffuseColor = new BABYLON.Color3(0.6, 0.85, 1.0);
        wsMat.alpha        = 0.55;

        const ws = BABYLON.MeshBuilder.CreatePlane(id + "Ws", {
            width: 1.55, height: 0.52,
        }, scene);
        ws.material  = wsMat;
        ws.position.set(0, 1.2, 0.86);
        ws.parent    = pivot;
        ws.isPickable = false;

        // Wheels — 4 cylinders rotated 90° around Z
        const wheelMat = new BABYLON.StandardMaterial(id + "WheelMat", scene);
        wheelMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        [[-1.15, 0.4, 1.3], [1.15, 0.4, 1.3],
         [-1.15, 0.4, -1.3], [1.15, 0.4, -1.3]].forEach((p, wi) => {
            const whl = BABYLON.MeshBuilder.CreateCylinder(id + "Whl" + wi, {
                height: 0.35, diameter: 0.8, tessellation: 10,
            }, scene);
            whl.rotation.z  = Math.PI / 2;
            whl.material    = wheelMat;
            whl.position.set(p[0], p[1], p[2]);
            whl.parent      = pivot;
            whl.isPickable  = false;
        });

        // Invisible collider — isPickable so other cars' avoidance rays can hit it
        const colMat = new BABYLON.StandardMaterial(id + "ColMat", scene);
        colMat.alpha = 0;

        const collider = BABYLON.MeshBuilder.CreateBox(id + "Collider", {
            width: 2.4, height: 1.8, depth: 4.2,
        }, scene);
        collider.material        = colMat;
        collider.position.set(0, 0.9, 0);
        collider.parent          = pivot;
        collider.isPickable      = true;
        collider.checkCollisions = false;
        collider.metadata        = { isNPCCar: true };

        return { pivot, collider };
    }

    // ── Public API ────────────────────────────────────────────────────

    function init(scene) {
        scene_ = scene;

        ROUTES.forEach((route, i) => {
            const { pivot, collider } = buildCar(scene, BODY_COLOURS[i], i);

            // Stagger start: car i begins at waypoint i so they're spread around
            const startIdx = i % route.length;
            const wp       = route[startIdx];
            pivot.position.set(wp[0], 0, wp[1]);

            // Orient toward first target waypoint
            const nextWp = route[(startIdx + 1) % route.length];
            const dx0 = nextWp[0] - wp[0];
            const dz0 = nextWp[1] - wp[1];
            pivot.rotation.y = Math.atan2(dx0, dz0);

            // Slight per-car speed variation so they naturally spread out
            const cruiseSpeed = CAR_SPEED * (0.85 + i * 0.05);

            cars.push({
                pivot,
                collider,
                route,
                wpIdx: (startIdx + 1) % route.length,
                speed: cruiseSpeed,
            });
        });
    }

    let frameCount = 0;

    function update() {
        frameCount++;
        const doRaycasts = (frameCount % RAY_INTERVAL) === 0;

        for (const car of cars) {
            const pos = car.pivot.position;
            const wp  = car.route[car.wpIdx];
            const tx  = wp[0];
            const tz  = wp[1];

            const dx   = tx - pos.x;
            const dz   = tz - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // ── Snap & advance waypoint ───────────────────────────────
            if (dist < REACH_DIST) {
                pos.x  = tx;
                pos.z  = tz;
                car.wpIdx = (car.wpIdx + 1) % car.route.length;
            }

            // ── Steer toward current waypoint ─────────────────────────
            // alignMult: 1 when facing the waypoint, 0 when 90°+ off.
            // This makes cars turn in place at corners instead of drifting
            // off-road (e.g. through the park) while turning.
            let alignMult = 1.0;
            if (dist > 0.1) {
                const desired = Math.atan2(dx, dz);
                let diff = desired - car.pivot.rotation.y;
                // Normalise to [-PI, PI]
                while (diff >  Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                const turn = Math.max(-TURN_SPEED, Math.min(TURN_SPEED, diff));
                car.pivot.rotation.y += turn;
                // cos(0)=1 fully aligned, cos(π/2)=0 at 90°, clamped to [0,1]
                alignMult = Math.max(0, Math.cos(diff));
            }

            // ── Avoidance rays (throttled to every RAY_INTERVAL frames) ────
            if (doRaycasts) {
                const sinY = Math.sin(car.pivot.rotation.y);
                const cosY = Math.cos(car.pivot.rotation.y);
                _fwd.set(sinY, 0, cosY);
                _rgt.set(cosY, 0, -sinY);

                _frontBase.set(pos.x + _fwd.x * 2.2, 0.9, pos.z + _fwd.z * 2.2);
                _orig0.copyFrom(_frontBase);
                _orig1.set(_frontBase.x + _rgt.x * CAR_HALF_W, _frontBase.y, _frontBase.z + _rgt.z * CAR_HALF_W);
                _orig2.set(_frontBase.x - _rgt.x * CAR_HALF_W, _frontBase.y, _frontBase.z - _rgt.z * CAR_HALF_W);

                const ownCol = car.collider;
                let minHitDist = LOOK_AHEAD + 1;

                for (const origin of [_orig0, _orig1, _orig2]) {
                    _ray.origin.copyFrom(origin);
                    _ray.direction.copyFrom(_fwd);
                    _ray.length = LOOK_AHEAD;
                    const hit = scene_.pickWithRay(_ray, m =>
                        m !== ownCol &&
                        (m.metadata?.isNPCCar === true || m.name === "truckCollider")
                    );
                    if (hit && hit.hit && hit.distance < minHitDist) {
                        minHitDist = hit.distance;
                    }
                }

                car._speedMult = minHitDist <= LOOK_AHEAD
                    ? Math.max(0, (minHitDist - STOP_DIST) / (LOOK_AHEAD - STOP_DIST))
                    : 1.0;
            }

            const speedMult = car._speedMult ?? 1.0;

            // ── Move ──────────────────────────────────────────────────
            const sinY = Math.sin(car.pivot.rotation.y);
            const cosY = Math.cos(car.pivot.rotation.y);
            const mv = car.speed * speedMult * alignMult;
            pos.x += sinY * mv;
            pos.z += cosY * mv;
            pos.y  = 0;
            // ── Player knockback ──────────────────────────────────────────
            const playerPos = Player.getPosition();
            const pdx = playerPos.x - pos.x;
            const pdz = playerPos.z - pos.z;
            if (pdx * pdx + pdz * pdz < HIT_DIST * HIT_DIST) {
                Player.applyKnockback(pdx, pdz);
            }
        }
    }

    return { init, update };
})();
