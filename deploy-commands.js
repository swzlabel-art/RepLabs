// deploy-commands.js
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import 'dotenv/config'; // Ważne: ładuje zmienne z pliku .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[deploy-commands] Starting command deployment...');
console.log('[deploy-commands] Node.js version:', process.version);
console.log('[deploy-commands] Environment:', process.env.NODE_ENV || 'development');

// Pobieramy niezbędne dane z zmiennych środowiskowych
const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // opcjonalne

console.log('[deploy-commands] DISCORD_TOKEN present:', !!process.env.DISCORD_TOKEN);
console.log('[deploy-commands] TOKEN present:', !!process.env.TOKEN);
console.log('[deploy-commands] CLIENT_ID present:', !!clientId);
console.log('[deploy-commands] GUILD_ID present:', !!guildId);

if (!token) {
    console.error('[deploy-commands] ❌ Missing required env var: DISCORD_TOKEN (or TOKEN). Cannot register commands.');
    process.exit(1);
}

if (!clientId) {
    console.error('[deploy-commands] ❌ Missing required env var: CLIENT_ID. Cannot register commands.');
    process.exit(1);
}

const commands = [];
const foldersPath = path.join(__dirname, 'src', 'commands');

let commandFolders;
try {
    commandFolders = readdirSync(foldersPath);
    console.log(`[deploy-commands] Found ${commandFolders.length} command folder(s) in ${foldersPath}`);
} catch (error) {
    console.error(`[deploy-commands] ❌ Failed to read commands directory at ${foldersPath}:`, error.message);
    process.exit(1);
}

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);

    let commandFiles;
    try {
        const entries = readdirSync(commandsPath, { withFileTypes: true });
        // Skip sub-directories (e.g. modules/) — only load .js files directly in the folder
        commandFiles = entries
            .filter(e => e.isFile() && e.name.endsWith('.js'))
            .map(e => e.name);
    } catch (error) {
        console.warn(`[deploy-commands] ⚠️  Could not read folder ${commandsPath}:`, error.message);
        continue;
    }

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = await import(pathToFileURL(filePath).href);
            const exported = command.default ?? command;
            if (exported && 'data' in exported && 'execute' in exported) {
                commands.push(exported.data.toJSON());
                console.log(`[deploy-commands] ✅ Loaded command: ${exported.data.name}`);
            } else {
                console.warn(`[deploy-commands] ⚠️  ${filePath} is missing required "data" or "execute" export — skipping.`);
            }
        } catch (error) {
            console.error(`[deploy-commands] ❌ Failed to load command file ${filePath}:`, error.message);
            // Continue loading other commands rather than aborting entirely
        }
    }
}

console.log(`[deploy-commands] Total commands to register: ${commands.length}`);

if (commands.length === 0) {
    console.warn('[deploy-commands] ⚠️  No commands were loaded. Skipping registration.');
    process.exit(0);
}

const rest = new REST().setToken(token);

try {
    console.log(`[deploy-commands] Registering ${commands.length} application command(s)...`);

    if (guildId) {
        // Guild-scoped registration (instant, good for testing)
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log(`[deploy-commands] ✅ Successfully registered ${commands.length} command(s) for guild ${guildId}.`);
    } else {
        // Global registration (can take up to 1 hour to propagate)
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );
        console.log(`[deploy-commands] ✅ Successfully registered ${commands.length} command(s) globally.`);
    }
} catch (error) {
    console.error('[deploy-commands] ❌ Failed to register commands with Discord API:');
    console.error('[deploy-commands]   Error name   :', error.name);
    console.error('[deploy-commands]   Error message:', error.message);
    if (error.status) {
        console.error('[deploy-commands]   HTTP status  :', error.status);
    }
    if (error.code) {
        console.error('[deploy-commands]   Discord code :', error.code);
    }
    if (error.rawError) {
        console.error('[deploy-commands]   API response :', JSON.stringify(error.rawError, null, 2));
    }
    // Exit with failure so the start script stops here instead of launching the bot
    // with potentially invalid credentials.
    process.exit(1);
}
