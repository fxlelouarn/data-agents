// Test d'extraction de dates pour Trail Hostun
const snippet = "trail hostun - 27 septembre 2026";
const title = "Trail d'Hostun 2026 - Parcours, inscriptions & résultats | Finishers";

// Pattern de la ligne 655
const pattern1 = /(?:le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi;

console.log('=== Test Pattern 1: "jour mois année" ===');
console.log('Snippet:', snippet);
console.log('Pattern:', pattern1.source);

const match1 = pattern1.exec(snippet);
if (match1) {
  console.log('✅ Match trouvé:', match1[0]);
  console.log('   Jour:', match1[1]);
  console.log('   Mois:', match1[2]);
  console.log('   Année:', match1[3]);
} else {
  console.log('❌ Pas de match');
}

// Test aussi avec le titre
console.log('\n=== Test avec le titre ===');
console.log('Titre:', title);
const pattern2 = /(\d{4})/g;
const matchTitle = pattern2.exec(title);
if (matchTitle) {
  console.log('✅ Année trouvée dans titre:', matchTitle[0]);
} else {
  console.log('❌ Pas d\'année dans titre');
}

// Test du snippet complet de Google (simulé)
const fullSnippet = `Trail d'Hostun 2026 : retrouve ici toutes les informations pratiques de la course : histoire, parcours, inscription, dossards, résultats ! Le 27 septembre 2026.`;
console.log('\n=== Test avec snippet complet ===');
console.log('Snippet:', fullSnippet);
const pattern3 = /(?:le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi;
const match3 = pattern3.exec(fullSnippet.toLowerCase());
if (match3) {
  console.log('✅ Match trouvé:', match3[0]);
  console.log('   Jour:', match3[1]);
  console.log('   Mois:', match3[2]);
  console.log('   Année:', match3[3]);
} else {
  console.log('❌ Pas de match');
}
