/*:
 * @target MZ
 * @plugindesc Phase 6: Beadle Character Creation Flow v1.18 (Cleaned)
 * @author Custom Build
 * * @command startCreation
 * @text Start Beadle Creation
 * @desc Initiates the character creation sequence.
 * * @arg canCancel
 * @type boolean
 * @text Can Cancel?
 * @desc If true, the player can back out of the first menu to cancel creation.
 * @default true
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        PLACEHOLDER_NAME: "??????",
        PARTY_SLOTS: [1, 2, 3, 4],
        
        CLASSES: [
            { id: 1, name: "Fighter", faceIndex: 0 },
            { id: 2, name: "Cleric", faceIndex: 1 },
            { id: 3, name: "Martyr", faceIndex: 2 },
            { id: 4, name: "Farmer", faceIndex: 3 },
            { id: 5, name: "Chemist", faceIndex: 4 },
            { id: 6, name: "Cultivator", faceIndex: 6 }, 
            { id: 7, name: "Knight", faceIndex: 5 },
            { id: 8, name: "Mimic", faceIndex: 0 } 
        ],
        
        STARTING_ITEMS: {
            4: [{ id: 17, amount: 1 }] 
        },

        MIMIC_STARTING_ENEMIES: [2, 3, 4, 5] 
    };

    //=============================================================================
    // 1. Plugin Command Registration
    //=============================================================================
    PluginManager.registerCommand("Character_Creation", "startCreation", args => {
        // Default to true. Only disable if explicitly flagged as false.
        let canCancel = true;
        if (args.canCancel === "false" || args.canCancel === false) {
            canCancel = false;
        }
        
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

    function getMimicMeta(enemy, tag) {
        if (!enemy || !enemy.meta) return null;
        const key = Object.keys(enemy.meta).find(k => k.toLowerCase() === tag.toLowerCase());
        return key ? String(enemy.meta[key]) : null;
    }

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

    Sprite_StylePreview.prototype.setCharacter = function(charName, charIndex = 0) {
        this._charName = charName;
        this._characterIndex = charIndex;
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
        
        let cx = pat * cw;
        let cy = 0; 
        
        if (!isBig) {
            const index = this._characterIndex || 0;
            const sheetX = (index % 4) * 3;
            const sheetY = Math.floor(index / 4) * 4;
            cx = (sheetX + pat) * cw;
            cy = sheetY * ch; 
        }
        
        this.setFrame(cx, cy, cw, ch);
    };

    function Window_BeadleClass() { this.initialize(...arguments); }
    Window_BeadleClass.prototype = Object.create(Window_Command.prototype);
    Window_BeadleClass.prototype.constructor = Window_BeadleClass;

    Window_BeadleClass.prototype.initialize = function(rect) {
        this._randomStyles = {};
        CONFIG.CLASSES.forEach(c => {
            if (c.id === 8) {
                const enemies = CONFIG.MIMIC_STARTING_ENEMIES;
                this._randomStyles[c.id] = enemies[Math.floor(Math.random() * enemies.length)];
            } else {
                this._randomStyles[c.id] = Math.floor(Math.random() * 4) + 1;
            }
        });
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_BeadleClass.prototype.itemHeight = function() { return 72; };

    Window_BeadleClass.prototype.makeCommandList = function() {
        CONFIG.CLASSES.forEach(c => this.addCommand(c.name, 'class', true, c));
    };

    Window_BeadleClass.prototype.setCursorRect = function(x, y, width, height) {
        Window_Command.prototype.setCursorRect.call(this, x + 8, y + 20, width - 8, height - 40);
    };

    Window_BeadleClass.prototype.drawItem = function(index) {
        const rect = this.itemRect(index); 
        const classData = this._list[index].ext;
        let charName = "";
        let charIndex = 0;
        
        if (classData.id === 8) {
            const enemyId = this._randomStyles[classData.id];
            const enemy = $dataEnemies[enemyId];
            if (enemy) {
                const charTag = getMimicMeta(enemy, "Character");
                if (charTag) {
                    const parts = charTag.split(',');
                    charName = parts[0].trim();
                    charIndex = parseInt(parts[1]) || 0;
                } else {
                    charName = `$enemy_${enemy.name.replace(/\s+/g, '')}_01`;
                }
            }
        } else {
            const styleNum = this._randomStyles[classData.id].toString().padStart(2, '0');
            charName = "$" + classData.name.toLowerCase() + "_" + styleNum;
        }

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
        
        this.drawCharacter(charName, charIndex, charX, charY);

        this.contents.fontFace = $gameSystem.numberFontFace();
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(classData.name.trim(), textX, textStartY, rect.width - textX);
        
        this.resetFontSettings();
        
        const description = dbClass.meta.MP_Help ? String(dbClass.meta.MP_Help).trim() : "";
        this.changeTextColor(ColorManager.textColor(16));
        this.drawText(description, textX, textStartY + this.lineHeight(), rect.width - textX);
        this.resetTextColor();
    };

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

    function Window_BeadleConfirm() { this.initialize(...arguments); }
    Window_BeadleConfirm.prototype = Object.create(Window_Command.prototype);
    Window_BeadleConfirm.prototype.constructor = Window_BeadleConfirm;

    Window_BeadleConfirm.prototype.initialize = function(rect) { Window_Command.prototype.initialize.call(this, rect); };
    Window_BeadleConfirm.prototype.makeCommandList = function() { this.addCommand("Yes", 'yes'); this.addCommand("No", 'no'); };
    Window_BeadleConfirm.prototype.itemTextAlign = function() { return 'center'; };

    // OVERRIDE: Intercept the native backspace function. 
    // If empty, exit to previous screen. If not, delete character.
    Window_NameInput.prototype.processBack = function() {
        if (this._editWindow.name().length === 0) {
            SoundManager.playCancel();
            this.callHandler('cancel');
        } else {
            if (this._editWindow.back()) {
                SoundManager.playCancel();
            }
        }
    };

    // Override: Allow canceling out of the Name Input if the name is already empty
    const _Window_NameInput_processCancel = Window_NameInput.prototype.processCancel;
    Window_NameInput.prototype.processCancel = function() {
        if (this._editWindow.name().length === 0) {
            SoundManager.playCancel();
            this.callHandler('cancel');
        } else {
            _Window_NameInput_processCancel.call(this);
        }
    };

    Window_NameEdit.prototype.left = function() {
        const totalWidth = this._maxLength * this.charWidth();
        return Math.floor((this.innerWidth - totalWidth) / 2);
    };

    Window_NameEdit.prototype.itemRect = function(index) {
        const x = this.left() + index * this.charWidth();
        const y = Math.floor((this.innerHeight - this.lineHeight()) / 2);
        return new Rectangle(x, y, this.charWidth(), this.lineHeight());
    };

    Window_NameEdit.prototype.refresh = function() {
        this.contents.clear();
        for (let i = 0; i < this._maxLength; i++) this.drawUnderline(i);
        for (let j = 0; j < this._name.length; j++) this.drawChar(j);
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
    window.Scene_BeadleCreate = Scene_BeadleCreate; // <--- Exposes it to the Addon

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
    };

    Scene_BeadleCreate.prototype.createLabelWindow = function() {
        this._labelWindow = new Window_CreationLabel(new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(1, false)));
        this.addWindow(this._labelWindow);
    };

    Scene_BeadleCreate.prototype.createClassWindow = function() {
        const wy = this._labelWindow.y + this._labelWindow.height;
        const wh = Graphics.boxHeight - wy;
        this._classWindow = new Window_BeadleClass(new Rectangle(0, wy, Graphics.boxWidth, wh));
        this._classWindow.setHandler('ok', this.onClassOk.bind(this));
        if (this._canCancel) this._classWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._classWindow);
    };

    Scene_BeadleCreate.prototype.createStyleWindow = function() {
        const wy = this._labelWindow.y + this._labelWindow.height;
        this._styleWindow = new Window_BeadleStyle(new Rectangle(0, wy, Graphics.boxWidth, 120));
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
        const editH = (ImageManager.faceHeight || 144) + ((typeof $gameSystem !== "undefined" ? $gameSystem.windowPadding() : 12) * 2); 
        this._nameEditWindow = new Window_NameEdit(new Rectangle(0, labelH, Graphics.boxWidth, editH));
        
        const inputY = labelH + editH;
        this._nameInputWindow = new Window_NameInput(new Rectangle(0, inputY, Graphics.boxWidth, Graphics.boxHeight - inputY));
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

    Scene_BeadleCreate.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this.startClassSelect();
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
        
        if (this._chosenClassData.id !== 8) {
            for (let i = 0; i < 4; i++) ImageManager.loadFace("PCs1_" + (i + 1).toString().padStart(2, '0'));
        } else {
            for (let i = 0; i < 4; i++) {
                const enemyId = CONFIG.MIMIC_STARTING_ENEMIES[i];
                const enemy = $dataEnemies[enemyId];
                if (enemy) {
                    let faceSheet = `$enemy_${enemy.name.replace(/\s+/g, '')}_face`;
                    const faceTag = getMimicMeta(enemy, "Face");
                    if (faceTag) faceSheet = faceTag.split(',')[0].trim();
                    ImageManager.loadFace(faceSheet);
                }
            }
        }
        this.startStyleSelect();
    };

    Scene_BeadleCreate.prototype.startStyleSelect = function() {
        this._labelWindow.setText(this._chosenClassData.id === 8 ? "Choose a starting form" : "Choose a style");
        this._styleWindow.show();
        this._styleWindow.activate();
        
        let defaultStyleIndex = 0;
        if (this._chosenClassData.id === 8) {
            defaultStyleIndex = CONFIG.MIMIC_STARTING_ENEMIES.indexOf(this._classWindow._randomStyles[8]);
            if (defaultStyleIndex < 0) defaultStyleIndex = 0;
        } else {
            defaultStyleIndex = this._classWindow._randomStyles[this._chosenClassData.id] - 1;
        }
        this._styleWindow.select(defaultStyleIndex);
        
        const spacing = Graphics.boxWidth / 4;
        for (let i = 0; i < 4; i++) {
            let charName = "";
            let charIndex = 0;
            
            if (this._chosenClassData.id === 8) {
                const enemyId = CONFIG.MIMIC_STARTING_ENEMIES[i];
                const enemy = $dataEnemies[enemyId];
                if (enemy) {
                    const charTag = getMimicMeta(enemy, "Character");
                    if (charTag) {
                        const parts = charTag.split(',');
                        charName = parts[0].trim();
                        charIndex = parseInt(parts[1]) || 0;
                    } else {
                        charName = `$enemy_${enemy.name.replace(/\s+/g, '')}_01`;
                    }
                }
            } else {
                const styleString = (i + 1).toString().padStart(2, '0');
                charName = "$" + this._chosenClassData.name.toLowerCase() + "_" + styleString;
            }
            
            const sprite = this._styleSprites[i];
            sprite.setCharacter(charName, charIndex);
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
        
        if (this._chosenClassData.id === 8) {
            const styleIndex = parseInt(this._chosenStyleString) - 1;
            const enemyId = CONFIG.MIMIC_STARTING_ENEMIES[styleIndex];
            const enemy = $dataEnemies[enemyId];
            
            let faceSheet = `$enemy_${enemy.name.replace(/\s+/g, '')}_face`;
            let faceIndex = 0;
            const faceTag = getMimicMeta(enemy, "Face");
            if (faceTag) {
                const parts = faceTag.split(',');
                faceSheet = parts[0].trim();
                faceIndex = parseInt(parts[1]) || 0;
            }
            
            let charName = `$enemy_${enemy.name.replace(/\s+/g, '')}_01`;
            let charIndex = 0;
            const charTag = getMimicMeta(enemy, "Character");
            if (charTag) {
                const parts = charTag.split(',');
                charName = parts[0].trim();
                charIndex = parseInt(parts[1]) || 0;
            }

            let battlerName = `$enemy_${enemy.name.replace(/\s+/g, '')}_battle_01`;
            const battlerTag = getMimicMeta(enemy, "Battler");
            if (battlerTag) {
                battlerName = battlerTag.trim();
            }
            
            this._dummyActor.setCharacterImage(charName, charIndex);
            this._dummyActor.setFaceImage(faceSheet, faceIndex);
            this._dummyActor.setBattlerImage(battlerName);
            
            if (typeof this._dummyActor.transformIntoMimic === 'function') {
                this._dummyActor._classId = 8;
                this._dummyActor.transformIntoMimic(enemyId);
            }
            
        } else {
            const faceSheet = "PCs1_" + this._chosenStyleString;
            const charName = "$" + this._chosenClassData.name.toLowerCase() + "_" + this._chosenStyleString;
            const battlerName = "$" + this._chosenClassData.name.toLowerCase() + "_battle_" + this._chosenStyleString;
            
            this._dummyActor.setCharacterImage(charName, 0);
            this._dummyActor.setFaceImage(faceSheet, this._chosenClassData.faceIndex);
            this._dummyActor.setBattlerImage(battlerName);
        }
        
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
        if (this._chosenClassData.id !== 8) {
            this._dummyActor.changeClass(this._chosenClassData.id, false);
            this._dummyActor.recoverAll();
        }
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

        if (this._chosenClassData.id === 8) {
            const styleIndex = parseInt(this._chosenStyleString) - 1;
            const enemyId = CONFIG.MIMIC_STARTING_ENEMIES[styleIndex];
            const enemy = $dataEnemies[enemyId];
            
            if (typeof realActor.transformIntoMimic === 'function') {
                realActor.transformIntoMimic(enemyId);
            }
            
            let faceSheet = `$enemy_${enemy.name.replace(/\s+/g, '')}_face`;
            let faceIndex = 0;
            const faceTag = getMimicMeta(enemy, "Face");
            if (faceTag) {
                const parts = faceTag.split(',');
                faceSheet = parts[0].trim();
                faceIndex = parseInt(parts[1]) || 0;
            }
            
            let charName = `$enemy_${enemy.name.replace(/\s+/g, '')}_01`;
            let charIndex = 0;
            const charTag = getMimicMeta(enemy, "Character");
            if (charTag) {
                const parts = charTag.split(',');
                charName = parts[0].trim();
                charIndex = parseInt(parts[1]) || 0;
            }

            let battlerName = `$enemy_${enemy.name.replace(/\s+/g, '')}_battle_01`;
            const battlerTag = getMimicMeta(enemy, "Battler");
            if (battlerTag) {
                battlerName = battlerTag.trim();
            }

            realActor.setCharacterImage(charName, charIndex);
            realActor.setFaceImage(faceSheet, faceIndex);
            realActor.setBattlerImage(battlerName);

        } else {
            const charName = "$" + this._chosenClassData.name.toLowerCase() + "_" + this._chosenStyleString;
            const battlerName = "$" + this._chosenClassData.name.toLowerCase() + "_battle_" + this._chosenStyleString;
            const faceSheet = "PCs1_" + this._chosenStyleString;
            
            realActor.setCharacterImage(charName, 0);
            realActor.setBattlerImage(battlerName);
            realActor.setFaceImage(faceSheet, this._chosenClassData.faceIndex);
        }

        const itemsToGrant = CONFIG.STARTING_ITEMS[this._chosenClassData.id];
        if (itemsToGrant) {
            itemsToGrant.forEach(data => {
                $gameParty.gainItem($dataItems[data.id], data.amount);
            });
        }
        
        $gameParty.addActor(this._targetActorId);
        $gamePlayer.refresh();
        $gameMap.requestRefresh();
    };

})();