/**
 * world.js — Ground, buildings, special zones, park
 * Returns references to key trigger zones and named locations.
 */
const World = (() => {

    // Colour palette (flat-shaded)
    const COLOURS = {
        ground:      "#4a7c4e",
        road:        "#3a3a3a",
        sidewalk:    "#b0a090",
        building:    ["#c0392b","#2980b9","#27ae60","#f39c12","#8e44ad",
                      "#16a085","#d35400","#2c3e50","#7f8c8d","#1abc9c"],
        roof:        "#555555",
        bench:       "#8B5E3C",
        truckPad:    "#555500",
        store:       "#e8d5b0",
        hotel:       "#003366",
        fastFood:    "#cc3300",
        hiringSign:  "#ff0000",
        windowClr:   "#87CEEB",
        door:        "#6B3A2A",
        parkGrass:   "#2ecc71",
        deliveryMkr: "#FFD700",
        slideClr:    "#e74c3c",
        swingFrame:  "#95a5a6",
        swingSeat:   "#f39c12",
        sandFloor:   "#e8c87a",
        sandWall:    "#a07840",
        stoneWall:   "#7a7870",
        treeTrunk:   "#6b4423",
        treeLeaves:  "#27ae60",
        fountain:    "#95a5a6",
    };

    function mat(scene, hex, alpha) {
        const m = new BABYLON.StandardMaterial("m_" + Math.random(), scene);
        m.diffuseColor = BABYLON.Color3.FromHexString(hex.length === 7 ? hex : "#" + hex);
        m.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        if (alpha !== undefined) m.alpha = alpha;
        return m;
    }

    // ── Grid layout constants ─────────────────────────────────────────
    const BLOCK = 30;       // distance between building centres (grid step)
    const COLS  = 7;
    const ROWS  = 7;
    // Park: top-left quadrant (col 0-1, row 0-1)
    // Store: col 5, row 1
    // Depot: col 6, row 1  (directly east of Store)
    // Hotel: col 5, row 5

    const PARK_COLS  = [0, 1];
    const PARK_ROWS  = [0, 1];
    const STORE_POS     = { col: 5, row: 1 };
    const HOTEL_POS     = { col: 5, row: 5 };
    const FAST_FOOD_POS = { col: 3, row: 5 };
    const DEPOT_POS         = { col: 6, row: 1 };
    const DEPOT_FORECOURT_POS = { col: DEPOT_POS.col, row: DEPOT_POS.row - 1 };

    // World-space origin offset so the grid is centred
    const OX = -((COLS - 1) / 2) * BLOCK;
    const OZ = -((ROWS - 1) / 2) * BLOCK;

    function gridPos(col, row) {
        return new BABYLON.Vector3(OX + col * BLOCK, 0, OZ + row * BLOCK);
    }

    // ── Delivery house positions (5 spread-out residential buildings) ─
    // These are non-special buildings at predefined grid locations
    const DELIVERY_CELLS = [
        { col: 0, row: 4 },
        { col: 2, row: 2 },
        { col: 3, row: 4 },
        { col: 6, row: 3 },
        { col: 4, row: 2 },
    ];

    function isDeliveryCell(col, row) {
        return DELIVERY_CELLS.some(d => d.col === col && d.row === row);
    }

    const specialBuildings = {};   // "col,row" → { mesh, type, triggerZone }

    function build(scene) {
        // ── Ground ────────────────────────────────────────────────────
        const ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: COLS * BLOCK + 300,
            height: ROWS * BLOCK + 300,
        }, scene);
        ground.material = mat(scene, COLOURS.ground);
        ground.checkCollisions = true;
        ground.receiveShadows = true;

        // ── Roads ─────────────────────────────────────────────────────
        // Horizontal roads — placed between rows (at half-integer offsets)
        // ROWS+1 roads so streets frame every row of buildings
        const roadMat = mat(scene, COLOURS.road);
        const roadMeshes = [];
        for (let row = 0; row <= ROWS; row++) {
            const road = BABYLON.MeshBuilder.CreateGround("roadH_" + row, {
                width: COLS * BLOCK + 8,   // spans grid only: outermost road centres (±105) + half road width (±4)
                height: 8,
            }, scene);
            road.position.set(0, 0.01, OZ + (row - 0.5) * BLOCK);
            road.material = roadMat;
            roadMeshes.push(road);
        }
        // Vertical roads — placed between columns (at half-integer offsets)
        // COLS+1 roads so streets frame every column of buildings
        for (let col = 0; col <= COLS; col++) {
            const road = BABYLON.MeshBuilder.CreateGround("roadV_" + col, {
                width: 8,
                height: ROWS * BLOCK + 8,  // spans grid only: outermost road centres (±105) + half road width (±4)
            }, scene);
            road.position.set(OX + (col - 0.5) * BLOCK, 0.01, 0);
            road.material = roadMat;
            roadMeshes.push(road);
        }
        // Merge into one draw call.
        const mergedRoads = BABYLON.Mesh.MergeMeshes(roadMeshes, true, true);
        if (mergedRoads) {
            mergedRoads.name = "roads";
            mergedRoads.material = roadMat;
        }

        buildSidewalks(scene);

        // ── Buildings ─────────────────────────────────────────────────
        for (let col = 0; col < COLS; col++) {
            for (let row = 0; row < ROWS; row++) {
                const isPark        = PARK_COLS.includes(col) && PARK_ROWS.includes(row);
                const isStore       = col === STORE_POS.col && row === STORE_POS.row;
                const isHotel       = col === HOTEL_POS.col && row === HOTEL_POS.row;
                const isFastFood    = col === FAST_FOOD_POS.col && row === FAST_FOOD_POS.row;
                const isDepot       = col === DEPOT_POS.col && row === DEPOT_POS.row;
                const isForecourt   = col === DEPOT_FORECOURT_POS.col && row === DEPOT_FORECOURT_POS.row;
                const isDel         = isDeliveryCell(col, row);
                const key     = `${col},${row}`;

                const pos = gridPos(col, row);

                if (isPark) {
                    buildPark(scene, pos, col, row);
                    continue;
                }

                // Leave the depot forecourt empty so the truck spawn pad is unobstructed
                if (isForecourt) continue;

                if (isStore) {
                    specialBuildings[key] = buildStore(scene, pos);
                    continue;
                }

                if (isHotel) {
                    specialBuildings[key] = buildHotel(scene, pos);
                    continue;
                }

                if (isFastFood) {
                    specialBuildings[key] = buildFastFood(scene, pos);
                    continue;
                }

                if (isDepot) {
                    specialBuildings[key] = buildDepot(scene, pos);
                    continue;
                }

                // Generic building
                const h = 6 + Math.random() * 8;
                const w = 11 + Math.random() * 4;
                const d = 11 + Math.random() * 4;
                const colIdx = (col + row * COLS) % COLOURS.building.length;

                const bld = BABYLON.MeshBuilder.CreateBox("building_" + key, {
                    width: w, height: h, depth: d,
                }, scene);
                bld.position.set(pos.x, h / 2, pos.z);
                bld.material = mat(scene, COLOURS.building[colIdx]);
                bld.checkCollisions = true;

                // Roof
                const roof = BABYLON.MeshBuilder.CreateBox("roof_" + key, {
                    width: w + 1, height: 0.8, depth: d + 1,
                }, scene);
                roof.position.set(pos.x, h + 0.4, pos.z);
                roof.material = mat(scene, COLOURS.roof);
                roof.checkCollisions = false;

                // Windows (left/west face already; right/east face added inside addWindows)
                addWindows(scene, pos, w, h, d, colIdx);

                // Door on south face — skip for delivery houses (they get a north door instead)
                if (!isDel) {
                    const doorH = 3.5;
                    const door = BABYLON.MeshBuilder.CreateBox("door_" + key, {
                        width: 2.0, height: doorH, depth: 0.15,
                    }, scene);
                    door.position.set(pos.x, doorH / 2, pos.z - d / 2 - 0.08);
                    door.material = mat(scene, COLOURS.door);
                }

                // Delivery house: door on north face, marker and trigger in front of it
                if (isDel) {
                    // Visible door on the north-facing wall
                    const doorH = 3.5;
                    const door = BABYLON.MeshBuilder.CreateBox("door_" + key, {
                        width: 2.0, height: doorH, depth: 0.15,
                    }, scene);
                    door.position.set(pos.x, doorH / 2, pos.z + d / 2 + 0.08);
                    door.material = mat(scene, COLOURS.door);

                    // Doorstep position — where the delivered package will be placed
                    const doorStepPos = new BABYLON.Vector3(pos.x, 0, pos.z + d / 2 + 0.9);

                    const marker = BABYLON.MeshBuilder.CreateGround("marker_" + key, {
                        width: 6, height: 6,
                    }, scene);
                    marker.position.set(pos.x, 0.03, pos.z + (d / 2) + 3);
                    marker.material = mat(scene, COLOURS.deliveryMkr);
                    marker.layerMask = 0x00000002; // visible on minimap only
                    marker.metadata = { type: "deliveryMarker", cell: { col, row } };

                    // Invisible trigger box
                    const trigger = BABYLON.MeshBuilder.CreateBox("delTrigger_" + key, {
                        width: 8, height: 4, depth: 8,
                    }, scene);
                    trigger.position.set(pos.x, 2, pos.z + (d / 2) + 3);
                    trigger.isVisible = false;
                    trigger.isPickable = false;
                    trigger.metadata = { type: "deliveryTrigger", cell: { col, row }, marker };

                    specialBuildings[key] = { type: "delivery", trigger, marker, pos, doorStepPos };
                }
            }
        }

        buildBoundaryWalls(scene);

        // Freeze all static mesh world matrices — tells Babylon to skip
        // recomputing transforms for these meshes every frame, which cuts
        // CPU significantly for large static scenes.
        // Exclusions: anything that moves or has a moving parent.
        const SKIP_PREFIXES = [
            "dot_", "npcCar", "truck", "npc_", "objMarker", "fastfoodMM",
            // player parts
            "playerBody", "legL", "legR", "shoeL", "shoeR", "torso", "shirt",
            "tie", "armL", "armR", "handL", "handR", "head", "hair", "neck",
            "collar", "lapelL", "lapelR", "pocket",
            // npc parts
            "npcRoot", "npcLeg", "npcArm", "npcHead", "npcTorso", "npcBody",
            "npcHair", "npcNeck", "npcShoe",
        ];
        scene.meshes.forEach(m => {
            const skip = SKIP_PREFIXES.some(p => m.name.startsWith(p)) || m.parent;
            if (!skip) {
                m.freezeWorldMatrix();
                m.doNotSyncBoundingInfo = true;
                m.isPickable = false;
            }
        });

        return specialBuildings;
    }

    // ── Park ─────────────────────────────────────────────────────────
    function buildPark(scene, pos, col, row) {
        // Each park cell gets its own grass tile, correctly centred
        const grass = BABYLON.MeshBuilder.CreateGround("parkGrass_" + col + "_" + row, {
            width: BLOCK - 2, height: BLOCK - 2,
        }, scene);
        grass.position.set(pos.x, 0.02, pos.z);
        grass.material = mat(scene, COLOURS.parkGrass);

        // All park features built once from the first cell.
        // Roads run at half-BLOCK offsets (x=-75, z=-75 between these cells),
        // so each cell centre is the safe anchor for its features.
        if (col !== 0 || row !== 0) return;

        // Each cell's world-space centre
        const c00x = pos.x,          c00z = pos.z;           // (-90, -90)
        const c10x = pos.x + BLOCK,  c10z = pos.z;           // (-60, -90)
        const c01x = pos.x,          c01z = pos.z + BLOCK;   // (-90, -60)
        const c11x = pos.x + BLOCK,  c11z = pos.z + BLOCK;   // (-60, -60)

        // Cell (0,0) — player spawns at z-3; bench backrest faces south toward player
        addBench(scene,       new BABYLON.Vector3(c00x,     0, c00z), true);
        addFountain(scene,    new BABYLON.Vector3(c00x + 7, 0, c00z + 7));

        // Cell (1,0) — slide (poles at centre, ramp extends south into cell)
        addSlide(scene,       new BABYLON.Vector3(c10x,     0, c10z - 3));

        // Cell (0,1) — swings
        addSwings(scene,      new BABYLON.Vector3(c01x,     0, c01z));

        // Cell (1,1) — sandbox and picnic table
        addSandbox(scene,     new BABYLON.Vector3(c11x - 3, 0, c11z));
        addPicnicTable(scene, new BABYLON.Vector3(c11x + 5, 0, c11z + 6));

        // Trees — outer corners and mid-edges of each cell, well clear of equipment
        addTree(scene, new BABYLON.Vector3(c00x - 10, 0, c00z - 10)); // SW park corner
        // tree at (c00x, c00z-10) removed — was directly behind the spawn bench
        addTree(scene, new BABYLON.Vector3(c00x - 10, 0, c00z));      // W of cell (0,0)
        addTree(scene, new BABYLON.Vector3(c10x,      0, c10z - 10)); // S of cell (1,0)
        addTree(scene, new BABYLON.Vector3(c10x + 10, 0, c10z - 10)); // SE park corner
        addTree(scene, new BABYLON.Vector3(c01x - 10, 0, c01z + 10)); // NW park corner
        addTree(scene, new BABYLON.Vector3(c01x,      0, c01z + 10)); // N of cell (0,1)
        addTree(scene, new BABYLON.Vector3(c11x,      0, c11z + 10)); // N of cell (1,1)
        addTree(scene, new BABYLON.Vector3(c11x + 10, 0, c11z + 10)); // NE park corner
        addTree(scene, new BABYLON.Vector3(c11x + 10, 0, c11z));      // E of cell (1,1)
    }

    // flip=true puts the backrest on the -z side (toward the player spawn at z-3)
    function addBench(scene, pos, flip = false) {
        const id = Math.round(pos.x) + "_" + Math.round(pos.z);
        const dz = flip ? -1 : 1;
        // Seat
        const seat = BABYLON.MeshBuilder.CreateBox("benchSeat_" + id, { width: 3.5, height: 0.3, depth: 1 }, scene);
        seat.position.set(pos.x, 0.6, pos.z);
        seat.material = mat(scene, COLOURS.bench);

        // Legs (4)
        const legPositions = [[-1.5, -0.15 * dz], [1.5, -0.15 * dz], [-1.5, 0.15 * dz], [1.5, 0.15 * dz]];
        legPositions.forEach(([lx, lz], i) => {
            const leg = BABYLON.MeshBuilder.CreateBox("benchLeg_" + id + "_" + i, { width: 0.2, height: 0.6, depth: 0.2 }, scene);
            leg.position.set(pos.x + lx, 0.3, pos.z + lz);
            leg.material = mat(scene, COLOURS.bench);
        });

        // Backrest
        const back = BABYLON.MeshBuilder.CreateBox("benchBack_" + id, { width: 3.5, height: 0.8, depth: 0.15 }, scene);
        back.position.set(pos.x, 1.1, pos.z + 0.45 * dz);
        back.material = mat(scene, COLOURS.bench);
    }

    // ── Slide ─────────────────────────────────────────────────────────
    function addSlide(scene, pos) {
        const poleH = 4;
        const metal = COLOURS.swingFrame;

        // Two back support poles
        [-1.0, 1.0].forEach(ox => {
            const pole = BABYLON.MeshBuilder.CreateCylinder("slidePole_" + ox, { height: poleH, diameter: 0.22 }, scene);
            pole.position.set(pos.x + ox, poleH / 2, pos.z);
            pole.material = mat(scene, metal);
        });

        // Crossbar connecting poles at top
        const cross = BABYLON.MeshBuilder.CreateCylinder("slideCross", { height: 2.2, diameter: 0.18 }, scene);
        cross.rotation.z = Math.PI / 2;
        cross.position.set(pos.x, poleH, pos.z);
        cross.material = mat(scene, metal);

        // Platform
        const platform = BABYLON.MeshBuilder.CreateBox("slidePlatform", { width: 2.4, height: 0.25, depth: 2 }, scene);
        platform.position.set(pos.x, poleH + 0.125, pos.z + 0.5);
        platform.material = mat(scene, metal);

        // Platform side handrails
        [-1.1, 1.1].forEach(ox => {
            const rail = BABYLON.MeshBuilder.CreateBox("slidePRail_" + ox, { width: 0.1, height: 0.8, depth: 2 }, scene);
            rail.position.set(pos.x + ox, poleH + 0.65, pos.z + 0.5);
            rail.material = mat(scene, metal);
        });

        // Ladder uprights
        [-0.9, 0.9].forEach(ox => {
            const up = BABYLON.MeshBuilder.CreateCylinder("slideUp_" + ox, { height: poleH, diameter: 0.15 }, scene);
            up.position.set(pos.x + ox, poleH / 2, pos.z - 0.85);
            up.material = mat(scene, metal);
        });

        // Ladder rungs
        for (let i = 0; i < 4; i++) {
            const rung = BABYLON.MeshBuilder.CreateCylinder("slideRung_" + i, { height: 1.8, diameter: 0.12 }, scene);
            rung.rotation.z = Math.PI / 2;
            rung.position.set(pos.x, 0.6 + i * 0.9, pos.z - 0.85);
            rung.material = mat(scene, metal);
        }

        // Ramp
        const horizDist = 5.0;
        const rampLen   = Math.sqrt(poleH * poleH + horizDist * horizDist);
        const rampAngle = Math.atan2(poleH, horizDist);
        const ramp = BABYLON.MeshBuilder.CreateBox("slideRamp", { width: 1.8, height: 0.18, depth: rampLen }, scene);
        ramp.position.set(pos.x, poleH / 2, pos.z + 1.5 + horizDist / 2);
        ramp.rotation.x = rampAngle;
        ramp.material = mat(scene, COLOURS.slideClr);

        // Ramp side rails
        [-0.95, 0.95].forEach(ox => {
            const sRail = BABYLON.MeshBuilder.CreateBox("slideRail_" + ox, { width: 0.1, height: 0.4, depth: rampLen }, scene);
            sRail.position.set(pos.x + ox, poleH / 2 + 0.22, pos.z + 1.5 + horizDist / 2);
            sRail.rotation.x = rampAngle;
            sRail.material = mat(scene, metal);
        });
    }

    // ── Swings ────────────────────────────────────────────────────────
    function addSwings(scene, pos) {
        const frameH   = 5.0;
        const postX    = 4.0;    // posts at x ± 4 (swings at -2,0,+2 leave room on each side)
        const chainLen = 3.0;
        const cSpread  = 0.38;   // half-gap between the two chains on a swing
        const metal    = COLOURS.swingFrame;

        // Two straight vertical posts
        [-postX, postX].forEach(ox => {
            const post = BABYLON.MeshBuilder.CreateCylinder(
                "swPost_" + ox,
                { height: frameH, diameter: 0.30, tessellation: 8 },
                scene
            );
            post.position.set(pos.x + ox, frameH / 2, pos.z);
            post.material = mat(scene, metal);

            // // Short diagonal brace from the base outward for stability look
            // const braceLen = 2.2;
            // const braceAngle = Math.PI / 6;   // 30° from vertical
            // const brace = BABYLON.MeshBuilder.CreateCylinder(
            //     "swBrace_" + ox,
            //     { height: braceLen, diameter: 0.15, tessellation: 8 },
            //     scene
            // );
            // const sign = ox < 0 ? -1 : 1;
            // brace.position.set(
            //     pos.x + ox + sign * Math.sin(braceAngle) * braceLen / 2,
            //     braceLen / 2 * Math.cos(braceAngle),
            //     pos.z
            // );
            // brace.rotation.z = -sign * braceAngle;
            // brace.material = mat(scene, metal);
        });

        // Top bar spanning between the two posts
        const bar = BABYLON.MeshBuilder.CreateCylinder(
            "swBar",
            { height: postX * 2, diameter: 0.22, tessellation: 8 },
            scene
        );
        bar.rotation.z = Math.PI / 2;
        bar.position.set(pos.x, frameH, pos.z);
        bar.material = mat(scene, metal);

        // Three swings: two parallel vertical chains + a flat seat
        [-2.0, 0.0, 2.0].forEach(ox => {
            [-cSpread, cSpread].forEach(dx => {
                const chain = BABYLON.MeshBuilder.CreateCylinder(
                    "swChain_" + ox + "_" + dx,
                    { height: chainLen, diameter: 0.07, tessellation: 6 },
                    scene
                );
                chain.position.set(pos.x + ox + dx, frameH - chainLen / 2, pos.z);
                chain.material = mat(scene, metal);
            });

            const seat = BABYLON.MeshBuilder.CreateBox(
                "swSeat_" + ox,
                { width: 1.1, height: 0.12, depth: 0.44 },
                scene
            );
            seat.position.set(pos.x + ox, frameH - chainLen - 0.06, pos.z);
            seat.material = mat(scene, COLOURS.swingSeat);
        });
    }

    // ── Sandbox ───────────────────────────────────────────────────────
    function addSandbox(scene, pos) {
        const size = 5.5;
        const wallH = 0.45;
        const wallT = 0.35;

        const sand = BABYLON.MeshBuilder.CreateGround("sandboxFloor", { width: size, height: size }, scene);
        sand.position.set(pos.x, 0.03, pos.z);
        sand.material = mat(scene, COLOURS.sandFloor);

        const wallDefs = [
            { w: size + wallT * 2, d: wallT, x: 0,         z:  size / 2, name: "N" },
            { w: size + wallT * 2, d: wallT, x: 0,         z: -size / 2, name: "S" },
            { w: wallT,            d: size,  x:  size / 2, z: 0,         name: "E" },
            { w: wallT,            d: size,  x: -size / 2, z: 0,         name: "W" },
        ];
        for (const wd of wallDefs) {
            const wall = BABYLON.MeshBuilder.CreateBox("sbWall" + wd.name, { width: wd.w, height: wallH, depth: wd.d }, scene);
            wall.position.set(pos.x + wd.x, wallH / 2, pos.z + wd.z);
            wall.material = mat(scene, COLOURS.sandWall);
            wall.checkCollisions = true;
        }
    }

    // ── Tree ──────────────────────────────────────────────────────────
    function addTree(scene, pos) {
        const id = Math.round(pos.x) + "_" + Math.round(pos.z);
        const trunk = BABYLON.MeshBuilder.CreateCylinder("treeTrunk_" + id, {
            height: 3.5, diameterBottom: 0.6, diameterTop: 0.35, tessellation: 8,
        }, scene);
        trunk.position.set(pos.x, 1.75, pos.z);
        trunk.material = mat(scene, COLOURS.treeTrunk);
        trunk.checkCollisions = true;

        const canopy1 = BABYLON.MeshBuilder.CreateSphere("treeC1_" + id, { diameter: 4.5, segments: 5 }, scene);
        canopy1.position.set(pos.x, 4.5, pos.z);
        canopy1.material = mat(scene, COLOURS.treeLeaves);

        const canopy2 = BABYLON.MeshBuilder.CreateSphere("treeC2_" + id, { diameter: 3.0, segments: 5 }, scene);
        canopy2.position.set(pos.x, 6.0, pos.z);
        canopy2.material = mat(scene, "#229954");
    }

    // ── Fountain ──────────────────────────────────────────────────────
    function addFountain(scene, pos) {
        const stone = COLOURS.fountain;

        // Outer basin
        const basin = BABYLON.MeshBuilder.CreateCylinder("fountainBasin", {
            height: 0.5, diameter: 5.0, tessellation: 16,
        }, scene);
        basin.position.set(pos.x, 0.25, pos.z);
        basin.material = mat(scene, stone);

        // Water surface
        const water = BABYLON.MeshBuilder.CreateCylinder("fountainWater", {
            height: 0.1, diameter: 4.4, tessellation: 16,
        }, scene);
        water.position.set(pos.x, 0.47, pos.z);
        water.material = mat(scene, "#5dade2", 0.75);

        // Central column
        const column = BABYLON.MeshBuilder.CreateCylinder("fountainCol", {
            height: 1.8, diameterBottom: 0.5, diameterTop: 0.3,
        }, scene);
        column.position.set(pos.x, 1.15, pos.z);
        column.material = mat(scene, stone);

        // Spout cap
        const cap = BABYLON.MeshBuilder.CreateCylinder("fountainCap", {
            height: 0.15, diameter: 0.9, tessellation: 12,
        }, scene);
        cap.position.set(pos.x, 2.13, pos.z);
        cap.material = mat(scene, stone);
    }

    // ── Picnic table ──────────────────────────────────────────────────
    function addPicnicTable(scene, pos) {
        const wood = COLOURS.bench;

        // Tabletop
        const top = BABYLON.MeshBuilder.CreateBox("picnicTop", { width: 3.0, height: 0.12, depth: 1.2 }, scene);
        top.position.set(pos.x, 0.85, pos.z);
        top.material = mat(scene, wood);

        // Two bench seats
        [-0.85, 0.85].forEach(dz => {
            const seat = BABYLON.MeshBuilder.CreateBox("picnicSeat_" + dz, { width: 3.0, height: 0.1, depth: 0.5 }, scene);
            seat.position.set(pos.x, 0.52, pos.z + dz);
            seat.material = mat(scene, wood);
        });

        // Four legs
        [[-1.0, -0.5], [-1.0, 0.5], [1.0, -0.5], [1.0, 0.5]].forEach(([dx, dz], i) => {
            const leg = BABYLON.MeshBuilder.CreateBox("picnicLeg_" + i, { width: 0.1, height: 0.85, depth: 0.1 }, scene);
            leg.position.set(pos.x + dx, 0.425, pos.z + dz);
            leg.material = mat(scene, wood);
        });
    }

    // ── Store ─────────────────────────────────────────────────────────
    function buildStore(scene, pos) {
        const w = 14, h = 8, d = 14;

        const bld = BABYLON.MeshBuilder.CreateBox("store", { width: w, height: h, depth: d }, scene);
        bld.position.set(pos.x, h / 2, pos.z);
        bld.material = mat(scene, COLOURS.store);
        bld.checkCollisions = true;

        // Roof
        const roof = BABYLON.MeshBuilder.CreateBox("storeRoof", { width: w + 1, height: 0.8, depth: d + 1 }, scene);
        roof.position.set(pos.x, h + 0.4, pos.z);
        roof.material = mat(scene, COLOURS.roof);

        // Building label
        const storeLabel = BABYLON.MeshBuilder.CreatePlane("storeLabel", { width: 10, height: 2.5 }, scene);
        storeLabel.position.set(pos.x, 4.5, pos.z - d / 2 - 0.05);
        storeLabel.material = new BABYLON.StandardMaterial("storeLabelMat", scene);
        const storeLabelTex = new BABYLON.DynamicTexture("storeLabelTex", { width: 512, height: 128 }, scene);
        storeLabelTex.drawText("STORE", null, 96, "bold 88px Arial", "#333333", "#e8d5b0", true);
        storeLabel.material.diffuseTexture = storeLabelTex;
        storeLabel.material.emissiveColor = new BABYLON.Color3(0.9, 0.85, 0.7);
        storeLabel.material.backFaceCulling = false;

        // Sign above door
        const sign = BABYLON.MeshBuilder.CreatePlane("hiringSign", { width: 4, height: 1.2 }, scene);
        sign.position.set(pos.x, h - 0.5, pos.z - d / 2 - 0.1);
        sign.material = mat(scene, COLOURS.hiringSign);

        // Sign text via dynamic texture
        const signTex = new BABYLON.DynamicTexture("signTex", { width: 512, height: 128 }, scene);
        signTex.drawText("NOW HIRING", null, 90, "bold 72px Arial", "white", "#cc0000", true);
        sign.material.diffuseTexture = signTex;
        sign.material.emissiveColor = new BABYLON.Color3(1, 0.2, 0.2);

        // Trigger zone (in front of door)
        const trigger = BABYLON.MeshBuilder.CreateBox("storeTrigger", { width: 6, height: 3, depth: 4 }, scene);
        trigger.position.set(pos.x, 1.5, pos.z - d / 2 - 2);
        trigger.isVisible = false;
        trigger.isPickable = false;
        trigger.metadata = { type: "storeTrigger" };

        return { type: "store", bld, trigger, pos };
    }

    // ── Hotel ────────────────────────────────────────────────────────
    function buildHotel(scene, pos) {
        const w = 16, h = 18, d = 14;

        const bld = BABYLON.MeshBuilder.CreateBox("hotel", { width: w, height: h, depth: d }, scene);
        bld.position.set(pos.x, h / 2, pos.z);
        bld.material = mat(scene, COLOURS.hotel);
        bld.checkCollisions = true;

        // Building label
        const sign = BABYLON.MeshBuilder.CreatePlane("hotelSign", { width: 12, height: 3 }, scene);
        sign.position.set(pos.x, 8, pos.z - d / 2 - 0.1);
        const signTex = new BABYLON.DynamicTexture("hotelTex", { width: 512, height: 128 }, scene);
        signTex.drawText("HOTEL", null, 96, "bold 88px Arial", "gold", "#003366", true);
        sign.material = new BABYLON.StandardMaterial("hotelSignMat", scene);
        sign.material.diffuseTexture = signTex;
        sign.material.emissiveColor = new BABYLON.Color3(1, 0.85, 0);
        sign.material.backFaceCulling = false;

        const trigger = BABYLON.MeshBuilder.CreateBox("hotelTrigger", { width: 6, height: 3, depth: 4 }, scene);
        trigger.position.set(pos.x, 1.5, pos.z - d / 2 - 2);
        trigger.isVisible = false;
        trigger.isPickable = false;
        trigger.metadata = { type: "hotelTrigger" };

        return { type: "hotel", bld, trigger, pos };
    }

    // ── Fast Food Restaurant ──────────────────────────────────────────
    function buildFastFood(scene, pos) {
        const w = 13, h = 6, d = 13;

        const bld = BABYLON.MeshBuilder.CreateBox("fastfood", { width: w, height: h, depth: d }, scene);
        bld.position.set(pos.x, h / 2, pos.z);
        bld.material = mat(scene, COLOURS.fastFood);
        bld.checkCollisions = true;

        // Roof overhang in yellow
        const roof = BABYLON.MeshBuilder.CreateBox("fastfoodRoof", { width: w + 2, height: 0.6, depth: d + 2 }, scene);
        roof.position.set(pos.x, h + 0.3, pos.z);
        roof.material = mat(scene, "#f39c12");

        // Building label
        const label = BABYLON.MeshBuilder.CreatePlane("fastfoodLabel", { width: 9, height: 2.2 }, scene);
        label.position.set(pos.x, 4.0, pos.z - d / 2 - 0.05);
        label.material = new BABYLON.StandardMaterial("fastfoodLabelMat", scene);
        const labelTex = new BABYLON.DynamicTexture("fastfoodLabelTex", { width: 512, height: 128 }, scene);
        labelTex.drawText("BURGER BARN", null, 88, "bold 72px Arial", "#ffffff", "#cc3300", true);
        label.material.diffuseTexture = labelTex;
        label.material.emissiveColor = new BABYLON.Color3(1, 0.4, 0.2);
        label.material.backFaceCulling = false;

        // Price sign
        const pricePlane = BABYLON.MeshBuilder.CreatePlane("fastfoodPrice", { width: 4, height: 1.1 }, scene);
        pricePlane.position.set(pos.x, h - 0.5, pos.z - d / 2 - 0.1);
        const priceTex = new BABYLON.DynamicTexture("fastfoodPriceTex", { width: 256, height: 64 }, scene);
        priceTex.drawText("MEAL  $10", null, 48, "bold 40px Arial", "#ffffff", "#f39c12", true);
        pricePlane.material = new BABYLON.StandardMaterial("fastfoodPriceMat", scene);
        pricePlane.material.diffuseTexture = priceTex;
        pricePlane.material.emissiveColor = new BABYLON.Color3(1, 0.8, 0);
        pricePlane.material.backFaceCulling = false;

        // Trigger zone (in front of door)
        const trigger = BABYLON.MeshBuilder.CreateBox("fastfoodTrigger", { width: 6, height: 3, depth: 4 }, scene);
        trigger.position.set(pos.x, 1.5, pos.z - d / 2 - 2);
        trigger.isVisible = false;
        trigger.isPickable = false;
        trigger.metadata = { type: "fastfoodTrigger" };

        // Minimap marker — large flat disc elevated well above the roof.
        // Uses 0x20000000 (same layer as player/truck dots — proven to render on minimap).
        const mmMarker = BABYLON.MeshBuilder.CreateGround("fastfoodMM", {
            width: 22, height: 22,
        }, scene);
        mmMarker.position.set(pos.x, h + 8, pos.z);
        const mmMat = new BABYLON.StandardMaterial("fastfoodMMMat", scene);
        mmMat.diffuseColor    = new BABYLON.Color3(1, 0.35, 0);
        mmMat.emissiveColor   = new BABYLON.Color3(1, 0.35, 0);
        mmMat.disableLighting = true;
        mmMarker.material   = mmMat;
        mmMarker.isPickable = false;
        mmMarker.layerMask  = 0x20000000;  // minimap-only (same as player/truck dots)

        return { type: "fastfood", bld, trigger, pos, mmMarker };
    }

    // ── Depot (truck parking) ─────────────────────────────────────────
    function buildDepot(scene, pos) {
        const w = 16, h = 7, d = 18;

        const bld = BABYLON.MeshBuilder.CreateBox("depot", { width: w, height: h, depth: d }, scene);
        bld.position.set(pos.x, h / 2, pos.z);
        bld.material = mat(scene, "#556270");
        bld.checkCollisions = true;

        const sign = BABYLON.MeshBuilder.CreatePlane("depotSign", { width: 5, height: 1.2 }, scene);
        sign.position.set(pos.x, h - 0.5, pos.z - d / 2 - 0.1);
        const signTex = new BABYLON.DynamicTexture("depotTex", { width: 512, height: 128 }, scene);
        signTex.drawText("DEPOT", null, 90, "bold 80px Arial", "white", "#333", true);
        sign.material = new BABYLON.StandardMaterial("depotSignMat", scene);
        sign.material.diffuseTexture = signTex;
        sign.material.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9);

        // Truck park pad — far enough from the depot wall that the camera
        // (which sits 13 units behind the truck) clears the building.
        const pad = BABYLON.MeshBuilder.CreateGround("depotPad", { width: 10, height: 14 }, scene);
        pad.position.set(pos.x, 0.02, pos.z - d / 2 - 22);
        pad.material = mat(scene, COLOURS.truckPad);

        // Trigger (return-to-depot zone)
        const trigger = BABYLON.MeshBuilder.CreateBox("depotTrigger", { width: 8, height: 3, depth: 6 }, scene);
        trigger.position.set(pos.x, 1.5, pos.z - d / 2 - 2);
        trigger.isVisible = false;
        trigger.isPickable = false;
        trigger.metadata = { type: "depotTrigger" };

        return { type: "depot", bld, trigger, pos, padPos: new BABYLON.Vector3(pos.x, 0.4, pos.z - d / 2 - 22) };
    }

    // ── Sidewalks ─────────────────────────────────────────────────────────
    function buildSidewalks(scene) {
        // Per-block 2-unit-wide strips sitting between the road edge and the
        // nearest building face.  Each segment is BLOCK-8=22 units long so it
        // fits exactly between the ±4-unit vertical/horizontal crossing zones
        // and never overlaps the roads or intersections.  Segments adjacent to
        // park cells or the depot forecourt are omitted entirely.
        // All strips share one material and are merged into a single mesh to
        // minimise draw calls.
        const swMat = mat(scene, COLOURS.sidewalk);
        const swW   = 2;            // width perpendicular to the road
        const swLen = BLOCK - 8;    // = 22; fits between road-crossing zones
        const swY   = 0.02;         // just above road surface (y = 0.01)
        const strips = [];

        // Returns true for cells that should NOT get an adjacent sidewalk.
        function noSidewalk(col, row) {
            if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
            if (PARK_COLS.includes(col) && PARK_ROWS.includes(row)) return true;
            if (col === DEPOT_FORECOURT_POS.col && row === DEPOT_FORECOURT_POS.row) return true;
            return false;
        }

        // ── Horizontal roads ───────────────────────────────────────────
        // Road `row` runs at z = OZ + (row - 0.5) * BLOCK.
        // North side borders cell (col, row);  south side borders (col, row-1).
        for (let row = 0; row <= ROWS; row++) {
            const zRoad = OZ + (row - 0.5) * BLOCK;
            for (let col = 0; col < COLS; col++) {
                const xSeg = OX + col * BLOCK;

                // North-side strip
                if (!noSidewalk(col, row)) {
                    const sw = BABYLON.MeshBuilder.CreateGround(
                        "swHN_" + col + "_" + row,
                        { width: swLen, height: swW }, scene);
                    sw.position.set(xSeg, swY, zRoad + 4 + swW / 2);
                    sw.material = swMat;
                    strips.push(sw);
                }

                // South-side strip
                if (!noSidewalk(col, row - 1)) {
                    const sw = BABYLON.MeshBuilder.CreateGround(
                        "swHS_" + col + "_" + row,
                        { width: swLen, height: swW }, scene);
                    sw.position.set(xSeg, swY, zRoad - 4 - swW / 2);
                    sw.material = swMat;
                    strips.push(sw);
                }
            }
        }

        // ── Vertical roads ─────────────────────────────────────────────
        // Road `col` runs at x = OX + (col - 0.5) * BLOCK.
        // East side borders cell (col, row);  west side borders (col-1, row).
        for (let col = 0; col <= COLS; col++) {
            const xRoad = OX + (col - 0.5) * BLOCK;
            for (let row = 0; row < ROWS; row++) {
                const zSeg = OZ + row * BLOCK;

                // East-side strip
                if (!noSidewalk(col, row)) {
                    const sw = BABYLON.MeshBuilder.CreateGround(
                        "swVE_" + col + "_" + row,
                        { width: swW, height: swLen }, scene);
                    sw.position.set(xRoad + 4 + swW / 2, swY, zSeg);
                    sw.material = swMat;
                    strips.push(sw);
                }

                // West-side strip
                if (!noSidewalk(col - 1, row)) {
                    const sw = BABYLON.MeshBuilder.CreateGround(
                        "swVW_" + col + "_" + row,
                        { width: swW, height: swLen }, scene);
                    sw.position.set(xRoad - 4 - swW / 2, swY, zSeg);
                    sw.material = swMat;
                    strips.push(sw);
                }
            }
        }

        // Merge all strips into one draw call.
        if (strips.length > 0) {
            const merged = BABYLON.Mesh.MergeMeshes(strips, true, true);
            if (merged) {
                merged.name = "sidewalks";
                merged.material = swMat;
            }
        }
    }

    // ── Boundary walls ─────────────────────────────────────────────────
    function buildBoundaryWalls(scene) {
        // Place walls just outside the outermost roads (road centres at ±105,
        // roads are 8 units wide so edges reach ±109; walls sit at ±120).
        // Walls are tall (30 units) so the camera (y≈11) can never see over them,
        // and thick (20 units) extending outward so the camera can't peek past
        // the outer face even when the player stands with their back against the wall.
        const halfMap = (COLS * BLOCK) / 2 + 15;   // 105 + 15 = 120
        const wallH   = 30;
        // Keep inner face at ±118.5 (halfMap - 1.5); extend outward by 20 units.
        // wallT=20, centre offset = wallT/2 - 1.5 = 8.5 outward from halfMap.
        const wallT   = 20;
        const wallOff = wallT / 2 - 1.5;  // 8.5 — shifts centre outward so inner face stays put
        const wallMat = mat(scene, COLOURS.stoneWall);
        wallMat.backFaceCulling = false;  // visible from both sides so camera never sees through

        // N/S walls span the full width including corners (+wallT overhang)
        // E/W walls fit snugly between them
        const wallDefs = [
            { name: "N", w: halfMap * 2 + wallT * 2, h: wallH, d: wallT, x: 0,              z:  halfMap + wallOff },
            { name: "S", w: halfMap * 2 + wallT * 2, h: wallH, d: wallT, x: 0,              z: -halfMap - wallOff },
            { name: "E", w: wallT, h: wallH, d: halfMap * 2,             x:  halfMap + wallOff, z: 0              },
            { name: "W", w: wallT, h: wallH, d: halfMap * 2,             x: -halfMap - wallOff, z: 0              },
        ];

        for (const wd of wallDefs) {
            const wall = BABYLON.MeshBuilder.CreateBox("boundaryWall_" + wd.name, {
                width: wd.w, height: wd.h, depth: wd.d,
            }, scene);
            wall.position.set(wd.x, wd.h / 2, wd.z);
            wall.material = wallMat;
            wall.checkCollisions = true;
            wall.alwaysSelectAsActiveMesh = true;  // prevent frustum culling when camera is inside/near the wall
        }
    }

    // ── Windows helper ────────────────────────────────────────────────
    // All window planes for a building are merged into one mesh so the
    // entire building costs only 1 draw call for its windows.
    function addWindows(scene, pos, w, h, d, colIdx) {
        const winMat = mat(scene, COLOURS.windowClr);
        winMat.emissiveColor = new BABYLON.Color3(0.4, 0.7, 1.0);
        // Cap at 2 floors to limit mesh count.
        const floors = Math.min(2, Math.max(1, Math.floor(h / 3)));
        const meshes = [];
        for (let f = 0; f < floors; f++) {
            const y = 1.5 + f * 3;
            // One centred window per face per floor.
            const winL = BABYLON.MeshBuilder.CreatePlane("win_" + colIdx + "_L" + f, { width: 1.2, height: 1 }, scene);
            winL.position.set(pos.x - w / 2 - 0.02, y, pos.z);
            winL.rotation.y = Math.PI / 2;
            winL.material = winMat;

            const winR = BABYLON.MeshBuilder.CreatePlane("win_" + colIdx + "_R" + f, { width: 1.2, height: 1 }, scene);
            winR.position.set(pos.x + w / 2 + 0.02, y, pos.z);
            winR.rotation.y = -Math.PI / 2;
            winR.material = winMat;

            const winS = BABYLON.MeshBuilder.CreatePlane("win_" + colIdx + "_S" + f, { width: 1.2, height: 1 }, scene);
            winS.position.set(pos.x, y, pos.z - d / 2 - 0.02);
            winS.rotation.y = 0;
            winS.material = winMat;

            const winN = BABYLON.MeshBuilder.CreatePlane("win_" + colIdx + "_N" + f, { width: 1.2, height: 1 }, scene);
            winN.position.set(pos.x, y, pos.z + d / 2 + 0.02);
            winN.rotation.y = Math.PI;
            winN.material = winMat;

            meshes.push(winL, winR, winS, winN);
        }
        if (meshes.length === 0) return;
        // Merge all planes into one mesh — disposeSource=true, allow32bit=true.
        const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true);
        if (merged) {
            merged.name = "windows_" + colIdx;
            merged.material = winMat;
        }
    }

    // ── Public helpers ────────────────────────────────────────────────
    function getSpecialBuilding(type) {
        for (const key in specialBuildings) {
            if (specialBuildings[key].type === type) return specialBuildings[key];
        }
        return null;
    }

    function getAllDeliveryPoints() {
        const result = [];
        for (const key in specialBuildings) {
            if (specialBuildings[key].type === "delivery") result.push(specialBuildings[key]);
        }
        return result;
    }

    function getDeliveryMarkers() {
        return getAllDeliveryPoints().map(d => d.marker);
    }

    function getPlayerSpawnPos() {
        const p = gridPos(0, 0);
        return new BABYLON.Vector3(p.x, 1, p.z + 5);
    }

    function getTruckSpawnPos() {
        const depot = getSpecialBuilding("depot");
        if (depot) return depot.padPos.clone();
        return new BABYLON.Vector3(-30, 0.4, -30);
    }

    return { build, getSpecialBuilding, getAllDeliveryPoints, getDeliveryMarkers, getPlayerSpawnPos, getTruckSpawnPos };
})();
