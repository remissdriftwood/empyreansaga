/*:
 * @target MZ
 * @plugindesc Phase 4: Shared Battle Mechanics v1.4
 * @author Custom Build
 * * @help
 * Implements:
 * - Two-Handed Dual Wield (Weapon Types 8 & 12 lock off-hand slot).
 * - Ammo System (<max ammo: X>, <shots: X>, Ammo Crate State 29).
 * - Dual Wield Volley Split (<dual wield hits> or Basic Attacks).
 * - Action Sequencing (<random repeats: X-Y>, <random extra hit: Z>, <follow up X: Y%>).
 * - Fighter MP Regen (Restores 1 MP per successful normal/dual-wield hit).
 * - Battle Circle Registry (Backend array for Phase 5 Cleric/Martyr skills).
 * - FIX: Hard-mapped Ammo arrays to specific Equipment Slots (fixes 6/6 bug).
 * - FIX: Shifted tag parsing to raw Regex to guarantee <max ammo> reads.
 * - UPGRADE: Fighters now pop up green "1"s per bullet hit.
 * - FIX: Swapped gainMp() for raw setMp() to eliminate native phantom popups.
 * - UPGRADE: Reloading now pushes notifications directly to the UI Banner Window.
 * - FIX: Removed redundant UI dummy-data override to prevent load order collisions.
 * - NEW: Custom Skill Sort Order via <sort_order: x> tags.
 * - NEW: Circle System End-of-Turn Pulse Hooks.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        FIGHTER_CLASS_ID: 1,
        AMMO_CRATE_STATE_ID: 29,
        TWO_HANDED_WTYPES: [8, 12],
        DUAL_WIELD_PENALTY: 0.75
    };

    //=============================================================================
    // 1. Titan's Grip (Two-Handed Equipment Locks)
    //=============================================================================
    const _Game_Actor_changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function(slotId, item) {
        if (this._isChangingEquip) {
            _Game_Actor_changeEquip.call(this, slotId, item);
            return;
        }
        
        this._isChangingEquip = true;
        _Game_Actor_changeEquip.call(this, slotId, item);
        
        if (this.isDualWield()) {
            const mainHand = this.equips()[0];
            const offHand = this.equips()[1];
            
            if (slotId === 0 && mainHand && CONFIG.TWO_HANDED_WTYPES.includes(mainHand.wtypeId) && offHand) {
                this.changeEquip(1, null);
            }
            if (slotId === 1 && offHand && CONFIG.TWO_HANDED_WTYPES.includes(offHand.wtypeId) && mainHand) {
                this.changeEquip(0, null);
            }
            if (slotId === 1 && offHand && !CONFIG.TWO_HANDED_WTYPES.includes(offHand.wtypeId) && mainHand && CONFIG.TWO_HANDED_WTYPES.includes(mainHand.wtypeId)) {
                this.changeEquip(0, null);
            }
            if (slotId === 0 && mainHand && !CONFIG.TWO_HANDED_WTYPES.includes(mainHand.wtypeId) && offHand && CONFIG.TWO_HANDED_WTYPES.includes(offHand.wtypeId)) {
                this.changeEquip(1, null);
            }
        }
        
        if (slotId === 0 || slotId === 1) this.refreshAmmoSlot(slotId);
        
        this._isChangingEquip = false;
    };

    //=============================================================================
    // 2. Ammo Array Tracking & Initialization
    //=============================================================================
    const _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        this.resetAmmo();
    };

    const _Game_Actor_onBattleStart = Game_Actor.prototype.onBattleStart;
    Game_Actor.prototype.onBattleStart = function() {
        _Game_Actor_onBattleStart.call(this);
        this.resetAmmo();
    };

    const _Game_Actor_onBattleEnd = Game_Actor.prototype.onBattleEnd;
    Game_Actor.prototype.onBattleEnd = function() {
        _Game_Actor_onBattleEnd.call(this);
        this.resetAmmo();
    };

    Game_Actor.prototype.resetAmmo = function() {
        if (!this._ammo) this._ammo = [0, 0];
        this.refreshAmmoSlot(0);
        this.refreshAmmoSlot(1);
    };

    Game_Actor.prototype.refreshAmmoSlot = function(slotId) {
        if (!this._ammo) this._ammo = [0, 0];
        const w = this.equips()[slotId];
        let max = 0;
        if (w && w.note) {
            const match = w.note.match(/<max ammo:\s*(\d+)>/i);
            if (match) max = parseInt(match[1]);
        }
        this._ammo[slotId] = max;
    };

    //=============================================================================
    // 3. Action Sequencer (Volley Split, Reloads, and Ammo Consumption)
    //=============================================================================
    const _BattleManager_startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        const subject = this._subject;
        const action = subject.currentAction();

        if (!action) {
            _BattleManager_startAction.call(this);
            return;
        }

        const isNormalAttack = action.isAttack();
        const isTagged = action.item() && action.item().note && action.item().note.match(/<dual wield hits>/i);
        
        if (subject.isActor() && (isNormalAttack || isTagged) && action._equipSlot === undefined && !action._isExtraHit && !action._isFollowUp) {
            const equips = subject.equips();
            const w1 = equips[0];
            const w2 = equips[1];
            
            if (w1) {
                action._equipSlot = 0;
                if (w2) {
                    const offhandAction = new Game_Action(subject);
                    offhandAction.setItemObject(action.item());
                    offhandAction._equipSlot = 1;
                    offhandAction.targetIndex = action.targetIndex; 
                    subject._actions.splice(1, 0, offhandAction);
                }
            } else if (w2) {
                action._equipSlot = 1;
            } else {
                action._equipSlot = -1; 
            }
        }

        if (subject.isActor() && action._equipSlot !== undefined && action._equipSlot >= 0) {
            const weapon = subject.equips()[action._equipSlot];
            
            if (weapon && weapon.note) {
                const maxMatch = weapon.note.match(/<max ammo:\s*(\d+)>/i);
                
                if (maxMatch) {
                    const isCrate = subject.isStateAffected(CONFIG.AMMO_CRATE_STATE_ID);
                    const currentAmmo = subject._ammo[action._equipSlot] || 0;
                    
                    if (currentAmmo <= 0 && !isCrate) {
                        this._logWindow.push("showBanner", `${subject.name()} reloaded ${weapon.name}!`);
                        this._logWindow.push("wait");
                        this._logWindow.push("wait");
                        this._logWindow.push("wait");
                        this._logWindow.push("hideBanner");
                        
                        subject._ammo[action._equipSlot] = parseInt(maxMatch[1]);
                        action.makeTargets = function() { return []; }; 
                    } else {
                        const shotsMatch = weapon.note.match(/<shots:\s*(\d+)>/i);
                        const shots = shotsMatch ? parseInt(shotsMatch[1]) : 1;
                        const fired = isCrate ? shots : Math.min(currentAmmo, shots);
                        
                        if (!isCrate) subject._ammo[action._equipSlot] -= fired;
                        action._shotsFired = fired;
                    }
                }
            }
        }

        _BattleManager_startAction.call(this);
    };

    const _Game_Action_numRepeats = Game_Action.prototype.numRepeats;
    Game_Action.prototype.numRepeats = function() {
        if (this._shotsFired !== undefined) return this._shotsFired;
        
        let repeats = _Game_Action_numRepeats.call(this);
        
        if (this.item() && this.item().note && this.item().note.match(/<random repeats:\s*(\d+)\s*-\s*(\d+)>/i)) {
            const match = this.item().note.match(/<random repeats:\s*(\d+)\s*-\s*(\d+)>/i);
            if (match) {
                const min = parseInt(match[1]);
                const max = parseInt(match[2]);
                repeats = Math.floor(Math.random() * (max - min + 1)) + min;
            }
        }
        return repeats;
    };

    const _Game_Action_itemAnimationId = Game_Action.prototype.itemAnimationId;
    Game_Action.prototype.itemAnimationId = function() {
        const isTagged = this.item() && this.item().note && this.item().note.match(/<dual wield hits>/i);
        if ((this.isAttack() || isTagged) && this._equipSlot === 1) {
            return this.subject().attackAnimationId2();
        }
        return _Game_Action_itemAnimationId.call(this);
    };

    //=============================================================================
    // 4. Action Sequencer (Extra Hits, Follow-ups, & MP Regen)
    //=============================================================================
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        
        const subject = this.subject();
        const item = this.item();
        const hit = target.result().isHit();

        if (hit && item) {
            if (subject.isActor() && subject._classId === CONFIG.FIGHTER_CLASS_ID) {
                const isTagged = item.note && item.note.match(/<dual wield hits>/i);
                if (this.isAttack() || isTagged) {
                    subject.setMp(subject.mp + 1); 
                    subject.requestCustomTextPopup("1", "heal"); 
                }
            }

            if (item.note && item.note.match(/<random extra hit:\s*(\d+(?:\.\d+)?)>/i) && !this._isExtraHit) {
                const extraMatch = item.note.match(/<random extra hit:\s*(\d+(?:\.\d+)?)>/i);
                if (extraMatch) {
                    const dmgMod = parseFloat(extraMatch[1]);
                    const extraAction = new Game_Action(subject);
                    extraAction.setItemObject(item);
                    extraAction._isExtraHit = true; 
                    extraAction._extraHitMod = dmgMod;
                    
                    const newTarget = $gameTroop.aliveMembers()[Math.floor(Math.random() * $gameTroop.aliveMembers().length)];
                    if (newTarget) {
                        extraAction.targetIndex = newTarget.index();
                        subject._actions.splice(1, 0, extraAction);
                    }
                }
            }

            if (item.note && item.note.match(/<follow up (\d+)(?::\s*(\d+)[%％])?>/i) && !this._isFollowUp) {
                const followMatch = item.note.match(/<follow up (\d+)(?::\s*(\d+)[%％])?>/i);
                const skillId = parseInt(followMatch[1]);
                const chance = followMatch[2] ? parseInt(followMatch[2]) / 100 : 1.0;
                
                if (Math.random() < chance) {
                    const followAction = new Game_Action(subject);
                    followAction.setSkill(skillId);
                    followAction._isFollowUp = true;
                    followAction.targetIndex = target.index();
                    subject._actions.splice(1, 0, followAction);
                }
            }
        }
    };

    const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        let value = _Game_Action_makeDamageValue.call(this, target, critical);
        
        if (this.subject().isActor() && this.subject().weapons().filter(w => w).length > 1) {
            const isTagged = this.item() && this.item().note && this.item().note.match(/<dual wield hits>/i);
            if (this.isAttack() || isTagged) {
                value = Math.floor(value * CONFIG.DUAL_WIELD_PENALTY);
            }
        }

        if (this._extraHitMod) {
            value = Math.floor(value * this._extraHitMod);
        }

        return value;
    };

    //=============================================================================
    // 5. Circle System Backend Registry
    //=============================================================================
    BattleManager._activeCircles = [];

    BattleManager.addCircle = function(caster, skillId, duration) {
        if (!this._activeCircles) this._activeCircles = [];
        this._activeCircles = this._activeCircles.filter(c => c.caster !== caster);
        this._activeCircles.push({
            caster: caster,
            skillId: skillId,
            duration: duration
        });
    };

    BattleManager.getActiveCircles = function() {
        return this._activeCircles || [];
    };

    BattleManager.clearCircles = function() {
        this._activeCircles = [];
    };

    // Circle Pulse Hook - Executes at the start of the Turn End Phase
    const _BattleManager_endTurn = BattleManager.endTurn;
    BattleManager.endTurn = function() {
        if (this._activeCircles && this._activeCircles.length > 0) {
            this._activeCircles = this._activeCircles.filter(circle => {
                if (circle.caster && circle.caster.isAlive()) {
                    circle.caster.forceAction(circle.skillId, -1);
                    BattleManager.forceAction(circle.caster);
                    circle.duration--;
                    return circle.duration > 0;
                }
                return false; 
            });
        }
        _BattleManager_endTurn.call(this);
    };

    //=============================================================================
    // 6. Custom Skill Sort Order 
    //=============================================================================
    const _Window_SkillList_makeItemList = Window_SkillList.prototype.makeItemList;
    Window_SkillList.prototype.makeItemList = function() {
        _Window_SkillList_makeItemList.call(this);
        
        if (this._data && this._data.length > 0) {
            this._data.sort((a, b) => {
                let orderA = 0;
                let orderB = 0;
                
                if (a && a.note) {
                    const matchA = a.note.match(/<sort_order:\s*(-?\d+)>/i);
                    if (matchA) orderA = parseInt(matchA[1]);
                }
                if (b && b.note) {
                    const matchB = b.note.match(/<sort_order:\s*(-?\d+)>/i);
                    if (matchB) orderB = parseInt(matchB[1]);
                }
                
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                // Fallback to database ID to ensure deterministic sorting
                return (a.id || 0) - (b.id || 0); 
            });
        }
    };

})();