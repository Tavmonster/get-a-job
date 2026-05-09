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
    const PATROL_SPEED  = 0.1275;
    const CHASE_SPEED   = 0.30;
    const TURN_SPEED    = 0.195;    // rad/frame max yaw rate
    const REACH_DIST    = 2.0;     // waypoint snap distance (tight to prevent corner overshoot)
    const ARREST_DIST   = 6.5;     // catch / arrest distance (must be > truck half-depth 4.5)
    const CHASE_BRAKE_START = 10.0; // begin slowing at this distance in chase mode
    const LOOK_AHEAD    = 9.0;     // avoidance ray length
    const STOP_DIST     = 3.5;     // full-stop avoidance distance
    const CAR_HALF_W    = 0.9;     // side-ray lateral offset
    const HIT_DIST      = 2.8;     // player knockback distance
    const RAY_INTERVAL  = 4;       // avoidance ray throttle (every N frames)
    const LIGHT_PERIOD  = 8;       // frames per light half-cycle

    // ── Park zone (grid cols 0-1, rows 0-1) ──────────────────────────────
    // Park grass covers x ∈ (-105, -45), z ∈ (-105, -45).
    // When chasing and the player OR the police car is inside this zone,
    // the police may drive directly across grass/sidewalks instead of
    // following road-centreline nodes.
    const PARK_MIN_X = -105, PARK_MAX_X = -45;
    const PARK_MIN_Z = -105, PARK_MAX_Z = -45;
    function inParkZone(x, z) {
        return x >= PARK_MIN_X && x <= PARK_MAX_X && z >= PARK_MIN_Z && z <= PARK_MAX_Z;
    }

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
    let _lastLightPhase = -1;

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

    function update(dt) {
        if (state === 'inactive' || !pivot_) return;
        _frame++;

        // ── Flashing lights ─────────────────────────────────────────────
        if (_lightLMat && _lightRMat) {
            const phase = Math.floor(_frame / LIGHT_PERIOD) & 1;
            if (phase !== _lastLightPhase) {
                _lastLightPhase = phase;
                _lightLMat.diffuseColor  = phase === 0 ? RED : OFF;
                _lightLMat.emissiveColor = phase === 0 ? RED : OFF;
                _lightRMat.diffuseColor  = phase === 0 ? OFF : BLUE;
                _lightRMat.emissiveColor = phase === 0 ? OFF : BLUE;
            }
        }

        const speed = state === 'chase' ? CHASE_SPEED : PATROL_SPEED;

        // ── Determine steering target ─────────────────────────────────────
        let targetX, targetZ;
        let parkChase = false;   // true when police may cut across park

        if (state === 'patrol') {
            const wp = PATROL_ROUTE[patrolIdx];
            targetX = wp[0];
            targetZ = wp[1];

            const dx = targetX - pivot_.position.x;
            const dz = targetZ - pivot_.position.z;
            if (dx * dx + dz * dz < REACH_DIST * REACH_DIST) {
                // Snap precisely to waypoint corner before turning (prevents arc drift)
                pivot_.position.x = targetX;
                pivot_.position.z = targetZ;
                patrolIdx = (patrolIdx + 1) % PATROL_ROUTE.length;
            }
        } else {
            const tgt = Truck.isDrivingActive()
                ? Truck.getMesh().position
                : Player.getPosition();

            // Park-direct: both police AND player inside park zone.
            // Prevents going off-road through adjacent buildings when player is outside.
            parkChase = inParkZone(pivot_.position.x, pivot_.position.z) &&
                        inParkZone(tgt.x, tgt.z);

            if (parkChase) {
                // Drive straight at the player/truck.
                targetX = tgt.x;
                targetZ = tgt.z;
            } else {
                // Chase: navigate via road-centreline intersection nodes
                targetX = chaseNode[0];
                targetZ = chaseNode[1];

                const dx = targetX - pivot_.position.x;
                const dz = targetZ - pivot_.position.z;
                if (dx * dx + dz * dz < REACH_DIST * REACH_DIST) {
                    // Snap to node, then pick next toward target
                    pivot_.position.x = targetX;
                    pivot_.position.z = targetZ;
                    chaseNode = pickNextNode(chaseNode[0], chaseNode[1], tgt.x, tgt.z);
                    targetX   = chaseNode[0];
                    targetZ   = chaseNode[1];
                }
            }

            // Continuous arrest check (every frame, not just at node arrival)
            const adx = tgt.x - pivot_.position.x;
            const adz = tgt.z - pivot_.position.z;
            if (adx * adx + adz * adz < ARREST_DIST * ARREST_DIST) {
                state = 'inactive';
                GameState.set(GameState.STATES.JAILED);
                return;
            }
        }

        // ── Avoidance / speed adjustment ───────────────────────────────────
        // Patrol: NPC-car avoidance rays only (throttled).
        // Park chase: 5-direction fan of rays toward target — picks the clearest
        //   path that still makes progress. Filter: buildings (checkCollisions),
        //   NPC cars (isNPCCar metadata), park equipment (isParkObstacle metadata).
        //   Player/truck are intentionally excluded so they don't cause braking.
        // Road chase: simple brake-on-approach.
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
        } else if (state === 'chase' && parkChase) {
            // 5-direction fan of rays every frame for responsive steering.
            const pt = Truck.isDrivingActive()
                ? Truck.getMesh().position
                : Player.getPosition();

            // Only detect solid obstacles — not the player/truck target.
            // checkCollisions catches buildings + tree trunks + sandbox walls.
            // isNPCCar catches NPC car colliders (isPickable=true, checkCollisions=false).
            // isParkObstacle catches bench backrests, slide poles, swing posts, fountain.
            const parkFilter = m =>
                m !== collider_ &&
                m.isPickable !== false &&
                (m.checkCollisions === true ||
                 m.metadata?.isNPCCar === true ||
                 m.metadata?.isParkObstacle === true);

            const idealAngle = Math.atan2(
                pt.x - pivot_.position.x,
                pt.z - pivot_.position.z
            );
            let bestAngle = idealAngle;
            let bestClear = -1;
            let bestDeg   = Infinity;

            for (const deg of [-60, -30, 0, 30, 60]) {
                const angle = idealAngle + deg * Math.PI / 180;
                const sinA  = Math.sin(angle);
                const cosA  = Math.cos(angle);
                _ray.origin.set(
                    pivot_.position.x + sinA * 2.2, 0.9,
                    pivot_.position.z + cosA * 2.2
                );
                _ray.direction.set(sinA, 0, cosA);
                _ray.length = LOOK_AHEAD;
                const hit = scene_.pickWithRay(_ray, parkFilter);
                const clearDist = (hit && hit.hit) ? hit.distance : LOOK_AHEAD + 1;
                // Prefer the smallest angular deviation from ideal that is clear
                if (clearDist > STOP_DIST && Math.abs(deg) < Math.abs(bestDeg)) {
                    bestDeg   = deg;
                    bestAngle = angle;
                    bestClear = clearDist;
                }
            }

            if (bestClear < 0) {
                _speedMult = 0; // completely blocked — stop and spin
            } else {
                _speedMult = bestClear > LOOK_AHEAD
                    ? 1.0
                    : Math.max(0.15, (bestClear - STOP_DIST) / (LOOK_AHEAD - STOP_DIST));
                if (bestDeg !== 0 && bestDeg !== Infinity) {
                    // Deviate toward clearest direction — use intermediate point
                    targetX = pivot_.position.x + Math.sin(bestAngle) * 15;
                    targetZ = pivot_.position.z + Math.cos(bestAngle) * 15;
                }
            }
        } else if (state === 'chase' && !parkChase) {
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
            pivot_.rotation.y += turn * dt;
            // Squared cosine: drops to near-zero much faster for large angles,
            // so the car is nearly stopped before it has finished turning the corner.
            alignMult = Math.pow(Math.max(0, Math.cos(diff)), 2);
        }

        // ── Move ─────────────────────────────────────────────────────────
        const sinY = Math.sin(pivot_.rotation.y);
        const cosY = Math.cos(pivot_.rotation.y);
        pivot_.position.x += sinY * speed * _speedMult * alignMult * dt;
        pivot_.position.z += cosY * speed * _speedMult * alignMult * dt;
        pivot_.position.y  = 0;

        // Clamp to park zone during park-direct chase to prevent crossing into
        // adjacent building cells (3-unit buffer = just over one car half-width).
        if (parkChase) {
            pivot_.position.x = Math.max(PARK_MIN_X + 3, Math.min(PARK_MAX_X - 3, pivot_.position.x));
            pivot_.position.z = Math.max(PARK_MIN_Z + 3, Math.min(PARK_MAX_Z - 3, pivot_.position.z));
        }

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
