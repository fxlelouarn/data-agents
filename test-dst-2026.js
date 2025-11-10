// Test du changement d'heure 2026

// Le dernier dimanche de mars 2026
const march2026 = new Date(2026, 2, 1) // 1er mars 2026
let lastSundayMarch = null

for (let day = 31; day >= 1; day--) {
  const date = new Date(2026, 2, day)
  if (date.getDay() === 0) { // Dimanche
    lastSundayMarch = date
    break
  }
}

console.log('=== Changement d\'heure 2026 ===')
console.log('Dernier dimanche de mars 2026:', lastSundayMarch?.toLocaleDateString('fr-FR'))
console.log('Date complète:', lastSundayMarch?.toISOString())

// Tester le 29 mars 2026
const eventDate = new Date('2026-03-29T09:00:00+01:00') // 09:00 heure locale (avant DST)
const eventDateDST = new Date('2026-03-29T09:00:00+02:00') // 09:00 heure locale (après DST)

console.log('\n=== Événement 29 mars 2026 à 09:00 ===')
console.log('Si heure d\'hiver (UTC+1):', eventDate.toISOString(), '→', eventDate.toLocaleString('fr-FR'))
console.log('Si heure d\'été (UTC+2):', eventDateDST.toISOString(), '→', eventDateDST.toLocaleString('fr-FR'))

// Vérifier ce que donne la date stockée en DB
const storedDate = new Date('2026-03-29T08:00:00.000Z')
console.log('\n=== Date stockée en DB ===')
console.log('UTC:', storedDate.toISOString())
console.log('Affichage timezone navigateur:', storedDate.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))
console.log('Heure seule:', storedDate.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }))

// Calculer l'offset réel à cette date
const parisTime = new Date(storedDate.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
const utcTime = new Date(storedDate.toLocaleString('en-US', { timeZone: 'UTC' }))
console.log('\nOffset réel Europe/Paris le 29 mars 2026:', (parisTime - utcTime) / (1000 * 60 * 60), 'heures')
