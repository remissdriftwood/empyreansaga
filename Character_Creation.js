/*:
 * @target MZ
 * @plugindesc Phase 6: Beadle Character Creation Flow v1.13
 * @author Custom Build
 * * @command startCreation
 * @text Start Beadle Creation
 * @desc Initiates the character creation sequence.
 * * @arg canCancel
 * @type boolean
 * @text Can Cancel?
 * @desc If true, the player can back out of the first menu to cancel creation.
 * @default true
 * * @help
 * Implements a custom Scene for Beadle Creation:
 * 1. Choose Class (with randomized style preview, inline description, and Learn More).
 * 2. Choose Style (4 animated field sprites).
 * 3. Enter Name (Native Name Input with Cancel support).
 * 4. Confirm (Displays Core_Engine's 16-bit Window_Status layout).
 * * Replaces the first available placeholder actor ("??????") in slots 1-4.
 * Auto-scales level to the party's average.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        PLACEHOLDER_NAME: "??????",
        PARTY_SLOTS: [1, 2, 3, 4],
        
        // Map Database Class IDs to their name and Face index on PCs1_XX.png
        CLASSES: [
            { id: 1, name: "Fighter", faceIndex: 0 },
            { id: 2, name: "Cleric", faceIndex: 1 },
            { id: 3, name: "Martyr", faceIndex: 2 },
            { id: 4, name: "Farmer", faceIndex: 3 },
            { id: 5, name: "Chemist", faceIndex: 4 },
            { id: 6, name: "Cultivator", faceIndex: 6 }, 
            { id: 7, name: "Knight", faceIndex: 5 }
        ],
        
        // Class ID : [{ item ID, amount }]
        STARTING_ITEMS: {
            4: [{ id: 17, amount: 1 }] // Farmer gets Brandywine Seed
        }
    };

    //=============================================================================
    // 1. Plugin Command Registration
    //=============================================================================
    PluginManager.registerCommand("Character_Creation", "startCreation", args => {
        const canCancel = args.canCancel === "true";
        
        let targetActorId = null;
        for (const id of CONFIG.PARTY_SLOTS) {
            const actor = $gameActors.actor(id);
            if (actor && actor.name() === CONFIG.PLACEHOLDER_NAME) {
                targetActorId = id;
                break;
            }
        }
        
        if (!targetActorId) {
            $gameMessage.add("Your party is full.");
            return;
        }

        SceneManager.push(Scene_BeadleCreate);
        SceneManager.prepareNextScene(targetActorId, canCancel);
    });

    //=============================================================================
    // 2. Custom Sprites & Windows
    //=============================================================================

    // --- Custom Animated Style Preview Sprite ---
    function Sprite_StylePreview() { this.initialize(...arguments); }
    Sprite_StylePreview.prototype = Object.create(Sprite.prototype);
    Sprite_StylePreview.prototype.constructor = Sprite_StylePreview;

    Sprite_StylePreview.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this._animationCount = 0;
        this._pattern = 0;
        this.anchor.x = 0.5;
        this.anchor.y = 1.0; 
    };

    Sprite_StylePreview.prototype.setCharacter = function(charName) {
        this._charName = charName;
        this.bitmap = ImageManager.loadCharacter(charName);
        this._animationCount = 0;
        this._pattern = 0;
        if (!this.bitmap.isReady()) {
            this.bitmap.addLoadListener(this.updateFrame.bind(this));
        } else {
            this.updateFrame();
        }
    };

    Sprite_StylePreview.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (!this.bitmap || !this.bitmap.isReady() || !this._charName) return;
        this._animationCount++;
        if (this._animationCount >= 15) {
            this._pattern = (this._pattern + 1) % 4;
            this._animationCount = 0;
            this.updateFrame();
        }
    };

    Sprite_StylePreview.prototype.updateFrame = function() {
        if (!this.bitmap || !this.bitmap.isReady()) return;
        const isBig = ImageManager.isBigCharacter(this._charName);
        const cw = this.bitmap.width / (isBig ? 3 : 12);
        const ch = this.bitmap.height / (isBig ? 4 : 8);
        const pat = [0, 1, 2, 1][this._pattern];
        const cx = pat * cw;
        const cy = 0; 
        this.setFrame(cx, cy, cw, ch);
    };

    // --- Class Select Window ---
    function Window_BeadleClass() { this.initialize(...arguments); }
    Window_BeadleClass.prototype = Object.create(Window_Command.prototype);
    Window_BeadleClass.prototype.constructor = Window_BeadleClass;

    Window_BeadleClass.prototype.initialize = function(rect) {
        this._randomStyles = {};
        CONFIG.CLASSES.forEach(c => {
            this._randomStyles[c.id] = Math.floor(Math.random() * 4) + 1;
        });
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_BeadleClass.prototype.itemHeight = function() { 
        return 72; 
    };

    Window_BeadleClass.prototype.makeCommandList = function() {
        CONFIG.CLASSES.forEach(c => this.addCommand(c.name, 'class', true, c));
    };

    Window_BeadleClass.prototype.setCursorRect = function(x, y, width, height) {
        Window_Command.prototype.setCursorRect.call(this, x + 8, y + 20, width - 8, height - 40);
    };

    Window_BeadleClass.prototype.drawItem = function(index) {
        const rect = this.itemRect(index); 
        const classData = this._list[index].ext;
        const styleNum = this._randomStyles[classData.id].toString().padStart(2, '0');
        const charName = "$" + classData.name.toLowerCase() + "_" + styleNum;
        const dbClass = $dataClasses[classData.id];
        
        const bitmap = ImageManager.loadCharacter(charName);
        if (!bitmap.isReady()) {
            bitmap.addLoadListener(() => this.refresh()); 
            return;
        }
        
        const charX = rect.x + 32;
        const textX = rect.x + 64; 
        const charY = rect.y + 60; 
        const textStartY = rect.y + 12; 
        
        this.drawCharacter(charName, 0, charX, charY);
        
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(classData.name.trim(), textX, textStartY, rect.width - textX);
        
        const description = dbClass.meta.MP_Help ? String(dbClass.meta.MP_Help).trim() : "";
        this.changeTextColor(ColorManager.textColor(16));
        this.drawText(description, textX, textStartY + this.lineHeight(), rect.width - textX);
        this.resetTextColor();
    };

    // --- Style Select Window ---
    function Window_BeadleStyle() { this.initialize(...arguments); }
    Window_BeadleStyle.prototype = Object.create(Window_Selectable.prototype);
    Window_BeadleStyle.prototype.constructor = Window_BeadleStyle;

    Window_BeadleStyle.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
    };

    Window_BeadleStyle.prototype.maxItems = function() { return 4; };
    Window_BeadleStyle.prototype.maxCols = function() { return 4; };
    Window_BeadleStyle.prototype.itemHeight = function() { return this.innerHeight; };
    Window_BeadleStyle.prototype.drawItem = function(index) {}; 

    // --- Label Window ---
    function Window_CreationLabel() { this.initialize(...arguments); }
    Window_CreationLabel.prototype = Object.create(Window_Base.prototype);
    Window_CreationLabel.prototype.constructor = Window_CreationLabel;

    Window_CreationLabel.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._text = "";
    };

    Window_CreationLabel.prototype.setText = function(text) {
        if (this._text !== text) {
            this._text = text;
            this.contents.clear();
            this.drawText(text, 0, 0, this.innerWidth, "center");
        }
    };

    // --- Confirm Command Window ---
    function Window_BeadleConfirm() { this.initialize(...arguments); }
    Window_BeadleConfirm.prototype = Object.create(Window_Command.prototype);
    Window_BeadleConfirm.prototype.constructor = Window_BeadleConfirm;

    Window_BeadleConfirm.prototype.initialize = function(rect) {
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_BeadleConfirm.prototype.makeCommandList = function() {
        this.addCommand("Yes", 'yes');
        this.addCommand("No", 'no');
    };

    Window_BeadleConfirm.prototype.itemTextAlign = function() {
        return 'center';
    };

    // --- Window_NameInput Compatibility Overrides ---
    if (Window_NameInput.LATIN1) Window_NameInput.LATIN1[88] = " ";
    if (Window_NameInput.LATIN2) Window_NameInput.LATIN2[88] = " ";
    
    Window_NameInput.prototype.processJump = function() {};
    Window_NameInput.prototype.processPagedown = function() {};
    Window_NameInput.prototype.processPageup = function() {};

    // --- Window_NameEdit Layout Overrides ---
    Window_NameEdit.prototype.left = function() {
        const totalWidth = this._maxLength * this.charWidth();
        return Math.floor((this.innerWidth - totalWidth) / 2);
    };

    Window_NameEdit.prototype.itemRect = function(index) {
        const x = this.left() + index * this.charWidth();
        const y = Math.floor((this.innerHeight - this.lineHeight()) / 2);
        const width = this.charWidth();
        const height = this.lineHeight();
        return new Rectangle(x, y, width, height);
    };

    Window_NameEdit.prototype.refresh = function() {
        this.contents.clear();
        for (let i = 0; i < this._maxLength; i++) {
            this.drawUnderline(i);
        }
        for (let j = 0; j < this._name.length; j++) {
            this.drawChar(j);
        }
        const rect = this.itemRect(this._index);
        this.setCursorRect(rect.x, rect.y, rect.width, rect.height);
    };

    Window_NameEdit.prototype.drawChar = function(index) {
        const rect = this.itemRect(index);
        this.resetTextColor();
        this.drawText(this._name[index] || "", rect.x, rect.y, rect.width, this.lineHeight(), "center");
    };

    //=============================================================================
    // 3. Main Scene: Scene_BeadleCreate
    //=============================================================================
    function Scene_BeadleCreate() { this.initialize(...arguments); }
    Scene_BeadleCreate.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_BeadleCreate.prototype.constructor = Scene_BeadleCreate;

    Scene_BeadleCreate.prototype.prepare = function(actorId, canCancel) {
        this._targetActorId = actorId;
        this._canCancel = canCancel;
        this._dummyActor = JsonEx.makeDeepCopy($gameActors.actor(actorId));
        
        this._dummyActor.setCharacterImage("", 0);
        this._dummyActor.setFaceImage("", 0);
        this._dummyActor.setBattlerImage("");
        
        this._chosenClassData = null;
        this._chosenStyleString = "01";
    };

    Scene_BeadleCreate.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createLabelWindow();
        this.createClassWindow();
        this.createStyleWindow();
        this.createNameWindows();
        this.createConfirmWindows();
        this.createLearnMoreSprite();
    };

    Scene_BeadleCreate.prototype.createLabelWindow = function() {
        this._labelWindow = new Window_CreationLabel(new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(1, false)));
        this.addWindow(this._labelWindow);
    };

    Scene_BeadleCreate.prototype.createClassWindow = function() {
        const wy = this._labelWindow.y + this._labelWindow.height;
        const wh = Graphics.boxHeight - wy;
        const ww = Graphics.boxWidth; 
        this._classWindow = new Window_BeadleClass(new Rectangle(0, wy, ww, wh));
        this._classWindow.setHandler('ok', this.onClassOk.bind(this));
        if (this._canCancel) this._classWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._classWindow);
    };

    Scene_BeadleCreate.prototype.createStyleWindow = function() {
        const wy = this._labelWindow.y + this._labelWindow.height;
        const ww = Graphics.boxWidth;
        const wh = 120;
        this._styleWindow = new Window_BeadleStyle(new Rectangle(0, wy, ww, wh));
        this._styleWindow.setHandler('ok', this.onStyleOk.bind(this));
        this._styleWindow.setHandler('cancel', this.onStyleCancel.bind(this));
        this._styleWindow.hide();
        this._styleWindow.deactivate();
        this.addWindow(this._styleWindow);
        
        this._styleSprites = [];
        for (let i = 0; i < 4; i++) {
            const sprite = new Sprite_StylePreview();
            sprite.hide();
            this.addChild(sprite);
            this._styleSprites.push(sprite);
        }
    };

    Scene_BeadleCreate.prototype.createNameWindows = function() {
        const labelH = this.calcWindowHeight(1, false);
        
        const padding = typeof $gameSystem !== "undefined" ? $gameSystem.windowPadding() : 12;
        const faceH = ImageManager.faceHeight || 144;
        const editH = faceH + (padding * 2); 
        
        this._nameEditWindow = new Window_NameEdit(new Rectangle(0, labelH, Graphics.boxWidth, editH));
        
        const inputY = labelH + editH;
        const inputH = Graphics.boxHeight - inputY; 
        this._nameInputWindow = new Window_NameInput(new Rectangle(0, inputY, Graphics.boxWidth, inputH));
        
        this._nameInputWindow.setEditWindow(this._nameEditWindow);
        this._nameInputWindow.setHandler('ok', this.onNameOk.bind(this));
        this._nameInputWindow.setHandler('cancel', this.onNameCancel.bind(this));
        
        this.addWindow(this._nameEditWindow);
        this.addWindow(this._nameInputWindow);

        this._nameEditWindow.hide();
        this._nameEditWindow.deactivate();
        this._nameInputWindow.hide();
        this._nameInputWindow.deactivate();
    };

    Scene_BeadleCreate.prototype.createConfirmWindows = function() {
        const statusW = 240; 
        this._statusWindow = new Window_Status(new Rectangle(0, 0, statusW, Graphics.boxHeight));
        this._statusWindow.hide();
        this._statusWindow.deactivate();
        this.addWindow(this._statusWindow);
        
        const rightPaneW = Graphics.boxWidth - statusW; 
        const ctaW = 280;
        const ctaX = statusW + Math.floor((rightPaneW - ctaW) / 2);
        
        const labelH = this.calcWindowHeight(1, false);
        const cmdH = this.calcWindowHeight(2, true);
        const startY = Math.floor((Graphics.boxHeight - (labelH + cmdH)) / 2);
        
        this._confirmLabel = new Window_CreationLabel(new Rectangle(ctaX, startY, ctaW, labelH));
        this._confirmLabel.setText("Do you choose this beadle?");
        this._confirmLabel.hide();
        this.addWindow(this._confirmLabel);

        this._confirmCommand = new Window_BeadleConfirm(new Rectangle(ctaX, startY + labelH, ctaW, cmdH));
        this._confirmCommand.setHandler('yes', this.onConfirmYes.bind(this));
        this._confirmCommand.setHandler('cancel', this.onConfirmNo.bind(this));
        this._confirmCommand.setHandler('no', this.onConfirmNo.bind(this));
        this._confirmCommand.hide();
        this._confirmCommand.deactivate();
        this.addWindow(this._confirmCommand);
    };

    Scene_BeadleCreate.prototype.createLearnMoreSprite = function() {
        this._learnMoreSprite = new Sprite();
        this._learnMoreSprite.x = 0;
        this._learnMoreSprite.y = 0;
        this._learnMoreSprite.hide();
        this.addChild(this._learnMoreSprite);
    };

    // --- Flow Logic ---
    Scene_BeadleCreate.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this.startClassSelect();
    };

    Scene_BeadleCreate.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        
        if (this._learnMoreSprite.visible) {
            if (Input.isTriggered('cancel') || Input.isTriggered('ok') || Input.isTriggered('shift') || TouchInput.isTriggered()) {
                SoundManager.playCancel();
                this._learnMoreSprite.hide();
                Input.clear(); 
                TouchInput.clear();
                this._classWindow.activate(); 
            }
            return;
        }

        if (this._classWindow.active && Input.isTriggered('shift')) {
            const classData = this._classWindow.currentExt();
            if (classData) {
                SoundManager.playCursor();
                const bmp = ImageManager.loadPicture("$guide-" + classData.name.toLowerCase());
                this._learnMoreSprite.bitmap = bmp;
                this._learnMoreSprite.show();
                this._classWindow.deactivate();
            }
        }
    };

    Scene_BeadleCreate.prototype.startClassSelect = function() {
        this._labelWindow.setText("Choose a beadle (Shift: Learn More)");
        this._labelWindow.show();
        this._classWindow.show();
        this._classWindow.activate();
        
        this._styleWindow.hide();
        this._styleWindow.deactivate();
        this._styleSprites.forEach(s => s.hide());
    };

    Scene_BeadleCreate.prototype.onClassOk = function() {
        Input.clear(); 
        this._chosenClassData = this._classWindow.currentExt();
        this._classWindow.hide();
        this._classWindow.deactivate();
        
        for (let i = 0; i < 4; i++) {
            const styleString = (i + 1).toString().padStart(2, '0');
            ImageManager.loadFace("PCs1_" + styleString);
        }
        
        this.startStyleSelect();
    };

    Scene_BeadleCreate.prototype.startStyleSelect = function() {
        this._labelWindow.setText("Choose a style");
        this._styleWindow.show();
        this._styleWindow.activate();
        
        const defaultStyleIndex = this._classWindow._randomStyles[this._chosenClassData.id] - 1;
        this._styleWindow.select(defaultStyleIndex);
        
        const spacing = Graphics.boxWidth / 4;
        for (let i = 0; i < 4; i++) {
            const styleString = (i + 1).toString().padStart(2, '0');
            const charName = "$" + this._chosenClassData.name.toLowerCase() + "_" + styleString;
            
            const sprite = this._styleSprites[i];
            sprite.setCharacter(charName);
            sprite.x = (spacing * i) + (spacing / 2);
            sprite.y = this._styleWindow.y + 80;
            sprite.show();
        }
    };

    Scene_BeadleCreate.prototype.onStyleOk = function() {
        Input.clear(); 
        this._chosenStyleString = (this._styleWindow.index() + 1).toString().padStart(2, '0');
        this._styleWindow.hide();
        this._styleWindow.deactivate();
        this._styleSprites.forEach(s => s.hide());
        this.startNameInput();
    };

    Scene_BeadleCreate.prototype.onStyleCancel = function() {
        this._styleWindow.hide();
        this._styleWindow.deactivate();
        this._styleSprites.forEach(s => s.hide());
        this.startClassSelect();
    };

    Scene_BeadleCreate.prototype.startNameInput = function() {
        this._labelWindow.setText("Name this beadle");
        this._labelWindow.show();
        
        const faceSheet = "PCs1_" + this._chosenStyleString;
        const charName = "$" + this._chosenClassData.name.toLowerCase() + "_" + this._chosenStyleString;
        
        this._dummyActor.setCharacterImage(charName, 0);
        this._dummyActor.setFaceImage(faceSheet, this._chosenClassData.faceIndex);
        this._dummyActor.setName(""); 
        
        this._nameEditWindow.setup(this._dummyActor, 12);
        this._nameEditWindow.refresh();
        
        this._nameEditWindow.show();
        this._nameInputWindow.show();
        this._nameInputWindow.activate();
        this._nameInputWindow.select(0);
    };

    Scene_BeadleCreate.prototype.onNameOk = function() {
        Input.clear(); 
        this._dummyActor.setName(this._nameEditWindow.name());
        this._nameEditWindow.hide();
        this._nameEditWindow.deactivate();
        this._nameInputWindow.hide();
        this._nameInputWindow.deactivate();
        this.startConfirm();
    };

    Scene_BeadleCreate.prototype.onNameCancel = function() {
        this._nameEditWindow.hide();
        this._nameEditWindow.deactivate();
        this._nameInputWindow.hide();
        this._nameInputWindow.deactivate();
        this.startStyleSelect();
    };

    Scene_BeadleCreate.prototype.startConfirm = function() {
        this._labelWindow.hide();
        this._dummyActor.changeClass(this._chosenClassData.id, false);
        this._dummyActor.recoverAll();
        
        this._statusWindow.setActor(this._dummyActor);
        this._statusWindow.refresh();
        this._statusWindow.show();
        
        this._confirmLabel.show();
        this._confirmCommand.show();
        this._confirmCommand.activate();
        this._confirmCommand.select(0);
    };

    Scene_BeadleCreate.prototype.onConfirmNo = function() {
        Input.clear();
        this._statusWindow.hide();
        this._confirmLabel.hide();
        this._confirmCommand.hide();
        this._confirmCommand.deactivate();
        this.startNameInput(); 
    };

    Scene_BeadleCreate.prototype.onConfirmYes = function() {
        this.executeCreation();
        this.popScene();
    };

    //=============================================================================
    // 4. Execution Logic
    //=============================================================================
    Scene_BeadleCreate.prototype.executeCreation = function() {
        const realActor = $gameActors.actor(this._targetActorId);
        
        let totalLevel = 0;
        let count = 0;
        CONFIG.PARTY_SLOTS.forEach(id => {
            const a = $gameActors.actor(id);
            if (a && a.name() !== CONFIG.PLACEHOLDER_NAME) {
                totalLevel += a.level;
                count++;
            }
        });
        const avgLevel = count > 0 ? Math.max(1, Math.floor(totalLevel / count)) : 1;

        realActor.setName(this._dummyActor.name());
        realActor.changeClass(this._chosenClassData.id, false);
        realActor.changeLevel(avgLevel, false);
        realActor.recoverAll();

        const charName = "$" + this._chosenClassData.name.toLowerCase() + "_" + this._chosenStyleString;
        const battlerName = "$" + this._chosenClassData.name.toLowerCase() + "_battle_" + this._chosenStyleString;
        const faceSheet = "PCs1_" + this._chosenStyleString;
        
        realActor.setCharacterImage(charName, 0);
        realActor.setBattlerImage(battlerName);
        realActor.setFaceImage(faceSheet, this._chosenClassData.faceIndex);

        const itemsToGrant = CONFIG.STARTING_ITEMS[this._chosenClassData.id];
        if (itemsToGrant) {
            itemsToGrant.forEach(data => {
                $gameParty.gainItem($dataItems[data.id], data.amount);
            });
        }
        
        $gameParty.addActor(this._targetActorId);
        
        // Forces an immediate global visual refresh. This fixes the MZ bug where 
        // the 1st placeholder's map/SV sprite wouldn't instantly update because 
        // they were already technically in the traveling party!
        $gamePlayer.refresh();
        $gameMap.requestRefresh();
    };

})();