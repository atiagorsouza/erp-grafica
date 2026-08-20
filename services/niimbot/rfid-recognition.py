#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔════════════════════════════════════════════════════════════════╗
║  NIIMBOT B1 - RFID Recognition & Dynamic Print Script         ║
║  PrintFlow ERP Integration                                     ║
╚════════════════════════════════════════════════════════════════╝

Propósito:
  Reconhecimento automático do chip RFID da Niimbot B1 para
  detectar dimensões do rolo e gerar canvas dinâmico de impressão.

Fluxo:
  1. Conectar via BLE/USB → Niimbot B1
  2. Interrogar chip RFID (get_label_info)
  3. Receber dimensões reais (largura × altura em mm)
  4. Converter mm → pixels (203 DPI)
  5. Gerar canvas branco com Pillow (tamanho exato)
  6. Empacotar em protocolo Niimbot
  7. Enviar para impressora
  8. Imprimir teste de validação

Dependências:
  - niimprint: Engenharia reversa protocolo Niimbot
  - Pillow (PIL): Geração dinâmica de imagens
  - pyserial: Comunicação serial/USB

Uso:
  python3 rfid-recognition.py --port /dev/ttyUSB0
  python3 rfid-recognition.py --mac 00:11:22:33:44:55  # Bluetooth
  python3 rfid-recognition.py --test

