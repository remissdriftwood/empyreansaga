/*:
 * @target MZ
 * @plugindesc Teaches specific classes a set of skills (Cleric style) or via a storefront (Knight style).
 * @author Custom Build
 *
 * @command TeachClassSkills
 * @text Teach Class Skills (Silent/Location)
 * @desc Checks for a specific class and teaches them a list of skills, playing dialogues accordingly.
 *
 * @arg ClassID
 * @text Class ID
 * @desc The database ID of the Class (e.g., 2 for Cleric).
 * @type class
 * @default 2
 *
 * @arg SkillIDs
 * @text Skill IDs
 * @desc A comma-separated list of Skill IDs to teach (e.g., 15, 20, 25).
 * @type string
 *
 * @arg ConvoA
 * @text Conversation A (No Learning)
 * @desc The Dialogue_Manager Conversation ID to play if no one learns anything.
 * @type string
 *
 * @arg ConvoB
 * @text Conversation B (Success)
 * @desc The Dialogue_Manager Conversation ID to play if skills are successfully learned.
 * @type string
 * * @command OpenSkillShop
 * @text Open Skill Shop (Knight style)
 * @desc Opens a custom shop scene where a specific class can buy global skills using Gold.
 *
 * @arg ClassID
 * @text Class ID
 * @desc The database ID of the Class (e.g., 7 for Knight).
 * @type class
 * @default 7
 *
 * @arg SkillIDs
 * @text Shop Skill IDs
 * @desc A comma-separated list of Skill IDs to offer in the shop (e.g., 50, 51, 52).
 * @type string
 *
 * @arg ConvoA
 * @text Conversation A (Knight Present / Welcome)
 * @desc The Dialogue_Manager Conversation ID to play BEFORE opening the shop window.
 * @type string
 *
 * @arg ConvoB
 * @text Conversation B (No Knight Present / Reject)
 * @desc The Dialogue_Manager Conversation ID to play if no valid class member is in the party.
 * @type string
 */

