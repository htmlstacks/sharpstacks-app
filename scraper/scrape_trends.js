const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function getTrends() {
    console.log("Starting Scraper...");

    // 1. SETUP BROWSER
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    // Use a standard browser context to avoid detection
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    try {
        console.log("Navigating to OddsShark...");
        await page.goto('https://www.oddsshark.com/nhl/trends', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait for the data to populate
        await page.waitForTimeout(5000);

        // 2. EXTRACT RAW LINES (Top-to-Bottom)
        // We grab the text of the body and split it by newlines. 
        // This preserves the visual order of the data.
        const rawLines = await page.evaluate(() => {
            return document.body.innerText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0); // Remove empty lines
        });

        console.log(`Scraped ${rawLines.length} lines of text. Processing...`);

        // 3. PARSE LOGIC (The "Brain")
        const structuredGames = [];
        let currentGame = null;
        let currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        // Regex helpers
        const timeRegex = /^\d{1,2}:\d{2}\s+(?:AM|PM)\s+ET$/i; // Matches "7:00 PM ET"
        const trendRegex = /(?:SU|ATS|OVER|UNDER).*\d+-\d+/; // Matches "SU ... 5-1" or "OVER ... 8-2"
        const matchupRegex = /^[A-Za-z\s\.]+VS[A-Za-z\s\.]+$/; // Matches "UtahVSNew York"

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];

            // A. CHECK FOR TIME (Start of a new game block)
            if (timeRegex.test(line)) {
                // If we were building a game, save it before starting a new one
                if (currentGame) {
                    structuredGames.push(currentGame);
                }

                currentGame = {
                    time: line,
                    teams: "Matchup Pending", // Will find in next lines
                    trends: []
                };
                continue;
            }

            // B. CHECK FOR MATCHUP (Usually appears right after time)
            // Looking for patterns like "UtahVSNew York" or just "Utah" followed by "VS" later
            if (currentGame && matchupRegex.test(line)) {
                currentGame.teams = line;
                continue;
            }
            
            // Handle split team names (e.g. Line 1: Utah, Line 2: VS, Line 3: New York)
            if (currentGame && rawLines[i+1] === "VS") {
                 // Simple lookahead to catch "Utah \n VS \n New York"
                 currentGame.teams = `${line}VS${rawLines[i+2]}`;
                 i += 2; // Skip the next two lines since we used them
                 continue;
            }

            // C. CHECK FOR TRENDS
            // Must belong to an active game and look like a trend
            if (currentGame && trendRegex.test(line)) {
                // Filter out "Market Analysis" or short garbage lines
                if (line.length > 20 && !line.includes("Source:")) {
                    currentGame.trends.push(line);
                }
            }
            
            // D. DATE CHECK (Optional override if the page lists the date explicitly)
            if (line.includes("Monday,") || line.includes("Tuesday,") || line.includes("Wednesday,")) {
                currentDate = line;
            }
        }

        // Push the final game if it exists
        if (currentGame) {
            structuredGames.push(currentGame);
        }

        // 4. GENERATE OUTPUT
        // We create a clean JSON structure
        const output = {
            date: currentDate,
            generated_at: new Date().toISOString(),
            games: structuredGames.filter(g => g.trends.length > 0) // Only save games with found trends
        };

        // 5. PRINT TO CONSOLE (To match your request format)
        console.log("\n" + output.date);
        output.games.forEach(game => {
            console.log(game.time);
            console.log(game.teams);
            game.trends.forEach(t => console.log(t));
            console.log(""); // Empty line between games
        });

        // 6. SAVE TO FILE
        const outputPath = path.join(__dirname, '../nhl_trends.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`Success: Saved ${output.games.length} games to nhl_trends.json`);

    } catch (error) {
        console.error("Error scraping trends:", error);
        await page.screenshot({ path: path.join(__dirname, 'error_view.png') });
    } finally {
        await browser.close();
    }
}

getTrends();
