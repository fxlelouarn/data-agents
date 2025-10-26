import axios from 'axios';
import { prisma } from '@data-agents/database';

async function testGoogleSearch() {
  const query = '"Trail Hostun" "Hostun" 2026';
  
  // Récupérer la configuration de l'agent depuis la DB
  const agent = await prisma.agent.findFirst({
    where: {
      name: {
        contains: 'Google',
        mode: 'insensitive'
      }
    }
  });
  
  if (!agent) {
    console.error('❌ Agent Google non trouvé dans la DB');
    return;
  }
  
  console.log('🤖 Agent trouvé:', agent.name);
  
  const config = agent.config as any;
  const googleApiKey = config?.googleApiKey;
  const googleSearchEngineId = config?.googleSearchEngineId;

  if (!googleApiKey || !googleSearchEngineId) {
    console.error('❌ Clés API Google manquantes dans la configuration de l\'agent');
    console.log('GOOGLE_API_KEY:', googleApiKey ? '✅ présente' : '❌ manquante');
    console.log('GOOGLE_SEARCH_ENGINE_ID:', googleSearchEngineId ? '✅ présente' : '❌ manquante');
    return;
  }

  console.log('🔍 Recherche Google:', query);
  console.log('');

  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: googleApiKey,
        cx: googleSearchEngineId,
        q: query,
        num: 5,
        dateRestrict: 'y1' // Limiter aux résultats de l'année écoulée
      }
    });

    const results = response.data;
    
    console.log(`📊 Nombre de résultats: ${results.items?.length || 0}`);
    console.log('');

    if (results.items) {
      results.items.forEach((item: any, index: number) => {
        console.log(`\n=== Résultat ${index + 1} ===`);
        console.log('🔗 URL:', item.link);
        console.log('📰 Titre:', item.title);
        console.log('📝 Snippet:', item.snippet);
        console.log('');
        
        // Tester l'extraction de date
        const textToAnalyze = `${item.title} ${item.snippet}`.toLowerCase();
        const pattern = /(?:le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi;
        
        const match = pattern.exec(textToAnalyze);
        if (match) {
          console.log('✅ Date extraite:', match[0]);
          console.log('   Jour:', match[1], '| Mois:', match[2], '| Année:', match[3]);
        } else {
          console.log('❌ Aucune date extraite');
        }
      });
    } else {
      console.log('❌ Aucun résultat trouvé');
    }
    
  } catch (error: any) {
    console.error('❌ Erreur lors de la recherche Google:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

testGoogleSearch();
