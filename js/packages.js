/**
 * packages.js — Delivery tracking and zone detection
 */
const Packages = (() => {
    let deliveryPoints = [];
    let remaining = 0;
    let scene = null;
    let onAllDelivered = null;

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
