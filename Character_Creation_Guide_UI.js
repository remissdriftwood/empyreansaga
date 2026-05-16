/*:
 * @target MZ
 * @plugindesc Phase 6 Addon: Dynamic Class Guide UI v3.5 (Linear Flow)
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

    const getNumberTag = (obj, tag, fallback) => {
        if (!obj || !obj.note) return fallback;
        const regex = new RegExp(`<${tag}:\\s*(\\d+)>`, "i");
        const match = obj.note.match(regex);
        return match ? parseInt(match[1]) : fallback;
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

        // 1. Portrait
        const faceName = "PCs1_01"; 
        const faceIndex = this._classData.id === 8 ? 7 : (this._classData.faceIndex || 0);
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

        // 2. Class Name
        this.contents.fontFace = $gameSystem.numberFontFace();
        this.contents.fontSize = 32;
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(this._classData.name.toUpperCase(), 0, dh + 4, this.innerWidth, "center");
        
        this.resetFontSettings();
        this.contents.fontSize = 16; 

        // 3. Description
        let desc = getMultilineTag($dataClasses[this._classData.id], "GuideDesc");
        
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
            const value = dbClass.params[param.id][1];
            this.drawFormattedStat(param.name, value, x, y);
        });

        // 5. Divider
        const divY = statY + lh * 4 + 8;
        this.contents.fillRect(16, divY, this.innerWidth - 32, 2, ColorManager.textColor(25));

        // 6. Equipment Block
        const equipY = divY + 12;

        let equipIcons = getListTag(dbClass, "GuideEquip");

        equipIcons = equipIcons.filter(id => !isNaN(id) && id > 0);

        if (equipIcons.length > 0) {
            const iconW = ImageManager.iconWidth || 32;
            const gap = 4;
            const totalWidth = (equipIcons.length * iconW) + ((equipIcons.length - 1) * gap);
            
            const startX = Math.floor((this.innerWidth - totalWidth) / 2);

            equipIcons.forEach((iconId, i) => {
                this.drawIcon(iconId, startX + (i * (iconW + gap)), equipY);
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
    // Window_GuideRight (MP System Only)
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
        const mpLines = mpDesc.split('\n');

        const titleHeight = lh;
        const padding1 = 16;
        const iconHeight = (ImageManager.iconHeight || 32) * 2; 
        const padding2 = 16;
        const descHeight = mpLines.length * lh;
        
        const totalHeight = titleHeight + padding1 + iconHeight + padding2 + descHeight;
        
        let currentY = Math.floor((this.innerHeight - totalHeight) / 2);

        // 1. Title
        this.contents.fontFace = $gameSystem.numberFontFace();
        this.drawText("MP RESTORATION", 0, currentY, this.innerWidth, "center");
        this.resetFontSettings();
        
        currentY += titleHeight + padding1;

        // 2. Class MP Icon (Dynamic per class via Notetag)
        const classIconId = this._classData.id === 8 ? 8 : getNumberTag(dbClass, "GuideIcon", 16); 
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
            
            let skillIds = dbClass.learnings ? dbClass.learnings.map(learning => learning.skillId) : [];
            skillIds = [...new Set(skillIds)].filter(id => !isNaN(id) && id > 0);
            
            let skills = skillIds.map(id => $dataSkills[id]).filter(s => s);
            
            // Apply exact Custom Sort Order
            skills.sort((a, b) => {
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
                return (a.id || 0) - (b.id || 0); 
            });
            
            this._data = skills;
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
        this.drawText("MIMIC SKILLS", 0, 16, this.innerWidth, "center");
        this.resetFontSettings();
        
        const block1 = "Transform into a monster to gain their skills,\ntraits, strengths and weaknesses.\nThe Mimic's stats will be influenced as well.".split('\n');
        for (let i = 0; i < block1.length; i++) {
            this.drawText(block1[i].trim(), 0, 16 + this.lineHeight() + (i * this.lineHeight()), this.innerWidth, "center");
        }

        const y2 = 16 + this.lineHeight() * 4;
        this.contents.fontFace = $gameSystem.numberFontFace();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText("FRIENDLY MIMICRY", 0, y2, this.innerWidth, "center");
        this.resetFontSettings();

        const block2 = "Some characters you meet outside of battle\nare happy to let you transform into them.".split('\n');
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

    // Correctly Aliased Update Loop
    const _Scene_BeadleCreate_update = window.Scene_BeadleCreate.prototype.update;
    window.Scene_BeadleCreate.prototype.update = function() {
        _Scene_BeadleCreate_update.call(this);
        
        if (this._guideState === 1) {
            // Grouping any progression input (Ok, Cancel, Shift, Directions, Touch) to advance to Page 2
            if (Input.isTriggered('cancel') || Input.isTriggered('shift') || Input.isTriggered('ok') || Input.isTriggered('down') || Input.isTriggered('right') || Input.isTriggered('up') || Input.isTriggered('left') || TouchInput.isTriggered()) {
                SoundManager.playCursor();
                this.showGuidePage2();
            }
            return;
        }

        if (this._guideState === 2) {
            // Escaping Page 2 (Ok and Cancel are bound natively in Window_SkillList, returning them here handles Shift and Mimic overrides)
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