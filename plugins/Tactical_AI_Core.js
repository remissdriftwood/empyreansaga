/*:
 * @target MZ
 * @plugindesc Phase 3: Tactical AI Core v1.18
 * @author Custom Build
 * * @help
 * Implements:
 * - <CEB_Mimic>: Copies a random valid enemy's action list.
 * - <CEB_Cannibal>: Targets <50% HP. Heals fully on enemy death.
 * - <CEB_Bloodlust>: Gains +5% Crit Rate on any death.
 * - <CEB_Digest>: Manages Skill 159 / State 13 limits and death triggers.
 * - <CEB_SmartHeal: SkillID, Threshold%>: Smart validation and targeting.
 * - UPGRADE: Relocated arbitrary popup framework to UI core. Wrapped AI heals in UI payload callbacks.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Brute-Force Regex Notetag Parser
    //=============================================================================

    Game_Enemy.prototype.hasCustomBehavior = function(behaviorName) {
        if (!this.enemy() || typeof this.enemy().note !== 'string') return false;
        const regex = new RegExp(`<${behaviorName}>`, "i");
        return regex.test(this.enemy().note);
    };

    Game_Enemy.prototype.getCustomBehaviorData = function(behaviorName) {
        if (!this.enemy() || typeof this.enemy().note !== 'string') return null;
        const regex = new RegExp(`<${behaviorName}:\\s*(.+?)>`, "i");
        const match = this.enemy().note.match(regex);
        return match ? match[1].trim() : null;
    };

    //=============================================================================
    // 1. Enemy Initialization & Mimic Logic
    //=============================================================================
    
    const _Game_Enemy_setup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function(enemyId, x, y) {
        _Game_Enemy_setup.call(this, enemyId, x, y);
        if (this.hasCustomBehavior("CEB_Mimic")) {
            const validEnemies = $dataEnemies.filter(e => e && e.name && !e.note.match(/<CEB_Mimic>/i) && e.actions.length > 0);
            if (validEnemies.length > 0) {
                const template = validEnemies[Math.floor(Math.random() * validEnemies.length)];
                this._mimickedActions = JSON.parse(JSON.stringify(template.actions));
            }
        }
    };

    const _Game_Enemy_makeActions = Game_Enemy.prototype.makeActions;
    Game_Enemy.prototype.makeActions = function() {
        if (this._mimickedActions) {
            const originalActions = this.enemy().actions;
            this.enemy().actions = this._mimickedActions; 
            _Game_Enemy_makeActions.call(this);
            this.enemy().actions = originalActions; 
        } else {
            _Game_Enemy_makeActions.call(this);
        }
    };

    //=============================================================================
    // 2. Action Validation (Sanity Checks)
    //=============================================================================
    
    const _Game_Enemy_isActionValid = Game_Enemy.prototype.isActionValid;
    Game_Enemy.prototype.isActionValid = function(action) {
        if (!_Game_Enemy_isActionValid.call(this, action)) return false;

        if (action.skillId === 159 && this.hasCustomBehavior("CEB_Digest")) {
            const hasVictim = $gameParty.members().some(actor => actor.isStateAffected(13) && actor._digestedBy === this);
            if (hasVictim) return false;
        }

        const healData = this.getCustomBehaviorData("CEB_SmartHeal");
        if (healData) {
            const parts = healData.split(',');
            const skillId = parseInt(parts[0]);
            const threshold = parseInt(parts[1]) / 100;
            if (action.skillId === skillId) {
                const needsHeal = $gameTroop.aliveMembers().some(e => e.hpRate() <= threshold);
                if (!needsHeal) return false;
            }
        }
        return true;
    };

    //=============================================================================
    // 3. Dynamic Targeting Overrides
    //=============================================================================
    
    const _Game_Action_targetsForOpponents = Game_Action.prototype.targetsForOpponents;
    Game_Action.prototype.targetsForOpponents = function() {
        if (this.subject().isEnemy() && this.subject().hasCustomBehavior("CEB_Cannibal") && this.isForOpponent() && this.isForOne()) {
            const lowHpTargets = this.opponentsUnit().aliveMembers().filter(a => a.hpRate() <= 0.50);
            if (lowHpTargets.length > 0) {
                const target = lowHpTargets[Math.floor(Math.random() * lowHpTargets.length)];
                return [target];
            }
        }
        return _Game_Action_targetsForOpponents.call(this);
    };

    const _Game_Action_targetsForFriends = Game_Action.prototype.targetsForFriends;
    Game_Action.prototype.targetsForFriends = function() {
        if (this.subject().isEnemy() && this.subject().hasCustomBehavior("CEB_SmartHeal") && this.isForFriend() && this.isForOne()) {
            const healData = this.subject().getCustomBehaviorData("CEB_SmartHeal");
            if (healData) {
                const parts = healData.split(',');
                const skillId = parseInt(parts[0]);
                if (this.item() && this.item().id === skillId) {
                    const threshold = parseInt(parts[1]) / 100;
                    const lowHpAllies = this.friendsUnit().aliveMembers().filter(b => b.hpRate() <= threshold);
                    if (lowHpAllies.length > 0) {
                        lowHpAllies.sort((a, b) => a.hpRate() - b.hpRate());
                        return [lowHpAllies[0]]; 
                    }
                }
            }
        }
        return _Game_Action_targetsForFriends.call(this);
    };

    //=============================================================================
    // 4. Digest Execution & Data Tracking
    //=============================================================================
    
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        if (this.item() && this.item().id === 159 && target.result().addedStates.includes(13)) {
            target._digestedBy = this.subject();
        }
    };

    const _Game_Battler_removeState = Game_Battler.prototype.removeState;
    Game_Battler.prototype.removeState = function(stateId) {
        _Game_Battler_removeState.call(this, stateId);
        if (stateId === 13) this._digestedBy = null;
    };

    //=============================================================================
    // 5. Death Interception & Post-Action Reactions
    //=============================================================================
    
    const _Game_Battler_performCollapse = Game_Battler.prototype.performCollapse;
    Game_Battler.prototype.performCollapse = function() {
        _Game_Battler_performCollapse.call(this);

        if ($gameParty.inBattle()) {
            if (!BattleManager._pendingDeathReactions) BattleManager._pendingDeathReactions = [];
            if (!BattleManager._pendingDeathReactions.some(d => d.target === this)) {
                BattleManager._pendingDeathReactions.push({
                    target: this,
                    wasDigested: this.isStateAffected(13),
                    digester: this._digestedBy
                });
            }
        }
    };

    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        _BattleManager_endAction.call(this);
        this.processPendingDeathReactions();
    };

    const _BattleManager_updateTurnEnd = BattleManager.updateTurnEnd;
    BattleManager.updateTurnEnd = function() {
        _BattleManager_updateTurnEnd.call(this);
        this.processPendingDeathReactions();
    };

    BattleManager.processPendingDeathReactions = function() {
        if (!this._pendingDeathReactions || this._pendingDeathReactions.length === 0) return;
        const deaths = [...this._pendingDeathReactions];
        this._pendingDeathReactions = [];

        deaths.forEach(d => {
            const target = d.target;
            
            // Digest 1: Digester Dies
            if (target.isEnemy()) {
                $gameParty.members().forEach(actor => {
                    if (actor._digestedBy === target && actor.isStateAffected(13)) {
                        actor.removeState(13);
                    }
                });
            }

            // Digest 2: Prey Dies
            if (d.wasDigested && d.digester && d.digester.isAlive()) {
                const healAmount = Math.floor(d.digester.mhp * 0.25);
                
                d.digester.requestCustomTextPopup(`${healAmount}`, "heal", () => {
                    d.digester.gainHp(healAmount);
                });
                
                this._logWindow.push("showBanner", `${d.digester.name()} finishes digesting its prey and recovers ${healAmount} HP!`);
                this._logWindow.push("wait");
                this._logWindow.push("wait");
                this._logWindow.push("wait");
                this._logWindow.push("hideBanner");
            }
        });

        // Cannibal Logic
        const enemyDeaths = deaths.filter(d => d.target.isEnemy());
        if (enemyDeaths.length > 0) {
            const cannibals = $gameTroop.aliveMembers().filter(e => e.hasCustomBehavior("CEB_Cannibal"));
            if (cannibals.length > 0) {
                cannibals.forEach(c => {
                    const healAmount = c.mhp - c.hp;
                    
                    c.requestCustomTextPopup(`${healAmount}`, "heal", () => {
                        c.gainHp(healAmount);
                    });
                });
                const msg = cannibals.length > 1 ? "The Carrion Eaters devour the fallen and are healed to full HP!" : `${cannibals[0].name()} devours the fallen and is healed to full HP!`;
                this._logWindow.push("showBanner", msg);
                this._logWindow.push("wait");
                this._logWindow.push("wait");
                this._logWindow.push("wait");
                this._logWindow.push("hideBanner");
            }
        }

        // Bloodlust Logic
        if (deaths.length > 0) {
            const leaguers = $gameTroop.aliveMembers().filter(e => e.hasCustomBehavior("CEB_Bloodlust"));
            if (leaguers.length > 0) {
                const bonus = 0.05 * deaths.length;
                leaguers.forEach(l => {
                    
                    l.requestCustomTextPopup(`CRIT\n+${deaths.length * 5}%`, "normal", () => {
                        l._bloodlustBonus = (l._bloodlustBonus || 0) + bonus;
                    });
                });
                const msg = leaguers.length > 1 ? "The Leaguers relish the gore of battle!" : `${leaguers[0].name()} relishes the gore of battle!`;
                this._logWindow.push("showBanner", msg);
                this._logWindow.push("wait");
                this._logWindow.push("wait");
                this._logWindow.push("wait");
                this._logWindow.push("hideBanner");
            }
        }
    };

    const _Game_Enemy_xparam = Game_Enemy.prototype.xparam;
    Game_Enemy.prototype.xparam = function(xparamId) {
        let value = _Game_Enemy_xparam.call(this, xparamId);
        if (xparamId === 1 && this._bloodlustBonus) {
            value += this._bloodlustBonus;
        }
        return value;
    };

})();