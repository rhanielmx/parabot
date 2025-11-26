// prepare-deploy.js - Prepara o projeto para deploy
// Converte os arquivos JSON em variáveis de ambiente
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const ENV_PATH = path.join(__dirname, '.env');
const ENV_EXAMPLE_PATH = path.join(__dirname, '.env.deploy');

console.log('🚀 Preparando projeto para deploy...\n');

// Verifica se os arquivos existem
const checks = [
  { path: CREDENTIALS_PATH, name: 'credentials.json', required: true },
  { path: TOKEN_PATH, name: 'token.json', required: true },
  { path: ENV_PATH, name: '.env', required: true }
];

let allOk = true;
checks.forEach(check => {
  if (fs.existsSync(check.path)) {
    console.log(`✅ ${check.name} encontrado`);
  } else {
    console.log(`❌ ${check.name} NÃO encontrado`);
    if (check.required) {
      allOk = false;
      if (check.name === 'token.json') {
        console.log(`   → Execute: node authenticate.js`);
      }
    }
  }
});

if (!allOk) {
  console.log('\n❌ Arquivos necessários não encontrados. Execute os passos necessários primeiro.\n');
  process.exit(1);
}

console.log('\n📝 Gerando arquivo .env.deploy...\n');

try {
  // Lê os arquivos
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');

  // Extrai variáveis do .env
  const envVars = {};
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  // Cria conteúdo do novo .env
  let deployEnv = `# ==========================================
# Variáveis de Ambiente para Deploy
# ==========================================
# Copie estas variáveis para o painel do seu serviço de deploy
# (Railway, Render, Google Cloud, etc.)
#
# IMPORTANTE: Use estas em vez de fazer upload dos arquivos JSON
# ==========================================

`;

  // Adiciona variáveis existentes
  if (envVars.DISCORD_TOKEN) {
    deployEnv += `DISCORD_TOKEN=${envVars.DISCORD_TOKEN}\n`;
  }
  if (envVars.CLIENT_ID) {
    deployEnv += `CLIENT_ID=${envVars.CLIENT_ID}\n`;
  }
  if (envVars.DRIVE_FILE_ID) {
    deployEnv += `DRIVE_FILE_ID=${envVars.DRIVE_FILE_ID}\n`;
  }
  if (envVars.DRIVE_FOLDER_PATH) {
    deployEnv += `DRIVE_FOLDER_PATH=${envVars.DRIVE_FOLDER_PATH}\n`;
  }

  // Adiciona JSONs como strings
  deployEnv += `\n# Credentials do Google (JSON convertido)\n`;
  deployEnv += `CREDENTIALS_JSON=${JSON.stringify(credentials)}\n`;
  
  deployEnv += `\n# Token de autenticação do Google (JSON convertido)\n`;
  deployEnv += `TOKEN_JSON=${JSON.stringify(token)}\n`;

  // Salva o arquivo
  fs.writeFileSync(ENV_EXAMPLE_PATH, deployEnv);

  console.log('✅ Arquivo .env.deploy criado com sucesso!\n');
  console.log('📋 Próximos passos:\n');
  console.log('1. Abra o arquivo .env.deploy');
  console.log('2. Copie TODO o conteúdo');
  console.log('3. No painel do seu serviço de deploy (Railway, Render, etc.):');
  console.log('   - Cole cada variável no formato CHAVE=VALOR');
  console.log('   - Ou use o arquivo completo se o serviço aceitar\n');
  console.log('⚠️  IMPORTANTE: Nunca commite .env.deploy no Git!\n');

  // Atualiza .gitignore
  const gitignorePath = path.join(__dirname, '.gitignore');
  let gitignoreContent = '';
  
  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  }

  const itemsToIgnore = [
    '.env',
    '.env.deploy',
    'credentials.json',
    'token.json',
    '*.sqlite'
  ];

  let updated = false;
  itemsToIgnore.forEach(item => {
    if (!gitignoreContent.includes(item)) {
      gitignoreContent += `\n${item}`;
      updated = true;
    }
  });

  if (updated) {
    fs.writeFileSync(gitignorePath, gitignoreContent);
    console.log('✅ .gitignore atualizado\n');
  }

  // Gera instruções específicas por plataforma
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 INSTRUÇÕES POR PLATAFORMA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🚂 RAILWAY:');
  console.log('1. Vá em Variables');
  console.log('2. Clique em "Raw Editor"');
  console.log('3. Cole o conteúdo de .env.deploy\n');

  console.log('🎨 RENDER:');
  console.log('1. Vá em Environment');
  console.log('2. Clique em "Add from .env"');
  console.log('3. Cole o conteúdo de .env.deploy\n');

  console.log('☁️  GOOGLE CLOUD RUN:');
  console.log('1. Use secrets do Secret Manager');
  console.log('2. Ou adicione via --set-env-vars no deploy\n');

  console.log('💻 VPS (SSH):');
  console.log('1. Copie .env.deploy para o servidor:');
  console.log('   scp .env.deploy user@server:/path/to/bot/.env');
  console.log('2. No servidor, renomeie:');
  console.log('   mv .env.deploy .env\n');

} catch (error) {
  console.error('❌ Erro ao processar arquivos:', error.message);
  process.exit(1);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✨ Preparação concluída!\n');