require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// --- Environment Variables ---
const ENTITIES_DB_ID = process.env.ENTITIES_DB_ID;
const DIALOGUE_DB_ID = process.env.DIALOGUE_DB_ID;

// --- User Paths ---
// Because this script is now inside /tools/dialogue-parser/, this directory is our base
const TOOLS_DIR = __dirname; 
// Navigate up 5 folders to reach the root MZ project, then into /data
const DATA_DIR = path.resolve(__dirname, '../../../../../data'); 

// --- Asset Sync Paths ---
const WORKING_DIR = "C:\\Users\\burr\\Desktop\\burr\\game design\\resources rpg";
const MZ_DIR = "C:\\Users\\burr\\Documents\\RMMZ\\Empyrean Saga";
const FOLDERS_TO_SYNC = ['audio', 'fonts', 'icon', 'img'];
const VALID_EXTENSIONS = ['.png', '.ttf', '.ogg'];

console.log("=========================================");
console.log("🚀 Starting API-Driven Dialogue & Asset Pipeline...");
console.log("=========================================\n");

const entityMap = {};

// --- Helper Functions ---
function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function flattenProperty(prop) {
    if (!prop) return '';
    switch (prop.type) {
        case 'title':
            return prop.title.map(t => t.plain_text).join('');
        case 'rich_text':
            return prop.rich_text.map(t => t.plain_text).join('');
        case 'select':
            return prop.select?.name || '';
        case 'multi_select':
            return (prop.multi_select || []).map(s => s.name).join(', ');
        case 'checkbox':
            return prop.checkbox ? 'Yes' : 'No';
        case 'relation':
            return (prop.relation || []).map(r => entityMap[r.id] || r.id).join(', ');
        default:
            return '';
    }
}

async function fetchAllRows(databaseId) {
    let cursor = undefined;
    const pages = [];
    while (true) {
        const response = await notion.databases.query({
            database_id: databaseId,
            start_cursor: cursor,
            page_size: 100
        });
        pages.push(...response.results);
        if (!response.has_more) break;
        cursor = response.next_cursor;
    }
    return pages;
}

function pagesToCSV(pages) {
    if (pages.length === 0) return "";
    
    const columns = Object.keys(pages[0].properties).sort((a, b) => a.localeCompare(b));
    const headerRow = columns.map(csvEscape).join(',');

    const dataRows = pages.map(page => {
        return columns.map(col => {
            const prop = page.properties[col];
            return csvEscape(flattenProperty(prop));
        }).join(',');
    });

    return [headerRow, ...dataRows].join('\n') + '\n';
}

// Recursive function to smart-sync folders
function syncAssets(src, dest, extensions) {
    let copyCount = 0;
    if (!fs.existsSync(src)) return 0;

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            // Ensure destination subdirectory exists before traversing deeper
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            copyCount += syncAssets(srcPath, destPath, extensions);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (extensions.includes(ext)) {
                let shouldCopy = false;
                
                // Copy if it doesn't exist in destination, or if source is newer
                if (!fs.existsSync(destPath)) {
                    shouldCopy = true;
                } else {
                    const srcStat = fs.statSync(srcPath);
                    const destStat = fs.statSync(destPath);
                    if (srcStat.mtime > destStat.mtime) {
                        shouldCopy = true;
                    }
                }

                if (shouldCopy) {
                    fs.copyFileSync(srcPath, destPath);
                    copyCount++;
                }
            }
        }
    }
    return copyCount;
}

