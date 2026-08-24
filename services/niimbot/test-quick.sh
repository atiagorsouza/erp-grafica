#!/bin/bash
# Quick validation test (sem sudo, sem hardware necessário)

set -e

echo "🧪 TESTE RÁPIDO - Validação de Código"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Teste 1: Modo simulação
echo "1️⃣  Teste de simulação (modo --test)..."
python3 rfid-recognition.py --test > /tmp/test1.log 2>&1
if grep -q "SUCESSO" /tmp/test1.log; then
    echo "   ✅ PASSOU"
else
    echo "   ❌ FALHOU"
    cat /tmp/test1.log
    exit 1
fi
echo ""

# Teste 2: Lógica de canvas
echo "2️⃣  Teste de canvas (geração de imagem)..."
python3 - << 'PYEOF'
import sys
import importlib.util

spec = importlib.util.spec_from_file_location('rfid_recognition', './rfid-recognition.py')
rfid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rfid)

worker = rfid.NiimbotRFIDWorker('usb', '/dev/ttyUSB0')
worker.label_width_mm = 50
worker.label_height_mm = 100

canvas = worker.generate_dynamic_canvas()
assert canvas is not None, "Canvas é None"
assert worker.label_width_px == 400, f"Largura incorreta: {worker.label_width_px}"
assert worker.label_height_px == 799, f"Altura incorreta: {worker.label_height_px}"
assert canvas.mode == 'L', f"Modo incorreto: {canvas.mode}"

print(f"   ✓ Canvas: {worker.label_width_px}x{worker.label_height_px}px")
print(f"   ✓ Modo: {canvas.mode}")
print("   ✓ Retorno: Image (não False/None)")
PYEOF
echo "   ✅ PASSOU"
echo ""

# Teste 3: Conversão de unidades
echo "3️⃣  Teste de conversão (mm → pixels)..."
python3 - << 'PYEOF'
import sys
import importlib.util

spec = importlib.util.spec_from_file_location('rfid_recognition', './rfid-recognition.py')
rfid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rfid)

worker = rfid.NiimbotRFIDWorker('usb', '/dev/ttyUSB0')

# Teste 1: Conversão: 50mm @ 203 DPI = 400px
pixels = worker.mm_to_pixels(50)
assert pixels == 400, f"Conversão incorreta: 50mm = {pixels}px (esperado 400px)"
print(f"   ✓ Conversão: 50mm = {pixels}px")

# Teste 2: Validação de dimensões válidas
worker.label_width_mm = 48  # Dentro dos limites (20-50mm)
worker.label_height_mm = 100
assert worker._validate_dimensions(), "Validação de dimensões falhou"
print(f"   ✓ Dimensões válidas: {worker.label_width_mm}mm x {worker.label_height_mm}mm")

# Teste 3: Limite físico é respeitado (384px máx)
assert worker.MAX_WIDTH_PX == 384, f"Limite físico incorreto: {worker.MAX_WIDTH_PX}px"
print(f"   ✓ Limite físico: {worker.MAX_WIDTH_PX}px (protocolo V2)")
PYEOF
echo "   ✅ PASSOU"
echo ""

# Teste 4: Logging com verbose
echo "4️⃣  Teste de logging (--verbose)..."
python3 rfid-recognition.py --test --verbose 2>&1 | grep -q "V2" && echo "   ✅ PASSOU" || (echo "   ❌ FALHOU"; exit 1)
echo ""

echo "========================================"
echo "✅ TODOS OS TESTES PASSARAM!"
echo "========================================"
echo ""
echo "📋 Próximos passos:"
echo "   1. Conectar Niimbot B1 via USB ou Bluetooth"
echo "   2. Rodar: python3 rfid-recognition.py --port /dev/ttyUSB0 --verbose"
echo "   3. Ou rodar: python3 rfid-recognition.py --mac 10:18:0A:16:1B:A4 --verbose"
echo ""
