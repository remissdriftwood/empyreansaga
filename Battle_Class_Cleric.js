/*:
 * @target MZ
 * @plugindesc Phase 5: Cleric Class Mechanics v1.5
 * @author Custom Build
 * * @help
 * Implements:
 * - Healer's Reward: Recovers 1 MP per target healed by a Cleric skill.
 * - Foehn Dispel (Skill 48): Clears buffs and states from ALL battlers.
 * * Protect specific states using the <foehn_immune> notetag.
 * - Circle Registration: Use <circle: X> (X = Pulse Skill ID) and <duration: Y>.
 * - Circle Death Cleanse: Removes active circles when the caster dies.
 * - Circle of Immortality: Hard-caps lethal damage at target.hp - 1.
 * - UPGRADE: Migrated Healer's Reward MP math to UI payload callback for perfect HUD sync.
 * - FIX: Appended '+' to custom MP restoration popups.
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
        this._activeCircles = this._activeCircles.filter(c => c.caster !== caster);
        this._activeCircles.push({
            caster: caster,
            skillId: pulseSkillId, 
            sourceSkillId: sourceSkillId,
            duration: duration
        });
    };

    const _Game_Action_applyGlobal = Game_Action.prototype.applyGlobal;
    Game_Action.prototype.applyGlobal = function() {
        _Game_Action_applyGlobal.call(this);
        
        const item = this.item();
        if (item && item.note) {
            const circleMatch = item.note.match(/<circle:\s*(\d+)>/i);
            if (circleMatch) {
                const pulseId = parseInt(circleMatch[1]);
                let duration = 3;
                const durMatch = item.note.match(/<duration:\s*(\d+)>/i);
                if (durMatch) duration = parseInt(durMatch[1]);
                
                BattleManager.addCircle(this.subject(), pulseId, item.id, duration);
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
            BattleManager._activeCircles = BattleManager._activeCircles.filter(c => c.caster !== this);
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
            }
        }

        const hpBefore = target.hp;
        _Game_Action_executeHpDamage.call(this, target, value);
        
        const hpAfter = target.hp;
        const actualHeal = hpAfter - hpBefore;
        const subject = this.subject();
        
        if (this.isSkill() && actualHeal > 0 && subject.isActor() && subject._classId === CONFIG.CLERIC_CLASS_ID) {
            
            subject.requestCustomTextPopup("+1", "heal", () => {
                subject.setMp(subject.mp + 1);
            });
        }
    };

})();