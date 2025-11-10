// Test de la nouvelle logique avec date-fns-tz
import { zonedTimeToUtc, getTimezoneOffset } from 'date-fns-tz'

console.log('=== Test conversion timezone avec date-fns-tz ===\n')

// Cas de test : 29 mars 2026 à 09:00 en France (jour du changement d'heure)
const testCases = [
  { date: '2026-03-29', time: '09:00', tz: 'Europe/Paris', description: '29 mars 2026 09:00 (jour DST)' },
  { date: '2026-03-28', time: '09:00', tz: 'Europe/Paris', description: '28 mars 2026 09:00 (avant DST)' },
  { date: '2026-11-24', time: '09:00', tz: 'Europe/Paris', description: '24 nov 2026 09:00 (hiver)' },
  { date: '2026-07-15', time: '09:00', tz: 'Europe/Paris', description: '15 juillet 2026 09:00 (été)' },
  { date: '2026-03-29', time: '09:00', tz: 'America/Guadeloupe', description: '29 mars 2026 09:00 Guadeloupe' },
]

testCases.forEach(({ date, time, tz, description }) => {
  const localDateStr = `${date}T${time}:00`
  const utcDate = zonedTimeToUtc(localDateStr, tz)
  const offsetMs = getTimezoneOffset(tz, new Date(localDateStr))
  const offsetHours = offsetMs / (1000 * 60 * 60)
  
  console.log(`${description}`)
  console.log(`  Input: ${localDateStr} ${tz}`)
  console.log(`  Offset: UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}`)
  console.log(`  UTC stocké: ${utcDate.toISOString()}`)
  console.log(`  Affichage (Europe/Paris): ${utcDate.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`)
  console.log(`  Heure seule: ${utcDate.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`)
  console.log()
})

console.log('=== Vérification comportement DST ===\n')

// Détails du changement d'heure 2026
const beforeDST = zonedTimeToUtc('2026-03-29T01:59:59', 'Europe/Paris')
const afterDST = zonedTimeToUtc('2026-03-29T03:00:01', 'Europe/Paris')

console.log('Juste avant DST (01:59:59): ', beforeDST.toISOString(), 'UTC')
console.log('Juste après DST (03:00:01): ', afterDST.toISOString(), 'UTC')
console.log('Différence:', (afterDST - beforeDST) / 1000, 'secondes (devrait être ~3 secondes, pas 3602)')
