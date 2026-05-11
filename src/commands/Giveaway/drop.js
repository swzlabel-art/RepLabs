import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const PREMIUM_ROLE_ID = '1465729118732554292';
const ALLOWED_CHANNEL_ID = '1503389299008082010';

// Cooldown w pamięci (Map: userId -> timestamp)
const cooldowns = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName("drop")
        .setDescription("🎲 Spróbuj szczęścia! Możesz wygrać nagrody.")
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    async execute(interaction) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Command used outside guild',
                    ErrorTypes.VALIDATION,
                    'Ta komenda może być używana tylko na serwerze.',
                    { userId: interaction.user.id }
                );
            }

            if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('❌ Zły kanał', `Komenda /drop działa tylko na kanale <#${ALLOWED_CHANNEL_ID}>.`)],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const userId = interaction.user.id;
            const hasPremiumRole = interaction.member.roles.cache.has(PREMIUM_ROLE_ID);
            
            // Cooldown 1 godzina (3600000 ms)
            const now = Date.now();
            const lastUsed = cooldowns.get(userId);
            if (lastUsed && (now - lastUsed) < 3600000) {
                const remaining = Math.ceil((3600000 - (now - lastUsed)) / 60000);
                const cdEmbed = errorEmbed('⏳ Za wcześnie!', 
                    `${interaction.user}, możesz użyć /drop ponownie za **${remaining} minut**.`
                );
                if (hasPremiumRole) cdEmbed.setColor(0xFFD700).setTitle('✨ Losowanie premium ✨');
                return InteractionHelper.safeReply(interaction, {
                    embeds: [cdEmbed],
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Losowanie – na razie zawsze przegrana
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

            // Aktualizacja cooldownu
            cooldowns.set(userId, now);
            
            await interaction.reply({ embeds: [embed] });
            logger.info(`/drop użyte przez ${interaction.user.tag} | Premium: ${hasPremiumRole}`);
            
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'drop',
                context: 'drop_losowanie'
            });
        }
    },
};
