on("chat:message", function(msg) {
    if (msg.type == "api" && msg.content.indexOf("!lootGenerate") === 0) {
        let args = msg.content.split(" ");
        let numberOfBodies = args.length > 1 ? parseInt(args[1], 10) : undefined;

        if (!msg.selected || msg.selected.length === 0) {
            sendChat("System", "/w gm Please select at least one token.");
            return;
        }

        let characterData = {};

        // Aggregate character data from selected tokens
        msg.selected.forEach(selection => {
            let token = getObj("graphic", selection._id);
            if (token) {
                let characterId = token.get("represents");
                if (characterId) {
                    let character = getObj("character", characterId);
                    if (character) {
                        let characterName = character.get("name");
                        if (!characterData[characterName]) {
                            characterData[characterName] = {
                                count: 0,
                                challengeValue: parseFloat(getAttrByName(characterId, "npc_challenge")),
                                npcType: getAttrByName(characterId, "npc_type")
                            };
                        }
                        characterData[characterName].count += 1;
                    } else {
                        sendChat("System", "/w gm No character found for this token.");
                    }
                }
            }
        });

        // Process each unique character's data
        Object.keys(characterData).forEach(characterName => {
            let data = characterData[characterName];
            let results = generateLoot(characterName, numberOfBodies || data.count);
            let lootResults = formatLootTable(characterName, results, data.challengeValue);

            if (data.npcType) {
                let npc_type = data.npcType.toLowerCase();
                const exclusions = ["aberration", "beast", "celestial", "construct", "elemental", "fiend", "plant"];
                if (!exclusions.some(type => npc_type.includes(type)) && !isNaN(data.challengeValue)) {
                    lootResults += generateCurrency(data.challengeValue, data.count);
                }
            } else {
                sendChat("System", `/w gm NPC type attribute is missing for ${characterName}.`);
            }

            // Send all loot results to chat
            sendChat("Loot Drop", "/direct " + lootResults);
        });
    }
});


// Find out what the loot table for a creature is via !analyzeLoot
on("chat:message", function(msg) {
    if (msg.type === "api" && msg.content.indexOf("!analyzeLoot") === 0) {
        let selected = msg.selected && msg.selected[0];
        if (!selected) {
            sendChat("System", "/w gm No token selected.");
            return;
        }

        let token = getObj("graphic", selected._id);
        if (!token) {
            sendChat("System", "/w gm Selected object is not a token.");
            return;
        }

        let characterId = token.get("represents");
        if (!characterId) {
            sendChat("System", "/w gm This token does not represent a character.");
            return;
        }

        let character = getObj("character", characterId);
        if (!character) {
            sendChat("System", "/w gm No character found for this token.");
            return;
        }

        let characterName = character.get("name");
        //Define bodies as one because we just want the range
        let bodies = 1;
        let lootResults = generateLoot(characterName, bodies);  
        let detailedLoot = analyzeLootDetails({characterName: characterName, items: lootResults});

        sendChat("Loot Analysis", "/direct " + detailedLoot);
    }
});

// Determine harvest type, dc, and duration via !harvestCheck
on("chat:message", function(msg) {
    if (msg.type == "api" && msg.content.indexOf("!harvestCheck") === 0) {
        let selected = msg.selected && msg.selected[0];
        if (!selected) {
            sendChat("System", "/w gm No token selected.");
            return;
        }

        let token = getObj("graphic", selected._id);
        if (!token) {
            sendChat("System", "/w gm No token selected.");
            return;
        }

        let characterId = token.get("represents");
        if (!characterId) {
            sendChat("System", "/w gm This token does not represent a character.");
            return;
        }

        let npc_type = getAttrByName(characterId, "npc_type");
        let npc_challenge = parseInt(getAttrByName(characterId, "npc_challenge"), 10);
        let checkType = determineCheckType(npc_type);
        let dc = calculateDC(npc_challenge);
        let harvestTime = determineHarvestTime(npc_type);

        sendChat("Harvest Check", `/w gm <br><strong>${checkType}</strong><br>DC: <strong>${dc}</strong><br>It takes ${harvestTime}`);
    }
});

