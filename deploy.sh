#!/bin/bash

echo "🚀 Автоматический деплой Magnum Bot..."

# Автоматическая приостановка старого деплоя на Render перед новым
if [[ -n "$RENDER_API_KEY" && -n "$RENDER_SERVICE_ID" ]]; then
    echo "⏸️ Приостанавливаем текущий сервис на Render для плавного перехода..."

    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        "https://api.render.com/v1/services/$RENDER_SERVICE_ID/suspend" \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json")

    if [[ "$response" == "200" ]]; then
        echo "✅ Сервис успешно приостановлен"
    else
        echo "⚠️ Не удалось приостановить сервис, продолжаем..."
    fi

    echo "⏳ Ждем 10 секунд для завершения процессов..."
    sleep 10
fi

# Проверяем наличие package.json
if [[ ! -f "package.json" ]]; then
    echo "❌ Не найден package.json. Убедитесь, что вы в корневой папке проекта."
    exit 1
fi

# Проверяем инициализацию Git
if [[ ! -d ".git" ]]; then
    echo "⚠️ Git не инициализирован. Инициализируем..."
    git init
    git remote add origin https://github.com/Matvienko1710/Magnumtap_Bot.git
fi

echo "📋 Проверяем статус Git..."
git status

echo "📁 Добавляем все файлы в Git..."
git add .

echo "🔄 Создаем коммит..."
commit_date=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "🚀 Auto-deploy: $commit_date - Magnum Bot Update"

echo "🚀 Пушим на GitHub..."
if git push origin main; then
    echo "✅ Успешно запушено на GitHub!"
    echo "ℹ️ Render.com автоматически начнет деплой через несколько секунд..."
else
    echo "❌ Ошибка при пуше на GitHub"
    exit 1
fi

# Автоматическое возобновление сервиса на Render после успешного деплоя
if [[ -n "$RENDER_API_KEY" && -n "$RENDER_SERVICE_ID" ]]; then
    echo "▶️ Возобновляем сервис на Render после деплоя..."
    echo "⏳ Ждем завершения деплоя (30 секунд)..."
    sleep 30

    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        "https://api.render.com/v1/services/$RENDER_SERVICE_ID/resume" \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json")

    if [[ "$response" == "200" ]]; then
        echo "✅ Сервис успешно возобновлен"
    else
        echo "⚠️ Не удалось возобновить сервис автоматически"
    fi
fi

echo "🎉 Автоматический деплой завершен!"
echo "ℹ️ Проверьте статус деплоя на Render.com"
echo "ℹ️ Логи доступны в панели управления Render"
