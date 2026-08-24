#!/usr/bin/env python3
"""
Wrapper CLI para niimprint (simula a CLI do fork AndBondStyle)
Uso: python3 niimprint-cli.py --model b1 --conn bluetooth --addr 10:18:0A:16:1B:A4 --image test.png
"""

import sys
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(
        description='Niimbot Printer Client',
        prog='niimprint'
    )

    parser.add_argument(
        '-m', '--model',
        choices=['b1', 'b18', 'b21', 'd11', 'd110'],
        default='b21',
        help='Niimbot printer model'
    )

    parser.add_argument(
        '-c', '--conn',
        choices=['usb', 'bluetooth'],
        default='usb',
        help='Connection type'
    )

    parser.add_argument(
        '-a', '--addr',
        type=str,
        help='Bluetooth MAC address OR serial device path'
    )

    parser.add_argument(
        '-d', '--density',
        type=int,
        default=5,
        help='Print density (1-5)'
    )

    parser.add_argument(
        '-r', '--rotate',
        choices=[0, 90, 180, 270],
        type=int,
        default=0,
        help='Image rotation (clockwise)'
    )

    parser.add_argument(
        '-i', '--image',
        type=str,
        required=True,
        help='Image path'
    )

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )

    args = parser.parse_args()

    # Validar imagem
    image_path = Path(args.image)
    if not image_path.exists():
        print(f"❌ Imagem não encontrada: {args.image}", file=sys.stderr)
        sys.exit(1)

    # Validar endereço
    if not args.addr:
        print(f"❌ Endereço obrigatório: --addr", file=sys.stderr)
        sys.exit(1)

    print(f"🖨️  Niimbot {args.model.upper()} - {args.conn.upper()}")
    print(f"📍 Endereço: {args.addr}")
    print(f"📄 Imagem: {image_path}")
    print(f"🎚️  Densidade: {args.density}")
    print(f"🔄 Rotação: {args.rotate}°")

    try:
        from niimprint import PrinterClient, SerialTransport, BluetoothTransport
        from PIL import Image

        # Carregar imagem
        img = Image.open(image_path)

        # Rotar se necessário
        if args.rotate != 0:
            img = img.rotate(-args.rotate, expand=False)
            print(f"✓ Rotacionada: {args.rotate}°")

        # Criar transporte
        if args.conn == 'bluetooth':
            transport = BluetoothTransport(args.addr)
        else:
            transport = SerialTransport(args.addr)

        # Conectar
        device = PrinterClient(transport)

        if args.verbose:
            print(f"✓ Conectado à {args.model}")

        # Configurar e imprimir
        device.set_quantity(1)
        device.set_label_density(args.density)
        device.set_dimension(img.width, img.height)
        device.print_image(img)
        device.end_print()

        print("✅ Impressão enviada com sucesso!")
        sys.exit(0)

    except Exception as e:
        print(f"❌ Erro: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