function analyzeLootDetails(lootResults) {
    // Initialize message with character name or a default message if name is missing
    let message = `<div><strong>${lootResults.characterName || "Unknown Character"}</strong></div>`;

    // Check if lootResults.items is an array and has elements
    if (Array.isArray(lootResults.items) && lootResults.items.length > 0) {
        lootResults.items.forEach(item => {
            let itemDetails = `<div><strong>${item.dice}</strong> ${item.name}`;
            itemDetails += "</div>";
            message += itemDetails;
        });
    } else {
        // Add a message indicating no items or incorrect data structure
        message += "<div>No items found or incorrect data format.</div>";
    }
    return message;
}

function determineCheckType(npc_type) {
    // Normalize the string by converting it to lowercase and removing extra spaces
    npc_type = npc_type.toLowerCase().replace(/[\s\(\)]+/g, ' ').trim();

    // List of known types for matching
    const knownTypes = ["beast", "dragon", "giant", "monstrosity", "plant", "aberration", "construct", "elemental", "fey", "ooze", "celestial", "fiend", "undead", "humanoid"];

    // Attempt to find a match for any known type within the string
    let type = knownTypes.find(kType => npc_type.includes(kType));

    // Define arrays for each check type grouping similar npc_types
    const natureTypes = ["beast", "dragon", "giant", "monstrosity", "plant"];
    const arcanaTypes = ["aberration", "construct", "elemental", "fey", "ooze"];
    const religionTypes = ["celestial", "fiend", "undead"];

    // Determine the appropriate skill check based on the type found
    if (natureTypes.includes(type)) {
        return "Nature";
    } else if (arcanaTypes.includes(type)) {
        return "Arcana";
    } else if (religionTypes.includes(type)) {
        return "Religion";
    } else {
        // Handle specific cases with a switch or default to a generic message
        switch (type) {
            case "humanoid":
                return "Survival";
            default:
                return "Check not determined";  // Default case if the type doesn't match known categories
        }
    }
}

// DC needed to harvest the creature "Harvesting Check DC = 10 + monster CR (not lower than 10 and not higher than 30)"
function calculateDC(npc_challenge) {
    let baseDC = 10 + npc_challenge;
    return Math.max(10, Math.min(baseDC, 30));  // Ensures DC is between 10 and 30
}

// How long it takes to Harvest the creature, based on size
function determineHarvestTime(npc_type) {
    // Map of monster sizes to harvest times
    const harvestTimes = {
        "tiny": "Less than ½ hour",
        "small": "½ hour",
        "medium": "1 hour",
        "large": "2 hours",
        "huge": "4 hours",
        "gargantuan": "8+ hours"
    };

    // Normalize and extract the size part from npc_type
    let sizeDescriptor = npc_type.toLowerCase().match(/\b(tiny|small|medium|large|huge|gargantuan)\b/);
    
    // Check if size descriptor was found and return corresponding time
    if (sizeDescriptor && sizeDescriptor[0]) {
        return harvestTimes[sizeDescriptor[0]];
    }

    // Return a default message if no size descriptor matches
    return "Size not determined or harvesting time unknown";
}

