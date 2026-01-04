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
    // Basic heuristic parsing (Adjust based on actual OddsShark text patterns)
    // Example: "NY Rangers are 8-2 in their last 10 games"
    const parts = rawText.split(' ');
    
    // Simple extraction logic (can be enhanced with Regex)
    let team = parts.slice(0, 2).join(' '); // Rough approximation
    if(rawText.includes('Rangers')) team = "NY Rangers";
    if(rawText.includes('Bruins')) team = "Boston Bruins";
    
    let stat = rawText.includes('OVER') ? 'OVER' : (rawText.includes('UNDER') ? 'UNDER' : 'spread');
    let record = rawText.match(/\d+-\d+(-\d+)?/)?.[0] || "N/A";
    let sample = "10 games"; // Default fallback if parsing fails
    
    if(rawText.includes('last 5')) sample = "5 games";

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
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.oddsshark.com/nhl/trends', { waitUntil: 'networkidle', timeout: 60000 });
        
        // Scrape table rows (Customize selector based on actual site structure)
        const rawTrends = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('table tr td'))
                .map(td => td.innerText)
                .filter(t => t && t.length > 20 && (t.includes('OVER') || t.includes('UNDER') || t.includes('ATS')));
        });

        console.log(`Found ${rawTrends.length} raw trends.`);

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
            trends: processedTrends.slice(0, 20) // Limit to top 20 for UI
        };

        fs.writeFileSync(path.join(__dirname, '../nhl_trends.json'), JSON.stringify(output, null, 2));
        console.log("Success: Trends saved to nhl_trends.json");

    } catch (error) {
        console.error("Error scraping trends:", error);
    } finally {
        await browser.close();
    }
}

getTrends();