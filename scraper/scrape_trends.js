const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function getTrends() {
    console.log("Starting Scraper...");

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
        await page.waitForTimeout(5000); // Wait for data load

        // 2. EXTRACT RAW LINES
        const rawLines = await page.evaluate(() => {
            return document.body.innerText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        });

        console.log(`Scraped ${rawLines.length} lines. Processing...`);

        // --- DEBUG: If we fail to parse, we need to see WHY ---
        // If the script fails, this will print the start of the file so we can see the format.
        if (rawLines.length > 0) {
            console.log("\n--- PREVIEW OF SCRAPED TEXT (First 15 lines) ---");
            rawLines.slice(0, 15).forEach(l => console.log(`[${l}]`));
            console.log("------------------------------------------------\n");
        }

        // 3. PARSE LOGIC
        const structuredGames = [];
        let currentGame = null;
        let currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        // UPDATED REGEX (More flexible)
        // 1. Time: Matches "7:00 PM" OR "7:00 PM ET"
        const timeRegex = /^\d{1,2}:\d{2}\s+(?:AM|PM)(?:\s+ET)?$/i;
        
        // 2. Matchup: Matches "UtahVSNew York" OR "Utah @ New York"
        // Also checks if the line contains "VS" surrounded by letters
        const matchupRegex = /^[A-Za-z0-9\.\s]+VS[A-Za-z0-9\.\s]+$/i;

        // 3. Trend: Must have SU/ATS/OVER/UNDER and a record like 5-1
        const trendRegex = /(?:SU|ATS|OVER|UNDER).*\d+-\d+/;

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];

            // A. CHECK FOR TIME
            if (timeRegex.test(line)) {
                if (currentGame) structuredGames.push(currentGame);
                
                currentGame = {
                    time: line.includes("ET") ? line : `${line} ET`, // Add ET if missing for consistency
                    teams: "Matchup Pending",
                    trends: []
                };
                continue;
            }

            // B. CHECK FOR MATCHUP
            // 1. Single Line "UtahVSNew York"
            if (currentGame && matchupRegex.test(line)) {
                currentGame.teams = line;
                continue;
            }
            // 2. Split Lines "Utah" then "VS" then "New York"
            if (currentGame && rawLines[i+1] === "VS") {
                currentGame.teams = `${line}VS${rawLines[i+2]}`;
                i += 2; // Skip "VS" and the second team name
                continue;
            }

            // C. CHECK FOR TRENDS
            if (currentGame && trendRegex.test(line)) {
                if (line.length > 20 && !line.includes("Source:")) {
                    currentGame.trends.push(line);
                }
            }

            // D. DATE CHECK
            if (line.includes("Monday,") || line.includes("Tuesday,") || line.includes("Wednesday,")) {
                currentDate = line;
            }
        }

        // Push final game
        if (currentGame) structuredGames.push(currentGame);

        // 4. GENERATE OUTPUT
        const output = {
            date: currentDate,
            generated_at: new Date().toISOString(),
            games: structuredGames.filter(g => g.trends.length > 0)
        };

        // Print to Console (User Requested Format)
        if (output.games.length > 0) {
            console.log("\n" + output.date);
            output.games.forEach(game => {
                console.log(game.time);
                console.log(game.teams);
                game.trends.forEach(t => console.log(t));
                console.log("");
            });
            
            // Save to File
            const outputPath = path.join(__dirname, '../nhl_trends.json');
            fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
            console.log(`Success: Saved ${output.games.length} games to nhl_trends.json`);
        } else {
            console.log("ERROR: 0 Games saved. Please check the 'PREVIEW' above to see if the website changed formats.");
        }

    } catch (error) {
        console.error("Error scraping trends:", error);
    } finally {
        await browser.close();
    }
}

getTrends();
