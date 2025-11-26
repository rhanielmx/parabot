require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const cron = require('node-cron');
const { google } = require('googleapis');

// ============ CONFIGURAÇÃO GOOGLE DRIVE ============
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json'); // arquivo de credenciais do Google
const TOKEN_PATH = path.join(__dirname, 'token.json'); // token de autenticação
const DB_FILENAME = 'parabot.sqlite'; // nome do arquivo no Drive
const LOCAL_DB_PATH = path.join(__dirname, DB_FILENAME);

// CONFIGURAÇÃO: Cole aqui o ID do arquivo do Google Drive (RECOMENDADO)
// Para obter o ID: abra o arquivo no Drive, o ID está na URL após /d/
// Exemplo: https://drive.google.com/file/d/1ABC123xyz/view -> ID = 1ABC123xyz
const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID || null; // ou cole direto: '1ABC123xyz'

let drive;
let driveFileId = DRIVE_FILE_ID; // ID do arquivo no Google Drive

// Autentica com Google Drive
async function authenticateDrive() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Verifica se já existe token salvo
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
  } else {
    throw new Error('Token não encontrado. Execute o script de autenticação primeiro.');
  }

  drive = google.drive({ version: 'v3', auth: oAuth2Client });
  console.log('✅ Autenticado no Google Drive');
}

// Procura o arquivo no Drive (ou cria se não existir)
async function findOrCreateDriveFile() {
  try {
    // Se já temos o ID configurado, verifica se existe
    if (driveFileId) {
      try {
        const file = await drive.files.get({
          fileId: driveFileId,
          fields: 'id, name'
        });
        console.log(`📁 Arquivo encontrado no Drive (ID configurado): ${file.data.name} (${driveFileId})`);
        return driveFileId;
      } catch (error) {
        console.error(`❌ Arquivo com ID ${driveFileId} não encontrado ou sem permissão.`);
        throw new Error('Verifique o DRIVE_FILE_ID no .env ou no código');
      }
    }

    // Se não tem ID, procura pelo nome e pasta
    let query = `name='${DB_FILENAME}' and trashed=false`;
    
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, parents)',
      spaces: 'drive'
    });

    if (response.data.files.length > 0) {
      driveFileId = response.data.files[0].id;
      console.log(`📁 Arquivo encontrado: ${response.data.files[0].name} (${driveFileId})`);
      
      // Salva o ID encontrado no .env para próximas execuções
      console.log(`💡 Dica: Adicione ao .env -> DRIVE_FILE_ID=${driveFileId}`);
      return driveFileId;
    } else {
      console.log('📁 Arquivo não encontrado. Será criado no primeiro upload.');
      return null;
    }
  } catch (error) {
    console.error('❌ Erro ao procurar arquivo no Drive:', error.message);
    throw error;
  }
}

// Baixa o banco de dados do Drive
async function downloadFromDrive() {
  if (!driveFileId) {
    console.log('⚠️ Nenhum arquivo no Drive. Criando banco local novo.');
    return;
  }

  try {
    const dest = fs.createWriteStream(LOCAL_DB_PATH);
    const response = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    await new Promise((resolve, reject) => {
      response.data
        .on('end', () => {
          console.log('✅ Banco de dados baixado do Drive');
          resolve();
        })
        .on('error', reject)
        .pipe(dest);
    });
  } catch (error) {
    console.error('❌ Erro ao baixar do Drive:', error);
    throw error;
  }
}

// Faz upload do banco de dados para o Drive
async function uploadToDrive() {
  try {
    const media = {
      mimeType: 'application/x-sqlite3',
      body: fs.createReadStream(LOCAL_DB_PATH)
    };

    if (driveFileId) {
      // Atualiza arquivo existente
      await drive.files.update({
        fileId: driveFileId,
        media: media
      });
      console.log(`✅ Banco de dados atualizado no Drive (${driveFileId})`);
    } else {
      // Cria novo arquivo
      const fileMetadata = { name: DB_FILENAME };
      
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink'
      });
      driveFileId = response.data.id;
      console.log(`✅ Banco de dados criado no Drive: ${driveFileId}`);
      console.log(`🔗 Link: ${response.data.webViewLink}`);
      console.log(`💡 Adicione ao .env -> DRIVE_FILE_ID=${driveFileId}`);
    }
  } catch (error) {
    console.error('❌ Erro ao fazer upload para o Drive:', error.message);
  }
}

// ============ INICIALIZAÇÃO DO BOT ============
let db;