// Function to generate loot for a given number of bodies
function generateLoot(characterName, bodies) { 
    let items;
    // Determine loot based on character name
    switch (characterName) {
        case "Adult Red Dragon":
            items = [
                { 
                    name: "Adult Red Dragon Fire Gland", 
                    dice: "1", 
                    description: "As an action, you can throw this gland up to 30 feet away where it will burst in a fiery explosion. Each creature within 10 feet of where the gland landed must succeed on a DC 21 Dexterity saving throw, taking 18d6 fire damage on a failed save, or half as much damage on a successful one. The gland is fragile and will burst 3d6 hours after being harvested, regardless of if it was thrown or not." 
                },
                { 
                    name: "Red Dragon Claws", 
                    dice: "1d6",
                    description: "Can be crafted into a dagger (150 gp, 9 days). On a hit, you deal an additional 1d6 fire damage with this weapon." 
                },
                { 
                    name: "Red Dragon Fangs", 
                    dice: "1d2",
                    description: "Can be crafted into a shortsword (150 gp, 9 days). On a hit, you deal an additional 1d6 fire damage with this weapon."
                },
                { 
                    name: "Red Dragon Hide", 
                    dice: "1",
                    description: "Can be crafted into a set of light armor (2000 gp, 60 days). While wearing this armor, you have resistance to fire damage. Two sets of armor can be crafted from this hide."
                },
                { 
                    name: "Red Dragon Scales", 
                    dice: "2d8",
                    description: "If you have 20 scales, you can craft them into scale mail armor (2000 gp, 60 days). While wearing this armor, you have resistance to fire damage."
                },
                { 
                    name: "Red Dragon Teeth", 
                    dice: "2d8",
                    description: "One tooth can be used as the tip on an arrow or a crossbow bolt. Ranged attacks that use ammunition made from these teeth deal an additional 1d6 fire damage on a hit. After the ammunition has been fired, it loses this property."
                },
                { 
                    name: "Red Dragon Wings", 
                    dice: "1d2",
                    description: "One wing can be crafted into a resistant cloak (1000 gp, 30 days). Requires attunement. When worn, you have resistance to fire damage."
                },
                { 
                    name: "Rations", 
                    dice: "4d6"
                },
                { 
                    name: "Rubies", 
                    dice: "1d2"
                }
            ];
            break;
        case "Bandit Captain":
            items = [
                {
                    name: "Bottles of Alcohol",
                    dice: "1d2"
                },
                {
                    name: "Broken Dagger",
                    dice: "1"
                },
                {
                    name: "Broken Scimitar",
                    dice: "1"
                },
                {
                    name: "Broken Studded Leather Armor",
                    dice: "1"
                }
            ];
        case "Purple Worm":
            items = [
                {
                    name: "Purple Worm Hide",
                    dice: "1",
                    description: "Hide. Can be crafted into leather armor (10 gp, 2 days) or studded leather armor (45 gp, 3 days). Three sets of armor can be crafted from this hide."
                },
                {
                    name: "Purple Worm Protective Plates",
                    dice: "1d6",
                    description: "Two plates can be crafted into a set of plate armor (1500 gp, 5 days) or into a set of half-plate armor (750 gp, 4 days)."
                },
                {
                    name: "Purple Worm Tail Stinger",
                    dice: "1",
                    description: "Can be crafted into a longsword (700 gp, 24 days), a lance (700 gp, 24 days), or a rapier (700 gp, 24 days). On a hit, the weapon deals an additional 7 (2d6) poison damage."
                },
                {
                    name: "Rations",
                    dice: "10d6"
                },
                {
                    name: "Vials of Purple Worm Poison",
                    dice: "2d6",
                    description: "As an action, the poison can be used to coat one slashing or piercing weapon, or up to three pieces of ammunition. A creature hit by the poisoned weapon of ammunition must make a DC 16 Constitution saving throw or take 6d6 poison damage on a failed save and half as much damage on a successful one. Once applied, the poison retains its potency for one minute before drying."
                }
            ];
            break;
        case "Troll":
            items = [
                {
                    name: "Troll’s Toes",
                    dice: "1d10",
                    description: "Can be sold for 4 gold pieces per toe."
                },
                {
                    name: "Troll Claws",
                    dice: "1d4",
                    description: "Can be crafted into a shortsword (10 gp, 2 days)."
                },
                {
                    name: "Vials of Troll Blood",
                    dice: "2d6",
                    description: "When consumed, you regain 1d4 hit points at the end of each of your turns for the next minute."
                }
            ];
            break;
        default:
            // If nothing matches
            return [
                { 
                    name: "There are no items populated for this NPC", 
                    count: 1 
                }
            ]; 
    }
    
    // Transform each item to calculate its count based on its dice notation
    items = items.map(item => ({
        ...item,  // Spread to copy existing properties
        count: rollDice(item.dice, bodies)  // Calculate count using the dice property and number of bodies
    }));

    // Process each item based on its count to handle "Broken" property
    return items.flatMap(item => {
        const results = [];
        let brokenCount = 0;
        let notBrokenCount = 0;
        for (let i = 0; i < item.count; i++) {
            // Determine if the current unit is broken or not
            if (item.name.startsWith("Broken") && Math.random() < 0.65) {
                notBrokenCount++;
            } else {
                brokenCount++;
            }
        }

        // Add results for non-broken items if any
        if (notBrokenCount > 0) {
            results.push({
                name: item.name.replace("Broken ", ""),
                count: notBrokenCount,
                description: item.description || "",
                dice: item.dice
            });
        }

        // Add results for broken items if any
        if (brokenCount > 0) {
            results.push({
                name: item.name,
                count: brokenCount,
                description: item.description || "",
                dice: item.dice
            });
        }

        return results;
    });
}

