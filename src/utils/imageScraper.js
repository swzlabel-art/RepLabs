// src/utils/imageScraper.js
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Pobiera max 3 obrazki z podanej strony i zwraca je jako tablicę bufferów.
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
        $('img').each((_, element) => {
            let src = $(element).attr('src');
            if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
                imageUrls.add(src);
            }
        });

        // 4. Jeśli nic nie znaleźliśmy, kończymy
        if (imageUrls.size === 0) return [];

        // 5. Pobieramy max 3 obrazki jako buffery (nie zapisujemy na dysku)
        const imageBuffers = [];
        for (const url of [...imageUrls].slice(0, 3)) {
            try {
                const response = await axios.get(url, {
                    responseType: 'arraybuffer', // Kluczowe: pobieramy jako binarny buffer
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