(() => {
    const pluginName = "Event_Skill_Teacher";

    // =========================================================================
    // Core Engine Global Memory & Hooks
    // =========================================================================
    
    const alias_Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        alias_Game_System_initialize.call(this);
        this._purchasedClassSkills = {};
    };

    // Global Check: Has this skill been bought for this class?
    Game_System.prototype.hasPurchasedClassSkill = function(classId, skillId) {
        if (!this._purchasedClassSkills) this._purchasedClassSkills = {}; 
        
        if (!this._purchasedClassSkills[classId]) return false;
        return this._purchasedClassSkills[classId].includes(skillId);
    };

    // Global Add: Marks a skill as bought for all future class members
    Game_System.prototype.addPurchasedClassSkill = function(classId, skillId) {
        if (!this._purchasedClassSkills) this._purchasedClassSkills = {};
        
        if (!this._purchasedClassSkills[classId]) {
            this._purchasedClassSkills[classId] = [];
        }
        if (!this._purchasedClassSkills[classId].includes(skillId)) {
            this._purchasedClassSkills[classId].push(skillId);
        }
    };

    // Automatically check and learn skills when an actor is created/initialized
    const alias_Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        alias_Game_Actor_setup.call(this, actorId);
        this.checkAndLearnPurchasedClassSkills();
    };

    // Automatically check and learn skills if an actor changes class mid-game
    const alias_Game_Actor_changeClass = Game_Actor.prototype.changeClass;
    Game_Actor.prototype.changeClass = function(classId, keepExp) {
        alias_Game_Actor_changeClass.call(this, classId, keepExp);
        this.checkAndLearnPurchasedClassSkills();
    };

    Game_Actor.prototype.checkAndLearnPurchasedClassSkills = function() {
        const classId = this._classId;
        if ($gameSystem._purchasedClassSkills && $gameSystem._purchasedClassSkills[classId]) {
            for (const skillId of $gameSystem._purchasedClassSkills[classId]) {
                if (!this.isLearnedSkill(skillId)) {
                    this.learnSkill(skillId);
                }
            }
        }
    };

    // =========================================================================
    // Command 1: Teach Class Skills (Location/Discovery Style)
    // =========================================================================

    PluginManager.registerCommand(pluginName, "TeachClassSkills", function(args) {
        const classId = parseInt(args.ClassID, 10);
        const skillIds = args.SkillIDs.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id) && id > 0);
        const convoA = args.ConvoA ? args.ConvoA.trim() : "";
        const convoB = args.ConvoB ? args.ConvoB.trim() : "";

        const partyMembers = $gameParty.members();
        const targetActors = partyMembers.filter(actor => actor._classId === classId);

        if (targetActors.length === 0) {
            if (convoA) this.setupDialogueConversation(convoA);
            return;
        }

        const learners = [];
        for (const actor of targetActors) {
            const learnedSkills = [];
            for (const skillId of skillIds) {
                if (!actor.isLearnedSkill(skillId)) {
                    actor.learnSkill(skillId); 
                    const skillData = $dataSkills[skillId];
                    if (skillData) learnedSkills.push(skillData);
                }
            }
            if (learnedSkills.length > 0) {
                learners.push({ actor: actor, learnedSkills: learnedSkills });
            }
        }

        if (learners.length === 0) {
            if (convoA) this.setupDialogueConversation(convoA);
            return;
        }

        this._estPendingSkillMessages = learners;
        this._estWaitingForSkillMessages = true;
        
        if (convoB) {
            this.setupDialogueConversation(convoB);
        }
    });

    // =========================================================================
    // Command 2: Open Skill Shop (Knight Training Style)
    // =========================================================================

    PluginManager.registerCommand(pluginName, "OpenSkillShop", function(args) {
        const classId = parseInt(args.ClassID, 10);
        const skillIds = args.SkillIDs.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id) && id > 0);
        const convoA = args.ConvoA ? args.ConvoA.trim() : ""; // Knight is Present
        const convoB = args.ConvoB ? args.ConvoB.trim() : ""; // No Knight Present

        const hasClass = $gameParty.members().some(actor => actor._classId === classId);

        if (!hasClass) {
            // No valid class member. Play Reject Convo and abort.
            if (convoB) this.setupDialogueConversation(convoB);
            return;
        }

        // Class is present! Cache the shop data for the Scene.
        $gameTemp._pendingSkillShopData = { classId: classId, skills: skillIds };
        this._estWaitingToOpenShop = true;

        if (convoA) {
            this.setupDialogueConversation(convoA);
        }
    });

    // =========================================================================
    // Interpreter Hooks (Handling Timing for Dialogues vs Windows/Scenes)
    // =========================================================================

    const alias_Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        const waiting = alias_Game_Interpreter_updateWaitMode.call(this);

        if (!waiting) {
            // Check for Location-style skill discovery text boxes
            if (this._estWaitingForSkillMessages) {
                if ($gameMessage.isBusy()) return true; 

                if (this._estPendingSkillMessages && this._estPendingSkillMessages.length > 0) {
                    const learner = this._estPendingSkillMessages.shift();
                    $gameMessage.setSpeakerName(""); 
                    $gameMessage.setBackground(0); 
                    $gameMessage.setPositionType(2); 

                    for (const skill of learner.learnedSkills) {
                        $gameMessage.add(`${learner.actor.name()} learned ${skill.name}!`);
                    }
                    this.setWaitMode('message');
                    return true;
                } else {
                    this._estWaitingForSkillMessages = false;
                }
            }

            // Check for Shop-style transition
            if (this._estWaitingToOpenShop) {
                this._estWaitingToOpenShop = false;
                SceneManager.push(Scene_SkillShop);
                // Return true for this frame so the event halts while the new Scene fades in.
                return true; 
            }
        }
        return waiting;
    };
    
    const alias_Game_Interpreter_clear = Game_Interpreter.prototype.clear;
    Game_Interpreter.prototype.clear = function() {
        alias_Game_Interpreter_clear.call(this);
        this._estPendingSkillMessages = null;
        this._estWaitingForSkillMessages = false;
        this._estWaitingToOpenShop = false;
    };

    // =========================================================================
    // Custom Scene: Scene_SkillShop
    // =========================================================================

    function Scene_SkillShop() {
        this.initialize(...arguments);
    }
    
    Scene_SkillShop.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_SkillShop.prototype.constructor = Scene_SkillShop;

    Scene_SkillShop.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_SkillShop.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createGoldWindow();
        this.createTitleWindow();
        this.createBuyWindow();
    };

    Scene_SkillShop.prototype.createGoldWindow = function() {
        const rect = this.goldWindowRect();
        this._goldWindow = new Window_Gold(rect);
        this.addWindow(this._goldWindow);
    };

    Scene_SkillShop.prototype.goldWindowRect = function() {
        const ww = 240;
        const wh = this.calcWindowHeight(1, true);
        const wx = Graphics.boxWidth - ww;
        const wy = this.mainAreaTop(); // Anchor to the top right, below help window
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_SkillShop.prototype.createTitleWindow = function() {
        const rect = this.titleWindowRect();
        this._titleWindow = new Window_SkillShopTitle(rect);
        
        const shopData = $gameTemp._pendingSkillShopData || { classId: 7 };
        this._titleWindow.setup(shopData.classId);
        
        this.addWindow(this._titleWindow);
    };

    Scene_SkillShop.prototype.titleWindowRect = function() {
        const wx = 0;
        const wy = this.mainAreaTop();
        const ww = Graphics.boxWidth - this.goldWindowRect().width; // Fill space left of Gold window
        const wh = this.calcWindowHeight(1, true);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_SkillShop.prototype.createBuyWindow = function() {
        const rect = this.buyWindowRect();
        this._buyWindow = new Window_SkillShopBuy(rect);
        this._buyWindow.setHelpWindow(this._helpWindow);
        this._buyWindow.setHandler("ok", this.onBuyOk.bind(this));
        this._buyWindow.setHandler("cancel", this.popScene.bind(this));
        
        const shopData = $gameTemp._pendingSkillShopData || { classId: 0, skills: [] };
        this._buyWindow.setup(shopData.classId, shopData.skills);
        this.addWindow(this._buyWindow);
        
        this._buyWindow.activate();
        this._buyWindow.select(0);
    };

    Scene_SkillShop.prototype.buyWindowRect = function() {
        const wx = 0;
        const wy = this.mainAreaTop() + this.calcWindowHeight(1, true); // Push below Title/Gold row
        const ww = Graphics.boxWidth;
        const wh = this.mainAreaBottom() - wy; // Span remainder of the screen
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_SkillShop.prototype.onBuyOk = function() {
        const item = this._buyWindow.item();
        const price = this._buyWindow.price(item);
        const shopData = $gameTemp._pendingSkillShopData;

        // Deduct standard Gold
        $gameParty.loseGold(price);

        // Instantly teach all current members of that class in the active party
        for (const actor of $gameParty.members()) {
            if (actor._classId === shopData.classId && !actor.isLearnedSkill(item.id)) {
                actor.learnSkill(item.id);
            }
        }

        // Cache locally to ensure any future class members get it on join/class change
        $gameSystem.addPurchasedClassSkill(shopData.classId, item.id);

        SoundManager.playShop();

        // Refresh windows and maintain state
        this._goldWindow.refresh();
        this._buyWindow.refresh();
        this._buyWindow.activate();
    };

    // =========================================================================
    // Custom Window: Window_SkillShopTitle
    // =========================================================================

    function Window_SkillShopTitle() {
        this.initialize(...arguments);
    }

    Window_SkillShopTitle.prototype = Object.create(Window_Base.prototype);
    Window_SkillShopTitle.prototype.constructor = Window_SkillShopTitle;

    Window_SkillShopTitle.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._classId = null;
    };

    Window_SkillShopTitle.prototype.setup = function(classId) {
        this._classId = classId;
        this.refresh();
    };

    Window_SkillShopTitle.prototype.refresh = function() {
        this.contents.clear();
        // Dynamically pull the class name from the DB, default to generic "Class" if invalid
        const className = (this._classId && $dataClasses[this._classId]) ? $dataClasses[this._classId].name : "Class";
        this.drawText(className + GetLexiconText("UI_SKILL_TEACHER_TRAINING", " TRAINING"), 0, 0, this.innerWidth, "left");
    };

    // =========================================================================
    // Custom Window: Window_SkillShopBuy
    // =========================================================================

    function Window_SkillShopBuy() {
        this.initialize(...arguments);
    }
    
    Window_SkillShopBuy.prototype = Object.create(Window_Selectable.prototype);
    Window_SkillShopBuy.prototype.constructor = Window_SkillShopBuy;

    Window_SkillShopBuy.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._classId = 0;
        this._data = [];
    };

    Window_SkillShopBuy.prototype.setup = function(classId, skillIds) {
        this._classId = classId;
        this._data = skillIds.map(id => $dataSkills[id]).filter(skill => !!skill);
        this.refresh();
    };

    Window_SkillShopBuy.prototype.maxItems = function() {
        return this._data ? this._data.length : 0;
    };

    Window_SkillShopBuy.prototype.item = function() {
        return this.itemAt(this.index());
    };

    Window_SkillShopBuy.prototype.itemAt = function(index) {
        return this._data && index >= 0 ? this._data[index] : null;
    };

    // Extracts from <price: X> notetag. Defaults to 0 if missing.
    Window_SkillShopBuy.prototype.price = function(item) {
        if (!item) return 0;
        return Number(item.meta.price || 0);
    };

    Window_SkillShopBuy.prototype.isPurchased = function(item) {
        if (!item) return false;
        return $gameSystem.hasPurchasedClassSkill(this._classId, item.id);
    };

    Window_SkillShopBuy.prototype.isEnabled = function(item) {
        if (!item) return false;
        if (this.isPurchased(item)) return false; // Gray out if already bought
        return $gameParty.gold() >= this.price(item); // Gray out if can't afford
    };

    Window_SkillShopBuy.prototype.isCurrentItemEnabled = function() {
        return this.isEnabled(this.item());
    };

    Window_SkillShopBuy.prototype.drawItem = function(index) {
        const item = this.itemAt(index);
        const rect = this.itemLineRect(index);
        const priceWidth = 96;

        this.changePaintOpacity(this.isEnabled(item));
        this.drawItemName(item, rect.x, rect.y, rect.width - priceWidth);

        if (this.isPurchased(item)) {
            // Matches item max restriction visuals
            this.drawText(GetLexiconText("UI_SKILL_TEACHER_LEARNED", "LEARNED"), rect.x + rect.width - priceWidth, rect.y, priceWidth, "right");
        } else {
            // Draw Gold Price
            this.drawText(this.price(item), rect.x + rect.width - priceWidth, rect.y, priceWidth, "right");
        }
        
        this.changePaintOpacity(1);
    };

    Window_SkillShopBuy.prototype.updateHelp = function() {
        this.setHelpWindowItem(this.item());
    };

})();