// --- Main Execution ---
(async () => {
    try {
        if (!ENTITIES_DB_ID || !DIALOGUE_DB_ID) {
            throw new Error("Missing Database IDs in .env file.");
        }

        // --- 1. Fetch & Build Entities ---
        console.log(`[1/6] Fetching Entities from Notion API...`);
        const entityPages = await fetchAllRows(ENTITIES_DB_ID);
        
        entityPages.forEach(page => {
            if (page.properties['Name']) {
                const nameStr = flattenProperty(page.properties['Name']);
                entityMap[page.id] = nameStr; 
            }
        });

        const entitiesCSV = pagesToCSV(entityPages);
        fs.writeFileSync(path.join(TOOLS_DIR, 'Entities.csv'), entitiesCSV);
        console.log(`      ✅ Saved Entities.csv (${entityPages.length} rows)`);

        // --- 2. Fetch & Build Dialogue ---
        console.log(`[2/6] Fetching Dialogue from Notion API...`);
        const dialoguePages = await fetchAllRows(DIALOGUE_DB_ID);
        
        const dialogueCSV = pagesToCSV(dialoguePages);
        fs.writeFileSync(path.join(TOOLS_DIR, 'Dialogue.csv'), dialogueCSV);
        console.log(`      ✅ Saved Dialogue.csv (${dialoguePages.length} rows)`);

        // --- 3. Execute Existing Parser ---
        console.log(`\n[3/6] Running build-dialogue.js...`);
        execSync('node build-dialogue.js', { cwd: TOOLS_DIR, stdio: 'inherit' });

        // --- 4. Deploy JSON to MZ Engine ---
        const sourceDialogue = path.join(TOOLS_DIR, 'Dialogue.json');
        const sourceShops = path.join(TOOLS_DIR, 'Shops.json'); 
        
        if (fs.existsSync(sourceDialogue)) {
            fs.copyFileSync(sourceDialogue, path.join(DATA_DIR, 'Dialogue.json'));
            console.log(`\n[4/6] Successfully copied Dialogue.json to MZ Data folder.`);
        } else {
            throw new Error("Dialogue.json was not generated by the builder!");
        }

        if (fs.existsSync(sourceShops)) {
            fs.copyFileSync(sourceShops, path.join(DATA_DIR, 'Shops.json'));
            console.log(`      Successfully copied Shops.json to MZ Data folder.`);
        } else {
            console.log(`      [WARNING] Shops.json was not generated by the builder.`);
        }

        // --- 5. Cleanup ---
        console.log(`[5/6] Cleaning up temporary CSVs...`);
        if (fs.existsSync(path.join(TOOLS_DIR, 'Entities.csv'))) fs.unlinkSync(path.join(TOOLS_DIR, 'Entities.csv'));
        if (fs.existsSync(path.join(TOOLS_DIR, 'Dialogue.csv'))) fs.unlinkSync(path.join(TOOLS_DIR, 'Dialogue.csv'));

        // --- 6. Smart Asset Sync ---
        console.log(`\n[6/6] Syncing updated assets (.png, .ttf, .ogg)...`);
        let totalCopied = 0;
        
        for (const folder of FOLDERS_TO_SYNC) {
            const srcFolder = path.join(WORKING_DIR, folder);
            const destFolder = path.join(MZ_DIR, folder);
            
            if (fs.existsSync(srcFolder)) {
                if (!fs.existsSync(destFolder)) {
                    fs.mkdirSync(destFolder, { recursive: true });
                }
                const copied = syncAssets(srcFolder, destFolder, VALID_EXTENSIONS);
                if (copied > 0) {
                    console.log(`      Synced ${copied} file(s) in /${folder}`);
                    totalCopied += copied;
                }
            } else {
                console.log(`      [WARNING] Working directory folder not found: ${folder}`);
            }
        }

        if (totalCopied === 0) {
            console.log(`      ✅ All local assets are already up to date.`);
        } else {
            console.log(`      ✅ Successfully pushed ${totalCopied} modified/new asset(s).`);
        }

        console.log("\n=========================================");
        console.log("✨ API & Asset Pipeline Complete! MZ is ready to play.");
        console.log("=========================================\n");

    } catch (error) {
        console.error("\n❌ [PIPELINE ERROR]", error.message);
    }
})();