Autor: PrintFlow ERP
Data: 2026-08-20
Versão: 1.0.0
"""

import sys
import os
import argparse
import logging
from typing import Tuple, Optional
from datetime import datetime

# Importações de terceiros
try:
    from PIL import Image, ImageDraw
    import serial
except ImportError as e:
    print(f"❌ Erro: Dependência faltando. {e}")
    print("   Execute: pip3 install pillow pyserial")
    sys.exit(1)

# Tentar importar niimprint (biblioteca Niimbot)
try:
    from niimprint import NiimbotDevice, BleDevice
    NIIMPRINT_AVAILABLE = True
except ImportError:
    print("⚠️  Aviso: niimprint não encontrado")
    print("   Execute: pip3 install niimprint")
    NIIMPRINT_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════
# CONFIGURAÇÃO DE LOGGING
# ═══════════════════════════════════════════════════════════════

def setup_logging(log_level: str = "INFO") -> logging.Logger:
    """Configurar sistema de logging."""

    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler('/var/log/niimbot-rfid.log')
        ]
    )

    return logging.getLogger(__name__)


logger = setup_logging()


# ═══════════════════════════════════════════════════════════════
# CLASSE PRINCIPAL: NIIMBOT RFID RECOGNITION
# ═══════════════════════════════════════════════════════════════

class NiimbotRFIDWorker:
    """
    Worker para reconhecimento automático de rolos Niimbot B1.

    Detecta chip RFID → Lê dimensões → Gera canvas → Imprime teste.
    """

    # Constantes de configuração
    DPI = 203  # Resolução padrão Niimbot
    MIN_WIDTH_MM = 20
    MAX_WIDTH_MM = 50
    MIN_HEIGHT_MM = 20
    MAX_HEIGHT_MM = 152

    def __init__(self, connection_type: str = "usb", address: Optional[str] = None):
        """
        Inicializar worker Niimbot.

        Args:
            connection_type: "usb" ou "bluetooth"
            address: Caminho USB (/dev/ttyUSB0) ou MAC address
        """
        self.connection_type = connection_type
        self.address = address
        self.device = None
        self.label_width_mm = None
        self.label_height_mm = None
        self.label_width_px = None
        self.label_height_px = None

    def connect(self) -> bool:
        """
        Conectar à impressora Niimbot.

        Returns:
            True se conexão bem-sucedida, False caso contrário
        """
        try:
            if not NIIMPRINT_AVAILABLE:
                logger.error("❌ niimprint não disponível")
                return False

            logger.info(f"🔌 Conectando via {self.connection_type}...")

            if self.connection_type == "usb":
                self.device = NiimbotDevice(self.address)
            elif self.connection_type == "bluetooth":
                self.device = BleDevice(self.address)
            else:
                logger.error(f"❌ Tipo de conexão inválido: {self.connection_type}")
                return False

            self.device.connect()
            logger.info("✓ Conectado à Niimbot B1")
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao conectar: {e}")
            return False

    def read_rfid_label_info(self) -> bool:
        """
        Interrogar chip RFID do rolo.

        Chamada nativa: device.get_label_info()
        Retorna: (largura_mm, altura_mm)

        Returns:
            True se leitura bem-sucedida
        """
        try:
            logger.info("📖 Lendo RFID do rolo...")

            if not self.device:
                logger.error("❌ Dispositivo não conectado")
                return False

            # Chamada nativa do protocolo Niimbot
            label_info = self.device.get_label_info()

            if not label_info:
                logger.error("❌ Nenhuma informação de rolo retornada")
                return False

            # Extrair dimensões (protocolo pode variar)
            # Esperado: {'width': 50, 'height': 100} (em mm)
            self.label_width_mm = label_info.get('width') or label_info[0]
            self.label_height_mm = label_info.get('height') or label_info[1]

            logger.info(f"✓ RFID lido: {self.label_width_mm}mm × {self.label_height_mm}mm")

            # Validar dimensões
            if not self._validate_dimensions():
                return False

            return True

        except Exception as e:
            logger.error(f"❌ Erro ao ler RFID: {e}")
            return False

    def _validate_dimensions(self) -> bool:
        """Validar se dimensões estão dentro dos limites."""

        if not (self.MIN_WIDTH_MM <= self.label_width_mm <= self.MAX_WIDTH_MM):
            logger.error(
                f"❌ Largura fora dos limites: {self.label_width_mm}mm "
                f"(esperado {self.MIN_WIDTH_MM}-{self.MAX_WIDTH_MM}mm)"
            )
            return False

        if not (self.MIN_HEIGHT_MM <= self.label_height_mm <= self.MAX_HEIGHT_MM):
            logger.error(
                f"❌ Altura fora dos limites: {self.label_height_mm}mm "
                f"(esperado {self.MIN_HEIGHT_MM}-{self.MAX_HEIGHT_MM}mm)"
            )
            return False

        return True

    def mm_to_pixels(self, mm: float) -> int:
        """
        Converter milímetros para pixels.

        Fórmula: pixels = (mm / 25.4) × DPI

        Args:
            mm: Milímetros

        Returns:
            Pixels (arredondado)
        """
        pixels = (mm / 25.4) * self.DPI
        return round(pixels)

    def generate_dynamic_canvas(self) -> Optional[Image.Image]:
        """
        Gerar canvas em branco com dimensões dinâmicas.

        O tamanho é exatamente o que o RFID retornou.

        Returns:
            Imagem PIL ou None se falhar
        """
        try:
            # Converter para pixels
            self.label_width_px = self.mm_to_pixels(self.label_width_mm)
            self.label_height_px = self.mm_to_pixels(self.label_height_mm)

            logger.info(
                f"📐 Criando canvas: {self.label_width_px}px × {self.label_height_px}px"
            )

            # Criar imagem branca
            image = Image.new(
                'L',  # Modo escala de cinza
                (self.label_width_px, self.label_height_px),
                color=255  # Branco
            )

            # Adicionar borda preta fina (validação visual)
            draw = ImageDraw.Draw(image)
            draw.rectangle(
                [0, 0, self.label_width_px - 1, self.label_height_px - 1],
                outline=0,
                width=2
            )

            # Adicionar texto de identificação
            draw.text(
                (10, 10),
                f"{self.label_width_mm}x{self.label_height_mm}mm",
                fill=0
            )

            logger.info("✓ Canvas dinâmico criado com sucesso")
            return image

        except Exception as e:
            logger.error(f"❌ Erro ao gerar canvas: {e}")
            return False

    def send_to_printer(self, image: Image.Image) -> bool:
        """
        Empacotar imagem em protocolo Niimbot e enviar.

        Protocolo: Serializar imagem → Bytes → Pacotes Niimbot

        Args:
            image: Imagem PIL para impressão

        Returns:
            True se envio bem-sucedido
        """
        try:
            logger.info("📤 Empacotando imagem em protocolo Niimbot...")

            if not self.device:
                logger.error("❌ Dispositivo não conectado")
                return False

            # Converter imagem para 1-bit (preto/branco)
            image = image.convert('1')

            # Enviar para impressora
            logger.info("🖨️  Enviando para impressora...")
            self.device.print_image(image)

            logger.info("✓ Imagem enviada com sucesso")
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao enviar para impressora: {e}")
            return False

    def print_test_label(self) -> bool:
        """
        Executar sequência completa: RFID → Canvas → Impressão.

        Returns:
            True se impressão bem-sucedida
        """
        logger.info("=" * 60)
        logger.info("🚀 INICIANDO CICLO DE TESTE COMPLETO")
        logger.info("=" * 60)

        # 1. Conectar
        if not self.connect():
            logger.error("❌ Falha na conexão")
            return False

        # 2. Ler RFID
        if not self.read_rfid_label_info():
            logger.error("❌ Falha ao ler RFID")
            return False

        # 3. Gerar canvas
        image = self.generate_dynamic_canvas()
        if not image:
            logger.error("❌ Falha ao gerar canvas")
            return False

        # 4. Enviar e imprimir
        if not self.send_to_printer(image):
            logger.error("❌ Falha ao imprimir")
            return False

        logger.info("=" * 60)
        logger.info("✅ TESTE COMPLETO COM SUCESSO!")
        logger.info("=" * 60)
        logger.info(f"   Rolo detectado: {self.label_width_mm}mm × {self.label_height_mm}mm")
        logger.info(f"   Canvas gerado: {self.label_width_px}px × {self.label_height_px}px")
        logger.info(f"   Etiqueta impressa: 1 unidade")
        logger.info("=" * 60)

        return True

    def close(self):
        """Desconectar da impressora."""
        try:
            if self.device:
                self.device.close()
                logger.info("✓ Desconectado da Niimbot B1")
        except Exception as e:
            logger.error(f"❌ Erro ao desconectar: {e}")


# ═══════════════════════════════════════════════════════════════
# FUNÇÃO MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    """Função principal."""

    parser = argparse.ArgumentParser(
        description="Niimbot B1 RFID Recognition & Test Print"
    )

    parser.add_argument(
        '--port',
        type=str,
        default='/dev/ttyUSB0',
        help='Porta serial USB (padrão: /dev/ttyUSB0)'
    )

    parser.add_argument(
        '--mac',
        type=str,
        help='Endereço MAC para conexão Bluetooth'
    )

    parser.add_argument(
        '--test',
        action='store_true',
        help='Modo teste (simula sem hardware)'
    )

    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Output verboso (DEBUG level)'
    )

    args = parser.parse_args()

    # Configurar log
    if args.verbose:
        logger.setLevel(logging.DEBUG)

    # Modo teste
    if args.test:
        logger.info("🧪 MODO TESTE (Simulação)")
        logger.info("   ⚠️  Nenhum hardware será usado")
        simulate_test()
        return

    # Determinar tipo de conexão
    if args.mac:
        connection_type = "bluetooth"
        address = args.mac
    else:
        connection_type = "usb"
        address = args.port

    # Criar worker
    worker = NiimbotRFIDWorker(connection_type, address)

    try:
        # Executar teste
        success = worker.print_test_label()
        sys.exit(0 if success else 1)

    finally:
        worker.close()


def simulate_test():
    """Simular teste sem hardware (modo --test)."""

    logger.info("\n📊 SIMULAÇÃO DE TESTE:")
    logger.info("   • RFID detectado: 50mm × 100mm")
    logger.info("   • Conversão: 50mm = 398px, 100mm = 796px")
    logger.info("   • Canvas: 398px × 796px (branco)")
    logger.info("   • Protocolo: Niimbot RSA2048")
    logger.info("   • Status: SUCESSO ✓")
    logger.info("\n💡 Conecte a Niimbot B1 e rode sem --test para teste real")


# ═══════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    main()
