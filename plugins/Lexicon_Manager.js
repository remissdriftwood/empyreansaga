/*:
 * @target MZ
 * @plugindesc Loads Lexicon.json from Notion and seamlessly overwrites Database text fields.
 * @author 
 * * @help
 * Requires a Lexicon.json file in the /data/ folder.
 * Matches Notion IDs (e.g., Skill_001, Item_045) to MZ Database IDs.
 */

(() => {
    DataManager._databaseFiles.push({ name: '$dataLexicon', src: 'Lexicon.json' });

    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        
        if (!this._lexiconApplied && window.$dataLexicon) {
            this.applyLexicon();
            this._lexiconApplied = true;
        }
        return true;
    };

    DataManager.applyLexicon = function() {
        // hasDesc enforces your rule for which objects receive descriptions
        const dbMaps = [
            { prefix: 'Skill_', data: $dataSkills, hasDesc: true },
            { prefix: 'Item_', data: $dataItems, hasDesc: true },
            { prefix: 'Weapon_', data: $dataWeapons, hasDesc: true },
            { prefix: 'Armor_', data: $dataArmors, hasDesc: true },
            { prefix: 'Class_', data: $dataClasses, hasDesc: false },
            { prefix: 'Enemy_', data: $dataEnemies, hasDesc: false },
            { prefix: 'State_', data: $dataStates, hasDesc: false }
        ];

        for (const map of dbMaps) {
            if (!map.data) continue;
            
            for (let i = 1; i < map.data.length; i++) {
                const obj = map.data[i];
                if (!obj) continue;

                const id = map.prefix + String(i).padStart(3, '0');
                const lex = $dataLexicon[id];

                if (lex) {
                    if (lex.name) {
                        obj.name = lex.name;
                    }
                    if (map.hasDesc && lex.description) {
                        obj.description = lex.description;
                    }
                }
            }
        }
    };

    /**
     * Fetches arbitrary UI Strings from the Lexicon.
     * @param {string} id - The ID in Notion (e.g., "UI_CRIT")
     * @param {string} fallback - The string to use if the ID isn't found.
     * @param {boolean} useDescription - Set to true to grab the "Display Description" column instead of "Display Name".
     */
    window.GetLexiconText = function(id, fallback = "", useDescription = false) {
        if (window.$dataLexicon && $dataLexicon[id]) {
            const targetText = useDescription ? $dataLexicon[id].description : $dataLexicon[id].name;
            if (targetText) return targetText;
        }
        return fallback;
    };
})();