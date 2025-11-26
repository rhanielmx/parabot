// findfile.js - Procura arquivos no seu Google Drive
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function listFiles() {
  // Autentica
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (!fs.existsSync(TOKEN_PATH)) {
    console.error('❌ Token não encontrado. Execute authenticate.js primeiro.');
    process.exit(1);
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

  console.log('🔍 Procurando arquivos .sqlite no seu Google Drive...\n');

  try {
    // Procura todos os arquivos .sqlite
    const response = await drive.files.list({
      q: "name contains '.sqlite' and trashed=false",
      fields: 'files(id, name, parents, modifiedTime, webViewLink)',
      spaces: 'drive',
      orderBy: 'modifiedTime desc'
    });

    if (response.data.files.length === 0) {
      console.log('❌ Nenhum arquivo .sqlite encontrado no Drive.');
      console.log('\n💡 Dicas:');
      console.log('   - Verifique se o arquivo existe no Drive');
      console.log('   - O arquivo pode ter outra extensão');
      console.log('   - Use a busca manual abaixo\n');
    } else {
      console.log(`✅ Encontrados ${response.data.files.length} arquivo(s):\n`);
      
      for (const file of response.data.files) {
        console.log(`📄 ${file.name}`);
        console.log(`   ID: ${file.id}`);
        
        // Busca o caminho completo
        const folderPath = await getFullPath(drive, file.parents ? file.parents[0] : null);
        console.log(`   📁 Pasta: ${folderPath}`);
        console.log(`   🔗 Link: ${file.webViewLink}`);
        console.log(`   📅 Modificado: ${new Date(file.modifiedTime).toLocaleString('pt-BR')}`);
        console.log('');
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('💡 Para usar um arquivo, adicione ao .env:');
      console.log(`   DRIVE_FILE_ID=${response.data.files[0].id}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Busca manual
    console.log('🔎 Busca manual de arquivos:');
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('\nDigite o nome do arquivo para buscar (ou Enter para sair): ', async (searchTerm) => {
      if (searchTerm.trim()) {
        await searchByName(drive, searchTerm.trim());
      }
      rl.close();
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Busca caminho completo da pasta
async function getFullPath(drive, folderId) {
  if (!folderId) return 'Raiz do Drive';
  
  const folders = [];
  let currentId = folderId;

  try {
    while (currentId) {
      const folder = await drive.files.get({
        fileId: currentId,
        fields: 'id, name, parents'
      });

      folders.unshift(folder.data.name);

      if (folder.data.parents && folder.data.parents.length > 0) {
        currentId = folder.data.parents[0];
      } else {
        break;
      }
    }

    return folders.length > 0 ? folders.join(' / ') : 'Raiz do Drive';
  } catch (error) {
    return 'Caminho não disponível';
  }
}

// Busca por nome
async function searchByName(drive, searchTerm) {
  console.log(`\n🔍 Buscando: "${searchTerm}"...\n`);

  try {
    const response = await drive.files.list({
      q: `name contains '${searchTerm}' and trashed=false`,
      fields: 'files(id, name, parents, mimeType, webViewLink)',
      spaces: 'drive'
    });

    if (response.data.files.length === 0) {
      console.log('❌ Nenhum arquivo encontrado.');
    } else {
      console.log(`✅ Encontrados ${response.data.files.length} arquivo(s):\n`);
      
      for (const file of response.data.files) {
        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
        console.log(`${isFolder ? '📁' : '📄'} ${file.name}`);
        console.log(`   ID: ${file.id}`);
        
        const folderPath = await getFullPath(drive, file.parents ? file.parents[0] : null);
        console.log(`   📂 Local: ${folderPath}`);
        console.log(`   🔗 Link: ${file.webViewLink}`);
        console.log('');
      }
    }
  } catch (error) {
    console.error('❌ Erro na busca:', error.message);
  }
}

listFiles();