const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 1. REWORDING ENGINE (Template-based)
function rewordTrend(trend) {
    const templates = [
        `The ${trend.team} games have leaned ${trend.stat} the total, hitting in ${trend.record} of their previous ${trend.sample}.`,
        `Recent ${trend.team} matchups show a strong tendency toward the ${trend.stat}, with a ${trend.record} mark over the last ${trend.sample}.`,
        `The ${trend.team} have produced ${trend.record} results toward the ${trend.stat} across their past ${trend.sample}.`,
        `Betting trends favor the ${trend.stat} for ${trend.team}, cashing in ${trend.record} during the last ${trend.sample}.`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
}

// 2. PARSER
function parseTrend(rawText) {
    // Enhanced Regex to find records like "8-2-0" or "8-2"
    const recordMatch = rawText.match(/\b\d{1,2}-\d{1,2}(?:-\d{1,2})?\b/);
    const record = recordMatch ? recordMatch[0] : "N/A";

    // Detect Stat Type
    let stat = "Spread"; // Default
    if (rawText.toUpperCase().includes('OVER')) stat = "OVER";
    if (rawText.toUpperCase().includes('UNDER')) stat = "UNDER";

    // Detect Sample Size
    let sample = "10 games";
    if (rawText.includes('last 5')) sample = "5 games";
    
    // Team Extraction (Simple Heuristic: First 2-3 words usually)
    // You can expand this list or use a mapping object for better accuracy
    let team = rawText.split(' ').slice(0, 2).join(' ');
    if (rawText.includes('NY Rangers')) team = "NY Rangers";
    if (rawText.includes('Montreal')) team = "Montreal Canadiens";

    return {
        team,
        stat,
        record,
        sample,
        raw: rawText,
        processed: true
    };
}

// 3. MAIN SCRAPER
async function getTrends() {
    console.log("Starting Scraper...");
    
    // Launch with specific args to work better in GitHub Actions
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    // Use a specific context to set a real browser size and User Agent
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();

    try {
        console.log("Navigating to OddsShark...");
        await page.goto('https://www.oddsshark.com/nhl/trends', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // CRITICAL FIX: Explicit wait for the table content
        // This waits up to 10 seconds for ANY table cell to appear
        try {
            await page.waitForSelector('table tr td', { timeout: 10000 });
            console.log("Table data detected.");
        } catch (e) {
            console.log("Warning: Specific table selector timed out. Taking screenshot...");
        }

        // --- DEBUG: TAKE SCREENSHOT ---
        // This saves an image of what the bot sees.
        await page.screenshot({ path: path.join(__dirname, 'debug_view.png'), fullPage: true });
        console.log("Debug screenshot saved to scraper/debug_view.png");
        // ------------------------------

        // Scrape table rows
        const rawTrends = await page.evaluate(() => {
            // Strategy 1: Look for standard table cells
            const cells = Array.from(document.querySelectorAll('table tr td'));
            const cellTexts = cells.map(td => td.innerText);

            // Strategy 2: Fallback - Look for any list items if tables aren't used
            const listItems = Array.from(document.querySelectorAll('li'));
            const listTexts = listItems.map(li => li.innerText);

            const allTexts = [...cellTexts, ...listTexts];

            // Filter for meaningful trend text
            return allTexts.filter(t => 
                t && 
                t.length > 15 && 
                (t.includes('OVER') || t.includes('UNDER') || t.includes('ATS') || t.match(/\d+-\d+/))
            );
        });

        console.log(`Found ${rawTrends.length} raw trends.`);

        // If we found nothing, stop here (but we have the screenshot to debug)
        if (rawTrends.length === 0) {
            console.log("No trends found. Please check 'debug_view.png' to see if the site blocked the bot.");
            return; 
        }

        // Process and deduplicate
        const processedTrends = rawTrends.map(text => {
            const structured = parseTrend(text);
            return {
                ...structured,
                display_text: rewordTrend(structured)
            };
        });

        // 4. SAVE DATA
        const output = {
            updated_at: new Date().toISOString(),
            date_display: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
            trends: processedTrends.slice(0, 20) // Limit to top 20
        };

        // Write to the parent folder (../nhl_trends.json)
        const outputPath = path.join(__dirname, '../nhl_trends.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`Success: Trends saved to ${outputPath}`);

    } catch (error) {
        console.error("Error scraping trends:", error);
        // Take a screenshot on error too
        await page.screenshot({ path: path.join(__dirname, 'error_view.png') });
    } finally {
        await browser.close();
    }
}

getTrends();