// Function to display output of generateLoot function to roll20
function formatLootTable(characterName, loot, challenge) {
    // Define color rules based on the challenge tier
    let textColor = "white"; // Default text color for high contrast
    if (challenge >= 0 && challenge <= 4) {
        backgroundColor = "green"; // Tier 1
    } else if (challenge >= 5 && challenge <= 10) {
        backgroundColor = "blue"; // Tier 2
    } else if (challenge >= 11 && challenge <= 16) {
        backgroundColor = "yellow"; // Tier 3
        textColor = "black"; // Change text color to black for yellow background for better readability
    } else if (challenge > 16) {
        backgroundColor = "purple"; // Tier 4
    } else {
        backgroundColor = "grey"; // Default color if no valid challenge rating is found
        textColor = "black"; // Ensuring readability on grey background
    }

    // Create the header with the appropriate background and text color
    let header = `<div style='border: 1px solid black; padding: 5px; background-color: ${backgroundColor}; color: ${textColor};'><strong>${characterName}</strong> loot found:</div>`;

    // Create rows for each loot item
    let rows = loot.map(item => {
        let itemEntry = `<div style='margin-left: 10px; background-color: #c28100; color: black; padding: 5px;'><strong>${item.count}</strong> ${item.name}</div>`;
        if (item.description) {
            itemEntry += `<div style='margin-left: 20px; font-size: smaller; background-color: white; color: black; padding: 5px;'>${item.description}</div>`;
        }
        return itemEntry;
    }).join("");

    return header + (rows.length > 0 ? rows : "<div style='margin-left: 10px;'>No significant loot found.</div>");
}

