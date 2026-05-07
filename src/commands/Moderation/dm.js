import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logEvent } from '../../utils/moderation.js';
import { sanitizeMarkdown } from '../../utils/sanitization.js';

// 👇 WPISZ TUTAJ SWÓJ NUMER ID (prawy klik na siebie na Discordzie -> Kopiuj ID)
const OWNER_ID = "1110216754812178524";   // np. "123456789012345678"

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Wysyła embed z żółtym paskiem i przyciskiem do użytkownika (tylko właściciel)")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Użytkownik, który otrzyma wiadomość")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("tresc")
                .setDescription("Treść wiadomości (embed)")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    category: "Moderation",

    async execute(interaction, config, client) {
        // 1️⃣ Sprawdzenie, czy wykonawca to właściciel (TY)
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: "❌ Tylko właściciel bota może używać tej komendy.",
                flags: MessageFlags.Ephemeral
            });
        }

        // 2️⃣ Defer (zabezpieczenie przed timeout)
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        const targetUser = interaction.options.getUser("user");
        let tresc = interaction.options.getString("tresc");

        // Walidacje
        if (targetUser.bot) {
            return InteractionHelper.safeEditReply(interaction, {
                content: "❌ Nie można wysłać wiadomości do bota.",
                flags: MessageFlags.Ephemeral
            });
        }
        if (tresc.length > 2000) {
            return InteractionHelper.safeEditReply(interaction, {
                content: "❌ Treść wiadomości nie może przekraczać 2000 znaków.",
                flags: MessageFlags.Ephemeral
            });
        }

        const cleanedText = sanitizeMarkdown(tresc);

        // 3️⃣ Embed z żółtym paskiem
        const embed = new EmbedBuilder()
            .setDescription(cleanedText)
            .setColor('#FFCC00');

        // 4️⃣ Przycisk z linkiem (stały)
        const button = new ButtonBuilder()
            .setLabel('PRZEJDŹ NA SERWER 🚀')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.com/channels/1464968036791357648/1464980867771269271');

        const row = new ActionRowBuilder().addComponents(button);

        // 5️⃣ Wysłanie DM
        try {
            await targetUser.send({ embeds: [embed], components: [row] });

            // Logowanie (opcjonalne)
            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Wiadomość prywatna (embed+przycisk)",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Treść: ${cleanedText.substring(0, 100)}...`
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ Wiadomość została wysłana do **${targetUser.tag}**.`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Błąd podczas wysyłania DM:', error);
            if (error.code === 50007) {
                return InteractionHelper.safeEditReply(interaction, {
                    content: `❌ Nie udało się wysłać wiadomości do **${targetUser.tag}** – użytkownik ma wyłączone prywatne wiadomości.`,
                    flags: MessageFlags.Ephemeral
                });
            }
            return InteractionHelper.safeEditReply(interaction, {
                content: `❌ Wystąpił błąd: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
