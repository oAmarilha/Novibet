import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as xml2js from 'xml2js';
import * as path from 'path';

// --- Constants ---
export const MAX_SCROLL_ATTEMPTS = 5;
export const DELAY_THRESHOLD_MIN = 1;
export const DROP_THRESHOLD_MIN = 20;

// --- Interfaces ---
export interface Game {
  tempo: string;
  timeCasa: string;
  timeVisitante: string;
  odds: {
    casa: string;
    empate: string;
    visitante: string;
  };
  status?: 'scheduled' | 'live' | 'delayed' | 'dropped' | 'not_found';
  lastUpdated?: string;
}

// --- Functions ---

/**
 * Extracts game data from the schedule page.
 */
export async function extrairDodosJogos(page: Page): Promise<Game[]> {
  return await page.evaluate(() => {
    const jogos: Game[] = [];
    const elementosJogos = document.querySelectorAll('sb-event-row-flat.scheduleView_eventItem');
    const limite = Math.min(elementosJogos.length, 10);

    for (let i = 0; i < limite; i++) {
      const jogoElement = elementosJogos[i];
      
      let tempo = (jogoElement.querySelector('.eventRowTime_text') as HTMLElement)?.innerText.trim() || 'N/A';
      
      // Handle formats like "in X minutes" or "X'"
      const minutesMatch = tempo.match(/\d+/);
      if (minutesMatch) {
        const minutesToAdd = parseInt(minutesMatch[0], 10);
        if (!isNaN(minutesToAdd)) {
            const now = new Date();
            now.setMinutes(now.getMinutes() + minutesToAdd);
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            tempo = `${hours}:${minutes}`;
        }
      }

      const timeCasa = (jogoElement.querySelector('.eventRow_home .u-text-ellipsis') as HTMLElement)?.innerText.trim() || 'N/A';
      const timeVisitante = (jogoElement.querySelector('.eventRow_away .u-text-ellipsis') as HTMLElement)?.innerText.trim() || 'N/A';

      const oddsElements = jogoElement.querySelectorAll('.marketBetItem_price');
      const odds = {
        casa: (oddsElements[0] as HTMLElement)?.innerText.trim() || 'N/A',
        empate: (oddsElements[1] as HTMLElement)?.innerText.trim() || 'N/A',
        visitante: (oddsElements[2] as HTMLElement)?.innerText.trim() || 'N/A',
      };

      jogos.push({ tempo, timeCasa, timeVisitante, odds, status: 'scheduled' });
    }
    return jogos;
  });
}

/**
 * Saves the initial list of games to an XML file.
 */
export async function salvarEmXML(jogos: Game[], caminhoArquivo: string): Promise<void> {
  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
  });
  const xml = builder.buildObject({ games: { game: jogos } });
  fs.writeFileSync(caminhoArquivo, xml);
}

/**
 * Parses the XML file to get the list of games.
 */
export async function parseXML(filePath: string): Promise<Game[]> {
  const xmlData = fs.readFileSync(filePath, 'utf-8');
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlData);
  const rootElement = result.games || result.jogos;
  if (!rootElement || !rootElement.game) {
    return [];
  }
  return Array.isArray(rootElement.game) ? rootElement.game : [rootElement.game];
}

/**
 * Saves the final game statuses to an XML file.
 */
export async function saveResultsToXML(results: any, filename: string): Promise<void> {
  try {
    const builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      headless: true,
      renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    });
    const xml = builder.buildObject(results);
    const outputPath = path.join(process.cwd(), filename);
    fs.writeFileSync(outputPath, xml);
    console.log(`\n✅ Results saved to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Failed to save results to ${filename}:`, error);
    throw error;
  }
}

/**
 * Converts a time string from one UTC offset to another.
 * @param timeStr - The time string in HH:MM format.
 * @param fromUtcOffset - The UTC offset of the original time (e.g., -3 for GMT-3).
 * @param toUtcOffset - The UTC offset of the target time (e.g., 2 for GMT+2).
 */
export function convertTime(timeStr: string, fromUtcOffset: number, toUtcOffset: number): string {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr; // Return original if format is not HH:MM
  }

  const [hours, minutes] = timeStr.split(':').map(Number);
  const hourDiff = toUtcOffset - fromUtcOffset;
  let newHour = (hours + hourDiff) % 24;

  if (newHour < 0) {
    newHour += 24;
  }

  const formattedHour = String(newHour).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');

  return `${formattedHour}:${formattedMinutes}`;
}
