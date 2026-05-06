/*:
 * @target MZ
 * @plugindesc Phase 2: Battle UI & Sprite Architecture v1.0.
 * @author Custom Build
 * * @help
 * Implements:
 * - Divorced absolute battlefield grid.
 * - Rear-View Actor Sprites (Horizontal layout, Y-Axis step animations).
 * - Split Battle HUD (352px Status / 192px Command).
 * - Disappearing Contextual Info Windows (MP Info & Class Context).
 */

(() => {
    'use strict';

    //=============================================================================
    // 1. Rear-View Sprite Grid & Animation Overrides
    //=============================================================================

    // Erase standard MZ staggering and lock actors to a centralized horizontal row
    Sprite_Actor.prototype.setActorHome = function(index) {
        const partySize = $gameParty.maxBattleMembers();
        const combatBlockWidth = 384; // The total width the party will occupy
        const startX = (Graphics.boxWidth - combatBlockWidth) / 2; // Center the block
        const spacing = combatBlockWidth / partySize;
        
        // Center each actor within their designated slice of the block
        const x = startX + (index * spacing) + (spacing / 2);
        
        // Absolute horizon line, safely above the highest possible popping UI window
        const y = 180; 
        
        this.setHome(x, y);
    };

    // Actors step UP (towards the enemy) instead of LEFT
    Sprite_Actor.prototype.stepForward = function() {
        this.startMove(0, -48, 12); // X: 0, Y: -48 (Up)
    };

    // Return to the absolute Y horizon
    Sprite_Actor.prototype.stepBack = function() {
        this.startMove(0, 0, 12); 
    };

    // Retreat moves them off the bottom of the screen
    Sprite_Actor.prototype.retreat = function() {
        this.startMove(0, 300, 30); 
    };

    //=============================================================================
    // 2. Custom Window Definitions (MP Info & Context Help)
    //=============================================================================

    // Create the MP Info Window Class
    function Window_BattleMPInfo() {
        this.initialize(...arguments);
    }
    Window_BattleMPInfo.prototype = Object.create(Window_Base.prototype);
    Window_BattleMPInfo.prototype.constructor = Window_BattleMPInfo;

    Window_BattleMPInfo.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.hide(); // Hidden by default until Actor Selection
    };

    Window_BattleMPInfo.prototype.refresh = function(actor) {
        this.contents.clear();
        if (actor) {
            // Note: We will hook up the actual <MP_Help> database tag parsing in Phase 3.
            // For now, this is a placeholder string to prove the UI grid works.
            this.changeTextColor(ColorManager.systemColor());
            this.drawText("Class MP Restore Condition:", 0, 0, this.innerWidth);
            this.resetTextColor();
        }
    };

    // Create the Contextual Help Window Class
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
        if (actor) {
            // Placeholder for Phase 3 Ammo/Seed/Element logic
            this.drawText("Context Ammo", 0, 0, this.innerWidth, "center");
        }
    };

    //=============================================================================
    // 3. Battle Scene Window Rectangles (The 65/35 Split)
    //=============================================================================

    const STATUS_WIDTH = 352;
    const COMMAND_WIDTH = Graphics.boxWidth - STATUS_WIDTH; // 192px

    Scene_Battle.prototype.statusWindowRect = function() {
        const ww = STATUS_WIDTH;
        const wh = this.windowAreaHeight();
        const wx = 0;
        const wy = Graphics.boxHeight - wh;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.actorCommandWindowRect = function() {
        const ww = COMMAND_WIDTH;
        const wh = this.windowAreaHeight();
        const wx = STATUS_WIDTH;
        const wy = Graphics.boxHeight - wh;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.mpInfoWindowRect = function() {
        const ww = STATUS_WIDTH;
        const wh = this.calcWindowHeight(1, false); // 1 line tall
        const wx = 0;
        const wy = this.statusWindowRect().y - wh; // Sits directly on top of Status
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.contextWindowRect = function() {
        const ww = COMMAND_WIDTH;
        const wh = this.calcWindowHeight(1, false); // Will dynamically size in Phase 3
        const wx = STATUS_WIDTH;
        const wy = this.actorCommandWindowRect().y - wh; // Sits directly on top of Command
        return new Rectangle(wx, wy, ww, wh);
    };

    //=============================================================================
    // 4. Injecting the New Windows into the Scene
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

    //=============================================================================
    // 5. Window Visibility Logic (State A vs State B)
    //=============================================================================

    // Refresh and Show the info windows when the Command Window activates
    const _Scene_Battle_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function() {
        _Scene_Battle_startActorCommandSelection.call(this);
        
        const actor = BattleManager.actor();
        if (actor) {
            this._mpInfoWindow.refresh(actor);
            this._contextWindow.refresh(actor);
            this._mpInfoWindow.show();
            this._contextWindow.show();
        }
    };

    // Hide the info windows when the Command Window is closed/canceled
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

})();