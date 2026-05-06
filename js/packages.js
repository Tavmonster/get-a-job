/**
 * packages.js — Delivery tracking and zone detection
 */
const Packages = (() => {
    let deliveryPoints = [];
    let remaining = 0;
    let scene = null;
    let onAllDelivered = null;
    let delivBoxMat = null;

    function init(babylonScene, allDeliveredCallback) {
        scene = babylonScene;
        onAllDelivered = allDeliveredCallback;
        deliveryPoints = World.getAllDeliveryPoints();
        remaining = deliveryPoints.length;

        // Show all markers initially (hidden until player has the job)
        deliveryPoints.forEach(dp => {
            if (dp.marker) dp.marker.setEnabled(false);
            if (dp.trigger) dp.trigger.setEnabled(true);
        });
    }

    function activate() {
        // Show delivery markers when the player starts delivering
        deliveryPoints.forEach(dp => {
            if (dp.marker) dp.marker.setEnabled(true);
        });
        UI.showHUD(remaining, deliveryPoints.length);
    }

    /**
     * Called every frame with the truck's world position.
     * Returns true if a delivery was made.
     */
    function checkDeliveries(truckPos) {
        let made = false;
        deliveryPoints.forEach(dp => {
            if (!dp.trigger || !dp.trigger.isEnabled() || !dp.marker || !dp.marker.isEnabled()) return;

            const dist = BABYLON.Vector3.Distance(truckPos, dp.trigger.position);
            if (dist < 7) {
                // Deliver!
                dp.marker.setEnabled(false);
                dp.trigger.setEnabled(false);
                remaining--;
                made = true;
                UI.showHUD(remaining, deliveryPoints.length);
                UI.showText(`Package delivered! (${deliveryPoints.length - remaining} / ${deliveryPoints.length})`);

                // Spawn a cardboard box prop in front of the house
                if (!delivBoxMat) {
                    delivBoxMat = new BABYLON.StandardMaterial("delivBoxMat", scene);
                    delivBoxMat.diffuseColor = new BABYLON.Color3(0.76, 0.60, 0.42);
                }
                const boxH = 0.65;
                const cell = dp.trigger.metadata.cell;
                const dBox = BABYLON.MeshBuilder.CreateBox(`deliveredBox_${cell.col}_${cell.row}`, {
                    width: 0.8, height: boxH, depth: 0.8,
                }, scene);
                dBox.position.set(dp.trigger.position.x, boxH / 2 + 0.02, dp.trigger.position.z);
                dBox.material = delivBoxMat;
                dBox.checkCollisions = false;
                dBox.isPickable = false;

                if (remaining <= 0) {
                    setTimeout(() => {
                        if (onAllDelivered) onAllDelivered();
                    }, 1200);
                }
            }
        });
        return made;
    }

    function getRemaining() { return remaining; }

    return { init, activate, checkDeliveries, getRemaining };
})();
