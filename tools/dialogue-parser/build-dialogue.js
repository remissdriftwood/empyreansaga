const fs = require('fs');
const csv = require('csv-parser');

const ENTITIES_FILE = 'Entities.csv';
const DIALOGUE_FILE = 'Dialogue.csv';
const OUTPUT_FILE = 'Dialogue.json';

// Configuration for your custom font validation
const MAX_LINE_WIDTH_CHARS = 50; 

let entitiesMap = {};
let dialogueDB = {};
let globalCurrencyName = "Gold"; 

// --- Helper: Sanitize Smart Typography ---
function sanitizeTypography(text) {
    if (!text) return '';
    return text
        .replace(/[\u2018\u2019]/g, "'") // Left/Right single quotes
        .replace(/[\u201C\u201D]/g, '"') // Left/Right double quotes
        .replace(/\u2026/g, "...");      // Single-character ellipsis
}

// --- STEP 1: Parse Entities ---
function parseEntities() {
    return new Promise((resolve) => {
        fs.createReadStream(ENTITIES_FILE)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
            .on('data', (row) => {
                const internalName = row['Name'] ? row['Name'].trim() : '';
                const entityId = row['Entity ID'] ? row['Entity ID'].trim() : '';
                if (!internalName) return;

                let displayName = internalName;
                if (row['DisplayName'] !== undefined) {
                    displayName = row['DisplayName'].trim();
                }

                if (entityId === 'SYSTEM_CURRENCY' || internalName === 'SYSTEM_CURRENCY') {
                    globalCurrencyName = (row['DisplayName'] !== undefined && row['DisplayName'].trim() !== '') ? row['DisplayName'].trim() : internalName;
                }

                entitiesMap[internalName] = {
                    internalName: internalName,
                    displayName: displayName
                };
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
                
                // 2. Resolve against Entities map
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

                // 4. Compile-Time Currency Tag Swap
                cleanText = cleanText.replace(/\{CURRENCY\}/g, globalCurrencyName);

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

                // --- BUG FIX: Check for "yes" as well as "true" ---
                let isChoiceStr = row['Is_Choice'] ? row['Is_Choice'].trim().toLowerCase() : '';
                if (isChoiceStr === 'true' || isChoiceStr === 'yes') {
                    node.isChoice = true;
                    node.choices = [];
                    for (let i = 1; i <= 3; i++) {
                        if (row[`Choice_${i}_Text`] && row[`Choice_${i}_Target`]) {
                            node.choices.push({
                                label: sanitizeTypography(row[`Choice_${i}_Text`].trim()),
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
        
        await parseDialogue();
        console.log(`Parsed ${Object.keys(dialogueDB).length} conversations.`);

        for (const convoId in dialogueDB) {
            dialogueDB[convoId].sort((a, b) => 
                a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true, sensitivity: 'base' })
            );
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dialogueDB, null, 2));
        console.log(`\x1b[32m[SUCCESS] Wrote ${OUTPUT_FILE}\x1b[0m`);
    } catch (err) {
        console.error("Build failed:", err);
    }
}

build();