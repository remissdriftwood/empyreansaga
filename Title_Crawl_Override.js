/*:
 * @target MZ
 * @plugindesc Phase 7: Title Intro Text Crawl Customization v2.0 (Centered + BGM Only)
 * @author Custom Build
 */

(() => {
    'use strict';

    //=============================================================================
    // 1. Scene_Title: BGM Carryover Override
    //=============================================================================
    Scene_Title.prototype.commandNewGame = function() {
        DataManager.setupNewGame();
        this._commandWindow.close();
        
        // Custom Fade-out (Bypasses BGM to allow carryover)
        const time = this.slowFadeSpeed() / 60;
        AudioManager.fadeOutBgs(time);
        AudioManager.fadeOutMe(time);
        this.startFadeOut(this.slowFadeSpeed());
        
        SceneManager.goto(Scene_Map);
    };

    //=============================================================================
    // 2. Window_ScrollText: Two-Pass Centering System
    //=============================================================================
    Window_ScrollText.prototype.refresh = function() {
        // --- Pass 1: Measure & Calculate Canvas Size ---
        this._lineWidths = [];
        this._currentLineIndex = 0;
        this._isMeasuringPass = true; 
        
        const measureState = this.createTextState(this._text, 0, 0, 0);
        measureState.drawing = false;
        this.processAllText(measureState);
        
        // Flush the final line and record total required height
        this._lineWidths[this._currentLineIndex] = measureState.x; 
        this._allTextHeight = measureState.y + measureState.height; 
        
        this._isMeasuringPass = false; 
        
        // --- Dynamic Canvas Resizing ---
        this.createContents();
        this.contents.clear();
        this.origin.y = -this.height; 

        // --- Pass 2: Draw ---
        this._currentLineIndex = 0;
        this.resetFontSettings();
        const drawState = this.createTextState(this._text, 0, 0, 0);
        drawState.drawing = true;
        
        // Center the very first line before processing starts
        const firstW = this._lineWidths[0] || 0;
        drawState.x = Math.max(0, (this.innerWidth - firstW) / 2);
        drawState.startX = drawState.x;
        
        this.processAllText(drawState);
    };

    const _Window_ScrollText_processNewLine = Window_ScrollText.prototype.processNewLine;
    Window_ScrollText.prototype.processNewLine = function(textState) {
        
        // 1. Log the width of the line that just finished (Measuring pass only)
        if (this._isMeasuringPass) {
            this._lineWidths = this._lineWidths || [];
            this._currentLineIndex = this._currentLineIndex || 0;
            this._lineWidths[this._currentLineIndex] = textState.x;
        }
        
        // 2. Do the native new line processing (y += height, etc.)
        _Window_ScrollText_processNewLine.call(this, textState);
        
        // 3. Set up the X coordinate for the new line
        if (this._isMeasuringPass) {
            this._currentLineIndex++;
            textState.x = 0;
            textState.startX = 0;
        } else if (textState.drawing) {
            // Actively adjust alignment during the physical drawing pass
            this._currentLineIndex = this._currentLineIndex || 0; 
            this._currentLineIndex++;
            
            const w = (this._lineWidths && this._lineWidths[this._currentLineIndex]) ? this._lineWidths[this._currentLineIndex] : 0;
            textState.x = Math.max(0, (this.innerWidth - w) / 2);
            textState.startX = textState.x;
        }
    };

})();