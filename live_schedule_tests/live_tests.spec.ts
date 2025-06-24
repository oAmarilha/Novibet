import { test, expect } from '@playwright/test';
import { extrairDodosJogos, salvarEmXML } from './test_utils';

test.describe('Get schedule games', () => {
  test('store new schedule games', async ({ page }) => {
    await page.goto('https://www.novibet.bet.br/en/live-schedule');

    try {
      await page.locator('.ageRestrictionModal_container').waitFor({ state: 'visible', timeout: 5000 });
      await expect(page.locator('body')).toContainText('Age Verification');
      await page.locator('.ageRestrictionOptions_option :text("I am over 18 years old")').click();
      await page.locator('.ageRestrictionModal_button :text("Continue")').click();
      console.log('Handled age verification modal.');
    } catch (e) {
      console.log('Age verification modal not found or already handled.');
    }
    
    try {
        await page.locator('.registerOrLogin_closeButton').click({ timeout: 2000 });
        console.log('Closed register/login modal.');
    } catch(e) {
        console.log('Register/login modal not found.');
    }

    try {
      await page.locator('.acceptCookies').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('.acceptCookies_button').click();
      console.log('Accepted cookies.');
    } catch (e) {
      console.log('Cookie banner not found or already handled.');
    }

    try {
      await page.locator('.floatingContainer_button :text("All matches")').click();
      await page.locator('.scheduleFilters_dropdownList :text("Soccer")').click();
    } catch(e) {
      console.log('Could not apply filters.');
    }
    
    await page.waitForSelector('sb-event-row-flat.scheduleView_eventItem', { timeout: 10000 });
    
    const jogos = await extrairDodosJogos(page);
    console.log(`Extracted ${jogos.length} games.`);
    
    await salvarEmXML(jogos, './xml-reports/games_list.xml');
    console.log('Games data saved to ./xml-reports/games_list.xml');
  });
});

