@echo off
chcp 65001 >nul
echo 🚀 Автоматический деплой Magnum Bot...

REM Проверяем наличие package.json
if not exist "package.json" (
    echo ❌ Не найден package.json. Убедитесь, что вы в корневой папке проекта.
    pause
    exit /b 1
)

REM Проверяем инициализацию Git
if not exist ".git" (
    echo ⚠️ Git не инициализирован. Инициализируем...
    git init
    git remote add origin https://github.com/Matvienko1710/Magnumtap_Bot.git
)

echo 📋 Проверяем статус Git...
git status

echo 📁 Добавляем все файлы в Git...
git add .

echo 🔄 Создаем коммит...
for /f "tokens=1-6 delims=/: " %%a in ('echo %date% %time%') do (
    set commit_date=%%a-%%b-%%c %%d:%%e:%%f
)
git commit -m "🚀 Auto-deploy: %commit_date% - Magnum Bot Update"

echo 🚀 Пушим на GitHub...
git push origin main

if %errorlevel% equ 0 (
    echo ✅ Успешно запушено на GitHub!
    echo ℹ️ Render.com автоматически начнет деплой через несколько секунд...
) else (
    echo ❌ Ошибка при пуше на GitHub
    pause
    exit /b 1
)

echo 🎉 Автоматический деплой завершен!
echo ℹ️ Проверьте статус деплоя на Render.com
echo ℹ️ Логи доступны в панели управления Render
pause


