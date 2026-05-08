/*:
 * @target MZ
 * @plugindesc Phase 2: Battle UI & Sprite Architecture v1.31.
 * @author Custom Build
 * * @help
 * Implements:
 * - Divorced absolute battlefield grid (Retains native SV sprites).
 * - Rear-View Actor Sprites (Y-Axis step animations, disabled shadows).
 * - Split Battle HUD (352px Status / 192px Command).
 * - Forced solid borders and opacity on Battle HUD.
 * - Contextual Info Windows (MP Info & Class Context) remain VISIBLE.
 * - Bottom-anchored Skill/Item Windows (Perfectly overlays bottom HUD).
 * - 1px vertical padding adjustment for List items (prevents icon collision).
 * - OVERRIDE: Neutralizes Phase 1 dynamic resizer to fix scrolling/borders.
 * - NEW: Center-Weighted Enemy Grid Packing (Produces M-L-M formations).
 * - ADJUSTED: Instantaneous 24px Actor step animations.
 * - ADJUSTED: Brute-forced Y offsets to eliminate SV cell transparency gaps.
 * - NEW: Monochrome Damage Popups (Black Text/White Outline, Crit Indicators).
 * - FIX: Canvas Clipping (Decoupled Canvas Size from Digit Spacing).
 * - FIX: NaN Error (Dynamic argument parsing for MZ 1.4+ compatibility).
 * - FIX: 1-Bit Pixel Crusher (Destroys Canvas Anti-Aliasing via Alpha Thresholding).
 * - UPGRADE: Solid 2px Retro Outline Density (Fills all diagonal corners).
 * - NEW: Battle Log Assassination & Top-Screen Action Banner.
 * - FIX: Total Render Assassination (Nullifies stubborn MZ background rects).
 * - FIX: Healing Color mapped to Index 20.
 * - FIX: Neutralized hardcoded Red critical & collapse flashes (Pure White).
 * - FIX: Zeroed Damage Popup Offsets (Perfect Horizontal Centering).
 * - FIX: Actor Entry March (Vertical tween using Index 3 "guard" animation).
 */

