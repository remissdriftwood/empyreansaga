/*:
 * @target MZ
 * @plugindesc Phase 5: Chemist Class Mechanics v1.0
 * @author Custom Build
 * * @help
 * Implements:
 * - Mutually Exclusive Mix States (State applied removes prior Mixes).
 * - Diluent (State 48): Skips Target Selection UI, forces AoE, halves efficacy.
 * - Gunpowder (State 49): Doubles Damage/Ailment Rates/Debuff Duration.
 * - Herbal (State 47): Applies Regen, Doubles Buff Duration.
 * - Echinacea (State 50): Wipes Target States BEFORE application.
 * - Mercury (State 51): Adds Poison on hit.
 * - False Alchemy (State 54): Halts Consumption, +1 MP, removed on use.
 * - State Swaps: Intercepts specific states and transforms them dynamically.
 * - Combat Item Tracking: Refunds all consumed items at the end of battle.
 * - Fertilizer (Item 12): Subtracts 1 turn from Farmer Seed arrays.
 * - Martyr's Joy (State 68): Forces Death State upon reaching 0 turns.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        CHEMIST_CLASS_ID: 5,
        FERTILIZER_ITEM_ID: 12,
        COOKING_OIL_ITEM_ID: 16,
        MILK_ITEM_ID: 37,
        
        OILY_STATE_ID: 53,
        MARTYRS_JOY_STATE_ID: 68,
        POISON_STATE_ID: 2,
        REGEN_STATE_ID: 14,
        
        MIX_STATES: {
            herbal: 47,
            diluent: 48,
            gunpowder: 49,
            echinacea: 50,
            mercury: 51,
            false_alchemy: 54
        },
        
        STATE_REPLACEMENTS: {
            52: { herbal: 56, diluent: 57 }, // Invisible Variations
            53: { herbal: 58, gunpowder: 58, diluent: 59 } // Oily Variations
        }
    };

    //=============================================================================
    // 1. Mutually Exclusive Mix States
    //=============================================================================
    const _Game_Battler_addState = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function(stateId) {
        const mixIds = Object.values(CONFIG.MIX_STATES);
        
        // If a new Mix State is being applied, strip all other existing Mixes
        if (mixIds.includes(stateId)) {
            mixIds.forEach(id => {
                if (id !== stateId && this.isStateAffected(id)) {
                    this.removeState(id);
                }
            });
        }
        _Game_Battler_addState.call(this, stateId);
    };

    //=============================================================================
    // 2. Battle Item Refund System & False Alchemy
    //=============================================================================
    const _BattleManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        _BattleManager_setup.call(this, troopId, canEscape, canLose);
        $gameTemp._itemsUsedInBattle = [];
    };

    const _Game_Battler_consumeItem = Game_Battler.prototype.consumeItem;
    Game_Battler.prototype.consumeItem = function(item) {
        if ($gameParty.inBattle() && DataManager.isItem(item)) {
            
            // False Alchemy Check
            if (this.isStateAffected(CONFIG.MIX_STATES.false_alchemy)) {
                if (this.isActor() && this._classId === CONFIG.CHEMIST_CLASS_ID) {
                    this.requestCustomTextPopup("1", "heal", () => {
                        this.setMp(this.mp + 1);
                    });
                }
                this.removeState(CONFIG.MIX_STATES.false_alchemy);
                return; // Aborts standard consumption & refund tracking
            }
            
            // Standard Item Tracking for Chemist Refunds
            $gameTemp._itemsUsedInBattle.push(item);

            // Standard MP Regen for Chemist (Using any item normally)
            if (this.isActor() && this._classId === CONFIG.CHEMIST_CLASS_ID) {
                this.requestCustomTextPopup("1", "heal", () => {
                    this.setMp(this.mp + 1);
                });
            }
        }
        _Game_Battler_consumeItem.call(this, item);
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        if ($gameTemp._itemsUsedInBattle) {
            $gameTemp._itemsUsedInBattle.forEach(item => {
                $gameParty.gainItem(item, 1);
            });
            $gameTemp._itemsUsedInBattle = [];
        }
        _BattleManager_endBattle.call(this, result);
    };

    //=============================================================================
    // 3. Diluent UI Bypass & Targeting Redirection
    //=============================================================================
    const _Game_Action_needsSelection = Game_Action.prototype.needsSelection;
    Game_Action.prototype.needsSelection = function() {
        if (this.isItem() && this.subject().isStateAffected(CONFIG.MIX_STATES.diluent)) {
            const scope = this.item().scope;
            // Native Scopes: 1 (One Enemy), 7 (One Ally), 9 (One Dead Ally)
            if (scope === 1 || scope === 7 || scope === 9) {
                return false; // Tells the UI to skip the selection window entirely
            }
        }
        return _Game_Action_needsSelection.call(this);
    };

    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        if (this.isItem() && this.subject().isStateAffected(CONFIG.MIX_STATES.diluent)) {
            const scope = this.item().scope;
            if (scope === 1) return this.opponentsUnit().aliveMembers();
            if (scope === 7) return this.friendsUnit().aliveMembers();
            if (scope === 9) return this.friendsUnit().deadMembers();
        }
        return _Game_Action_makeTargets.call(this);
    };

    //=============================================================================
    // 4. Mix Multipliers (Damage, Chances, Durations, and State Replacements)
    //=============================================================================
    
    // Multipliers for Raw HP/MP Damage/Healing
    const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        let value = _Game_Action_makeDamageValue.call(this, target, critical);
        if (this.isItem()) {
            if (this.subject().isStateAffected(CONFIG.MIX_STATES.diluent)) {
                value = Math.floor(value * 0.5);
            }
            if (this.subject().isStateAffected(CONFIG.MIX_STATES.gunpowder) && value > 0) {
                value = Math.floor(value * 2.0);
            }
        }
        return value;
    };

    // Multipliers for State Application Chance & State Replacements
    const _Game_Action_itemEffectAddState = Game_Action.prototype.itemEffectAddState;
    Game_Action.prototype.itemEffectAddState = function(target, effect) {
        if (this.isItem()) {
            const subject = this.subject();
            let chance = effect.value1;
            
            // Mod chance
            if (subject.isStateAffected(CONFIG.MIX_STATES.gunpowder) && this.isForOpponent()) {
                chance *= 2.0;
            } else if (subject.isStateAffected(CONFIG.MIX_STATES.diluent)) {
                chance *= 0.5;
            }

            // Clone effect to modify safely without altering the database permanently
            let modEffect = { ...effect, value1: chance };
            
            // State Replacement
            let stateId = modEffect.dataId;
            if (CONFIG.STATE_REPLACEMENTS[stateId]) {
                const rep = CONFIG.STATE_REPLACEMENTS[stateId];
                if (subject.isStateAffected(CONFIG.MIX_STATES.herbal) && rep.herbal) {
                    modEffect.dataId = rep.herbal;
                } else if (subject.isStateAffected(CONFIG.MIX_STATES.gunpowder) && rep.gunpowder) {
                    modEffect.dataId = rep.gunpowder;
                } else if (subject.isStateAffected(CONFIG.MIX_STATES.diluent) && rep.diluent) {
                    modEffect.dataId = rep.diluent;
                }
            }
            
            _Game_Action_itemEffectAddState.call(this, target, modEffect);
        } else {
            _Game_Action_itemEffectAddState.call(this, target, effect);
        }
    };

    // Multipliers for Buff/Debuff Durations
    const _Game_Action_itemEffectAddBuff = Game_Action.prototype.itemEffectAddBuff;
    Game_Action.prototype.itemEffectAddBuff = function(target, effect) {
        let modEffect = { ...effect };
        if (this.isItem()) {
            if (this.subject().isStateAffected(CONFIG.MIX_STATES.herbal)) {
                modEffect.value1 *= 2;
            } else if (this.subject().isStateAffected(CONFIG.MIX_STATES.diluent)) {
                modEffect.value1 = Math.ceil(modEffect.value1 * 0.5);
            }
        }
        _Game_Action_itemEffectAddBuff.call(this, target, modEffect);
    };

    const _Game_Action_itemEffectAddDebuff = Game_Action.prototype.itemEffectAddDebuff;
    Game_Action.prototype.itemEffectAddDebuff = function(target, effect) {
        let modEffect = { ...effect };
        if (this.isItem()) {
            if (this.subject().isStateAffected(CONFIG.MIX_STATES.gunpowder)) {
                modEffect.value1 *= 2;
            } else if (this.subject().isStateAffected(CONFIG.MIX_STATES.diluent)) {
                modEffect.value1 = Math.ceil(modEffect.value1 * 0.5);
            }
        }
        _Game_Action_itemEffectAddDebuff.call(this, target, modEffect);
    };

    //=============================================================================
    // 5. Pre/Post Item Execution Hooks (Echinacea, Milk, Fertilizer, Cooking Oil)
    //=============================================================================
    
    // Milk Target Bypass
    const _Game_Action_testApply = Game_Action.prototype.testApply;
    Game_Action.prototype.testApply = function(target) {
        if (this.isItem() && this.item().id === CONFIG.MILK_ITEM_ID) return true;
        return _Game_Action_testApply.call(this, target);
    };
    
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        const subject = this.subject();
        const isItem = this.isItem();
        const item = this.item();

        if (isItem && subject.isStateAffected(CONFIG.MIX_STATES.echinacea)) {
            // Echinacea Cleansing BEFORE effect lands
            target.states().forEach(state => {
                target.removeState(state.id);
            });
            target.clearBuffs();
        }

        // Cooking Oil User Modification
        if (isItem && item.id === CONFIG.COOKING_OIL_ITEM_ID) {
            let userOilyId = CONFIG.OILY_STATE_ID;
            const rep = CONFIG.STATE_REPLACEMENTS[userOilyId];
            if (subject.isStateAffected(CONFIG.MIX_STATES.herbal) && rep.herbal) userOilyId = rep.herbal;
            else if (subject.isStateAffected(CONFIG.MIX_STATES.gunpowder) && rep.gunpowder) userOilyId = rep.gunpowder;
            else if (subject.isStateAffected(CONFIG.MIX_STATES.diluent) && rep.diluent) userOilyId = rep.diluent;
            
            subject.addState(userOilyId);
        }

        // Fertilizer / Farmer Integration Hook
        if (isItem && item.id === CONFIG.FERTILIZER_ITEM_ID) {
            if ($gameSystem._farmerSeeds) {
                $gameSystem._farmerSeeds.forEach(seed => {
                    if (Number(seed.turns) > 0) seed.turns = Number(seed.turns) - 1;
                });
            }
        }

        _Game_Action_apply.call(this, target);

        // Post-Hit Additions (Mercury, Herbal, Milk)
        if (isItem && target.result().isHit()) {
            if (item.id === CONFIG.MILK_ITEM_ID) {
                // Milk cleanses Ailments (removes all states, natively preserves buffs)
                target.states().forEach(state => {
                    target.removeState(state.id);
                });
                target.result().success = true;
            }

            if (subject.isStateAffected(CONFIG.MIX_STATES.mercury)) {
                target.addState(CONFIG.POISON_STATE_ID);
            }
            if (subject.isStateAffected(CONFIG.MIX_STATES.herbal)) {
                target.addState(CONFIG.REGEN_STATE_ID);
            }
        }
    };

    // Cleanly shed the Mix State after the item has fully executed
    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        if (this._subject && this._action && this._action.isItem()) {
            const mixIds = Object.values(CONFIG.MIX_STATES);
            mixIds.forEach(id => {
                if (id !== CONFIG.MIX_STATES.false_alchemy) {
                    this._subject.removeState(id);
                }
            });
        }
        _BattleManager_endAction.call(this);
    };

    //=============================================================================
    // 6. Martyr's Joy (Delayed Death)
    //=============================================================================
    const _Game_BattlerBase_updateStateTurns = Game_BattlerBase.prototype.updateStateTurns;
    Game_BattlerBase.prototype.updateStateTurns = function() {
        let martyrExpired = false;
        
        // Detects the exact moment the turn ticks down from 1 to 0
        if (this.isStateAffected(CONFIG.MARTYRS_JOY_STATE_ID) && this._stateTurns[CONFIG.MARTYRS_JOY_STATE_ID] === 1) {
            martyrExpired = true;
        }
        
        _Game_BattlerBase_updateStateTurns.call(this);
        
        if (martyrExpired && !this.isDead()) {
            this.addState(this.deathStateId());
            this.performCollapse();
        }
    };

})();