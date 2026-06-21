require('dotenv').config();
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
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
        
        const id = props['ID']?.title[0]?.plain_text;
        if (!id) return;

        const getRichText = (prop) => prop?.rich_text.map(t => t.plain_text).join('') || "";

        // Extracts only Name and Description. Notes are ignored.
        lexicon[id] = {
            name: getRichText(props['Display Name']),
            description: getRichText(props['Display Description'])
        };
    });

    const outputPath = path.join(__dirname, '..', '..', 'data', 'Lexicon.json');
    fs.writeFileSync(outputPath, JSON.stringify(lexicon, null, 2));
    
    console.log(`Successfully generated Lexicon.json with ${Object.keys(lexicon).length} entries.`);
}

buildLexicon().catch(console.error);