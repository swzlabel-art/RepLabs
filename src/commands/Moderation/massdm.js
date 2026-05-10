import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logEvent } from '../../utils/moderation.js';
import { sanitizeMarkdown } from '../../utils/sanitization.js';

const OWNER_ID = "1110216754812178524";

export default {
    data: new SlashCommandBuilder()
        .setName("massdm")
        .setDescription("Wysyła DM do wszystkich użytkowników na serwerze (tylko właściciel)")
        .addStringOption(option =>
            option.setName("tresc")
                .setDescription("Treść wiadomości")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    category: "Moderation",

    async execute(interaction, config, client) {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: "❌ Tylko właściciel bota może używać tej komendy.", flags: MessageFlags.Ephemeral });
        }

        await InteractionHelper.safeDefer(interaction, { ephemeral: true });

        const tresc = interaction.options.getString("tresc");
        if (tresc.length > 2000) {
            return InteractionHelper.safeEditReply(interaction, { content: "❌ Treść za długa (max 2000 znaków).", flags: MessageFlags.Ephemeral });
        }

        const cleanedText = sanitizeMarkdown(tresc);
        const guild = interaction.guild;
        await guild.members.fetch();
        const members = guild.members.cache.filter(m => !m.user.bot);

        if (members.size === 0) {
            return InteractionHelper.safeEditReply(interaction, { content: "⚠️ Brak użytkowników do wysłania." });
        }

        // Potwierdzenie
        const confirmEmbed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle("🚨 Masowa wysyłka DM")
            .setDescription(`Wyślij wiadomość do **${members.size}** użytkowników?\n\nTreść:\n${cleanedText.substring(0, 400)}`)
            .setFooter({ text: "Kliknij przycisk w ciągu 30 sekund." });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('confirm').setLabel('✅ TAK').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancel').setLabel('❌ NIE').setStyle(ButtonStyle.Danger)
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [confirmEmbed], components: [row] });

        const filter = (btnInt) => btnInt.user.id === interaction.user.id;
        let confirmation;
        try {
            confirmation = await interaction.channel.awaitMessageComponent({ filter, time: 30000, componentType: 'BUTTON' });
        } catch (e) {
            return InteractionHelper.safeEditReply(interaction, { content: "⏰ Anulowano (brak odpowiedzi).", components: [], embeds: [] });
        }

        if (confirmation.customId === 'cancel') {
            await confirmation.update({ content: "❌ Anulowano.", components: [], embeds: [] }).catch(err => {
                logger.error(`Błąd przy aktualizacji anulowania: ${err}`);
            });
            return;
        }

        // --- KLUCZOWA POPRAWKA: bezpieczna aktualizacja na "Rozpoczynam..." ---
        try {
            await confirmation.update({ content: "⏳ Rozpoczynam wysyłkę...", components: [], embeds: [] });
        } catch (updateError) {
            logger.error(`Błąd przy update confirmation: ${updateError}`);
            // Nie ma już jak odpowiedzieć przez confirmation, wysyłamy nową wiadomość w kanale (ephemeral)
            return InteractionHelper.safeEditReply(interaction, { 
                content: "❌ Nie udało się potwierdzić (interakcja wygasła lub wiadomość usunięta). Spróbuj ponownie.", 
                components: [], 
                embeds: [] 
            });
        }

        const embed = new EmbedBuilder().setDescription(cleanedText).setColor('#FFCC00');
        const button = new ButtonBuilder()
            .setLabel('PRZEJDŹ NA SERWER 🚀')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.com/channels/1464968036791357648/1464980867771269271');
        const actionRow = new ActionRowBuilder().addComponents(button);

        let success = 0, fail = 0;
        let stopped = false;

        for (const [, member] of members) {
            if (stopped) break;
            try {
                await member.send({ embeds: [embed], components: [actionRow] });
                success++;
                await new Promise(r => setTimeout(r, 1500));
            } catch (error) {
                fail++;
                logger.warn(`MassDM fail: ${member.user.tag} - ${error.code}`);
                // Jeśli błąd to "Cannot send messages to this user" (50007) – pomijamy
            }
        }

        const summary = new EmbedBuilder()
            .setColor(success ? '#57F287' : '#ED4245')
            .setTitle("📬 Zakończono")
            .setDescription(`✅ Wysłano: ${success}\n❌ Błędy: ${fail}`);
        
        // Ponowne użycie safeEditReply – w tym momencie interakcja może być już wykorzystana,
        // ale safeEditReply powinien obsłużyć followUp jeśli trzeba. Dla bezpieczeństwa:
        try {
            await InteractionHelper.safeEditReply(interaction, { embeds: [summary], components: [] });
        } catch (finalError) {
            logger.error(`MassDM końcowy błąd: ${finalError}`);
            // Jeśli nie można edytować (np. interakcja wygasła), wysyłamy followUp
            await interaction.followUp({ embeds: [summary], flags: MessageFlags.Ephemeral });
        }
    }
};
