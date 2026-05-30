/*:
 * @target MZ
 * @plugindesc Notion JSON to MZ Dialogue Bridge
 * @author Empyrean Saga
 *
 * @param ResultVariableID
 * @text Result Variable ID
 * @desc The Game Variable used to store EXIT codes from Notion choices.
 * @type variable
 * @default 1
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
 *
 * @command PlayItemMessage
 * @text Play Item Message
 * @desc Plays a system message and dynamically injects item data.
 *
 * @arg ConversationID
 * @text Conversation ID
 * @desc The grouping ID from Notion (e.g., SYS_ITEM_GET)
 * @type string
 *
 * @arg ItemType
 * @text Item Type
 * @desc Is it an Item, Weapon, or Armor?
 * @type select
 * @option Item
 * @value item
 * @option Weapon
 * @value weapon
 * @option Armor
 * @value armor
 * @default item
 *
 * @arg ItemID
 * @text Item ID
 * @desc The database ID of the item.
 * @type number
 * @default 1
 *
 * @arg Amount
 * @text Amount
 * @desc The amount of the item obtained.
 * @type number
 * @default 1
 *
 * @command PlayCurrencyMessage
 * @text Play Currency Message
 * @desc Plays a system message and dynamically injects a money amount.
 *
 * @arg ConversationID
 * @text Conversation ID
 * @desc The grouping ID from Notion (e.g., SYS_MONEY_GET)
 * @type string
 *
 * @arg Amount
 * @text Amount
 * @desc The amount of currency obtained.
 * @type number
 * @default 100
 *
 * @command OpenShop
 * @text Open Shop
 * @desc Opens a native shop screen using data mapped from Notion.
 *
 * @arg EntityID
 * @text Entity ID
 * @desc The Entity ID from Notion (e.g., NPC_BLACKSMITH_01)
 * @type string
 */

var $dataDialogue = null;
var $dataShops = null;

