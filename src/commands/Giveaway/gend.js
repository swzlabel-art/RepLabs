import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription("🎁 Zakańcza aktywny giveaway od razu i wybiera zwycięzcę(ów).")
        .addStringOption((option) =>
            option
                .setName("id_wiadomosci")
                .setDescription("ID wiadomości giveaway do zakończenia.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Giveaway command used outside guild',
                    ErrorTypes.VALIDATION,
                    'Ta komenda może być używana tylko na serwerze.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**, aby zakończyć giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const messageId = interaction.options.getString("id_wiadomosci");

            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new TitanBotError(
                    'Invalid message ID format',
                    ErrorTypes.VALIDATION,
                    'Podaj prawidłowe ID wiadomości.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new TitanBotError(
                    `Giveaway not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Nie znaleziono giveaway o podanym ID w bazie danych.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(err => {
                logger.warn(`Could not fetch channel ${giveaway.channelId}:`, err.message);
                return null;
            });

            if (!channel || !channel.isTextBased()) {
                throw new TitanBotError(
                    `Channel not found: ${giveaway.channelId}`,
                    ErrorTypes.VALIDATION,
                    "Nie można znaleźć kanału, na którym był giveaway. Stan giveaway został zaktualizowany.",
                    { channelId: giveaway.channelId, messageId }
                );
            }

            const message = await channel.messages.fetch(messageId).catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

            if (!message) {
                throw new TitanBotError(
                    `Message not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Nie można znaleźć wiadomości giveaway. Stan giveaway został zaktualizowany.",
                    { messageId, channelId: giveaway.channelId }
                );
            }

            let endResult;
            let winners = [];
            let participantCount = 0;

            // Sprawdzenie, czy giveaway ma z góry ustalonych zwycięzców
            if (giveaway.presetWinners && giveaway.presetWinners.length > 0) {
                // Użyj preset zwycięzców (bez losowania)
                winners = giveaway.presetWinners.slice(0, giveaway.winnerCount);
                participantCount = giveaway.participants?.length || 0;

                giveaway.isEnded = true;
                giveaway.ended = true;
                giveaway.endTime = Date.now();
                await saveGiveaway(interaction.client, interaction.guildId, giveaway);

                logger.info(`Giveaway ended with preset winners (${winners.length}) for message ${messageId}`);

                endResult = {
                    giveaway: giveaway,
                    winners: winners,
                    participantCount: participantCount
                };
            } else {
                endResult = await endGiveawayService(
                    interaction.client,
                    giveaway,
                    interaction.guildId,
                    interaction.user.id
                );
                winners = endResult.winners;
                participantCount = endResult.participantCount;
            }

            const updatedGiveaway = endResult.giveaway;

            // Aktualizacja wiadomości giveaway (embed i przyciski) – BEZ dodatkowego pola o preset winners
            const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
            const newRow = createGiveawayButtons(true);

            // 🚫 USUNIĘTO publiczne pole "Z góry ustaleni zwycięzcy"
            await message.edit({
                content: "🎉 **GIVEAWAY ZAKOŃCZONY** 🎉",
                embeds: [newEmbed],
                components: [newRow],
            });

            // Ogłoszenie zwycięzców – BEZ informacji o ustawieniu z góry
            if (winners.length > 0) {
                const winnerMentions = winners.map(id => `<@${id}>`).join(", ");
                let winnerMessage = `🎉 **GRATULACJE** ${winnerMentions}! Wygrałeś/aś giveaway **${updatedGiveaway.prize}**! 🎉\n`;
                winnerMessage += `Skontaktuj się z organizatorem <@${updatedGiveaway.hostId}>, aby odebrać nagrodę.`;

                // 🚫 USUNIĘTO dopisek o z góry ustalonych zwycięzcach

                const winnerPingMsg = await channel.send({ content: winnerMessage });
                updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;
                await saveGiveaway(interaction.client, interaction.guildId, updatedGiveaway);

                logger.info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);

                try {
                    await logEvent({
                        client: interaction.client,
                        guildId: interaction.guildId,
                        eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                        data: {
                            description: `Giveaway zakończony z ${winners.length} zwycięzcą(ami)`,
                            channelId: channel.id,
                            userId: interaction.user.id,
                            fields: [
                                { name: '🎁 Nagroda', value: updatedGiveaway.prize || 'Tajemnicza nagroda!', inline: true },
                                { name: '🏆 Zwycięzcy', value: winnerMentions, inline: false },
                                { name: '👥 Liczba uczestników', value: participantCount.toString(), inline: true },
                                ...(giveaway.presetWinners ? [{ name: '👑 Typ (log)', value: 'Z góry ustaleni', inline: true }] : [])
                            ]
                        }
                    });
                } catch (logError) {
                    logger.debug('Error logging giveaway winner event:', logError);
                }
            } else {
                await channel.send({
                    content: `Giveaway dla nagrody **${updatedGiveaway.prize}** zakończył się bez ważnych uczestników. 😢`,
                });
                logger.info(`Giveaway ended with no winners: ${messageId}`);
            }

            logger.info(`Giveaway successfully ended by ${interaction.user.tag}: ${messageId}`);

            // Odpowiedź dla osoby kończącej (ephemeral) – tutaj możesz zostawić informację o preset, bo tylko host widzi
            let replyText = `✅ Pomyślnie zakończono giveaway **${updatedGiveaway.prize}** na ${channel}. `;
            replyText += `Wybrano ${winners.length} zwycięzcę(ów) z ${participantCount} uczestników.`;
            if (giveaway.presetWinners && giveaway.presetWinners.length > 0) {
                replyText += `\n👑 Zwycięzcy byli ustawieni z góry (widoczne tylko dla Ciebie).`;
            }
            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed("🎉 Giveaway zakończony!", replyText)],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gend',
                context: 'giveaway_end'
            });
        }
    },
};
