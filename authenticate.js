// authenticate.js - Execute este arquivo UMA VEZ para gerar o token
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');

// Use este escopo mais amplo para acessar todos os arquivos do Drive
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function authenticate() {
  // Lê as credenciais
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('❌ Arquivo credentials.json não encontrado!');
    console.log('\n📝 Siga estes passos:');
    console.log('1. Acesse: https://console.cloud.google.com/');
    console.log('2. Crie um projeto ou selecione um existente');
    console.log('3. Ative a API do Google Drive');
    console.log('4. Crie credenciais OAuth 2.0 (Aplicativo Desktop)');
    console.log('5. Baixe o arquivo JSON e renomeie para credentials.json');
    console.log('6. Coloque na mesma pasta deste script\n');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Gera URL de autenticação
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('🔐 Autorize este app visitando esta URL:');
  console.log('\n' + authUrl + '\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Cole o código de autorização aqui: ', async (code) => {
    rl.close();
    
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      // Salva o token
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      console.log('\n✅ Token salvo em token.json');
      console.log('✅ Autenticação concluída! Agora você pode executar o bot normalmente.\n');
    } catch (error) {
      console.error('❌ Erro ao obter token:', error);
    }
  });
}

authenticate();