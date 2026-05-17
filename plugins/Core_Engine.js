/*:
 * @target MZ
 * @plugindesc Phase 1: Core Engine UI & Environment overrides (Consolidated) v1.28.
 * @author Custom Build
 * * @help
 * Replaces:
 * - Basic Window Resizer / Custom Resolution Menu (With Boot Lock & Auto-Center)
 * - Fonts & Colors (Index 9 Normal, Index 16 System, Subpixel Snapping, Nuclear Option)
 * - Solid Window BG (Disabled System Tinting, Transparent Item BGs)
 * - Map Name Single Gradient
 * - Show Max MP / HP modifications (Gauge Kill, Perfect Y-Alignment)
 * - Menu Cursor (Active-Only, True Z-Index Overlay Fix, Padding-Safe Offset)
 * - Formation Selection (Pending Color Mapped to Index 25)
 * - Portrait Padding Fix (Forced 32x32 Face Grid, Balanced L/R Padding)
 * - Equip Layout (Perfect Overlay Rects, 96px Param Widths, 220px Status Panel, X=0 Anchor)
 * - Status Layout (No Description Window, Scroll Kill, X=0 Anchor, Right-Flush Stats)
 * - Skill Layout (Type Bypass, Full-Width Banner, Horizontal Vitals, All Skills)
 * - Dynamic Window Resizer (Base Hook)
 */

