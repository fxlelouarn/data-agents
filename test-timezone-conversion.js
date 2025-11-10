// Test de conversion timezone pour comprendre le problème

// Simulation de la logique actuelle du code
function getTimezoneOffset(ligue, month) {
  const isDST = month > 2 && month < 10 // Approximation DST (mars à octobre)
  return isDST ? 2 : 1
}

function calculateRaceStartDate(competitionDate, startTime, ligue) {
  const year = competitionDate.getUTCFullYear()
  const month = competitionDate.getUTCMonth()
  const day = competitionDate.getUTCDate()
  
  const offsetHours = getTimezoneOffset(ligue, month)
  const [hours, minutes] = startTime.split(':').map(Number)
  
  // Logique actuelle : hours - offsetHours
  const utcDate = new Date(Date.UTC(year, month, day, hours - offsetHours, minutes, 0, 0))
  
  return utcDate
}

// Test avec la compétition de novembre
const competitionDate = new Date('2025-11-24T00:00:00.000Z') // 24 novembre 2025
const startTime = '09:00'
const ligue = 'BFC' // Bourgogne-Franche-Comté

console.log('=== Test de conversion ===')
console.log('Date compétition:', competitionDate.toISOString())
console.log('Heure FFA (locale):', startTime)
console.log('Ligue:', ligue)
console.log('Mois (0-indexed):', competitionDate.getUTCMonth()) // 10 = novembre

const offsetHours = getTimezoneOffset(ligue, competitionDate.getUTCMonth())
console.log('Offset calculé (getTimezoneOffset):', offsetHours)
console.log('isDST (month > 2 && month < 10):', competitionDate.getUTCMonth() > 2 && competitionDate.getUTCMonth() < 10)

const result = calculateRaceStartDate(competitionDate, startTime, ligue)
console.log('\n=== Résultat ===')
console.log('Date UTC stockée en DB:', result.toISOString())
console.log('Affichage en timezone locale (Europe/Paris):', result.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))
console.log('Affichage heure uniquement:', result.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }))
