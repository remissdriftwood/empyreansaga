const fs = require('fs');
const csv = require('csv-parser');

const ENTITIES_FILE = 'Entities.csv';
const DIALOGUE_FILE = 'Dialogue.csv';
const DIALOGUE_OUTPUT = 'Dialogue.json';
const SHOPS_OUTPUT = 'Shops.json'; 

// Configuration for your custom font validation
const MAX_LINE_WIDTH_CHARS = 50; 

let entitiesMap = {};
let dialogueDB = {};
let shopsDB = {}; 
let globalCurrencyName = "Gold"; 

// --- Helper: Escape Regex ---
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Helper: Sanitize Smart Typography ---
function sanitizeTypography(text) {
    if (!text) return '';
    return text
        .replace(/[\u2018\u2019]/g, "'") // Left/Right single quotes
        .replace(/[\u201C\u201D]/g, '"') // Left/Right double quotes
        .replace(/\u2026/g, "...");      // Single-character ellipsis
}

// --- Helper: Swap Inline Entity Mentions ---
function swapEntityMentions(text) {
    if (!text) return '';
    let processedText = text;
    
    // Sort keys by length descending to avoid partial word replacements
    const sortedEntities = Object.keys(entitiesMap).sort((a, b) => b.length - a.length);
    
    for (const internalName of sortedEntities) {
        // If they have a blank DisplayName, fall back to Internal Name for inline text 
        // so the word doesn't just disappear from the sentence.
        const dispName = entitiesMap[internalName].displayName;
        const mentionReplacement = dispName !== '' ? dispName : internalName;

        // Only run the swap if the replacement is actually different from the internal name
        if (internalName && mentionReplacement !== internalName) {
            
            // 1. Target the manual CSV export format: "Name (https://www.notion.so/...)"
            const urlMentionRegex = new RegExp(`${escapeRegExp(internalName)}\\s*\\(https:\\/\\/www\\.notion\\.so\\/[^)]+\\)`, 'gi');
            processedText = processedText.replace(urlMentionRegex, mentionReplacement);

            // 2. Target the API format or plain text: "@Name" or just "Name"
            const plainMentionRegex = new RegExp(`@?${escapeRegExp(internalName)}`, 'gi');
            processedText = processedText.replace(plainMentionRegex, mentionReplacement);
        }
    }
    return processedText;
}

// --- STEP 1: Parse Entities & Shops ---
function parseEntities() {
    return new Promise((resolve) => {
        fs.createReadStream(ENTITIES_FILE)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
            .on('data', (row) => {
                const internalName = row['Name'] ? row['Name'].trim() : '';
                const entityId = row['Entity ID'] ? row['Entity ID'].trim() : '';
                if (!internalName) return;

                let displayName = internalName;
                
                // BUG FIX: Trust the DisplayName column entirely. 
                // If it is blank in Notion, we WANT it to be blank here.
                if (row['DisplayName'] !== undefined) {
                    displayName = row['DisplayName'].trim();
                }

                if (entityId === 'SYSTEM_CURRENCY' || internalName === 'SYSTEM_CURRENCY') {
                    // Currency needs a strict fallback so {CURRENCY} doesn't render as nothing
                    globalCurrencyName = displayName !== '' ? displayName : internalName;
                }

                // Standard Entity Mapping
                entitiesMap[internalName] = {
                    internalName: internalName,
                    displayName: displayName
                };

                // Process INVENTORY column for Shops.json
                const inventoryRaw = row['INVENTORY'] ? row['INVENTORY'].trim() : '';
                if (inventoryRaw && entityId) {
                    const goodsMatrix = [];
                    const items = inventoryRaw.split(',');
                    
                    for (let itemStr of items) {
                        itemStr = itemStr.trim();
                        if (!itemStr) continue;
                        
                        const match = itemStr.match(/^([IWAiwa]):(\d+)(?:=(\d+))?$/);
                        
                        if (match) {
                            const typeChar = match[1].toUpperCase();
                            const itemId = parseInt(match[2], 10);
                            const customPrice = match[3] ? parseInt(match[3], 10) : 0;
                            
                            let typeId = 0;
                            if (typeChar === 'W') typeId = 1;
                            if (typeChar === 'A') typeId = 2;
                            
                            const priceFlag = match[3] ? 1 : 0;
                            
                            goodsMatrix.push([typeId, itemId, priceFlag, customPrice]);
                        } else {
                            console.warn(`\x1b[33m[WARNING] Invalid inventory syntax on ${internalName}: "${itemStr}"\x1b[0m`);
                        }
                    }
                    
                    if (goodsMatrix.length > 0) {
                        shopsDB[entityId] = goodsMatrix;
                    }
                }
            })
            .on('end', () => resolve());
    });
}