async function initializeBot() {
  try {
    // 1. Autentica no Google Drive
    await authenticateDrive();
    
    // 2. Procura ou cria o arquivo no Drive
    await findOrCreateDriveFile();
    
    // 3. Baixa o banco de dados (se existir)
    await downloadFromDrive();
    
    // 4. Abre conexão com banco local
    db = new Database(LOCAL_DB_PATH);
    
    // 5. Cria tabelas se necessário
    db.prepare(`CREATE TABLE IF NOT EXISTS guild_channels (guild_id TEXT PRIMARY KEY, channel_id TEXT)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS birthdays (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, user_id TEXT, day INTEGER, month INTEGER)`).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_birthdays_guild_user ON birthdays(guild_id, user_id)`).run();
    
    console.log('✅ Banco de dados inicializado');
    
    // 6. Faz login no Discord
    await client.login(process.env.DISCORD_TOKEN);
    
    // 7. Agenda sincronização automática a cada 30 minutos
    cron.schedule('*/30 * * * *', async () => {
      console.log('🔄 Sincronizando com Google Drive...');
      await uploadToDrive();
    });
    
    // 8. Upload inicial
    await uploadToDrive();
    
  } catch (error) {
    console.error('❌ Erro na inicialização:', error);
    process.exit(1);
  }
}

// ============ CONFIGURAÇÃO DO CLIENTE DISCORD ============
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const birthdayGifs = [
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  'https://media.giphy.com/media/1BXa2alBjrCXC/giphy.gif',
];

function padMonth(month) {
  return month < 10 ? `0${month}` : String(month);
}

client.once('clientReady', () => {
  console.log('🤖 Bot está online!');

  function checarAniversarios() {
    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const mesHoje = hoje.getMonth() + 1;

    const rows = db.prepare(`SELECT b.user_id, b.guild_id, gc.channel_id
      FROM birthdays b
      LEFT JOIN guild_channels gc ON gc.guild_id = b.guild_id
      WHERE b.day = ? AND b.month = ?`).all(diaHoje, mesHoje);

    rows.forEach(row => {
      const gif = birthdayGifs[Math.floor(Math.random() * birthdayGifs.length)];
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) return;
      const canalId = row.channel_id;
      if (!canalId) return;
      const canal = guild.channels.cache.get(canalId);
      if (canal) {
        canal.send(`🎉 Hoje é um dia especial: o aniversário de <@${row.user_id}>! Que seja repleto de alegrias, conquistas e momentos inesquecíveis. Parabéns! 🎂`)
          .then(() => canal.send(gif))
          .catch(console.error);
      }
    });
  }

  checarAniversarios();

  cron.schedule('0 9 * * *', () => {
    checarAniversarios();
  }, {
    timezone: 'America/Sao_Paulo'
  });
});

// ============ REGISTRO DE COMANDOS ============
const commands = [
  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Define o canal para mensagens do bot neste servidor')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal onde o bot enviará mensagens').setRequired(true)),

  new SlashCommandBuilder()
    .setName('addbirthday')
    .setDescription('Adiciona aniversário para um usuário neste servidor')
    .addUserOption(opt => opt.setName('user').setDescription('Usuário').setRequired(true))
    .addIntegerOption(opt => opt.setName('day').setDescription('Dia (1-31)').setRequired(true))
    .addIntegerOption(opt => opt.setName('month').setDescription('Mês (1-12)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('listbirthdays')
    .setDescription('Lista aniversários configurados neste servidor'),
    
  new SlashCommandBuilder()
    .setName('syncdb')
    .setDescription('Força sincronização manual com Google Drive (Admin)')
].map(c => c.toJSON());

async function registerCommands() {
  const clientId = process.env.CLIENT_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!clientId || !token) {
    console.warn('CLIENT_ID ou DISCORD_TOKEN não definidos.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('📝 Registrando comandos...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Comandos registrados.');
  } catch (err) {
    console.error('❌ Erro ao registrar comandos:', err);
  }
}

// ============ HANDLERS DE COMANDOS ============
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'setchannel') {
    const channel = interaction.options.getChannel('channel');
    const member = interaction.member;
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator) && 
        !member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'Você precisa de permissão de Administrador ou Gerenciar servidor.', ephemeral: true });
    }

    db.prepare('INSERT OR REPLACE INTO guild_channels (guild_id, channel_id) VALUES (?, ?)').run(interaction.guild.id, channel.id);
    await uploadToDrive(); // Sincroniza imediatamente
    return interaction.reply({ content: `Canal configurado para ${channel}`, ephemeral: false });
  }

  if (commandName === 'addbirthday') {
    const user = interaction.options.getUser('user');
    const day = interaction.options.getInteger('day');
    const month = interaction.options.getInteger('month');

    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return interaction.reply({ content: 'Dia ou mês inválido. Dia: 1-31, Mês: 1-12.', ephemeral: true });
    }

    const existing = db.prepare('SELECT id FROM birthdays WHERE guild_id = ? AND user_id = ?').get(interaction.guild.id, user.id);
    if (existing) {
      db.prepare('UPDATE birthdays SET day = ?, month = ? WHERE id = ?').run(day, month, existing.id);
      await uploadToDrive();
      return interaction.reply({ content: `Aniversário de <@${user.id}> atualizado para ${padMonth(day)}/${padMonth(month)}.`, ephemeral: false });
    } else {
      db.prepare('INSERT INTO birthdays (guild_id, user_id, day, month) VALUES (?, ?, ?, ?)').run(interaction.guild.id, user.id, day, month);
      await uploadToDrive();
      return interaction.reply({ content: `Aniversário de <@${user.id}> registrado para ${padMonth(day)}/${padMonth(month)}.`, ephemeral: false });
    }
  }

  if (commandName === 'listbirthdays') {
    const rows = db.prepare('SELECT user_id, day, month FROM birthdays WHERE guild_id = ? ORDER BY month ASC, day ASC').all(interaction.guild.id);
    if (!rows.length) return interaction.reply({ content: 'Nenhum aniversário configurado neste servidor.', ephemeral: true });

    const lines = rows.map(r => `<@${r.user_id}> — ${padMonth(r.day)}/${padMonth(r.month)}`);
    return interaction.reply({ content: lines.join('\n'), ephemeral: false });
  }

  if (commandName === 'syncdb') {
    const member = interaction.member;
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Apenas administradores podem usar este comando.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      await uploadToDrive();
      return interaction.editReply({ content: '✅ Banco de dados sincronizado com sucesso!' });
    } catch (error) {
      return interaction.editReply({ content: '❌ Erro ao sincronizar: ' + error.message });
    }
  }
});

// ============ INICIALIZAÇÃO ============
registerCommands();
initializeBot();

// Salva o banco antes de desligar
process.on('SIGINT', async () => {
  console.log('\n🔄 Salvando banco de dados...');
  await uploadToDrive();
  db.close();
  console.log('👋 Bot desligado');
  process.exit(0);
});