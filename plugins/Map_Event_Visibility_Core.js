/*:
 * @target MZ
 * @plugindesc Phase X: Map Event Visibility Core v1.0
 * @author Custom Build
 * * @help
 * Place these in the "Note" box next to the Event's Name.
 * * <RequireClass: X>
 * The event will only exist if an actor with Class ID 'X' is in the current party.
 * You can require multiple options by separating with commas (e.g. <RequireClass: 4, 6>)
 * * <HideIfItem: Y>
 * The event will completely disappear if the party possesses Item ID 'Y'.
 * Bypass: If the event's Self-Switch 'A' is ON, this check is ignored. 
 * This allows chests looted by the player to remain as "empty chest" graphics,
 * while shop-bought items cause the chest to vanish to reduce map clutter.
 */

(() => {
    'use strict';

    const _Game_Event_meetsConditions = Game_Event.prototype.meetsConditions;
    Game_Event.prototype.meetsConditions = function(page) {
        // 1. Run the standard RPG Maker MZ page condition checks first
        const meets = _Game_Event_meetsConditions.call(this, page);
        if (!meets) return false;

        // 2. Fetch the Event's global Notetags
        const meta = this.event().meta;
        if (!meta) return true;

        // 3. Class Requirement Check
        if (meta.RequireClass !== undefined) {
            const classIds = String(meta.RequireClass).split(',').map(n => Number(n.trim()));
            const hasRequiredClass = $gameParty.members().some(actor => classIds.includes(actor._classId));
            
            if (!hasRequiredClass) return false; // Hide event
        }

        // 4. Item Avoidance Check (Standard Items & Key Items)
        if (meta.HideIfItem !== undefined) {
            const itemIds = String(meta.HideIfItem).split(',').map(n => Number(n.trim()));
            const hasItem = itemIds.some(id => $gameParty.hasItem($dataItems[id]));

            if (hasItem) {
                // If they have the item, check if they looted it FROM THIS EVENT.
                // Standard RPG Maker chest flow turns on Self Switch A when opened.
                const mapId = this._mapId;
                const eventId = this._eventId;
                const lootedHere = $gameSelfSwitches.value([mapId, eventId, 'A']);

                if (!lootedHere) {
                    return false; // Got it from a shop or elsewhere. Hide the event.
                }
            }
        }

        return true;
    };

})();