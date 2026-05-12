// src/utils/redirectScraper.js
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Funkcja pomocnicza: podąża za przekierowaniami linku i zwraca finalny URL.
 * @param {string} url - początkowy link (np. z ikako.vip)
 * @returns {Promise<string>} - ostateczny adres URL po wszystkich przekierowaniach
 */
export async function getFinalRedirectUrl(url) {
    try {
        const response = await axios.get(url, {
            maxRedirects: 0,         // Nie podążamy automatycznie
            validateStatus: null,    // Akceptujemy każdy kod odpowiedzi HTTP
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)'
            }
        });

        // Jeśli odpowiedź to przekierowanie (status 301, 302, itp.)
        if (response.status >= 300 && response.status < 400 && response.headers.location) {
            let redirectUrl = response.headers.location;
            // W razie potrzeby dołączamy domenę, jeśli redirect jest względny
            if (redirectUrl.startsWith('/')) {
                const urlObj = new URL(url);
                redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
            }
            return redirectUrl;
        }
        return url;
    } catch (error) {
        // Obsługa błędów sieciowych
        console.error(`Błąd podczas śledzenia przekierowań dla ${url}:`, error.message);
        return url;
    }
}

/**
 * Pobiera maksymalnie 3 obrazki z podanej strony.
 * @param {string} pageUrl - adres strony (np. z uufinds.com)
 * @returns {Promise<Buffer[]>} - tablica buforów z obrazkami
 */
export async function scrapeImagesFromUrl(pageUrl) {
    try {
        // 1. Pobieramy kod HTML strony
        const { data: html } = await axios.get(pageUrl, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)' }
        });

        // 2. Ładujemy HTML do Cheerio, żeby łatwo go przeszukać
        const $ = cheerio.load(html);
        const imageUrls = new Set(); // Używamy Set(), żeby uniknąć duplikatów

        // 3. Szukamy wszystkich znaczników <img> i wyciągamy atrybut src
        $('img').each((index, element) => {
            let src = $(element).attr('src');
            if (src && src.startsWith('http')) {
                imageUrls.add(src);
            }
        });

        // Jeśli nie znaleźliśmy żadnego obrazka, kończymy
        if (imageUrls.size === 0) return [];

        // 4. Pobieramy pierwsze 3 obrazki jako buffery
        const imageBuffers = [];
        for (const url of [...imageUrls].slice(0, 3)) {
            try {
                const response = await axios.get(url, {
                    responseType: 'arraybuffer', // Pobieramy jako binarny bufor
                    timeout: 8000
                });
                // Sprawdzamy, czy to na pewno obrazek
                const contentType = response.headers['content-type'];
                if (contentType && contentType.startsWith('image/')) {
                    imageBuffers.push(response.data);
                }
            } catch (err) {
                console.error(`Błąd przy pobieraniu obrazka: ${url}`, err.message);
            }
        }
        return imageBuffers;
    } catch (error) {
        console.error('Błąd scrapowania strony:', error.message);
        return [];
    }
}
