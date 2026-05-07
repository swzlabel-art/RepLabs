import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logEvent } from '../../utils/moderation.js';
import { sanitizeMarkdown } from '../../utils/sanitization.js';

const OWNER_ID = "1110216754812178524";   // Twój ID

export default {
    data: new SlashCommandBuilder()
        .setName("massdm")
        .setDescription("Wysyła embed z żółtym paskiem i przyciskiem do WSZYSTKICH użytkowników na serwerze (tylko właściciel)")
        .addStringOption(option =>
            option.setName("tresc")
                .setDescription("Treść wiadomości (embed)")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    category: "Moderation",

    async execute(interaction, config, client) {
        // 1️⃣ Tylko właściciel
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: "❌ Tylko właściciel bota może używać tej komendy.",
                flags: MessageFlags.Ephemeral
            });
        }

        // 2️⃣ Defer (bo potrwa dłużej)
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        let tresc = interaction.options.getString("tresc");
        if (tresc.length > 2000) {
            return InteractionHelper.safeEditReply(interaction, {
                content: "❌ Treść wiadomości nie może przekraczać 2000 znaków.",
                flags: MessageFlags.Ephemeral
            });
        }
        const cleanedText = sanitizeMarkdown(tresc);

        // 3️⃣ Pobranie wszystkich członków (bez botów)
        await interaction.guild.members.fetch(); // pełne pobranie
        const members = interaction.guild.members.cache.filter(m => !m.user.bot);
        if (members.size === 0) {
            return InteractionHelper.safeEditReply(interaction, {
                content: "⚠️ Brak użytkowników do wysłania (tylko boty?).",
                flags: MessageFlags.Ephemeral
            });
        }

        // 4️⃣ Potwierdzenie (przycisk)
        const confirmEmbed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle("🚨 Masowa wysyłka DM")
            .setDescription(`Za chwilę wyślesz wiadomość do **${members.size}** użytkowników.\n\n**Treść:**\n${cleanedText.substring(0, 500)}`)
            .setFooter({ text: "Czy na pewno? Odpowiedz w 30 sekund." });

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('confirm_massdm').setLabel('✅ TAK, wyślij').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancel_massdm').setLabel('❌ ANULUJ').setStyle(ButtonStyle.Danger)
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [confirmEmbed], components: [confirmRow] });

        // Oczekiwanie na kliknięcie
        const filter = (btnInt) => btnInt.user.id === interaction.user.id;
        let confirmation;
        try {
            confirmation = await interaction.channel.awaitMessageComponent({ filter, time: 30000, componentType: 'BUTTON' });
        } catch (e) {
            return InteractionHelper.safeEditReply(interaction, { content: "⏰ Anulowano – brak odpowiedzi.", components: [], embeds: [] });
        }

        if (confirmation.customId === 'cancel_massdm') {
            return confirmation.update({ content: "❌ Anulowano wysyłkę.", components: [], embeds: [] });
        }

        await confirmation.update({ content: "⏳ Rozpoczynam wysyłkę... (może potrwać kilka minut)", components: [], embeds: [] });

        // 5️⃣ Przygotowanie embeda i przycisku (identycznie jak w dm.js)
        const embed = new EmbedBuilder()
            .setDescription(cleanedText)
            .setColor('#FFCC00');
        const button = new ButtonBuilder()
            .setLabel('PRZEJDŹ NA SERWER 🚀')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.com/channels/1464968036791357648/1464980867771269271');
        const row = new ActionRowBuilder().addComponents(button);

        let successCount = 0;
        let failCount = 0;
        const failedUsers = [];

        // 6️⃣ Pętla wysyłania z opóźnieniem (rate limit)
        for (const [, member] of members) {
            try {
                await member.send({ embeds: [embed], components: [row] });
                successCount++;
                await delay(1500); // 1.5 sek przerwy między DM
            } catch (error) {
                failCount++;
                failedUsers.push(`${member.user.tag} (${error.code || error.message})`);
                logger.warn(`MassDM: nie wysłano do ${member.user.tag}: ${error.code}`);
            }
        }

        // 7️⃣ Podsumowanie
        const summaryEmbed = new EmbedBuilder()
            .setColor(successCount > 0 ? '#57F287' : '#ED4245')
            .setTitle("📬 Masowe DM – zakończone")
            .setDescription(`**Wysłano:** ${successCount}\n**Nie wysłano:** ${failCount}`)
            .setTimestamp();

        if (failedUsers.length > 0 && failedUsers.length <= 10) {
            summaryEmbed.addFields({ name: "❌ Nieudane", value: failedUsers.join("\n") });
        } else if (failedUsers.length > 10) {
            summaryEmbed.addFields({ name: "❌ Nieudane (pierwsze 10)", value: failedUsers.slice(0,10).join("\n") + `\n... i ${failedUsers.length-10} więcej` });
        }

        await InteractionHelper.safeEditReply(interaction, { embeds: [summaryEmbed], components: [] });

        // Logowanie (opcjonalne)
        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: "Mass DM (wszyscy użytkownicy)",
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: `Wysłano do ${successCount} użytkowników, błędy: ${failCount}`,
                metadata: { messagePreview: cleanedText.substring(0, 200) }
            }
        });
    }
};

// Pomocnicza funkcja opóźnienia
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
