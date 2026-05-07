// deploy-commands.js
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import 'dotenv/config'; // Ważne: ładuje zmienne z pliku .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pobieramy niezbędne dane z zmiennych środowiskowych
const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // opcjonalne

if (!token || !clientId) {
    console.error('❌ Brakuje wymaganych zmiennych środowiskowych: DISCORD_TOKEN/TOKEN lub CLIENT_ID.');
    process.exit(1);
}

const commands = [];
const foldersPath = path.join(__dirname, 'src', 'commands');
const commandFolders = readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(pathToFileURL(filePath).href);
        if ('data' in command && 'execute' in command) {
            commands.push(command.default.data.toJSON());
            console.log(`✅ Załadowano komendę: ${command.default.data.name}`);
        } else {
            console.log(`⚠️ Plik ${filePath} nie zawiera wymaganych pól "data" lub "execute".`);
        }
    }
}

const rest = new REST().setToken(token);

try {
    console.log(`Rozpoczynam odświeżanie ${commands.length} komend aplikacji (/)...`);

    let result;
    if (guildId) {
        // Rejestracja tylko dla konkretnego serwera
        result = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log(`✅ Pomyślnie zarejestrowano komendy dla serwera o ID ${guildId}.`);
    } else {
        // Rejestracja globalna (może potrwać do godziny)
        result = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );
        console.log('✅ Pomyślnie zarejestrowano komendy globalnie.');
    }
} catch (error) {
    console.error('❌ Wystąpił błąd podczas rejestracji komend:', error);
}
