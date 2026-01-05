const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. REWORDING ENGINE (Template-based)
// ==========================================
function rewordTrend(trend) {
    const templates = [
        `The ${trend.team} games have leaned ${trend.stat} the total, hitting in ${trend.record} of their previous ${trend.sample}.`,
        `Recent ${trend.team} matchups show a strong tendency toward the ${trend.stat}, with a ${trend.record} mark over the last ${trend.sample}.`,
        `The ${trend.team} have produced ${trend.record} results toward the ${trend.stat} across their past ${trend.sample}.`,
        `Betting trends favor the ${trend.stat} for ${trend.team}, cashing in ${trend.record} during the last ${trend.sample}.`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
}

// ==========================================
// 2. PARSER (Extracts Data from Text)
// ==========================================
function parseTrend(rawText) {
    // Look for records like "8-2-0" or "8-2"
    const recordMatch = rawText.match(/\b\d{1,2}-\d{1,2}(?:-\d{1,2})?\b/);
    const record = recordMatch ? recordMatch[0] : "N/A";

    // Detect Stat Type
    let stat = "Spread"; 
    if (rawText.toUpperCase().includes('OVER')) stat = "OVER";
    if (rawText.toUpperCase().includes('UNDER')) stat = "UNDER";

    // Detect Sample Size
    let sample = "10 games";
    if (rawText.includes('last 5')) sample = "5 games";
    
    // Team Extraction (Simple Heuristic: First 2 words usually work)
    // Example: "NY Rangers..." -> "NY Rangers"
    let team = rawText.split(' ').slice(0, 2).join(' ');

    return {
        team,
        stat,
        record,
        sample,
        raw: rawText,
        processed: true
    };
}

// ==========================================
// 3. MAIN SCRAPER
// ==========================================
async function getTrends() {
    console.log("Starting Scraper...");
    
    // Launch browser (Headless for server/terminal use)
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    // Create a new browser context with a real User Agent (prevents blocking)
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    try {
        console.log("Navigating to OddsShark...");
        await page.goto('https://www.oddsshark.com/nhl/trends', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait a few seconds for any React/Angular content to populate
        await page.waitForTimeout(4000);

        // --- THE FIX: BRUTE FORCE TEXT EXTRACTION ---
        // We grab text from ALL standard text elements (div, p, li, td).
        // Then we filter specifically for sentences that contain betting keywords.
        const rawTrends = await page.evaluate(() => {
            // Select all potential text containers
            const allElements = document.querySelectorAll('div, p, li, span, td');
            const allText = Array.from(allElements).map(el => el.innerText);
            
            // Remove duplicates to clean up the list
            const uniqueText = [...new Set(allText)];

            return uniqueText.filter(text => {
                // Filter 1: Must be a reasonable length (avoid single words)
                if (!text || text.length < 15) return false;
                
                // Filter 2: Must contain key betting words (OVER, UNDER, ATS)
                const hasKeywords = text.includes('OVER') || text.includes('UNDER') || text.includes('ATS');
                
                // Filter 3: Must contain a record format (e.g., "5-1" or "8-2-0")
                const hasRecord = /\d+-\d+/.test(text);

                return hasKeywords && hasRecord;
            });
        });

        console.log(`Found ${rawTrends.length} raw trends.`);

        // If 0 trends found, take a screenshot for debugging
        if (rawTrends.length === 0) {
            console.log("Warning: 0 trends found. Taking debug screenshot...");
            await page.screenshot({ path: path.join(__dirname, 'debug_failed.png'), fullPage: true });
        }

        // Process the raw text into structured data
        const processedTrends = rawTrends.map(text => {
            const structured = parseTrend(text);
            return {
                ...structured,
                display_text: rewordTrend(structured)
            };
        });

        // ==========================================
        // 4. SAVE DATA
        // ==========================================
        const output = {
            updated_at: new Date().toISOString(),
            date_display: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
            trends: processedTrends.slice(0, 20) // Limit to top 20
        };

        const outputPath = path.join(__dirname, '../nhl_trends.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`Success: Trends saved to ${outputPath}`);

    } catch (error) {
        console.error("Error scraping trends:", error);
        await page.screenshot({ path: path.join(__dirname, 'error_view.png') });
    } finally {
        await browser.close();
    }
}

getTrends();
