from mcp.server.fastmcp import FastMCP
import psycopg2
import os
from contextlib import contextmanager

# Inicializar servidor MCP
mcp = FastMCP("Postgres-MCP")

# Configuración de conexión (variables de entorno)
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "postgres")

@contextmanager
def get_db_connection():
    conn = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    try:
        yield conn
    finally:
        conn.close()

@mcp.tool()
def query_database(query: str) -> str:
    """Ejecuta una consulta SQL de solo lectura en la base de datos PostgreSQL."""
    # ADVERTENCIA: En producción, sanitizar inputs para evitar inyecciones SQL.
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                if cur.description:
                    results = cur.fetchall()
                    return str(results)
                return "Operación exitosa sin retorno de datos."
    except Exception as e:
        return f"Error ejecutando query: {str(e)}"

if __name__ == "__main__":
    mcp.run()