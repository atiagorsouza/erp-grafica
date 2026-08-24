#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Niimbot Print Queue Worker
Monitora fila de impressão e executa jobs
"""

import os
import sys
import time
import logging
import signal
import threading
import psycopg2
import psycopg2.extras
from datetime import datetime
from contextlib import contextmanager

# Importar diretamente sem módulo (arquivo tem hífen, não underscore)
import importlib.util
spec = importlib.util.spec_from_file_location("rfid_recognition",
    os.path.join(os.path.dirname(__file__), "rfid-recognition.py"))
rfid_recognition = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rfid_recognition)
NiimbotRFIDWorker = rfid_recognition.NiimbotRFIDWorker

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/var/log/niimbot-queue-worker.log')
    ]
)

logger = logging.getLogger(__name__)

# Config
DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/app_db')
NIIMBOT_MAC = os.getenv('NIIMBOT_MAC')  # Ex: 10:18:0a:16:1b:a4
NIIMBOT_PORT = os.getenv('NIIMBOT_PORT', '/dev/ttyUSB0')
CONNECTION_TYPE = 'bluetooth' if NIIMBOT_MAC else 'usb'


def get_db():
    """Conectar ao banco de dados."""
    try:
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = False
        return conn
    except Exception as e:
        logger.error(f"❌ Erro ao conectar no banco: {e}")
        return None


def get_pending_jobs(conn):
    """Buscar jobs pendentes da fila."""
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("""
                SELECT id, order_id, product_id, label_width_mm, label_height_mm
                FROM print_queue_niimbot
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT 1
            """)
            return cur.fetchone()
    except Exception as e:
        logger.error(f"❌ Erro ao buscar jobs: {e}")
        return None


def update_job_status(conn, job_id, status, error=None):
    """Atualizar status do job."""
    try:
        with conn.cursor() as cur:
            if status == 'processing':
                cur.execute("""
                    UPDATE print_queue_niimbot
                    SET status = %s, started_at = NOW(), attempts = attempts + 1
                    WHERE id = %s
                """, (status, job_id))
            elif status == 'completed':
                cur.execute("""
                    UPDATE print_queue_niimbot
                    SET status = %s, completed_at = NOW()
                    WHERE id = %s
                """, (status, job_id))
            elif status == 'error':
                cur.execute("""
                    UPDATE print_queue_niimbot
                    SET status = %s, error_message = %s, completed_at = NOW()
                    WHERE id = %s
                """, (status, error, job_id))

            conn.commit()
            return True
    except Exception as e:
        logger.error(f"❌ Erro ao atualizar job {job_id}: {e}")
        conn.rollback()
        return False


def process_job_with_timeout(job, timeout=60):
    """
    Processar um job com timeout.

    Args:
        job: Job dict com id, order_id, label_width_mm, label_height_mm
        timeout: Segundos máximos (padrão: 60s)

    Returns:
        True se sucesso, False se timeout/erro
    """
    job_id = job['id']
    order_id = job['order_id']
    width_mm = float(job['label_width_mm'])
    height_mm = float(job['label_height_mm'])

    logger.info(f"📝 Processando job #{job_id} (pedido #{order_id})")
    logger.info(f"   Dimensões: {width_mm}mm × {height_mm}mm")
    logger.info(f"   Timeout: {timeout}s")

    result = {'success': False}

    def run_print():
        try:
            if CONNECTION_TYPE == 'bluetooth':
                worker = NiimbotRFIDWorker('bluetooth', NIIMBOT_MAC)
            else:
                worker = NiimbotRFIDWorker('usb', NIIMBOT_PORT)

            success = worker.print_test_label()
            worker.close()
            result['success'] = success
        except Exception as e:
            logger.error(f"❌ Job #{job_id} ERRO: {e}")
            result['success'] = False

    thread = threading.Thread(target=run_print, daemon=False)
    thread.daemon = False
    thread.start()
    thread.join(timeout=timeout)

    if thread.is_alive():
        logger.error(f"❌ Job #{job_id} TIMEOUT (excedeu {timeout}s)")
        return False

    if result['success']:
        logger.info(f"✅ Job #{job_id} SUCESSO")
    else:
        logger.error(f"❌ Job #{job_id} FALHOU no ciclo de impressão")

    return result['success']


def worker_loop():
    """Loop principal do worker."""
    logger.info("=" * 60)
    logger.info("🚀 NIIMBOT PRINT QUEUE WORKER INICIADO")
    logger.info("=" * 60)
    logger.info(f"   Modo: {CONNECTION_TYPE}")
    if CONNECTION_TYPE == 'bluetooth':
        logger.info(f"   MAC: {NIIMBOT_MAC}")
    else:
        logger.info(f"   Porta: {NIIMBOT_PORT}")
    logger.info("=" * 60)

    while True:
        try:
            conn = get_db()
            if not conn:
                logger.warning("⚠️  Banco indisponível, aguardando 30s...")
                time.sleep(30)
                continue

            # Buscar job pendente
            job = get_pending_jobs(conn)

            if not job:
                # Sem jobs, aguardar
                conn.close()
                time.sleep(10)
                continue

            job_id = job['id']

            # Atualizar para 'processing' com verificação
            if not update_job_status(conn, job_id, 'processing'):
                logger.error(f"❌ Falha ao atualizar status processing do job #{job_id}, ignorando")
                conn.close()
                time.sleep(2)
                continue

            conn.close()

            # Processar job com timeout (máx 60 segundos)
            success = process_job_with_timeout(job, timeout=60)

            # Reabrir conexão e atualizar status final
            conn = get_db()
            if conn:
                if success:
                    update_job_status(conn, job_id, 'completed')
                    logger.info(f"✓ Job #{job_id} marcado como 'completed' no BD")
                else:
                    update_job_status(conn, job_id, 'error', 'Falha na impressão')
                    logger.info(f"✓ Job #{job_id} marcado como 'error' no BD")
                conn.close()
            else:
                logger.error(f"⚠️  Não pude atualizar BD após job #{job_id}")

            # Aguardar antes do próximo job
            time.sleep(2)

        except KeyboardInterrupt:
            logger.info("⏹️  Worker interrompido")
            break
        except Exception as e:
            logger.error(f"❌ Erro no loop: {e}")
            time.sleep(30)


if __name__ == '__main__':
    worker_loop()
