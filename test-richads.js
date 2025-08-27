// Тест RichAds интеграции
const { getRichAdsOffers } = require('./richads-integration');

async function testRichAds() {
  try {
    console.log('🧪 Тестирование RichAds интеграции...');
    
    const offers = await getRichAdsOffers();
    console.log(`✅ Получено ${offers.length} офферов`);
    
    offers.forEach((offer, index) => {
      console.log(`${index + 1}. ${offer.title}`);
      console.log(`   Награда: ${offer.reward} Stars`);
      console.log(`   Сложность: ${offer.difficulty}`);
      console.log(`   Время: ${offer.estimatedTime}`);
      console.log('');
    });
    
    console.log('✅ Тест завершен успешно!');
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error.message);
  }
}

testRichAds();
