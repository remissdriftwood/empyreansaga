/*:
 * @target MZ
 * @plugindesc Phase 5: Cleric Class Mechanics v1.2_Debug
 * @author Custom Build
 * * @help
 * Implements:
 * - Healer's Reward: Recovers 1 MP per target healed by a Cleric skill.
 * - Foehn Dispel (Skill 48): Clears buffs and states from ALL battlers.
 * * Protect specific states using the <foehn_immune> notetag.
 * - Circle Registration: Use <circle: X, Y> (Comma separated IDs) and <duration: Z>.
 * - Circle Death Cleanse: Removes active circles when the caster dies.
 * - Circle of Immortality: Hard-caps lethal damage at target.hp - 1.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        CLERIC_CLASS_ID: 2,
        FOEHN_SKILL_ID: 48,
        IMMORTALITY_SOURCE_SKILL_ID: 58
    };

    //=============================================================================
    // 1. Circle Registration (Apply Global)
    //=============================================================================
    
    BattleManager.addCircle = function(caster, pulseSkillId, sourceSkillId, duration) {
        if (!this._activeCircles) this._activeCircles = [];
        
        // Push the new circle without auto-deleting to allow for multi-skill stacking
        this._activeCircles.push({
            caster: caster,
            skillId: pulseSkillId, 
            sourceSkillId: sourceSkillId, 
            duration: duration
        });
        console.log(`[CIRCLE DEBUG] Successfully registered Circle! Caster: ${caster.name()}, PulseSkill: ${pulseSkillId}, SourceSkill: ${sourceSkillId}, Duration: ${duration}`);
    };

    const _Game_Action_applyGlobal = Game_Action.prototype.applyGlobal;
    Game_Action.prototype.applyGlobal = function() {
        _Game_Action_applyGlobal.call(this);
        
        const item = this.item();
        if (item && item.note) {
            // Regex upgraded to accept digits, commas, and spaces
            const circleMatch = item.note.match(/<circle:\s*([\d,\s]+)>/i);
            if (circleMatch) {
                console.log(`[CIRCLE DEBUG] Found <circle> tag on skill: ${item.name}`);
                
                // Split comma-separated string into an array of Integers
                const pulseIds = circleMatch[1].split(',').map(id => parseInt(id.trim()));
                
                let duration = 3;
                const durMatch = item.note.match(/<duration:\s*(\d+)>/i);
                if (durMatch) duration = parseInt(durMatch[1]);
                
                // Nuke any previous circles from this specific caster BEFORE we add the new ones
                if (BattleManager._activeCircles) {
                    BattleManager._activeCircles = BattleManager._activeCircles.filter(c => c.caster !== this.subject());
                }

                // Register every skill ID found in the tag
                pulseIds.forEach(pulseId => {
                    BattleManager.addCircle(this.subject(), pulseId, item.id, duration);
                });
            }
        }
    };

    //=============================================================================
    // 2. Circle Death Cleanse
    //=============================================================================
    const _Game_BattlerBase_die = Game_BattlerBase.prototype.die;
    Game_BattlerBase.prototype.die = function() {
        _Game_BattlerBase_die.call(this);
        if (BattleManager._activeCircles) {
            const initialCount = BattleManager._activeCircles.length;
            BattleManager._activeCircles = BattleManager._activeCircles.filter(c => c.caster !== this);
            if (initialCount > BattleManager._activeCircles.length) {
                console.log(`[CIRCLE DEBUG] Caster ${this.name()} died. Removed their active circles.`);
            }
        }
    };

    //=============================================================================
    // 3. Foehn Dispel (Global Wipe)
    //=============================================================================
    const _BattleManager_startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        _BattleManager_startAction.call(this);
        
        const action = this._subject ? this._subject.currentAction() : null;
        if (action && action.item() && action.item().id === CONFIG.FOEHN_SKILL_ID) {
            const allBattlers = $gameParty.aliveMembers().concat($gameTroop.aliveMembers());
            allBattlers.forEach(battler => {
                battler.states().forEach(state => {
                    if (!state.meta.foehn_immune) {
                        battler.removeState(state.id);
                    }
                });
                battler.clearBuffs();
            });
        }
    };

    //=============================================================================
    // 4. Healer's Reward & Circle of Immortality
    //=============================================================================
    const _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function(target, value) {
        
        if (value >= target.hp && value > 0) {
            const activeCircles = BattleManager.getActiveCircles();
            const hasImmortality = activeCircles.some(circle => {
                return circle.sourceSkillId === CONFIG.IMMORTALITY_SOURCE_SKILL_ID && 
                       circle.caster.isActor() === target.isActor(); 
            });
            
            if (hasImmortality) {
                value = target.hp - 1; 
                console.log(`[CIRCLE DEBUG] Immortality saved ${target.name()}! Capped damage at ${value}`);
            }
        }

        const hpBefore = target.hp;
        _Game_Action_executeHpDamage.call(this, target, value);
        
        const hpAfter = target.hp;
        const actualHeal = hpAfter - hpBefore;
        const subject = this.subject();
        
        if (this.isSkill() && actualHeal > 0 && subject.isActor() && subject._classId === CONFIG.CLERIC_CLASS_ID) {
            subject.setMp(subject.mp + 1);
            subject.requestCustomTextPopup("1", "heal");
        }
    };

})();