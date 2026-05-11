import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ChannelType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logEvent } from '../../utils/moderation.js';
import { sanitizeMarkdown } from '../../utils/sanitization.js';

// Twój identyfikator (prawy klik -> Kopiuj ID)
const OWNER_ID = "1110216754812178524";   // ZMIEŃ NA SWÓJ NUMER ID

export default {
    data: new SlashCommandBuilder()
        .setName("wiad")
        .setDescription("Wysyła embed z żółtym paskiem na wskazany kanał (tylko właściciel)")
        .addChannelOption(option =>
            option.setName("kanal")
                .setDescription("Kanał, na którym ma pojawić się wiadomość")
                .addChannelTypes(ChannelType.GuildText)
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
        // 1. Tylko właściciel
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: "❌ Tylko właściciel bota może używać tej komendy.",
                flags: MessageFlags.Ephemeral
            });
        }

        // 2. Defer (zabezpieczenie przed timeout)
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        const targetChannel = interaction.options.getChannel("kanal");
        let tresc = interaction.options.getString("tresc");

        // Walidacje
        if (!targetChannel.isTextBased()) {
            return InteractionHelper.safeEditReply(interaction, {
                content: "❌ Wybrany kanał nie jest kanałem tekstowym.",
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

        // 3. Embed – żółty pasek (BEZ PRZYCISKU)
        const embed = new EmbedBuilder()
            .setDescription(cleanedText)
            .setColor('#FFCC00');

        // 4. Wysłanie na kanał (bez komponentów)
        try {
            await targetChannel.send({ embeds: [embed] });

            // Opcjonalne logowanie (jeśli masz funkcję logEvent)
            if (typeof logEvent === 'function') {
                await logEvent({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: "Wiadomość na kanał (embed bez przycisku)",
                        target: `${targetChannel.name} (${targetChannel.id})`,
                        executor: `${interaction.user.tag} (${interaction.user.id})`,
                        reason: `Treść: ${cleanedText.substring(0, 100)}...`
                    }
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ Wiadomość została wysłana na kanał **${targetChannel}**.`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Błąd podczas wysyłania wiadomości na kanał:', error);
            await InteractionHelper.safeEditReply(interaction, {
                content: `❌ Wystąpił błąd: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
