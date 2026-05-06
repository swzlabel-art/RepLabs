import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import { 
    parseDuration, 
    validatePrize, 
    validateWinnerCount,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("🎁 Rozpoczyna nowy giveaway na serwerze.")
        .addStringOption((option) =>
            option
                .setName("czas")
                .setDescription("Jak długo ma trwać giveaway (np. 1h, 30m, 5d).")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("wygrani")
                .setDescription("Liczba zwycięzców do wybrania.")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("nagroda")
                .setDescription("Nagroda, która jest rozdawana.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("kanal")
                .setDescription("Kanał, na którym ma być wysłany giveaway (domyślnie bieżący).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("zwyciezcy")
                .setDescription("❕ OPCJONALNIE: podaj ID lub wzmianki użytkowników (oddzielone przecinkami), którzy wygrają z góry.")
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            // Sprawdzenie czy na serwerze
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Giveaway command used outside guild',
                    ErrorTypes.VALIDATION,
                    'Ta komenda może być używana tylko na serwerze.',
                    { userId: interaction.user.id }
                );
            }

            // Sprawdzenie uprawnień
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**, aby rozpocząć giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

            // Pobranie opcji
            const durationString = interaction.options.getString("czas");
            const winnerCount = interaction.options.getInteger("wygrani");
            const prize = interaction.options.getString("nagroda");
            const targetChannel = interaction.options.getChannel("kanal") || interaction.channel;
            const presetWinnersRaw = interaction.options.getString("zwyciezcy");

            // Walidacja podstawowych danych
            const durationMs = parseDuration(durationString);
            validateWinnerCount(winnerCount);
            const prizeName = validatePrize(prize);

            if (!targetChannel.isTextBased()) {
                throw new TitanBotError(
                    'Target channel is not text-based',
                    ErrorTypes.VALIDATION,
                    'Kanał musi być kanałem tekstowym.',
                    { channelId: targetChannel.id, channelType: targetChannel.type }
                );
            }

            // Przetworzenie opcjonalnych zwycięzców z góry
            let presetWinners = [];
            if (presetWinnersRaw) {
                // Wyciągnięcie ID użytkowników (wzmianki <@123>, <@!123> lub gołe ID)
                const idRegex = /(\d{17,20})/g;
                const matches = presetWinnersRaw.match(idRegex);
                if (matches) {
                    presetWinners = [...new Set(matches)]; // unikalne ID
                    // Sprawdzenie, czy liczba podanych zwycięzców nie przekracza liczby winnerCount
                    if (presetWinners.length > winnerCount) {
                        throw new TitanBotError(
                            'Too many preset winners',
                            ErrorTypes.VALIDATION,
                            `Podano ${presetWinners.length} zwycięzców z góry, ale liczba zwycięzców giveaway to ${winnerCount}. Liczba preset zwycięzców nie może być większa.`,
                            { presetCount: presetWinners.length, winnerCount }
                        );
                    }
                } else {
                    throw new TitanBotError(
                        'Invalid preset winners format',
                        ErrorTypes.VALIDATION,
                        'Nieprawidłowy format zwycięzców. Podaj ID lub wzmianki oddzielone przecinkami (np. 123456789, @użytkownik).',
                        { raw: presetWinnersRaw }
                    );
                }
            }

            const endTime = Date.now() + durationMs;

            // Przygotowanie danych giveaway
            const initialGiveawayData = {
                messageId: "placeholder",
                channelId: targetChannel.id,
                guildId: interaction.guildId,
                prize: prizeName,
                hostId: interaction.user.id,
                endTime: endTime,
                endsAt: endTime,
                winnerCount: winnerCount,
                participants: [],
                isEnded: false,
                ended: false,
                createdAt: new Date().toISOString(),
                presetWinners: presetWinners.length > 0 ? presetWinners : undefined, // zapisujemy w bazie
            };

            // Tworzenie embeda (oryginalny z serwisu)
            let embed = createGiveawayEmbed(initialGiveawayData, "active");
            
            // Dodanie dodatkowych pól z emotkami i informacją o preset zwycięzcach
            if (presetWinners.length > 0) {
                const winnersMentions = presetWinners.map(id => `<@${id}>`).join(', ');
                embed.addFields({
                    name: '👑 **Z góry ustaleni zwycięzcy**',
                    value: winnersMentions.length > 1000 ? 'Zbyt wielu, by wyświetlić.' : winnersMentions,
                    inline: false
                });
            }
            
            // Dodanie pola z informacją o losowaniu (jeśli brak preset)
            if (presetWinners.length === 0) {
                embed.addFields({
                    name: '🎲 **Losowanie**',
                    value: 'Zwycięzcy zostaną wylosowani po zakończeniu.',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '⚠️ **Uwaga**',
                    value: 'Giveaway zakończy się bez losowania – zwycięzcy są już wybrani.',
                    inline: false
                });
            }

            // Przyciski
            const row = createGiveawayButtons(false);
            
            // Wysłanie wiadomości na kanał
            const giveawayMessage = await targetChannel.send({
                content: "🎉 **NOWY GIVEAWAY** 🎉",
                embeds: [embed],
                components: [row],
            });

            // Zapisanie w bazie
            initialGiveawayData.messageId = giveawayMessage.id;
            const saved = await saveGiveaway(
                interaction.client,
                interaction.guildId,
                initialGiveawayData,
            );

            if (!saved) {
                logger.warn(`Failed to save giveaway to database: ${giveawayMessage.id}`);
            }

            // Logowanie zdarzenia (po polsku)
            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                    data: {
                        description: `Giveaway utworzony: ${prizeName}`,
                        channelId: targetChannel.id,
                        userId: interaction.user.id,
                        fields: [
                            { name: '🎁 Nagroda', value: prizeName, inline: true },
                            { name: '🏆 Liczba zwycięzców', value: winnerCount.toString(), inline: true },
                            { name: '⏰ Czas trwania', value: durationString, inline: true },
                            { name: '📍 Kanał', value: targetChannel.toString(), inline: true },
                            ...(presetWinners.length > 0 ? [{ name: '👑 Z góry ustaleni', value: presetWinners.map(id => `<@${id}>`).join(', '), inline: false }] : [])
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway creation event:', logError);
            }

            logger.info(`Giveaway created successfully: ${giveawayMessage.id} in ${targetChannel.name}`);

            // Odpowiedź dla użytkownika (ephemeral)
            let replyText = `🎉 Giveaway **${prizeName}** został uruchomiony na ${targetChannel} i zakończy się za **${durationString}**.`;
            if (presetWinners.length > 0) {
                replyText += `\n👑 **Uwaga:** Zwycięzcy są już ustawieni z góry: ${presetWinners.map(id => `<@${id}>`).join(', ')}.`;
            }
            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed("✅ Giveaway rozpoczęty!", replyText)],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gcreate',
                context: 'giveaway_creation'
            });
        }
    },
};
