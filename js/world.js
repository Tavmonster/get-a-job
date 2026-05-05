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
    // Hotel: col 5, row 5
    // Depot: col 1, row 5

    const PARK_COLS  = [0, 1];
    const PARK_ROWS  = [0, 1];
    const STORE_POS  = { col: 5, row: 1 };
    const HOTEL_POS  = { col: 5, row: 5 };
    const DEPOT_POS         = { col: 1, row: 5 };
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
            width: COLS * BLOCK + 60,
            height: ROWS * BLOCK + 60,
        }, scene);
        ground.material = mat(scene, COLOURS.ground);
        ground.checkCollisions = true;
        ground.receiveShadows = true;

        // ── Roads ─────────────────────────────────────────────────────
        // Horizontal roads — placed between rows (at half-integer offsets)
        // ROWS+1 roads so streets frame every row of buildings
        for (let row = 0; row <= ROWS; row++) {
            const road = BABYLON.MeshBuilder.CreateGround("roadH_" + row, {
                width: COLS * BLOCK + 40,
                height: 8,
            }, scene);
            road.position.set(0, 0.01, OZ + (row - 0.5) * BLOCK);
            road.material = mat(scene, COLOURS.road);
        }
        // Vertical roads — placed between columns (at half-integer offsets)
        // COLS+1 roads so streets frame every column of buildings
        for (let col = 0; col <= COLS; col++) {
            const road = BABYLON.MeshBuilder.CreateGround("roadV_" + col, {
                width: 8,
                height: ROWS * BLOCK + 40,
            }, scene);
            road.position.set(OX + (col - 0.5) * BLOCK, 0.01, 0);
            road.material = mat(scene, COLOURS.road);
        }

        // ── Buildings ─────────────────────────────────────────────────
        for (let col = 0; col < COLS; col++) {
            for (let row = 0; row < ROWS; row++) {
                const isPark        = PARK_COLS.includes(col) && PARK_ROWS.includes(row);
                const isStore       = col === STORE_POS.col && row === STORE_POS.row;
                const isHotel       = col === HOTEL_POS.col && row === HOTEL_POS.row;
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

                // Windows
                addWindows(scene, pos, w, h, d, colIdx);

                // Delivery house: add a coloured marker on the ground
                if (isDel) {
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

                    specialBuildings[key] = { type: "delivery", trigger, marker, pos };
                }
            }
        }

        buildBoundaryWalls(scene);

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

        // All park features built once from the first cell
        if (col !== 0 || row !== 0) return;

        // Park centre: midpoint of the four park grid cells
        // pos = gridPos(0,0), so centre is half a BLOCK toward (1,1)
        const cx = pos.x + BLOCK / 2;
        const cz = pos.z + BLOCK / 2;

        addFountain(scene,     new BABYLON.Vector3(cx,      0, cz));
        addBench(scene,        new BABYLON.Vector3(cx - 6,  0, cz - 2));
        addBench(scene,        new BABYLON.Vector3(cx + 6,  0, cz - 2));
        addSlide(scene,        new BABYLON.Vector3(cx - 7,  0, cz - 7));
        addSwings(scene,       new BABYLON.Vector3(cx + 7,  0, cz - 7));
        addSandbox(scene,      new BABYLON.Vector3(cx,      0, cz + 7));
        addPicnicTable(scene,  new BABYLON.Vector3(cx + 5,  0, cz + 6));
        addTree(scene,         new BABYLON.Vector3(cx - 8,  0, cz - 8));
        addTree(scene,         new BABYLON.Vector3(cx + 8,  0, cz - 8));
        addTree(scene,         new BABYLON.Vector3(cx - 8,  0, cz + 8));
        addTree(scene,         new BABYLON.Vector3(cx + 8,  0, cz + 8));
        addTree(scene,         new BABYLON.Vector3(cx,      0, cz - 9));
    }

    function addBench(scene, pos) {
        // Seat
        const seat = BABYLON.MeshBuilder.CreateBox("benchSeat", { width: 3.5, height: 0.3, depth: 1 }, scene);
        seat.position.set(pos.x, 0.6, pos.z);
        seat.material = mat(scene, COLOURS.bench);

        // Legs (4)
        const legPositions = [[-1.5, -0.15], [1.5, -0.15], [-1.5, 0.15], [1.5, 0.15]];
        legPositions.forEach(([lx, lz], i) => {
            const leg = BABYLON.MeshBuilder.CreateBox("benchLeg" + i, { width: 0.2, height: 0.6, depth: 0.2 }, scene);
            leg.position.set(pos.x + lx, 0.3, pos.z + lz);
            leg.material = mat(scene, COLOURS.bench);
        });

        // Backrest
        const back = BABYLON.MeshBuilder.CreateBox("benchBack", { width: 3.5, height: 0.8, depth: 0.15 }, scene);
        back.position.set(pos.x, 1.1, pos.z + 0.45);
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
        const frameH  = 4.5;
        const barHalf = 3.5;   // half-length of top bar
        const legSpan = 1.2;   // z foot-spread of each A-frame
        const metal   = COLOURS.swingFrame;

        // Two A-frame ends (one at each end of the bar)
        [-barHalf, barHalf].forEach(ox => {
            [-legSpan, legSpan].forEach(dz => {
                const legLen = Math.sqrt(frameH * frameH + dz * dz);
                const leg = BABYLON.MeshBuilder.CreateCylinder("swingLeg_" + ox + "_" + dz, { height: legLen, diameter: 0.2 }, scene);
                // Midpoint between apex (pos.x+ox, frameH, pos.z) and foot (pos.x+ox, 0, pos.z+dz)
                leg.position.set(pos.x + ox, frameH / 2, pos.z + dz / 2);
                leg.rotation.x = Math.atan2(dz, frameH);
                leg.material = mat(scene, metal);
            });
        });

        // Top bar
        const bar = BABYLON.MeshBuilder.CreateCylinder("swingBar", { height: barHalf * 2, diameter: 0.18 }, scene);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(pos.x, frameH, pos.z);
        bar.material = mat(scene, metal);

        // Three swings — each with two chains (front/back of seat)
        [-2.0, 0.0, 2.0].forEach(ox => {
            const chainLen = 3.0;
            [-0.18, 0.18].forEach(dz => {
                const chain = BABYLON.MeshBuilder.CreateCylinder("chain_" + ox + "_" + dz, { height: chainLen, diameter: 0.06 }, scene);
                chain.position.set(pos.x + ox, frameH - chainLen / 2, pos.z + dz);
                chain.material = mat(scene, metal);
            });
            const seat = BABYLON.MeshBuilder.CreateBox("swingSeat_" + ox, { width: 1.1, height: 0.14, depth: 0.45 }, scene);
            seat.position.set(pos.x + ox, frameH - chainLen - 0.07, pos.z);
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

        // Sign
        const sign = BABYLON.MeshBuilder.CreatePlane("hotelSign", { width: 6, height: 1.5 }, scene);
        sign.position.set(pos.x, h - 1, pos.z - d / 2 - 0.1);
        const signTex = new BABYLON.DynamicTexture("hotelTex", { width: 512, height: 128 }, scene);
        signTex.drawText("HOTEL", null, 100, "bold 90px Arial", "gold", "#003366", true);
        sign.material = new BABYLON.StandardMaterial("hotelSignMat", scene);
        sign.material.diffuseTexture = signTex;
        sign.material.emissiveColor = new BABYLON.Color3(1, 0.85, 0);

        const trigger = BABYLON.MeshBuilder.CreateBox("hotelTrigger", { width: 6, height: 3, depth: 4 }, scene);
        trigger.position.set(pos.x, 1.5, pos.z - d / 2 - 2);
        trigger.isVisible = false;
        trigger.isPickable = false;
        trigger.metadata = { type: "hotelTrigger" };

        return { type: "hotel", bld, trigger, pos };
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

    // ── Boundary walls ─────────────────────────────────────────────────
    function buildBoundaryWalls(scene) {
        // Place walls just outside the outermost roads (road centres at ±105,
        // roads are 8 units wide so edges reach ±109; walls sit at ±120).
        const halfMap = (COLS * BLOCK) / 2 + 15;   // 105 + 15 = 120
        const wallH   = 10;
        const wallT   = 3;
        const wallMat = mat(scene, COLOURS.stoneWall);

        // N/S walls span the full width including corners (+wallT overhang)
        // E/W walls fit snugly between them
        const wallDefs = [
            { name: "N", w: halfMap * 2 + wallT * 2, h: wallH, d: wallT, x: 0,        z:  halfMap },
            { name: "S", w: halfMap * 2 + wallT * 2, h: wallH, d: wallT, x: 0,        z: -halfMap },
            { name: "E", w: wallT, h: wallH, d: halfMap * 2,             x:  halfMap,  z: 0        },
            { name: "W", w: wallT, h: wallH, d: halfMap * 2,             x: -halfMap,  z: 0        },
        ];

        for (const wd of wallDefs) {
            const wall = BABYLON.MeshBuilder.CreateBox("boundaryWall_" + wd.name, {
                width: wd.w, height: wd.h, depth: wd.d,
            }, scene);
            wall.position.set(wd.x, wd.h / 2, wd.z);
            wall.material = wallMat;
            wall.checkCollisions = true;
        }
    }

    // ── Windows helper ────────────────────────────────────────────────
    function addWindows(scene, pos, w, h, d, colIdx) {
        const winMat = mat(scene, COLOURS.windowClr);
        winMat.emissiveColor = new BABYLON.Color3(0.4, 0.7, 1.0);
        const floors = Math.max(1, Math.floor(h / 3));
        const perWall = 2;
        for (let f = 0; f < floors; f++) {
            for (let i = 0; i < perWall; i++) {
                const win = BABYLON.MeshBuilder.CreatePlane("win_" + colIdx + f + i, { width: 1.2, height: 1 }, scene);
                win.position.set(
                    pos.x + (-w / 2 - 0.02),
                    1.5 + f * 3,
                    pos.z + (i - 0.5) * (d / 3)
                );
                win.rotation.y = Math.PI / 2;
                win.material = winMat;
            }
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
        return new BABYLON.Vector3(p.x, 1, p.z - 3);
    }

    function getTruckSpawnPos() {
        const depot = getSpecialBuilding("depot");
        if (depot) return depot.padPos.clone();
        return new BABYLON.Vector3(-30, 0.4, -30);
    }

    return { build, getSpecialBuilding, getAllDeliveryPoints, getDeliveryMarkers, getPlayerSpawnPos, getTruckSpawnPos };
})();
