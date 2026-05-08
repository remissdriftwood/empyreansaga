/*:
 * @target MZ
 * @plugindesc Phase 3: Tactical AI Core v1.01
 * @author Custom Build
 * * @help
 * Implements:
 * - <CEB_Mimic>: Copies a random valid enemy's action list.
 * - <CEB_Cannibal>: Targets <50% HP. Heals fully on enemy death.
 * - <CEB_Bloodlust>: Gains +5% Crit Rate on any death.
 * - <CEB_Digest>: Manages Skill 159 / State 13 limits and death triggers.
 * - <CEB_SmartHeal: SkillID, Threshold%>: Smart validation and targeting.
 * - Embedded UI Patch: Arbitrary 1-bit text popups for status effects.
 * - FIX: Deep-cloned mimic arrays and strict string coercion for safety.
 */

(() => {
    'use strict';

    //=============================================================================
    // 1. Enemy Initialization & Mimic Logic
    //=============================================================================

    const _Game_Enemy_setup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function(enemyId, x, y) {
        _Game_Enemy_setup.call(this, enemyId, x, y);
        
        if (this.enemy() && this.enemy().meta && this.enemy().meta.CEB_Mimic) {
            const validEnemies = $dataEnemies.filter(e => e && e.name && !e.meta.CEB_Mimic && e.actions.length > 0);
            if (validEnemies.length > 0) {
                const template = validEnemies[Math.floor(Math.random() * validEnemies.length)];
                // Deep clone to ensure we don't mutate the global database template
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

        const meta = this.enemy().meta || {};

        // Digest Restriction
        if (action.skillId === 159 && meta.CEB_Digest) {
            const hasVictim = $gameParty.members().some(actor => actor.isStateAffected(13) && actor._digestedBy === this);
            if (hasVictim) return false;
        }

        // Smart Healer Threshold Check
        if (meta.CEB_SmartHeal) {
            const parts = String(meta.CEB_SmartHeal).split(',');
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
        if (this.subject().isEnemy() && this.subject().enemy().meta && this.subject().enemy().meta.CEB_Cannibal && this.isForOpponent() && this.isForOne()) {
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
        if (this.subject().isEnemy() && this.subject().enemy().meta && this.subject().enemy().meta.CEB_SmartHeal && this.isForFriend() && this.isForOne()) {
            const parts = String(this.subject().enemy().meta.CEB_SmartHeal).split(',');
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

    const _Game_Battler_die = Game_Battler.prototype.die;
    Game_Battler.prototype.die = function() {
        const wasDigested = this.isStateAffected(13);
        const digester = this._digestedBy;
        
        _Game_Battler_die.call(this);

        if ($gameParty.inBattle()) {
            if (!BattleManager._pendingDeathReactions) BattleManager._pendingDeathReactions = [];
            BattleManager._pendingDeathReactions.push({
                target: this,
                wasDigested: wasDigested,
                digester: digester
            });
        }
    };

    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        _BattleManager_endAction.call(this);
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
                d.digester.gainHp(healAmount);
                d.digester.startDamagePopup();
                this._logWindow.push("showBanner", `${d.digester.name()} finishes digesting its prey and recovers ${healAmount} HP!`);
                this._logWindow.push("wait");
                this._logWindow.push("hideBanner");
            }
        });

        // Cannibal Logic
        const enemyDeaths = deaths.filter(d => d.target.isEnemy());
        if (enemyDeaths.length > 0) {
            const cannibals = $gameTroop.aliveMembers().filter(e => e.enemy().meta && e.enemy().meta.CEB_Cannibal);
            if (cannibals.length > 0) {
                cannibals.forEach(c => {
                    const healAmount = c.mhp - c.hp;
                    if (healAmount > 0) {
                        c.gainHp(healAmount);
                        c.startDamagePopup();
                    }
                });
                const msg = cannibals.length > 1 ? "The Carrion Eaters devour the fallen and are healed to full HP!" : `${cannibals[0].name()} devours the fallen and is healed to full HP!`;
                this._logWindow.push("showBanner", msg);
                this._logWindow.push("wait");
                this._logWindow.push("hideBanner");
            }
        }

        // Bloodlust Logic
        if (deaths.length > 0) {
            const leaguers = $gameTroop.aliveMembers().filter(e => e.enemy().meta && e.enemy().meta.CEB_Bloodlust);
            if (leaguers.length > 0) {
                const bonus = 0.05 * deaths.length;
                leaguers.forEach(l => {
                    l._bloodlustBonus = (l._bloodlustBonus || 0) + bonus;
                    l.requestCustomTextPopup(`CRIT +${deaths.length * 5}%`);
                });
                const msg = leaguers.length > 1 ? "The Leaguers relish the gore of battle!" : `${leaguers[0].name()} relishes the gore of battle!`;
                this._logWindow.push("showBanner", msg);
                this._logWindow.push("wait");
                this._logWindow.push("hideBanner");
            }
        }
    };

    const _Game_Enemy_cri = Game_Enemy.prototype.cri;
    Game_Enemy.prototype.cri = function() {
        return _Game_Enemy_cri.call(this) + (this._bloodlustBonus || 0);
    };

    //=============================================================================
    // 6. Embedded UI Patch: Arbitrary Text Popups
    //=============================================================================

    Game_Battler.prototype.requestCustomTextPopup = function(text) {
        this._customPopupText = text;
    };

    Game_Battler.prototype.isCustomTextPopupRequested = function() {
        return !!this._customPopupText;
    };

    Game_Battler.prototype.clearCustomTextPopup = function() {
        this._customPopupText = null;
    };

    const _Sprite_Battler_updateDamagePopup = Sprite_Battler.prototype.updateDamagePopup;
    Sprite_Battler.prototype.updateDamagePopup = function() {
        _Sprite_Battler_updateDamagePopup.call(this);
        if (this._battler.isCustomTextPopupRequested()) {
            const sprite = new Sprite_Damage();
            sprite.x = this.x + this.damageOffsetX();
            sprite.y = this.y + this.damageOffsetY();
            sprite.setupArbitraryText(this._battler._customPopupText);
            this.parent.addChild(sprite);
            this._damages.push(sprite);
            this._battler.clearCustomTextPopup();
        }
    };

    Sprite_Damage.prototype.setupArbitraryText = function(text) {
        this._colorType = 0; 
        const canvasW = 128;
        const canvasH = 32;
        const chunkyThickness = 2;
        const sprite = this.createChildSprite(canvasW, canvasH);
        
        sprite.bitmap.fontFace = $gameSystem.numberFontFace();
        sprite.bitmap.fontSize = 16;
        sprite.bitmap.smooth = false;
        
        const outlineBmp = new Bitmap(canvasW, canvasH);
        outlineBmp.fontFace = sprite.bitmap.fontFace;
        outlineBmp.fontSize = sprite.bitmap.fontSize;
        outlineBmp.textColor = "#ffffff";
        outlineBmp.smooth = false;
        outlineBmp.drawText(text, 0, 0, canvasW, canvasH, "center");
        
        const centerBmp = new Bitmap(canvasW, canvasH);
        centerBmp.fontFace = sprite.bitmap.fontFace;
        centerBmp.fontSize = sprite.bitmap.fontSize;
        centerBmp.textColor = "#000000";
        centerBmp.smooth = false;
        centerBmp.drawText(text, 0, 0, canvasW, canvasH, "center");

        [outlineBmp, centerBmp].forEach(bmp => {
            const ctx = bmp.context;
            const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
            for (let i = 0; i < imgData.data.length; i += 4) {
                imgData.data[i + 3] = imgData.data[i + 3] >= 127 ? 255 : 0; 
            }
            ctx.putImageData(imgData, 0, 0);
        });

        sprite.bitmap.outlineWidth = 0;
        for (let dy = -chunkyThickness; dy <= chunkyThickness; dy++) {
            for (let dx = -chunkyThickness; dx <= chunkyThickness; dx++) {
                if (dx === 0 && dy === 0) continue;
                sprite.bitmap.blt(outlineBmp, 0, 0, canvasW, canvasH, dx, dy);
            }
        }
        sprite.bitmap.blt(centerBmp, 0, 0, canvasW, canvasH, 0, 0);
        
        sprite.yOffset = -16;
        sprite.ry = 0;
        sprite.dy = 0;
    };

})();