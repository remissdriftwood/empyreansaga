/*:
 * @target MZ
 * @plugindesc Phase 3: Strict Inventory Control v1.0
 * @author Custom Build
 * * @help
 * Implements:
 * - Forces all Standard Items (itypeId === 1) to have a max capacity of 1.
 * - Tracks consumed Standard Items (in and out of battle) and restores 
 * them to the inventory at the end of combat.
 * - Removes the "Item" and "Key Item" categories from the Shop Buy/Sell 
 * screens, limiting the columns to Weapons and Armor.
 * - Hides Standard Items from the Shop Buy list if the player already 
 * possesses them.
 */

(() => {
    'use strict';

    //=============================================================================
    // 1. Capacity & Post-Battle Restoration
    //=============================================================================

    // Initialize the tracking array for used items
    const _Game_Party_initialize = Game_Party.prototype.initialize;
    Game_Party.prototype.initialize = function() {
        _Game_Party_initialize.call(this);
        this._itemsUsedPendingRestore = [];
    };

    // Override: Force standard items (itypeId 1) to cap at 1
    const _Game_Party_maxItems = Game_Party.prototype.maxItems;
    Game_Party.prototype.maxItems = function(item) {
        if (DataManager.isItem(item) && item.itypeId === 1) {
            return 1;
        }
        return _Game_Party_maxItems.call(this, item);
    };

    // Track standard items as they are consumed
    const _Game_Battler_consumeItem = Game_Battler.prototype.consumeItem;
    Game_Battler.prototype.consumeItem = function(item) {
        if (DataManager.isItem(item) && item.itypeId === 1) {
            $gameParty._itemsUsedPendingRestore.push(item);
        }
        _Game_Battler_consumeItem.call(this, item);
    };

    // Restore all tracked items at the end of battle
    const _Game_Party_onBattleEnd = Game_Party.prototype.onBattleEnd;
    Game_Party.prototype.onBattleEnd = function() {
        _Game_Party_onBattleEnd.call(this);
        if (this._itemsUsedPendingRestore && this._itemsUsedPendingRestore.length > 0) {
            for (const item of this._itemsUsedPendingRestore) {
                this.gainItem(item, 1);
            }
            this._itemsUsedPendingRestore = [];
        }
    };

    //=============================================================================
    // 2. Shop & Menu Restrictions
    //=============================================================================

    // Override: Hide items from the Buy list if they are already owned
    const _Window_ShopBuy_includes = Window_ShopBuy.prototype.includes;
    Window_ShopBuy.prototype.includes = function(item) {
        if (DataManager.isItem(item) && item.itypeId === 1) {
            if ($gameParty.hasItem(item, true)) {
                return false; 
            }
        }
        return _Window_ShopBuy_includes.call(this, item);
    };

    // Override: Remove "Items" and "Key Items" from the shop category selection
    const _Window_ItemCategory_makeCommandList = Window_ItemCategory.prototype.makeCommandList;
    Window_ItemCategory.prototype.makeCommandList = function() {
        if (SceneManager._scene instanceof Scene_Shop) {
            this.addCommand(TextManager.weapon, "weapon");
            this.addCommand(TextManager.armor, "armor");
        } else {
            _Window_ItemCategory_makeCommandList.call(this);
        }
    };

    // Override: Adjust the shop category window to center the 2 remaining options
    const _Window_ItemCategory_maxCols = Window_ItemCategory.prototype.maxCols;
    Window_ItemCategory.prototype.maxCols = function() {
        if (SceneManager._scene instanceof Scene_Shop) {
            return 2;
        }
        return _Window_ItemCategory_maxCols.call(this);
    };

})();