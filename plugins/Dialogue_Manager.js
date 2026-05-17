/*:
 * @target MZ
 * @plugindesc Notion JSON to MZ Dialogue Bridge
 * @author Empyrean Saga
 *
 * @help Dialogue_Manager.js
 * * This plugin loads data/Dialogue.json (generated via Node.js)
 * and executes complex branching dialogue via a single Plugin Command.
 *
 * @command PlayConversation
 * @text Play Conversation
 * @desc Plays a conversation sequence from Dialogue.json
 *
 * @arg ConversationID
 * @text Conversation ID
 * @desc The grouping ID from Notion (e.g., NEW_PLAYER_INTRO)
 * @type string
 */

var $dataDialogue = null;

(() => {
    const pluginName = "Dialogue_Manager";

    // =========================================================================
    // 1. Database Loading
    // =========================================================================
    const alias_DataManager_loadDatabase = DataManager.loadDatabase;
    DataManager.loadDatabase = function() {
        alias_DataManager_loadDatabase.call(this);
        DataManager.loadDataFile('$dataDialogue', 'Dialogue.json');
    };

    // =========================================================================
    // 2. Plugin Command Registration
    // =========================================================================
    PluginManager.registerCommand(pluginName, "PlayConversation", function(args) {
        const convoId = args.ConversationID;
        if (!$dataDialogue || !$dataDialogue[convoId]) {
            console.warn(`[Dialogue Manager] Conversation ID not found: ${convoId}`);
            return;
        }
        this.setupDialogueConversation(convoId);
    });

    // =========================================================================
    // 3. Interpreter Injection (The Engine Logic)
    // =========================================================================
    
    // Clear custom state when the interpreter resets
    const alias_Game_Interpreter_clear = Game_Interpreter.prototype.clear;
    Game_Interpreter.prototype.clear = function() {
        alias_Game_Interpreter_clear.call(this);
        this._dmConvoId = null;
        this._dmNodeIndex = 0;
        this._dmPendingRoute = null;
    };

    // Initialize the state machine
    Game_Interpreter.prototype.setupDialogueConversation = function(convoId, startIndex = 0) {
        this._dmConvoId = convoId;
        this._dmNodeIndex = startIndex;
        this.setWaitMode('custom_dialogue');
        this.processNextDialogueNode();
    };

    // Process a single JSON node
    Game_Interpreter.prototype.processNextDialogueNode = function() {
        const convo = $dataDialogue[this._dmConvoId];
        
        // Terminate if we reached the end of the array
        if (!convo || this._dmNodeIndex >= convo.length) {
            this.setWaitMode('');
            return; 
        }

        const node = convo[this._dmNodeIndex];

        // --- CONDITION SWITCH EVALUATION ---
        if (node.conditionSwitch) {
            // Uses Regex to pull the leading number from strings like "005_MET"
            const match = node.conditionSwitch.match(/^0*(\d+)/); 
            if (match) {
                const switchId = parseInt(match[1], 10);
                if (!$gameSwitches.value(switchId)) {
                    // Switch is OFF, skip this node and proceed to next
                    this._dmNodeIndex++;
                    this.processNextDialogueNode();
                    return;
                }
            }
        }

        $gameMessage.newPage();

        // --- SPEAKER NAME ---
        if (node.speaker && node.speaker.trim() !== "") {
            $gameMessage.setSpeakerName(node.speaker);
        } else {
            $gameMessage.setSpeakerName(""); // Suppresses namebox
        }

        // --- TEXT ---
        const lines = node.text.split('\n');
        for (const line of lines) {
            $gameMessage.add(line);
        }

        // --- ACTIONS (e.g., [Wait:60]) ---
        if (node.actions && node.actions.length > 0) {
            for (const action of node.actions) {
                if (action.type.toLowerCase() === 'wait') {
                    const frames = parseInt(action.params[0], 10);
                    this.wait(frames); // Injects MZ wait command
                }
                // (Space to add [Move] or [Transfer] mapping later)
            }
        }

        // --- CHOICES & ROUTING ---
        if (node.isChoice && node.choices && node.choices.length > 0) {
            const choiceLabels = node.choices.map(c => c.label);
            $gameMessage.setChoices(choiceLabels, 0, -1);
            
            // When a player clicks a choice, store the target node destination
            $gameMessage.setChoiceCallback((selectionIndex) => {
                const selectedChoice = node.choices[selectionIndex];
                this._dmPendingRoute = selectedChoice.targetNode;
            });
        } else if (node.nextNode) {
            // Explicit override jump
            this._dmPendingRoute = node.nextNode;
        } else {
            // Default sequential progression
            this._dmPendingRoute = null;
            this._dmNodeIndex++;
        }
    };

    // Locate the target node ID and jump to it
    Game_Interpreter.prototype.routeDialogueNode = function(targetNodeId) {
        const convo = $dataDialogue[this._dmConvoId];
        const targetIndex = convo.findIndex(n => n.nodeId === targetNodeId);
        
        if (targetIndex !== -1) {
            this.setupDialogueConversation(this._dmConvoId, targetIndex);
        } else {
            console.error(`[Dialogue Manager] Target Node ID not found: ${targetNodeId}`);
            this.setWaitMode(''); // Release interpreter to prevent softlock
        }
    };

    // Custom Wait Mode override to keep Interpreter paused while our sequence runs
    const alias_Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === 'custom_dialogue') {
            if ($gameMessage.isBusy()) return true; // Hold until player advances text/makes choice
            
            // Once message window closes, route or advance
            if (this._dmPendingRoute) {
                this.routeDialogueNode(this._dmPendingRoute);
                this._dmPendingRoute = null;
            } else {
                this.processNextDialogueNode();
            }
            
            // Keep waiting if we queued more text, otherwise release
            if (this._waitMode === 'custom_dialogue') return true;
            return false;
        }
        return alias_Game_Interpreter_updateWaitMode.call(this);
    };
})();