# 🚀 Setup & Teste - Niimbot B1 PrintFlow ERP

## 📋 Pré-requisitos

### 1. Dependências do Sistema
```bash
sudo apt update
sudo apt install -y python3-pip libusb-1.0-0-dev libudev-dev git
```

### 2. Dependências Python
```bash
pip3 install --upgrade pip
pip3 install pillow pyserial niimprint psycopg2-binary
```

**Versões testadas:**
- Python 3.11+
- Pillow 11.1.0+
- pyserial 3.5+
- niimprint 0.0.1+
- psycopg2 2.9.x

### 3. Permissões para Logs
```bash
sudo mkdir -p /var/log
sudo touch /var/log/niimbot-rfid.log /var/log/niimbot-queue-worker.log
sudo chmod 666 /var/log/niimbot-*.log
```

---

## 🧪 Teste 1: Validação de Código (Sem Hardware)

```bash
cd /www/wwwroot/erp-grafica/services/niimbot

# Teste de lógica (modo simulação)
python3 rfid-recognition.py --test --verbose

# Saída esperada:
# ✓ Canvas: 398x796px
# ✓ Protocolo: Niimbot V2
# ✓ Status: SUCESSO
```

---

## 🔧 Teste 2: Script Automatizado

```bash
bash print-test.sh

# Saída esperada:
# ✓ Pilha Bluetooth limpa
# ✓ Canvas gerado: 398x796px
# ✓ Protocolo: Niimbot V2
# ✅ TESTE CONCLUÍDO COM SUCESSO
```

---

## 🖨️ Teste 3: Com Hardware (Niimbot B1)

### 3.1 Conexão USB
```bash
# Listar portas USB
lsusb | grep -i niim
ls -la /dev/ttyUSB*

# Testar
python3 rfid-recognition.py --port /dev/ttyUSB0 --verbose
```

**Saída esperada:**
```
✓ Conectado à Niimbot B1
✓ RFID lido: 50mm × 100mm
✓ Canvas dinâmico criado
✓ Impressão enviada com sucesso
✅ TESTE COMPLETO COM SUCESSO!
```

### 3.2 Conexão Bluetooth
```bash
# Parear impressora
bluetoothctl scan on
# Procure por "NIIMBOT" e anote o MAC (ex: 10:18:0A:16:1B:A4)
bluetoothctl pair 10:18:0A:16:1B:A4
bluetoothctl trust 10:18:0A:16:1B:A4

# Testar
python3 rfid-recognition.py --mac 10:18:0A:16:1B:A4 --verbose
```

---

## 📊 Teste 4: Fila de Impressão (BD)

### 4.1 Criar tabela no banco
```sql
CREATE TABLE IF NOT EXISTS print_queue_niimbot (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    label_width_mm DECIMAL(8,2) DEFAULT 50,
    label_height_mm DECIMAL(8,2) DEFAULT 100,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_created (created_at)
);
```

### 4.2 Inserir job de teste
```sql
INSERT INTO print_queue_niimbot (order_id, product_id, label_width_mm, label_height_mm)
VALUES (1001, 5, 50, 100);

SELECT * FROM print_queue_niimbot;
```

### 4.3 Executar worker
```bash
export DATABASE_URL="postgresql://usuario:senha@localhost:5432/app_db"
export NIIMBOT_PORT="/dev/ttyUSB0"
# ou para Bluetooth:
export NIIMBOT_MAC="10:18:0A:16:1B:A4"

python3 queue-worker.py
```

**Saída esperada:**
```
🚀 NIIMBOT PRINT QUEUE WORKER INICIADO
📝 Processando job #1 (pedido #1001)
   Dimensões: 50.00mm × 100.00mm
✓ Job #1 marcado como 'completed' no BD
```

---

## ⚙️ Integração em PM2 (Produção)

```bash
sudo -i
cd /www/wwwroot/erp-grafica

# Criar arquivo de configuração PM2
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'niimbot-queue',
      script: './services/niimbot/queue-worker.py',
      interpreter: 'python3',
      env: {
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/app_db',
        NIIMBOT_PORT: '/dev/ttyUSB0',
        // ou NIIMBOT_MAC: '10:18:0A:16:1B:A4'
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M'
    }
  ]
};
EOF

# Iniciar
pm2 start ecosystem.config.js --name niimbot-queue
pm2 save
systemctl restart pm2-root
```

---

## 🔍 Troubleshooting

### "niimprint not found"
```bash
pip3 install niimprint
python3 -c "import niimprint; print(niimprint.__version__)"
```

### "Permission denied" (Bluetooth)
```bash
sudo usermod -aG dialout $(whoami)
# Reiniciar sessão
```

### "Device or resource busy"
```bash
sudo hcitool dc 10:18:0A:16:1B:A4
sleep 2
bluetoothctl disconnect 10:18:0A:16:1B:A4
```

### "Connection refused" (DB)
```bash
psql -U postgres -h 127.0.0.1 -d app_db -c "SELECT 1"
```

---

## 📈 Checklist de Validação

- [ ] `pip3 list | grep -E "pillow|pyserial|niimprint|psycopg2"`
- [ ] `python3 rfid-recognition.py --test` → ✓
- [ ] `bash print-test.sh` → ✓
- [ ] `lsusb | grep -i niim` ou `bluetoothctl devices` → ✓
- [ ] Tabela `print_queue_niimbot` criada
- [ ] Worker roda sem erro: `python3 queue-worker.py`
- [ ] Log em `/var/log/niimbot-rfid.log` limpo e pronto

---

## 📞 Support

Se encontrar erro:
1. Verifique `/var/log/niimbot-*.log`
2. Rode com `--verbose` para debug
3. Teste modo `--test` para isolar problema de hardware

**Status:** ✅ Pronto para produção
**Data:** 2026-08-22
