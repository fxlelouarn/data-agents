/**
 * Mapping des codes départements français vers leurs noms officiels
 * Source: INSEE - Code officiel géographique
 */

export const FRENCH_DEPARTMENTS: Record<string, string> = {
  '01': 'Ain',
  '02': 'Aisne',
  '03': 'Allier',
  '04': 'Alpes-de-Haute-Provence',
  '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes',
  '07': 'Ardèche',
  '08': 'Ardennes',
  '09': 'Ariège',
  '10': 'Aube',
  '11': 'Aude',
  '12': 'Aveyron',
  '13': 'Bouches-du-Rhône',
  '14': 'Calvados',
  '15': 'Cantal',
  '16': 'Charente',
  '17': 'Charente-Maritime',
  '18': 'Cher',
  '19': 'Corrèze',
  '21': "Côte-d'Or",
  '22': "Côtes-d'Armor",
  '23': 'Creuse',
  '24': 'Dordogne',
  '25': 'Doubs',
  '26': 'Drôme',
  '27': 'Eure',
  '28': 'Eure-et-Loir',
  '29': 'Finistère',
  '2A': 'Corse-du-Sud',
  '2B': 'Haute-Corse',
  '30': 'Gard',
  '31': 'Haute-Garonne',
  '32': 'Gers',
  '33': 'Gironde',
  '34': 'Hérault',
  '35': 'Ille-et-Vilaine',
  '36': 'Indre',
  '37': 'Indre-et-Loire',
  '38': 'Isère',
  '39': 'Jura',
  '40': 'Landes',
  '41': 'Loir-et-Cher',
  '42': 'Loire',
  '43': 'Haute-Loire',
  '44': 'Loire-Atlantique',
  '45': 'Loiret',
  '46': 'Lot',
  '47': 'Lot-et-Garonne',
  '48': 'Lozère',
  '49': 'Maine-et-Loire',
  '50': 'Manche',
  '51': 'Marne',
  '52': 'Haute-Marne',
  '53': 'Mayenne',
  '54': 'Meurthe-et-Moselle',
  '55': 'Meuse',
  '56': 'Morbihan',
  '57': 'Moselle',
  '58': 'Nièvre',
  '59': 'Nord',
  '60': 'Oise',
  '61': 'Orne',
  '62': 'Pas-de-Calais',
  '63': 'Puy-de-Dôme',
  '64': 'Pyrénées-Atlantiques',
  '65': 'Hautes-Pyrénées',
  '66': 'Pyrénées-Orientales',
  '67': 'Bas-Rhin',
  '68': 'Haut-Rhin',
  '69': 'Rhône',
  '70': 'Haute-Saône',
  '71': 'Saône-et-Loire',
  '72': 'Sarthe',
  '73': 'Savoie',
  '74': 'Haute-Savoie',
  '75': 'Paris',
  '76': 'Seine-Maritime',
  '77': 'Seine-et-Marne',
  '78': 'Yvelines',
  '79': 'Deux-Sèvres',
  '80': 'Somme',
  '81': 'Tarn',
  '82': 'Tarn-et-Garonne',
  '83': 'Var',
  '84': 'Vaucluse',
  '85': 'Vendée',
  '86': 'Vienne',
  '87': 'Haute-Vienne',
  '88': 'Vosges',
  '89': 'Yonne',
  '90': 'Territoire de Belfort',
  '91': 'Essonne',
  '92': 'Hauts-de-Seine',
  '93': 'Seine-Saint-Denis',
  '94': 'Val-de-Marne',
  '95': "Val-d'Oise",
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '976': 'Mayotte'
}

/**
 * Convertit un code département en nom de département
 * Gère les codes sur 2 ou 3 chiffres et normalise le format
 * 
 * @param code Code département (ex: "063", "06", "2A")
 * @returns Nom du département ou le code si non trouvé
 */
export function getDepartmentName(code: string | null | undefined): string {
  if (!code) return ''
  
  // Normaliser le code : retirer les zéros non significatifs pour les codes numériques
  let normalizedCode = code.trim()
  
  // Si c'est un code numérique sur 3 chiffres, le convertir en 2 chiffres
  if (/^\d{3}$/.test(normalizedCode)) {
    normalizedCode = normalizedCode.substring(1) // "063" -> "63"
  }
  
  // Gérer les cas spéciaux Corse (2A, 2B)
  normalizedCode = normalizedCode.toUpperCase()
  
  return FRENCH_DEPARTMENTS[normalizedCode] || code
}

/**
 * Normalise un code département pour l'affichage
 * 
 * Règles :
 * - Codes DOM-TOM (971-976) : garder 3 chiffres
 * - Codes métropole avec zéro devant (021, 063) : retirer le zéro (-> 21, 63)
 * - Autres codes : garder tels quels
 * 
 * @param code Code département (ex: "063", "06", "974")
 * @returns Code normalisé (ex: "63", "06", "974")
 */
export function normalizeDepartmentCode(code: string | null | undefined): string {
  if (!code) return ''
  
  const trimmed = code.trim()
  
  // Cas spécial : DOM-TOM (codes 971-976) -> garder 3 chiffres
  if (/^97[1-6]$/.test(trimmed)) {
    return trimmed
  }
  
  // Codes métropole avec zéro devant : "0XX" -> "XX"
  // Exemples : "021" -> "21", "063" -> "63", "069" -> "69"
  if (/^0\d{2}$/.test(trimmed)) {
    return trimmed.substring(1)
  }
  
  // Cas spécial Corse : garder tel quel (2A, 2B)
  // Tous les autres codes : garder tels quels
  return trimmed
}
