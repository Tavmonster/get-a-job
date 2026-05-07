/**
 * police.js — Police car that patrols the outer ring and chases/arrests the
 * player when a pedestrian is hit by the truck.
 *
 * Patrol: 20-waypoint clockwise loop covering every road-crossing on the
 *   outer ring (right-lane offsets).  Uses alignMult so the car brakes while
 *   turning at corners — prevents it from cutting onto the sidewalk.
 *   Avoidance rays stop it from ramming other NPC cars.
 *   An invisible collider (isPickable, metadata.isNPCCar=true) lets NPC-car
 *   avoidance rays detect the police car in return.
 *
 * Chase: navigates the 36-node road-centreline grid using greedy
 *   immediate-neighbour selection so the car always stays on roads.
 *   No avoidance during chase — police ignore other traffic.
 *
 * Player knockback: applied whenever the player body comes within HIT_DIST
 *   of the police car pivot (patrol or chase).
 */
const PoliceCar = (() => {
    const PATROL_SPEED  = 0.085;
    const CHASE_SPEED   = 0.20;
    const TURN_SPEED    = 0.07;    // rad/frame max yaw rate
    const REACH_DIST    = 4.5;     // waypoint snap distance
    const ARREST_DIST   = 6.5;     // catch / arrest distance (must be > truck half-depth 4.5)
    const CHASE_BRAKE_START = 10.0; // begin slowing at this distance in chase mode
    const LOOK_AHEAD    = 9.0;     // avoidance ray length
    const STOP_DIST     = 3.5;     // full-stop avoidance distance
    const CAR_HALF_W    = 0.9;     // side-ray lateral offset
    const HIT_DIST      = 2.8;     // player knockback distance
    const RAY_INTERVAL  = 4;       // avoidance ray throttle (every N frames)
    const LIGHT_PERIOD  = 8;       // frames per light half-cycle

    // ── Patrol route ────────────────────────────────────────────────────
    // Full outer-ring patrol, clockwise, right-lane offsets.
    //   South on X=73 (road X=75)   |  West on Z=73 (road Z=75)
    //   North on X=-73 (road X=-75) |  East on Z=-73 (road Z=-75)
    //
    // PARK AVOIDANCE: park is X ∈ [-105,-45], Z ∈ [-105,-45].
    // Road X=-75 (right lane X=-73) passes through the park for Z < -45.
    // At the Z=-15 intersection we jog east to X=-43 (road X=-45, right lane
    // going north) which is east of the park boundary (X=-45), then continue
    // north on X=-43 and rejoin the Z=-73 east road outside the park.
    const PATROL_ROUTE = [
        // NE corner -> SE corner (south, X=73)
        [ 73,-73], [ 73,-45], [ 73,-15], [ 73, 15], [ 73, 45],
        // SE corner -> SW corner (west, Z=73)
        [ 73, 73], [ 45, 73], [ 15, 73], [-15, 73], [-45, 73],
        // SW corner, go north on X=-73 while clear of park (Z > -45)
        [-73, 73], [-73, 45], [-73, 15],
        // Jog east at Z=-15 onto road X=-45 (right lane X=-43), east of park
        [-73,-15], [-43,-15],
        // Continue north on X=-43 through park-zone latitude
        [-43,-45], [-43,-73],
        // Rejoin east road Z=-73 and head back to NE corner
        [-15,-73], [ 15,-73], [ 45,-73],
    ];

    // ── Chase pathfinding: road-centreline grid (36 nodes) ──────────────
    // Greedy immediate-neighbour selection keeps the car on roads.
    const ROAD_COORDS = [-75, -45, -15, 15, 45, 75];
    const ROAD_IDX    = {};
    ROAD_COORDS.forEach((v, i) => { ROAD_IDX[v] = i; });

    const ALL_NODES = [];
    for (const rx of ROAD_COORDS)
        for (const rz of ROAD_COORDS)
            ALL_NODES.push([rx, rz]);

    function nearestNode(px, pz) {
        let best = ALL_NODES[0], bestD2 = Infinity;
        for (const n of ALL_NODES) {
            const d2 = (n[0] - px) * (n[0] - px) + (n[1] - pz) * (n[1] - pz);
            if (d2 < bestD2) { bestD2 = d2; best = n; }
        }
        return best;
    }

    // Up to 4 immediate neighbours (one step along each road axis)
    function immediateNeighbors(x, z) {
        const xi = ROAD_IDX[x], zi = ROAD_IDX[z];
        const r = [];
        if (xi > 0)                       r.push([ROAD_COORDS[xi - 1], z]);
        if (xi < ROAD_COORDS.length - 1)  r.push([ROAD_COORDS[xi + 1], z]);
        if (zi > 0)                       r.push([x, ROAD_COORDS[zi - 1]]);
        if (zi < ROAD_COORDS.length - 1)  r.push([x, ROAD_COORDS[zi + 1]]);
        return r;
    }

    // Pick the neighbour closest to target (tx, tz)
    function pickNextNode(curX, curZ, tx, tz) {
        const nb = immediateNeighbors(curX, curZ);
        if (!nb.length) return [curX, curZ];
        let best = nb[0], bestD2 = Infinity;
        for (const n of nb) {
            const d2 = (n[0] - tx) * (n[0] - tx) + (n[1] - tz) * (n[1] - tz);
            if (d2 < bestD2) { bestD2 = d2; best = n; }
        }
        return best;
    }

    // ── Colour constants ─────────────────────────────────────────────────
    const RED  = new BABYLON.Color3(0.95, 0.10, 0.10);
    const BLUE = new BABYLON.Color3(0.10, 0.25, 0.95);
    const OFF  = new BABYLON.Color3(0.25, 0.25, 0.25);

    // ── Pre-allocated avoidance ray vectors ──────────────────────────────
    const _fwd       = new BABYLON.Vector3();
    const _rgt       = new BABYLON.Vector3();
    const _frontBase = new BABYLON.Vector3();
    const _orig0     = new BABYLON.Vector3();
    const _orig1     = new BABYLON.Vector3();
    const _orig2     = new BABYLON.Vector3();
    const _ray       = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward(), 1);

    // ── Module state ─────────────────────────────────────────────────────
    let pivot_     = null;
    let collider_  = null;
    let scene_     = null;
    let state      = 'patrol';   // 'patrol' | 'chase' | 'inactive'
    let patrolIdx  = 0;
    let chaseNode  = null;       // [x, z] current target intersection in chase
    let _frame     = 0;
    let _speedMult = 1.0;
    let _lightLMat = null;
    let _lightRMat = null;

    // ── Mesh builder ─────────────────────────────────────────────────────
    function buildCar(scene) {
        const id = "policeCar";

        const root = new BABYLON.TransformNode(id + "Root", scene);

        // Body (white)
        const whiteMat = new BABYLON.StandardMaterial(id + "WhiteMat", scene);
        whiteMat.diffuseColor  = new BABYLON.Color3(0.92, 0.92, 0.92);
        whiteMat.specularColor = new BABYLON.Color3(0.20, 0.20, 0.20);

        const body = BABYLON.MeshBuilder.CreateBox(id + "Body", {
            width: 2.2, height: 0.75, depth: 4.0,
        }, scene);
        body.material   = whiteMat;
        body.position.set(0, 0.5, 0);
        body.parent     = root;
        body.isPickable = false;

        // Black side stripes
        const blackMat = new BABYLON.StandardMaterial(id + "BlackMat", scene);
        blackMat.diffuseColor  = new BABYLON.Color3(0.05, 0.05, 0.05);
        blackMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

        [-1.13, 1.13].forEach((xOff, i) => {
            const stripe = BABYLON.MeshBuilder.CreateBox(id + "Stripe" + i, {
                width: 0.05, height: 0.36, depth: 3.8,
            }, scene);
            stripe.material   = blackMat;
            stripe.position.set(xOff, 0.62, 0);
            stripe.parent     = root;
            stripe.isPickable = false;
        });

        // ── Cabin (dark grey) ─────────────────────────────────────────
        const cabinMat = new BABYLON.StandardMaterial(id + "CabinMat", scene);
        cabinMat.diffuseColor  = new BABYLON.Color3(0.15, 0.15, 0.15);
        cabinMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

        const cabin = BABYLON.MeshBuilder.CreateBox(id + "Cabin", {
            width: 1.8, height: 0.65, depth: 2.1,
        }, scene);
        cabin.material   = cabinMat;
        cabin.position.set(0, 1.20, -0.2);
        cabin.parent     = root;
        cabin.isPickable = false;

        // ── Windshield ────────────────────────────────────────────────
        const wsMat = new BABYLON.StandardMaterial(id + "WsMat", scene);
        wsMat.diffuseColor = new BABYLON.Color3(0.6, 0.85, 1.0);
        wsMat.alpha        = 0.55;

        const ws = BABYLON.MeshBuilder.CreatePlane(id + "Ws", {
            width: 1.55, height: 0.52,
        }, scene);
        ws.material   = wsMat;
        ws.position.set(0, 1.20, 0.86);
        ws.parent     = root;
        ws.isPickable = false;

        // ── Light bar base (black) ────────────────────────────────────
        const barBase = BABYLON.MeshBuilder.CreateBox(id + "BarBase", {
            width: 1.60, height: 0.16, depth: 0.90,
        }, scene);
        barBase.material   = blackMat;
        barBase.position.set(0, 1.60, -0.2);
        barBase.parent     = root;
        barBase.isPickable = false;

        // ── Left light (red flash) ────────────────────────────────────
        _lightLMat = new BABYLON.StandardMaterial(id + "LightLMat", scene);
        _lightLMat.diffuseColor  = RED;
        _lightLMat.emissiveColor = RED;

        const lightL = BABYLON.MeshBuilder.CreateBox(id + "LightL", {
            width: 0.55, height: 0.18, depth: 0.70,
        }, scene);
        lightL.material   = _lightLMat;
        lightL.position.set(-0.45, 1.70, -0.2);
        lightL.parent     = root;
        lightL.isPickable = false;

        // ── Right light (blue flash) ──────────────────────────────────
        _lightRMat = new BABYLON.StandardMaterial(id + "LightRMat", scene);
        _lightRMat.diffuseColor  = BLUE;
        _lightRMat.emissiveColor = BLUE;

        const lightR = BABYLON.MeshBuilder.CreateBox(id + "LightR", {
            width: 0.55, height: 0.18, depth: 0.70,
        }, scene);
        lightR.material   = _lightRMat;
        lightR.position.set(0.45, 1.70, -0.2);
        lightR.parent     = root;
        lightR.isPickable = false;

        // ── Wheels ────────────────────────────────────────────────────
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
            whl.parent      = root;
            whl.isPickable  = false;
        });

        // Invisible collider — isPickable so NPC-car avoidance rays detect it,
        // and so the police car's own rays can exclude self-hits.
        const colMat = new BABYLON.StandardMaterial(id + "ColMat", scene);
        colMat.alpha = 0;

        const collider = BABYLON.MeshBuilder.CreateBox(id + "Collider", {
            width: 2.4, height: 1.8, depth: 4.2,
        }, scene);
        collider.material        = colMat;
        collider.position.set(0, 0.9, 0);
        collider.parent          = root;
        collider.isPickable      = true;
        collider.checkCollisions = false;
        collider.metadata        = { isNPCCar: true };  // NPC cars see this

        return { pivot: root, collider };
    }

    // ── Public API ────────────────────────────────────────────────────────

    function init(scene) {
        scene_ = scene;
        const built = buildCar(scene);
        pivot_    = built.pivot;
        collider_ = built.collider;

        // Start at index 10 (SW corner [-73, 73]), heading north
        const startIdx = 10;
        patrolIdx = (startIdx + 1) % PATROL_ROUTE.length;
        const startWp = PATROL_ROUTE[startIdx];
        pivot_.position.set(startWp[0], 0, startWp[1]);

        const nextWp = PATROL_ROUTE[patrolIdx];
        pivot_.rotation.y = Math.atan2(
            nextWp[0] - startWp[0],
            nextWp[1] - startWp[1]
        );
    }

    /** Call when a pedestrian has been hit — switches to chase mode. */
    function alert() {
        if (state !== 'patrol') return;
        state = 'chase';
        // Begin routing from the road intersection nearest to the police car
        chaseNode = nearestNode(pivot_.position.x, pivot_.position.z);
    }

    function isChasing() { return state === 'chase'; }

    function getPivot() { return pivot_; }

    function update() {
        if (state === 'inactive' || !pivot_) return;
        _frame++;

        // ── Flashing lights ─────────────────────────────────────────────
        if (_lightLMat && _lightRMat) {
            const phase = Math.floor(_frame / LIGHT_PERIOD) & 1;
            _lightLMat.diffuseColor  = phase === 0 ? RED : OFF;
            _lightLMat.emissiveColor = phase === 0 ? RED : OFF;
            _lightRMat.diffuseColor  = phase === 0 ? OFF : BLUE;
            _lightRMat.emissiveColor = phase === 0 ? OFF : BLUE;
        }

        const speed = state === 'chase' ? CHASE_SPEED : PATROL_SPEED;

        // ── Determine steering target ─────────────────────────────────────
        let targetX, targetZ;

        if (state === 'patrol') {
            const wp = PATROL_ROUTE[patrolIdx];
            targetX = wp[0];
            targetZ = wp[1];

            const dx = targetX - pivot_.position.x;
            const dz = targetZ - pivot_.position.z;
            if (dx * dx + dz * dz < REACH_DIST * REACH_DIST) {
                patrolIdx = (patrolIdx + 1) % PATROL_ROUTE.length;
            }
        } else {
            // Chase: navigate via road-centreline intersection nodes
            targetX = chaseNode[0];
            targetZ = chaseNode[1];

            const dx = targetX - pivot_.position.x;
            const dz = targetZ - pivot_.position.z;
            if (dx * dx + dz * dz < REACH_DIST * REACH_DIST) {
                // Reached node — pick the next one closest to target
                const tgt = Truck.isDrivingActive()
                    ? Truck.getMesh().position
                    : Player.getPosition();
                chaseNode = pickNextNode(chaseNode[0], chaseNode[1], tgt.x, tgt.z);
                targetX   = chaseNode[0];
                targetZ   = chaseNode[1];
            }

            // Continuous arrest check (every frame, not just at node arrival)
            const tgt2 = Truck.isDrivingActive()
                ? Truck.getMesh().position
                : Player.getPosition();
            const adx = tgt2.x - pivot_.position.x;
            const adz = tgt2.z - pivot_.position.z;
            if (adx * adx + adz * adz < ARREST_DIST * ARREST_DIST) {
                state = 'inactive';
                GameState.set(GameState.STATES.JAILED);
                return;
            }
        }

        // ── Avoidance rays (patrol only, throttled) ──────────────────────
        // During chase the police ignores other vehicles.
        if (state === 'patrol' && (_frame % RAY_INTERVAL === 0)) {
            const sinY = Math.sin(pivot_.rotation.y);
            const cosY = Math.cos(pivot_.rotation.y);
            _fwd.set(sinY, 0, cosY);
            _rgt.set(cosY, 0, -sinY);

            _frontBase.set(
                pivot_.position.x + _fwd.x * 2.2, 0.9,
                pivot_.position.z + _fwd.z * 2.2
            );
            _orig0.copyFrom(_frontBase);
            _orig1.set(
                _frontBase.x + _rgt.x * CAR_HALF_W, _frontBase.y,
                _frontBase.z + _rgt.z * CAR_HALF_W
            );
            _orig2.set(
                _frontBase.x - _rgt.x * CAR_HALF_W, _frontBase.y,
                _frontBase.z - _rgt.z * CAR_HALF_W
            );

            let minHit = LOOK_AHEAD + 1;
            for (const orig of [_orig0, _orig1, _orig2]) {
                _ray.origin.copyFrom(orig);
                _ray.direction.copyFrom(_fwd);
                _ray.length = LOOK_AHEAD;
                const hit = scene_.pickWithRay(_ray, m =>
                    m !== collider_ && m.metadata?.isNPCCar === true
                );
                if (hit && hit.hit && hit.distance < minHit) minHit = hit.distance;
            }

            _speedMult = minHit <= LOOK_AHEAD
                ? Math.max(0, (minHit - STOP_DIST) / (LOOK_AHEAD - STOP_DIST))
                : 1.0;
        } else if (state === 'chase') {
            // Brake as we close in so the car stops at the target rather than
            // driving through the truck/player mesh.
            const tgt3 = Truck.isDrivingActive()
                ? Truck.getMesh().position
                : Player.getPosition();
            const cdx = tgt3.x - pivot_.position.x;
            const cdz = tgt3.z - pivot_.position.z;
            const chaseDist = Math.sqrt(cdx * cdx + cdz * cdz);
            _speedMult = chaseDist >= CHASE_BRAKE_START
                ? 1.0
                : Math.max(0.05, chaseDist / CHASE_BRAKE_START);
        }

        // ── Steer toward target with alignMult ────────────────────────────
        // alignMult = cos(heading_error): car slows proportionally to how much
        // it still needs to turn.  At 90 deg diff the car stops and turns in
        // place — this prevents corner-cutting onto sidewalks.
        let alignMult = 1.0;
        const dx   = targetX - pivot_.position.x;
        const dz   = targetZ - pivot_.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.1) {
            const desired = Math.atan2(dx, dz);
            let diff = desired - pivot_.rotation.y;
            while (diff >  Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const turn = Math.max(-TURN_SPEED, Math.min(TURN_SPEED, diff));
            pivot_.rotation.y += turn;
            alignMult = Math.max(0, Math.cos(diff));
        }

        // ── Move ─────────────────────────────────────────────────────────
        const sinY = Math.sin(pivot_.rotation.y);
        const cosY = Math.cos(pivot_.rotation.y);
        pivot_.position.x += sinY * speed * _speedMult * alignMult;
        pivot_.position.z += cosY * speed * _speedMult * alignMult;
        pivot_.position.y  = 0;

        // ── Player knockback when police car is nearby ───────────────────
        const playerPos = Player.getPosition();
        const pdx = playerPos.x - pivot_.position.x;
        const pdz = playerPos.z - pivot_.position.z;
        if (pdx * pdx + pdz * pdz < HIT_DIST * HIT_DIST) {
            Player.applyKnockback(pdx, pdz);
        }
    }

    return { init, update, alert, isChasing, getPivot };
})();
