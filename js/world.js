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
        // Horizontal roads
        for (let row = 0; row < ROWS; row++) {
            const road = BABYLON.MeshBuilder.CreateGround("roadH_" + row, {
                width: COLS * BLOCK + 40,
                height: 8,
            }, scene);
            road.position.set(0, 0.01, OZ + row * BLOCK);
            road.material = mat(scene, COLOURS.road);
        }
        // Vertical roads
        for (let col = 0; col < COLS; col++) {
            const road = BABYLON.MeshBuilder.CreateGround("roadV_" + col, {
                width: 8,
                height: ROWS * BLOCK + 40,
            }, scene);
            road.position.set(OX + col * BLOCK, 0.01, 0);
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

        return specialBuildings;
    }

    // ── Park ─────────────────────────────────────────────────────────
    function buildPark(scene, pos, col, row) {
        const grass = BABYLON.MeshBuilder.CreateGround("parkGrass_" + col + row, {
            width: BLOCK - 2, height: BLOCK - 2,
        }, scene);
        grass.position.set(
            ((pos.x) + gridPos(col === 0 ? 1 : 0, row === 0 ? 1 : 0).x) / 2,
            0.02,
            ((pos.z) + gridPos(col, row === 0 ? 1 : 0).z) / 2
        );
        grass.material = mat(scene, COLOURS.parkGrass);

        // Bench at the player spawn location
        if (col === 0 && row === 0) {
            addBench(scene, gridPos(0, 0));
        }
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
