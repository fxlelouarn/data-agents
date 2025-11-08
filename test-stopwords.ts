import { removeStopwords, extractKeywords, getPrimaryKeyword, calculateNameQuality, EVENT_NAME_STOPWORDS } from './apps/agents/src/ffa/stopwords'

console.log('🧪 Test des stopwords\n')
console.log('='.repeat(80))

// Cas 1: Gargantuesque
console.log('\n📝 Cas 1: Trail Decouverte Le Gargantuesque')
const gargantuesque = "trail decouverte le gargantuesque"
console.log('  Original:', gargantuesque)
console.log('  Sans stopwords:', removeStopwords(gargantuesque))
console.log('  Keywords:', extractKeywords(gargantuesque))
console.log('  Primary keyword:', getPrimaryKeyword(gargantuesque))
console.log('  Name quality:', calculateNameQuality(gargantuesque).toFixed(2))

// Cas 2: Diab'olo Run
console.log('\n📝 Cas 2: Diab\'olo Run')
const diabolo = "diab olo run"
console.log('  Original:', diabolo)
console.log('  Sans stopwords:', removeStopwords(diabolo))
console.log('  Keywords:', extractKeywords(diabolo))
console.log('  Primary keyword:', getPrimaryKeyword(diabolo))
console.log('  Name quality:', calculateNameQuality(diabolo).toFixed(2))

// Cas 3: Ekiden Nevers Marathon
console.log('\n📝 Cas 3: Ekiden Nevers Marathon')
const ekiden = "ekiden nevers marathon"
console.log('  Original:', ekiden)
console.log('  Sans stopwords:', removeStopwords(ekiden))
console.log('  Keywords:', extractKeywords(ekiden))
console.log('  Primary keyword:', getPrimaryKeyword(ekiden))
console.log('  Name quality:', calculateNameQuality(ekiden).toFixed(2))

// Cas 4: Nom très générique
console.log('\n📝 Cas 4: Course de la ville (générique)')
const generic = "course de la ville"
console.log('  Original:', generic)
console.log('  Sans stopwords:', removeStopwords(generic))
console.log('  Keywords:', extractKeywords(generic))
console.log('  Primary keyword:', getPrimaryKeyword(generic))
console.log('  Name quality:', calculateNameQuality(generic).toFixed(2))

// Stats sur les stopwords
console.log('\n📊 Statistiques:')
console.log('  Nombre de stopwords:', EVENT_NAME_STOPWORDS.size)
console.log('  Stopwords:', Array.from(EVENT_NAME_STOPWORDS).slice(0, 10).join(', '), '...')