(() => {
    const pluginName = "Dialogue_Manager";
    
    // Grab the configured Variable ID from the Plugin Manager
    const parameters = PluginManager.parameters(pluginName);
    const resultVarId = Number(parameters['ResultVariableID'] || 1);

    // =========================================================================
    // 1. Database Loading
    // =========================================================================
    const alias_DataManager_loadDatabase = DataManager.loadDatabase;
    DataManager.loadDatabase = function() {
        alias_DataManager_loadDatabase.call(this);
        DataManager.loadDataFile('$dataDialogue', 'Dialogue.json');
        DataManager.loadDataFile('$dataShops', 'Shops.json');
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

    PluginManager.registerCommand(pluginName, "PlayItemMessage", function(args) {
        const convoId = args.ConversationID;
        if (!$dataDialogue || !$dataDialogue[convoId]) {
            console.warn(`[Dialogue Manager] Conversation ID not found: ${convoId}`);
            return;
        }
        
        this._dmInjectedItemType = args.ItemType;
        this._dmInjectedItemID = parseInt(args.ItemID, 10);
        this._dmInjectedAmount = parseInt(args.Amount, 10);
        
        this.setupDialogueConversation(convoId);
    });

    PluginManager.registerCommand(pluginName, "PlayCurrencyMessage", function(args) {
        const convoId = args.ConversationID;
        if (!$dataDialogue || !$dataDialogue[convoId]) {
            console.warn(`[Dialogue Manager] Conversation ID not found: ${convoId}`);
            return;
        }
        
        this._dmInjectedAmount = parseInt(args.Amount, 10);
        this.setupDialogueConversation(convoId);
    });

    PluginManager.registerCommand(pluginName, "OpenShop", function(args) {
        const entityId = args.EntityID;
        
        if (!$dataShops || !$dataShops[entityId]) {
            console.warn(`[Shop Manager] Shop data not found for Entity ID: ${entityId}`);
            return;
        }

        const goodsMatrix = $dataShops[entityId];
        
        SceneManager.push(Scene_Shop);
        SceneManager.prepareNextScene(goodsMatrix, false); 
    });

    // =========================================================================
    // 3. Interpreter Injection (The Engine Logic)
    // =========================================================================
    
    const alias_Game_Interpreter_clear = Game_Interpreter.prototype.clear;
    Game_Interpreter.prototype.clear = function() {
        alias_Game_Interpreter_clear.call(this);
        this._dmConvoId = null;
        this._dmNodeIndex = 0;
        this._dmPendingRoute = null;
        this._dmWaitingForRouteTarget = null;
        
        this._dmInjectedItemType = null;
        this._dmInjectedItemID = 0;
        this._dmInjectedAmount = -1;
    };

    Game_Interpreter.prototype.setupDialogueConversation = function(convoId, startIndex = 0) {
        this._dmConvoId = convoId;
        this._dmNodeIndex = startIndex;
        this.setWaitMode('custom_dialogue');
        this.processNextDialogueNode();
    };

    Game_Interpreter.prototype.processNextDialogueNode = function() {
        const convo = $dataDialogue[this._dmConvoId];
        
        if (!convo || this._dmNodeIndex >= convo.length) {
            this.setWaitMode('');
            return; 
        }

        const node = convo[this._dmNodeIndex];

        // --- CONDITION SWITCH CHECK ---
        if (node.conditionSwitch) {
            const match = node.conditionSwitch.match(/^0*(\d+)/); 
            if (match) {
                const switchId = parseInt(match[1], 10);
                if (!$gameSwitches.value(switchId)) {
                    this._dmNodeIndex++;
                    this.processNextDialogueNode();
                    return;
                }
            }
        }

        // --- DYNAMIC ACTOR SKIP LOGIC ---
        let skipNode = false;
        let speakerName = node.speaker || "";

        speakerName = speakerName.replace(/\{ACTOR_(\d+)\}/g, (match, p1) => {
            const actorIndex = parseInt(p1, 10) - 1; // 1-based to 0-based array index
            const partyMembers = $gameParty.members();
            
            if (actorIndex >= partyMembers.length) {
                skipNode = true; // Actor doesn't exist in party, trigger the skip
                return match; 
            }
            return partyMembers[actorIndex].name(); // Swap with dynamic name
        });

        // If the speaker is missing, silently proceed to the next sequential node
        if (skipNode) {
            this._dmPendingRoute = null; 
            this._dmNodeIndex++;
            this.processNextDialogueNode();
            return;
        }

        // --- RENDER TEXT WINDOW ---
        $gameMessage.newPage();
        $gameMessage.setSpeakerName(speakerName);

        // --- INJECTION LOGIC ---
        let processedText = node.text;

        // Resolve {ACTOR_X} tags within the dialogue text itself
        processedText = processedText.replace(/\{ACTOR_(\d+)\}/g, (match, p1) => {
            const actorIndex = parseInt(p1, 10) - 1;
            const partyMembers = $gameParty.members();
            if (actorIndex >= partyMembers.length) return ""; // Erase tag if missing
            return partyMembers[actorIndex].name();
        });
        
        // Item & Currency Injection
        if (this._dmInjectedItemID > 0) {
            let itemObj = null;
            if (this._dmInjectedItemType === 'item') itemObj = $dataItems[this._dmInjectedItemID];
            if (this._dmInjectedItemType === 'weapon') itemObj = $dataWeapons[this._dmInjectedItemID];
            if (this._dmInjectedItemType === 'armor') itemObj = $dataArmors[this._dmInjectedItemID];

            if (itemObj) {
                const replacement = `\\EI[${itemObj.iconIndex}] ${itemObj.name}`;
                processedText = processedText.replace(/\{ITEM\}/g, replacement);
            }
        }
        
        if (this._dmInjectedAmount > -1) {
            processedText = processedText.replace(/\{AMOUNT\}/g, this._dmInjectedAmount.toString());
        }

        const lines = processedText.split('\n');
        for (const line of lines) {
            $gameMessage.add(line);
        }

        // --- ACTIONS & CHOICES ---
        if (node.actions && node.actions.length > 0) {
            for (const action of node.actions) {
                const type = action.type.toLowerCase();
                
                if (type === 'wait') {
                    const frames = parseInt(action.params[0], 10);
                    this.wait(frames); 
                    continue;
                }

                // Parse Route/Stat Commands (e.g., "0:U-R" or "0:0")
                let targetId = 0;
                let cmdData = "";
                let secondaryData = ""; 

                if (action.params.length > 0) {
                    const firstPart = action.params[0].split(':');
                    targetId = parseInt(firstPart[0], 10) || 0;
                    cmdData = firstPart.length > 1 ? firstPart[1] : "";
                    secondaryData = action.params.length > 1 ? action.params[1] : ""; // Catches jump's comma
                }

                const moveCodes = { 'D': 1, 'L': 2, 'R': 3, 'U': 4 };
                const turnCodes = { 'D': 16, 'L': 17, 'R': 18, 'U': 19 };

                let list = [];
                let waitForCompletion = false;

                switch(type) {
                    case 'turn':
                    case 'turnnowait':
                        waitForCompletion = (type === 'turn');
                        const tDirs = cmdData.split('-');
                        for (const d of tDirs) {
                            if (turnCodes[d.toUpperCase()]) list.push({ code: turnCodes[d.toUpperCase()], parameters: [] });
                        }
                        break;
                    case 'move':
                    case 'movenowait':
                        waitForCompletion = (type === 'move');
                        const mDirs = cmdData.split('-');
                        for (const d of mDirs) {
                            if (moveCodes[d.toUpperCase()]) list.push({ code: moveCodes[d.toUpperCase()], parameters: [] });
                        }
                        break;
                    case 'jump':
                    case 'jumpnowait':
                        waitForCompletion = (type === 'jump');
                        const x = parseInt(cmdData, 10) || 0;
                        const y = parseInt(secondaryData, 10) || 0;
                        list.push({ code: 14, parameters: [x, y] });
                        break;
                    case 'speed':
                        list.push({ code: 29, parameters: [parseInt(cmdData, 10) || 4] });
                        break;
                    case 'freq':
                        list.push({ code: 30, parameters: [parseInt(cmdData, 10) || 3] });
                        break;
                }

                if (list.length > 0) {
                    this.dmApplyRoute(targetId, waitForCompletion, list);
                }
            }
        }

        if (node.isChoice && node.choices && node.choices.length > 0) {
            const choiceLabels = node.choices.map(c => c.label);
            $gameMessage.setChoices(choiceLabels, 0, -1);
            
            $gameMessage.setChoiceCallback((selectionIndex) => {
                const selectedChoice = node.choices[selectionIndex];
                this._dmPendingRoute = selectedChoice.targetNode;
            });
        } else if (node.nextNode) {
            this._dmPendingRoute = node.nextNode;
        } else {
            this._dmPendingRoute = null;
            this._dmNodeIndex++;
        }
    };

    Game_Interpreter.prototype.routeDialogueNode = function(targetNodeId) {
        if (targetNodeId.toUpperCase().startsWith('EXIT')) {
            const parts = targetNodeId.split(':');
            if (parts.length > 1) {
                const exitCode = parseInt(parts[1], 10);
                $gameVariables.setValue(resultVarId, exitCode);
            } else {
                $gameVariables.setValue(resultVarId, 0); 
            }
            this.setWaitMode('');
            return;
        }

        const convo = $dataDialogue[this._dmConvoId];
        const targetIndex = convo.findIndex(n => n.nodeId === targetNodeId);
        
        if (targetIndex !== -1) {
            this.setupDialogueConversation(this._dmConvoId, targetIndex);
        } else {
            console.error(`[Dialogue Manager] Target Node ID not found: ${targetNodeId}`);
            this.setWaitMode(''); 
        }
    };

    const alias_Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === 'custom_dialogue') {
            if ($gameMessage.isBusy()) return true; 
            
            // Wait for Blocking Movement Routes
            if (this._dmWaitingForRouteTarget) {
                if (this._dmWaitingForRouteTarget.isMoveRouteForcing()) {
                    return true; 
                } else {
                    this._dmWaitingForRouteTarget = null; 
                }
            }
            
            if (this._dmPendingRoute) {
                this.routeDialogueNode(this._dmPendingRoute);
                this._dmPendingRoute = null;
            } else {
                this.processNextDialogueNode();
            }
            
            if (this._waitMode === 'custom_dialogue') return true;
            return false;
        }
        return alias_Game_Interpreter_updateWaitMode.call(this);
    };

    Game_Interpreter.prototype.dmApplyRoute = function(targetId, waitForCompletion, list) {
        // this.character natively handles -1 (Player), 0 (This Event), and 1+ (Event ID)
        const character = this.character(targetId);
        if (!character) return;
        
        const route = {
            list: [...list, { code: 0 }], // MZ requires code 0 to mark the route's end
            repeat: false,
            skippable: false,
            wait: waitForCompletion
        };
        
        character.forceMoveRoute(route);
        if (waitForCompletion) {
            this._dmWaitingForRouteTarget = character;
        }
    };

    // =========================================================================
    // 4. Custom Icon Rendering (Baseline Alignment Fix)
    // =========================================================================
    
    const alias_Window_Base_processEscapeCharacter = Window_Base.prototype.processEscapeCharacter;
    Window_Base.prototype.processEscapeCharacter = function(code, textState) {
        if (code === "EI") {
            const iconIndex = this.obtainEscapeParam(textState);
            const verticalOffset = 0; 
            
            this.drawIcon(iconIndex, textState.x, textState.y + verticalOffset);
            textState.x += 24 + 2; 
        } else {
            alias_Window_Base_processEscapeCharacter.call(this, code, textState);
        }
    };

})();