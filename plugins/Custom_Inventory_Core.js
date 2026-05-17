/*:
 * @target MZ
 * @plugindesc Phase 3: Strict Inventory Control v1.02
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
 * - FIX: Added lazy initialization and Battle Start hooks for old saves.
 * - FIX: Rerouted Shop filter to makeItemList to physically erase owned items.
 */

(() => {
    'use strict';

    //=============================================================================
    // 1. Capacity & Post-Battle Restoration
    //=============================================================================

    const _Game_Party_onBattleStart = Game_Party.prototype.onBattleStart;
    Game_Party.prototype.onBattleStart = function(advantageous) {
        _Game_Party_onBattleStart.call(this, advantageous);
        this._itemsUsedPendingRestore = [];
    };

    const _Game_Party_maxItems = Game_Party.prototype.maxItems;
    Game_Party.prototype.maxItems = function(item) {
        if (DataManager.isItem(item) && item.itypeId === 1) {
            return 1;
        }
        return _Game_Party_maxItems.call(this, item);
    };

    const _Game_Battler_consumeItem = Game_Battler.prototype.consumeItem;
    Game_Battler.prototype.consumeItem = function(item) {
        if (DataManager.isItem(item) && item.itypeId === 1) {
            if (!$gameParty._itemsUsedPendingRestore) {
                $gameParty._itemsUsedPendingRestore = [];
            }
            $gameParty._itemsUsedPendingRestore.push(item);
        }
        _Game_Battler_consumeItem.call(this, item);
    };

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

    // Override: Intercept the raw shop data generation to erase owned standard items
    const _Window_ShopBuy_makeItemList = Window_ShopBuy.prototype.makeItemList;
    Window_ShopBuy.prototype.makeItemList = function() {
        this._data = [];
        this._price = [];
        for (const goods of this._shopGoods) {
            const item = this.goodsToItem(goods);
            if (item) {
                // If it is a Standard Item and the player owns it, skip adding it!
                if (DataManager.isItem(item) && item.itypeId === 1 && $gameParty.hasItem(item, true)) {
                    continue; 
                }
                this._data.push(item);
                this._price.push(goods[2] === 0 ? item.price : goods[3]);
            }
        }
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