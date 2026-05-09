/*:
 * @target MZ
 * @plugindesc Phase 5: Fighter Class Mechanics v1.0
 * @author Custom Build
 * * @help
 * Implements:
 * - Blunt Skill MP Scaling: Damage multiplies based on remaining MP.
 * - Blunt Skill MP Drain: MP zeroes out after the action completes.
 * * Requires <blunt skill> notetag on the skill.
 * Note: Apply State 28 (Resting) for Skill 6 via the MZ Database Effects.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        FIGHTER_CLASS_ID: 1,
        BLUNT_MULTIPLIERS: [1.0, 1.2, 1.6, 2.2, 3.0]
    };

    //=============================================================================
    // 1. Automatic Damage Scaling
    //=============================================================================
    const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        let value = _Game_Action_makeDamageValue.call(this, target, critical);
        
        const subject = this.subject();
        const item = this.item();
        
        if (subject.isActor() && subject._classId === CONFIG.FIGHTER_CLASS_ID && item && item.note && item.note.match(/<blunt skill>/i)) {
            // MZ deducts MP costs before this phase, so subject.mp is the remaining MP.
            const index = Math.min(subject.mp, 4);
            const mult = CONFIG.BLUNT_MULTIPLIERS[index] || 1.0;
            value = Math.floor(value * mult);
        }
        
        return value;
    };

    //=============================================================================
    // 2. End of Action MP Drain (AoE Safe)
    //=============================================================================
    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        const subject = this._subject;
        const action = subject ? subject.currentAction() : null;
        const item = action ? action.item() : null;
        
        // Execute the standard end-action sequence first
        _BattleManager_endAction.call(this);
        
        // Flatline MP to 0 after all targets have been processed
        if (subject && subject.isActor() && subject._classId === CONFIG.FIGHTER_CLASS_ID && item && item.note && item.note.match(/<blunt skill>/i)) {
            subject.setMp(0);
        }
    };

})();