// src/commands/search/qc.js
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getFinalRedirectUrl, scrapeImagesFromUrl } from '../../utils/redirectScraper.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('qc')
        .setDescription('🔍 Znajduje i wysyła Ci na PW obrazki QC dla podanego linku.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('Wklej tutaj link z platformy zakupowej (np. ikako.vip).')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        
        const userLink = interaction.options.getString('link');
        
        // Podążamy za przekierowaniami (ikako.vip -> uufinds.com)
        const qcPageUrl = await getFinalRedirectUrl(userLink);
        
        // Walidacja czy to link do uufinds.com
        if (!qcPageUrl.includes('uufinds.com')) {
            return InteractionHelper.safeEditReply(interaction, {
                content: `❌ **Nieprawidłowy link.** Nie mogę znaleźć strony z QC. Upewnij się, że podajesz link do produktu.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Pobieramy obrazki
        const images = await scrapeImagesFromUrl(qcPageUrl);

        if (!images || images.length === 0) {
            return InteractionHelper.safeEditReply(interaction, {
                content: `😔 **Nie znaleziono obrazków.** Nie udało mi się pobrać żadnych zdjęć dla linku: ${qcPageUrl}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Wysyłamy na PW
        try {
            await interaction.user.send(`📸 **Znalazłem ${images.length} obrazek(ów) dla Twojego zapytania:**\n${qcPageUrl}`);
            for (const [index, buffer] of images.entries()) {
                const attachment = { attachment: buffer, name: `qc_image_${index + 1}.png` };
                await interaction.user.send({ files: [attachment] });
            }

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ **Gotowe!** Znalazłem ${images.length} obrazek(ów) i wysłałem je na Twoją skrzynkę PW. Sprawdź wiadomość prywatną ode mnie.\nAdres strony: ${qcPageUrl}`,
                flags: MessageFlags.Ephemeral
            });
        } catch (dmError) {
            console.error('Nie udało się wysłać PW:', dmError);
            await InteractionHelper.safeEditReply(interaction, {
                content: `❌ **Nie mogę wysłać Ci wiadomości prywatnej.**\nOtwórz swoje ustawienia Discord: **Ustawienia Użytkownika → Prywatność i bezpieczeństwo → Zezwalaj na wiadomości prywatne od członków serwera** i spróbuj ponownie.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
