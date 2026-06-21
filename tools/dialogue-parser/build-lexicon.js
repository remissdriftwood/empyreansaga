require('dotenv').config();
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const LEXICON_DB_ID = process.env.NOTION_LEXICON_DB_ID;

async function buildLexicon() {
    console.log('Fetching Lexicon from Notion...');
    let results = [];
    let hasMore = true;
    let nextCursor = undefined;

    while (hasMore) {
        const response = await notion.databases.query({
            database_id: LEXICON_DB_ID,
            start_cursor: nextCursor,
        });
        results.push(...response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor;
    }

    const lexicon = {};

    results.forEach(page => {
        const props = page.properties;
        
        // 1. Auto-detect the ID column (Notion databases only have one 'title' type column)
        const idKey = Object.keys(props).find(key => props[key].type === 'title');
        const id = idKey ? props[idKey].title.map(t => t.plain_text).join('').trim() : null;
        if (!id) return;

        // 2. Robust text extractor that ignores case sensitivity and trailing spaces
        const getSafeText = (targetName) => {
            const actualKey = Object.keys(props).find(k => k.trim().toLowerCase() === targetName.toLowerCase());
            if (!actualKey) return ""; // Column not found
            
            const prop = props[actualKey];
            if (prop && prop.type === 'rich_text') {
                return prop.rich_text.map(t => t.plain_text).join('');
            }
            if (prop && prop.type === 'title') {
                return prop.title.map(t => t.plain_text).join('');
            }
            return ""; // Fallback if column type is something unexpected
        };

        // 3. Map properties safely
        lexicon[id] = {
            name: getSafeText('Display Name'),
            description: getSafeText('Display Description')
        };
    });

    const outputPath = path.join(__dirname, 'Lexicon.json');
    fs.writeFileSync(outputPath, JSON.stringify(lexicon, null, 2));
    
    console.log(`Successfully generated Lexicon.json with ${Object.keys(lexicon).length} entries.`);
}

buildLexicon().catch(console.error);