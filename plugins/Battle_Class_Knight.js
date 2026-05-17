/*:
 * @target MZ
 * @plugindesc Phase 5: Knight Class Mechanics v1.2
 * @author Custom Build
 * * @help
 * Implements:
 * - Shield Restrictions: Use <requires_shield> notetag on skills.
 * - Runic Gleam (State 55): Redirects all Magical (Hit Type 2) attacks to Knight.
 * - For a Hamburger Today (State 33): Redirects all party damage to Knight, pools it, 
 * negates instant damage ("GUARD" popup), and takes it as raw damage at EOT.
 * - Heal Guard (State 34): Intercepts all attacks meant for the guarded ally.
 * - Feedback (State 70): Absorbs all HP damage taken and deals it to the target at EOT.
 * - Custom Block (Skill 155): Overwrites native Guard command for the Knight.
 * - Custom Block Heal: Intercepts native MP heal to spawn custom `+X` text popup.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration & Formulas
    //=============================================================================
    const CONFIG = {
        KNIGHT_CLASS_ID: 7,
        BLOCK_SKILL_ID: 155,
        SHIELD_ATYPE_IDS: [3, 4], 
        
        HAMBURGER_STATE_ID: 33,
        GUARDED_STATE_ID: 34,
        RUNIC_GLEAM_STATE_ID: 55,
        FEEDBACK_STATE_ID: 70,

        // Easily adjustable Feedback Damage Formula
        // Currently set to return 100% (1.0x) of absorbed damage
        FEEDBACK_FORMULA: (absorbedDamage, knight, target) => {
            return Math.floor(absorbedDamage * 1.0); 
        }
    };

    //=============================================================================
    // 1. Data Initialization & Pool Reset
    //=============================================================================
    const _Game_Actor_onBattleStart = Game_Actor.prototype.onBattleStart;
    Game_Actor.prototype.onBattleStart = function() {
        _Game_Actor_onBattleStart.call(this);
        if (this._classId === CONFIG.KNIGHT_CLASS_ID) {
            this._hamburgerPool = 0;
            this._feedbackPool = 0;
            this._feedbackTarget = null;
        }
    };

    //=============================================================================
    // 2. Custom Block Override (UI & Action Sequencer)
    //=============================================================================
    
    // UI Override: Renames the menu command dynamically
    const _Window_ActorCommand_addGuardCommand = Window_ActorCommand.prototype.addGuardCommand;
    Window_ActorCommand.prototype.addGuardCommand = function() {
        if (this._actor && this._actor._classId === CONFIG.KNIGHT_CLASS_ID) {
            const blockSkill = $dataSkills[CONFIG.BLOCK_SKILL_ID];
            const commandName = blockSkill ? blockSkill.name : TextManager.guard;
            this.addCommand(commandName, "guard", this._actor.canGuard());
        } else {
            _Window_ActorCommand_addGuardCommand.call(this);
        }
    };

    // Action Sequencer Override: Forces the Knight to cast Skill 155
    const _Game_Actor_guardSkillId = Game_Actor.prototype.guardSkillId;
    Game_Actor.prototype.guardSkillId = function() {
        if (this._classId === CONFIG.KNIGHT_CLASS_ID) {
            return CONFIG.BLOCK_SKILL_ID;
        }
        return _Game_Actor_guardSkillId.call(this);
    };

    //=============================================================================
    // 3. Shield Requirement Restriction (<requires_shield>)
    //=============================================================================
    const _Game_BattlerBase_meetsSkillConditions = Game_BattlerBase.prototype.meetsSkillConditions;
    Game_BattlerBase.prototype.meetsSkillConditions = function(skill) {
        let meets = _Game_BattlerBase_meetsSkillConditions.call(this, skill);
        
        if (meets && skill && skill.meta && skill.meta.requires_shield !== undefined) {
            if (this.isActor() && this._classId === CONFIG.KNIGHT_CLASS_ID) {
                // Check if any equipped armor has the designated Shield Atype IDs
                const hasShield = this.armors().some(a => a && CONFIG.SHIELD_ATYPE_IDS.includes(a.atypeId));
                if (!hasShield) return false;
            }
        }
        return meets;
    };

    //=============================================================================
    // 4. Dynamic Targeting Redirection (Cover, Gleam, & Hamburger)
    //=============================================================================
    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        let targets = _Game_Action_makeTargets.call(this);
        
        // Only redirect if an enemy is attacking the party
        if (this.subject().isEnemy() && targets.length > 0 && targets[0].isActor()) {
            
            const knight = $gameParty.battleMembers().find(a => a._classId === CONFIG.KNIGHT_CLASS_ID && a.isAlive());
            
            if (knight) {
                const isHamburger = knight.isStateAffected(CONFIG.HAMBURGER_STATE_ID);
                const isRunic = knight.isStateAffected(CONFIG.RUNIC_GLEAM_STATE_ID) && this.item().hitType === 2; // Hit Type 2 = Magical Attack
                
                targets = targets.map(t => {
                    // Hamburger overrides everything, sponges entire party
                    if (isHamburger) return knight; 
                    
                    // Runic Gleam overrides Magical attacks 
                    if (isRunic) return knight;     
                    
                    // Heal Guard covers specific allies
                    if (t.isStateAffected(CONFIG.GUARDED_STATE_ID) && t !== knight) return knight; 
                    
                    return t;
                });
            }
        }
        return targets;
    };

    //=============================================================================
    // 5. Feedback Registration, Battery Hooks & Database MP Intercept
    //=============================================================================
    
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        
        if (this.subject().isActor() && this.subject()._classId === CONFIG.KNIGHT_CLASS_ID) {
            
            // A. Log Feedback target
            if (target.result().isHit() && this.item().effects.some(e => e.code === 21 && e.dataId === CONFIG.FEEDBACK_STATE_ID)) {
                this.subject()._feedbackTarget = target;
                this.subject()._feedbackPool = 0; 
            }
            
            // B. Intercept Block MP Recovery (Skill 155) to customize the popup
            if (this.item().id === CONFIG.BLOCK_SKILL_ID) {
                const res = target.result();
                if (res.mpDamage < 0) { // Negative damage = Heal
                    const recovered = -res.mpDamage;
                    res.mpDamage = 0; // Erase the native blue/black popup from the queue
                    target.requestCustomTextPopup("+" + recovered, "heal"); // Spawn custom grey +X
                }
            }
        }
    };

    // Intercept HP Damage to charge batteries & nullify Hamburger instant damage
    const _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function(target, value) {
        
        if (target.isActor() && target._classId === CONFIG.KNIGHT_CLASS_ID && value > 0) {
            
            const originalValue = value;

            // Check Hamburger Sponge
            if (target.isStateAffected(CONFIG.HAMBURGER_STATE_ID)) {
                target._hamburgerPool = (target._hamburgerPool || 0) + originalValue;
                target.requestCustomTextPopup("GUARD", "normal");
                value = 0; // Nullify instant HP loss
            }
            
            // Check Feedback Battery (Charges using the original intended damage)
            if (target.isStateAffected(CONFIG.FEEDBACK_STATE_ID)) {
                target._feedbackPool = (target._feedbackPool || 0) + originalValue; 
            }
        }
        
        _Game_Action_executeHpDamage.call(this, target, value);
    };

    //=============================================================================
    // 6. End of Turn Payoffs (Hamburger Crash & Feedback Retaliation)
    //=============================================================================
    const _Game_Actor_onTurnEnd = Game_Actor.prototype.onTurnEnd;
    Game_Actor.prototype.onTurnEnd = function() {
        _Game_Actor_onTurnEnd.call(this);
        
        if (this._classId === CONFIG.KNIGHT_CLASS_ID) {
            
            // 1. Hamburger Crash (Knight takes the pooled damage)
            if (this._hamburgerPool > 0) {
                const dmg = this._hamburgerPool;
                this._hamburgerPool = 0; // Reset pool
                
                this.gainHp(-dmg);
                this.startDamagePopup(); // Natively pushes the raw damage to the screen
                
                if (this.isDead()) {
                    this.performCollapse();
                    this._feedbackPool = 0; // Kills Feedback if Hamburger destroys the Knight
                    return; 
                }
            }
            
            // 2. Feedback Retaliation
            if (this.isStateAffected(CONFIG.FEEDBACK_STATE_ID) && this._feedbackPool > 0) {
                let target = this._feedbackTarget;
                
                // If the target is dead or missing, grab a random surviving enemy
                if (!target || target.isDead()) {
                    let validEnemies = $gameTroop.aliveMembers();
                    if (validEnemies.length > 0) {
                        target = validEnemies[Math.floor(Math.random() * validEnemies.length)];
                    }
                }
                
                if (target) {
                    const rawDamage = this._feedbackPool;
                    const finalDamage = CONFIG.FEEDBACK_FORMULA(rawDamage, this, target);
                    this._feedbackPool = 0; // Reset pool
                    
                    target.gainHp(-finalDamage);
                    target.startDamagePopup();
                    target.requestCustomTextPopup("Feedback!", "normal");
                    
                    if (target.isDead()) target.performCollapse();
                }
            }
        }
    };

})();