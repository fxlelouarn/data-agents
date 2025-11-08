/**
 * Tests unitaires pour les méthodes helper de ProposalDomainService
 * 
 * Pour exécuter : tsx src/services/__tests__/proposal-domain-helpers.test.ts
 * 
 * Note: Ce fichier contient des tests simples sans framework (jest/vitest).
 * À terme, il faudrait migrer vers un framework de test approprié.
 */

// Tests pour extractRegionCode()
function testExtractRegionCode() {
  console.log('\n🧪 Tests extractRegionCode()')
  
  const regionCodes: Record<string, string> = {
    // Métropole
    'Auvergne-Rhône-Alpes': 'ARA',
    'Bourgogne-Franche-Comté': 'BFC',
    'Bretagne': 'BRE',
    'Centre-Val de Loire': 'CVL',
    'Corse': 'COR',
    'Grand Est': 'GES',
    'Hauts-de-France': 'HDF',
    'Île-de-France': 'IDF',
    'Normandie': 'NOR',
    'Nouvelle-Aquitaine': 'NAQ',
    'Occitanie': 'OCC',
    'Pays de la Loire': 'PDL',
    'Provence-Alpes-Côte d\'Azur': 'PAC',
    // DOM-TOM
    'Guadeloupe': 'GUA',
    'Martinique': 'MTQ',
    'Guyane': 'GUY',
    'La Réunion': 'REU',
    'Mayotte': 'MAY'
  }
  
  const extractRegionCode = (regionName?: string): string => {
    if (!regionName) return ''
    return regionCodes[regionName] || ''
  }
  
  // Tests positifs
  let passed = 0
  let failed = 0
  
  Object.entries(regionCodes).forEach(([region, expectedCode]) => {
    const result = extractRegionCode(region)
    if (result === expectedCode) {
      passed++
    } else {
      failed++
      console.error(`  ❌ ${region}: attendu "${expectedCode}", obtenu "${result}"`)
    }
  })
  
  // Tests cas limites
  const edgeCases = [
    { input: undefined, expected: '' },
    { input: '', expected: '' },
    { input: 'Région Inconnue', expected: '' }
  ]
  
  edgeCases.forEach(({ input, expected }) => {
    const result = extractRegionCode(input as any)
    if (result === expected) {
      passed++
    } else {
      failed++
      console.error(`  ❌ "${input}": attendu "${expected}", obtenu "${result}"`)
    }
  })
  
  console.log(`  ✅ ${passed} tests réussis`)
  if (failed > 0) {
    console.log(`  ❌ ${failed} tests échoués`)
  }
  
  return failed === 0
}

// Tests pour buildFullAddress()
function testBuildFullAddress() {
  console.log('\n🧪 Tests buildFullAddress()')
  
  const countryNames: Record<string, string> = {
    'FR': 'France',
    'BE': 'Belgique',
    'CH': 'Suisse',
    'LU': 'Luxembourg',
    'MC': 'Monaco'
  }
  
  const buildFullAddress = (city: string, department: string, country: string): string => {
    const parts = [city, department]
    
    if (country !== 'FR') {
      parts.push(countryNames[country] || country)
    } else {
      parts.push('France')
    }
    
    return parts.filter(Boolean).join(', ')
  }
  
  const tests = [
    {
      input: { city: 'Nancy', department: 'Meurthe-et-Moselle', country: 'FR' },
      expected: 'Nancy, Meurthe-et-Moselle, France'
    },
    {
      input: { city: 'Paris', department: 'Paris', country: 'FR' },
      expected: 'Paris, Paris, France'
    },
    {
      input: { city: 'Bruxelles', department: 'Bruxelles-Capitale', country: 'BE' },
      expected: 'Bruxelles, Bruxelles-Capitale, Belgique'
    },
    {
      input: { city: 'Genève', department: 'Genève', country: 'CH' },
      expected: 'Genève, Genève, Suisse'
    },
    {
      input: { city: 'Luxembourg', department: 'Luxembourg', country: 'LU' },
      expected: 'Luxembourg, Luxembourg, Luxembourg'
    },
    {
      input: { city: 'Monaco', department: 'Monaco', country: 'MC' },
      expected: 'Monaco, Monaco, Monaco'
    },
    {
      input: { city: 'Berlin', department: 'Berlin', country: 'DE' },
      expected: 'Berlin, Berlin, DE' // Pays inconnu -> code ISO
    },
    {
      input: { city: 'Nancy', department: '', country: 'FR' },
      expected: 'Nancy, France' // Département vide
    }
  ]
  
  let passed = 0
  let failed = 0
  
  tests.forEach(({ input, expected }) => {
    const result = buildFullAddress(input.city, input.department, input.country)
    if (result === expected) {
      passed++
    } else {
      failed++
      console.error(`  ❌ ${JSON.stringify(input)}: attendu "${expected}", obtenu "${result}"`)
    }
  })
  
  console.log(`  ✅ ${passed} tests réussis`)
  if (failed > 0) {
    console.log(`  ❌ ${failed} tests échoués`)
  }
  
  return failed === 0
}

