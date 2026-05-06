/*:
 * @target MZ
 * @plugindesc Phase 1: Core Engine UI & Environment overrides (Consolidated) v1.13.
 * @author Custom Build
 * * @help
 * Replaces:
 * - Basic Window Resizer / Custom Resolution Menu (With Boot Lock & Auto-Center)
 * - Fonts & Colors (Index 9 Normal, Index 20 Disabled, Absolute Anti-Aliasing Kill)
 * - Solid Window BG (Disabled System Tinting, Transparent Item BGs)
 * - Map Name Single Gradient
 * - Show Max MP / HP modifications
 * - Menu Cursor (Active-Only, True Z-Index Overlay Fix, Padding-Safe Offset)
 * - Formation Selection (Pending Color Mapped to Index 25)
 * - Dynamic Window Resizer (Base Hook)
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Retro Pixel Rendering Enforcement & CSS Font Smoothing Override
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
    // 1. Fonts & Colors (Size 16, Index 9 Normal, Index 20 Disabled, Nuclear Option)
    //=============================================================================
    
    Graphics.defaultFontFamily = "Emulogic, VL Gothic Regular, VL PGothic Regular, sans-serif";

    Game_System.prototype.mainFontSize = function() { return 16; };
    Window_Base.prototype.lineHeight = function() { return 24; };

    Bitmap.prototype._drawTextOutline = function(text, tx, ty, maxWidth) {};
    Bitmap.prototype._drawTextShadow = function(text, tx, ty, maxWidth) {};

    // The Nuclear Option: Alpha Thresholding to guarantee 0% text blur
    const _Bitmap_drawText = Bitmap.prototype.drawText;
    Bitmap.prototype.drawText = function(text, x, y, maxWidth, lineHeight, align) {
        _Bitmap_drawText.call(this, text, Math.round(x), Math.round(y), maxWidth, lineHeight, align);
        
        if (text !== undefined && text !== '' && this.context) {
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

    // Palette Mappings
    ColorManager.normalColor = function() { return this.textColor(9); };
    ColorManager.systemColor = function() { return this.textColor(9); };
    ColorManager.crisisColor = function() { return this.textColor(9); };
    ColorManager.deathColor  = function() { return this.textColor(9); };
    
    // Formation Selection Background Map (Index 25)
    ColorManager.pendingColor = function() { return this.textColor(25); };
    
    // Transparent gauges mapping (Index 0)
    ColorManager.hpGaugeColor1 = function() { return this.textColor(0); };
    ColorManager.hpGaugeColor2 = function() { return this.textColor(0); };
    ColorManager.mpGaugeColor1 = function() { return this.textColor(0); };
    ColorManager.mpGaugeColor2 = function() { return this.textColor(0); };
    ColorManager.tpGaugeColor1 = function() { return this.textColor(0); };
    ColorManager.tpGaugeColor2 = function() { return this.textColor(0); };
    ColorManager.gaugeBackColor = function() { return this.textColor(0); };

    const _Scene_Title_drawGameTitle = Scene_Title.prototype.drawGameTitle;
    Scene_Title.prototype.drawGameTitle = function() {
        this._gameTitleSprite.bitmap.textColor = ColorManager.normalColor();
        _Scene_Title_drawGameTitle.call(this);
    };

    //=============================================================================
    // 2. Disabled Item Rendering Hack (1-bit Palette Swapping vs Opacity)
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

    // Formation Highlight specific override: Draw solid rect without triggering disabled text
    Window_MenuStatus.prototype.drawPendingItemBackground = function(index) {
        if (index === this.pendingIndex()) {
            const rect = this.itemRect(index);
            const color = ColorManager.pendingColor();
            this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, color);
        }
    };

    //=============================================================================
    // 3. Solid Window BG, Transparent Item BGs, & Touch UI Default
    //=============================================================================
    
    ConfigManager.touchUI = false;

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
    // 4. Show Max MP/HP (Sprite_Gauge overrides)
    //=============================================================================
    
    Sprite_Gauge.prototype.drawLabel = function() {};

    Sprite_Gauge.prototype.drawValue = function() {
        const currentValue = this.currentValue();
        const maxValue = this.currentMaxValue();
        const width = this.bitmapWidth();
        const height = this.bitmapHeight();
        
        this.setupValueFont();
        const text = `${currentValue}/${maxValue}`;
        this.bitmap.drawText(text, 0, 0, width, height, "center");
    };

    //=============================================================================
    // 5. Map Name Single Gradient
    //=============================================================================
    
    Window_MapName.prototype.drawBackground = function(x, y, width, height) {
        const color = ColorManager.systemColor(); 
        this.contents.gradientFillRect(x, y, width, height, color, color);
    };

    //=============================================================================
    // 6. Resolution Options Menu (Integer Scaling & Boot Override)
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
    // 7. Menu Cursor (True Z-Index Overlay Fix, Coordinate Fix, Visual Tracking)
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
    // 8. Dynamic Window Resizer (Hook Preparation)
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