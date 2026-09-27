#!/usr/bin/env bash
#
# deploy/detach.sh — запуск deploy.sh, НЕ привязанный к SSH-сессии.
#
# Вызывается из GitHub Actions (.github/workflows/deploy.yml):
#
#   <env выкладки> bash releases/<sha>/deploy/detach.sh start
#   bash releases/<sha>/deploy/detach.sh poll <смещение>
#
# ─── Зачем ──────────────────────────────────────────────────────────────────
#
# Раньше deploy.sh выполнялся прямо в SSH-сессии раннера. Выкладка длится
# минуты (скачивание образов, дамп базы, миграции), и любой обрыв связи между
# GitHub и VPS убивал её вместе с сессией: sshd шлёт процессу SIGHUP. Так и
# случилось — «client_loop: send disconnect: Broken pipe» посреди `docker
# pull`. Обрыв на скачивании безвреден, но тот же обрыв на миграции оставил
# бы базу в промежуточном состоянии, а на подмене контейнеров — сайт без
# приложения и без отката.
#
# Теперь выкладка живёт на сервере сама по себе (setsid + nohup), а раннер
# только опрашивает её короткими SSH-вызовами. Оборвался один опрос — следующий
# продолжит с того же места лога; сама выкладка об этом не узнает.
#
# ─── Файлы ──────────────────────────────────────────────────────────────────
#
# Всё лежит в каталоге релиза, который workflow создаёт заново на каждый
# запуск, — остатки прошлой попытки смешаться с новой не могут:
#
#   deploy.out       полный вывод deploy.sh (он же пишет свой лог в logs/)
#   deploy.pid       pid отвязанного процесса
#   deploy.exitcode  код завершения; появляется ТОЛЬКО по окончании

set -Eeuo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$RELEASE_DIR/deploy.out"
PID_FILE="$RELEASE_DIR/deploy.pid"
RC_FILE="$RELEASE_DIR/deploy.exitcode"

is_running() {
    [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

cmd_start() {
    # Повторный `start` (раннер переподключился и повторил шаг) не должен
    # запустить вторую выкладку: она всё равно упёрлась бы в замок deploy.sh,
    # но затёрла бы deploy.out и код завершения первой.
    if is_running || [[ -f "$RC_FILE" ]]; then
        echo "already-started"
        return 0
    fi

    : >"$OUT"
    # Окружение (GIT_SHA, REGISTRY, GHCR_TOKEN, ...) наследуется от этой
    # команды. `setsid` уводит процесс в собственную сессию — SIGHUP при
    # закрытии SSH до него не дойдёт. stdin закрыт: выкладка не должна ничего
    # ждать с терминала, которого нет.
    #
    # ⚠ `trap '' HUP` ДО порождения — не перестраховка. Этот скрипт
    # завершается сразу после запуска, sshd тут же закрывает сессию и шлёт
    # SIGHUP её группе — а потомок в этот момент может ещё не успеть выполнить
    # setsid (и nohup). Проверено: на быстрой машине он погибает так в каждом
    # запуске, не написав ни строки. Игнорирование сигнала наследуется через
    # fork и exec, поэтому окна, в котором SIGHUP смертелен, нет вовсе.
    trap '' HUP
    setsid nohup bash -c '
        rc=0
        bash "$1/deploy/deploy.sh" || rc=$?
        # Через временный файл: опрос не должен увидеть пустой код
        # завершения, записанный наполовину.
        echo "$rc" >"$1/deploy.exitcode.tmp" && mv "$1/deploy.exitcode.tmp" "$1/deploy.exitcode"
    ' _ "$RELEASE_DIR" >>"$OUT" 2>&1 </dev/null &
    local pid=$!
    echo "$pid" >"$PID_FILE"

    # Возвращаемся только когда потомок уже живёт в своей сессии (поле 6
    # /proc/<pid>/stat — id сессии): после этого закрытие SSH его не касается.
    local sid="" _
    for _ in $(seq 1 50); do
        sid=$(awk '{print $6}' "/proc/$pid/stat" 2>/dev/null || true)
        [[ "$sid" == "$pid" ]] && break
        sleep 0.1
    done
    if [[ "$sid" != "$pid" ]]; then
        echo "detach: процесс выкладки не отделился от сессии (pid $pid, sid ${sid:-нет})" >&2
        exit 1
    fi
    echo "started"
}

# Первая строка ответа — состояние:
#   STATE running <размер лога>
#   STATE exit <код> <размер лога>
#   STATE lost <размер лога>      процесс исчез, не записав код (перезагрузка VPS)
# дальше — кусок лога от переданного смещения до <размер лога>.
cmd_poll() {
    local offset="${1:-0}" size state
    # Код завершения читается ДО размера лога: если выкладка закончилась, весь
    # её вывод к этому моменту уже в файле, и кусок ниже будет последним.
    if [[ -f "$RC_FILE" ]]; then
        state="exit $(cat "$RC_FILE")"
    elif is_running; then
        state="running"
    else
        state="lost"
    fi
    size=$(stat -c %s "$OUT" 2>/dev/null || echo 0)
    echo "STATE $state $size"
    if ((size > offset)); then
        tail -c "+$((offset + 1))" "$OUT" | head -c "$((size - offset))"
    fi
}

case "${1:-}" in
    start) cmd_start ;;
    poll)  cmd_poll "${2:-0}" ;;
    *)     echo "usage: $0 start | poll <offset>" >&2; exit 2 ;;
esac
