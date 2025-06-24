import { test } from '@playwright/test';
import {
  parseXML,
  saveResultsToXML,
  MAX_SCROLL_ATTEMPTS,
  DELAY_THRESHOLD_MIN,
  DROP_THRESHOLD_MIN,
  convertTime,
} from './test_utils';

test.describe('Verify live events', () => {
  test('verify live games status and timing', async ({ page }) => {
    const games = await parseXML('./xml-reports/games_list.xml');
    
    if (games.length === 0) {
      test.fail(true, 'No games found in the XML file');
      return;
    }
    
    console.log(`Found ${games.length} games in XML file`);
    
    await page.goto('https://www.novibet.bet.br/en/live-betting');
    
    try {
      await page.locator('.ageRestrictionModal_container').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('.ageRestrictionOptions_option :text("I am over 18 years old")').click();
      await page.locator('.ageRestrictionModal_button :text("Continue")').click();
      await page.locator('.registerOrLogin_closeButton').click();
      console.log('Handled age verification');
    } catch (error) {
      console.log('Age verification modal not found or already handled');
    }
    
    try {
      await page.locator('.acceptCookies').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('.acceptCookies_button').click();
      console.log('Accepted cookies');
    } catch (error) {
      console.log('Cookie banner not found or already handled');
    }
    
    console.log('Waiting for live events to load...');
    try {
      await page.waitForSelector('.inPlayEvents_competition, .eventRow', { timeout: 30000 });
      console.log('Live events page loaded successfully');

      console.log('Scrolling to load more games...');
      for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
        await page.locator('.inPlayEvents').hover();
        await page.mouse.wheel(0, 200);
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(2000);
      
    } catch (error) {
      console.error('Failed to load live events:', error);
      await page.screenshot({ path: 'live-events-load-failed.png' });
      throw error;
    }
    
    const now = new Date();
    
    const results = {
      games: {
        game: [] as any[]
      }
    };
    
    for (const game of games) {
      const gameIdentifier = `${game.timeCasa} vs ${game.timeVisitante} (${game.tempo})`;
      
      await test.step(`Verify game: ${gameIdentifier}`, async () => {
        console.log(`\n=== Checking game: ${gameIdentifier} ===`);
        
        const cleanHomeTeam = game.timeCasa.trim();
        const cleanAwayTeam = game.timeVisitante.trim();
        
        console.log(`🔍 Looking for game: ${cleanHomeTeam} vs ${cleanAwayTeam}`);
        
        await page.waitForTimeout(1000);
        
        const gameElement = page.locator(`.eventRow`)
          .filter({
            has: page.locator(`.eventRow_home:has-text("${cleanHomeTeam}"):visible`)
          })
          .filter({
            has: page.locator(`.eventRow_away:has-text("${cleanAwayTeam}"):visible`)
          })
          .first();
        
        if (await gameElement.count() === 0) {
          console.log('ℹ️ Game not found on the page. Checking status...');
          
          const [hours, minutes] = game.tempo.split(':').map(Number);
          const gameTime = new Date();
          gameTime.setHours(hours, minutes, 0, 0);
          
          const delayMinutes = Math.floor((now.getTime() - gameTime.getTime()) / (1000 * 60));
          
          // Determine status based on time
          let status: string;
          let statusMessage: string;
          
          if (delayMinutes < 0) {
            status = 'scheduled';
            statusMessage = `⏱️ Game is scheduled to start in ${-delayMinutes} minutes`;
          } else if (delayMinutes >= DROP_THRESHOLD_MIN) {
            status = 'dropped';
            statusMessage = `❌ Game is ${delayMinutes} minutes late - marking as DROPPED`;
          } else if (delayMinutes >= DELAY_THRESHOLD_MIN) {
            status = 'delayed';
            statusMessage = `⚠️ Game is ${delayMinutes} minutes late - marking as DELAYED`;
          } else {
            status = 'not_found';
            statusMessage = '❌ Game not found on the live page';
          }
          
          console.log(statusMessage);
          game.status = status as any;
          
          // Add to results with status
          results.games.game.push({
            home_team: game.timeCasa,
            away_team: game.timeVisitante,
            scheduled_time: game.tempo,
            status: status,
            ...(delayMinutes >= 0 && { delay_minutes: delayMinutes }),
            last_updated: now.toISOString()
          });
          
          game.lastUpdated = now.toISOString();
          return;
        }
        
        console.log('✅ Game found on the page');
        game.status = 'live';
        game.lastUpdated = now.toISOString();
        
        results.games.game.push({
          home_team: game.timeCasa,
          away_team: game.timeVisitante,
          scheduled_time: game.tempo,
          status: 'live',
          last_updated: now.toISOString()
        });
        
        console.log('Game found on the page, checking status...');
        
        const isLive = await gameElement.locator('.eventRowTime_live, .eventRowTime_liveIndicator, .live').count() > 0;
        
        if (!isLive) {
          const hasTimer = await gameElement.locator('[data-test="timer"]').count() > 0;
          if (hasTimer) {
            console.log('Game has a timer, considering it as live');
            console.log(`✅ Game ${gameIdentifier} is live (has timer) as expected`);
            return;
          }
          
          const timeElement = gameElement.locator('.eventRowTime_text, [data-test="timer"]');
          if (await timeElement.count() > 0) {
            const timeText = (await timeElement.innerText()).trim();
            console.log(`Game time: ${timeText}`);
            
            if (/^\d{1,2}:\d{2}$/.test(timeText)) {
              console.log(`✅ Game ${gameIdentifier} is live (has time format) as expected`);
              return;
            }
          }
          
          console.log('Game is not marked as live on the page');
          test.fail(true, `Game ${gameIdentifier} should be live but is not marked as live`);
          return;
        }
        
        console.log(`✅ Game ${gameIdentifier} is live as expected`);
        
        const oddsElement = gameElement.locator('.marketBetItem_price').first();
        if (await oddsElement.count() > 0) {
          const odds = await oddsElement.innerText();
          console.log(`First odds value: ${odds}`);
        }
      });
    }
    
    await saveResultsToXML({ games: { game: results.games.game } }, './xml-reports/game_statuses.xml');

    const delayedOrDroppedGames = results.games.game.filter(
      (game) => game.status === 'delayed' || game.status === 'dropped'
    );

    if (delayedOrDroppedGames.length > 0) {
      const gamesInGmt2 = delayedOrDroppedGames.map((game) => ({
        ...game,
        scheduled_time: convertTime(game.scheduled_time, -3, 2)
      }));

      await saveResultsToXML(
        { games: { game: gamesInGmt2 } },
        './xml-reports/delayed_or_dropped_games_gmt+2.xml'
      );
    }
  });
});