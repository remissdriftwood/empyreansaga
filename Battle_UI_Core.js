/*:
 * @target MZ
 * @plugindesc Phase 2: Battle UI & Sprite Architecture v1.51.
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
 * - NEW: VX Ace Retro Animation Hijack (4-frame 1-bit sprite strips via Notetags).
 * - FIX: Asynchronous Loading Glitch (Nullified uncropped full-sheet flashes).
 * - NEW: Dynamic Battle Status Refresh (Syncs Retro HUD to Popups & Costs).
 * - NEW: Context Window Logic (Dynamic height scaling, Class Dummy Variables).
 * - FIX: Changed actor.classId() to actor._classId to prevent TypeErrors.
 * - FIX: Re-linked Ammo Context UI to trigger off Weapon Type ID 8 (Guns).
 * - UPGRADE: Ammo Context UI maps real Weapon Name and Icon from equipment.
 * - FIX: Hardcoded 6/6 dummy data permanently replaced with live ammo arrays.
 * - NEW: Visual Grid Enemy Targeting (MenuCursor.png, Spatial Navigation).
 * - UPGRADE: Action Banner space shared with Target Enemy Name window.
 * - NEW: AoE Targeting Bypass & Mid-Battle Grid Recalculations.
 * - FIX: Help Window dynamically hides during targeting to prevent overlap.
 * - FIX: Destroys phantom native Window_BattleEnemy cursor rect collision.
 * - FIX: Skill/Item cursor overrides Phase 1 to remain visible while targeting.
 * - FIX: Adjusted targeting cursor Y-buffer to -12 for perfect alignment.
 * - NEW: AoE Target Sorting (Forces Left-to-Right, Top-to-Bottom damage sweeps).
 * - UPGRADE: Strict 2D Left/Right horizontal wrapping (skips empty grid cells).
 * - UPGRADE: Strict 2D Up/Down vertical wrapping within columns.
 * - UPGRADE: Command Remember integrated. Memorizes grid coordinates per-actor.
 * - FIX: Changed Command Remember check to ConfigManager to fix TypeError crash.
 * - UPGRADE: Added "Screen" parameter to <Anim: Name, Sound, Scope> for field-wide casts.
 * - FIX: Restored native wait command to displayAction after scope timing fix.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration & Targeting Constants
    //=============================================================================
    
    const TARGETING_CONFIG = {
        BUFFER_X: -4,
        BUFFER_Y: -12, 
        NAME_COLOR_INDEX: 10 
    };

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
            this.startMotion("guard"); 
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

            e._gridW = w;
            e._gridH = h;

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
                        
                        e._gridX = x;
                        e._gridY = y;
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

    const _Game_Enemy_appear = Game_Enemy.prototype.appear;
    Game_Enemy.prototype.appear = function() {
        _Game_Enemy_appear.call(this);
        $gameTroop.arrangeEnemyGrid();
    };

    const _Game_Enemy_transform = Game_Enemy.prototype.transform;
    Game_Enemy.prototype.transform = function(enemyId) {
        _Game_Enemy_transform.call(this, enemyId);
        $gameTroop.arrangeEnemyGrid();
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
        if (!actor) return;
        
        const guns = actor.weapons().filter(weapon => weapon && weapon.wtypeId === 8);
        const hasGun = guns.length > 0;
        const isFarmer = actor._classId === 4; 
        const isCultivator = actor._classId === 6; 

        let lines = 0;
        let drawMode = "none";

        let liveAmmoData = [];
        if (hasGun) {
            for (let i = 0; i <= 1; i++) {
                const weapon = actor.equips()[i];
                if (weapon && weapon.wtypeId === 8) {
                    let maxAmmo = 0;
                    if (weapon.note) {
                        const match = weapon.note.match(/<max ammo:\s*(\d+)>/i);
                        if (match) maxAmmo = parseInt(match[1]);
                    }
                    
                    const currentAmmo = (actor._ammo && actor._ammo[i] !== undefined) ? actor._ammo[i] : maxAmmo;
                    
                    liveAmmoData.push({
                        name: weapon.name,
                        iconIndex: weapon.iconIndex,
                        currentAmmo: currentAmmo,
                        maxAmmo: maxAmmo
                    });
                }
            }
        }

        const dummyElement = { name: "Fire", iconIndex: 97 };
        const dummySeeds = [
            { name: "Brandywine", turns: 3 },
            { name: "Moon & Stars", turns: 1 },
            { name: "Slimes", turns: 0 }
        ];

        if (hasGun) {
            drawMode = "ammo";
            lines = liveAmmoData.length || 1;
        } else if (isCultivator) {
            drawMode = "cultivator";
            lines = 1;
        } else if (isFarmer) {
            drawMode = "farmer";
            lines = dummySeeds.length > 0 ? dummySeeds.length : 1;
        }

        const newHeight = lines > 0 ? this.fittingHeight(lines) : 0;
        if (this.height !== newHeight) {
            this.height = newHeight;
            if (newHeight > 0) {
                this.createContents();
            }
        }

        if (drawMode === "none" || newHeight === 0) return;

        const commandRect = SceneManager._scene.actorCommandWindowRect();
        this.y = commandRect.y - this.height;

        this.resetFontSettings();

        if (drawMode === "ammo") {
            for (let i = 0; i < liveAmmoData.length; i++) {
                const y = i * this.lineHeight();
                this.drawIcon(liveAmmoData[i].iconIndex, 0, y + 2);
                this.changeTextColor(ColorManager.normalColor());
                this.drawText(liveAmmoData[i].name, 36, y, this.innerWidth - 80, "left");
                this.drawText(`${liveAmmoData[i].currentAmmo}/${liveAmmoData[i].maxAmmo}`, 0, y, this.innerWidth - 4, "right");
            }
        } else if (drawMode === "cultivator") {
            this.drawIcon(dummyElement.iconIndex, 0, 2);
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(dummyElement.name, 36, 0, this.innerWidth - 36, "left");
        } else if (drawMode === "farmer") {
            if (dummySeeds.length === 0) {
                this.changeTextColor(ColorManager.systemColor());
                this.drawText("No seeds planted", 0, 0, this.innerWidth, "center");
            } else {
                for (let i = 0; i < dummySeeds.length; i++) {
                    const y = i * this.lineHeight();
                    this.changeTextColor(ColorManager.normalColor());
                    this.drawText(dummySeeds[i].name, 0, y, this.innerWidth - 30, "left");
                    this.drawText(dummySeeds[i].turns, 0, y, this.innerWidth - 4, "right");
                }
            }
        }
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

            const hasGun = actor.weapons().some(weapon => weapon && weapon.wtypeId === 8);
            if (hasGun || actor._classId === 4 || actor._classId === 6) {
                this._contextWindow.show(); 
            } else {
                this._contextWindow.hide();
            }
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
        if (this._mpInfoWindow) this._mpInfoWindow.hide();
        if (this._contextWindow) this._contextWindow.hide();
        if (this._helpWindow) this._helpWindow.hide(); 
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

    const _Window_BattleLog_startAction = Window_BattleLog.prototype.startAction;
    Window_BattleLog.prototype.startAction = function(subject, action, targets) {
        this._currentActionItem = action.item(); 
        _Window_BattleLog_startAction.call(this, subject, action, targets);
    };

    // Restored the native push("wait") command after scope fix
    const _Window_BattleLog_displayAction = Window_BattleLog.prototype.displayAction;
    Window_BattleLog.prototype.displayAction = function(subject, item) {
        const action = subject.currentAction();
        if (action && action._isCirclePulse) return; // Silent execution for End-of-Turn pulses
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
        this.setBlendColor([255, 255, 255, 128]); 
        this.opacity *= this._effectDuration / (this._effectDuration + 1);
    };

    //=============================================================================
    // 10. Custom Retro 4-Frame Animations (VX Ace Timing Hijack)
    //=============================================================================

    function Sprite_RetroAnim() {
        this.initialize(...arguments);
    }
    Sprite_RetroAnim.prototype = Object.create(Sprite.prototype);
    Sprite_RetroAnim.prototype.constructor = Sprite_RetroAnim;

    Sprite_RetroAnim.prototype.initialize = function(targetSprite, animName) {
        Sprite.prototype.initialize.call(this);
        this._targetSprite = targetSprite;
        
        this.bitmap = ImageManager.loadSystem(animName);
        this.bitmap.smooth = false; 
        
        this.anchor.x = 0.5;
        this.anchor.y = 0.5; 
        this.z = 8; 
        
        this.visible = false; 
        
        this._tick = 0;
        this._frameIndex = 0;
        this._maxFrames = 4;
        this._ticksPerFrame = 4; 
        this._isPlaying = true;
    };

    Sprite_RetroAnim.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (!this._isPlaying) return;
        if (!this.bitmap || !this.bitmap.isReady()) return; 
        
        if (!this.visible) {
            this.visible = true;
        }
        
        this.updatePosition();
        this.updateFrame();
        
        this._tick++;
        if (this._tick >= this._ticksPerFrame) {
            this._tick = 0;
            this._frameIndex++;
            if (this._frameIndex >= this._maxFrames) {
                this._isPlaying = false;
                if (this.parent) this.parent.removeChild(this);
            }
        }
    };

    Sprite_RetroAnim.prototype.updatePosition = function() {
        if (this._targetSprite) {
            if (this._targetSprite === "screen") {
                this.x = Graphics.boxWidth / 2;
                this.y = Graphics.boxHeight / 2;
            } else {
                this.x = this._targetSprite.x;
                let yOffset = 0;
                if (this._targetSprite instanceof Sprite_Actor) {
                    yOffset = 24; 
                } else if (this._targetSprite.bitmap) {
                    yOffset = this._targetSprite.bitmap.height / 2; 
                } else {
                    yOffset = 32; 
                }
                this.y = this._targetSprite.y - yOffset;
            }
        }
    };

    Sprite_RetroAnim.prototype.updateFrame = function() {
        const frameW = this.bitmap.width / 4;
        const frameH = this.bitmap.height;
        this.setFrame(this._frameIndex * frameW, 0, frameW, frameH);
    };

    Sprite_RetroAnim.prototype.isPlaying = function() {
        return this._isPlaying;
    };

    const _Spriteset_Base_initialize = Spriteset_Base.prototype.initialize;
    Spriteset_Base.prototype.initialize = function() {
        this._retroAnimations = [];
        _Spriteset_Base_initialize.call(this);
    };

    const _Spriteset_Base_update = Spriteset_Base.prototype.update;
    Spriteset_Base.prototype.update = function() {
        _Spriteset_Base_update.call(this);
        this._retroAnimations = this._retroAnimations.filter(sprite => sprite.isPlaying());
    };

    const _Spriteset_Base_isAnimationPlaying = Spriteset_Base.prototype.isAnimationPlaying;
    Spriteset_Base.prototype.isAnimationPlaying = function() {
        return _Spriteset_Base_isAnimationPlaying.call(this) || this._retroAnimations.length > 0;
    };

    const _Window_BattleLog_showAnimation = Window_BattleLog.prototype.showAnimation;
    Window_BattleLog.prototype.showAnimation = function(subject, targets, animationId) {
        const item = this._currentActionItem;
        
        if (item && item.meta && item.meta.Anim) {
            const tagData = item.meta.Anim.split(",");
            const animName = String(tagData[0]).trim();
            const soundName = tagData.length > 1 ? String(tagData[1]).trim() : null;
            const scope = tagData.length > 2 ? String(tagData[2]).trim().toLowerCase() : "target";
            
            if (this._spriteset) {
                let soundPlayed = false;
                
                if (scope === "screen") {
                    const animSprite = new Sprite_RetroAnim("screen", animName);
                    this._spriteset.addChild(animSprite);
                    this._spriteset._retroAnimations.push(animSprite);
                    if (soundName) AudioManager.playSe({ name: soundName, volume: 90, pitch: 100, pan: 0 });
                } else {
                    targets.forEach(target => {
                        const targetSprite = this._spriteset.findTargetSprite(target);
                        if (targetSprite && targetSprite.parent) {
                            const animSprite = new Sprite_RetroAnim(targetSprite, animName);
                            targetSprite.parent.addChild(animSprite);
                            this._spriteset._retroAnimations.push(animSprite);
                            
                            if (soundName && !soundPlayed) {
                                AudioManager.playSe({ name: soundName, volume: 90, pitch: 100, pan: 0 });
                                soundPlayed = true; 
                            }
                        }
                    });
                }
            }
        } else {
            _Window_BattleLog_showAnimation.call(this, subject, targets, animationId);
        }
    };

    //=============================================================================
    // 11. Dynamic Battle Status Refresh (HP/MP Sync)
    //=============================================================================

    const _Sprite_Battler_setupDamagePopup = Sprite_Battler.prototype.setupDamagePopup;
    Sprite_Battler.prototype.setupDamagePopup = function() {
        const requested = this._battler && this._battler.isDamagePopupRequested();
        _Sprite_Battler_setupDamagePopup.call(this);
        
        if (requested && this._battler.isActor() && SceneManager._scene instanceof Scene_Battle) {
            const statusWindow = SceneManager._scene._statusWindow;
            if (statusWindow) {
                const index = $gameParty.battleMembers().indexOf(this._battler);
                if (index >= 0) statusWindow.redrawItem(index);
            }
        }
    };

    const _Game_BattlerBase_paySkillCost = Game_BattlerBase.prototype.paySkillCost;
    Game_BattlerBase.prototype.paySkillCost = function(skill) {
        _Game_BattlerBase_paySkillCost.call(this, skill);
        
        if (this.isActor() && $gameParty.inBattle() && SceneManager._scene instanceof Scene_Battle) {
            const statusWindow = SceneManager._scene._statusWindow;
            if (statusWindow) {
                const index = $gameParty.battleMembers().indexOf(this);
                if (index >= 0) statusWindow.redrawItem(index);
            }
        }
    };

    //=============================================================================
    // 12. Visual Grid Enemy Targeting (Spatial Navigation)
    //=============================================================================

    function Sprite_GridTargetCursor() {
        this.initialize(...arguments);
    }
    Sprite_GridTargetCursor.prototype = Object.create(Sprite.prototype);
    Sprite_GridTargetCursor.prototype.constructor = Sprite_GridTargetCursor;

    Sprite_GridTargetCursor.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this.bitmap = ImageManager.loadSystem("MenuCursor");
        this.z = 200;
        this.visible = false;
        this._targetEnemy = null;
    };

    Sprite_GridTargetCursor.prototype.setTarget = function(enemy) {
        this._targetEnemy = enemy;
        if (this._targetEnemy) this.updatePosition();
    };

    Sprite_GridTargetCursor.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (this.visible && this._targetEnemy) this.updatePosition();
    };

    Sprite_GridTargetCursor.prototype.updatePosition = function() {
        const CELL_W = 64;
        const CELL_H = 64;
        const leftX = this._targetEnemy._screenX - (CELL_W * this._targetEnemy._gridW / 2.0);
        const topY = this._targetEnemy._screenY - (CELL_H * this._targetEnemy._gridH);
        
        this.x = leftX + TARGETING_CONFIG.BUFFER_X;
        this.y = topY + TARGETING_CONFIG.BUFFER_Y;
    };

    function Window_TargetEnemyName() {
        this.initialize(...arguments);
    }
    Window_TargetEnemyName.prototype = Object.create(Window_Base.prototype);
    Window_TargetEnemyName.prototype.constructor = Window_TargetEnemyName;

    Window_TargetEnemyName.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.frameVisible = true;
        this.opacity = 255;
        this.backOpacity = 255;
        this.hide();
    };
    Window_TargetEnemyName.prototype.drawBackgroundRect = function() {};

    Window_TargetEnemyName.prototype.setEnemy = function(enemy) {
        this.contents.clear();
        if (!enemy) return;
        this.changeTextColor(ColorManager.textColor(TARGETING_CONFIG.NAME_COLOR_INDEX));
        this.drawText(enemy.name(), 0, 0, this.innerWidth, "center");
    };

    const _Window_BattleEnemy_initialize = Window_BattleEnemy.prototype.initialize;
    Window_BattleEnemy.prototype.initialize = function(rect) {
        _Window_BattleEnemy_initialize.call(this, rect);
        this.x = Graphics.boxWidth; 
        this.opacity = 0;
        this.visible = false;
    };

    // Neutralize native MZ invisible selection box
    Window_BattleEnemy.prototype.updateCursor = function() {};
    Window_BattleEnemy.prototype.drawItem = function(index) {};

    const _Window_BattleEnemy_select = Window_BattleEnemy.prototype.select;
    Window_BattleEnemy.prototype.select = function(index) {
        _Window_BattleEnemy_select.call(this, index);
        this.updateCustomUI();
    };

    Window_BattleEnemy.prototype.updateCustomUI = function() {
        if (!this._customGridCursor || !this._nameWindow) return;
        const enemy = this.enemy();
        if (enemy) {
            this._customGridCursor.setTarget(enemy);
            this._customGridCursor.visible = true;
            this._nameWindow.setEnemy(enemy);
            this._nameWindow.show();
        }
    };

    // Strict 2D Coordinate Checker
    Window_BattleEnemy.prototype.getEnemyAt = function(x, y) {
        return $gameTroop.aliveMembers().find(e => 
            x >= e._gridX && x < (e._gridX + e._gridW) &&
            y >= e._gridY && y < (e._gridY + e._gridH)
        );
    };

    // Rule 0: Audio feedback unconditional on button press
    Window_BattleEnemy.prototype.cursorDown = function(wrap) {
        SoundManager.playCursor();
        this.processDirUpDown(1);
    };

    Window_BattleEnemy.prototype.cursorUp = function(wrap) {
        SoundManager.playCursor();
        this.processDirUpDown(-1);
    };

    // Vertical Movement (Locks to column, wraps row)
    Window_BattleEnemy.prototype.processDirUpDown = function(dirY) {
        const ce = this.enemy();
        if (!ce) return;
        
        const checkY = (ce._gridY + dirY + 2) % 2;
        const foundEnemy = this.getEnemyAt(ce._gridX, checkY);

        if (foundEnemy && foundEnemy !== ce) {
            this.select($gameTroop.aliveMembers().indexOf(foundEnemy));
        }
    };

    Window_BattleEnemy.prototype.cursorRight = function(wrap) {
        SoundManager.playCursor();
        this.processDirLeftRight(1);
    };

    Window_BattleEnemy.prototype.cursorLeft = function(wrap) {
        SoundManager.playCursor();
        this.processDirLeftRight(-1);
    };

    // Horizontal Movement (Locks to row, skips empty space)
    Window_BattleEnemy.prototype.processDirLeftRight = function(dirX) {
        const ce = this.enemy();
        if (!ce) return;
        
        const currentY = ce._gridY;
        
        for (let offset = 1; offset <= 3; offset++) {
            const checkX = (ce._gridX + (offset * dirX) + 4) % 4;
            const foundEnemy = this.getEnemyAt(checkX, currentY);
            
            if (foundEnemy && foundEnemy !== ce) {
                this.select($gameTroop.aliveMembers().indexOf(foundEnemy));
                break;
            }
        }
    };

    const _Window_BattleEnemy_hide = Window_BattleEnemy.prototype.hide;
    Window_BattleEnemy.prototype.hide = function() {
        if (this._customGridCursor) this._customGridCursor.visible = false;
        if (this._nameWindow) this._nameWindow.hide();
        _Window_BattleEnemy_hide.call(this);
    };

    const _Scene_Battle_createEnemyWindow = Scene_Battle.prototype.createEnemyWindow;
    Scene_Battle.prototype.createEnemyWindow = function() {
        _Scene_Battle_createEnemyWindow.call(this);
        
        this._customGridCursor = new Sprite_GridTargetCursor();
        this._spriteset.addChild(this._customGridCursor);
        
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(1, false);
        const rect = new Rectangle(0, 0, ww, wh);
        this._enemyNameWindow = new Window_TargetEnemyName(rect);
        this.addWindow(this._enemyNameWindow);

        this._enemyWindow._customGridCursor = this._customGridCursor;
        this._enemyWindow._nameWindow = this._enemyNameWindow;
    };

    // Override Scene flow to manage Help Window, Sub-Windows, and Command Memory
    Scene_Battle.prototype.selectEnemySelection = function() {
        const action = BattleManager.inputtingAction();
        
        // Instant AoE Bypass
        if (action && action.isForAll()) {
            $gameParty.select(null);
            this.onEnemyOk();
            return;
        }

        this._enemyWindow.refresh();
        this._enemyWindow.show();
        this._enemyWindow.activate();

        const members = $gameTroop.aliveMembers();
        let bestIndex = 0;
        
        if (members.length > 0) {
            const actor = BattleManager.actor();
            const remember = ConfigManager.commandRemember;
            let foundMemory = false;
            
            // Check Actor-Specific Command Memory
            if (remember && actor && actor._lastTargetGridX !== undefined) {
                const memX = actor._lastTargetGridX;
                const memY = actor._lastTargetGridY;
                
                const memEnemy = members.find(e => 
                    memX >= e._gridX && memX < (e._gridX + e._gridW) &&
                    memY >= e._gridY && memY < (e._gridY + e._gridH)
                );
                
                if (memEnemy) {
                    bestIndex = members.indexOf(memEnemy);
                    foundMemory = true;
                }
            }
            
            // Fallback to geometric top-leftmost living enemy
            if (!foundMemory) {
                let bestX = 999;
                let bestY = 999;
                members.forEach((enemy, i) => {
                    if (enemy._gridX < bestX || (enemy._gridX === bestX && enemy._gridY < bestY)) {
                        bestX = enemy._gridX;
                        bestY = enemy._gridY;
                        bestIndex = i;
                    }
                });
            }
        }
        
        this._enemyWindow.select(bestIndex);

        if (this._helpWindow) this._helpWindow.hide();
    };

    const _Scene_Battle_onSelectAction = Scene_Battle.prototype.onSelectAction;
    Scene_Battle.prototype.onSelectAction = function() {
        const action = BattleManager.inputtingAction();
        if (action && action.needsSelection() && action.isForOpponent()) {
            // Bypass hiding skill/item window natively here so they persist during targeting
            this.selectEnemySelection();
        } else {
            _Scene_Battle_onSelectAction.call(this);
        }
    };

    const _Scene_Battle_onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
    Scene_Battle.prototype.onEnemyCancel = function() {
        _Scene_Battle_onEnemyCancel.call(this);
        if (this._helpWindow) this._helpWindow.show();
    };

    const _Scene_Battle_onEnemyOk = Scene_Battle.prototype.onEnemyOk;
    Scene_Battle.prototype.onEnemyOk = function() {
        
        // Save the precise target coordinate to the specific Actor's memory
        const enemy = this._enemyWindow.enemy();
        const actor = BattleManager.actor();
        if (enemy && actor) {
            actor._lastTargetGridX = enemy._gridX;
            actor._lastTargetGridY = enemy._gridY;
        }
        
        _Scene_Battle_onEnemyOk.call(this);
        if (this._skillWindow) this._skillWindow.hide();
        if (this._itemWindow) this._itemWindow.hide();
        if (this._helpWindow) this._helpWindow.show();
    };

    //=============================================================================
    // 13. Sub-Window Cursor Visibility Persistence Override
    //=============================================================================

    // Forces the cursor to remain visible when deactivated during the targeting phase
    const _Window_SkillList_refreshCursor = Window_SkillList.prototype.refreshCursor;
    Window_SkillList.prototype.refreshCursor = function() {
        _Window_SkillList_refreshCursor.call(this);
        if (!this.active && this.index() >= 0 && $gameParty.inBattle() && this.visible) {
            if (this._cursorSprite) this._cursorSprite.visible = true;
        }
    };

    const _Window_ItemList_refreshCursor = Window_ItemList.prototype.refreshCursor;
    Window_ItemList.prototype.refreshCursor = function() {
        _Window_ItemList_refreshCursor.call(this);
        if (!this.active && this.index() >= 0 && $gameParty.inBattle() && this.visible) {
            if (this._cursorSprite) this._cursorSprite.visible = true;
        }
    };

    //=============================================================================
    // 14. AoE Target Sorting (Grid Order Consistency)
    //=============================================================================

    // Forces multi-target actions to calculate and popup Left-to-Right, Top-to-Bottom
    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        let targets = _Game_Action_makeTargets.call(this);
        
        // Only sort if there are multiple targets and they are enemies
        if (targets.length > 1 && targets[0] && targets[0].isEnemy()) {
            targets.sort((a, b) => {
                const aY = a._gridY !== undefined ? a._gridY : 99;
                const bY = b._gridY !== undefined ? b._gridY : 99;
                const aX = a._gridX !== undefined ? a._gridX : 99;
                const bX = b._gridX !== undefined ? b._gridX : 99;
                
                // Primary Sort: Top to Bottom (Row)
                if (aY !== bY) return aY - bY;
                
                // Secondary Sort: Left to Right (Column)
                return aX - bX;
            });
        }
        
        return targets;
    };

})();