(() => {
    'use strict';

    //=============================================================================
    // 1. Retro Pixel Rendering Enforcement & CSS Font Smoothing Override
    //=============================================================================
    
    const css = `
        canvas {
            -webkit-font-smoothing: none !important;
            -moz-osx-font-smoothing: grayscale !important;
            font-smooth: never !important;
        }
        * {
            -webkit-font-smoothing: none !important;
            font-smooth: never !important;
        }
    `;
    const style = document.createElement('style');
    style.innerHTML = css;
    document.head.appendChild(style);

    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
    if (PIXI.BaseTexture && PIXI.BaseTexture.defaultOptions) {
        PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
    }

    const _Graphics_updateAllElements = Graphics._updateAllElements;
    Graphics._updateAllElements = function() {
        _Graphics_updateAllElements.call(this);
        if (this._canvas) {
            this._canvas.style.imageRendering = 'pixelated';
        }
    };

    //=============================================================================
    // 2. Fonts & Colors (Size 16, User Palette Map, Subpixel Snapping)
    //=============================================================================
    
    Graphics.defaultFontFamily = "Emulogic, VL Gothic Regular, VL PGothic Regular, sans-serif";

    Game_System.prototype.mainFontSize = function() { return 16; };
    Window_Base.prototype.lineHeight = function() { return 24; };

    const _Window_Base_resetFontSettings = Window_Base.prototype.resetFontSettings;
    Window_Base.prototype.resetFontSettings = function() {
        _Window_Base_resetFontSettings.call(this);
        this.contents.fontBold = false; 
    };

    Bitmap.prototype._drawTextOutline = function(text, tx, ty, maxWidth) {};
    Bitmap.prototype._drawTextShadow = function(text, tx, ty, maxWidth) {};

    const _Bitmap_drawText = Bitmap.prototype.drawText;
    Bitmap.prototype.drawText = function(text, x, y, maxWidth, lineHeight, align) {
        if (text === undefined || text === null) return;
        
        let drawX = x;
        let drawY = Math.round(y);
        let drawAlign = align || "left";
        
        if (drawAlign === "center" || drawAlign === "right") {
            const textWidth = this.measureTextWidth(text);
            if (drawAlign === "center") {
                drawX = x + (maxWidth - textWidth) / 2;
            } else {
                drawX = x + maxWidth - textWidth;
            }
            drawAlign = "left"; 
        }
        
        drawX = Math.round(drawX);

        _Bitmap_drawText.call(this, text, drawX, drawY, maxWidth, lineHeight, drawAlign);
        
        if (text !== '' && this.context) {
            const ctx = this.context;
            const startY = Math.max(0, Math.floor(y));
            const boxH = Math.min(lineHeight + 4, this.height - startY);
            
            if (boxH > 0) {
                const imgData = ctx.getImageData(0, startY, this.width, boxH);
                const data = imgData.data;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] > 0 && data[i] < 255) {
                        data[i] = data[i] > 127 ? 255 : 0; 
                    }
                }
                ctx.putImageData(imgData, 0, startY);
                this._baseTexture.update();
            }
        }
    };

    ColorManager.normalColor = function() { return this.textColor(9); };
    ColorManager.systemColor = function() { return this.textColor(16); };
    ColorManager.crisisColor = function() { return this.textColor(16); };
    ColorManager.deathColor  = function() { return this.textColor(25); };
    ColorManager.pendingColor = function() { return this.textColor(25); };
    ColorManager.hpGaugeColor1 = function() { return this.textColor(0); };
    ColorManager.hpGaugeColor2 = function() { return this.textColor(0); };
    ColorManager.mpGaugeColor1 = function() { return this.textColor(0); };
    ColorManager.mpGaugeColor2 = function() { return this.textColor(0); };
    ColorManager.tpGaugeColor1 = function() { return this.textColor(0); };
    ColorManager.tpGaugeColor2 = function() { return this.textColor(0); };
    ColorManager.gaugeBackColor = function() { return this.textColor(0); };
    ColorManager.powerUpColor = function() { return this.textColor(24); }; 
    ColorManager.powerDownColor = function() { return this.textColor(25); }; 

    const _Scene_Title_drawGameTitle = Scene_Title.prototype.drawGameTitle;
    Scene_Title.prototype.drawGameTitle = function() {
        this._gameTitleSprite.bitmap.textColor = ColorManager.normalColor();
        _Scene_Title_drawGameTitle.call(this);
    };

    //=============================================================================
    // 3. Disabled Item Rendering Hack (1-bit Palette Swapping vs Opacity)
    //=============================================================================
    
    const _Window_Base_changePaintOpacity = Window_Base.prototype.changePaintOpacity;
    Window_Base.prototype.changePaintOpacity = function(enabled) {
        this.contents.paintOpacity = 255; 
        this._isDisabledDrawing = !enabled;
        
        if (!enabled) {
            this.changeTextColor(ColorManager.textColor(20));
        } else {
            this.resetTextColor();
        }
    };

    const _Window_Base_resetTextColor = Window_Base.prototype.resetTextColor;
    Window_Base.prototype.resetTextColor = function() {
        if (this._isDisabledDrawing) {
            this.changeTextColor(ColorManager.textColor(20));
        } else {
            _Window_Base_resetTextColor.call(this);
        }
    };

    Window_MenuStatus.prototype.drawPendingItemBackground = function(index) {
        if (index === this.pendingIndex()) {
            const rect = this.itemRect(index);
            const color = ColorManager.pendingColor();
            this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, color);
        }
    };

    //=============================================================================
    // 4. Global Window Environment (Solid BG, Touch UI Gap Removal)
    //=============================================================================
    
    ConfigManager.touchUI = false;

    Scene_MenuBase.prototype.buttonAreaHeight = function() {
        return 0; 
    };

    const _Window_Base_initialize = Window_Base.prototype.initialize;
    Window_Base.prototype.initialize = function(rect) {
        _Window_Base_initialize.call(this, rect);
        if (this._backSprite) this._backSprite.opacity = 255; 
    };

    Window_Base.prototype.updateTone = function() {
        this.setTone(0, 0, 0); 
    };

    Window_Selectable.prototype.drawBackgroundRect = function(rect) {};

    const _Window_BattleLog_initialize = Window_BattleLog.prototype.initialize;
    Window_BattleLog.prototype.initialize = function(rect) {
        _Window_BattleLog_initialize.call(this, rect);
        if (this._backSprite) this._backSprite.opacity = 0;
        this.opacity = 0; 
    };

    const _Scene_MenuBase_createBackground = Scene_MenuBase.prototype.createBackground;
    Scene_MenuBase.prototype.createBackground = function() {
        _Scene_MenuBase_createBackground.call(this);
        if (this._backgroundSprite) {
            this._backgroundSprite.setBlendColor([255, 255, 255, 255]);
        }
    };

    //=============================================================================
    // 5. Main Menu Layout Fixes (Portraits & Stats)
    //=============================================================================
    
    Scene_MenuBase.prototype.mainCommandWidth = function() {
        return 160;
    };

    Object.defineProperty(ImageManager, 'faceWidth', { get: function() { return 32; }, configurable: true });
    Object.defineProperty(ImageManager, 'faceHeight', { get: function() { return 32; }, configurable: true });

    Window_MenuStatus.prototype.drawItemImage = function(index) {
        const actor = this.actor(index);
        const rect = this.itemRect(index);
        this.changePaintOpacity(actor.isBattleMember());
        const fw = ImageManager.faceWidth;
        const fh = ImageManager.faceHeight;
        
        const dx = rect.x + 24; 
        const dy = rect.y + Math.floor((rect.height - fh) / 2);
        
        this.drawActorFace(actor, dx, dy, fw, fh);
        this.changePaintOpacity(true);
    };

    Window_MenuStatus.prototype.drawItemStatus = function(index) {
        const actor = this.actor(index);
        const rect = this.itemRect(index);
        
        const x = rect.x + 80; 
        const y = rect.y + Math.floor((rect.height - this.lineHeight() * 3) / 2); 
        this.drawActorSimpleStatus(actor, x, y);
    };

    Window_StatusBase.prototype.drawActorSimpleStatus = function(actor, x, y) {
        const lineHeight = this.lineHeight();
        const x2 = x + 112; 
        
        this.drawActorName(actor, x, y);
        this.drawRetroLevel(actor, x, y + lineHeight * 1);
        this.drawActorIcons(actor, x, y + lineHeight * 2);
        
        this.drawActorClass(actor, x2, y, 120);
        this.drawRetroHp(actor, x2, y + lineHeight * 1, 120); 
        this.drawRetroMp(actor, x2, y + lineHeight * 2, 120); 
    };

    Window_StatusBase.prototype.drawRetroLevel = function(actor, x, y) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.levelA, x, y, 48);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(actor.level, x + 32, y, 36, "right");
    };

    Window_StatusBase.prototype.drawRetroHp = function(actor, x, y, width) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.hpA, x, y, 44);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(actor.hp + "/" + actor.mhp, x, y, width, "right");
    };

    Window_StatusBase.prototype.drawRetroMp = function(actor, x, y, width) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.mpA, x, y, 44);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(actor.mp + "/" + actor.mmp, x, y, width, "right");
    };

    Sprite_Gauge.prototype.drawGauge = function() {};
    Sprite_Gauge.prototype.drawLabel = function() {};
    Sprite_Gauge.prototype.drawValue = function() {};

    //=============================================================================
    // 6. Equip Scene Overrides
    //=============================================================================
    
    Window_EquipCommand.prototype.maxCols = function() { return 2; };
    Window_EquipCommand.prototype.makeCommandList = function() {
        this.addCommand(TextManager.equip2, "equip");
        this.addCommand(TextManager.optimize, "optimize");
    };

    Scene_Equip.prototype.statusWindowRect = function() {
        const ww = 220; 
        const wh = this.mainAreaHeight();
        const wx = 0;
        const wy = this.mainAreaTop();
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Equip.prototype.commandWindowRect = function() {
        const wx = 220; 
        const wy = this.mainAreaTop();
        const ww = Graphics.boxWidth - 220; 
        const wh = this.calcWindowHeight(1, true);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Equip.prototype.slotWindowRect = function() {
        const commandWindowRect = this.commandWindowRect();
        const wx = commandWindowRect.x;
        const wy = commandWindowRect.y + commandWindowRect.height;
        const ww = commandWindowRect.width;
        const wh = this.mainAreaBottom() - wy; 
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Equip.prototype.itemWindowRect = function() {
        return this.slotWindowRect();
    };

    Window_EquipStatus.prototype.refresh = function() {
        this.contents.clear();
        if (this._actor) {
            const startX = 0;
            const startY = 0;
            
            this.drawActorFace(this._actor, startX, startY, 32, 32);
            this.drawActorName(this._actor, startX + 40, startY, 128);
            
            const yOffset = 48; 
            for (let i = 0; i < 8; i++) {
                this.drawItem(startX, yOffset + this.lineHeight() * i, i);
            }
        }
    };

    Window_EquipStatus.prototype.drawItem = function(x, y, paramId) {
        const paramNameWidth = 96;
        const paramValueWidth = 36;
        const arrowWidth = 24;
        
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.param(paramId), x, y, paramNameWidth);
        if (this._actor) {
            this.resetTextColor();
            this.drawText(this._actor.param(paramId), x + paramNameWidth, y, paramValueWidth, "right");
        }
        
        this.changeTextColor(ColorManager.systemColor());
        this.drawText("->", x + paramNameWidth + paramValueWidth, y, arrowWidth, "center"); 
        
        if (this._tempActor) {
            const newValue = this._tempActor.param(paramId);
            const diffvalue = newValue - this._actor.param(paramId);
            if (diffvalue > 0) this.changeTextColor(ColorManager.powerUpColor());
            else if (diffvalue < 0) this.changeTextColor(ColorManager.powerDownColor());
            else this.resetTextColor();
            
            this.drawText(newValue, x + paramNameWidth + paramValueWidth + arrowWidth, y, paramValueWidth, "right");
        }
    };

    //=============================================================================
    // 7. Status Scene Overrides (Classic 16-Bit Quadrant Grid)
    //=============================================================================

    const _Scene_Status_createProfileWindow = Scene_Status.prototype.createProfileWindow;
    Scene_Status.prototype.createProfileWindow = function() {
        _Scene_Status_createProfileWindow.call(this);
        this._profileWindow.hide();
    };

    Scene_Status.prototype.profileWindowRect = function() {
        return new Rectangle(0, 0, 0, 0);
    };

    Scene_Status.prototype.statusWindowRect = function() {
        const ww = 200;
        const wx = 0;
        const wy = this.mainAreaTop();
        const wh = this.mainAreaHeight();
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Status.prototype.statusParamsWindowRect = function() {
        const ww = Graphics.boxWidth - 200; 
        const wh = this.calcWindowHeight(2, false); 
        const wx = 200;
        const wy = this.mainAreaTop();
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Status.prototype.statusEquipWindowRect = function() {
        const paramsRect = this.statusParamsWindowRect();
        const ww = Graphics.boxWidth - 200;
        const wx = 200;
        const wy = paramsRect.y + paramsRect.height;
        const wh = this.mainAreaBottom() - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    Window_Status.prototype.refresh = function() {
        this.contents.clear();
        if (this._actor) {
            const lh = this.lineHeight();
            const startX = 0;
            
            this.drawActorFace(this._actor, startX, 0, 32, 32);
            this.drawActorName(this._actor, startX + 40, 0, 128);
            
            const yOffset = 48;
            
            this.drawRetroLevel(this._actor, startX, yOffset);
            this.drawActorClass(this._actor, startX, yOffset + lh * 1, 160);
            this.drawRetroHp(this._actor, startX, yOffset + lh * 2, 160);
            this.drawRetroMp(this._actor, startX, yOffset + lh * 3, 160);
            
            const paramY = yOffset + lh * 5;
            
            for (let i = 0; i < 6; i++) {
                this.drawParam(startX, paramY + lh * i, 2 + i);
            }
        }
    };

    Window_Status.prototype.drawParam = function(x, y, paramId) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.param(paramId), x, y, 112); 
        this.resetTextColor();
        this.drawText(this._actor.param(paramId), x, y, 160, "right"); 
    };

    Window_StatusParams.prototype.maxItems = function() {
        return 0; 
    };

    Window_StatusParams.prototype.refresh = function() {
        this.contents.clear();
        if (this._actor) {
            const lh = this.lineHeight();
            
            this.changeTextColor(ColorManager.systemColor());
            this.drawText("Current " + TextManager.exp, 0, 0, 160);
            this.resetTextColor();
            this.drawText(this._actor.currentExp(), 0, 0, this.innerWidth, "right");
            
            this.changeTextColor(ColorManager.systemColor());
            this.drawText("To Next LV", 0, lh, 160);
            this.resetTextColor();
            
            let nextExp = "-------";
            if (!this._actor.isMaxLevel()) {
                nextExp = this._actor.nextRequiredExp();
            }
            this.drawText(nextExp, 0, lh, this.innerWidth, "right");
        }
    };

    Window_StatusEquip.prototype.drawItem = function(index) {
        const rect = this.itemLineRect(index);
        const equips = this._actor.equips();
        const item = equips[index];
        const slotName = this.actorSlotName(this._actor, index);
        
        const sw = 100; 
        
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(slotName, rect.x, rect.y, sw, rect.height);
        this.drawItemName(item, rect.x + sw, rect.y, rect.width - sw);
    };

    //=============================================================================
    // 8. Skill Scene Overrides (Type Bypass, Horizontal Vitals, All Skills)
    //=============================================================================
    
    // Hide the Type window entirely
    Scene_Skill.prototype.skillTypeWindowRect = function() {
        return new Rectangle(0, 0, 0, 0); 
    };

    // Stretch Status to full screen width
    Scene_Skill.prototype.statusWindowRect = function() {
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(2, false);
        const wx = 0;
        const wy = this.mainAreaTop();
        return new Rectangle(wx, wy, ww, wh);
    };

    // Item pool fills the remainder
    Scene_Skill.prototype.itemWindowRect = function() {
        const statusRect = this.statusWindowRect();
        const wx = 0;
        const wy = statusRect.y + statusRect.height;
        const ww = Graphics.boxWidth;
        const wh = this.mainAreaBottom() - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    // Intercept Scene start to skip Type selection
    Scene_Skill.prototype.start = function() {
        Scene_ItemBase.prototype.start.call(this);
        this.refreshActor();
        this._itemWindow.activate();
        this._itemWindow.selectLast();
    };

    // Bind page navigation and cancel strictly to the Item window
    Scene_Skill.prototype.createItemWindow = function() {
        const rect = this.itemWindowRect();
        this._itemWindow = new Window_SkillList(rect);
        this._itemWindow.setHelpWindow(this._helpWindow);
        this._itemWindow.setHandler("ok", this.onItemOk.bind(this));
        this._itemWindow.setHandler("cancel", this.popScene.bind(this)); // Escapes the menu entirely
        this._itemWindow.setHandler("pagedown", this.nextActor.bind(this));
        this._itemWindow.setHandler("pageup", this.previousActor.bind(this));
        this.addWindow(this._itemWindow);
    };

    Scene_Skill.prototype.onItemCancel = function() {
        this.popScene();
    };

    Scene_Skill.prototype.onActorChange = function() {
        Scene_MenuBase.prototype.onActorChange.call(this);
        this.refreshActor();
        this._itemWindow.activate();
    };

    // Override the display logic to blindly show all valid skills
    Window_SkillList.prototype.includes = function(item) {
        return item && item.stypeId > 0; 
    };
    
    Window_SkillList.prototype.maxCols = function() {
        return 2;
    };

    // Custom Horizontal Vitals Layout
    Window_SkillStatus.prototype.refresh = function() {
        this.contents.clear();
        if (this._actor) {
            const lh = this.lineHeight();
            const startX = 24; 
            const startY = Math.floor((this.innerHeight - lh * 2) / 2); 
            
            // Col 1: Portrait
            this.drawActorFace(this._actor, startX, startY + 8, 32, 32); 
            
            const col2X = startX + 48; 
            const col3X = col2X + 160; 
            
            // Col 2: Name / Level
            this.drawActorName(this._actor, col2X, startY, 144);
            this.drawRetroLevel(this._actor, col2X, startY + lh);
            
            // Col 3: Class / MP
            this.drawActorClass(this._actor, col3X, startY, 144);
            this.drawRetroMp(this._actor, col3X, startY + lh, 100);
        }
    };

    //=============================================================================
    // 9. Map Name Single Gradient
    //=============================================================================
    
    Window_MapName.prototype.drawBackground = function(x, y, width, height) {
        const color = ColorManager.systemColor(); 
        this.contents.gradientFillRect(x, y, width, height, color, color);
    };

    //=============================================================================
    // 10. Resolution Options Menu (Integer Scaling & Boot Override)
    //=============================================================================
    
    const RES_LIST = [
        [544, 416],   // 1x 
        [1088, 832],  // 2x
        [1632, 1248]  // 3x
    ];

    ConfigManager.resolutionIndex = 0;

    ConfigManager.readResolutionIndex = function(config, name) {
        if (name in config) {
            return Number(config[name]).clamp(0, RES_LIST.length - 1);
        } else {
            return 0; 
        }
    };

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _ConfigManager_makeData.call(this);
        config.resolutionIndex = this.resolutionIndex;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.resolutionIndex = this.readResolutionIndex(config, 'resolutionIndex');
        this.applyResolution();
    };

    ConfigManager.applyResolution = function() {
        if (this.resolutionIndex >= RES_LIST.length) this.resolutionIndex = 0;
        const res = RES_LIST[this.resolutionIndex];
        
        if (Graphics.width !== 544 || Graphics.height !== 416) {
            Graphics.resize(544, 416);
            Graphics.boxWidth = 544;
            Graphics.boxHeight = 416;
        }
        
        if (Utils.isNwjs()) {
            const xDiff = window.outerWidth - window.innerWidth;
            const yDiff = window.outerHeight - window.innerHeight;
            const targetW = res[0] + xDiff;
            const targetH = res[1] + yDiff;
            
            window.resizeTo(targetW, targetH);
            
            const screenX = (window.screen.availWidth - targetW) / 2;
            const screenY = (window.screen.availHeight - targetH) / 2;
            window.moveTo(Math.max(0, screenX), Math.max(0, screenY));
        }
    };

    const _Scene_Boot_resizeScreen = Scene_Boot.prototype.resizeScreen;
    Scene_Boot.prototype.resizeScreen = function() {
        Graphics.resize(544, 416);
        Graphics.boxWidth = 544;
        Graphics.boxHeight = 416;
        ConfigManager.applyResolution(); 
    };

    const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function() {
        _Window_Options_addGeneralOptions.call(this);
        this.addCommand("Resolution", 'resolutionIndex');
    };

    const _Window_Options_statusText = Window_Options.prototype.statusText;
    Window_Options.prototype.statusText = function(index) {
        const symbol = this.commandSymbol(index);
        if (symbol === 'resolutionIndex') {
            const res = RES_LIST[ConfigManager.resolutionIndex];
            return `${res[0]} x ${res[1]}`;
        }
        return _Window_Options_statusText.call(this, index);
    };

    const _Window_Options_processOk = Window_Options.prototype.processOk;
    Window_Options.prototype.processOk = function() {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        if (symbol === 'resolutionIndex') {
            ConfigManager.resolutionIndex = (ConfigManager.resolutionIndex + 1) % RES_LIST.length;
            ConfigManager.applyResolution();
            this.redrawItem(this.findSymbol('resolutionIndex'));
            SoundManager.playCursor();
        } else {
            _Window_Options_processOk.call(this);
        }
    };

    const _Window_Options_cursorRight = Window_Options.prototype.cursorRight;
    Window_Options.prototype.cursorRight = function() {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        if (symbol === 'resolutionIndex') {
            ConfigManager.resolutionIndex = (ConfigManager.resolutionIndex + 1) % RES_LIST.length;
            ConfigManager.applyResolution();
            this.redrawItem(this.findSymbol('resolutionIndex'));
            SoundManager.playCursor();
        } else {
            _Window_Options_cursorRight.call(this);
        }
    };

    const _Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
    Window_Options.prototype.cursorLeft = function() {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        if (symbol === 'resolutionIndex') {
            ConfigManager.resolutionIndex = (ConfigManager.resolutionIndex - 1 + RES_LIST.length) % RES_LIST.length;
            ConfigManager.applyResolution();
            this.redrawItem(this.findSymbol('resolutionIndex'));
            SoundManager.playCursor();
        } else {
            _Window_Options_cursorLeft.call(this);
        }
    };

    //=============================================================================
    // 11. Menu Cursor (True Z-Index Overlay Fix, Coordinate Fix, Visual Tracking)
    //=============================================================================
    
    const _Window_createAllParts = Window.prototype._createAllParts;
    Window.prototype._createAllParts = function() {
        _Window_createAllParts.call(this);
        if (this._clientArea && this._cursorSprite) {
            this._clientArea.removeChild(this._cursorSprite);
            this._clientArea.addChild(this._cursorSprite); 
        }
    };

    Window.prototype._refreshCursor = function() {
        if (!this._customCursorApplied) {
            this._cursorSprite.bitmap = ImageManager.loadSystem("MenuCursor");
            this._customCursorApplied = true;
        }
        if (this._cursorSprite && this._cursorSprite.bitmap && this._cursorSprite.bitmap.isReady()) {
            this._cursorSprite.setFrame(0, 0, this._cursorSprite.bitmap.width, this._cursorSprite.bitmap.height);
        }
    };

    Window.prototype._updateCursor = function() {
        this._cursorSprite.alpha = 1; 

        if (this.isOpen() && this.active && this._cursorRect && this._cursorRect.width > 0) {
            this._cursorSprite.visible = true;
            this._cursorSprite.x = this._cursorRect.x - 4;
            this._cursorSprite.y = this._cursorRect.y;
        } else {
            this._cursorSprite.visible = false;
        }
    };

    //=============================================================================
    // 12. Dynamic Window Resizer (Hook Preparation)
    //=============================================================================
    
    Scene_Battle.prototype.resizeBattleListWindow = function(window) {
        const baseHeight = this._helpWindow.y + this._helpWindow.height;
        let offset = 0;
        const safeBottom = this._statusWindow.y; 
        const newHeight = safeBottom - baseHeight - offset;
        
        if (window.height !== newHeight) {
            window.height = newHeight;
            window.refresh();
        }
    };

    const _Scene_Battle_commandSkill = Scene_Battle.prototype.commandSkill;
    Scene_Battle.prototype.commandSkill = function() {
        this.resizeBattleListWindow(this._skillWindow);
        _Scene_Battle_commandSkill.call(this);
    };

    const _Scene_Battle_commandItem = Scene_Battle.prototype.commandItem;
    Scene_Battle.prototype.commandItem = function() {
        this.resizeBattleListWindow(this._itemWindow);
        _Scene_Battle_commandItem.call(this);
    };

})();