// --- STEP 2: Parse Dialogue ---
function parseDialogue() {
    return new Promise((resolve) => {
        fs.createReadStream(DIALOGUE_FILE)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
            .on('data', (row) => {
                const convoId = row['ConversationID'] ? row['ConversationID'].trim() : null;
                if (!convoId) return; 

                // 1. Clean the Speaker relation string
                let rawSpeaker = row['Speaker'] ? row['Speaker'].trim() : '';
                let cleanSpeakerName = rawSpeaker.replace(/\s*\(https:\/\/www\.notion\.so\/.*?\)/g, '').trim();
                
                // 2. Resolve against Entities map (If DisplayName is '', it stays '')
                let finalSpeaker = cleanSpeakerName; 
                if (entitiesMap[cleanSpeakerName]) {
                    finalSpeaker = entitiesMap[cleanSpeakerName].displayName;
                } else if (cleanSpeakerName === '') {
                    finalSpeaker = ''; 
                }

                // 3. Extract Actions from text and Sanitize Typography
                let rawText = row['Dialogue'] ? row['Dialogue'] : '';
                rawText = sanitizeTypography(rawText);

                let actions = [];
                const actionRegex = /\[(\w+):([^\]]+)\]/g;
                
                let cleanText = rawText.replace(actionRegex, (match, type, params) => {
                    actions.push({
                        type: type,
                        params: params.split(',').map(p => p.trim())
                    });
                    return ''; 
                }).trim();

                // 4. Compile-Time Tag Swaps
                cleanText = cleanText.replace(/\{CURRENCY\}/g, globalCurrencyName);
                cleanText = swapEntityMentions(cleanText); // <-- SWAP INLINE MENTIONS

                // 5. Validate Line Widths
                const lines = cleanText.split('\n');
                lines.forEach((line, index) => {
                    if (line.length > MAX_LINE_WIDTH_CHARS) {
                        console.warn(`\x1b[33m[WARNING] Text in Node ${row['DialogueNodeID']} line ${index + 1} exceeds ${MAX_LINE_WIDTH_CHARS} chars!\x1b[0m`);
                    }
                });

                // 6. Build the Node Object
                let node = {
                    nodeId: row['DialogueNodeID'] ? row['DialogueNodeID'].trim() : '',
                    speaker: finalSpeaker,
                    text: cleanText,
                    actions: actions
                };

                if (row['Condition_Switch']) {
                    node.conditionSwitch = row['Condition_Switch'].trim();
                }

                let isChoiceStr = row['Is_Choice'] ? row['Is_Choice'].trim().toLowerCase() : '';
                if (isChoiceStr === 'true' || isChoiceStr === 'yes') {
                    node.isChoice = true;
                    node.choices = [];
                    for (let i = 1; i <= 3; i++) {
                        if (row[`Choice_${i}_Text`] && row[`Choice_${i}_Target`]) {
                            // Also swap mentions inside choice buttons!
                            node.choices.push({
                                label: swapEntityMentions(sanitizeTypography(row[`Choice_${i}_Text`].trim())),
                                targetNode: row[`Choice_${i}_Target`].trim()
                            });
                        }
                    }
                }

                if (row['Next_Node']) {
                    node.nextNode = row['Next_Node'].trim();
                }

                if (!dialogueDB[convoId]) {
                    dialogueDB[convoId] = [];
                }

                dialogueDB[convoId].push(node);
            })
            .on('end', () => resolve());
    });
}

// --- Main Execution ---
async function build() {
    console.log("Starting Empyrean Saga Dialogue Build...");
    try {
        await parseEntities();
        console.log(`Loaded ${Object.keys(entitiesMap).length} entities.`);
        console.log(`Extracted ${Object.keys(shopsDB).length} shop inventories.`);
        
        await parseDialogue();
        console.log(`Parsed ${Object.keys(dialogueDB).length} conversations.`);

        for (const convoId in dialogueDB) {
            dialogueDB[convoId].sort((a, b) => 
                a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true, sensitivity: 'base' })
            );
        }

        // Write both files
        fs.writeFileSync(DIALOGUE_OUTPUT, JSON.stringify(dialogueDB, null, 2));
        console.log(`\x1b[32m[SUCCESS] Wrote ${DIALOGUE_OUTPUT}\x1b[0m`);

        fs.writeFileSync(SHOPS_OUTPUT, JSON.stringify(shopsDB, null, 2));
        console.log(`\x1b[32m[SUCCESS] Wrote ${SHOPS_OUTPUT}\x1b[0m`);
        
    } catch (err) {
        console.error("Build failed:", err);
    }
}

build();