/*:
 * @target MZ
 * @plugindesc Phase 5: Mimic Class Mechanics v1.1
 * @author Custom Build
 * * @command StartMimicDialogue
 * @text Start Mimic Dialogue
 * @desc Initiates the out-of-battle mimic sequence for a specific enemy.
 * * @arg enemyId
 * @type enemy
 * @text Enemy
 * @desc The enemy to mimic.
 * * @help
 * Implements:
 * - Dynamic Data Interception (Face, Field Sprite, SV Sprite, Skills, Stats).
 * - Stat Rating Modifiers (+ = +25%, - = -25%). Max HP uses Mimic Base. MP uses Enemy Base.
 * - End of Battle Choice Flow (Validates last killed enemy).
 * - Out-of-Battle Map NPC Flow (Via Plugin Command).
 * - Equipment Lock (Seals all equipment slots).
 * * Enemy Database Notetags:
 * <Face: filename, index> (e.g., <Face: MonsterFaces, 3>)
 * <Character: filename, index> (e.g., <Character: $GoblinChar, 0>)
 * <Battler: filename> (e.g., <Battler: Goblin_SV>)
 * <ClassName: Custom Name>
 * <StatRatings: mhp:++, mp:-, atk:+++, def:->
 * <No Mimic>
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        MIMIC_CLASS_ID: 8, // Set to your Mimic's Class ID in the database
        MIMIC_STARTING_ENEMIES: [2, 3, 4, 5], // IDs for Character Creation options
        RATING_MULTIPLIER: 0.25 // 25% per '+' or '-'
    };

    //=============================================================================
    // 1. Plugin Command (Out-of-Battle Trigger)
    //=============================================================================
    PluginManager.registerCommand("Battle_Class_Mimic", "StartMimicDialogue", args => {
        const enemyId = Number(args.enemyId);
        const mimics = $gameParty.members().filter(a => a._classId === CONFIG.MIMIC_CLASS_ID);
        
        if (mimics.length > 0 && enemyId > 0) {
            SceneManager.push(Scene_MimicMap);
            SceneManager.prepareNextScene(enemyId);
        }
    });

    //=============================================================================
    // 2. Game_Actor Intercepts & Hooks
    //=============================================================================
    const _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        this._mimickedEnemyId = null;
    };

    Game_Actor.prototype.transformIntoMimic = function(enemyId) {
        this._mimickedEnemyId = enemyId;
        this.clearEquipments();
        this.setMp(this.mmp); // Restore MP on transformation
        this.refresh();
    };

    const _Game_Actor_equipSlots = Game_Actor.prototype.equipSlots;
    Game_Actor.prototype.equipSlots = function() {
        if (this._classId === CONFIG.MIMIC_CLASS_ID) return [];
        return _Game_Actor_equipSlots.call(this);
    };

    //=============================================================================
    // Visual Intercepts
    //=============================================================================
    const _Game_Actor_faceName = Game_Actor.prototype.faceName;
    Game_Actor.prototype.faceName = function() {
        if (this._classId === CONFIG.MIMIC_CLASS_ID && this._mimickedEnemyId) {
            const enemy = $dataEnemies[this._mimickedEnemyId];
            if (enemy.meta.Face) return enemy.meta.Face.split(',')[0].trim();
            return `$enemy_${enemy.name.replace(/\s+/g, '')}_face`;
        }
        return _Game_Actor_faceName.call(this);
    };

    const _Game_Actor_faceIndex = Game_Actor.prototype.faceIndex;
    Game_Actor.prototype.faceIndex = function() {
        if (this._classId === CONFIG.MIMIC_CLASS_ID && this._mimickedEnemyId) {
            const enemy = $dataEnemies[this._mimickedEnemyId];
            if (enemy.meta.Face) return parseInt(enemy.meta.Face.split(',')[1]) || 0;
            return 0;
        }
        return _Game_Actor_faceIndex.call(this);
    };

    const _Game_Actor_characterName = Game_Actor.prototype.characterName;
    Game_Actor.prototype.characterName = function() {
        if (this._classId === CONFIG.MIMIC_CLASS_ID && this._mimickedEnemyId) {
            const enemy = $dataEnemies[this._mimickedEnemyId];
            if (enemy.meta.Character) return enemy.meta.Character.split(',')[0].trim();
            return `$enemy_${enemy.name.replace(/\s+/g, '')}_01`;
        }
        return _Game_Actor_characterName.call(this);
    };

    const _Game_Actor_characterIndex = Game_Actor.prototype.characterIndex;
    Game_Actor.prototype.characterIndex = function() {
        if (this._classId === CONFIG.MIMIC_CLASS_ID && this._mimickedEnemyId) {
            const enemy = $dataEnemies[this._mimickedEnemyId];
            if (enemy.meta.Character) return parseInt(enemy.meta.Character.split(',')[1]) || 0;
            return 0;
        }
        return _Game_Actor_characterIndex.call(this);
    };

    const _Game_Actor_battlerName = Game_Actor.prototype.battlerName;
    Game_Actor.prototype.battlerName = function() {
        if (this._classId === CONFIG.MIMIC_CLASS_ID && this._mimickedEnemyId) {
            const enemy = $dataEnemies[this._mimickedEnemyId];
            if (enemy.meta.Battler) return enemy.meta.Battler.trim();
            return `$enemy_${enemy.name.replace(/\s+/g, '')}_battle_01`;
        }
        return _Game_Actor_battlerName.call(this);
    };

    // Class Name Intercept
    const _Window_Base_drawActorClass = Window_Base.prototype.drawActorClass;
    Window_Base.prototype.drawActorClass = function(actor, x, y, width) {
        if (actor._classId === CONFIG.MIMIC_CLASS_ID && actor._mimickedEnemyId) {
            const enemy = $dataEnemies[actor._mimickedEnemyId];
            const name = enemy.meta.ClassName || enemy.name;
            this.resetTextColor();
            this.drawText(name, x, y, width);
        } else {
            _Window_Base_drawActorClass.call(this, actor, x, y, width);
        }
    };

    // Skill Intercept
    const _Game_Actor_addedSkills = Game_Actor.prototype.addedSkills;
    Game_Actor.prototype.addedSkills = function() {
        let skills = _Game_Actor_addedSkills.call(this);
        if (this._classId === CONFIG.MIMIC_CLASS_ID && this._mimickedEnemyId) {
            const enemy = $dataEnemies[this._mimickedEnemyId];
            const enemySkills = enemy.actions.map(a => a.skillId).filter(id => id > 0);
            const uniqueSkills = [...new Set(enemySkills)];
            skills = skills.concat(uniqueSkills);
        }
        return skills;
    };

    // Stat Intercept
    function getRatingMultiplier(paramId, ratingString) {
        const paramNames = ['mhp', 'mp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'];
        const regex = new RegExp(`${paramNames[paramId]}:([+-]+)`, 'i');
        const match = ratingString.match(regex);
        if (match) {
            let val = 0;
            for (let char of match[1]) {
                if (char === '+') val += CONFIG.RATING_MULTIPLIER;
                if (char === '-') val -= CONFIG.RATING_MULTIPLIER;
            }
            return 1.0 + val;
        }
        return 1.0;
    }

    const _Game_Actor_paramBase = Game_Actor.prototype.paramBase;
    Game_Actor.prototype.paramBase = function(paramId) {
        let base = _Game_Actor_paramBase.call(this, paramId);
        
        if (this._classId === CONFIG.MIMIC_CLASS_ID && this._mimickedEnemyId) {
            const enemy = $dataEnemies[this._mimickedEnemyId];
            if (paramId === 1) base = enemy.params[1]; // Overwrite MP base with Enemy MP
            
            const ratingString = enemy.meta.StatRatings || "";
            const multiplier = getRatingMultiplier(paramId, ratingString);
            return Math.max(1, Math.floor(base * multiplier));
        }
        return base;
    };

    //=============================================================================
    // 3. Battle Tracking & Victory Flow
    //=============================================================================
    const _Game_Enemy_die = Game_Enemy.prototype.die;
    Game_Enemy.prototype.die = function() {
        _Game_Enemy_die.call(this);
        // By hooking here, AOE kills will process sequentially, leaving the last processed ID in temp.
        if (this.enemyId() && !$dataEnemies[this.enemyId()].meta.NoMimic) {
            $gameTemp._lastKilledEnemyId = this.enemyId();
        }
    };

    const _BattleManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        _BattleManager_setup.call(this, troopId, canEscape, canLose);
        $gameTemp._lastKilledEnemyId = null;
    };

    // Inject Mimic flow BEFORE the Victory message and rewards
    const _BattleManager_displayVictoryMessage = BattleManager.displayVictoryMessage;
    BattleManager.displayVictoryMessage = function() {
        const mimics = $gameParty.members().filter(a => a._classId === CONFIG.MIMIC_CLASS_ID);
        
        if (mimics.length > 0 && $gameTemp._lastKilledEnemyId) {
            const targetEnemyId = $gameTemp._lastKilledEnemyId;
            $gameTemp._lastKilledEnemyId = null; // Clear to prevent loops
            
            if (SceneManager._scene instanceof Scene_Battle) {
                // Suspends the victory flow to run the UI
                SceneManager._scene.startMimicFlow(targetEnemyId, () => {
                    _BattleManager_displayVictoryMessage.call(this); // Resume normal victory
                });
                return;
            }
        }
        _BattleManager_displayVictoryMessage.call(this);
    };

    //=============================================================================
    // 4. Shared Mimic Windows
    //=============================================================================

    function Window_MimicPrompt() { this.initialize(...arguments); }
    Window_MimicPrompt.prototype = Object.create(Window_Command.prototype);
    Window_MimicPrompt.prototype.initialize = function(rect) {
        this._enemyName = "";
        Window_Command.prototype.initialize.call(this, rect);
    };
    Window_MimicPrompt.prototype.setEnemy = function(enemyName) {
        this._enemyName = enemyName;
        this.refresh();
    };
    Window_MimicPrompt.prototype.makeCommandList = function() {
        this.addCommand(`Mimic ${this._enemyName}? (Yes)`, 'yes');
        this.addCommand("No", 'no');
    };
    Window_MimicPrompt.prototype.itemTextAlign = function() { return 'center'; };

    function Window_MimicConfirm() { this.initialize(...arguments); }
    Window_MimicConfirm.prototype = Object.create(Window_Command.prototype);
    Window_MimicConfirm.prototype.initialize = function(rect) {
        this._actorName = "";
        this._enemyName = "";
        Window_Command.prototype.initialize.call(this, rect);
    };
    Window_MimicConfirm.prototype.setNames = function(actorName, enemyName) {
        this._actorName = actorName;
        this._enemyName = enemyName;
        this.refresh();
    };
    Window_MimicConfirm.prototype.makeCommandList = function() {
        this.addCommand(`Should ${this._actorName} mimic ${this._enemyName}? (Yes)`, 'yes');
        this.addCommand("No", 'no');
    };
    Window_MimicConfirm.prototype.itemTextAlign = function() { return 'center'; };

    function Window_MimicSelect() { this.initialize(...arguments); }
    Window_MimicSelect.prototype = Object.create(Window_MenuStatus.prototype);
    Window_MimicSelect.prototype.initialize = function(rect) {
        Window_MenuStatus.prototype.initialize.call(this, rect);
    };
    Window_MimicSelect.prototype.maxItems = function() {
        return $gameParty.members().filter(a => a._classId === CONFIG.MIMIC_CLASS_ID).length;
    };
    Window_MimicSelect.prototype.actor = function(index) {
        return $gameParty.members().filter(a => a._classId === CONFIG.MIMIC_CLASS_ID)[index];
    };

    function Window_MimicSkills() { this.initialize(...arguments); }
    Window_MimicSkills.prototype = Object.create(Window_Selectable.prototype);
    Window_MimicSkills.prototype.initialize = function(rect) {
        this._skills = [];
        Window_Selectable.prototype.initialize.call(this, rect);
    };
    Window_MimicSkills.prototype.setEnemy = function(enemyId) {
        const enemy = $dataEnemies[enemyId];
        const skillIds = [...new Set(enemy.actions.map(a => a.skillId).filter(id => id > 0))];
        this._skills = skillIds.map(id => $dataSkills[id]);
        this.refresh();
    };
    Window_MimicSkills.prototype.maxItems = function() { return this._skills.length; };
    Window_MimicSkills.prototype.drawItem = function(index) {
        const skill = this._skills[index];
        const rect = this.itemLineRect(index);
        this.drawItemName(skill, rect.x, rect.y, rect.width);
    };

    //=============================================================================
    // 5. Shared Scene Logic (Injected into Scene_Battle & Scene_MimicMap)
    //=============================================================================

    const setupMimicWindows = function(scene) {
        const width = 400;
        
        // Setup Prompt
        scene._mimicPromptWindow = new Window_MimicPrompt(new Rectangle((Graphics.boxWidth - width)/2, Graphics.boxHeight/2 - 50, width, 120));
        scene._mimicPromptWindow.setHandler('yes', scene.onMimicPromptYes.bind(scene));
        scene._mimicPromptWindow.setHandler('no', scene.onMimicCancel.bind(scene));
        scene._mimicPromptWindow.setHandler('cancel', scene.onMimicCancel.bind(scene));
        scene._mimicPromptWindow.hide();
        scene._mimicPromptWindow.deactivate();
        scene.addWindow(scene._mimicPromptWindow);

        // Setup Select
        scene._mimicSelectWindow = new Window_MimicSelect(new Rectangle(0, 0, 352, Graphics.boxHeight));
        scene._mimicSelectWindow.setHandler('ok', scene.onMimicSelectOk.bind(scene));
        scene._mimicSelectWindow.setHandler('cancel', scene.onMimicSelectCancel.bind(scene));
        scene._mimicSelectWindow.hide();
        scene._mimicSelectWindow.deactivate();
        scene.addWindow(scene._mimicSelectWindow);

        // Setup Status (Using Core Engine 16-bit status clone)
        scene._mimicStatusWindow = new Window_Status(new Rectangle(0, 0, 200, Graphics.boxHeight));
        scene._mimicStatusWindow.hide();
        scene.addWindow(scene._mimicStatusWindow);

        // Setup Skills
        scene._mimicSkillsWindow = new Window_MimicSkills(new Rectangle(200, 0, Graphics.boxWidth - 200, Graphics.boxHeight - 120));
        scene._mimicSkillsWindow.hide();
        scene.addWindow(scene._mimicSkillsWindow);

        // Setup Confirm
        scene._mimicConfirmWindow = new Window_MimicConfirm(new Rectangle(200, Graphics.boxHeight - 120, Graphics.boxWidth - 200, 120));
        scene._mimicConfirmWindow.setHandler('yes', scene.onMimicConfirmYes.bind(scene));
        scene._mimicConfirmWindow.setHandler('no', scene.onMimicConfirmCancel.bind(scene));
        scene._mimicConfirmWindow.setHandler('cancel', scene.onMimicConfirmCancel.bind(scene));
        scene._mimicConfirmWindow.hide();
        scene._mimicConfirmWindow.deactivate();
        scene.addWindow(scene._mimicConfirmWindow);
    };

    const buildMimicFlowMethods = {
        startMimicFlow: function(enemyId, callback) {
            this._mimicEnemyId = enemyId;
            this._mimicCallback = callback;
            this._mimicPromptWindow.setEnemy($dataEnemies[enemyId].name);
            this._mimicPromptWindow.show();
            this._mimicPromptWindow.activate();
            this._mimicPromptWindow.select(0);
        },
        onMimicPromptYes: function() {
            this._mimicPromptWindow.hide();
            this._mimicPromptWindow.deactivate();
            
            const mimics = $gameParty.members().filter(a => a._classId === CONFIG.MIMIC_CLASS_ID);
            if (mimics.length > 1) {
                this._mimicSelectWindow.refresh();
                this._mimicSelectWindow.show();
                this._mimicSelectWindow.activate();
                this._mimicSelectWindow.select(0);
            } else {
                this._mimicSelectedActor = mimics[0];
                this.showMimicConfirmation();
            }
        },
        onMimicSelectOk: function() {
            this._mimicSelectedActor = this._mimicSelectWindow.actor(this._mimicSelectWindow.index());
            this._mimicSelectWindow.hide();
            this._mimicSelectWindow.deactivate();
            this.showMimicConfirmation();
        },
        onMimicSelectCancel: function() {
            this._mimicSelectWindow.hide();
            this._mimicSelectWindow.deactivate();
            this._mimicPromptWindow.show();
            this._mimicPromptWindow.activate();
        },
        showMimicConfirmation: function() {
            // Clone actor to safely show stats without fully committing
            const dummy = JsonEx.makeDeepCopy(this._mimicSelectedActor);
            dummy.transformIntoMimic(this._mimicEnemyId);
            
            this._mimicStatusWindow.setActor(dummy);
            this._mimicStatusWindow.refresh();
            this._mimicStatusWindow.show();
            
            this._mimicSkillsWindow.setEnemy(this._mimicEnemyId);
            this._mimicSkillsWindow.show();
            
            this._mimicConfirmWindow.setNames(this._mimicSelectedActor.name(), $dataEnemies[this._mimicEnemyId].name);
            this._mimicConfirmWindow.show();
            this._mimicConfirmWindow.activate();
            this._mimicConfirmWindow.select(0);
        },
        onMimicConfirmYes: function() {
            this._mimicSelectedActor.transformIntoMimic(this._mimicEnemyId);
            this.closeAllMimicWindows();
            if (this._mimicCallback) this._mimicCallback();
        },
        onMimicConfirmCancel: function() {
            this._mimicStatusWindow.hide();
            this._mimicSkillsWindow.hide();
            this._mimicConfirmWindow.hide();
            this._mimicConfirmWindow.deactivate();
            
            const mimics = $gameParty.members().filter(a => a._classId === CONFIG.MIMIC_CLASS_ID);
            if (mimics.length > 1) {
                this._mimicSelectWindow.show();
                this._mimicSelectWindow.activate();
            } else {
                this._mimicPromptWindow.show();
                this._mimicPromptWindow.activate();
            }
        },
        onMimicCancel: function() {
            this.closeAllMimicWindows();
            if (this._mimicCallback) this._mimicCallback();
        },
        closeAllMimicWindows: function() {
            this._mimicPromptWindow.hide();
            this._mimicSelectWindow.hide();
            this._mimicStatusWindow.hide();
            this._mimicSkillsWindow.hide();
            this._mimicConfirmWindow.hide();
        }
    };

    // Inject into Scene_Battle
    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        setupMimicWindows(this);
    };
    Object.assign(Scene_Battle.prototype, buildMimicFlowMethods);

    //=============================================================================
    // 6. Map / NPC Out-of-Battle UI (Scene_MimicMap)
    //=============================================================================

    function Scene_MimicMap() { this.initialize(...arguments); }
    Scene_MimicMap.prototype = Object.create(Scene_MenuBase.prototype);
    
    Scene_MimicMap.prototype.prepare = function(enemyId) {
        this._enemyId = enemyId;
    };
    Scene_MimicMap.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        setupMimicWindows(this);
    };
    Scene_MimicMap.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this.startMimicFlow(this._enemyId, () => {
            this.popScene();
        });
    };
    Object.assign(Scene_MimicMap.prototype, buildMimicFlowMethods);

    

})();