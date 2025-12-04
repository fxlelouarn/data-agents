/**
 * Configuration globale Jest
 * Chargé avant chaque fichier de test
 */

const path = require('path');
const dotenv = require('dotenv');

// Charger .env.test en priorité
const envTestPath = path.resolve(__dirname, '.env.test');
console.log(`🧪 Loading test environment from: ${envTestPath}`);
dotenv.config({ path: envTestPath });

// Vérifier que les variables critiques sont définies
const requiredEnvVars = [
  'DATABASE_TEST_URL',
  'MILES_REPUBLIC_TEST_DATABASE_URL'
];

const missing = requiredEnvVars.filter(varName => !process.env[varName]);
if (missing.length > 0) {
  console.error('❌ Missing required environment variables for tests:');
  missing.forEach(varName => console.error(`  - ${varName}`));
  process.exit(1);
}

console.log('✅ Test environment loaded successfully');
console.log(`   DATABASE_TEST_URL: ${process.env.DATABASE_TEST_URL}`);
console.log(`   MILES_REPUBLIC_TEST_DATABASE_URL: ${process.env.MILES_REPUBLIC_TEST_DATABASE_URL}`);
