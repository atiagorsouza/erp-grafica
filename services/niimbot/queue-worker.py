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
import psycopg2
import psycopg2.extras
from datetime import datetime

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


def process_job(job):
    """Processar um job de impressão."""
    job_id = job['id']
    order_id = job['order_id']
    width_mm = float(job['label_width_mm'])
    height_mm = float(job['label_height_mm'])

    logger.info(f"📝 Processando job #{job_id} (pedido #{order_id})")
    logger.info(f"   Dimensões: {width_mm}mm × {height_mm}mm")

    try:
        # Criar worker
        if CONNECTION_TYPE == 'bluetooth':
            worker = NiimbotRFIDWorker('bluetooth', NIIMBOT_MAC)
        else:
            worker = NiimbotRFIDWorker('usb', NIIMBOT_PORT)

        # Executar ciclo completo
        success = worker.print_test_label()
        worker.close()

        if success:
            logger.info(f"✅ Job #{job_id} SUCESSO")
            return True
        else:
            logger.error(f"❌ Job #{job_id} FALHOU no ciclo de impressão")
            return False

    except Exception as e:
        logger.error(f"❌ Job #{job_id} ERRO: {e}")
        return False


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

            # Atualizar para 'processing'
            update_job_status(conn, job['id'], 'processing')
            conn.close()

            # Processar job
            success = process_job(job)

            # Reabrir conexão e atualizar status final
            conn = get_db()
            if conn:
                if success:
                    update_job_status(conn, job['id'], 'completed')
                else:
                    update_job_status(conn, job['id'], 'error', 'Falha na impressão')
                conn.close()

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
