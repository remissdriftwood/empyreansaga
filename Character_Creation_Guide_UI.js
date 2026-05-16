/*:
 * @target MZ
 * @plugindesc Phase 6 Addon: Dynamic Class Guide UI v2.8
 * @author Custom Build
 */

(() => {
    'use strict';

    //=============================================================================
    // Utility for fetching multiline notetags
    //=============================================================================
    const getMultilineTag = (obj, tag) => {
        if (!obj || !obj.note) return "";
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
        const match = obj.note.match(regex);
        return match ? match[1].trim() : "";
    };

    const getListTag = (obj, tag) => {
        if (!obj || !obj.note) return [];
        const regex = new RegExp(`<${tag}:\\s*([^>]+)>`, "i");
        const match = obj.note.match(regex);
        return match ? match[1].split(',').map(n => parseInt(n.trim())) : [];
    };

    //=============================================================================
    // Window_GuideLeft (Portrait, Name, Description, Stats, Equipment)
    //=============================================================================
    function Window_GuideLeft() { this.initialize(...arguments); }
    Window_GuideLeft.prototype = Object.create(Window_Base.prototype);
    Window_GuideLeft.prototype.constructor = Window_GuideLeft;

    Window_GuideLeft.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.frameVisible = true;
        this.opacity = 255;
    };

    Window_GuideLeft.prototype.drawBackgroundRect = function() {};

    Window_GuideLeft.prototype.setup = function(classData) {
        this._classData = classData;
        this.refresh();
    };

    Window_GuideLeft.prototype.refresh = function() {
        this.contents.clear();
        if (!this._classData) return;

        const iconBmp = ImageManager.loadSystem("IconSet");
        if (!iconBmp.isReady()) {
            iconBmp.addLoadListener(this.refresh.bind(this));
            return;
        }

        const lh = this.lineHeight();
        const center = Math.floor(this.innerWidth / 2);

        // 1. Portrait (Scaled 2x with pixel-perfect nearest neighbor rendering)
        const faceName = "PCs1_01"; 
        const faceIndex = this._classData.id === 8 ? 0 : (this._classData.faceIndex || 0);
        const bmp = ImageManager.loadFace(faceName);
        if (!bmp.isReady()) {
            bmp.addLoadListener(this.refresh.bind(this));
            return;
        }
        
        const sw = ImageManager.faceWidth;
        const sh = ImageManager.faceHeight;
        const sx = (faceIndex % 4) * sw;
        const sy = Math.floor(faceIndex / 4) * sh;
        
        const dw = sw * 2;
        const dh = sh * 2;
        const dx = center - (dw / 2);
        
        const ctx = this.contents.context;
        const oldSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        this.contents.blt(bmp, sx, sy, sw, sh, dx, 0, dw, dh);
        ctx.imageSmoothingEnabled = oldSmoothing;

        // 2. Class Name (32px font)
        this.contents.fontFace = $gameSystem.numberFontFace();
        this.contents.fontSize = 32;
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(this._classData.name.toUpperCase(), 0, dh + 4, this.innerWidth, "center");
        
        this.resetFontSettings();
        this.contents.fontSize = 16; 

        // 3. Description (16px, Centered)
        let desc = getMultilineTag($dataClasses[this._classData.id], "GuideDesc");
        if (this._classData.id === 8) desc = "A bizarre entity that perfectly mimics the shape,\nstats, and skills of fallen foes.\nEquipment slots are permanently sealed.";
        
        let currentY = dh + 40; 
        const descLines = desc.split('\n');
        for (let i = 0; i < descLines.length; i++) {
            this.drawText(descLines[i].trim(), 0, currentY + (i * lh), this.innerWidth, "center");
        }

        // 4. Stats Block 
        const descLinesCount = descLines.length;
        const statY = currentY + (lh * descLinesCount) + 16;
        const col1X = 16;
        const col2X = center + 16;
        
        const dbClass = $dataClasses[this._classData.id];
        const params = [
            { id: 0, name: "MHP" }, { id: 1, name: "MMP" },
            { id: 2, name: "ATK" }, { id: 3, name: "DEF" },
            { id: 4, name: "MAT" }, { id: 5, name: "MDF" },
            { id: 6, name: "AGI" }, { id: 7, name: "LUK" }
        ];

        params.forEach((param, i) => {
            const x = (i % 2 === 0) ? col1X : col2X;
            const y = statY + Math.floor(i / 2) * lh;
            const value = this._classData.id === 8 ? 0 : dbClass.params[param.id][1];
            this.drawFormattedStat(param.name, value, x, y);
        });

        // 5. Divider
        const divY = statY + lh * 4 + 8;
        this.contents.fillRect(16, divY, this.innerWidth - 32, 2, ColorManager.textColor(25));

        // 6. Equipment Block (Left-Aligned to match stats)
        const equipY = divY + 12;

        let equipIcons = getListTag(dbClass, "GuideEquip");
        if (this._classData.id === 8) equipIcons = [];

        // Filter invalid tags
        equipIcons = equipIcons.filter(id => !isNaN(id) && id > 0);

        if (equipIcons.length > 0) {
            const startX = 16; // Anchored to col1X
            const iconSpacing = 36; // 32px icon + 4px gap

            equipIcons.forEach((iconId, i) => {
                this.drawIcon(iconId, startX + (i * iconSpacing), equipY);
            });
        }
    };

    Window_GuideLeft.prototype.drawFormattedStat = function(name, value, x, y) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(name, x, y, 40);

        const valStr = value.toString().padStart(3, '0');
        this.contents.fontFace = $gameSystem.numberFontFace();
        
        let currentX = x + 44;
        let foundSignificant = false;
        
        for (let i = 0; i < valStr.length; i++) {
            const char = valStr[i];
            if (char !== '0') foundSignificant = true;
            
            if (char === '0' && !foundSignificant) {
                this.changeTextColor(ColorManager.textColor(25)); 
            } else {
                this.changeTextColor(ColorManager.systemColor()); 
            }
            
            const charWidth = this.textWidth(char);
            this.drawText(char, currentX, y, charWidth);
            currentX += charWidth;
        }
        this.resetFontSettings();
    };

    //=============================================================================
    // Window_GuideRight (MP System Only - Dynamically Centered)
    //=============================================================================
    function Window_GuideRight() { this.initialize(...arguments); }
    Window_GuideRight.prototype = Object.create(Window_Base.prototype);
    Window_GuideRight.prototype.constructor = Window_GuideRight;

    Window_GuideRight.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.frameVisible = true;
        this.opacity = 255;
    };

    Window_GuideRight.prototype.drawBackgroundRect = function(rect) {
        this.contentsBack.fillRect(0, 0, this.width, this.height, ColorManager.textColor(25));
    };

    Window_GuideRight.prototype.setup = function(classData) {
        this._classData = classData;
        this.refresh();
    };

    Window_GuideRight.prototype.refresh = function() {
        this.contents.clear();
        this.drawBackgroundRect();
        if (!this._classData) return;

        const iconBmp = ImageManager.loadSystem("IconSet");
        if (!iconBmp.isReady()) {
            iconBmp.addLoadListener(this.refresh.bind(this));
            return;
        }

        const lh = this.lineHeight();
        const center = Math.floor(this.innerWidth / 2);
        const dbClass = $dataClasses[this._classData.id];

        let mpDesc = getMultilineTag(dbClass, "GuideMP");
        if (this._classData.id === 8) mpDesc = "Maximum MP is determined entirely by the\noriginal stats of the mimicked monster.";
        const mpLines = mpDesc.split('\n');

        const titleHeight = lh;
        const padding1 = 16;
        const iconHeight = (ImageManager.iconHeight || 32) * 2; 
        const padding2 = 16;
        const descHeight = mpLines.length * lh;
        
        const totalHeight = titleHeight + padding1 + iconHeight + padding2 + descHeight;
        
        // Math.floor forces integer coordinates to prevent HTML5 canvas tearing/smearing
        let currentY = Math.floor((this.innerHeight - totalHeight) / 2);

        // 1. Title
        this.contents.fontFace = $gameSystem.numberFontFace();
        this.drawText("MP RESTORATION", 0, currentY, this.innerWidth, "center");
        this.resetFontSettings();
        
        currentY += titleHeight + padding1;

        // 2. Class MP Icon
        const classIconId = this._classData.id === 8 ? 1 : 16; 
        const pw = ImageManager.iconWidth || 32;
        const ph = ImageManager.iconHeight || 32;
        const sx = (classIconId % 16) * pw;
        const sy = Math.floor(classIconId / 16) * ph;
        
        const ctx = this.contents.context;
        const oldSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        this.contents.blt(iconBmp, sx, sy, pw, ph, center - pw, currentY, pw * 2, ph * 2);
        ctx.imageSmoothingEnabled = oldSmoothing;

        currentY += iconHeight + padding2;

        // 3. MP Description
        for (let i = 0; i < mpLines.length; i++) {
            this.drawText(mpLines[i].trim(), 0, currentY + (i * lh), this.innerWidth, "center");
        }
    };

    //=============================================================================
    // Window_GuideSkillList (Page 2 Interactive Skills)
    //=============================================================================
    function Window_GuideSkillList() { this.initialize(...arguments); }
    Window_GuideSkillList.prototype = Object.create(Window_SkillList.prototype);
    Window_GuideSkillList.prototype.constructor = Window_GuideSkillList;

    Window_GuideSkillList.prototype.initialize = function(rect) {
        Window_SkillList.prototype.initialize.call(this, rect);
        this.frameVisible = true;
        this.opacity = 255;
    };

    Window_GuideSkillList.prototype.setup = function(classData) {
        this._classData = classData;
        this.refresh();
        this.select(0);
    };

    Window_GuideSkillList.prototype.makeItemList = function() {
        this._data = [];
        if (this._classData) {
            const dbClass = $dataClasses[this._classData.id];
            let skillIds = getListTag(dbClass, "GuideSkills");
            skillIds = skillIds.filter(id => !isNaN(id) && id > 0);
            this._data = skillIds.map(id => $dataSkills[id]).filter(s => s);
        }
    };

    Window_GuideSkillList.prototype.isCurrentItemEnabled = function() {
        return true; 
    };
    
    Window_GuideSkillList.prototype.drawItem = function(index) {
        const skill = this.itemAt(index);
        if (skill) {
            const costWidth = this.textWidth("000");
            const rect = this.itemLineRect(index);
            
            this.changePaintOpacity(true);
            this.drawItemName(skill, rect.x, rect.y, rect.width - costWidth);
            
            if (skill.tpCost > 0) {
                this.changeTextColor(ColorManager.tpCostColor());
                this.drawText(skill.tpCost, rect.x, rect.y, rect.width, "right");
            } else if (skill.mpCost > 0) {
                this.changeTextColor(ColorManager.mpCostColor());
                this.drawText(skill.mpCost, rect.x, rect.y, rect.width, "right");
            }
            
            this.changePaintOpacity(1);
        }
    };

    //=============================================================================
    // Window_GuideMimicBox (Page 2 Static Mimic Data)
    //=============================================================================
    function Window_GuideMimicBox() { this.initialize(...arguments); }
    Window_GuideMimicBox.prototype = Object.create(Window_Base.prototype);
    Window_GuideMimicBox.prototype.constructor = Window_GuideMimicBox;

    Window_GuideMimicBox.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.frameVisible = true;
        this.opacity = 255;
    };

    Window_GuideMimicBox.prototype.refresh = function() {
        this.contents.clear();
        
        this.contents.fontFace = $gameSystem.numberFontFace();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText("ADAPTIVE ARSENAL", 0, 16, this.innerWidth, "center");
        this.resetFontSettings();
        
        const block1 = "Skill selection is dynamically inherited from the copied monster.\nYou gain access to their exact combat logic.".split('\n');
        for (let i = 0; i < block1.length; i++) {
            this.drawText(block1[i].trim(), 0, 16 + this.lineHeight() + (i * this.lineHeight()), this.innerWidth, "center");
        }

        const y2 = 16 + this.lineHeight() * 4;
        this.contents.fontFace = $gameSystem.numberFontFace();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText("UNDEAD ASSIMILATION", 0, y2, this.innerWidth, "center");
        this.resetFontSettings();

        const block2 = "Innate traits and elemental weaknesses are carried over seamlessly.".split('\n');
        for (let i = 0; i < block2.length; i++) {
            this.drawText(block2[i].trim(), 0, y2 + this.lineHeight() + (i * this.lineHeight()), this.innerWidth, "center");
        }
    };

    //=============================================================================
    // Injecting into Scene_BeadleCreate
    //=============================================================================
    const _Scene_BeadleCreate_create = window.Scene_BeadleCreate.prototype.create;
    window.Scene_BeadleCreate.prototype.create = function() {
        _Scene_BeadleCreate_create.call(this);

        this._guideState = 0; 

        const startY = this.calcWindowHeight(1, false);
        const winHeight = Graphics.boxHeight - startY; 
        const winWidth = 272; 

        // Page 1 Windows
        this._guideLeftWindow = new Window_GuideLeft(new Rectangle(0, startY, winWidth, winHeight));
        this._guideLeftWindow.hide();
        this.addWindow(this._guideLeftWindow);

        this._guideRightWindow = new Window_GuideRight(new Rectangle(winWidth, startY, winWidth, winHeight));
        this._guideRightWindow.hide();
        this.addWindow(this._guideRightWindow);

        // Page 2 Windows
        const helpHeight = this.calcWindowHeight(2, false);
        this._guideHelpWindow = new Window_Help(new Rectangle(0, startY, Graphics.boxWidth, helpHeight));
        this._guideHelpWindow.hide();
        this.addWindow(this._guideHelpWindow);

        const listRect = new Rectangle(0, startY + helpHeight, Graphics.boxWidth, winHeight - helpHeight);
        
        this._guideSkillListWindow = new Window_GuideSkillList(listRect);
        this._guideSkillListWindow.setHelpWindow(this._guideHelpWindow);
        this._guideSkillListWindow.setHandler('ok', this.closeGuide.bind(this));
        this._guideSkillListWindow.setHandler('cancel', this.closeGuide.bind(this));
        this._guideSkillListWindow.hide();
        this._guideSkillListWindow.deactivate();
        this.addWindow(this._guideSkillListWindow);

        this._guideMimicBoxWindow = new Window_GuideMimicBox(listRect);
        this._guideMimicBoxWindow.hide();
        this.addWindow(this._guideMimicBoxWindow);
    };

    const _Scene_BeadleCreate_startClassSelect = window.Scene_BeadleCreate.prototype.startClassSelect;
    window.Scene_BeadleCreate.prototype.startClassSelect = function() {
        _Scene_BeadleCreate_startClassSelect.call(this);
        this._labelWindow.setText("Choose a beadle (Shift: learn more)");
    };

    window.Scene_BeadleCreate.prototype.showGuidePage1 = function() {
        const classData = this._classWindow.currentExt();
        if (!classData) return;

        this._guideState = 1;
        this._guideLeftWindow.setup(classData);
        this._guideRightWindow.setup(classData);
        
        this._guideLeftWindow.show();
        this._guideRightWindow.show();
        
        this._guideHelpWindow.hide();
        this._guideSkillListWindow.hide();
        this._guideSkillListWindow.deactivate();
        this._guideMimicBoxWindow.hide();
        
        this._labelWindow.setText("Learn more"); 
        this._classWindow.deactivate();
    };

    window.Scene_BeadleCreate.prototype.showGuidePage2 = function() {
        const classData = this._classWindow.currentExt();
        if (!classData) return;

        this._guideState = 2;
        this._guideLeftWindow.hide();
        this._guideRightWindow.hide();
        
        if (classData.id === 8) { 
            this._guideMimicBoxWindow.refresh();
            this._guideMimicBoxWindow.show();
        } else { 
            this._guideHelpWindow.show();
            this._guideSkillListWindow.setup(classData);
            this._guideSkillListWindow.show();
            this._guideSkillListWindow.activate();
        }
    };

    window.Scene_BeadleCreate.prototype.closeGuide = function() {
        this._guideState = 0;
        this._guideLeftWindow.hide();
        this._guideRightWindow.hide();
        this._guideHelpWindow.hide();
        this._guideSkillListWindow.hide();
        this._guideSkillListWindow.deactivate();
        this._guideMimicBoxWindow.hide();
        
        this._labelWindow.setText("Choose a beadle (Shift: learn more)"); 
        this._classWindow.activate();
        Input.clear();
        TouchInput.clear();
    };

    const _Scene_BeadleCreate_update = window.Scene_BeadleCreate.prototype.update;
    window.Scene_BeadleCreate.prototype.update = function() {
        _Scene_BeadleCreate_update.call(this);
        
        if (this._guideState === 1) {
            if (Input.isTriggered('cancel') || Input.isTriggered('shift')) {
                SoundManager.playCancel();
                this.closeGuide();
            } else if (Input.isTriggered('ok') || Input.isTriggered('down') || Input.isTriggered('right') || Input.isTriggered('up') || Input.isTriggered('left') || TouchInput.isTriggered()) {
                SoundManager.playCursor();
                this.showGuidePage2();
            }
            return;
        }

        if (this._guideState === 2) {
            if (Input.isTriggered('shift') || (this._guideMimicBoxWindow.visible && (Input.isTriggered('cancel') || Input.isTriggered('ok') || TouchInput.isTriggered()))) {
                SoundManager.playCancel();
                this.closeGuide();
            }
            return;
        }

        if (this._classWindow.active && Input.isTriggered('shift')) {
            SoundManager.playCursor();
            Input.clear(); 
            TouchInput.clear();
            this.showGuidePage1();
        }
    };

})();