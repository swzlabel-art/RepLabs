import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// ID roli dającej 2x szansę
const PREMIUM_ROLE_ID = '1465729118732554292';
const ALLOWED_CHANNEL_ID = '1503389299008082010'; // Tylko ten kanał

export default {
    data: new SlashCommandBuilder()
        .setName("drop")
        .setDescription("🎲 Spróbuj szczęścia! Możesz wygrać przedmiot (na razie tylko porażka).")
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    async execute(interaction) {
        try {
            // 1. Sprawdzenie, czy komenda jest używana na serwerze
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Command used outside guild',
                    ErrorTypes.VALIDATION,
                    'Ta komenda może być używana tylko na serwerze.',
                    { userId: interaction.user.id }
                );
            }

            // 2. Sprawdzenie, czy kanał jest dozwolony
            if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('❌ Zły kanał', `Komenda /drop działa tylko na kanale <#${ALLOWED_CHANNEL_ID}>.`)],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const userId = interaction.user.id;
            const guild = interaction.guild;
            const member = interaction.member;

            // 3. Sprawdzenie, czy użytkownik ma rolę premium (po ID)
            const hasPremiumRole = member.roles.cache.has(PREMIUM_ROLE_ID);
            
            // 4. Sprawdzenie limitu czasowego (indywidualny co godzinę)
            const now = Date.now();
            const oneHour = 3600 * 1000;
            
            let lastUsed = null;
            try {
                const result = await interaction.client.db.query(
                    `SELECT last_drop_time FROM user_drops WHERE user_id = $1 AND guild_id = $2`,
                    [userId, interaction.guildId]
                );
                if (result.rows.length > 0) {
                    lastUsed = new Date(result.rows[0].last_drop_time).getTime();
                }
            } catch (dbError) {
                logger.error('Błąd odczytu limitu dropu:', dbError);
                // Jeśli tabela nie istnieje, utwórz ją
                await interaction.client.db.query(`
                    CREATE TABLE IF NOT EXISTS user_drops (
                        user_id TEXT,
                        guild_id TEXT,
                        last_drop_time TIMESTAMP,
                        PRIMARY KEY (user_id, guild_id)
                    )
                `);
                lastUsed = null;
            }

            if (lastUsed && (now - lastUsed) < oneHour) {
                const remaining = Math.ceil((oneHour - (now - lastUsed)) / 60000);
                const cooldownEmbed = errorEmbed('⏳ Za wcześnie!', 
                    `${interaction.user}, możesz użyć /drop ponownie za **${remaining} minut**.`
                );
                if (hasPremiumRole) {
                    cooldownEmbed.setColor(0xFFD700).setTitle('✨ Losowanie premium ✨').setDescription(cooldownEmbed.data.description);
                }
                return InteractionHelper.safeReply(interaction, {
                    embeds: [cooldownEmbed],
                    flags: MessageFlags.Ephemeral,
                });
            }

            // 5. Logika losowania (na razie zawsze przegrana)
            const isWin = false;
            
            // 6. Przygotowanie embeda (wyróżniający się)
            let embed;
            if (hasPremiumRole) {
                embed = successEmbed('✨⭐ DROP PREMIUM ⭐✨', '')
                    .setColor(0xFFD700)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setDescription(`**${interaction.user}** niestety nie udało Ci się nic zdobyć.\nSpróbuj ponownie za **1 godzinę**.\n\n🌟 *Dzięki specjalnej randze Twoje szanse są 2x większe!* 🌟`)
                    .setFooter({ text: 'Losowanie premium • wracaj za godzinę', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();
            } else {
                embed = errorEmbed('🎲 LOSOWANIE 🎲', '')
                    .setColor(0x2C2F33)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setDescription(`**${interaction.user}** niestety nie udało Ci się nic zdobyć.\nSpróbuj ponownie za **1 godzinę**.\n\n💎 *Zdobądź specjalną rangę, aby zwiększyć szanse!* 💎`)
                    .setFooter({ text: 'Zwykły drop • wracaj za godzinę', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();
            }

            // 7. Aktualizacja czasu ostatniego użycia w bazie
            try {
                await interaction.client.db.query(
                    `INSERT INTO user_drops (user_id, guild_id, last_drop_time)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id, guild_id) DO UPDATE SET last_drop_time = EXCLUDED.last_drop_time`,
                    [userId, interaction.guildId, new Date()]
                );
            } catch (dbError) {
                logger.error('Błąd zapisu limitu dropu:', dbError);
            }

            // 8. Wysłanie odpowiedzi (publiczna)
            await interaction.reply({ embeds: [embed] });
            
            logger.info(`/drop użyte przez ${interaction.user.tag} (${userId}) | Premium: ${hasPremiumRole} | guild: ${interaction.guildId}`);

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'drop',
                context: 'drop_losowanie'
            });
        }
    },
};
