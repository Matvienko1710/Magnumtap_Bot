@echo off
chcp 65001 >nul
echo 🚀 Автоматический деплой Magnum Bot...

REM Автоматическая приостановка старого деплоя на Render перед новым
if defined RENDER_API_KEY if defined RENDER_SERVICE_ID (
    echo ⏸️ Приостанавливаем текущий сервис на Render для плавного перехода...
    powershell -Command "$headers = @{ 'Authorization' = 'Bearer ' + $env:RENDER_API_KEY; 'Content-Type' = 'application/json' }; try { $response = Invoke-WebRequest -Method Post -Uri https://api.render.com/v1/services/$($env:RENDER_SERVICE_ID)/suspend -Headers $headers -UseBasicParsing; if ($response.StatusCode -eq 200) { Write-Host '✅ Сервис успешно приостановлен' } else { Write-Host '⚠️ Не удалось приостановить сервис, продолжаем...' } } catch { Write-Host '⚠️ Ошибка приостановки сервиса, продолжаем...' }"
    echo ⏳ Ждем 10 секунд для завершения процессов...
    timeout /t 10 /nobreak >nul
)

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

REM Автоматическое возобновление сервиса на Render после успешного деплоя
if defined RENDER_API_KEY if defined RENDER_SERVICE_ID (
    echo ▶️ Возобновляем сервис на Render после деплоя...
    echo ⏳ Ждем завершения деплоя (30 секунд)...
    timeout /t 30 /nobreak >nul

    powershell -Command "$headers = @{ 'Authorization' = 'Bearer ' + $env:RENDER_API_KEY; 'Content-Type' = 'application/json' }; try { $response = Invoke-WebRequest -Method Post -Uri https://api.render.com/v1/services/$($env:RENDER_SERVICE_ID)/resume -Headers $headers -UseBasicParsing; if ($response.StatusCode -eq 200) { Write-Host '✅ Сервис успешно возобновлен' } else { Write-Host '⚠️ Не удалось возобновить сервис автоматически' } } catch { Write-Host '⚠️ Ошибка возобновления сервиса' }"
)

echo 🎉 Автоматический деплой завершен!
echo ℹ️ Проверьте статус деплоя на Render.com
echo ℹ️ Логи доступны в панели управления Render
pause


