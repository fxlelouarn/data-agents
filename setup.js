#!/usr/bin/env node

/**
 * Data Agents Setup Script
 * Helps initialize the project with all required dependencies and configurations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Data Agents project...\n');

// Check if Node.js version is compatible
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 18) {
  console.error('❌ Node.js 18+ is required. Current version:', nodeVersion);
  process.exit(1);
}

console.log('✅ Node.js version check passed:', nodeVersion);

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Check if .env exists, if not copy from template
const envPath = path.join(__dirname, '.env');
const envTemplatePath = path.join(__dirname, '.env.template');

if (!fs.existsSync(envPath)) {
  console.log('\n⚙️  Creating .env file...');
  try {
    fs.copyFileSync(envTemplatePath, envPath);
    console.log('✅ .env file created from template');
    console.log('⚠️  Please edit .env file with your database configuration');
  } catch (error) {
    console.error('❌ Failed to create .env file:', error.message);
  }
} else {
  console.log('✅ .env file already exists');
}

// Generate Prisma client
console.log('\n🗄️  Setting up database...');
try {
  execSync('cd packages/database && npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma client generated');
} catch (error) {
  console.error('❌ Failed to generate Prisma client:', error.message);
  console.log('💡 Make sure your DATABASE_URL is set in .env and database is accessible');
}

// Build the project
console.log('\n🔨 Building project...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Project built successfully');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  console.log('💡 Check the error messages above and fix any issues');
}

// Check Docker availability
console.log('\n🐳 Checking Docker availability...');
try {
  execSync('docker --version', { stdio: 'pipe' });
  console.log('✅ Docker is available');
  console.log('💡 You can start local services with: docker-compose up -d');
} catch (error) {
  console.log('⚠️  Docker not found - local services will need to be set up manually');
}

// Final instructions
console.log('\n🎉 Setup complete!\n');
console.log('Next steps:');
console.log('1. 📝 Edit .env file with your database configuration');
console.log('2. 🗄️  Run database migrations: npm run db:migrate');
console.log('3. 🚀 Start the development server: npm run dev');
console.log('4. 🌐 API will be available at: http://localhost:3001');
console.log('5. 💾 Check database with Prisma Studio: npm run db:studio\n');

console.log('📚 Documentation:');
console.log('- README.md for comprehensive setup guide');
console.log('- API endpoints: http://localhost:3001/api/health');
console.log('- Database schema: packages/database/prisma/schema.prisma\n');

console.log('🆘 Need help? Check the README.md or open an issue on GitHub');