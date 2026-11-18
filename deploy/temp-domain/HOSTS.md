# Доступ сотрудников к сайту и админке через `hosts`

Пока не работает DNS основного домена, компьютер сотрудника не знает, где
находится `npo-polet.ru`. Файл `hosts` подсказывает адрес напрямую, в обход DNS.
Сайт и админка открываются как обычно, по своим адресам, с настоящим
сертификатом: сервер тот же, меняется только способ найти его адрес.

Добавляется **одна строка** с меткой `# npo-polet-temp`. По метке её удаляет
одна команда и ничего больше не трогает. Перед изменением сохраняется копия
файла `hosts.before-npo`.

**Почему откат не срочный.** Строка указывает на тот же IP, что вернёт DNS после
восстановления. Если её забыть, ничего не сломается — **пока сервер не переедет
на другой IP**. Поэтому строку убирают у всех после восстановления, и обязательно
до любой смены сервера.

## macOS

**Включить.** Программы → Утилиты → Терминал, вставить одну строку, Enter,
ввести пароль от Mac (символы при вводе не видны — это нормально):

```bash
sudo sh -c 'grep -q npo-polet-temp /etc/hosts || { cp /etc/hosts /etc/hosts.before-npo; printf "\n194.87.118.176 npo-polet.ru www.npo-polet.ru admin.npo-polet.ru # npo-polet-temp\n" >> /etc/hosts; }' && sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder && echo ГОТОВО
```

Повторный запуск безопасен — строка не задвоится.

**Выключить:**

```bash
sudo sed -i '' '/# npo-polet-temp$/d' /etc/hosts && sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder && echo УДАЛЕНО
```

## Windows 10/11

**Включить.** Пуск → ввести `PowerShell` → правой кнопкой «Запуск от имени
администратора» → «Да». Вставить (правая кнопка мыши) одну строку, Enter:

```powershell
$h="$env:SystemRoot\System32\drivers\etc\hosts"; if (-not (Select-String -Path $h -Pattern 'npo-polet-temp' -Quiet)) { Copy-Item $h "$h.before-npo" -Force; Add-Content -Path $h -Value "`r`n194.87.118.176 npo-polet.ru www.npo-polet.ru admin.npo-polet.ru # npo-polet-temp" -Encoding ASCII }; ipconfig /flushdns; 'ГОТОВО'
```

**Выключить** (тоже PowerShell от администратора):

```powershell
$h="$env:SystemRoot\System32\drivers\etc\hosts"; (Get-Content $h) | Where-Object { $_ -notmatch 'npo-polet-temp' } | Set-Content -Path $h -Encoding ASCII; ipconfig /flushdns; 'УДАЛЕНО'
```

«Отказано в доступе» — PowerShell запущен не от администратора. Антивирус
спрашивает про изменение `hosts` — разрешить.

## Если команды не подходят — вручную

- **Mac:** в Терминале `sudo nano /etc/hosts`, в конец добавить строку ниже,
  Ctrl+O, Enter, Ctrl+X. Затем команду сброса кэша из блока «Включить».
- **Windows:** Блокнот «от имени администратора» → Файл → Открыть →
  `C:\Windows\System32\drivers\etc\` → тип файлов «Все файлы» → `hosts`. В конец
  строку ниже, Ctrl+S. Затем в командной строке `ipconfig /flushdns`.

```
194.87.118.176 npo-polet.ru www.npo-polet.ru admin.npo-polet.ru # npo-polet-temp
```

Удалить вручную — стереть эту строку так же.

## Проверка

1. **Закрыть браузер полностью и открыть заново.** Браузеры держат свой кэш
   адресов: без перезапуска могут ещё минуты показывать «сервер не найден».
   Chrome/Яндекс Браузер можно сбросить без перезапуска:
   `chrome://net-internals/#dns` → «Clear host cache».
2. Открыть `https://admin.npo-polet.ru/admin` — страница входа в админку, замок в
   адресной строке без предупреждений.
3. Открыть `https://npo-polet.ru` — витрина.

Если всё равно «сервер не найден»:

- включён VPN или прокси — отключить на время работы с сайтом;
- Safari на Mac с iCloud Private Relay — попробовать Chrome или отключить Private
  Relay (Системные настройки → Apple ID → iCloud → Частный узел);
- проверить, что строка на месте: Mac — `grep npo-polet /etc/hosts`, Windows —
  `findstr npo-polet %SystemRoot%\System32\drivers\etc\hosts`.

## Телефоны

На iPhone и Android без root `hosts` не редактируется. Работать с телефона —
через временный домен, когда он будет поднят (README.md, шаг 3), или с
компьютера.

## Откат у всех сотрудников

Когда основной домен снова открывается **без** `hosts`:

1. Проверить снаружи: `dig +short npo-polet.ru @8.8.8.8` возвращает
   `194.87.118.176`; сайт открывается с мобильного интернета (там `hosts` нет).
2. Разослать сотрудникам команду «Выключить» для их системы.
3. Каждый перезапускает браузер и проверяет, что админка открывается.
   Не открывается — значит, DNS у их провайдера ещё не обновился: вернуть
   строку командой «Включить» и повторить через пару часов. Откат на этом шаге
   ничего не ломает необратимо — это та же одна команда в обе стороны.
4. Отметить у себя, что у каждого строка удалена. Забытая строка — мина при
   будущем переезде сервера: сайт у этого сотрудника молча перестанет
   открываться, а у остальных будет работать.

Полный возврат файла к состоянию «до» (если в него вносили что-то ещё):
Mac — `sudo cp /etc/hosts.before-npo /etc/hosts`, Windows (PowerShell от
администратора) — `Copy-Item "$env:SystemRoot\System32\drivers\etc\hosts.before-npo" "$env:SystemRoot\System32\drivers\etc\hosts" -Force`.
