const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Helper to extract team names from trend text
function extractTeamFromTrend(text) {
    // List of known NHL team identifiers for matching
    const teams = [
        "Anaheim", "Boston", "Buffalo", "Calgary", "Carolina", "Chicago", "Colorado", "Columbus",
        "Dallas", "Detroit", "Edmonton", "Florida", "Los Angeles", "Minnesota", "Montreal", 
        "Nashville", "New Jersey", "NY Islanders", "NY Rangers", "Ottawa", "Philadelphia", 
        "Pittsburgh", "San Jose", "Seattle", "St. Louis", "Tampa Bay", "Toronto", "Utah", 
        "Vancouver", "Vegas", "Washington", "Winnipeg", "Arizona"
    ];

    for (const team of teams) {
        if (text.includes(team)) return team;
    }
    return "Unknown Team";
}

async function getTrends() {
    console.log("Starting Robust Scraper...");

    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    try {
        console.log("Navigating to OddsShark...");
        await page.goto('https://www.oddsshark.com/nhl/trends', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait longer for the full list to load
        await page.waitForTimeout(6000);

        // 1. GET ALL TEXT LINES
        // We capture everything to ensure we don't miss "hidden" blocks
        const rawLines = await page.evaluate(() => {
            return document.body.innerText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        });

        console.log(`Scanned ${rawLines.length} lines. looking for patterns...`);

        // 2. INTELLIGENT PARSING
        const gamesMap = new Map(); // Store games by "Team vs Opponent" key

        let lastTimeFound = "Time TBD";

        // Loose regex to catch times like "7:00 PM", "7:00 PM ET", "FINAL", "TODAY"
        const timeRegex = /(\d{1,2}:\d{2}\s?(?:AM|PM)|FINAL|TODAY)/i;
        
        // Regex to find betting trends (Must have SU/ATS/OVER/UNDER + a record)
        const trendRegex = /(?:SU|ATS|OVER|UNDER).*\d+-\d+/;

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];

            // A. UPDATE TIME CONTEXT
            // If we see a time, update our "current time" tracker
            if (timeRegex.test(line) && line.length < 20) {
                lastTimeFound = line;
            }

            // B. FIND TRENDS
            if (trendRegex.test(line) && line.length > 20 && !line.includes("Source:")) {
                
                // 1. Identify who this trend is about
                const primaryTeam = extractTeamFromTrend(line);
                
                if (primaryTeam !== "Unknown Team") {
                    // Create a unique key for the game (e.g., "Utah_Game")
                    // We group by the team name. Later we can pair them if needed.
                    if (!gamesMap.has(primaryTeam)) {
                        gamesMap.set(primaryTeam, {
                            time: lastTimeFound,
                            team: primaryTeam,
                            trends: []
                        });
                    }
                    gamesMap.get(primaryTeam).trends.push(line);
                }
            }
        }

        // 3. FORMAT THE OUTPUT
        // Convert our Map into the Array format you requested
        const gameList = Array.from(gamesMap.values());

        // Simple deduplication/merging logic
        // (Optional: If you want to merge "Utah" and "NY Rangers" into one block, 
        // we can do that, but listing by Team is safer to avoid mismatching).
        
        const output = {
            date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
            generated_at: new Date().toISOString(),
            games: gameList.map(g => ({
                time: g.time,
                teams: `${g.team} (and opponent)`, // Simplified header
                trends: g.trends
            }))
        };

        // 4. PRINT TO CONSOLE (The specific format you asked for)
        if (gameList.length > 0) {
            console.log("\n" + output.date);
            
            gameList.forEach(game => {
                console.log(game.time);
                console.log(game.team + " Matchup"); 
                game.trends.forEach(t => console.log(t));
                console.log("");
            });

            // 5. SAVE FILE
            const outputPath = path.join(__dirname, '../nhl_trends.json');
            fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
            console.log(`Success: Saved ${gameList.length} team trend blocks to nhl_trends.json`);
        } else {
            console.log("Warning: No trends found. The page might be empty or showing 'No Games Today'.");
            // Save empty file to prevent errors
            fs.writeFileSync(path.join(__dirname, '../nhl_trends.json'), JSON.stringify({ games: [] }));
        }

    } catch (error) {
        console.error("Error scraping trends:", error);
    } finally {
        await browser.close();
    }
}

getTrends();
