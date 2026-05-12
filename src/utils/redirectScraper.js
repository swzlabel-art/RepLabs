// src/utils/redirectScraper.js
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Śledzi WSZYSTKIE przekierowania (wielokrotne) i zwraca ostateczny URL.
 * @param {string} url - początkowy link
 * @returns {Promise<string>} - finalny URL po wszystkich przekierowaniach
 */
export async function getFinalRedirectUrl(url) {
    let currentUrl = url;
    const maxRedirects = 10;
    for (let i = 0; i < maxRedirects; i++) {
        try {
            const response = await axios.get(currentUrl, {
                maxRedirects: 0,
                validateStatus: null,
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)' }
            });
            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                let redirectUrl = response.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const urlObj = new URL(currentUrl);
                    redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                } else if (!redirectUrl.startsWith('http')) {
                    // relative path without leading slash
                    const base = currentUrl.endsWith('/') ? currentUrl : currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
                    redirectUrl = new URL(redirectUrl, base).href;
                }
                currentUrl = redirectUrl;
                continue;
            }
            return currentUrl;
        } catch (error) {
            console.error(`Błąd śledzenia przekierowań (${currentUrl}):`, error.message);
            return currentUrl;
        }
    }
    return currentUrl;
}

/**
 * Pobiera maksymalnie 3 obrazki z podanej strony (zwraca buffery).
 * Obsługuje zarówno <img src="">, jak i atrybuty lazy-loading (data-src, data-original).
 * @param {string} pageUrl 
 * @returns {Promise<Buffer[]>}
 */
export async function scrapeImagesFromUrl(pageUrl) {
    try {
        const { data: html } = await axios.get(pageUrl, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)' }
        });

        const $ = cheerio.load(html);
        const imageUrls = new Set();

        // Szukamy obrazków w różnych atrybutach
        $('img').each((_, el) => {
            let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                else if (src.startsWith('/')) {
                    const baseUrl = new URL(pageUrl);
                    src = baseUrl.origin + src;
                }
                if (src.startsWith('http')) imageUrls.add(src);
            }
        });

        if (imageUrls.size === 0) return [];

        const imageBuffers = [];
        for (const url of [...imageUrls].slice(0, 3)) {
            try {
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 8000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)' }
                });
                const contentType = response.headers['content-type'];
                if (contentType && contentType.startsWith('image/')) {
                    imageBuffers.push(response.data);
                }
            } catch (err) {
                console.error(`Błąd pobierania obrazka ${url}:`, err.message);
            }
        }
        return imageBuffers;
    } catch (error) {
        console.error('Błąd scrapowania strony:', error.message);
        return [];
    }
}
