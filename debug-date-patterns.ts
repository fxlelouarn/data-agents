/**
 * Debug des patterns de dates françaises
 */

function testDatePatterns() {
  console.log('🔍 Debug des patterns de dates françaises\n')

  const testTexts = [
    'Le Marathon de Paris 2025 aura lieu le dimanche 6 avril 2025.',
    'Prochaine édition prévue pour le 13/04/2025. Plus d\'infos bientôt.',
    'La course se déroulera en avril 2025. Date exacte: 2025-04-06.',
    'Événement prévu pour le 23/06/2025.',
    'Le trail aura lieu le lundi 25 août 2025 à 9h00.',
    'Course prévue en juin 2025.',
    'UTMB prévu le vendredi 29 août 2025.',
  ]

  // Patterns copiés de l'agent (avec les mêmes regex)
  const datePatterns = [
    // "le 15 juin 2024", "le dimanche 16 juin 2024"
    /(?:le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi,
    // "15/06/2024", "15-06-2024"
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g,
    // "juin 2024", "en juin 2024"
    /(?:en\s+)?(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi,
    // "2024-06-15" (format ISO)
    /(\d{4})-(\d{1,2})-(\d{1,2})/g
  ]

  const monthNames = {
    'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
    'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12
  }

  testTexts.forEach((text, textIndex) => {
    console.log(`📝 Test ${textIndex + 1}: "${text}"`)
    
    let foundAny = false
    
    datePatterns.forEach((pattern, patternIndex) => {
      // Réinitialiser le regex pour éviter les problèmes de lastIndex
      pattern.lastIndex = 0
      
      let match
      while ((match = pattern.exec(text)) !== null) {
        foundAny = true
        
        console.log(`   ✅ Pattern ${patternIndex + 1} trouvé: "${match[0]}"`)
        console.log(`      Groupes: [${match.slice(1).join(', ')}]`)
        
        // Essayer de construire une date
        try {
          let date: Date | undefined
          
          if (pattern.source.includes('janvier|')) {
            // Pattern avec nom de mois français
            const day = parseInt(match[1])
            const monthName = match[2].toLowerCase()
            const year = parseInt(match[3])
            const month = monthNames[monthName as keyof typeof monthNames]
            
            if (month && year >= 2024 && year <= 2026) {
              date = new Date(year, month - 1, day)
            }
            
          } else if (pattern.source.includes('\\/\\-')) {
            // Pattern DD/MM/YYYY ou DD-MM-YYYY
            const day = parseInt(match[1])
            const month = parseInt(match[2])
            const year = parseInt(match[3])
            
            if (year >= 2024 && year <= 2026 && month >= 1 && month <= 12) {
              date = new Date(year, month - 1, day)
            }
            
          } else if (pattern.source.includes('(\d{4})-')) {
            // Pattern YYYY-MM-DD
            const year = parseInt(match[1])
            const month = parseInt(match[2])
            const day = parseInt(match[3])
            
            if (year >= 2024 && year <= 2026 && month >= 1 && month <= 12) {
              date = new Date(year, month - 1, day)
            }
            
          } else {
            // Pattern mois seul
            const monthName = match[1].toLowerCase()
            const year = parseInt(match[2])
            const month = monthNames[monthName as keyof typeof monthNames]
            
            if (month && year >= 2024 && year <= 2026) {
              date = new Date(year, month - 1, 1) // Premier du mois
            }
          }
          
          if (date && !isNaN(date.getTime())) {
            console.log(`      → Date générée: ${date.toLocaleDateString('fr-FR')}`)
          } else {
            console.log(`      → Échec de génération de date`)
          }
          
        } catch (error) {
          console.log(`      → Erreur: ${error}`)
        }
      }
    })
    
    if (!foundAny) {
      console.log('   ❌ Aucun pattern détecté')
    }
    
    console.log('')
  })

  // Test spécial des regex individuelles
  console.log('🔬 Tests individuels des regex:\n')
  
  const sampleText = 'Le Marathon aura lieu le dimanche 6 avril 2025 et les inscriptions ferment le 13/04/2025.'
  
  datePatterns.forEach((pattern, i) => {
    console.log(`Pattern ${i + 1}: ${pattern.source}`)
    pattern.lastIndex = 0
    
    let match
    let matchCount = 0
    while ((match = pattern.exec(sampleText)) !== null) {
      matchCount++
      console.log(`  Match ${matchCount}: "${match[0]}" - groups: [${match.slice(1).join(', ')}]`)
    }
    
    if (matchCount === 0) {
      console.log(`  Aucun match`)
    }
    console.log('')
  })
}

testDatePatterns()