# Technical Specification: Empyrean Saga - Notion to MZ Dialogue Pipeline

## 1. System Overview
This toolchain moves narrative control from the RPG Maker MZ Event Editor into Notion. It consists of three parts:
1. **Notion Databases:** The source of truth for all game text, entities, and branching logic.
2. **Node.js Parser (`build-dialogue.js`):** A local build script that digests Notion CSV exports, cleans the data, parses inline tags, and compiles a highly optimized JSON file.
3. **MZ Plugin (`Empyrean_DialogueManager.js`):** An engine plugin that loads the compiled JSON and executes conversations via a single Plugin Command.

---

## 2. Source Architecture (Notion)

### 2.1 Entities Database
Stores metadata for all characters, organizations, and locations.
* **EntityID (Primary Key):** Unique string (e.g., `CHR_CASSATA`, `CHR_OLDMAN_01`).
* **Name (Internal):** The developer-facing name used for organization (e.g., `Cardinal Cassata`, `Grumpy Old Man`).
* **DisplayName (Player-Facing):** The name that actually renders in the game's UI. **Leave this column completely blank for minor NPCs to suppress the name box in MZ.**
* **Type:** Character, Organization, Location, etc.

### 2.2 Dialogue Database
Stores the actual game text and conversational flow.
* **DialogueNodeID (Primary Key):** Unique string (e.g., `DLG_CAS_01`).
* **ConversationID:** Grouping key to bundle a scene (e.g., `CASSATA_INTRO`).
* **Speaker (Relation):** Links to Entities DB.
* **Dialogue (Text):** The spoken text. Supports inline action tags.
* **Condition_Switch (Text):** MZ Switch required to read this node.
* **Is_Choice (Checkbox):** Flags if this node invokes a decision branch.
* **Choice_1_Text / Choice_2_Text / Choice_3_Text (Text):** UI labels for branches.
* **Choice_1_Target / Choice_2_Target / Choice_3_Target (Text):** Target `DialogueNodeID` to route to upon selection.
* **Next_Node (Text):** The explicit next node to play (if non-linear or skipping default sequential order).

---

## 3. The Node.js Parser (`build-dialogue.js`)

### 3.1 Responsibilities
1.  **Ingest:** Read `Entities.csv` and `Dialogue.csv` using a library like `csv-parser`.
2.  **Clean Relations & Resolve Display Name:** Notion exports relations as `Name (URL)`. The parser must use Regex to strip the URL, find the matching Entity, and extract the `DisplayName`. If the `DisplayName` is empty or missing, the parser must output `"speaker": ""`.
3.  **Parse Inline Tags:** Scan the `Dialogue` column for `[Action:Param]` tags. Strip them from the display string and push them to an `actions` array.
4.  **Validate Formatting:** Run a character-width check against the specific kerning of the `empyreansaga-thin` pixel font. Throw a terminal warning if a string exceeds the maximum MZ message box width.
5.  **Compile & Group:** Restructure the flat CSV rows into a nested JSON object, grouped by `ConversationID`. 

### 3.2 The Inline Tag DSL (Domain Specific Language)
The parser must recognize and extract the following syntax from dialogue strings:
* `[Wait:frames]` -> `{ "type": "Wait", "frames": 60 }`
* `[Move:target,route]` -> `{ "type": "Move", "target": "Player", "route": "StepBackward" }`
* `[Transfer:mapId,x,y,dir]` -> `{ "type": "Transfer", "mapId": 12, "x": 5, "y": 10, "dir": 2 }`

---

## 4. Target Output (`Dialogue.json`)

The parser must output a minified file to the MZ `data/` folder matching this schema:

```json
{
  "CASSATA_INTRO": [
    {
      "nodeId": "DLG_CAS_01",
      "speaker": "Cardinal Cassata",
      "text": "Hold on... I think I hear something. Run!",
      "conditionSwitch": "005_CASSATA_MET",
      "actions": [
        { "type": "Wait", "frames": 60, "triggerAtIndex": 10 }
      ]
    },
    {
      "nodeId": "DLG_CAS_02",
      "speaker": "Cardinal Cassata",
      "text": "I must ask... will you assist us in this matter?",
      "isChoice": true,
      "choices": [
        { "label": "We'll do it.", "targetNode": "DLG_CAS_YES" },
        { "label": "Not a chance.", "targetNode": "DLG_CAS_NO" }
      ]
    }
  ],
  "TAVERN_CHAT": [
    {
      "nodeId": "DLG_TAV_01",
      "speaker": "", 
      "text": "Ain't got no time for Mangiafagioli folks 'round here.",
      "actions": []
    }
  ]
}