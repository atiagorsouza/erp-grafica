# Niimbot B1 - RFID Recognition Worker

Integração da impressora térmica Niimbot B1 com PrintFlow ERP.

## 📋 O que faz

- ✅ Conecta via USB ou Bluetooth à Niimbot B1
- ✅ Interroga chip RFID do rolo para detectar dimensões
- ✅ Gera canvas dinâmico com Pillow (tamanho exato)
- ✅ Envia imagem via protocolo Niimbot nativo
- ✅ Imprime etiqueta de teste de validação

## 🚀 Uso Rápido

### Instalação de Dependências

```bash
sudo apt install -y python3-pip libusb-1.0-0-dev libudev-dev
pip3 install niimprint pillow pyserial
```

### Teste com Hardware Conectado (USB)

```bash
python3 rfid-recognition.py --port /dev/ttyUSB0 --verbose
```

### Teste com Bluetooth

```bash
python3 rfid-recognition.py --mac 00:11:22:33:44:55 --verbose
```

### Modo Simulação (sem hardware)

```bash
python3 rfid-recognition.py --test
```

## 📊 Fluxo Técnico

```
┌─────────────────────────┐
│   Niimbot B1 Física     │
│   (Chip RFID)           │
└────────────┬────────────┘
             │
             ▼
    ┌────────────────┐
    │ Detectar RFID  │
    │ (get_label_    │
    │  info)         │
    └────────┬───────┘
             │
             ▼
  ┌──────────────────────┐
  │  Dimensões (mm):     │
  │  Largura × Altura    │
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Converter para px:  │
  │  (mm ÷ 25.4) × 203   │
  │  DPI                 │
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Pillow:             │
  │  Canvas branco       │
  │  exato               │
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Protocolo Niimbot:  │
  │  Empacotar bytes     │
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Enviar para         │
  │  impressora via      │
  │  BLE/USB             │
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  IMPRIME ✓           │
  └──────────────────────┘
```

## 🔧 Estrutura do Código

| Classe/Função | Responsabilidade |
|---|---|
| `NiimbotRFIDWorker` | Orquestrador principal |
| `connect()` | Estabelecer conexão USB/BLE |
| `read_rfid_label_info()` | Interrogar chip RFID |
| `mm_to_pixels()` | Converter unidades (203 DPI) |
| `generate_dynamic_canvas()` | Criar imagem com Pillow |
| `send_to_printer()` | Empacotar e enviar |
| `print_test_label()` | Ciclo completo |

## 📦 Dependências

```
niimprint        # Protocolo Niimbot (engenharia reversa)
Pillow (PIL)     # Geração de imagens
pyserial         # Comunicação serial
```

## ⚙️ Configuração

### Variáveis Importantes

```python
DPI = 203              # Resolução Niimbot padrão
MIN_WIDTH_MM = 20      # Largura mínima (mm)
MAX_WIDTH_MM = 50      # Largura máxima (mm)
MIN_HEIGHT_MM = 20     # Altura mínima (mm)
MAX_HEIGHT_MM = 152    # Altura máxima (mm)
```

## 🐛 Troubleshooting

### "niimprint not found"
```bash
pip3 install niimprint
```

### "Dispositivo não encontrado"
- Verificar: `lsusb` (USB) ou `bluetoothctl` (Bluetooth)
- Porta padrão: `/dev/ttyUSB0`
- Tentar: `/dev/ttyUSB1` se falhar

### "RFID não responde"
- Verificar conexão física
- Ligar/desligar impressora
- Verificar bateria (se Bluetooth)

## 📝 Logs

Logs salvos em: `/var/log/niimbot-rfid.log`

```bash
# Ver logs em tempo real
tail -f /var/log/niimbot-rfid.log

# Modo verbose
python3 rfid-recognition.py --port /dev/ttyUSB0 --verbose
```

## 🔄 Integração com PrintFlow

Próxima etapa: Integrar com fila de impressão do PrintFlow

```
PrintFlow ERP
    ↓
Tabela: print_queue_niimbot
    ↓
Consumer: rfid-recognition.py
    ↓
Niimbot B1
```

## 📚 Referências

- [Niimbot Brasil](https://www.niimbot.com.br/)
- [niimprint GitHub](https://github.com/niimprint/niimprint)
- [Pillow Docs](https://python-pillow.org/)

---

**Autor:** PrintFlow ERP  
**Data:** 2026-08-20  
**Versão:** 1.0.0
