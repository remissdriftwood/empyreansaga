const fs = require('fs');
const csv = require('csv-parser');

const ENTITIES_FILE = 'Entities.csv';
const DIALOGUE_FILE = 'Dialogue.csv';
const OUTPUT_FILE = 'Dialogue.json';

// Configuration for your custom font validation
const MAX_LINE_WIDTH_CHARS = 50; // Adjust this based on empyreansaga-thin testing

let entitiesMap = {};
let dialogueDB = {};

// --- STEP 1: Parse Entities ---
function parseEntities() {
    return new Promise((resolve) => {
        fs.createReadStream(ENTITIES_FILE)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
            .on('data', (row) => {
                const internalName = row['Name'] ? row['Name'].trim() : '';
                if (!internalName) return;

                // If DisplayName exists and has text, use it. 
                // If DisplayName column exists but is empty, use empty string (suppress namebox).
                // If DisplayName column doesn't exist yet, fallback to Internal Name.
                let displayName = internalName;
                if (row['DisplayName'] !== undefined) {
                    displayName = row['DisplayName'].trim();
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
                if (!convoId) return; // Skip rows without a ConversationID

                // 1. Clean the Speaker relation string (Remove the Notion URL)
                let rawSpeaker = row['Speaker'] ? row['Speaker'].trim() : '';
                let cleanSpeakerName = rawSpeaker.replace(/\s*\(https:\/\/www\.notion\.so\/.*?\)/g, '').trim();
                
                // 2. Resolve against Entities map to get the proper DisplayName
                let finalSpeaker = cleanSpeakerName; 
                if (entitiesMap[cleanSpeakerName]) {
                    finalSpeaker = entitiesMap[cleanSpeakerName].displayName;
                } else if (cleanSpeakerName === '') {
                    finalSpeaker = ''; // System message / minor NPC
                }

                // 3. Extract Actions from text using Regex: [Type:Params]
                let rawText = row['Dialogue'] ? row['Dialogue'] : '';
                let actions = [];
                const actionRegex = /\[(\w+):([^\]]+)\]/g;
                
                // Replace tags in text and push to actions array
                let cleanText = rawText.replace(actionRegex, (match, type, params) => {
                    actions.push({
                        type: type,
                        params: params.split(',').map(p => p.trim())
                    });
                    return ''; // Remove tag from final display string
                }).trim();

                // 4. Validate Line Widths for custom font
                const lines = cleanText.split('\n');
                lines.forEach((line, index) => {
                    if (line.length > MAX_LINE_WIDTH_CHARS) {
                        console.warn(`\x1b[33m[WARNING] Text in Node ${row['DialogueNodeID']} line ${index + 1} exceeds ${MAX_LINE_WIDTH_CHARS} chars!\x1b[0m`);
                    }
                });

                // 5. Build the Node Object
                let node = {
                    nodeId: row['DialogueNodeID'] ? row['DialogueNodeID'].trim() : '',
                    speaker: finalSpeaker,
                    text: cleanText,
                    actions: actions
                };

                // Add condition switch if present
                if (row['Condition_Switch']) {
                    node.conditionSwitch = row['Condition_Switch'].trim();
                }

                // Handle Choices
                if (row['Is_Choice'] && row['Is_Choice'].toLowerCase() === 'true') {
                    node.isChoice = true;
                    node.choices = [];
                    for (let i = 1; i <= 3; i++) {
                        if (row[`Choice_${i}_Text`] && row[`Choice_${i}_Target`]) {
                            node.choices.push({
                                label: row[`Choice_${i}_Text`].trim(),
                                targetNode: row[`Choice_${i}_Target`].trim()
                            });
                        }
                    }
                }

                // Handle Explicit Next Node
                if (row['Next_Node']) {
                    node.nextNode = row['Next_Node'].trim();
                }

                // Initialize Conversation Array if it doesn't exist
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

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dialogueDB, null, 2));
        console.log(`\x1b[32m[SUCCESS] Wrote ${OUTPUT_FILE}\x1b[0m`);
    } catch (err) {
        console.error("Build failed:", err);
    }
}

build();