/*:
 * @target MZ
 * @plugindesc Phase 5: Martyr Class Mechanics v1.4
 * @author Custom Build
 * * @help
 * Implements:
 * - Frost Orb (Skill 102): Summons an orb that pulses Skill 157 for 3 turns.
 * - Circle of Darkness (Skill 112): Pulses Skill 113 for 3 turns.
 * - Circle of Immobility (Skill 115): Pulses Skill 116 for 3 turns.
 * - Betraying Shards (State 43): End of turn Async hit vs Allies (Skill 107).
 * - Betraying Blade (State 45): Replaces Actor Attack and Enemy Actions with 110.
 * - Gout of Flame (Skill 111 / State 65): Auto-Battle channel that locks on to
 * a target, bypasses MP checks, and increments a damage multiplier each turn.
 * - MP Restore on Death: Instantly restores 100% MP upon dying with UI sync.
 * - Death Skills: Martyrs learn specific skills permanently based on total deaths.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        MARTYR_CLASS_ID: 3, 
        
        BETRAYING_SHARDS_STATE_ID: 43,
        BETRAYING_SHARDS_SKILL_ID: 107,
        BETRAYING_BLADE_STATE_ID: 45,
        BETRAYING_BLADE_SKILL_ID: 110,
        
        FROST_ORB_SUMMON_SKILL_ID: 102,
        FROST_ORB_PULSE_SKILL_ID: 157,
        
        CIRCLE_DARKNESS_SUMMON_SKILL_ID: 112,
        CIRCLE_DARKNESS_PULSE_SKILL_ID: 113,
        
        CIRCLE_IMMOBILITY_SUMMON_SKILL_ID: 115,
        CIRCLE_IMMOBILITY_PULSE_SKILL_ID: 116,
        
        GOUT_OF_FLAME_SKILL_ID: 111,
        GOUT_OF_FLAME_STATE_ID: 65,
        GOUT_MAX_MULTIPLIER: 20,

        // --- NEW: Martyr Death Skill Thresholds ---
        // Format -> Number of Deaths: [Array of Skill IDs to Learn]
        DEATH_SKILLS: {
            1: [111],
            5: [100, 103],
            10: [106],
            15: [108],
            20: [109],
            25: [99]
        }
    };

    //=============================================================================
    // 1. Frost Orb & Circle Summons
    //=============================================================================
    const _Game_Action_applyGlobal = Game_Action.prototype.applyGlobal;
    Game_Action.prototype.applyGlobal = function() {
        _Game_Action_applyGlobal.call(this);
        
        const item = this.item();
        const subject = this.subject();
        
        if (item) {
            // "orb" type prevents Frost Orb from overwriting the Martyr's Circles
            if (item.id === CONFIG.FROST_ORB_SUMMON_SKILL_ID) {
                BattleManager.addCircle(subject, CONFIG.FROST_ORB_PULSE_SKILL_ID, item.id, 3, "orb");
            }
            if (item.id === CONFIG.CIRCLE_DARKNESS_SUMMON_SKILL_ID) {
                BattleManager.addCircle(subject, CONFIG.CIRCLE_DARKNESS_PULSE_SKILL_ID, item.id, 3, "circle");
            }
            if (item.id === CONFIG.CIRCLE_IMMOBILITY_SUMMON_SKILL_ID) {
                BattleManager.addCircle(subject, CONFIG.CIRCLE_IMMOBILITY_PULSE_SKILL_ID, item.id, 3, "circle");
            }
        }
    };

    //=============================================================================
    // 2. Betraying Blade (State 45) Action Override
    //=============================================================================
    
    // Actor: Directly replace the "Attack" command execution
    const _Game_Actor_attackSkillId = Game_Actor.prototype.attackSkillId;
    Game_Actor.prototype.attackSkillId = function() {
        if (this.isStateAffected(CONFIG.BETRAYING_BLADE_STATE_ID)) {
            return CONFIG.BETRAYING_BLADE_SKILL_ID;
        }
        return _Game_Actor_attackSkillId.call(this);
    };

    // Enemy: Directly overwrite the AI routine
    const _Game_Enemy_makeActions = Game_Enemy.prototype.makeActions;
    Game_Enemy.prototype.makeActions = function() {
        _Game_Enemy_makeActions.call(this);
        if (this.isStateAffected(CONFIG.BETRAYING_BLADE_STATE_ID)) {
            this.clearActions();
            const action = new Game_Action(this);
            action.setSkill(CONFIG.BETRAYING_BLADE_SKILL_ID);
            this._actions.push(action);
        }
    };

    //=============================================================================
    // 3. Gout of Flame & Betraying Shards Targeting Overrides
    //=============================================================================
    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        let targets = _Game_Action_makeTargets.call(this);
        
        // Betraying Shards (107) targets allies, but explicitly avoids hitting the caster
        if (this.item() && this.item().id === CONFIG.BETRAYING_SHARDS_SKILL_ID) {
            targets = targets.filter(t => t !== this.subject());
        }
        
        // Gout of Flame (111) forces the target to the cached victim while channeling
        if (this.item() && this.item().id === CONFIG.GOUT_OF_FLAME_SKILL_ID && this.subject().isStateAffected(CONFIG.GOUT_OF_FLAME_STATE_ID)) {
            if (this.subject()._goutTarget && this.subject()._goutTarget.isAlive()) {
                return [this.subject()._goutTarget];
            }
        }
        
        return targets;
    };

    //=============================================================================
    // 4. Gout of Flame: Auto-Battle Channeling System
    //=============================================================================
    
    // Forces MZ to automatically skip the Actor during the command input phase
    const _Game_Actor_isAutoBattle = Game_Actor.prototype.isAutoBattle;
    Game_Actor.prototype.isAutoBattle = function() {
        if (this.isStateAffected(CONFIG.GOUT_OF_FLAME_STATE_ID)) return true;
        return _Game_Actor_isAutoBattle.call(this);
    };

    // Generates the Gout of Flame action silently behind the scenes
    const _Game_Actor_makeAutoBattleActions = Game_Actor.prototype.makeAutoBattleActions;
    Game_Actor.prototype.makeAutoBattleActions = function() {
        if (this.isStateAffected(CONFIG.GOUT_OF_FLAME_STATE_ID)) {
            this.clearActions();
            const action = new Game_Action(this);
            action.setSkill(CONFIG.GOUT_OF_FLAME_SKILL_ID);
            this._actions.push(action);
            return;
        }
        _Game_Actor_makeAutoBattleActions.call(this);
    };

    // Bypasses the MP validation check allowing them to queue the skill even at 0 MP
    const _Game_BattlerBase_canPaySkillCost = Game_BattlerBase.prototype.canPaySkillCost;
    Game_BattlerBase.prototype.canPaySkillCost = function(skill) {
        if (this.isStateAffected(CONFIG.GOUT_OF_FLAME_STATE_ID) && skill.id === CONFIG.GOUT_OF_FLAME_SKILL_ID) return true;
        return _Game_BattlerBase_canPaySkillCost.call(this, skill);
    };

    // Allows MP to drain below 0 normally, but aborts the channel the moment the transaction concludes
    const _Game_BattlerBase_paySkillCost = Game_BattlerBase.prototype.paySkillCost;
    Game_BattlerBase.prototype.paySkillCost = function(skill) {
        _Game_BattlerBase_paySkillCost.call(this, skill);
        if (skill.id === CONFIG.GOUT_OF_FLAME_SKILL_ID && this.isStateAffected(CONFIG.GOUT_OF_FLAME_STATE_ID)) {
            if (this.mp <= 0) {
                this.removeState(CONFIG.GOUT_OF_FLAME_STATE_ID);
                this._goutTarget = null;
                this._goutMultiplier = 1;
                
                if (SceneManager._scene && SceneManager._scene._logWindow) {
                    SceneManager._scene._logWindow.push("addText", `${this.name()}'s flame guttered out!`);
                    SceneManager._scene._logWindow.push("wait");
                }
            }
        }
    };

    //=============================================================================
    // 5. Gout of Flame: Execution & Damage Scaling
    //=============================================================================
    
    const _BattleManager_startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        const action = this._subject ? this._subject.currentAction() : null;
        
        // Target Death Check (Before Execution)
        if (action && action.item() && action.item().id === CONFIG.GOUT_OF_FLAME_SKILL_ID && this._subject.isStateAffected(CONFIG.GOUT_OF_FLAME_STATE_ID)) {
            const target = this._subject._goutTarget;
            
            if (!target || target.isDead()) {
                this._subject.removeState(CONFIG.GOUT_OF_FLAME_STATE_ID);
                this._subject._goutTarget = null;
                this._subject._goutMultiplier = 1;
                this._subject.clearActions();
                
                this._logWindow.push("addText", `${this._subject.name()}'s Gout of Flame ended - target died!`);
                this._logWindow.push("wait");
                
                // Safely fizzle the action so MZ doesn't crash trying to execute a null array
                action.makeTargets = function() { return []; }; 
                _BattleManager_startAction.call(this);
                return;
            }
            
            // Valid Execution: Increment Multiplier
            this._subject._goutMultiplier = Math.min(CONFIG.GOUT_MAX_MULTIPLIER, (this._subject._goutMultiplier || 1) + 1);
        }
        
        _BattleManager_startAction.call(this);
    };

    // Applies the escalating damage multiplier
    const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        let value = _Game_Action_makeDamageValue.call(this, target, critical);
        
        if (this.item() && this.item().id === CONFIG.GOUT_OF_FLAME_SKILL_ID) {
            const mult = this.subject()._goutMultiplier || 1;
            value = Math.floor(value * mult);
        }
        
        return value;
    };

    // Target Registration & Post-Hit Death Checks
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        
        if (this.item() && this.item().id === CONFIG.GOUT_OF_FLAME_SKILL_ID) {
            const subject = this.subject();
            
            // Initial Cast: Lock on and establish baseline
            if (!subject.isStateAffected(CONFIG.GOUT_OF_FLAME_STATE_ID) && target.isAlive()) {
                subject._goutTarget = target;
                subject._goutMultiplier = 1;
                subject.addState(CONFIG.GOUT_OF_FLAME_STATE_ID);
            }
            
            // Post-Hit Execution: Target died to the blast
            if (subject.isStateAffected(CONFIG.GOUT_OF_FLAME_STATE_ID) && target.isDead()) {
                subject.removeState(CONFIG.GOUT_OF_FLAME_STATE_ID);
                subject._goutTarget = null;
                subject._goutMultiplier = 1;
            }
        }
    };

    //=============================================================================
    // 6. Death Tracking, Skill Learning & MP Restore (Martyr Core Mechanic)
    //=============================================================================
    
    const _Game_Actor_die = Game_Actor.prototype.die;
    Game_Actor.prototype.die = function() {
        _Game_Actor_die.call(this);
        
        // 1. Universally increment total deaths regardless of current class
        this._totalDeaths = (this._totalDeaths || 0) + 1;
        
        // Execute exactly as the death state is applied
        if (this._classId === CONFIG.MARTYR_CLASS_ID) {
            
            // 2. Check for Death Threshold Skills
            for (const thresholdStr in CONFIG.DEATH_SKILLS) {
                const threshold = Number(thresholdStr);
                
                // Because we use >=, we ensure they catch up on any skills they 
                // "missed" if they accrued deaths while they were not a Martyr
                if (this._totalDeaths >= threshold) {
                    const skills = CONFIG.DEATH_SKILLS[thresholdStr];
                    skills.forEach(skillId => {
                        if (!this.isLearnedSkill(skillId)) {
                            this.learnSkill(skillId);
                            
                            if ($gameParty.inBattle()) {
                                // Queue the message for end of battle
                                this._pendingMartyrSkills = this._pendingMartyrSkills || [];
                                this._pendingMartyrSkills.push(skillId);
                            } else {
                                // Instantly pop a message if they die from hazard damage on the map
                                const skillName = $dataSkills[skillId] ? $dataSkills[skillId].name : "a new skill";
                                $gameMessage.add(`${this.name()} embraced martyrdom and learned ${skillName}!`);
                            }
                        }
                    });
                }
            }

            // 3. MP Restore on Death
            const restored = this.mmp - this.mp;
            if (restored > 0) {
                // UI Sync Payload Callback ensures the HUD doesn't instantly jump 
                // until the popup text visually drops over the dying sprite.
                this.requestCustomTextPopup("+" + this.mmp, "heal", () => {
                    this.setMp(this.mmp);
                }, 60);
            }
        }
    };

    // Clear pending skills if a battle ends early (e.g., party escapes)
    const _Game_Actor_onBattleEnd = Game_Actor.prototype.onBattleEnd;
    Game_Actor.prototype.onBattleEnd = function() {
        _Game_Actor_onBattleEnd.call(this);
        this._pendingMartyrSkills = [];
    };

    //=============================================================================
    // 7. Post-Battle Reward Notifications
    //=============================================================================
    
    // Centralized function to display pending skills and clear the queue
    const flushMartyrSkills = () => {
        $gameParty.members().forEach(actor => {
            if (actor._pendingMartyrSkills && actor._pendingMartyrSkills.length > 0) {
                actor._pendingMartyrSkills.forEach(skillId => {
                    const skillName = $dataSkills[skillId] ? $dataSkills[skillId].name : "a new skill";
                    $gameMessage.add(`${actor.name()} learned ${skillName}!`);
                });
                actor._pendingMartyrSkills = []; // Flush the queue
            }
        });
    };

    // Hook 1: Standard Victory (Fires after EXP/Gold, before Mimic hook)
    const _BattleManager_displayRewards = BattleManager.displayRewards;
    BattleManager.displayRewards = function() {
        _BattleManager_displayRewards.call(this);
        flushMartyrSkills();
    };

    // Hook 2: Escape Success (Fires directly after the "Party Escaped" text)
    const _BattleManager_displayEscapeSuccessMessage = BattleManager.displayEscapeSuccessMessage;
    BattleManager.displayEscapeSuccessMessage = function() {
        _BattleManager_displayEscapeSuccessMessage.call(this);
        flushMartyrSkills();
    };

    // Hook 3: Catch-All for Aborts / "Continue on Defeat" events
    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        if (result !== 0) { // 0 is Victory, which is already handled above
            flushMartyrSkills();
        }
        _BattleManager_endBattle.call(this, result);
    };

})();