/*:
 * @target MZ
 * @plugindesc Phase 5: Farmer Class Mechanics v1.3
 * @author Custom Build
 * * @help
 * Implements:
 * - Dynamic Seed Injection: Reads party inventory & active seeds to grant skills.
 * - Map Event Masking: Automatically hides events named "Seed X".
 * - Turn-Based Growth: Reduces seed timers by 1 every combat turn end.
 * - Hooked Harvesting: Deletes the seed and payloads +1 MP seamlessly.
 * - Dispel Moonstars (Skill 67): Strips non-persistent/immune states from Allies.
 * - FIX: Enforced strict Number() casting on all ID checks to prevent string-math failures.
 * - FIX: Appended '+' to custom MP restoration popups.
 */

(() => {
    'use strict';

    //=============================================================================
    // 0. Configuration
    //=============================================================================
    const CONFIG = {
        FARMER_CLASS_ID: 4,
        MAX_SEEDS: 3,
        MOONSTARS_HARVEST_ID: 67, 
        SEEDS: {
            17: { plant: 64, harvest: 65, turns: 3, name: "Brandywine" },
            18: { plant: 66, harvest: 67, turns: 3, name: "Moon & Stars" },
            19: { plant: 68, harvest: 69, turns: 3, name: "Ponkan" },
            20: { plant: 70, harvest: 71, turns: 3, name: "Bitter Melon" },
            21: { plant: 72, harvest: 73, turns: 3, name: "Mung Bean" },
            22: { plant: 74, harvest: 75, turns: 3, name: "7 Pot Douglah" },
            23: { plant: 76, harvest: 77, turns: 3, name: "Cherry Belle" },
            24: { plant: 78, harvest: 79, turns: 3, name: "Fly Agaric" },
            25: { plant: 80, harvest: 81, turns: 3, name: "Crabapple" },
            26: { plant: 82, harvest: 83, turns: 3, name: "Cara Cara" },
            27: { plant: 84, harvest: 85, turns: 3, name: "Destroying Angel" },
            28: { plant: 86, harvest: 87, turns: 3, name: "Prickly Cucumber" },
            30: { plant: 90, harvest: 91, turns: 3, name: "Fairy Tale" },
            31: { plant: 92, harvest: 93, turns: 3, name: "Slimes" }
        }
    };

    //=============================================================================
    // 1. Data Initialization & Persistence
    //=============================================================================
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._farmerSeeds = [];
    };

    //=============================================================================
    // 2. Dynamic Skill Access
    //=============================================================================
    const _Game_Actor_addedSkills = Game_Actor.prototype.addedSkills;
    Game_Actor.prototype.addedSkills = function() {
        const skills = _Game_Actor_addedSkills.call(this);
        
        if (this._classId === CONFIG.FARMER_CLASS_ID) {
            for (const itemId in CONFIG.SEEDS) {
                if ($gameParty.hasItem($dataItems[Number(itemId)])) {
                    
                    const entry = CONFIG.SEEDS[itemId];
                    const plantId = Number(entry.plant);
                    const harvestId = Number(entry.harvest);
                    const actorId = Number(this.actorId());
                    
                    let seed = null;
                    if ($gameSystem._farmerSeeds) {
                        seed = $gameSystem._farmerSeeds.find(s => Number(s.planterId) === actorId && Number(s.plantId) === plantId);
                    }
                    
                    if (seed) {
                        if (Number(seed.turns) <= 0) {
                            if (!skills.includes(harvestId)) skills.push(harvestId);
                        }
                    } else {
                        if (!skills.includes(plantId)) skills.push(plantId);
                    }
                }
            }
        }
        return skills;
    };

    //=============================================================================
    // 3. Planting, Harvesting & Dispel Hooks
    //=============================================================================
    const _BattleManager_startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        _BattleManager_startAction.call(this);
        
        const action = this._subject ? this._subject.currentAction() : null;
        if (action && action.item()) {
            const item = action.item();
            const subject = this._subject;
            
            if (subject.isActor() && subject._classId === CONFIG.FARMER_CLASS_ID) {
                
                const plantEntry = Object.values(CONFIG.SEEDS).find(s => Number(s.plant) === Number(item.id));
                if (plantEntry) {
                    if (!$gameSystem._farmerSeeds) $gameSystem._farmerSeeds = [];
                    
                    const existing = $gameSystem._farmerSeeds.find(s => Number(s.planterId) === Number(subject.actorId()) && Number(s.plantId) === Number(plantEntry.plant));
                    
                    if (!existing) {
                        let mySeeds = $gameSystem._farmerSeeds.filter(s => Number(s.planterId) === Number(subject.actorId()));
                        if (mySeeds.length >= CONFIG.MAX_SEEDS) {
                            const oldest = mySeeds[0];
                            const index = $gameSystem._farmerSeeds.indexOf(oldest);
                            if (index > -1) $gameSystem._farmerSeeds.splice(index, 1);
                        }
                        
                        $gameSystem._farmerSeeds.push({
                            planterId: Number(subject.actorId()),
                            plantId: Number(plantEntry.plant),
                            harvestId: Number(plantEntry.harvest),
                            name: plantEntry.name,
                            turns: Number(plantEntry.turns)
                        });
                    }
                }
                
                const harvestEntry = Object.values(CONFIG.SEEDS).find(s => Number(s.harvest) === Number(item.id));
                if (harvestEntry) {
                    if ($gameSystem._farmerSeeds) {
                        const seedIndex = $gameSystem._farmerSeeds.findIndex(s => Number(s.planterId) === Number(subject.actorId()) && Number(s.harvestId) === Number(item.id));
                        if (seedIndex > -1) {
                            $gameSystem._farmerSeeds.splice(seedIndex, 1);
                        }
                    }
                    
                    subject.requestCustomTextPopup("+1", "heal", () => {
                        subject.setMp(subject.mp + 1);
                    });
                }
            }

            if (Number(item.id) === CONFIG.MOONSTARS_HARVEST_ID) {
                $gameParty.aliveMembers().forEach(battler => {
                    battler.states().forEach(state => {
                        if (!state.meta.foehn_immune && !state.meta.persistent) {
                            battler.removeState(state.id);
                        }
                    });
                    battler.clearBuffs();
                });
            }
        }
    };

    //=============================================================================
    // 4. Seed Growth Turn Timer
    //=============================================================================
    const _BattleManager_endTurn = BattleManager.endTurn;
    BattleManager.endTurn = function() {
        if ($gameSystem._farmerSeeds) {
            $gameSystem._farmerSeeds.forEach(seed => {
                if (Number(seed.turns) > 0) seed.turns = Number(seed.turns) - 1;
            });
        }
        _BattleManager_endTurn.call(this);
    };

    //=============================================================================
    // 5. Map Event Visibility Hiding
    //=============================================================================
    const _Game_Event_meetsConditions = Game_Event.prototype.meetsConditions;
    Game_Event.prototype.meetsConditions = function(page) {
        const meets = _Game_Event_meetsConditions.call(this, page);
        if (!meets) return false;
        
        if (this.event() && this.event().name) {
            const match = this.event().name.match(/seed\s+(\d+)/i);
            if (match) {
                const itemId = parseInt(match[1]);
                const hasFarmer = $gameParty.members().some(actor => actor._classId === CONFIG.FARMER_CLASS_ID);
                
                if (!hasFarmer) return false;
                if ($gameParty.hasItem($dataItems[itemId])) return false;
            }
        }
        
        return true;
    };

})();