// Function to determine and generate currency based on challenge rating
function generateCurrency(challenge, bodies) {
    let currencyRoll = randomInteger(100);
    let currencyResult = "<div style='margin-left: 10px; border-top: 1px solid black; padding: 5px; background-color: #5d5d5d; color: white;'><strong>Currency:</strong> ";

    // Define currency tiers and their rules
    const currencyTiers = [
        // Define tier rules for various challenge ranges, taken from Individual Treasure Tables in DMG pg 133
    { minChallenge: 0, maxChallenge: 4, rules: [
        { maxRoll: 30, result: `${rollDice(5, 6)} Copper Pieces.` },
        { maxRoll: 60, result: `${rollDice("4d6", bodies)} Silver Pieces.` },
        { maxRoll: 70, result: `${rollDice(3, 6)} Electrum Pieces.` },
        { maxRoll: 95, result: `${rollDice(3, 6)} Gold Pieces.` },
        { maxRoll: 100, result: `${rollDice(1, 6)} Platinum Pieces.` }
    ] },
    { minChallenge: 5, maxChallenge: 10, rules: [
        { maxRoll: 30, result: `${adjustGoldAmount(rollDice("4d6", bodies) * 100, 100)} Copper Pieces and ${adjustGoldAmount(rollDice(1, 6) * 10, 10)} Electrum Pieces.` },
        { maxRoll: 60, result: `${adjustGoldAmount(rollDice(6, 6) * 10, 10)} Silver Pieces and ${adjustGoldAmount(rollDice("2d6", bodies) * 10, 10)} Gold Pieces.` },
        { maxRoll: 70, result: `${adjustGoldAmount(rollDice(3, 6) * 10, 10)} Electrum Pieces and ${adjustGoldAmount(rollDice("2d6", bodies) * 10, 10)} Gold Pieces.` },
        { maxRoll: 95, result: `${adjustGoldAmount(rollDice("4d6", bodies) * 10, 10)} Gold Pieces.` },
        { maxRoll: 100, result: `${adjustGoldAmount(rollDice("2d6", bodies) * 10, 10)} Gold Pieces and ${rollDice(3, 6)} Platinum Pieces.` }
    ] },
    { minChallenge: 11, maxChallenge: 16, rules: [
        { maxRoll: 20, result: `${adjustGoldAmount(rollDice("4d6", bodies) * 100, 100)} Silver Pieces and ${adjustGoldAmount(rollDice(1, 6) * 100, 100)} Gold Pieces.` },
        { maxRoll: 35, result: `${adjustGoldAmount(rollDice(1, 6) * 100, 100)} Electrum Pieces and ${adjustGoldAmount(rollDice(1, 6) * 100, 100)} Gold Pieces.` },
        { maxRoll: 75, result: `${adjustGoldAmount(rollDice("2d6", bodies) * 100, 100)} Gold Pieces and ${adjustGoldAmount(rollDice(1, 6) * 10, 10)} Platinum Pieces.` },
        { maxRoll: 100, result: `${adjustGoldAmount(rollDice("2d6", bodies) * 100, 100)} Gold Pieces and ${adjustGoldAmount(rollDice("2d6", bodies) * 10, 10)} Platinum Pieces.` }
    ] },
    { minChallenge: 17, maxChallenge: Infinity, rules: [
        { maxRoll: 15, result: `${adjustGoldAmount(rollDice("2d6", bodies) * 1000, 1000)} Electrum Pieces and ${adjustGoldAmount(rollDice(8, 6) * 100, 100)} Gold Pieces.` },
        { maxRoll: 55, result: `${adjustGoldAmount(rollDice(1, 6) * 1000, 1000)} Gold Pieces and ${adjustGoldAmount(rollDice(1, 6) * 100, 100)} Platinum Pieces.` },
        { maxRoll: 100, result: `${adjustGoldAmount(rollDice(1, 6) * 1000, 1000)} Gold Pieces and ${adjustGoldAmount(rollDice("2d6", bodies) * 100, 100)} Platinum Pieces.` }
    ] }
    ];
    // Find the appropriate currency tier based on the challenge
    const tier = currencyTiers.find(tier => challenge >= tier.minChallenge && challenge <= tier.maxChallenge);
    // Apply currency generation rules based on the tier
    if (tier) {
    for (const rule of tier.rules) {
        if (currencyRoll <= rule.maxRoll) {
        currencyResult += rule.result;
          break; // Stop after the first matching rule
        }
    }
    }
    currencyResult += "</div>";
    return currencyResult;
}

//Introduce some RNG to total amounts
function adjustGoldAmount(amount, multiplier) {
    // Determine the random adjustment
    const adjustment = Math.floor(Math.random() * (multiplier / 10) + 1) * (Math.random() > 0.5 ? 1 : -1);
    // Apply the adjustment
    return amount + adjustment;
}

// Function to simulate dice rolls
function rollDice(diceNotation, bodies) {
    // Validate and set bodies; default to 1 if not provided or invalid
    bodies = (typeof bodies === 'number' && bodies > 0) ? bodies : 1;

    // Check if the notation is a simple number (e.g., "1")
    if (/^\d+$/.test(diceNotation)) {
        return parseInt(diceNotation) * bodies;
    }
    
    // Parse and multiply the number of dice by the number of bodies if it's a dice notation
    const parts = diceNotation.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (!parts) return 0; // Return 0 if the notation is invalid

    const diceCount = parseInt(parts[1], 10) * bodies; // Apply bodies to the number of dice
    const diceType = parseInt(parts[2], 10);
    const modifier = parts[3] ? parseInt(parts[3], 10) : 0;

    let total = 0;
    for (let i = 0; i < diceCount; i++) {
        total += Math.floor(Math.random() * diceType) + 1;
    }
    return total + modifier;
}

function parseAndRollDice(diceNotation) {
    const parts = diceNotation.match(/(\d+)d(\d+)([+-]\d+)?/);
    const diceCount = parseInt(parts[1], 10);
    const diceType = parseInt(parts[2], 10);
    const modifier = parts[3] ? parseInt(parts[3], 10) : 0;

    let subtotal = 0;
    for (let i = 0; i < diceCount; i++) {
        subtotal += Math.floor(Math.random() * diceType) + 1;
    }
    return subtotal + modifier;
}