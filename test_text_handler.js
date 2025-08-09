// Тест обработчика текстовых сообщений

// Тестовые данные
const testCases = [
  {
    name: 'Telegram Stars - ввод суммы',
    replyText: 'Введите количество звёзд для вывода в Telegram Stars (минимум 100):',
    userText: '500',
    shouldMatch: true
  },
  {
    name: 'Telegram Stars - ввод ID',
    replyText: 'Введите ваш Telegram ID для получения 500 Telegram Stars:',
    userText: '123456789',
    shouldMatch: true
  },
  {
    name: 'TON - ввод адреса',
    replyText: 'Введите ваш TON адрес для вывода:',
    userText: 'EQD1234567890',
    shouldMatch: true
  },
  {
    name: 'TON - ввод суммы',
    replyText: 'Введите количество звёзд для вывода в TON (минимум 500):',
    userText: '1000',
    shouldMatch: true
  },
  {
    name: 'USDT - ввод адреса',
    replyText: 'Введите ваш USDT TRC-20 адрес для вывода:',
    userText: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    shouldMatch: true
  },
  {
    name: 'USDT - ввод суммы',
    replyText: 'Введите количество звёзд для вывода в USDT (минимум 1000):',
    userText: '2000',
    shouldMatch: true
  },
  {
    name: 'Неподходящий текст',
    replyText: 'Какое-то другое сообщение',
    userText: '500',
    shouldMatch: false
  }
];

function testTextMatching() {
  console.log('=== ТЕСТ ОБРАБОТЧИКА ТЕКСТОВЫХ СООБЩЕНИЙ ===\n');
  
  let passed = 0;
  let total = testCases.length;
  
  testCases.forEach((testCase, index) => {
    console.log(`${index + 1}. ${testCase.name}`);
    console.log(`   Reply: "${testCase.replyText}"`);
    console.log(`   User:  "${testCase.userText}"`);
    
    // Проверяем все условия из bot.js
    let matched = false;
    
    if (testCase.replyText.includes('Введите количество звёзд для вывода в Telegram Stars (минимум 100)')) {
      matched = true;
      console.log('   ✅ Совпадение: Telegram Stars - ввод суммы');
    }
    else if (testCase.replyText.includes('Введите ваш Telegram ID для получения') && testCase.replyText.includes('Telegram Stars')) {
      matched = true;
      console.log('   ✅ Совпадение: Telegram Stars - ввод ID');
    }
    else if (testCase.replyText.includes('Введите ваш TON адрес для вывода:')) {
      matched = true;
      console.log('   ✅ Совпадение: TON - ввод адреса');
    }
    else if (testCase.replyText.includes('Введите количество звёзд для вывода в TON (минимум 500)')) {
      matched = true;
      console.log('   ✅ Совпадение: TON - ввод суммы');
    }
    else if (testCase.replyText.includes('Введите ваш USDT TRC-20 адрес для вывода:')) {
      matched = true;
      console.log('   ✅ Совпадение: USDT - ввод адреса');
    }
    else if (testCase.replyText.includes('Введите количество звёзд для вывода в USDT (минимум 1000)')) {
      matched = true;
      console.log('   ✅ Совпадение: USDT - ввод суммы');
    }
    else {
      console.log('   ❌ Совпадений не найдено');
    }
    
    const result = matched === testCase.shouldMatch;
    console.log(`   ${result ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН'}`);
    
    if (result) passed++;
    console.log('');
  });
  
  console.log(`=== РЕЗУЛЬТАТ: ${passed}/${total} тестов пройдено ===`);
}

testTextMatching();