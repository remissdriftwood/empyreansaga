/*:
 * @target MZ
 * @plugindesc Phase 5: Cultivator Class Mechanics v1.0
 * @author Custom Build
 * * @help
 * Implements:
 * - Imbued Elements: Post-hit abilities on any HP-damaging skill.
 * - Global Elixir Cooldowns: Use this.interactElixir('type', 'element', overrideMp) 
 * in a map event to natively manage MP, Elements, and Self Switch 'A'.
 * - Expend Element: <expend element> clears elements post-action.
 * - Requires Element: <requires element> disables skills if empty.
 * - Earth Call: <earth call> restores 10 MP, randomizes element, goes on 1-battle cooldown.
 * - Sword on a String (State 60): Hooks Async Queue to attack at end of turn.
 * - Energy Swords (State 61): Follow-up extra attack (Skill 144) on hit.
 * - Yuanying (State 62): Snapshots HP on cast, negates death, revives at snapshot.
 * - Calm Mind (State 64): Blocks state/buff applications from anyone but self.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        CULTIVATOR_CLASS_ID: 6,
        
        SWORD_STRING_STATE_ID: 60,
        ENERGY_SWORDS_STATE_ID: 61,
        ENERGY_SWORDS_SKILL_ID: 144,
        YUANYING_STATE_ID: 62,
        CALM_MIND_STATE_ID: 64,
        
        FIRE_CRIT_MULT: 0.0035,
        WATER_MAT_MULT: 0.25,
        WOOD_MAT_MULT: 0.6,
        EARTH_MAT_MULT: 0.01,
        
        ANIMATIONS: {
            flyingSword: 111,
            fire: 114,
            earth: 117,
            water: 121,
            wood: 121,
            yuanying: 122,
            metal: 128
        }
    };

    //=============================================================================
    // 1. Data Initialization & Persistence
    //=============================================================================
    const _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        this._cultivatorElement = null;
        this._earthCallCooldown = 0;
    };

    const _Game_Actor_onBattleEnd = Game_Actor.prototype.onBattleEnd;
    Game_Actor.prototype.onBattleEnd = function() {
        _Game_Actor_onBattleEnd.call(this);
        if (this._earthCallCooldown > 0) this._earthCallCooldown--;
    };

    // Global Elixir Cooldown Tick
    const _Game_System_onBattleEnd = Game_System.prototype.onBattleEnd;
    Game_System.prototype.onBattleEnd = function() {
        _Game_System_onBattleEnd.call(this);
        if (this._cultivatorElixirs) {
            for (const key in this._cultivatorElixirs) {
                if (this._cultivatorElixirs[key] > 0) {
                    this._cultivatorElixirs[key]--;
                    if (this._cultivatorElixirs[key] <= 0) {
                        const coords = key.split(",");
                        const mapId = parseInt(coords[0]);
                        const eventId = parseInt(coords[1]);
                        $gameSelfSwitches.setValue([mapId, eventId, 'A'], false);
                        delete this._cultivatorElixirs[key];
                    }
                }
            }
        }
    };

    //=============================================================================
    // 2. Skill Modifiers (<requires element>, <earth call>)
    //=============================================================================
    const _Game_BattlerBase_meetsSkillConditions = Game_BattlerBase.prototype.meetsSkillConditions;
    Game_BattlerBase.prototype.meetsSkillConditions = function(skill) {
        let meets = _Game_BattlerBase_meetsSkillConditions.call(this, skill);
        
        if (meets && this.isActor() && this._classId === CONFIG.CULTIVATOR_CLASS_ID) {
            if (skill.note && skill.note.match(/<requires element>/i)) {
                if (!this._cultivatorElement) return false;
            }
            if (skill.note && skill.note.match(/<earth call>/i)) {
                if (this._earthCallCooldown > 0) return false;
            }
        }
        return meets;
    };

    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        const subject = this._subject;
        const action = subject ? subject.currentAction() : null;
        
        if (subject && subject.isActor() && subject._classId === CONFIG.CULTIVATOR_CLASS_ID && action && action.item()) {
            if (action.item().note && action.item().note.match(/<expend element>/i)) {
                subject._cultivatorElement = null;
                if (SceneManager._scene && SceneManager._scene._logWindow) {
                    SceneManager._scene._logWindow.push("addText", `${subject.name()} expended their elemental energy!`);
                    SceneManager._scene._logWindow.push("wait");
                }
            }
        }
        _BattleManager_endAction.call(this);
    };

    //=============================================================================
    // 3. Imbued Elements Combat Logic
    //=============================================================================
    
    // Fire Element - Crit Modifier
    const _Game_Action_itemCri = Game_Action.prototype.itemCri;
    Game_Action.prototype.itemCri = function(target) {
        let cri = _Game_Action_itemCri.call(this, target);
        if (this.subject().isActor() && this.subject()._classId === CONFIG.CULTIVATOR_CLASS_ID) {
            if (this.subject()._cultivatorElement === 'fire' && this.isDamage()) {
                cri += (this.subject().mat * CONFIG.FIRE_CRIT_MULT);
            }
        }
        return cri;
    };

    // Earth Element Cache Target HP
    const _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function(target, value) {
        target._preHitHp = target.hp; 
        _Game_Action_executeHpDamage.call(this, target, value);
    };

    // Post-Hit Elemental Logic, Energy Swords, & Earth Call MP Restore
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        
        const subject = this.subject();
        const item = this.item();

        if (subject.isActor() && subject._classId === CONFIG.CULTIVATOR_CLASS_ID && item) {
            
            // Yuanying HP Snapshot
            if (item.note && item.note.match(/<yuanying>/i) && subject === target) {
                subject._yuanyingSnapshot = subject.hp;
            }

            // Earth Call Action
            if (item.note && item.note.match(/<earth call>/i)) {
                const validElements = ["water", "fire", "wood", "earth", "metal"];
                const newElement = validElements[Math.floor(Math.random() * validElements.length)];
                
                subject._cultivatorElement = newElement;
                subject._earthCallCooldown = 1;
                
                subject.requestCustomTextPopup("+10", "heal", () => {
                    subject.setMp(subject.mp + 10);
                });
            }

            // Successful HP-Damaging Hit
            if (target.result().isHit() && this.isHpEffect() && item.damage.type > 0) {
                
                const el = subject._cultivatorElement;
                
                // Element Proc: WATER (Party Heal)
                if (el === 'water') {
                    const heal = Math.floor(subject.mat * CONFIG.WATER_MAT_MULT);
                    if (heal > 0) {
                        $gameTemp.requestAnimation($gameParty.aliveMembers(), CONFIG.ANIMATIONS.water);
                        $gameParty.aliveMembers().forEach(a => {
                            a.gainHp(heal);
                            a.startDamagePopup();
                        });
                    }
                }
                
                // Element Proc: WOOD (Self Heal)
                if (el === 'wood') {
                    const heal = Math.floor(subject.mat * CONFIG.WOOD_MAT_MULT);
                    if (heal > 0) {
                        $gameTemp.requestAnimation([subject], CONFIG.ANIMATIONS.wood);
                        subject.gainHp(heal);
                        subject.startDamagePopup();
                    }
                }

                // Element Proc: FIRE (Animation Blast)
                if (el === 'fire') {
                    $gameTemp.requestAnimation([target], CONFIG.ANIMATIONS.fire);
                }

                // Element Proc: EARTH (Pre-Hit Scaling Damage)
                if (el === 'earth' && target._preHitHp) {
                    const ratio = target._preHitHp / target.mhp;
                    const maxBonus = subject.mat * CONFIG.EARTH_MAT_MULT;
                    const bonus = Math.floor(target.result().hpDamage * (maxBonus * ratio));
                    if (bonus > 0 && target.isAlive()) {
                        $gameTemp.requestAnimation([target], CONFIG.ANIMATIONS.earth);
                        target.gainHp(-bonus);
                        target.startDamagePopup();
                        if (target.isDead()) target.performCollapse();
                    }
                }

                // Element Proc: METAL (Global AoE Splash)
                if (el === 'metal') {
                    const splashTargets = $gameTroop.aliveMembers();
                    if (splashTargets.length > 0) {
                        $gameTemp.requestAnimation(splashTargets, CONFIG.ANIMATIONS.metal);
                        splashTargets.forEach(e => {
                            let dmg = Math.max(0, Math.floor(subject.mat / 4 - e.mdf / 5));
                            if (dmg > 0) {
                                e.gainHp(-dmg);
                                e.startDamagePopup();
                                if (e.isDead()) e.performCollapse();
                            }
                        });
                    }
                }

                // Follow-Up: Energy Swords (State 61)
                if (subject.isStateAffected(CONFIG.ENERGY_SWORDS_STATE_ID) && !this._isEnergySword && !this._isFollowUp && !this._isCirclePulse) {
                    const followAction = new Game_Action(subject);
                    followAction.setSkill(CONFIG.ENERGY_SWORDS_SKILL_ID);
                    followAction._isEnergySword = true; 
                    
                    let newTarget = target;
                    if (target.isDead()) {
                        newTarget = $gameTroop.aliveMembers()[Math.floor(Math.random() * $gameTroop.aliveMembers().length)];
                    }
                    
                    if (newTarget) {
                        followAction.targetIndex = newTarget.index();
                        subject._actions.splice(1, 0, followAction);
                    }
                }
            }
        }
    };

    //=============================================================================
    // 4. Yuanying (State 62) Death Negation
    //=============================================================================
    const _Game_BattlerBase_die = Game_BattlerBase.prototype.die;
    Game_BattlerBase.prototype.die = function() {
        if (this.isStateAffected(CONFIG.YUANYING_STATE_ID) && this.isActor() && this._yuanyingSnapshot > 0) {
            this.removeState(CONFIG.YUANYING_STATE_ID);
            this.setHp(this._yuanyingSnapshot);
            this._yuanyingSnapshot = 0;
            
            $gameTemp.requestAnimation([this], CONFIG.ANIMATIONS.yuanying);
            if (SceneManager._scene && SceneManager._scene._logWindow) {
                SceneManager._scene._logWindow.push("addText", `${this.name()}'s duplicate took the fatal blow!`);
                SceneManager._scene._logWindow.push("wait");
            }
            return;
        }
        _Game_BattlerBase_die.call(this);
    };

    //=============================================================================
    // 5. Calm Mind (State 64) State & Buff Blocking
    //=============================================================================
    const _Game_Action_itemEffectAddState = Game_Action.prototype.itemEffectAddState;
    Game_Action.prototype.itemEffectAddState = function(target, effect) {
        if (target.isStateAffected(CONFIG.CALM_MIND_STATE_ID) && this.subject() !== target) return;
        _Game_Action_itemEffectAddState.call(this, target, effect);
    };

    const _Game_Action_itemEffectAddBuff = Game_Action.prototype.itemEffectAddBuff;
    Game_Action.prototype.itemEffectAddBuff = function(target, effect) {
        if (target.isStateAffected(CONFIG.CALM_MIND_STATE_ID) && this.subject() !== target) return;
        _Game_Action_itemEffectAddBuff.call(this, target, effect);
    };

    const _Game_Action_itemEffectAddDebuff = Game_Action.prototype.itemEffectAddDebuff;
    Game_Action.prototype.itemEffectAddDebuff = function(target, effect) {
        if (target.isStateAffected(CONFIG.CALM_MIND_STATE_ID) && this.subject() !== target) return;
        _Game_Action_itemEffectAddDebuff.call(this, target, effect);
    };

    //=============================================================================
    // 6. Global Map Elixir Interactor
    //=============================================================================
    Game_Interpreter.prototype.interactElixir = function(type, element, overrideMp = null) {
        if (!$gameParty.battleMembers().some(a => a._classId === CONFIG.CULTIVATOR_CLASS_ID)) {
            $gameMessage.add("Such auspicious spots require a cultivator.");
            return;
        }

        const mapId = this._mapId;
        const eventId = this._eventId;
        const key = `${mapId},${eventId}`;

        $gameSystem._cultivatorElixirs = $gameSystem._cultivatorElixirs || {};
        if ($gameSystem._cultivatorElixirs[key] > 0) {
            $gameMessage.add("The energy here has been exhausted.");
            $gameMessage.add(`${$gameSystem._cultivatorElixirs[key]} battles remaining.`);
            return;
        }

        const validElements = ["water", "fire", "wood", "earth", "metal"];
        if (element === "random") {
            element = validElements[Math.floor(Math.random() * validElements.length)];
        }

        const types = { pill: 1.0, peach: 1.5, spot: 2.0 };
        const mult = types[type] || 1.0;
        let restore = overrideMp === "full" ? "full" : overrideMp || Math.floor(7 * mult);

        const eName = element.charAt(0).toUpperCase() + element.slice(1);
        $gameMessage.add(`This ${type} will restore ${restore === "full" ? "full" : restore} MP`);
        $gameMessage.add(`and imbue the ${eName} element.`);

        $gameMessage.setChoices(["Consume", "Leave it"], 0, 1);
        $gameMessage.setChoiceCallback(n => {
            if (n === 0) {
                // Auto-targets the first Cultivator in the party to prevent async lockups
                const target = $gameParty.battleMembers().find(a => a._classId === CONFIG.CULTIVATOR_CLASS_ID);
                
                if (restore === "full") {
                    target.setMp(target.mmp);
                } else {
                    target.setMp(target.mp + restore);
                }
                
                target._cultivatorElement = element;
                $gameSystem._cultivatorElixirs[key] = Math.floor(Math.random() * 3) + 4;
                $gameSelfSwitches.setValue([mapId, eventId, 'A'], true);

                $gameMessage.add(`${target.name()} consumed the ${type}!`);
            }
        });
        this.setWaitMode('message');
    };

})();