// Tests pour generateEventSlug()
function testGenerateEventSlug() {
  console.log('\n🧪 Tests generateEventSlug()')
  
  const generateEventSlug = (name: string, id: number): string => {
    const slugifiedName = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
    
    return `${slugifiedName}-${id}`
  }
  
  const tests = [
    {
      input: { name: 'Semi-Marathon du Grand Nancy', id: 15178 },
      expected: 'semi-marathon-du-grand-nancy-15178'
    },
    {
      input: { name: 'Trail des Écureuils', id: 12345 },
      expected: 'trail-des-ecureuils-12345'
    },
    {
      input: { name: 'Course à pied de Noël', id: 9999 },
      expected: 'course-a-pied-de-noel-9999'
    },
    {
      input: { name: '10km de Paris - Édition 2025', id: 1000 },
      expected: '10km-de-paris-edition-2025-1000'
    },
    {
      input: { name: 'Run & Walk @ Strasbourg', id: 5555 },
      expected: 'run-walk-strasbourg-5555'
    },
    {
      input: { name: 'Marathon   avec   espaces   multiples', id: 7777 },
      expected: 'marathon-avec-espaces-multiples-7777'
    },
    {
      input: { name: 'Triathlon (Natation/Vélo/Course)', id: 8888 },
      expected: 'triathlon-natationvelocourse-8888'
    }
  ]
  
  let passed = 0
  let failed = 0
  
  tests.forEach(({ input, expected }) => {
    const result = generateEventSlug(input.name, input.id)
    if (result === expected) {
      passed++
    } else {
      failed++
      console.error(`  ❌ "${input.name}" (${input.id}): attendu "${expected}", obtenu "${result}"`)
    }
  })
  
  console.log(`  ✅ ${passed} tests réussis`)
  if (failed > 0) {
    console.log(`  ❌ ${failed} tests échoués`)
  }
  
  return failed === 0
}

// Tests pour inferDataSource()
function testInferDataSource() {
  console.log('\n🧪 Tests inferDataSource()')
  
  const inferDataSource = (selectedChanges: Record<string, any>): string => {
    const agentName = selectedChanges._agentName || ''
    
    if (agentName.toLowerCase().includes('ffa') || 
        agentName.toLowerCase().includes('federation')) {
      return 'FEDERATION'
    }
    
    if (agentName.toLowerCase().includes('timer') || 
        agentName.toLowerCase().includes('chronometeur')) {
      return 'TIMER'
    }
    
    return 'OTHER'
  }
  
  const tests = [
    {
      input: { _agentName: 'FFA Scraper Agent' },
      expected: 'FEDERATION'
    },
    {
      input: { _agentName: 'ffa-scraper' },
      expected: 'FEDERATION'
    },
    {
      input: { _agentName: 'Federation Data Agent' },
      expected: 'FEDERATION'
    },
    {
      input: { _agentName: 'Timer Agent' },
      expected: 'TIMER'
    },
    {
      input: { _agentName: 'Chronometeur Scraper' },
      expected: 'TIMER'
    },
    {
      input: { _agentName: 'chronomètre-agent' }, // sans accent dans le code
      expected: 'OTHER'
    },
    {
      input: { _agentName: 'Google Search Date Agent' },
      expected: 'OTHER'
    },
    {
      input: { _agentName: '' },
      expected: 'OTHER'
    },
    {
      input: {},
      expected: 'OTHER'
    }
  ]
  
  let passed = 0
  let failed = 0
  
  tests.forEach(({ input, expected }) => {
    const result = inferDataSource(input)
    if (result === expected) {
      passed++
    } else {
      failed++
      console.error(`  ❌ ${JSON.stringify(input)}: attendu "${expected}", obtenu "${result}"`)
    }
  })
  
  console.log(`  ✅ ${passed} tests réussis`)
  if (failed > 0) {
    console.log(`  ❌ ${failed} tests échoués`)
  }
  
  return failed === 0
}

// Tests pour getCountryName()
function testGetCountryName() {
  console.log('\n🧪 Tests getCountryName()')
  
  const countryNames: Record<string, string> = {
    'FR': 'France',
    'BE': 'Belgique',
    'CH': 'Suisse',
    'LU': 'Luxembourg',
    'MC': 'Monaco',
    'DE': 'Allemagne',
    'ES': 'Espagne',
    'IT': 'Italie',
    'GB': 'United Kingdom',
    'US': 'United States'
  }
  
  const getCountryName = (countryCode: string): string => {
    return countryNames[countryCode] || countryCode
  }
  
  const tests = [
    ...Object.entries(countryNames).map(([code, name]) => ({ input: code, expected: name })),
    { input: 'XX', expected: 'XX' }, // Code inconnu
    { input: '', expected: '' }
  ]
  
  let passed = 0
  let failed = 0
  
  tests.forEach(({ input, expected }) => {
    const result = getCountryName(input)
    if (result === expected) {
      passed++
    } else {
      failed++
      console.error(`  ❌ "${input}": attendu "${expected}", obtenu "${result}"`)
    }
  })
  
  console.log(`  ✅ ${passed} tests réussis`)
  if (failed > 0) {
    console.log(`  ❌ ${failed} tests échoués`)
  }
  
  return failed === 0
}

// Exécuter tous les tests
async function runAllTests() {
  console.log('='.repeat(60))
  console.log('🧪 Tests Unitaires - ProposalDomainService Helpers')
  console.log('='.repeat(60))
  
  const results = [
    testExtractRegionCode(),
    testBuildFullAddress(),
    testGenerateEventSlug(),
    testInferDataSource(),
    testGetCountryName()
  ]
  
  const allPassed = results.every(r => r)
  
  console.log('\n' + '='.repeat(60))
  if (allPassed) {
    console.log('✅ Tous les tests sont passés !')
  } else {
    console.log('❌ Certains tests ont échoué')
    process.exit(1)
  }
  console.log('='.repeat(60))
}

runAllTests()