(() => {
    'use strict';

    //=============================================================================
    // 1. Rear-View Sprite Grid & SV Animation Overrides
    //=============================================================================

    Sprite_Actor.prototype.setActorHome = function(index) {
        const partySize = $gameParty.maxBattleMembers();
        const combatBlockWidth = 384; 
        const startX = (Graphics.boxWidth - combatBlockWidth) / 2; 
        const spacing = combatBlockWidth / partySize;
        
        const x = startX + (index * spacing) + (spacing / 2);
        const y = 230; 
        
        this.setHome(x, y);
    };

    Sprite_Actor.prototype.moveToStartPosition = function() {
        this.startMove(0, 200, 0); 
    };

    Sprite_Actor.prototype.setupEntryMotion = function() {
        if (this._actor && this._actor.canMove()) {
            this.startMotion("guard"); // Calls Index 3 from the SV Sprite Sheet
            this.startMove(0, 0, 30);  
        }
    };

    Sprite_Actor.prototype.damageOffsetX = function() {
        return 0; 
    };

    Sprite_Actor.prototype.stepForward = function() {
        this.startMove(0, -24, 0); 
    };

    Sprite_Actor.prototype.stepBack = function() {
        this.startMove(0, 0, 0); 
    };

    Sprite_Actor.prototype.retreat = function() {
        this.startMove(0, 300, 30); 
    };

    Sprite_Actor.prototype.updateShadow = function() {
        if (this._shadowSprite) {
            this._shadowSprite.visible = false;
        }
    };

    //=============================================================================
    // 1.5. Center-Weighted Enemy Grid Sorting System
    //=============================================================================

    const GRID_SIZES = {
        's':  [1, 1],
        'm':  [1, 2], 
        'l':  [2, 2],
        'xl': [4, 2]
    };

    Game_Enemy.prototype.gridSize = function() {
        const tag = this.enemy().meta.grid;
        const sizeTag = tag ? String(tag).trim().toLowerCase() : 's';
        return GRID_SIZES[sizeTag] || GRID_SIZES['s'];
    };

    const _Game_Troop_setup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function(troopId) {
        _Game_Troop_setup.call(this, troopId);
        this.arrangeEnemyGrid();
    };

    Game_Troop.prototype.arrangeEnemyGrid = function() {
        const CELL_W = 64;
        const CELL_H = 64;
        const START_X = (Graphics.boxWidth - (4 * CELL_W)) / 2; 
        const START_Y = 60; 

        let grid = [
            [false, false, false, false],
            [false, false, false, false]
        ];

        let enemiesToPlace = this.members().filter(e => !e.isHidden());
        
        let sorted = enemiesToPlace.map((e, index) => {
            let [w, h] = e.gridSize();
            return { enemy: e, area: w * h, index: index, w: w, h: h };
        }).sort((a, b) => {
            if (b.area !== a.area) return b.area - a.area;
            return a.index - b.index; 
        });

        let largeCount = sorted.filter(i => i.w >= 2 && i.h === 2).length;

        sorted.forEach(item => {
            let e = item.enemy;
            let w = item.w;
            let h = item.h;
            let placed = false;

            let preferredX = [];
            if (w === 1) {
                preferredX = [1, 2, 0, 3]; 
            } else if (w === 2) {
                preferredX = (largeCount >= 2) ? [0, 2, 1] : [1, 0, 2];
            } else if (w === 3) {
                preferredX = [0, 1];
            } else {
                preferredX = [0];
            }

            for (let y = 0; y <= 2 - h; y++) {
                for (let i = 0; i < preferredX.length; i++) {
                    let x = preferredX[i];
                    if (x > 4 - w) continue; 
                    
                    let free = true;
                    for (let dy = 0; dy < h; dy++) {
                        for (let dx = 0; dx < w; dx++) {
                            if (grid[y + dy][x + dx]) free = false;
                        }
                    }
                    
                    if (free) {
                        for (let dy = 0; dy < h; dy++) {
                            for (let dx = 0; dx < w; dx++) {
                                grid[y + dy][x + dx] = true;
                            }
                        }
                        
                        e._screenX = Math.round(START_X + (x * CELL_W) + (w * CELL_W / 2.0));
                        e._screenY = Math.round(START_Y + (y * CELL_H) + (h * CELL_H));
                        placed = true;
                        break;
                    }
                }
                if (placed) break;
            }
            
            if (!placed) {
                e.hide();
            }
        });
    };

    //=============================================================================
    // 2. Custom Window Definitions (MP Info & Context Help)
    //=============================================================================

    function Window_BattleMPInfo() {
        this.initialize(...arguments);
    }
    Window_BattleMPInfo.prototype = Object.create(Window_Base.prototype);
    Window_BattleMPInfo.prototype.constructor = Window_BattleMPInfo;

    Window_BattleMPInfo.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.hide();
    };

    Window_BattleMPInfo.prototype.refresh = function(actor) {
        this.contents.clear();
        if (actor && actor.currentClass()) {
            const text = actor.currentClass().meta.MP_Help;
            if (text) {
                this.resetTextColor();
                this.drawText(text, 0, 0, this.innerWidth);
            }
        }
    };

    function Window_BattleContext() {
        this.initialize(...arguments);
    }
    Window_BattleContext.prototype = Object.create(Window_Base.prototype);
    Window_BattleContext.prototype.constructor = Window_BattleContext;

    Window_BattleContext.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.hide();
    };

    Window_BattleContext.prototype.refresh = function(actor) {
        this.contents.clear();
        if (actor) { } 
    };

    //=============================================================================
    // 3. Battle Scene Window Rectangles & HUD Overrides
    //=============================================================================

    Scene_Battle.prototype.windowAreaHeight = function() { return this.calcWindowHeight(4, false); };

    Scene_Battle.prototype.statusWindowRect = function() {
        const ww = 352;
        const wh = this.windowAreaHeight();
        const wx = 0;
        const wy = Graphics.boxHeight - wh; 
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.partyCommandWindowRect = function() {
        const ww = Graphics.boxWidth - 352;
        const wh = this.windowAreaHeight();
        const wx = 352;
        const wy = Graphics.boxHeight - wh;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.actorCommandWindowRect = function() { return this.partyCommandWindowRect(); };

    Scene_Battle.prototype.mpInfoWindowRect = function() {
        const ww = 352;
        const wh = this.calcWindowHeight(1, false); 
        const wx = 0;
        const wy = this.statusWindowRect().y - wh; 
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.contextWindowRect = function() {
        const ww = Graphics.boxWidth - 352;
        const wh = this.calcWindowHeight(1, false); 
        const wx = 352;
        const wy = this.actorCommandWindowRect().y - wh; 
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.skillWindowRect = function() {
        const ww = Graphics.boxWidth;
        const wh = this.windowAreaHeight(); 
        const wx = 0;
        const wy = Graphics.boxHeight - wh; 
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.itemWindowRect = function() { return this.skillWindowRect(); };

    Scene_Battle.prototype.resizeBattleListWindow = function(window) {};

    //=============================================================================
    // 4. Sub-Menu Fixes & List Density Constraints
    //=============================================================================

    Window_PartyCommand.prototype.maxCols = function() { return 1; };
    Window_ActorCommand.prototype.maxCols = function() { return 1; };
    Window_ActorCommand.prototype.setupWindowPosition = function() {};

    Window_SkillList.prototype.itemHeight = function() { return this.lineHeight() + 2; };
    Window_ItemList.prototype.itemHeight = function() { return this.lineHeight() + 2; };

    const applySolidWindowBox = function(windowClass) {
        const _initialize = windowClass.prototype.initialize;
        windowClass.prototype.initialize = function(rect) {
            _initialize.call(this, rect);
            this.frameVisible = true;
            this.opacity = 255;
            this.backOpacity = 255;
        };
        windowClass.prototype.drawBackgroundRect = function() {};
        if (windowClass.prototype.drawItemBackground) {
            windowClass.prototype.drawItemBackground = function(index) {};
        }
    };

    applySolidWindowBox(Window_BattleStatus);
    applySolidWindowBox(Window_PartyCommand);
    applySolidWindowBox(Window_ActorCommand);

    //=============================================================================
    // 5. Battle Status Rendering (16-Bit Classic Layout)
    //=============================================================================

    Window_BattleStatus.prototype.maxCols = function() { return 1; };
    Window_BattleStatus.prototype.itemHeight = function() { return this.lineHeight(); };

    Window_BattleStatus.prototype.drawItem = function(index) {
        const actor = this.actor(index);
        const rect = this.itemRectWithPadding(index);
        
        const yOffset = rect.y + 4;
        
        this.drawActorName(actor, rect.x, yOffset, 120);
        this.drawRetroHp(actor, rect.x + 128, yOffset, 80);
        this.drawRetroMp(actor, rect.x + 224, yOffset, 80);
    };

    //=============================================================================
    // 6. Injecting & Toggling the New Info Windows
    //=============================================================================

    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        this.createMPInfoWindow();
        this.createContextWindow();
    };

    Scene_Battle.prototype.createMPInfoWindow = function() {
        const rect = this.mpInfoWindowRect();
        this._mpInfoWindow = new Window_BattleMPInfo(rect);
        this.addWindow(this._mpInfoWindow);
    };

    Scene_Battle.prototype.createContextWindow = function() {
        const rect = this.contextWindowRect();
        this._contextWindow = new Window_BattleContext(rect);
        this.addWindow(this._contextWindow);
    };

    const _Scene_Battle_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function() {
        _Scene_Battle_startActorCommandSelection.call(this);
        const actor = BattleManager.actor();
        if (actor) {
            this._mpInfoWindow.refresh(actor);
            this._contextWindow.refresh(actor);
            
            if (actor.currentClass() && actor.currentClass().meta.MP_Help) {
                this._mpInfoWindow.show();
            } else {
                this._mpInfoWindow.hide();
            }
            this._contextWindow.show(); 
        }
    };

    const _Scene_Battle_commandCancel = Scene_Battle.prototype.commandCancel;
    Scene_Battle.prototype.commandCancel = function() {
        _Scene_Battle_commandCancel.call(this);
        this._mpInfoWindow.hide();
        this._contextWindow.hide();
    };

    const _Scene_Battle_endCommandSelection = Scene_Battle.prototype.endCommandSelection;
    Scene_Battle.prototype.endCommandSelection = function() {
        _Scene_Battle_endCommandSelection.call(this);
        this._mpInfoWindow.hide();
        this._contextWindow.hide();
    };

    //=============================================================================
    // 7. Monochrome Damage Popups (1-Bit Pixel Crusher & Crit Flash)
    //=============================================================================

    Sprite_Damage.prototype.damageFontSize = function() { return 16; };

    Sprite_Damage.prototype.damageColor = function() {
        if (this._colorType === 1 || this._colorType === 2) {
            return ColorManager.textColor(20); 
        }
        return "#000000"; 
    };

    Sprite_Damage.prototype.damageOutlineColor = function() { return "#ffffff"; };

    Sprite_Damage.prototype.setupCriticalEffect = function() {
        this._flashColor = [255, 255, 255, 160]; 
        this._flashDuration = 60;
    };

    const create1BitTextMask = function(bmpInfo, text, w, h, color) {
        const tempBmp = new Bitmap(w, h);
        tempBmp.fontFace = bmpInfo.fontFace;
        tempBmp.fontSize = bmpInfo.fontSize;
        tempBmp.textColor = color;
        tempBmp.smooth = false;
        
        tempBmp.drawText(text, 0, 0, w, h, "center");

        const ctx = tempBmp.context;
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            data[i + 3] = data[i + 3] >= 127 ? 255 : 0; 
        }

        ctx.putImageData(imgData, 0, 0);
        return tempBmp;
    };

    const drawStrictRetroText = function(bmp, text, w, h, mainColor, outlineColor, thickness) {
        bmp.outlineWidth = 0; 
        
        const outlineMask = create1BitTextMask(bmp, text, w, h, outlineColor);
        const centerMask = create1BitTextMask(bmp, text, w, h, mainColor);

        for (let dy = -thickness; dy <= thickness; dy++) {
            for (let dx = -thickness; dx <= thickness; dx++) {
                if (dx === 0 && dy === 0) continue;
                bmp.blt(outlineMask, 0, 0, w, h, dx, dy);
            }
        }

        bmp.blt(centerMask, 0, 0, w, h, 0, 0);
    };

    Sprite_Damage.prototype.createDigits = function() {
        const value = arguments.length > 1 ? arguments[1] : arguments[0];
        const string = Math.abs(value).toString();
        
        const canvasW = 32; 
        const canvasH = 32;
        const spacing = 12; 
        const chunkyThickness = 2; 

        for (let i = 0; i < string.length; i++) {
            const sprite = this.createChildSprite(canvasW, canvasH);
            sprite.bitmap.fontFace = $gameSystem.numberFontFace();
            sprite.bitmap.fontSize = this.damageFontSize();
            sprite.bitmap.smooth = false;
            
            drawStrictRetroText(sprite.bitmap, string[i], canvasW, canvasH, this.damageColor(), this.damageOutlineColor(), chunkyThickness);
            
            sprite.x = (i - (string.length - 1) / 2) * spacing;
            sprite.dy = i;
        }
    };

    Sprite_Damage.prototype.createMiss = function() {
        const canvasW = 64; 
        const canvasH = 32;
        const chunkyThickness = 2;
        const sprite = this.createChildSprite(canvasW, canvasH);
        
        sprite.bitmap.fontFace = $gameSystem.numberFontFace();
        sprite.bitmap.fontSize = this.damageFontSize();
        sprite.bitmap.smooth = false;
        
        drawStrictRetroText(sprite.bitmap, "Miss", canvasW, canvasH, this.damageColor(), this.damageOutlineColor(), chunkyThickness);
        sprite.dy = 0;
    };

    const _Sprite_Damage_setup = Sprite_Damage.prototype.setup;
    Sprite_Damage.prototype.setup = function(target) {
        _Sprite_Damage_setup.call(this, target);
        if (target.result().critical) {
            this.createCrit();
        }
    };

    Sprite_Damage.prototype.createCrit = function() {
        const canvasW = 64;
        const canvasH = 32;
        const chunkyThickness = 2;
        const sprite = this.createChildSprite(canvasW, canvasH);
        
        sprite.bitmap.fontFace = $gameSystem.numberFontFace();
        sprite.bitmap.fontSize = this.damageFontSize();
        sprite.bitmap.smooth = false;
        
        drawStrictRetroText(sprite.bitmap, "CRIT!", canvasW, canvasH, this.damageColor(), this.damageOutlineColor(), chunkyThickness);
        
        sprite.yOffset = -16; 
        sprite.ry = 0;
        sprite.dy = 0;
    };

    const _Sprite_Damage_updateChild = Sprite_Damage.prototype.updateChild;
    Sprite_Damage.prototype.updateChild = function(sprite) {
        _Sprite_Damage_updateChild.call(this, sprite);
        if (sprite.yOffset !== undefined) {
            sprite.y += sprite.yOffset;
        }
    };

    //=============================================================================
    // 8. Battle Log Assassination & Action Banner Integration
    //=============================================================================

    function Window_BattleSkillBanner() {
        this.initialize(...arguments);
    }
    Window_BattleSkillBanner.prototype = Object.create(Window_Base.prototype);
    Window_BattleSkillBanner.prototype.constructor = Window_BattleSkillBanner;

    Window_BattleSkillBanner.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.frameVisible = true;
        this.opacity = 255;
        this.backOpacity = 255;
        this.hide();
    };
    Window_BattleSkillBanner.prototype.drawBackgroundRect = function() {};

    Window_BattleSkillBanner.prototype.showSkill = function(name) {
        this.contents.clear();
        this.drawText(name, 0, 0, this.innerWidth, "center");
        this.show();
    };

    const _Scene_Battle_createAllWindows_banner = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows_banner.call(this);
        
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(1, false);
        const rect = new Rectangle(0, 0, ww, wh);
        
        this._skillBannerWindow = new Window_BattleSkillBanner(rect);
        this.addWindow(this._skillBannerWindow);
        this._logWindow._skillBanner = this._skillBannerWindow;
    };
    
    const _Window_BattleLog_initialize = Window_BattleLog.prototype.initialize;
    Window_BattleLog.prototype.initialize = function(rect) {
        _Window_BattleLog_initialize.call(this, rect);
        this.opacity = 0;
        this.backOpacity = 0;
        this.contentsOpacity = 0;
        this.frameVisible = false;
    };

    Window_BattleLog.prototype.drawBackground = function() {};
    Window_BattleLog.prototype.drawLineText = function(index) {};

    const _Window_BattleLog_update = Window_BattleLog.prototype.update;
    Window_BattleLog.prototype.update = function() {
        _Window_BattleLog_update.call(this);
        this.opacity = 0;
        this.backOpacity = 0;
        this.contentsOpacity = 0;
        this.frameVisible = false;
    };

    Window_BattleLog.prototype.displayAction = function(subject, item) {
        this.push("showBanner", item.name);
        this.push("wait"); 
    };

    Window_BattleLog.prototype.showBanner = function(name) {
        if (this._skillBanner) {
            this._skillBanner.showSkill(name);
        }
    };

    const _Window_BattleLog_endAction = Window_BattleLog.prototype.endAction;
    Window_BattleLog.prototype.endAction = function(subject) {
        this.push("hideBanner");
        _Window_BattleLog_endAction.call(this, subject);
    };

    Window_BattleLog.prototype.hideBanner = function() {
        if (this._skillBanner) {
            this._skillBanner.hide();
        }
    };

    const _Window_BattleLog_clear = Window_BattleLog.prototype.clear;
    Window_BattleLog.prototype.clear = function() {
        _Window_BattleLog_clear.call(this);
        if (this._skillBanner) {
            this._skillBanner.hide();
        }
    };

    //=============================================================================
    // 9. Monochrome Enemy Collapse (Neutralize Red Death Flash)
    //=============================================================================

    const _Sprite_Enemy_updateCollapse = Sprite_Enemy.prototype.updateCollapse;
    Sprite_Enemy.prototype.updateCollapse = function() {
        this.blendMode = 1; // ADD
        this.setBlendColor([255, 255, 255, 128]); // Changed from Red to Pure White
        this.opacity *= this._effectDuration / (this._effectDuration + 1);
    };

})();