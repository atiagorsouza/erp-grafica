#!/bin/bash
# Script para descobrir e conectar à Niimbot B1 via Bluetooth

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║         🔍 Descoberta & Teste Niimbot B1 (BLE)        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Função para limpar Bluetooth
cleanup_bluetooth() {
    echo "🧹 Limpando pilha Bluetooth..."
    sudo systemctl stop bluetooth 2>/dev/null || true
    sleep 1
    sudo systemctl start bluetooth 2>/dev/null || true
    sleep 2
    sudo hciconfig hci0 up 2>/dev/null || true
    echo "   ✓ Pilha limpa"
}

# Função para descobrir dispositivos
discover_devices() {
    echo ""
    echo "🔍 Procurando por dispositivos Bluetooth..."
    echo "   (Aguarde 10 segundos...)"

    sudo bluetoothctl scan on &
    SCAN_PID=$!

    sleep 10

    sudo kill $SCAN_PID 2>/dev/null || true
    sleep 1

    echo ""
    echo "📱 Dispositivos encontrados:"
    sudo bluetoothctl devices | grep -i niim || echo "   ❌ Niimbot não encontrada!"
}

# Função para parear
pair_device() {
    local mac=$1

    echo ""
    echo "🔗 Pareando $mac..."
    sudo bluetoothctl pair $mac 2>&1 | tail -5

    echo "✅ Adicionando à lista confiável..."
    sudo bluetoothctl trust $mac 2>/dev/null || true
}

# Função para conectar
connect_device() {
    local mac=$1

    echo ""
    echo "📡 Conectando a $mac..."
    sudo bluetoothctl connect $mac 2>&1 | tail -3
}

# Função para testar impressão
test_print() {
    local mac=$1

    echo ""
    echo "🖨️  Executando teste de impressão..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    cd "$SCRIPT_DIR"
    python3 rfid-recognition.py --mac "$mac" --verbose
}

# MAIN
cleanup_bluetooth
discover_devices

# Perguntar pelo MAC
read -p "📝 Digite o MAC address (ex: 10:18:0A:16:1B:A4): " NIIMBOT_MAC

if [ -z "$NIIMBOT_MAC" ]; then
    echo "❌ MAC address vazio!"
    exit 1
fi

pair_device "$NIIMBOT_MAC"
sleep 2
connect_device "$NIIMBOT_MAC"
sleep 3
test_print "$NIIMBOT_MAC"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "✅ TESTE CONCLUÍDO!"
echo "╚════════════════════════════════════════════════════════╝"
